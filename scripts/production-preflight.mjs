/** Read-only, explicitly targeted production preflight. Never migrates/seeds/resets. */
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";

export const RELEASE_MIGRATION = "20261014090000_acceptance_security_and_history";

export function parsePreflightOptions(args, environment = process.env) {
  const flags = new Set(["--confirm-host", "--confirm-database", "--confirm-schema", "--phase"]), values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], value = args[++index];
    if (!flags.has(flag) || Object.hasOwn(values, flag) || !value || value.startsWith("--")) throw Error("INVALID_ARGUMENTS");
    values[flag] = value;
  }
  if (!environment.RELEASE_DATABASE_URL) throw Error("EXPLICIT_RELEASE_DATABASE_URL_REQUIRED");
  let url; try { url = new URL(environment.RELEASE_DATABASE_URL); } catch { throw Error("INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error("POSTGRESQL_REQUIRED");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || values["--confirm-host"] !== url.hostname || values["--confirm-database"] !== database) throw Error("EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED");
  if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode"))) throw Error("ENCRYPTED_DATABASE_CONNECTION_REQUIRED");
  if (!["before", "after"].includes(values["--phase"])) throw Error("EXPLICIT_PHASE_REQUIRED");
  const schema = values["--confirm-schema"];
  if (!schema || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) || (url.searchParams.get("schema") ?? "public") !== schema) throw Error("EXPLICIT_MATCHING_SCHEMA_REQUIRED");
  return { databaseUrl: environment.RELEASE_DATABASE_URL, host: url.hostname, database, schema, phase: values["--phase"] };
}

export function inspectMigrationHistory(records, expected, phase) {
  const issues = [];
  for (const record of records) {
    if (!record.finished_at && !record.rolled_back_at) issues.push(`UNRESOLVED_MIGRATION:${record.migration_name}`);
    if (record.finished_at && !record.rolled_back_at && expected.get(record.migration_name) !== record.checksum) issues.push(`MIGRATION_CHECKSUM_MISMATCH:${record.migration_name}`);
  }
  const applied = new Set(records.filter(record => record.finished_at && !record.rolled_back_at).map(record => record.migration_name));
  for (const name of expected.keys()) if (!applied.has(name) && (phase === "after" || name !== RELEASE_MIGRATION)) issues.push(`MISSING_MIGRATION:${name}`);
  return { issues, releaseMigrationApplied: applied.has(RELEASE_MIGRATION) };
}

async function main() {
  const options = parsePreflightOptions(process.argv.slice(2));
  const migrationDirectory = resolve("prisma/migrations");
  const expected = new Map(readdirSync(migrationDirectory).filter(name => /^\d/.test(name)).map(name => [name, crypto.createHash("sha256").update(readFileSync(resolve(migrationDirectory, name, "migration.sql"))).digest("hex")]));
  if (!expected.has(RELEASE_MIGRATION)) throw Error("RUN_FROM_RELEASE_CHECKOUT_REQUIRED");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: options.databaseUrl } } });
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      const [identity] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema_name, current_setting('server_version_num') AS pg_version");
      if (identity.schema_name !== options.schema) throw Error("DATABASE_SCHEMA_MISMATCH");
      const history = await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
      const migration = inspectMigrationHistory(history, expected, options.phase);
      const counts = await tx.$queryRawUnsafe('SELECT (SELECT count(*) FROM "Member") AS members, (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Event") AS events, (SELECT count(*) FROM "EventRegistration") AS registrations, (SELECT count(*) FROM "EmailVerificationToken" WHERE "usedAt" IS NULL) AS unused_verify_tokens, (SELECT count(*) FROM "PasswordResetToken" WHERE "usedAt" IS NULL) AS unused_reset_tokens');
      const orphans = await tx.$queryRawUnsafe('SELECT (SELECT count(*) FROM "EmailVerificationToken" t LEFT JOIN "User" u ON u.id=t."userId" WHERE u.id IS NULL) AS verify_tokens, (SELECT count(*) FROM "PasswordResetToken" t LEFT JOIN "User" u ON u.id=t."userId" WHERE u.id IS NULL) AS reset_tokens, (SELECT count(*) FROM "Event" e LEFT JOIN "Member" m ON m.id=e."createdById" WHERE m.id IS NULL) AS events, (SELECT count(*) FROM "EventNotification" n LEFT JOIN "Member" m ON m.id=n."senderId" WHERE m.id IS NULL) AS notices');
      if (Object.values(orphans[0]).some(value => Number(value) > 0)) migration.issues.push("ORPHANED_RELATIONS");
      const longTransactions = await tx.$queryRawUnsafe("SELECT pid, state, EXTRACT(EPOCH FROM now()-xact_start)::bigint AS age_seconds, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start < now()-interval '30 seconds'");
      if (longTransactions.length) migration.issues.push("LONG_TRANSACTIONS_REQUIRE_REVIEW");
      let columns = [], constraints = [], cleanupJobs = [];
      if (options.phase === "after") {
        columns = await tx.$queryRawUnsafe("SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND ((table_name='User' AND column_name='sessionVersion') OR (table_name='Member' AND column_name='deletedAt') OR (table_name='MemberExperience' AND column_name='startMonth') OR (table_name IN ('EmailVerificationToken','PasswordResetToken') AND column_name='email')) ORDER BY table_name,column_name");
        if (columns.length !== 5) migration.issues.push("RELEASE_COLUMNS_INCOMPLETE");
        constraints = await tx.$queryRawUnsafe("SELECT conname, confdeltype::text AS confdeltype, convalidated FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND conname IN ('Event_createdById_fkey','EventNotification_senderId_fkey','MemberExperience_startMonth_check')");
        if (constraints.length !== 3 || constraints.some(item => !item.convalidated || item.conname.endsWith("fkey") && item.confdeltype !== "r")) migration.issues.push("RELEASE_CONSTRAINTS_INCOMPLETE");
        cleanupJobs = await tx.$queryRawUnsafe('SELECT status,count(*) AS jobs,count(*) FILTER (WHERE bucket IS NULL OR region IS NULL) AS missing_storage FROM "AccountDeletionCleanup" GROUP BY status');
        if (cleanupJobs.some(item => Number(item.missing_storage) > 0)) migration.issues.push("CLEANUP_STORAGE_NOT_CONFIGURED");
      }
      return { readOnly: true, ...migration, identity, counts: counts[0], orphans: orphans[0], longTransactions, columns, constraints, cleanupJobs };
    }, { isolationLevel: "RepeatableRead", timeout: 60000 });
    console.log(JSON.stringify({ phase: options.phase, ...result }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
    if (result.issues.length) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  const safe = new Set(["INVALID_ARGUMENTS", "EXPLICIT_RELEASE_DATABASE_URL_REQUIRED", "INVALID_DATABASE_URL", "POSTGRESQL_REQUIRED", "EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED", "ENCRYPTED_DATABASE_CONNECTION_REQUIRED", "EXPLICIT_PHASE_REQUIRED", "EXPLICIT_MATCHING_SCHEMA_REQUIRED", "RUN_FROM_RELEASE_CHECKOUT_REQUIRED", "DATABASE_SCHEMA_MISMATCH"]);
  console.error(safe.has(error?.message) ? error.message : "PRODUCTION_PREFLIGHT_FAILED_CHECK_ACCESS_AND_DATABASE");
  process.exitCode = 1;
});
