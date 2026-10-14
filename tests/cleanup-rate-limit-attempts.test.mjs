import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCleanupOptions } from "../scripts/cleanup-rate-limit-attempts.mjs";

test("rate limit cleanup never falls back to DATABASE_URL or implicit production DB", () => {
  const args = ["--environment", "test"];
  assert.throws(() => parseCleanupOptions(args, { DATABASE_URL: "postgresql://secret@production/lionclub" }), /EXPLICIT_RATE_LIMIT_CLEANUP_DATABASE_URL_REQUIRED/);
  assert.throws(() => parseCleanupOptions(args, { RATE_LIMIT_CLEANUP_DATABASE_URL: "postgresql://secret@production/lionclub" }), /TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE/);
  const parsed = parseCleanupOptions(args, { RATE_LIMIT_CLEANUP_DATABASE_URL: "postgresql://127.0.0.1/lionclub_disposable_test" });
  assert.equal(parsed.execute, false);
  assert.equal(parsed.retainHours, 48);
});

test("remote cleanup needs explicit host/database confirmation, encrypted connection, and a valid retain-hours", () => {
  const env = { RATE_LIMIT_CLEANUP_DATABASE_URL: "postgresql://test:fake@database.example.invalid/lionclub?sslmode=require" };
  assert.throws(() => parseCleanupOptions(["--environment", "production"], env), /EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED/);
  const confirmed = ["--environment", "production", "--confirm-host", "database.example.invalid", "--confirm-database", "lionclub"];
  assert.equal(parseCleanupOptions(confirmed, env).execute, false);
  assert.equal(parseCleanupOptions([...confirmed, "--execute"], env).execute, true);
  assert.throws(() => parseCleanupOptions([...confirmed, "--retain-hours", "0"], env), /INVALID_RETAIN_HOURS/);
  assert.equal(parseCleanupOptions([...confirmed, "--retain-hours", "72"], env).retainHours, 72);
  const unencrypted = { RATE_LIMIT_CLEANUP_DATABASE_URL: "postgresql://test:fake@database.example.invalid/lionclub" };
  assert.throws(() => parseCleanupOptions(confirmed, unencrypted), /ENCRYPTED_DATABASE_CONNECTION_REQUIRED/);
});
