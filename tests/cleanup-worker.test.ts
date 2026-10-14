import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCleanupWorkerOptions } from "../scripts/run-account-deletion-cleanup.mjs";

test("cleanup worker never falls back to DATABASE_URL or implicit production DB", () => {
  const args = ["--job", "synthetic-job", "--environment", "test"];
  assert.throws(() => parseCleanupWorkerOptions(args, { DATABASE_URL: "postgresql://secret@production/lionclub" }), /EXPLICIT_ACCOUNT_CLEANUP_DATABASE_URL_REQUIRED/);
  assert.throws(() => parseCleanupWorkerOptions(args, { ACCOUNT_CLEANUP_DATABASE_URL: "postgresql://secret@production/lionclub" }), /TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE/);
  assert.throws(() => parseCleanupWorkerOptions(args, { ACCOUNT_CLEANUP_DATABASE_URL: "postgresql://127.0.0.1/lionclub" }), /TEST_MODE_REQUIRES_LOCAL_DISPOSABLE_DATABASE/);
  assert.equal(parseCleanupWorkerOptions(args, { ACCOUNT_CLEANUP_DATABASE_URL: "postgresql://127.0.0.1/lionclub_disposable_test" }).execute, false);
});

test("remote cleanup needs explicit host/database confirmation and execution needs separate storage opt-in", () => {
  const args = ["--job", "synthetic-job", "--environment", "production"];
  const env = { ACCOUNT_CLEANUP_DATABASE_URL: "postgresql://test:fake@database.example.invalid/lionclub" };
  assert.throws(() => parseCleanupWorkerOptions(args, env), /EXACT_HOST_AND_DATABASE_CONFIRMATIONS/);
  const confirmed = [...args, "--confirm-host", "database.example.invalid", "--confirm-database", "lionclub"];
  assert.equal(parseCleanupWorkerOptions(confirmed, env).execute, false);
  assert.throws(() => parseCleanupWorkerOptions([...confirmed, "--execute"], env), /EXPLICIT_STORAGE_DELETE_CONFIRMATION_REQUIRED/);
  assert.equal(parseCleanupWorkerOptions([...confirmed, "--execute"], { ...env, ACCOUNT_CLEANUP_ALLOW_STORAGE_DELETE: "YES_DELETE_MEMBER_AVATARS" }).execute, true);
});
