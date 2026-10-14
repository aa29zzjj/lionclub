// Deletes RateLimitAttempt rows whose window closed more than --retain-hours ago.
// Each row is scoped to one fixed 10-minute window (see WINDOW_MS in rate-limit.ts),
// so anything older than a day or two is pure dead weight, never consulted again.
// Same explicit-target safety pattern as the other production scripts: no implicit
// DATABASE_URL fallback, remote runs require exact host/database confirmation.
import { pathToFileURL } from "node:url";

export function parseCleanupOptions(args, environment = process.env) {
  const allowed = new Set(["--environment", "--confirm-host", "--confirm-database", "--retain-hours", "--execute"]);
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag) || Object.hasOwn(values, flag)) throw new Error("INVALID_ARGUMENTS");
    if (flag === "--execute") { values[flag] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
    values[flag] = value;
  }
  if (!["test", "staging", "production"].includes(values["--environment"])) throw new Error("EXPLICIT_ENVIRONMENT_REQUIRED");
  const databaseUrl = environment.RATE_LIMIT_CLEANUP_DATABASE_URL;
  if (!databaseUrl) throw new Error("EXPLICIT_RATE_LIMIT_CLEANUP_DATABASE_URL_REQUIRED");
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error("INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("POSTGRESQL_REQUIRED");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (values["--environment"] === "test") {
    if (!local || !/test|synthetic|disposable/i.test(database)) throw new Error("TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE");
  } else {
    if (values["--confirm-host"] !== url.hostname || values["--confirm-database"] !== database) throw new Error("EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED");
    if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode"))) throw new Error("ENCRYPTED_DATABASE_CONNECTION_REQUIRED");
  }
  const retainHours = values["--retain-hours"] ? Number(values["--retain-hours"]) : 48;
  if (!Number.isFinite(retainHours) || retainHours < 1) throw new Error("INVALID_RETAIN_HOURS");
  return { environment: values["--environment"], databaseUrl, retainHours, execute: values["--execute"] === true };
}

async function main() {
  const options = parseCleanupOptions(process.argv.slice(2));
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: options.databaseUrl } } });
  try {
    const cutoff = new Date(Date.now() - options.retainHours * 60 * 60 * 1000);
    const where = { windowStart: { lt: cutoff } };
    const matching = await prisma.rateLimitAttempt.count({ where });
    if (!options.execute) {
      console.log(JSON.stringify({ previewOnly: true, environment: options.environment, retainHours: options.retainHours, cutoff, matching }));
      return;
    }
    const result = await prisma.rateLimitAttempt.deleteMany({ where });
    console.log(JSON.stringify({ environment: options.environment, retainHours: options.retainHours, cutoff, deleted: result.count }));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safe = new Set(["INVALID_ARGUMENTS", "EXPLICIT_ENVIRONMENT_REQUIRED", "EXPLICIT_RATE_LIMIT_CLEANUP_DATABASE_URL_REQUIRED", "INVALID_DATABASE_URL", "POSTGRESQL_REQUIRED", "TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE", "EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED", "ENCRYPTED_DATABASE_CONNECTION_REQUIRED", "INVALID_RETAIN_HOURS"]);
    console.error(safe.has(error?.message) ? error.message : "RATE_LIMIT_CLEANUP_FAILED_CHECK_SECURE_SERVER_LOGS");
    process.exitCode = 1;
  });
}
