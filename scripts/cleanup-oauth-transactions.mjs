#!/usr/bin/env node
// Explicit, bounded maintenance only. No ambient DATABASE_URL, dotenv, AWS,
// Secrets Manager, credentials output or implicit production target.
import { pathToFileURL } from "node:url";

export function parseOAuthCleanupOptions(args, environment = process.env) {
  const values = {}, switches = new Set(["--dry-run", "--apply", "--confirm-expired-oauth-state-cleanup"]);
  const valueFlags = new Set(["--environment", "--confirm-host", "--confirm-database", "--limit"]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if ((!switches.has(flag) && !valueFlags.has(flag)) || Object.hasOwn(values, flag)) throw Error("INVALID_ARGUMENTS");
    if (switches.has(flag)) { values[flag] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw Error("INVALID_ARGUMENTS");
    values[flag] = value;
  }
  if (!["test", "staging", "production"].includes(values["--environment"])) throw Error("EXPLICIT_ENVIRONMENT_REQUIRED");
  if (Boolean(values["--dry-run"]) === Boolean(values["--apply"])) throw Error("EXACTLY_ONE_MODE_REQUIRED");
  if (values["--apply"] && !values["--confirm-expired-oauth-state-cleanup"]) throw Error("EXPLICIT_APPLY_CONFIRMATION_REQUIRED");
  if (!environment.OAUTH_CLEANUP_DATABASE_URL) throw Error("EXPLICIT_OAUTH_CLEANUP_DATABASE_URL_REQUIRED");
  let url; try { url = new URL(environment.OAUTH_CLEANUP_DATABASE_URL); } catch { throw Error("INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error("POSTGRESQL_REQUIRED");
  let database; try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw Error("INVALID_DATABASE_URL"); }
  if (!database || values["--confirm-host"] !== url.hostname || values["--confirm-database"] !== database) throw Error("EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED");
  if (url.searchParams.has("host")) throw Error("HOST_OVERRIDE_FORBIDDEN");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (values["--environment"] === "test" && (!local || !/test|synthetic|disposable/i.test(database))) throw Error("TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE");
  if ((!local || values["--environment"] !== "test") && (url.searchParams.getAll("sslmode").length !== 1 || !["require", "verify-full"].includes(url.searchParams.get("sslmode")))) throw Error("ENCRYPTED_DATABASE_CONNECTION_REQUIRED");
  const limit = Number(values["--limit"] || 100);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw Error("INVALID_LIMIT");
  return { databaseUrl: environment.OAUTH_CLEANUP_DATABASE_URL, environment: values["--environment"], apply: values["--apply"] === true, limit };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.length === 1 && args[0] === "--help") {
    console.log("Usage: node scripts/cleanup-oauth-transactions.mjs --environment test|staging|production --confirm-host HOST --confirm-database DB --dry-run|--apply [--limit 100] [--confirm-expired-oauth-state-cleanup]");
    console.log("Requires dedicated OAUTH_CLEANUP_DATABASE_URL, exact target confirmations and encrypted remote connection. No arguments/help never connects.");
    return;
  }
  const options = parseOAuthCleanupOptions(args);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: options.databaseUrl } } });
  try {
    const now = new Date(), eligible = { expiresAt: { lt: now }, OR: [{ reauthExpiresAt: null }, { reauthExpiresAt: { lt: now } }] };
    const rows = await prisma.oAuthTransaction.findMany({ where: eligible, orderBy: { expiresAt: "asc" }, take: options.limit, select: { id: true } });
    let deleted = 0;
    if (options.apply && rows.length) deleted = (await prisma.oAuthTransaction.deleteMany({ where: { ...eligible, id: { in: rows.map(row => row.id) } } })).count;
    console.log(JSON.stringify({ dryRun: !options.apply, environment: options.environment, candidates: rows.length, deleted, limit: options.limit, checkedAt: now.toISOString() }));
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  const safe = new Set(["INVALID_ARGUMENTS", "EXPLICIT_ENVIRONMENT_REQUIRED", "EXACTLY_ONE_MODE_REQUIRED", "EXPLICIT_APPLY_CONFIRMATION_REQUIRED", "EXPLICIT_OAUTH_CLEANUP_DATABASE_URL_REQUIRED", "INVALID_DATABASE_URL", "POSTGRESQL_REQUIRED", "EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED", "HOST_OVERRIDE_FORBIDDEN", "TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE", "ENCRYPTED_DATABASE_CONNECTION_REQUIRED", "INVALID_LIMIT"]);
  console.error(safe.has(error?.message) ? error.message : "OAUTH_CLEANUP_FAILED_CHECK_APPROVED_TARGET_AND_MIGRATION"); process.exitCode = 1;
});
