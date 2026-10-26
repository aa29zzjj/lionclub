import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real browser-contract helpers -> unchanged routes -> real Prisma/PGlite SQL.
// Transport/cookies/mail are adapters in this isolated process, never production.
test("external account deletion signs in, reauthenticates and reports only committed outcomes", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "external-delete");
    const browser = sim.jar(), otherDevice = sim.jar();
    const client = sim.load("src/app/account/delete/client.ts");
    const transport = jar => async (path, init) => {
      const result = await sim.call(String(path), init?.method || "GET", init?.body ? JSON.parse(String(init.body)) : undefined, jar);
      return new Response(JSON.stringify(result.data), { status: result.status, headers: result.headers });
    };
    const fetchForBrowser = transport(browser);

    await t.test("public resource can sign in without navigating away or performing a deletion", async () => {
      assert.equal(await client.readDeletionIdentity(fetchForBrowser), null);
      await client.loginForDeletion(s.member.email, s.password, fetchForBrowser);
      await client.loginForDeletion(s.member.email, s.password, transport(otherDevice));
      assert.equal((await client.readDeletionIdentity(fetchForBrowser)).id, s.member.id);
      assert.ok(await sim.prisma.user.findUnique({ where: { id: s.member.user.id } }));
    });

    await t.test("wrong confirmation password does not delete and a live role is a rejection, not a queued request", async () => {
      const wrong = await client.deleteOwnAccount("wrong-synthetic-password", fetchForBrowser);
      assert.equal(wrong.kind, "rejected"); assert.equal(wrong.status, 401);
      const role = await sim.prisma.adminRole.create({ data: { memberId: s.member.id, role: "CLUB_OFFICER", scopeType: "club", scopeId: s.ai.id, validFrom: new Date("2100-01-01") } });
      const rejected = await client.deleteOwnAccount(s.password, fetchForBrowser);
      assert.equal(rejected.kind, "rejected"); assert.equal(rejected.status, 409);
      assert.ok(await sim.prisma.user.findUnique({ where: { id: s.member.user.id } }));
      assert.equal(await sim.prisma.accountDeletionCleanup.count({ where: { memberId: s.member.id } }), 0);
      await sim.prisma.adminRole.delete({ where: { id: role.id } });
    });

    await t.test("future hosted activities also require handoff without falsely reporting success", async () => {
      const hosted = await sim.prisma.event.create({ data: { title: "合成交接活動", startAt: new Date(Date.now() + 86400000), hostOrganizationId: s.ai.id, createdById: s.member.id } });
      const rejected = await client.deleteOwnAccount(s.password, fetchForBrowser);
      assert.equal(rejected.kind, "rejected"); assert.equal(rejected.status, 409);
      assert.equal(await sim.prisma.accountDeletionCleanup.count({ where: { memberId: s.member.id } }), 0);
      await sim.prisma.event.delete({ where: { id: hosted.id } });
    });

    await t.test("confirmed success removes login, revokes another device and truthfully keeps media cleanup pending", async () => {
      const result = await client.deleteOwnAccount(s.password, fetchForBrowser);
      assert.equal(result.kind, "deleted"); assert.equal(result.cleanupPending, true);
      assert.equal(await sim.prisma.user.findUnique({ where: { id: s.member.user.id } }), null);
      assert.equal(await client.readDeletionIdentity(transport(otherDevice)), null);
      assert.equal(await client.readDeletionIdentity(fetchForBrowser), null);
      assert.equal(await sim.prisma.event.count({ where: { id: s.event.id } }), 1, "another member's event must survive");
      const repeated = await client.deleteOwnAccount(s.password, fetchForBrowser);
      assert.equal(repeated.kind, "rejected"); assert.equal(repeated.status, 401);
    });

    await t.test("lost successful response stays unknown and is never automatically resent", async () => {
      const scenario = await seedScenario(sim, "external-lost-response"); const jar = sim.jar();
      await client.loginForDeletion(scenario.member.email, scenario.password, transport(jar));
      let count = 0;
      const result = await client.deleteOwnAccount(scenario.password, async (path, init) => {
        count++; const response = await transport(jar)(path, init); assert.equal(response.status, 200);
        throw new Error("SIMULATED_RESPONSE_LOST_AFTER_COMMIT");
      });
      assert.equal(result.kind, "unknown"); assert.equal(count, 1);
      assert.equal(await sim.prisma.user.findUnique({ where: { id: scenario.member.user.id } }), null);
    });
  } finally { await sim.close(); }
});
