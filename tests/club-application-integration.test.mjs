import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

test("a QR applicant chooses a different club and only scoped or global reviewers can activate it", async t => {
  const sim = await createSimulation({ environment: { REGISTRATION_CLUB_APPLICATION_ENABLED: "true" } });
  t.after(() => sim.close());
  const { ai, chair, member, friend, other, invite, password } = await seedScenario(sim, "club-application");
  await sim.prisma.adminRole.deleteMany({ where: { memberId: chair.id, scopeId: other.id } });
  await sim.prisma.adminRole.createMany({ data: [
    { memberId: friend.id, role: "SUPER_ADMIN", scopeType: "GLOBAL" },
    { memberId: member.id, role: "CLUB_PRESIDENT", scopeType: "club", scopeId: other.id },
  ] });
  const input = { token: invite.token, requestedOrganizationId: other.id, name: "入會測試", email: "incoming@example.test",
    password, privacyConsent: true, termsConsent: true, role: "SUPER_ADMIN" };
  const post = (body, jar) => sim.call("/api/auth/register", "POST", body, jar);
  assert.equal((await post({ ...input, requestedOrganizationId: undefined })).status, 400);
  assert.equal((await post({ ...input, requestedOrganizationId: "invalid" })).status, 400);
  assert.equal((await post({ ...input, token: undefined })).status, 400);
  const applicant = sim.jar();
  const applied = await post(input, applicant);
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.equal(applied.data.canLogin, false);
  assert.equal(applicant.has("lionclub_session"), false);
  const id = applied.data.memberId;
  const login = (email, jar) => sim.call("/api/auth/login", "POST", { email, password }, jar);
  assert.equal((await login(input.email, applicant)).status, 403);
  for (const [actor, visible, global] of [[chair, false, false], [member, true, false], [friend, true, true]]) {
    const jar = sim.jar();
    assert.equal((await login(actor.email, jar)).status, 200);
    const inbox = await sim.call("/api/admin/pending-members", "GET", undefined, jar);
    assert.equal(inbox.data.global, global);
    const pending = inbox.data.members.find(row => row.id === id);
    assert.equal(Boolean(pending), visible);
    const path = `/api/admin/pending-members/${id}`;
    if (!visible) assert.equal((await sim.call(path, "POST", { action: "approve" }, jar)).status, 409);
    if (global) {
      const approved = await sim.call(path, "POST", {
        action: "approve", expectedOrganizationId: other.id, expectedUpdatedAt: pending.updatedAt,
      }, jar);
      assert.equal(approved.status, 200, JSON.stringify(approved.data));
    }
  }
  const saved = await sim.prisma.member.findUniqueOrThrow({ where: { id }, include: { organizationAssignments: true, adminRoles: true } });
  assert.equal(saved.organizationId, other.id);
  assert.notEqual(saved.organizationId, ai.id);
  assert.equal(saved.organizationAssignmentStatus, "ASSIGNED");
  assert.ok(saved.memberNo);
  assert.equal(saved.organizationAssignments[0].assignedById, friend.id);
  assert.equal(saved.adminRoles.length, 0);
  assert.equal((await login(input.email, applicant)).status, 200);
});
