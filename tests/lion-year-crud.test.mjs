import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Actual API handlers and Prisma SQL over disposable in-memory PGlite. The
// simulation replaces cookies/mail and never loads production DB/AWS secrets.
test("experience API CRUD preserves known/unknown month and inclusive annual terms", { timeout: 180000 }, async () => {
  const sim = await createSimulation();
  const check = (result, expected) => { assert.equal(result.status, expected, JSON.stringify(result.data)); return result.data; };
  try {
    const s = await seedScenario(sim);
    const jar = sim.jar();
    check(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }, jar), 200);
    const body = { kind: "membership", level: "club", positionCode: "membership_joined", organizationName: s.ai.name,
      startYear: 2026, startMonth: 6, datePrecision: "month", isCurrent: true, visibility: "members" };
    const created = check(await sim.call("/api/me/experiences", "POST", body, jar), 201).experience;
    const path = `/api/me/experiences/${created.id}`;
    assert.equal(created.startMonth, 6);
    assert.equal(check(await sim.call("/api/me/experiences", "GET", undefined, jar), 200).experiences.find(e => e.id === created.id).startMonth, 6);
    const legacyBody = { ...body }; delete legacyBody.startMonth;
    assert.equal(check(await sim.call(path, "PATCH", legacyBody, jar), 200).experience.startMonth, 6);
    assert.equal(check(await sim.call(path, "PATCH", { ...body, startMonth: 7 }, jar), 200).experience.startMonth, 7);
    const unknown = check(await sim.call(path, "PATCH", { ...body, startMonth: null }, jar), 200).experience;
    assert.equal(unknown.startMonth, null); assert.equal(unknown.datePrecision, "approximate");
    check(await sim.call(path, "PATCH", { ...body, startMonth: 13 }, jar), 400);
    const term = check(await sim.call("/api/me/experiences", "POST", { ...body, kind: "position", positionCode: "club_secretary", startYear: 2024, endYear: 2026, datePrecision: "lions-year" }, jar), 201).experience;
    assert.equal(term.startMonth, null); assert.equal(term.endYear, 2026); assert.equal(term.isCurrent, true);
    const chair = sim.jar(); check(await sim.call("/api/auth/login", "POST", { email: s.chair.email, password: s.password }, chair), 200);
    const reviewPath = `/api/admin/pending-experiences/${term.id}`;
    check(await sim.call(reviewPath, "POST", { action: "verify", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }, chair), 409);
    check(await sim.call(reviewPath, "POST", { action: "verify", expectedUpdatedAt: term.updatedAt }, chair), 200);
    check(await sim.call(reviewPath, "POST", { action: "reject", expectedUpdatedAt: term.updatedAt, reviewReason: "重複操作" }, chair), 404);
    check(await sim.call(`/api/me/experiences/${term.id}`, "PATCH", body, jar), 409);
    check(await sim.call(`/api/me/experiences/${term.id}`, "DELETE", undefined, jar), 409);
    check(await sim.call(path, "PATCH", body, chair), 404);
    check(await sim.call(path, "DELETE", undefined, jar), 200);
    assert.equal(check(await sim.call("/api/me/experiences", "GET", undefined, jar), 200).experiences.some(e => e.id === created.id), false);
  } finally { await sim.close(); }
});
