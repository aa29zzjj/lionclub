import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { publicRuntimeEnvironment, renderPublicRuntimeEnvironment } from "../scripts/write-amplify-runtime-env.mjs";

test("Amplify build artifact receives exact nonsecret references/flags only, never OAuth or DB/session secrets", () => {
  const input = { OAUTH_APP_ORIGIN: "https://app.example.test/", OAUTH_RUNTIME_SECRETS_ENABLED: "true", APP_SECRETS_NAME: "approved/synthetic-app",
    FEDERATED_AUTH_ENABLED: "true", GOOGLE_OAUTH_FRESH_REAUTH_ENABLED: "false", GOOGLE_OAUTH_CLIENT_ID: "private-build-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-private-secret",
    DATABASE_URL: "postgresql://synthetic-secret", AUTH_SECRET: "synthetic-session-secret", OAUTH_TOKEN_ENCRYPTION_KEY: "synthetic-encryption-secret", AWS_SECRET_ACCESS_KEY: "synthetic-aws-secret" };
  const output = publicRuntimeEnvironment(input);
  assert.deepEqual(Object.keys(output).sort(), ["OAUTH_APP_ORIGIN", "OAUTH_RUNTIME_SECRETS_ENABLED", "APP_SECRETS_NAME", "FEDERATED_AUTH_ENABLED", "GOOGLE_OAUTH_FRESH_REAUTH_ENABLED"].sort());
  assert.equal(output.OAUTH_APP_ORIGIN, "https://app.example.test");
  const rendered = renderPublicRuntimeEnvironment(input);
  for (const name of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "DATABASE_URL", "AUTH_SECRET", "OAUTH_TOKEN_ENCRYPTION_KEY", "AWS_SECRET_ACCESS_KEY"]) {
    assert.equal(rendered.includes(name), false); assert.equal(rendered.includes(input[name]), false);
  }
  const amplify = readFileSync(new URL("../amplify.yml", import.meta.url), "utf8");
  assert.match(amplify, /node scripts\/write-amplify-runtime-env\.mjs --write/); assert.doesNotMatch(amplify, /env\s*\|\s*grep|GOOGLE_OAUTH_CLIENT_SECRET|AUTH_SECRET=/);
});
test("public build-env writer rejects newline interpolation, invalid flags and noncanonical origins", () => {
  for (const input of [{ APP_SECRETS_NAME: "approved\nGOOGLE_OAUTH_CLIENT_SECRET=bad" }, { PASSWORD_RESET_FROM_EMAIL: "bad${SECRET}@example.test" },
    { OAUTH_APP_ORIGIN: "https://app.example.test/path" }, { OAUTH_APP_ORIGIN: "https://app.example.test/#fragment" },
    { OAUTH_APP_ORIGIN: "https://user:pass@app.example.test" }, { FEDERATED_AUTH_ENABLED: " true" }]) assert.throws(() => publicRuntimeEnvironment(input));
});
