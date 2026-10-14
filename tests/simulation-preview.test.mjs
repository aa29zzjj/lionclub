import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createSimulationPreview } from "../scripts/simulation-preview.mjs";

test("local real-route preview is isolated, origin-guarded and never proxies API credentials", { timeout: 120000 }, async () => {
  const reserve = http.createServer(); await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const app = await createSimulationPreview({ port, frontendPort: 1 });
  await new Promise(resolve => app.server.listen(port, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${origin}/api/me`, { headers: { Cookie: "lionclub_session=real-token-never-use", Authorization: "Bearer real-token-never-use" } })).status, 401);
    assert.equal((await fetch(`${origin}/__simulation/login?role=chair`, { method: "POST", redirect: "manual" })).status, 403);
    assert.equal((await fetch(`${origin}/__simulation/login?role=chair`, { method: "POST", headers: { Origin: "https://evil.example.test" }, redirect: "manual" })).status, 403);
    const response = await fetch(`${origin}/__simulation/login?role=chair`, { method: "POST", headers: { Origin: origin }, redirect: "manual" });
    assert.equal(response.status, 303);
    const cookie = response.headers.get("set-cookie"); assert.match(cookie, /^lion_sim_device=[a-f0-9]{48}; HttpOnly; SameSite=Strict; Path=\/$/); assert.doesNotMatch(cookie, /eyJ/);
    const headers = { Cookie: cookie.split(";")[0], Origin: origin };
    const me = await fetch(`${origin}/api/me`, { headers }); assert.equal(me.status, 200); assert.equal((await me.json()).id, "chair-default");
    assert.equal((await fetch(`${origin}/api/not-allowlisted`, { headers })).status, 404);
    assert.equal((await fetch(`${origin}/api/me/avatar-upload`, { method: "POST", headers })).status, 501);
    assert.equal((await fetch(`${origin}/profile`, { headers: { "Next-Action": "do-not-forward" } })).status, 403);
    const hostileHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(`${origin}/api/me`, { headers: { Host: "evil.example.test" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      request.on("error", reject);
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(`${origin}/.env`, { headers })).status, 404);
    assert.equal(app.sim.inbox.length, 0);
  } finally { await app.close(); }
});
