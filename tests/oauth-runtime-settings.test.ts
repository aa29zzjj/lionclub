import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntimeSecretsResolver, pickApprovedSecrets } from "../src/lib/runtime-secrets";
import { providerConfig, publicProviders } from "../src/lib/federated-auth";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const record = { DATABASE_URL: "postgresql://synthetic:synthetic@localhost/synthetic", AUTH_SECRET: "synthetic-auth-secret", FEDERATED_AUTH_ENABLED: "true",
  GOOGLE_OAUTH_CLIENT_ID: "synthetic-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-google-secret", OAUTH_APP_ORIGIN: "https://app.example.test", GOOGLE_OAUTH_FRESH_REAUTH_ENABLED: "false" };

test("unconfigured and explicitly disabled OAuth never invoke AWS, and complete env configuration takes precedence", async () => {
  let reads = 0;
  const fetchSecret = async () => { reads++; return record; };
  const empty = createRuntimeSecretsResolver({ environment: {}, fetchSecret });
  assert.equal((await empty.getOAuthRuntimeSettings()).FEDERATED_AUTH_ENABLED, undefined); assert.equal(reads, 0);
  const disabled = createRuntimeSecretsResolver({ environment: { OAUTH_RUNTIME_SECRETS_ENABLED: "true", FEDERATED_AUTH_ENABLED: "false" }, fetchSecret });
  assert.equal((await disabled.getOAuthRuntimeSettings()).FEDERATED_AUTH_ENABLED, "false"); assert.equal(reads, 0);
  const env = { ...record, OAUTH_RUNTIME_SECRETS_ENABLED: "true", GOOGLE_OAUTH_CLIENT_SECRET: "env-overrides-secret" };
  const complete = createRuntimeSecretsResolver({ environment: env, fetchSecret });
  assert.equal((await complete.getOAuthRuntimeSettings()).GOOGLE_OAUTH_CLIENT_SECRET, "env-overrides-secret");
  assert.deepEqual(await complete.getAppSecrets(), { DATABASE_URL: record.DATABASE_URL, AUTH_SECRET: record.AUTH_SECRET }); assert.equal(reads, 0);
});
test("approved runtime secret lookup is allowlisted, cached/deduplicated, scoped and safe for public providers", async () => {
  let reads = 0; const names: string[] = [];
  const resolver = createRuntimeSecretsResolver({ environment: { NODE_ENV: "production", OAUTH_RUNTIME_SECRETS_ENABLED: "true", APP_SECRETS_NAME: "approved/synthetic-app" }, fetchSecret: async name => {
    reads++; names.push(name); return { ...record, AWS_SECRET_ACCESS_KEY: "do-not-copy", APPLE_OAUTH_PRIVATE_KEY: "do-not-copy", arbitrary: { nested: "do-not-copy" } };
  } });
  const [settings, app] = await Promise.all([resolver.getOAuthRuntimeSettings(), resolver.getAppSecrets()]);
  assert.equal(reads, 1); assert.deepEqual(names, ["approved/synthetic-app"]); assert.equal(app.AUTH_SECRET, record.AUTH_SECRET);
  assert.ok(providerConfig("google", settings)); assert.equal(providerConfig("apple", settings), null);
  assert.equal("DATABASE_URL" in settings, false); assert.equal("AUTH_SECRET" in settings, false); assert.equal("APPLE_OAUTH_PRIVATE_KEY" in settings, false);
  const safe = JSON.stringify(publicProviders(settings));
  for (const value of [record.GOOGLE_OAUTH_CLIENT_ID, record.GOOGLE_OAUTH_CLIENT_SECRET, record.AUTH_SECRET, "do-not-copy"]) assert.equal(safe.includes(value), false);
  await resolver.getOAuthRuntimeSettings(); assert.equal(reads, 1);
});
test("partial credential/origin source conflicts fail closed rather than mix different clients", async () => {
  const make = (environment: Record<string, string>) => createRuntimeSecretsResolver({ environment: { OAUTH_RUNTIME_SECRETS_ENABLED: "true", ...environment }, fetchSecret: async () => record });
  assert.equal((await make({ GOOGLE_OAUTH_CLIENT_ID: record.GOOGLE_OAUTH_CLIENT_ID }).getOAuthRuntimeSettings()).GOOGLE_OAUTH_CLIENT_SECRET, record.GOOGLE_OAUTH_CLIENT_SECRET);
  assert.equal((await make({ OAUTH_APP_ORIGIN: `${record.OAUTH_APP_ORIGIN}/` }).getOAuthRuntimeSettings()).GOOGLE_OAUTH_CLIENT_SECRET, record.GOOGLE_OAUTH_CLIENT_SECRET);
  await assert.rejects(() => make({ GOOGLE_OAUTH_CLIENT_ID: "different-client" }).getOAuthRuntimeSettings(), /APP_OAUTH_SOURCE_CONFLICT/);
  await assert.rejects(() => make({ GOOGLE_OAUTH_CLIENT_SECRET: "different-secret" }).getOAuthRuntimeSettings(), /APP_OAUTH_SOURCE_CONFLICT/);
  await assert.rejects(() => make({ GOOGLE_OAUTH_CLIENT_ID: "different-client", GOOGLE_OAUTH_CLIENT_SECRET: "different-secret" }).getOAuthRuntimeSettings(), /APP_OAUTH_SOURCE_CONFLICT/);
  await assert.rejects(() => make({ OAUTH_APP_ORIGIN: "https://other.example.test" }).getOAuthRuntimeSettings(), /APP_OAUTH_SOURCE_CONFLICT/);
});
test("secret lookup failure is sanitized, not cached forever, and success rotates after the cache lifetime", async () => {
  let reads = 0, clock = 0;
  const resolver = createRuntimeSecretsResolver({ environment: { OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, now: () => clock, cacheMs: 1000, fetchSecret: async () => {
    reads++; if (reads === 1) throw Error("synthetic-source-location-and-secret-must-not-escape"); return { ...record, GOOGLE_OAUTH_CLIENT_SECRET: `synthetic-version-${reads}` };
  } });
  await assert.rejects(() => resolver.getOAuthRuntimeSettings(), error => error instanceof Error && error.message === "APP_SECRET_UNAVAILABLE");
  assert.equal((await resolver.getOAuthRuntimeSettings()).GOOGLE_OAUTH_CLIENT_SECRET, "synthetic-version-2");
  clock = 1001; assert.equal((await resolver.getOAuthRuntimeSettings()).GOOGLE_OAUTH_CLIENT_SECRET, "synthetic-version-3");
});
test("invalid optional OAuth types cannot enable OAuth or break valid legacy DB/session settings", async () => {
  const malformed = { ...record, FEDERATED_AUTH_ENABLED: true, GOOGLE_OAUTH_CLIENT_SECRET: ["not-a-string"] };
  const resolver = createRuntimeSecretsResolver({ environment: { OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: async () => malformed });
  const settings = await resolver.getOAuthRuntimeSettings(); assert.equal(providerConfig("google", settings), null);
  assert.deepEqual(await resolver.getAppSecrets(), { DATABASE_URL: record.DATABASE_URL, AUTH_SECRET: record.AUTH_SECRET });
  assert.throws(() => pickApprovedSecrets([]), /APP_SECRET_INVALID/);
  for (const origin of [" https://app.example.test", "https://app.example.test/path", "https://app.example.test/#fragment", "https://user:pass@app.example.test", "http://app.example.test"]) {
    assert.equal(providerConfig("google", { ...record, NODE_ENV: "production", OAUTH_APP_ORIGIN: origin }), null);
  }
});
test("AWS adapter has a server-only boundary and no client module imports runtime credentials", () => {
  const adapter = readFileSync(new URL("../src/lib/secrets-aws.ts", import.meta.url), "utf8"); assert.match(adapter, /import "server-only"/);
  const facade = readFileSync(new URL("../src/lib/secrets.ts", import.meta.url), "utf8"); assert.match(facade, /typeof window/); assert.match(facade, /await import\("\.\/secrets-aws"\)/);
  const root = new URL("../src/", import.meta.url);
  function walk(path: string) { for (const entry of readdirSync(path, { withFileTypes: true })) { const target = join(path, entry.name); if (entry.isDirectory()) walk(target); else if (/\.tsx?$/.test(entry.name)) {
    const source = readFileSync(target, "utf8"); if (/^[\s]*["']use client["']/.test(source)) assert.doesNotMatch(source, /(?:from\s+["']|import\(["'])[^"']*(?:secrets|federated-auth-runtime)["']/);
  } } }
  walk(fileURLToPath(root));
});
