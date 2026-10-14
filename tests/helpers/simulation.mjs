/**
 * Isolated application simulation: real unchanged routes/services + Prisma SQL.
 * PGlite is an in-memory, single-connection PostgreSQL build, NOT RDS concurrency.
 * Cookies and SES are adapters in this test process. No production test bypass,
 * no .env loading, real credentials, external mail, S3 or Secrets Manager calls.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import crypto from "node:crypto";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(join(ROOT, "package.json"));
const ts = require("typescript");
const ORIGIN = "https://simulation.example.test";

export async function createSimulation({ beforeFinalMigration, environment = {} } = {}) {
  const database = await PGlite.create();
  const folders = readdirSync(join(ROOT, "prisma/migrations")).filter(name => /^\d/.test(name)).sort();
  for (const folder of folders) {
    if (folder === "20261014090000_acceptance_security_and_history" && beforeFinalMigration) await beforeFinalMigration(database);
    await database.exec(readFileSync(join(ROOT, "prisma/migrations", folder, "migration.sql"), "utf8"));
  }
  // Fresh, test-owned Unix socket only: no ambient DATABASE_URL is read or used.
  const socketDirectory = mkdtempSync(join(tmpdir(), "lionclub-sim-"));
  const server = new PGLiteSocketServer({ db: database, path: join(socketDirectory, ".s.PGSQL.5432"), maxConnections: 1 });
  await server.start();
  const databaseUrl = `postgresql://postgres:postgres@localhost:5432/postgres?host=${encodeURIComponent(socketDirectory)}&connection_limit=1&pool_timeout=30&sslmode=disable`;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();
  const context = new AsyncLocalStorage();
  const modules = new Map();
  const inbox = [];
  const control = { failEmail: false };
  const env = {
    NODE_ENV: "production", DATABASE_URL: databaseUrl, AUTH_SECRET: "isolated-test-only-signing-secret-at-least-32-chars",
    NEXT_PUBLIC_APP_URL: ORIGIN, PASSWORD_RESET_FROM_EMAIL: "noreply@example.test",
    AVATAR_BUCKET_NAME: "synthetic-avatar-bucket", AWS_REGION: "ap-northeast-1", AWS_EC2_METADATA_DISABLED: "true",
    ...environment,
  };
  function load(file) {
    const absolute = resolve(ROOT, file);
    if (!absolute.startsWith(`${ROOT}/src/`)) throw Error("Simulation can only load application source");
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} };
    modules.set(absolute, module);
    const source = readFileSync(absolute, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function dependency(name) {
      if (name === "@/lib/prisma" || /(?:^|\/)prisma$/.test(name) && name.startsWith(".")) return { getPrisma: async () => prisma };
      if (name === "@/lib/secrets" || name === "./secrets") return { getAppSecrets: async () => ({ DATABASE_URL: databaseUrl, AUTH_SECRET: env.AUTH_SECRET }) };
      if (name === "@/lib/aws-http" || name === "./aws-http") return { sendSesEmail: async input => {
        if (control.failEmail) throw Error("SIMULATED_MAIL_UNAVAILABLE");
        if (!String(input.to).endsWith("@example.test")) throw Error("Simulation mail requires example.test recipient");
        inbox.push({ ...structuredClone(input), sentAt: new Date().toISOString() });
      } };
      if (name === "next/headers") return { cookies: async () => {
        const active = context.getStore();
        if (!active) throw Error("Cookie adapter outside simulated request");
        return {
          get: key => active.jar.has(key) ? { name: key, value: active.jar.get(key) } : undefined,
          set: (key, value, options) => { active.jar.set(key, value); active.cookieOptions.set(key, options); },
          delete: key => active.jar.delete(key),
        };
      } };
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith(".")) {
        const target = resolve(dirname(absolute), name);
        return load(`${target}${existsSync(target) ? "" : ".ts"}`);
      }
      if (name.startsWith("@aws-sdk/") || name.includes("secrets")) throw Error(`Outbound dependency forbidden: ${name}`);
      if (["next/server", "zod", "bcryptjs", "jose", "crypto", "node:crypto", "@prisma/client"].includes(name)) return require(name);
      throw Error(`Unapproved simulated dependency: ${name}`);
    }
    vm.runInNewContext(code, {
      module, exports: module.exports, require: dependency, process: { env }, console,
      Buffer, TextEncoder, TextDecoder, URL, URLSearchParams, Date, Request, Response,
      crypto: crypto.webcrypto, setTimeout, clearTimeout,
    }, { filename: absolute });
    return module.exports;
  }
  const jar = () => Object.assign(new Map(), { options: new Map() });
  async function call(path, method = "GET", body, cookieJar = jar(), options = {}) {
    const { NextRequest } = require("next/server");
    const headers = new Headers({ "x-forwarded-for": options.ip ?? "192.0.2.1" });
    if (!["GET", "HEAD"].includes(method)) {
      headers.set("Content-Type", "application/json");
      if (options.origin !== null) headers.set("Origin", options.origin ?? ORIGIN);
    }
    const request = new NextRequest(new URL(path, ORIGIN), { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const route = resolveRoute(path);
    const handler = load(`src/app/api/${route.file}/route.ts`)[method];
    if (!handler) return { status: 405, data: { error: "Method not implemented" } };
    return context.run({ jar: cookieJar, cookieOptions: cookieJar.options ?? new Map() }, async () => {
      const response = await handler(request, { params: Promise.resolve(route.params) });
      return { status: response.status, data: await response.json(), headers: response.headers, jar: cookieJar };
    });
  }
  return { database, prisma, env, control, inbox, load, call, jar, origin: ORIGIN,
    async close() { await prisma.$disconnect(); await server.stop(); await database.close(); },
  };
}

function resolveRoute(path) {
  const pathname = new URL(path, ORIGIN).pathname.replace(/^\/api\//, "");
  if (existsSync(join(ROOT, "src/app/api", pathname, "route.ts"))) return { file: pathname, params: {} };
  const candidates = [
    [/^events\/([^/]+)\/(check-in|register|registrations)$/, m => ({ file: `events/[id]/${m[2]}`, params: { id: m[1] } })],
    [/^events\/([^/]+)$/, m => ({ file: "events/[id]", params: { id: m[1] } })],
    [/^members\/([^/]+)\/(block|report)$/, m => ({ file: `members/[memberId]/${m[2]}`, params: { memberId: m[1] } })],
    [/^members\/([^/]+)$/, m => ({ file: "members/[memberId]", params: { memberId: m[1] } })],
    [/^admin\/reports\/([^/]+)$/, m => ({ file: "admin/reports/[reportId]", params: { reportId: m[1] } })],
    [/^admin\/member-assignments\/([^/]+)$/, m => ({ file: "admin/member-assignments/[memberId]", params: { memberId: m[1] } })],
    [/^admin\/pending-members\/([^/]+)$/, m => ({ file: "admin/pending-members/[memberId]", params: { memberId: m[1] } })],
    [/^admin\/pending-experiences\/([^/]+)$/, m => ({ file: "admin/pending-experiences/[experienceId]", params: { experienceId: m[1] } })],
    [/^admin\/roles\/([^/]+)$/, m => ({ file: "admin/roles/[roleId]", params: { roleId: m[1] } })],
    [/^me\/experiences\/([^/]+)$/, m => ({ file: "me/experiences/[experienceId]", params: { experienceId: m[1] } })],
    [/^friends\/([^/]+)\/respond$/, m => ({ file: "friends/[friendshipId]/respond", params: { friendshipId: m[1] } })],
  ];
  for (const [pattern, result] of candidates) { const match = pathname.match(pattern); if (match) return result(match); }
  throw Error(`Unknown simulated route: ${pathname}`);
}

export async function seedScenario(sim, suffix = "default") {
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("SimulationPass42!", 4);
  const ai = await sim.prisma.organization.create({ data: { id: `ai-${suffix}`, level: "club", name: suffix === "default" ? "AI臺科大獅子會" : `AI-${suffix}`, districtCode: "300A-1" } });
  const other = await sim.prisma.organization.create({ data: { id: `other-${suffix}`, level: "club", name: `測試分會-${suffix}`, districtCode: "300A-1" } });
  const person = async (role, extra = {}) => {
    const email = `${role}-${suffix}@example.test`;
    return sim.prisma.member.create({ data: { id: `${role}-${suffix}`, name: `模擬${role}`, email, organizationId: ai.id, status: "ACTIVE", organizationAssignmentStatus: "NEEDS_ASSIGNMENT", user: { create: { email, passwordHash: hash } }, ...extra }, include: { user: true } });
  };
  const chair = await person("chair");
  const member = await person("member");
  const friend = await person("friend");
  await sim.prisma.adminRole.createMany({ data: [ai, other].map(org => ({ memberId: chair.id, role: "CLUB_PRESIDENT", scopeType: "club", scopeId: org.id })) });
  await sim.prisma.friendship.create({ data: { requesterId: member.id, addresseeId: friend.id, status: "ACCEPTED" } });
  const event = await sim.prisma.event.create({ data: { id: `event-${suffix}`, title: `模擬活動-${suffix}`, startAt: new Date(Date.now() + 86400000), hostOrganizationId: ai.id, createdById: chair.id, capacity: 1000 } });
  const invite = await sim.prisma.clubInvite.create({ data: { organizationId: ai.id, issuedById: chair.id, pin: "unused", token: `sim-invite-${suffix}`, validUntil: new Date(Date.now() + 86400000), usageLimit: 1000 } });
  return { ai, other, chair, member, friend, event, invite, password: "SimulationPass42!" };
}
