import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AttendanceError, checkInMember } from "../src/lib/event-attendance";
import { EventScopeError, canManageEvent, canPublishOfficialEvent, getEventPublishingOptions, resolveEventPublication, type EventScope } from "../src/lib/event-scope";
import { TransactionFake, type Row } from "./helpers/transaction-fake";

// In-memory service regressions only: no production accounts, DB, network or writes.
// PostgreSQL serializable interleavings still require staging integration tests.
const NOW = new Date("2026-10-15T02:00:00Z");
const PAST = new Date("2020-01-01T00:00:00Z");
const FUTURE = new Date("2100-01-01T00:00:00Z");
const organization = (id: string, level: string, parentId: string | null) => ({ id, name: id, level, parentId, isActive: true, validFrom: null, validTo: null });
const role = (name: string, scopeType: string, scopeId: string | null, extra: Row = {}) => ({ id: "grant", memberId: "actor", role: name, scopeType, scopeId, validFrom: PAST, validUntil: null, ...extra });
function fake(grants: Row[] = []) {
  return new TransactionFake({
    member: [{ id: "actor", name: "actor", organizationId: "club-a", status: "ACTIVE", deletedAt: null, role: "MEMBER", title: "總監" }, { id: "guest", organizationId: "club-a", name: "Guest", nickname: null, photoUrl: null, status: "ACTIVE", deletedAt: null }],
    organization: [organization("md", "md", null), organization("district-a", "district", "md"), organization("region-a", "region", "district-a"), organization("zone-a", "zone", "region-a"), organization("club-a", "club", "zone-a"), organization("club-b", "club", "zone-a"), organization("district-b", "district", "md"), organization("zone-b", "zone", "district-b"), organization("club-c", "club", "zone-b")],
    adminRole: grants,
    event: [{ id: "event", title: "Synthetic official", category: "CLUB_OFFICIAL", scope: "CLUB", createdById: "actor", hostOrganizationId: "club-a", capacity: null }],
    eventRegistration: [{ id: "registration", eventId: "event", memberId: "guest", status: "REGISTERED", checkedInAt: null, checkedInById: null }],
    eventCheckInAudit: [],
  });
}
const denied = (status: number) => (error: unknown) => error instanceof EventScopeError && error.status === status;

test("ordinary members and display titles/legacy Member.role never grant official CLUB publication", async () => {
  const db = fake();
  db.state.member[0].role = "SUPER_ADMIN";
  for (const scope of ["CLUB", "ZONE", "REGION", "DISTRICT"] as EventScope[]) {
    const target = { CLUB: "club-a", ZONE: "zone-a", REGION: "region-a", DISTRICT: "district-a" }[scope];
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", scope, target, NOW), false);
    await assert.rejects(resolveEventPublication(db.prisma, "actor", "club-a", { category: "CLUB_OFFICIAL", scope, hostOrganizationId: target }, NOW), denied(403));
  }
  assert.deepEqual(await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW), []);
  assert.deepEqual(await resolveEventPublication(db.prisma, "actor", "club-a", { category: "PERSONAL", scope: "CLUB" }, NOW), { category: "PERSONAL", scope: "CLUB", hostOrganizationId: "club-a" });
});

test("CLUB officers, vice presidents, presidents and finance need a matching active club grant", async t => {
  for (const name of ["CLUB_OFFICER", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT", "CLUB_FINANCE"]) await t.test(name, async () => {
    const db = fake([role(name, "club", "club-a")]);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-a", NOW), true);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-b", NOW), false);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "ZONE", "zone-a", NOW), false);
    assert.deepEqual(await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW), [{ scope: "CLUB", hostOrganizationId: "club-a", hostOrganizationName: "club-a" }]);
  });
});

test("every higher level resolves the actual host organization, not the member's club", async t => {
  for (const [name, type, id, scopes] of [
    ["ZONE_ADMIN", "zone", "zone-a", ["CLUB", "ZONE"]],
    ["REGION_ADMIN", "region", "region-a", ["CLUB", "ZONE", "REGION"]],
    ["DISTRICT_ADMIN", "district", "district-a", ["CLUB", "ZONE", "REGION", "DISTRICT"]],
    ["MULTIDISTRICT_ADMIN", "md", "md", ["CLUB", "ZONE", "REGION", "DISTRICT"]],
    ["SUPER_ADMIN", "GLOBAL", null, ["CLUB", "ZONE", "REGION", "DISTRICT"]],
  ] as const) await t.test(name, async () => {
    const db = fake([role(name, type, id)]);
    const options = await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW);
    assert.deepEqual(options.map(option => option.scope), scopes);
    for (const option of options) {
      const publication = await resolveEventPublication(db.prisma, "actor", "club-a", { category: "CLUB_OFFICIAL", scope: option.scope }, NOW);
      assert.equal(publication.hostOrganizationId, option.hostOrganizationId);
      if (option.scope !== "CLUB") assert.notEqual(publication.hostOrganizationId, "club-a");
    }
  });
});

test("wrong scopeId, scopeType, global shape and out-of-tree grants fail closed", async t => {
  for (const grant of [role("CLUB_PRESIDENT", "zone", "zone-a"), role("ZONE_ADMIN", "club", "club-a"), role("ZONE_ADMIN", "zone", "zone-b"), role("DISTRICT_ADMIN", "GLOBAL", null), role("DISTRICT_ADMIN", "district", null), role("SUPER_ADMIN", "club", "club-a"), role("SUPER_ADMIN", "GLOBAL", "md")]) await t.test(JSON.stringify(grant), async () => {
    const db = fake([grant]);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-a", NOW), false);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "DISTRICT", "district-a", NOW), false);
  });
});

test("scope classification and the host's level must agree even for SUPER_ADMIN", async () => {
  const db = fake([role("SUPER_ADMIN", "GLOBAL", null)]);
  for (const [scope, host] of [["DISTRICT", "club-a"], ["ZONE", "region-a"], ["CLUB", "district-a"], ["INVALID", "club-a"]]) {
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", scope, host, NOW), false);
    await assert.rejects(resolveEventPublication(db.prisma, "actor", "club-a", { category: "CLUB_OFFICIAL", scope, hostOrganizationId: host }, NOW), denied(scope === "INVALID" ? 400 : 403));
  }
});

test("future/expired grants including exact boundary do not authorize publication", async t => {
  for (const extra of [{ validFrom: FUTURE }, { validUntil: PAST }, { validUntil: NOW }]) await t.test(JSON.stringify(extra), async () => {
    const db = fake([role("CLUB_PRESIDENT", "club", "club-a", extra)]);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-a", NOW), false);
  });
  assert.equal(await canPublishOfficialEvent(fake([role("CLUB_PRESIDENT", "club", "club-a", { validFrom: NOW })]).prisma, "actor", "CLUB", "club-a", NOW), true);
});

test("experience-review district roles are not official event publishers", async () => {
  for (const name of ["DISTRICT_GOVERNOR", "DISTRICT_SECRETARY", "DISTRICT_CABINET"]) {
    const db = fake([role(name, "district", "district-a")]);
    assert.deepEqual(await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW), []);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "DISTRICT", "district-a", NOW), false);
  }
});

test("inactive, not-yet-valid, expired, missing and cyclic organizations are rejected", async t => {
  for (const [id, change] of [["club-a", { isActive: false }], ["zone-a", { isActive: false }], ["club-a", { validFrom: FUTURE }], ["district-a", { validTo: NOW }], ["zone-a", { parentId: "missing" }], ["zone-a", { parentId: "club-a" }]] as [string, Row][]) await t.test(`${id}:${JSON.stringify(change)}`, async () => {
    const db = fake([role("SUPER_ADMIN", "GLOBAL", null)]);
    Object.assign(db.state.organization.find(org => org.id === id)!, change);
    assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-a", NOW), false);
  });
});

test("inactive/deleted actor and a changed home organization are rechecked", async () => {
  const db = fake([role("SUPER_ADMIN", "GLOBAL", null)]);
  db.state.member[0].status = "SUSPENDED";
  assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-a", NOW), false);
  await assert.rejects(resolveEventPublication(db.prisma, "actor", "club-a", { category: "PERSONAL", scope: "CLUB" }, NOW), denied(409));
  db.state.member[0].status = "ACTIVE"; db.state.member[0].deletedAt = PAST;
  assert.equal(await canPublishOfficialEvent(db.prisma, "actor", "CLUB", "club-a", NOW), false);
  db.state.member[0].deletedAt = null; db.state.member[0].organizationId = "club-b";
  await assert.rejects(resolveEventPublication(db.prisma, "actor", "club-a", { category: "CLUB_OFFICIAL", scope: "CLUB" }, NOW), denied(409));
});

test("personal payload cannot claim another host or a higher official scope", async () => {
  const db = fake([role("SUPER_ADMIN", "GLOBAL", null)]);
  await assert.rejects(resolveEventPublication(db.prisma, "actor", "club-a", { category: "PERSONAL", scope: "DISTRICT" }, NOW), denied(400));
  await assert.rejects(resolveEventPublication(db.prisma, "actor", "club-a", { category: "PERSONAL", scope: "CLUB", hostOrganizationId: "club-b" }, NOW), denied(403));
});

test("a valid second-club grant can publish its actual host, not the home club", async () => {
  const db = fake([role("CLUB_PRESIDENT", "club", "club-b")]);
  assert.deepEqual(await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW), [{ scope: "CLUB", hostOrganizationId: "club-b", hostOrganizationName: "club-b" }]);
  assert.equal((await resolveEventPublication(db.prisma, "actor", "club-a", { category: "CLUB_OFFICIAL", scope: "CLUB" }, NOW)).hostOrganizationId, "club-b");
});

test("publishing options read grants once and cache shared hierarchy nodes", async () => {
  const ordinary = fake();
  assert.deepEqual(await getEventPublishingOptions(ordinary.prisma, "actor", "club-a", "club-a", NOW), []);
  assert.equal(ordinary.calls.length, 2);
  const db = fake([role("CLUB_PRESIDENT", "club", "club-a")]);
  await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW);
  assert.equal(db.calls.filter(call => call.table === "adminRole").length, 1);
  const ids = db.calls.filter(call => call.table === "organization").map(call => call.query.where?.id);
  assert.equal(ids.length, new Set(ids).size);
});

test("official authors cannot bypass revoked grants, unchanged scope or legacy wrong hosts", async () => {
  const db = fake([role("CLUB_PRESIDENT", "club", "club-a")]);
  const event = { createdById: "actor", hostOrganizationId: "club-a", category: "CLUB_OFFICIAL", scope: "CLUB" };
  assert.equal(await canManageEvent(db.prisma, "actor", event, NOW), true);
  db.state.adminRole[0].validUntil = NOW;
  assert.equal(await canManageEvent(db.prisma, "actor", event, NOW), false);
  assert.equal(await canManageEvent(db.prisma, "actor", { ...event, category: "PERSONAL" }, NOW), true);
  db.state.adminRole = [role("SUPER_ADMIN", "GLOBAL", null)];
  assert.equal(await canManageEvent(db.prisma, "actor", { ...event, scope: "DISTRICT" }, NOW), false);
});

test("official author cannot check in people after grant revocation; no attendance writes", async () => {
  const db = fake();
  const before = structuredClone(db.state);
  await assert.rejects(checkInMember(db.prisma, "actor", "event", { memberId: "guest", method: "manual", reason: "合成補登" }, (tx, actor, _id, event) => canManageEvent(tx, actor, event)), error => error instanceof AttendanceError && error.status === 403);
  assert.deepEqual(db.state, before);
});

test("valid official staff can check in once, but revocation stops subsequent access", async () => {
  const db = fake([role("CLUB_PRESIDENT", "club", "club-a")]);
  const input = { memberId: "guest", method: "manual" as const, reason: "合成補登" };
  const permission = (tx: Parameters<typeof canManageEvent>[0], actor: string, _id: string, event: Parameters<typeof canManageEvent>[2]) => canManageEvent(tx, actor, event);
  const result = await checkInMember(db.prisma, "actor", "event", input, permission);
  assert.equal(result.alreadyCheckedIn, false);
  assert.equal(db.state.eventCheckInAudit.length, 1);
  db.state.adminRole[0].validUntil = PAST;
  await assert.rejects(checkInMember(db.prisma, "actor", "event", input, permission), error => error instanceof AttendanceError && error.status === 403);
  assert.equal(db.state.eventCheckInAudit.length, 1);
});

test("transactional permission recheck rejects a grant revoked after the UI/options read", async () => {
  const db = fake([role("CLUB_PRESIDENT", "club", "club-a")]);
  assert.equal((await getEventPublishingOptions(db.prisma, "actor", "club-a", "club-a", NOW)).length, 1);
  db.state.adminRole[0].validUntil = NOW;
  await assert.rejects(db.prisma.$transaction(async tx => {
    const publication = await resolveEventPublication(tx, "actor", "club-a", { category: "CLUB_OFFICIAL", scope: "CLUB" }, NOW);
    await tx.event.create({ data: { title: "must not write", startAt: NOW, createdById: "actor", ...publication } });
  }, { isolationLevel: "Serializable" }), denied(403));
  assert.equal(db.state.event.length, 1);
});

test("API source contract keeps server checks inside transactions and does not restrict viewing/registering by publication scope", () => {
  const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const create = source("app/api/events/route.ts");
  const detail = source("app/api/events/[id]/route.ts");
  assert.match(create, /category \?\? "PERSONAL"/);
  assert.match(create, /\$transaction\(async tx => \{\s*const publication = await resolveEventPublication\(tx/);
  assert.match(detail, /canManageEvent\(tx, me\.id, event\)/);
  assert.match(detail, /resolveEventPublication\(tx/);
  assert.doesNotMatch(create, /if \(effectiveScope !== "CLUB"\)/);
  assert.match(source("app/api/events/[id]/registrations/route.ts"), /canManageEvent\(prisma, me\.id, event\)/);
  assert.match(source("app/api/events/[id]/check-in/route.ts"), /canManageEvent\(tx, actorId, event\)/);
  assert.doesNotMatch(source("app/api/events/[id]/register/route.ts"), /canPublishOfficialEvent|canManageEvent|EVENT_SCOPE_REQUIRED_ROLES/);
  assert.doesNotMatch(create.slice(0, create.indexOf("const bodySchema")), /where:\s*\{\s*(scope|category|hostOrganizationId)/);
});
