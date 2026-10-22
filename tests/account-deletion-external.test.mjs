import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real retired route + real Prisma/PGlite state. No external DB/mail/AWS.
test("retired account deletion cannot alter accounts, sessions, proof, quota or committed cleanup jobs", { timeout: 120000 }, async () => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "retired-delete");
    const jar = sim.jar();
    assert.equal((await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }, jar)).status, 200);
    await sim.prisma.oAuthTransaction.create({ data: { provider: "google", purpose: "reauth", stateHash: "retired-state", browserHash: "retired-browser", nonce: "retired-nonce", userId: s.member.user.id, sessionVersion: 1, expiresAt: new Date(Date.now() + 600000), completedAt: new Date(), reauthHash: "retired-proof", reauthExpiresAt: new Date(Date.now() + 300000) } });
    jar.set("lionclub_oauth_reauth", "synthetic-unused-proof-cookie");
    const job = await sim.prisma.accountDeletionCleanup.create({ data: { memberId: s.friend.id, avatarPrefix: `avatars/${s.friend.id}/`, status: "PENDING" } });
    const snapshot = async () => ({
      users: await sim.prisma.user.findMany({ orderBy: { id: "asc" } }),
      members: await sim.prisma.member.findMany({ orderBy: { id: "asc" } }),
      grants: await sim.prisma.adminRole.findMany({ orderBy: { id: "asc" } }),
      quota: await sim.prisma.rateLimitAttempt.findMany({ orderBy: { key: "asc" } }),
      proof: await sim.prisma.oAuthTransaction.findMany({ orderBy: { id: "asc" } }),
      cleanup: await sim.prisma.accountDeletionCleanup.findMany({ orderBy: { id: "asc" } }),
    });
    const before = await snapshot(); const cookies = [...jar]; const inbox = structuredClone(sim.inbox);
    for (const device of [undefined, jar]) for (const body of [undefined, {}, { password: s.password }, { password: "wrong", memberId: s.friend.id, confirmation: "DELETE_ACCOUNT" }]) {
      const result = await sim.call("/api/me/account-deletion", "POST", body, device, { origin: null });
      assert.equal(result.status, 410); assert.equal(result.data.code, "ACCOUNT_DELETION_REMOVED");
      assert.equal(result.data.accountDeleted, false); assert.equal(result.data.requestCreated, false);
    }
    assert.deepEqual(await snapshot(), before); assert.deepEqual([...jar], cookies); assert.deepEqual(sim.inbox, inbox);
    assert.equal((await sim.prisma.accountDeletionCleanup.findUnique({ where: { id: job.id } })).status, "PENDING");
    assert.equal((await sim.call("/api/me", "GET", undefined, jar)).status, 200);
  } finally { await sim.close(); }
});
