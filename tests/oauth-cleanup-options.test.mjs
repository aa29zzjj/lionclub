import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOAuthCleanupOptions } from "../scripts/cleanup-oauth-transactions.mjs";

const args = ["--environment", "staging", "--confirm-host", "db.example.test", "--confirm-database", "synthetic", "--dry-run"];
const env = { OAUTH_CLEANUP_DATABASE_URL: "postgresql://synthetic:synthetic@db.example.test:5432/synthetic?sslmode=require" };
test("OAuth cleanup requires dedicated URL and exact confirmed target before any DB import/connect", () => {
  assert.equal(parseOAuthCleanupOptions(args, env).apply, false);
  assert.throws(() => parseOAuthCleanupOptions(args, { DATABASE_URL: env.OAUTH_CLEANUP_DATABASE_URL }), /EXPLICIT_OAUTH_CLEANUP_DATABASE_URL_REQUIRED/);
  assert.throws(() => parseOAuthCleanupOptions(args, { OAUTH_CLEANUP_DATABASE_URL: env.OAUTH_CLEANUP_DATABASE_URL.replace("db.example.test", "other.example.test") }), /EXACT_HOST_AND_DATABASE_CONFIRMATION_REQUIRED/);
  assert.throws(() => parseOAuthCleanupOptions(args, { OAUTH_CLEANUP_DATABASE_URL: env.OAUTH_CLEANUP_DATABASE_URL.replace("sslmode=require", "sslmode=disable") }), /ENCRYPTED_DATABASE_CONNECTION_REQUIRED/);
  assert.throws(() => parseOAuthCleanupOptions(args, { OAUTH_CLEANUP_DATABASE_URL: `${env.OAUTH_CLEANUP_DATABASE_URL}&host=other.example.test` }), /HOST_OVERRIDE_FORBIDDEN/);
  assert.throws(() => parseOAuthCleanupOptions(args, { OAUTH_CLEANUP_DATABASE_URL: `${env.OAUTH_CLEANUP_DATABASE_URL}&sslmode=disable` }), /ENCRYPTED_DATABASE_CONNECTION_REQUIRED/);
});
test("OAuth cleanup apply needs extra confirmation, a single mode and bounded batch", () => {
  const apply = args.map(arg => arg === "--dry-run" ? "--apply" : arg);
  assert.throws(() => parseOAuthCleanupOptions(apply, env), /EXPLICIT_APPLY_CONFIRMATION_REQUIRED/);
  assert.equal(parseOAuthCleanupOptions([...apply, "--confirm-expired-oauth-state-cleanup", "--limit", "25"], env).limit, 25);
  assert.throws(() => parseOAuthCleanupOptions([...args, "--limit", "1001"], env), /INVALID_LIMIT/);
  assert.throws(() => parseOAuthCleanupOptions([...args, "--apply"], env), /EXACTLY_ONE_MODE_REQUIRED/);
  assert.throws(() => parseOAuthCleanupOptions([...args, "--confirm-host", "extra"], env), /INVALID_ARGUMENTS/);
});
