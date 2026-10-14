import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectMigrationHistory, parsePreflightOptions, RELEASE_MIGRATION } from "../scripts/production-preflight.mjs";
const args = ["--confirm-host", "test-db.example.test", "--confirm-database", "release_test", "--confirm-schema", "public", "--phase", "before"];
const env = { RELEASE_DATABASE_URL: "postgresql://test:test@test-db.example.test/release_test?sslmode=require" };
test("production preflight cannot fall back to ambient DB and requires exact encrypted target", () => {
  assert.throws(() => parsePreflightOptions(args, { DATABASE_URL: env.RELEASE_DATABASE_URL }), /EXPLICIT_RELEASE/);
  assert.throws(() => parsePreflightOptions([], env), /EXACT_HOST/);
  assert.throws(() => parsePreflightOptions(args, { RELEASE_DATABASE_URL: env.RELEASE_DATABASE_URL.replace("test-db.", "other-db.") }), /EXACT_HOST/);
  assert.throws(() => parsePreflightOptions(args, { RELEASE_DATABASE_URL: env.RELEASE_DATABASE_URL.replace("sslmode=require", "sslmode=disable") }), /ENCRYPTED/);
  assert.throws(() => parsePreflightOptions([...args, "--execute"], env), /INVALID_ARGUMENTS/);
  assert.equal(parsePreflightOptions(args, env).phase, "before");
});
test("production preflight detects changed history, failed migration and missing prerequisites", () => {
  const expected = new Map([["old", "old-hash"], [RELEASE_MIGRATION, "new-hash"]]);
  const good = [{ migration_name: "old", checksum: "old-hash", finished_at: new Date(), rolled_back_at: null }];
  assert.deepEqual(inspectMigrationHistory(good, expected, "before").issues, []);
  assert.equal(inspectMigrationHistory(good, expected, "before").releaseMigrationApplied, false);
  assert.match(inspectMigrationHistory(good, expected, "after").issues[0], /MISSING_MIGRATION/);
  assert.match(inspectMigrationHistory([{ ...good[0], checksum: "changed" }], expected, "before").issues[0], /CHECKSUM_MISMATCH/);
  assert.match(inspectMigrationHistory([{ ...good[0], finished_at: null }], expected, "before").issues[0], /UNRESOLVED/);
  const complete = [...good, { migration_name: RELEASE_MIGRATION, checksum: "new-hash", finished_at: new Date(), rolled_back_at: null }];
  assert.deepEqual(inspectMigrationHistory(complete, expected, "after").issues, []);
});
