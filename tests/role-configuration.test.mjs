import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

const expect = (result, status) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
// Real routes and SQL; only isolated in-memory PGlite and synthetic accounts.
test("manual review role configuration requires live GLOBAL SUPER, finite dates and exact scope", { timeout: 180000 }, async () => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "role-policy");
    const md = await sim.prisma.organization.create({ data: { name: "合成複合區", level: "md" } });
    const district = await sim.prisma.organization.create({ data: { name: "合成區", level: "district", parentId: md.id } });
    const region = await sim.prisma.organization.create({ data: { name: "合成專區", level: "region", parentId: district.id } });
    const zone = await sim.prisma.organization.create({ data: { name: "合成分區", level: "zone", parentId: region.id } });
    await sim.prisma.organization.update({ where: { id: s.ai.id }, data: { parentId: zone.id } });
    const jar = sim.jar(); expect(await sim.call("/api/auth/login", "POST", { email: s.chair.email, password: s.password }, jar), 200);
    const until = new Date(Date.now() + 30 * 86400000).toISOString();
    const body = { organizationId: district.id, memberId: s.member.id, role: "DISTRICT_GMT_COORDINATOR", validUntil: until };
    expect(await sim.call("/api/admin/roles", "POST", body, jar, { origin: null }), 403);
    expect(await sim.call("/api/admin/roles", "POST", body, jar), 403);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, organizationId: s.ai.id }, jar), 400);
    expect(await sim.call("/api/admin/roles", "POST", { organizationId: s.ai.id, memberId: s.chair.id, role: "CLUB_FINANCE" }, jar), 409);

    const clubGrant = expect(await sim.call("/api/admin/roles", "POST", { organizationId: s.ai.id, memberId: s.member.id, role: "CLUB_OFFICER" }, jar), 201).role;
    expect(await sim.call(`/api/admin/roles/${clubGrant.id}`, "DELETE", undefined, jar, { origin: null }), 403);
    expect(await sim.call(`/api/admin/roles/${clubGrant.id}`, "DELETE", undefined, jar), 200);
    await sim.prisma.adminRole.deleteMany({ where: { memberId: s.chair.id } });
    await sim.prisma.adminRole.create({ data: { memberId: s.chair.id, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: null } });

    const list = expect(await sim.call(`/api/admin/roles?organizationId=${district.id}`, "GET", undefined, jar), 200);
    assert.ok(list.assignableRoles.includes("DISTRICT_GMT_COORDINATOR"));
    assert.equal(list.assignableRoles.includes("SUPER_ADMIN"), false);
    assert.ok(list.members.some(member => member.id === s.member.id));
    expect(await sim.call("/api/admin/roles", "POST", { ...body, validUntil: undefined }, jar), 400);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, validUntil: "2020-01-01T00:00:00Z" }, jar), 400);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, validUntil: new Date(Date.now() + 800 * 86400000).toISOString() }, jar), 400);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, role: "SUPER_ADMIN" }, jar), 400);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, scopeType: "GLOBAL" }, jar), 400);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, memberId: s.chair.id }, jar), 409);
    expect(await sim.call("/api/admin/roles", "POST", { ...body, memberId: s.friend.id }, jar), 201);
    await sim.prisma.member.update({ where: { id: s.friend.id }, data: { organizationId: s.other.id } });
    expect(await sim.call("/api/admin/roles", "POST", { ...body, memberId: s.friend.id, role: "DISTRICT_CABINET" }, jar), 404);
    const moved = expect(await sim.call(`/api/admin/roles?organizationId=${district.id}`, "GET", undefined, jar), 200).members.find(member => member.id === s.friend.id);
    assert.equal(moved.eligibleForGrant, false); assert.ok(moved.adminRoles.length);
    const target = expect(await sim.call("/api/admin/roles", "POST", body, jar), 201).role;
    assert.equal(target.scopeType, "district"); assert.equal(target.scopeId, district.id);
    assert.equal(target.grantedById, s.chair.id); assert.equal(target.validUntil, until);
    expect(await sim.call("/api/admin/roles", "POST", body, jar), 409);
    assert.equal(await sim.prisma.adminRole.count({ where: { memberId: s.member.id, role: "DISTRICT_GMT_COORDINATOR" } }), 1);
    expect(await sim.call(`/api/admin/roles/${target.id}`, "DELETE", undefined, jar), 200);
    assert.ok((await sim.prisma.adminRole.findUnique({ where: { id: target.id } })).validUntil < new Date());

    await sim.prisma.adminRole.updateMany({ where: { memberId: s.chair.id }, data: { validUntil: new Date("2020-01-01") } });
    expect(await sim.call(`/api/admin/roles?organizationId=${district.id}`, "GET", undefined, jar), 403);
    expect(await sim.call("/api/admin/roles", "POST", body, jar), 403);
  } finally { await sim.close(); }
});
