// Trusted one-job worker, deliberately never loads .env/Secrets Manager/default DB.
// Preview first. Real storage deletion requires all explicit confirmations below.
// node --import tsx scripts/run-account-deletion-cleanup.mjs --job <id> --environment test
import { pathToFileURL } from "node:url";

/** @param {string[]} args @param {Record<string, string | undefined>} [environment] */
export function parseCleanupWorkerOptions(args, environment = process.env) {
  const allowed = new Set(["--job", "--environment", "--confirm-host", "--confirm-database", "--execute"]);
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag) || Object.hasOwn(values, flag)) throw new Error("INVALID_ARGUMENTS");
    if (flag === "--execute") values[flag] = true;
    else { const value = args[++index]; if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS"); values[flag] = value; }
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(values["--job"] ?? "")) throw new Error("EXPLICIT_JOB_REQUIRED");
  if (!["test", "staging", "production"].includes(values["--environment"])) throw new Error("EXPLICIT_ENVIRONMENT_REQUIRED");
  const value = environment.ACCOUNT_CLEANUP_DATABASE_URL;
  if (!value) throw new Error("EXPLICIT_ACCOUNT_CLEANUP_DATABASE_URL_REQUIRED");
  let url;
  try { url = new URL(value); } catch { throw new Error("INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("POSTGRESQL_REQUIRED");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (values["--environment"] === "test") {
    if (!local || !/test|synthetic|disposable/i.test(database)) throw new Error("TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE");
  } else if (values["--confirm-host"] !== url.hostname || values["--confirm-database"] !== database) throw new Error("REMOTE_ENVIRONMENT_REQUIRES_EXACT_HOST_AND_DATABASE_CONFIRMATIONS");
  const execute = values["--execute"] === true;
  if (execute && environment.ACCOUNT_CLEANUP_ALLOW_STORAGE_DELETE !== "YES_DELETE_MEMBER_AVATARS") throw new Error("EXPLICIT_STORAGE_DELETE_CONFIRMATION_REQUIRED");
  return { jobId: values["--job"], environment: values["--environment"], execute, databaseUrl: value };
}

async function main() {
  const options = parseCleanupWorkerOptions(process.argv.slice(2));
  // Imported only after validation; no automatic Prisma/Secrets Manager fallback.
  const [{ PrismaClient }, { processAccountDeletionCleanup }, { createAvatarCleanupStorage }] = await Promise.all([
    import("@prisma/client"), import("../src/lib/account-deletion.ts"), import("../src/lib/avatar-cleanup-storage.ts"),
  ]);
  const prisma = new PrismaClient({ datasources: { db: { url: options.databaseUrl } } });
  try {
    const task = await prisma.accountDeletionCleanup.findUnique({ where: { id: options.jobId }, select: { id: true, status: true, attemptCount: true } });
    if (!task) throw new Error("CLEANUP_JOB_NOT_FOUND");
    if (!options.execute) { console.log(JSON.stringify({ previewOnly: true, environment: options.environment, job: task })); return; }
    const result = await processAccountDeletionCleanup(prisma, options.jobId, createAvatarCleanupStorage());
    console.log(JSON.stringify({ environment: options.environment, jobId: task.id, ...result }));
    if (!result.completed) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Do not echo Prisma/AWS exceptions or connection URLs with credentials.
    const safe = new Set(["INVALID_ARGUMENTS", "EXPLICIT_JOB_REQUIRED", "EXPLICIT_ENVIRONMENT_REQUIRED", "EXPLICIT_ACCOUNT_CLEANUP_DATABASE_URL_REQUIRED", "INVALID_DATABASE_URL", "POSTGRESQL_REQUIRED", "TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE", "REMOTE_ENVIRONMENT_REQUIRES_EXACT_HOST_AND_DATABASE_CONFIRMATIONS", "EXPLICIT_STORAGE_DELETE_CONFIRMATION_REQUIRED", "CLEANUP_JOB_NOT_FOUND"]);
    console.error(safe.has(error?.message) ? error.message : "CLEANUP_WORKER_FAILED_CHECK_SECURE_SERVER_LOGS");
    process.exitCode = 1;
  });
}
