// Explicit, single-batch trusted worker. No .env loading, default DB, cron,
// provisioning, migration or network in --plan mode. Never print credentials.
import { readFileSync, lstatSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { pathToFileURL } from "node:url";
import { MOBILE_PUSH_TOPIC, mobilePushSettings } from "../src/lib/mobile-push-config.ts";

/** @param {string[]} args @param {Record<string, string | undefined>} env */
export function parsePushWorkerArguments(args, env = process.env) {
  if (args.length === 1 && args[0] === "--plan") return { mode: "plan" };
  const flags = new Set(["--confirm-host", "--confirm-database", "--confirm-topic", "--confirm-environment"]), values = {};
  if (args[0] !== "--execute") throw Error("EXPLICIT_PUSH_EXECUTION_REQUIRED");
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!flags.has(flag) || Object.hasOwn(values, flag) || !value || value.startsWith("--")) throw Error("INVALID_PUSH_ARGUMENTS");
    values[flag] = value;
  }
  const settings = mobilePushSettings(env);
  if (env.PUSH_DELIVERY_ENABLED !== "true" || !settings.enabled) throw Error("PUSH_EXECUTION_DISABLED");
  if (!env.PUSH_DATABASE_URL) throw Error("EXPLICIT_PUSH_DATABASE_REQUIRED");
  let database; try { database = new URL(env.PUSH_DATABASE_URL); } catch { throw Error("INVALID_PUSH_DATABASE"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !["require", "verify-ca", "verify-full"].includes(database.searchParams.get("sslmode"))
    || database.searchParams.get("sslaccept") === "accept_invalid_certs") throw Error("ENCRYPTED_VERIFIED_DATABASE_REQUIRED");
  if (values["--confirm-host"] !== database.hostname || values["--confirm-database"] !== decodeURIComponent(database.pathname.slice(1))
    || values["--confirm-topic"] !== MOBILE_PUSH_TOPIC || values["--confirm-environment"] !== settings.environment) throw Error("EXACT_PUSH_TARGET_CONFIRMATION_REQUIRED");
  if (!/^[A-Z0-9]{10}$/.test(env.APNS_KEY_ID ?? "") || !/^[A-Z0-9]{10}$/.test(env.APNS_TEAM_ID ?? "")
    || !env.PUSH_APNS_KEY_PATH?.startsWith("/")) throw Error("EXPLICIT_APNS_KEY_REQUIRED");
  return { mode: "execute", settings, databaseUrl: env.PUSH_DATABASE_URL, keyPath: env.PUSH_APNS_KEY_PATH, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID };
}
async function main() {
  const input = parsePushWorkerArguments(process.argv.slice(2));
  if (input.mode === "plan") {
    console.log(JSON.stringify({ mode: "plan", connectsDatabase: false, sendsPush: false, readsKey: false, createsResources: false,
      executionRequires: ["explicit encrypted PUSH_DATABASE_URL target", "MOBILE_PUSH_ENABLED", "PUSH_DELIVERY_ENABLED", "APNs-specific private key", "all four confirmation flags"], maxBatch: 25 })); return;
  }
  const stat = lstatSync(input.keyPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 16384) throw Error("PRIVATE_APNS_KEY_FILE_REQUIRED");
  const key = createPrivateKey(readFileSync(input.keyPath));
  const { createApnsProvider } = await import("../src/lib/apns-provider.ts");
  const { processMobilePushBatch } = await import("../src/lib/mobile-push-delivery.ts");
  const { PrismaClient } = await import("@prisma/client");
  const provider = createApnsProvider({ key, keyId: input.keyId, teamId: input.teamId });
  const prisma = new PrismaClient({ datasources: { db: { url: input.databaseUrl } } });
  try { console.log(JSON.stringify(await processMobilePushBatch(prisma, provider.send, input.settings, new Date(), 25))); }
  finally { provider.close(); await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("PUSH_WORKER_NOT_CONFIRMED_CHECK_PRIVATE_CONFIGURATION_AND_TARGET"); process.exitCode = 1;
});
