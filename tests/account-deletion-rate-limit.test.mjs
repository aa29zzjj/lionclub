import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

test("account deletion uses authenticated actor quotas before password verification", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "deletion-quota");
    const actor = sim.jar(), secondDevice = sim.jar(), otherActor = sim.jar();
    const client = sim.load("src/app/account/delete/client.ts");
    const transport = jar => async (path, init) => {
      const result = await sim.call(String(path), init?.method || "GET", init?.body ? JSON.parse(String(init.body)) : undefined, jar);
      return new Response(JSON.stringify(result.data), { status: result.status, headers: result.headers });
    };
    const actorHash = crypto.createHash("sha256").update(`account-deletion:actor:${s.member.user.id}`).digest("hex");
    const actorRows = () => sim.prisma.rateLimitAttempt.findMany({ where: { key: { startsWith: `v2:${actorHash}:` } } });

    await t.test("anonymous and untrusted-Origin requests cannot consume a member's actor quota", async () => {
      assert.equal((await sim.call("/api/me/account-deletion", "POST", { password: s.password })).status, 401);
      assert.equal((await sim.call("/api/me/account-deletion", "POST", { password: s.password }, actor, { origin: null })).status, 403);
      assert.equal((await actorRows()).length, 0);
      for (const [person, jar] of [[s.member, actor], [s.member, secondDevice], [s.friend, otherActor]]) {
        assert.equal((await sim.call("/api/auth/login", "POST", { email: person.email, password: s.password }, jar)).status, 200);
      }
      assert.equal((await sim.call("/api/me/account-deletion", "POST", { password: s.password }, actor, { origin: null })).status, 403);
      assert.equal((await actorRows()).length, 0);
    });

    await t.test("five wrong passwords count and a sixth attempt receives the shared 429 contract", async () => {
      for (let count = 0; count < 5; count++) {
        const response = await sim.call("/api/me/account-deletion", "POST", { password: "wrong-synthetic-password" }, actor);
        assert.equal(response.status, 401); assert.match(response.data.error, /密碼不正確/);
      }
      const response = await sim.call("/api/me/account-deletion", "POST", { password: s.password }, actor);
      assert.equal(response.status, 429); assert.equal(response.data.code, "RATE_LIMITED");
      const seconds = Number(response.headers.get("Retry-After"));
      assert.ok(Number.isInteger(seconds) && seconds > 0 && seconds <= 600);
      assert.equal(response.data.retryAfterSeconds, seconds); assert.ok(Number.isFinite(Date.parse(response.data.resetAt)));
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal((await actorRows())[0].count, 6);
      assert.ok(await sim.prisma.user.findUnique({ where: { id: s.member.user.id } }));
      assert.equal(await sim.prisma.accountDeletionCleanup.count({ where: { memberId: s.member.id } }), 0);
    });

    await t.test("changing devices does not bypass actor limits and the UI does not automatically retry", async () => {
      let calls = 0;
      const result = await client.deleteOwnAccount(s.password, async (path, init) => { calls++; return transport(secondDevice)(path, init); });
      assert.equal(result.kind, "rejected"); assert.equal(result.status, 429);
      assert.ok(result.retryAfterSeconds > 0); assert.equal(calls, 1);
      assert.equal((await actorRows())[0].count, 7);
    });

    await t.test("another actor on the same network can delete normally without affecting the throttled account", async () => {
      const result = await client.deleteOwnAccount(s.password, transport(otherActor));
      assert.equal(result.kind, "deleted"); assert.equal(result.cleanupPending, true);
      assert.equal(await sim.prisma.user.findUnique({ where: { id: s.friend.user.id } }), null);
      assert.ok(await sim.prisma.user.findUnique({ where: { id: s.member.user.id } }));
      assert.equal((await actorRows())[0].count, 7);
    });

    await t.test("malformed authenticated attempts consume the same quota without invoking deletion", async () => {
      const data = await seedScenario(sim, "deletion-invalid-payload"); const jar = sim.jar();
      assert.equal((await sim.call("/api/auth/login", "POST", { email: data.member.email, password: data.password }, jar)).status, 200);
      for (let count = 0; count < 5; count++) assert.equal((await sim.call("/api/me/account-deletion", "POST", {}, jar)).status, 400);
      assert.equal((await sim.call("/api/me/account-deletion", "POST", { password: data.password }, jar)).status, 429);
      assert.ok(await sim.prisma.user.findUnique({ where: { id: data.member.user.id } }));
      assert.equal(await sim.prisma.accountDeletionCleanup.count({ where: { memberId: data.member.id } }), 0);
    });
  } finally { await sim.close(); }
});
