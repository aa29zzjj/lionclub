import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real routes and Prisma SQL against test-owned PGlite only. External network,
// ambient credentials and production email are forbidden by the simulation.
test("club invitation target requires live exact scoped authority and preserves 72-hour QR expiry", { timeout: 120000 }, async () => {
  const sim = await createSimulation();
  try {
    const seed = await seedScenario(sim, "shengdi-invite-authorization");
    const special = await sim.prisma.organization.create({ data: { id: "seed-club-300A-1-聖迪獅子會", name: "聖迪獅子會", level: "club", districtCode: "300A-1" } });
    const jar = sim.jar();
    let result = await sim.call("/api/auth/login", "POST", { email: seed.chair.email, password: seed.password }, jar);
    assert.equal(result.status, 200);

    result = await sim.call("/api/invites", "GET", undefined, jar);
    assert.equal(result.status, 200);
    assert.equal(result.data.organization.id, seed.ai.id);
    assert.equal(result.headers.get("cache-control"), "no-store");

    // This chair has an explicit president grant for the other club.
    result = await sim.call(`/api/invites?organizationId=${encodeURIComponent(seed.other.id)}`, "GET", undefined, jar);
    assert.equal(result.status, 200);
    assert.equal(result.data.organization.id, seed.other.id);

    result = await sim.call("/api/invites", "POST", { organizationId: special.id, validDays: 3 }, jar);
    assert.equal(result.status, 403);
    await sim.prisma.adminRole.create({ data: { memberId: seed.chair.id, role: "SUPER_ADMIN", scopeType: "club", scopeId: seed.ai.id } });
    result = await sim.call("/api/invites", "POST", { organizationId: special.id, validDays: 3 }, jar);
    assert.equal(result.status, 403, "A malformed SUPER grant must not confer global invitation access");

    await sim.prisma.adminRole.create({ data: { memberId: seed.chair.id, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: null } });
    result = await sim.call("/api/invites", "POST", { organizationId: special.id, validDays: 3 }, jar);
    assert.equal(result.status, 200);
    assert.equal(result.data.organization.id, special.id);
    assert.equal(result.data.registrationMode, "direct_club");
    assert.equal(result.data.approvalRequired, false);
    assert.equal(result.data.invite.organization.id, special.id);
    assert.equal(result.data.invite.organization.name, "聖迪獅子會");
    assert.equal("pin" in result.data.invite, false);
    assert.equal(Date.parse(result.data.invite.validUntil) - Date.parse(result.data.invite.validFrom), 72 * 60 * 60 * 1000);
    assert.equal(new URL(result.data.registerUrl).searchParams.get("org"), special.id);
    assert.equal(new URL(result.data.registerUrl).searchParams.get("token"), result.data.invite.token);
    assert.equal(result.headers.get("cache-control"), "no-store");

    result = await sim.call("/api/invites", "POST", { validDays: 3 }, jar, { origin: "https://evil.example.test" });
    assert.equal(result.status, 403);
    result = await sim.call("/api/invites", "POST", { validDays: 3 }, jar, { origin: null });
    assert.equal(result.status, 403);

    await sim.prisma.organization.update({ where: { id: special.id }, data: { isActive: false } });
    result = await sim.call(`/api/invites?organizationId=${encodeURIComponent(special.id)}`, "GET", undefined, jar);
    assert.equal(result.status, 403, "Even GLOBAL authority cannot issue invites for an inactive target");

    await sim.prisma.adminRole.deleteMany({ where: { memberId: seed.chair.id } });
    await sim.prisma.adminRole.create({ data: { memberId: seed.chair.id, role: "CLUB_OFFICER", scopeType: "club", scopeId: seed.ai.id } });
    result = await sim.call("/api/invites", "POST", {}, jar);
    assert.equal(result.status, 200, "Existing own-club officers retain their default invitation workflow");
    assert.equal(result.data.organization.id, seed.ai.id);
    assert.equal(result.data.registrationMode, "central");
    result = await sim.call(`/api/invites?organizationId=${encodeURIComponent(seed.other.id)}`, "GET", undefined, jar);
    assert.equal(result.status, 403);

    await sim.prisma.organization.update({ where: { id: seed.ai.id }, data: { isActive: false } });
    result = await sim.call("/api/invites", "POST", {}, jar);
    assert.equal(result.status, 403);
  } finally {
    await sim.close();
  }
});
