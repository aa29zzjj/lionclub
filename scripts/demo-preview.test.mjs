import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createDemoServer, isDemoFrontendPath } from "./demo-preview.mjs";
import { createDemoState } from "./demo-fixtures.mjs";

async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

test("frontend allowlist blocks hidden files, image proxy and encoded paths", () => {
  for (const path of ["/profile", "/profile/experience", "/admin/member-assignment", "/events/preview-event", "/_next/static/chunks/app/profile/page.js", "/_next/static/chunks/app/events/%5Bid%5D/page-hash.js"]) assert.equal(isDemoFrontendPath(path), true);
  for (const path of ["/.env", "/.git/config", "/api/me", "/_next/image", "/_next/data/x.json", "/_next/static/%2e%2e/api/me", "/profile%2fapi"]) assert.equal(isDemoFrontendPath(path), false);
});

test("proxy only forwards safe read-only frontend traffic without credentials", async t => {
  const requests = [];
  const upstream = http.createServer((request, response) => {
    requests.push({ path: request.url, method: request.method, headers: request.headers });
    response.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "real-session=do-not-forward" });
    response.end("<!doctype html><html><body>Fake upstream frontend</body></html>");
  });
  await listen(upstream);
  const proxy = createDemoServer({ role: "member", state: createDemoState(), frontendPort: upstream.address().port });
  const origin = await listen(proxy);
  t.after(async () => { await stop(proxy); await stop(upstream); });

  const page = await fetch(origin + "/profile", { headers: {
    Cookie: "real-session=secret", Authorization: "Bearer secret",
    "X-Middleware-Subrequest": "middleware", "X-Invoke-Path": "/api/me",
    "X-Matched-Path": "/api/me", "Accept-Language": "zh-TW",
  } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("set-cookie"), null);
  assert.match(await page.text(), /會員測試 · 合成資料/);
  for (const key of ["cookie", "authorization", "x-middleware-subrequest", "x-invoke-path", "x-matched-path"]) assert.equal(requests[0].headers[key], undefined);
  assert.equal(requests[0].headers["accept-language"], "zh-TW");

  for (const path of ["/api/not-real", "/.env", "/_next/image?url=https://example.test", "/_next/static/%2fapi/me"]) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
  assert.equal((await fetch(origin + "/profile", { method: "POST" })).status, 405);
  assert.equal((await fetch(origin + "/profile", { headers: { "Next-Action": "anything" } })).status, 405);
  assert.equal(requests.length, 1, "blocked APIs and writes never reach Next");
});

test("fixed roles survive query/referer changes and separate origins share only synthetic state", async t => {
  const state = createDemoState();
  const chair = createDemoServer({ role: "chair", state });
  const member = createDemoServer({ role: "member", state });
  const chairOrigin = await listen(chair);
  const memberOrigin = await listen(member);
  t.after(async () => { await stop(chair); await stop(member); });
  const memberMe = await (await fetch(memberOrigin + "/api/me?role=chair", { headers: { Referer: chairOrigin + "/profile" } })).json();
  const chairMe = await (await fetch(chairOrigin + "/api/me?role=member", { headers: { Referer: memberOrigin + "/profile" } })).json();
  assert.equal(memberMe.adminRoles.length, 0);
  assert.ok(chairMe.adminRoles.length >= 2);
  assert.ok(chairMe.adminRoles.every(grant => grant.role !== "SUPER"));
  assert.equal((await fetch(memberOrigin + "/api/admin/member-assignments")).status, 403);
  assert.equal((await fetch(memberOrigin + "/api/invites")).status, 403);
  assert.equal((await fetch(chairOrigin + "/api/admin/member-assignments")).status, 200);
  const skippedLogin = await fetch(memberOrigin + "/login", { redirect: "manual" });
  assert.equal(skippedLogin.status, 302);
  assert.equal(skippedLogin.headers.get("location"), "/profile");
  assert.match(await (await fetch(chairOrigin + "/demo")).text(), /分會長管理測試/);
});
