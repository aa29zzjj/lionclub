import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { createSimulation } from "./helpers/simulation.mjs";

test("native discovery is versioned, secret-free and disabled before credential or SQL dependencies", async () => {
  const sim = await createSimulation();
  try {
    await sim.database.exec('DROP TABLE "EmailActionChallenge"; DROP TABLE "OAuthTransaction"; DROP TABLE "FederatedIdentity";');
    const result = await sim.call("/api/mobile/auth/providers");
    assert.equal(result.status, 200); assert.equal(result.data.protocolVersion, 2);
    assert.equal(result.data.providers.length, 2); assert.ok(result.data.providers.every(p => p.enabled === false));
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.doesNotMatch(JSON.stringify(result.data), /PRIVATE KEY|clientSecret|DATABASE_URL|AUTH_SECRET/);
  } finally { await sim.close(); }
});

test("native discovery uses actual provider gates and never enables Apple without its security method", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const sim = await createSimulation({ environment: {
    MOBILE_OAUTH_V2_ENABLED: "true", FEDERATED_AUTH_ENABLED: "true", APPLE_OAUTH_ENABLED: "true",
    GOOGLE_OAUTH_CLIENT_ID: "synthetic-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-secret",
    APPLE_OAUTH_CLIENT_ID: "com.example.synthetic", APPLE_OAUTH_TEAM_ID: "SYNTHETIC1", APPLE_OAUTH_KEY_ID: "SYNTHETIC2",
    APPLE_OAUTH_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64"), EMAIL_ACTION_REAUTH_ENABLED: "false",
  } });
  try {
    const googleOnly = await sim.call("/api/mobile/auth/providers");
    assert.equal(googleOnly.status, 200); assert.deepEqual(googleOnly.data.providers.map(p => [p.id, p.enabled]), [["google", true], ["apple", false]]);
    sim.env.EMAIL_ACTION_REAUTH_ENABLED = "true";
    const both = await sim.call("/api/mobile/auth/providers");
    assert.deepEqual(both.data.providers.map(p => [p.id, p.enabled]), [["google", true], ["apple", true]]);
    assert.doesNotMatch(JSON.stringify(both.data), /synthetic-secret|PRIVATE KEY|OAUTH_TOKEN_ENCRYPTION/);
    sim.env.MOBILE_OAUTH_V2_ENABLED = "false";
    assert.ok((await sim.call("/api/mobile/auth/providers")).data.providers.every(p => !p.enabled));
  } finally { await sim.close(); }
});
