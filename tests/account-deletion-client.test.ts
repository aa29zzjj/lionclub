import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { POST } from "../src/app/api/me/account-deletion/route";

const root = new URL("../", import.meta.url);
const source = (file: string) => readFileSync(new URL(file, root), "utf8");

test("retired deletion POST never inspects body, auth, origin or proof; every call is 410", async () => {
  const invoke = POST as (request?: unknown) => Promise<Response>;
  const poison = new Proxy({}, { get() { throw Error("retired route must not inspect a request"); } });
  for (const request of [undefined, null, poison, new Request("https://example.test/api/me/account-deletion", { method: "POST", body: "not JSON", headers: { Origin: "https://hostile.example.test", Cookie: "lionclub_session=old; oauth_reauth=old" } })]) {
    const result = await invoke(request);
    assert.equal(result.status, 410); assert.equal(result.headers.get("Cache-Control"), "no-store");
    assert.equal(result.headers.has("Set-Cookie"), false);
    const data = await result.json();
    assert.equal(data.code, "ACCOUNT_DELETION_REMOVED"); assert.equal(data.accountDeleted, false); assert.equal(data.requestCreated, false);
    assert.match(data.error, /功能已移除/); assert.doesNotMatch(data.error, /已受理|已排程|刪除成功/);
  }
});

test("retired route has zero runtime dependencies or executable side-effect facilities", () => {
  const route = source("src/app/api/me/account-deletion/route.ts");
  assert.doesNotMatch(route, /^\s*import\b|\brequire\s*\(|\bimport\s*\(/m);
  assert.doesNotMatch(route, /getPrisma|getCurrentMember|getSession|consumeOAuth|revokeLinked|destroySession|fetch\s*\(|cookies\s*\(|process\.env|\.json\s*\(\s*\)/);
  assert.match(route, /status:\s*410/);
});

test("former destructive UI/client are removed; profile keeps linked identities and sessions only", () => {
  assert.equal(existsSync(new URL("src/components/AccountDeletionPanel.tsx", root)), false);
  assert.equal(existsSync(new URL("src/app/account/delete/client.ts", root)), false);
  const profile = source("src/components/ProfileSecurityTools.tsx");
  assert.match(profile, /<LinkedIdentitySettings\s*\/>/); assert.match(profile, /\/api\/me\/sessions\/revoke/);
  for (const file of ["src/components/ProfileSecurityTools.tsx", "src/components/PublicServicePage.tsx", "src/app/support/page.tsx", "src/app/privacy/page.tsx"]) {
    assert.doesNotMatch(source(file), /href=["']\/account\/delete|\/api\/me\/account-deletion|AccountDeletionPanel|deleteOwnAccount/);
  }
  const retiredPage = source("src/app/account/delete/page.tsx");
  assert.doesNotMatch(retiredPage, /["']use client["']|<form\b|<input\b|<button\b|fetch\s*\(|onClick|onSubmit|FederatedAuthButtons|AccountDeletionPanel/);
  assert.match(retiredPage, /此功能已移除/);
});

test("store readiness explicitly blocks retirement instead of passing existing filenames", () => {
  const metadata = JSON.parse(source("docs/app-store/METADATA.zh-Hant.json"));
  assert.equal(metadata.status, "blocked"); assert.equal(metadata.ready, false); assert.equal(metadata.release.submissionReady, false);
  assert.equal(metadata.review.accountDeletionImplemented, false); assert.ok(metadata.blockingReasons.includes("ACCOUNT_DELETION_REMOVED"));
  const checker = source("scripts/check-app-store-readiness.mjs");
  assert.match(checker, /record\(false, "帳號刪除政策阻斷"/);
  assert.doesNotMatch(checker, /checkAnyFile\("(?:外部帳號刪除頁實作|本人再驗證刪帳介面|帳號刪除 API 實作)"/);
});
