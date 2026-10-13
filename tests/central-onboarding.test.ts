import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  OnboardingError,
  assignMemberOrganization,
  assignmentSchema,
  centralRegistrationSchema,
  createCentralMember,
  getAssignmentScope,
  getIntakeOrganization,
  requiresRegistrationInvite,
} from "../src/lib/central-onboarding";

/*
 * No database, network, or test-library dependency. Run:
 * node --import tsx --test tests/central-onboarding.test.ts
 *
 * The fake exercises the real exported services with query matching and
 * copy-on-write transaction rollback. It is intentionally not a replacement
 * for PostgreSQL migration/unique-index/last-invite-slot concurrency tests.
 */
type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; select?: Row; include?: Row; take?: number };
type Table = "organization" | "member" | "user" | "adminRole" | "clubInvite" | "memberOrganizationAssignment";
type State = Record<Table, Row[]> & { friendships: Row[]; registrations: Row[]; experiences: Row[] };
type Call = { table: Table | "$transaction"; method: string; args: unknown };

const INTAKE = "ai-club";
const OTHER = "other-club";
const OUTSIDE = "outside-club";
const ACTOR = "actor";
const TARGET = "target";
const PAST = new Date("2020-01-01T00:00:00Z");
const FUTURE = new Date("2100-01-01T00:00:00Z");

const originalIntakeId = process.env.ONBOARDING_ORGANIZATION_ID;
before(() => { process.env.ONBOARDING_ORGANIZATION_ID = INTAKE; });
after(() => {
  if (originalIntakeId === undefined) delete process.env.ONBOARDING_ORGANIZATION_ID;
  else process.env.ONBOARDING_ORGANIZATION_ID = originalIntakeId;
});

function object(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function compare(value: unknown): number | string | boolean | null | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value == null) return value;
  throw new Error(`Unsupported fake comparator: ${String(value)}`);
}

function matches(row: Row, where: Row | undefined, state: State): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return Array.isArray(condition) && condition.some((part) => object(part) && matches(row, part, state));
    if (key === "AND") return Array.isArray(condition) && condition.every((part) => object(part) && matches(row, part, state));
    if (key === "organization" && object(condition)) {
      const relation = state.organization.find((org) => org.id === row.organizationId);
      return Boolean(relation && matches(relation, condition, state));
    }
    const value = row[key];
    if (!object(condition)) return value instanceof Date && condition instanceof Date
      ? value.getTime() === condition.getTime() : value === condition;
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === "mode") return true;
      if (operator === "in") return Array.isArray(expected) && expected.includes(value);
      if (operator === "startsWith") return typeof value === "string" && typeof expected === "string" && value.startsWith(expected);
      if (operator === "equals") return condition.mode === "insensitive" && typeof value === "string" && typeof expected === "string"
        ? value.toLowerCase() === expected.toLowerCase() : value === expected;
      const left = compare(value);
      const right = compare(expected);
      if (left == null || right == null || typeof left === "boolean" || typeof right === "boolean") return false;
      if (operator === "lte") return left <= right;
      if (operator === "gte") return left >= right;
      if (operator === "gt") return left > right;
      if (operator === "lt") return left < right;
      throw new Error(`Unsupported fake query operator: ${operator}`);
    });
  });
}

function baseState(): State {
  return {
    organization: [
      { id: "district", name: "300A-1", parentId: null, level: "district", isActive: true },
      { id: INTAKE, name: "AI臺科大獅子會", parentId: "district", level: "club", districtCode: "300A-1", isActive: true },
      { id: OTHER, name: "正式資料分會", parentId: "district", level: "club", districtCode: "300A-1", isActive: true },
      { id: OUTSIDE, name: "其他區分會", parentId: "another-district", level: "club", districtCode: "300B-1", isActive: true },
    ],
    member: [
      { id: ACTOR, name: "管理者", email: "actor@example.test", status: "ACTIVE", role: "MEMBER", organizationId: INTAKE, organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: 0 },
      { id: TARGET, name: "待核對會員", email: "target@example.test", status: "ACTIVE", role: "MEMBER", organizationId: INTAKE, organizationAssignmentStatus: "NEEDS_ASSIGNMENT", organizationAssignmentVersion: 0, memberNo: "300A-1-0042", declaredOrganizationName: "本人自填，不授權" },
    ],
    user: [],
    adminRole: [{ id: "actor-role", memberId: ACTOR, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: null, validFrom: PAST, validUntil: null }],
    clubInvite: [{ id: "invite", token: "valid-token", pin: "123456", organizationId: OTHER, issuedById: ACTOR, validFrom: PAST, validUntil: FUTURE, revokedAt: null, usageCount: 0, usageLimit: 5 }],
    memberOrganizationAssignment: [],
    friendships: [{ id: "friendship", requesterId: TARGET, addresseeId: ACTOR, status: "ACCEPTED" }],
    registrations: [{ id: "registration", memberId: TARGET, eventId: "event-in-original-club" }],
    experiences: [{ id: "experience", memberId: TARGET, organizationId: INTAKE, positionName: "過去職務" }],
  };
}

class FakePrisma {
  state = baseState();
  calls: Call[] = [];
  conflicts = 0;
  failCreate: "user" | "memberOrganizationAssignment" | undefined;
  failCode = "P2002";
  failConditionalMemberUpdate = false;

  private database(state: State, root: boolean): PrismaClient {
    const capture = (table: Table, method: string, query: Query) => this.calls.push({ table, method, args: structuredClone(query) });
    const rows = (table: Table, query: Query) => state[table].filter((row) => matches(row, query.where, state)).slice(0, query.take);
    const read = (table: Table, row: Row | undefined, query: Query) => {
      if (!row) return null;
      const result = structuredClone(row);
      if (table === "member" && query.include?.organization) result.organization = structuredClone(state.organization.find((org) => org.id === row.organizationId));
      return result;
    };
    const delegate = (table: Table) => ({
      findMany: async (query: Query = {}) => {
        capture(table, "findMany", query);
        return rows(table, query).map((row) => read(table, row, query));
      },
      findFirst: async (query: Query = {}) => {
        capture(table, "findFirst", query);
        return read(table, rows(table, query)[0], query);
      },
      findUnique: async (query: Query = {}) => {
        capture(table, "findUnique", query);
        return read(table, rows(table, query)[0], query);
      },
      create: async (query: Query) => {
        capture(table, "create", query);
        if (this.failCreate === table) throw Object.assign(new Error("Injected database failure"), { code: this.failCode });
        const data = structuredClone(query.data ?? {});
        const row: Row = { id: `${table}-${state[table].length + 1}`, ...data };
        if (table === "member") {
          row.organizationAssignmentVersion ??= 0;
          if (object(data.organizationAssignments) && object(data.organizationAssignments.create)) {
            state.memberOrganizationAssignment.push({ ...data.organizationAssignments.create, memberId: row.id });
          }
          delete row.organizationAssignments;
        }
        state[table].push(row);
        return structuredClone(row);
      },
      updateMany: async (query: Query) => {
        capture(table, "updateMany", query);
        if (table === "member" && this.failConditionalMemberUpdate) return { count: 0 };
        const updated = rows(table, query);
        for (const row of updated) {
          for (const [key, value] of Object.entries(query.data ?? {})) {
            row[key] = object(value) && typeof value.increment === "number"
              ? Number(row[key] ?? 0) + value.increment : structuredClone(value);
          }
        }
        return { count: updated.length };
      },
    });
    const db: Record<string, unknown> = Object.fromEntries((Object.keys(state) as (keyof State)[])
      .filter((key): key is Table => !["friendships", "registrations", "experiences"].includes(key))
      .map((key) => [key, delegate(key)]));
    if (root) db.$transaction = async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      this.calls.push({ table: "$transaction", method: "run", args: structuredClone(options) });
      if (this.conflicts > 0) {
        this.conflicts -= 1;
        throw Object.assign(new Error("Serializable conflict"), { code: "P2034" });
      }
      const draft = structuredClone(this.state);
      const result = await callback(this.database(draft, false) as unknown as Prisma.TransactionClient);
      this.state = draft;
      return result;
    };
    return db as unknown as PrismaClient;
  }

  get prisma(): PrismaClient { return this.database(this.state, true); }
  queries(table: Table, method: string) { return this.calls.filter((call) => call.table === table && call.method === method).map((call) => call.args as Query); }
  writes() { return this.calls.filter((call) => ["create", "updateMany"].includes(call.method)); }
}

const registration = (extra: Row = {}) => centralRegistrationSchema.parse({ name: " 新會員 ", email: " NEW@EXAMPLE.TEST ", password: "passw0rd!", ...extra });
const assignment = (extra: Row = {}) => assignmentSchema.parse({ organizationId: OTHER, expectedOrganizationId: INTAKE, expectedAssignmentVersion: 0, reason: "依正式會員名單核對", ...extra });
function errorStatus(status: number) {
  return (error: unknown) => error instanceof OnboardingError && error.status === status;
}
function target(fake: FakePrisma) { return fake.state.member.find((row) => row.id === TARGET)!; }
function districtRole(fake: FakePrisma) {
  fake.state.adminRole = [{ id: "actor-role", memberId: ACTOR, role: "DISTRICT_ADMIN", scopeId: "district", scopeType: "district", validFrom: PAST, validUntil: null }];
}

test("registration requires invitation by default; only explicit false opens registration", () => {
  assert.equal(requiresRegistrationInvite("true"), true);
  assert.equal(requiresRegistrationInvite(""), true);
  assert.equal(requiresRegistrationInvite("FALSE"), true);
  assert.equal(requiresRegistrationInvite("0"), true);
  assert.equal(requiresRegistrationInvite("false"), false);
  const previous = process.env.ONBOARDING_REQUIRE_INVITE;
  delete process.env.ONBOARDING_REQUIRE_INVITE;
  try { assert.equal(requiresRegistrationInvite(), true); }
  finally { if (previous === undefined) delete process.env.ONBOARDING_REQUIRE_INVITE; else process.env.ONBOARDING_REQUIRE_INVITE = previous; }
});

test("intake resolution requires one active exact club match and fails closed with configured ID", async () => {
  const fake = new FakePrisma();
  assert.equal((await getIntakeOrganization(fake.prisma, INTAKE)).id, INTAKE);
  assert.equal((await getIntakeOrganization(fake.prisma, "")).id, INTAKE);
  await assert.rejects(getIntakeOrganization(fake.prisma, "missing-id"), errorStatus(503));
  await assert.rejects(getIntakeOrganization(fake.prisma, "district"), errorStatus(503));
  fake.state.organization.push({ id: "ai-duplicate", name: "台科大AI獅子會", level: "club", isActive: true });
  await assert.rejects(getIntakeOrganization(fake.prisma, ""), errorStatus(503));
  assert.equal((await getIntakeOrganization(fake.prisma, INTAKE)).id, INTAKE);
  fake.state.organization = fake.state.organization.filter((org) => ![INTAKE, "ai-duplicate"].includes(String(org.id)));
  await assert.rejects(getIntakeOrganization(fake.prisma, ""), errorStatus(503));
  const inactive = new FakePrisma();
  inactive.state.organization.find((org) => org.id === INTAKE)!.isActive = false;
  await assert.rejects(getIntakeOrganization(inactive.prisma, INTAKE), errorStatus(503));
  assert.equal(fake.writes().length, 0);
});

test("registration schema normalizes fields, validates dates, strips role and assignment attacks", () => {
  const input = registration({ birthday: "2000-02-29", role: "SUPER_ADMIN", status: "ACTIVE", organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: 999, declaredOrganizationName: " 自填分會 " });
  assert.equal(input.email, "new@example.test");
  assert.equal(input.name, "新會員");
  assert.equal(input.declaredOrganizationName, "自填分會");
  assert.equal("role" in input, false);
  assert.equal("status" in input, false);
  assert.equal("organizationAssignmentStatus" in input, false);
  assert.equal("organizationAssignmentVersion" in input, false);
  for (const birthday of ["2001-02-29", "2026-13-01", "2026-01-32", "not-a-date", "2026-01-01T00:00:00Z"]) {
    assert.equal(centralRegistrationSchema.safeParse({ ...input, birthday }).success, false, birthday);
  }
  assert.equal(centralRegistrationSchema.safeParse({ ...input, password: "0204" }).success, false);
  assert.equal(centralRegistrationSchema.safeParse({ ...input, pin: "1234" }).success, false);
  const assignInput = assignment({ role: "SUPER_ADMIN", status: "ACTIVE", assignedById: TARGET, memberNo: "stolen-id", organizationAssignmentVersion: 100 });
  assert.deepEqual(Object.keys(assignInput).sort(), ["organizationId", "expectedOrganizationId", "expectedAssignmentVersion", "reason"].sort());
});

test("password validation protects bcrypt's 72-byte boundary for ASCII, Chinese and emoji", () => {
  const input = registration();
  for (const password of ["a".repeat(72), "密".repeat(24), "🦁".repeat(18)]) {
    assert.equal(new TextEncoder().encode(password).length, 72);
    assert.equal(centralRegistrationSchema.safeParse({ ...input, password }).success, true);
  }
  for (const password of ["a".repeat(73), "密".repeat(25), "🦁".repeat(19)]) {
    assert.ok(new TextEncoder().encode(password).length > 72);
    assert.equal(centralRegistrationSchema.safeParse({ ...input, password }).success, false);
  }
});

test("valid other-club invite creates active ordinary member only in intake, with initial history", async () => {
  const fake = new FakePrisma();
  const result = await createCentralMember(fake.prisma, registration({ token: "valid-token", organizationId: OTHER, birthday: "2000-02-29", declaredOrganizationName: "實際分會", tags: ["服務", "服務", "AI"] }), "hashed-password", true);
  assert.equal(result.member.organizationId, INTAKE);
  assert.equal(result.member.status, "ACTIVE");
  assert.equal(result.member.role, "MEMBER");
  assert.equal(result.member.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
  assert.equal(result.member.organizationAssignmentVersion, 0);
  assert.equal(result.member.memberNo, "300A-1-0043");
  assert.deepEqual(result.member.birthday, new Date("2000-02-29"));
  assert.equal(result.user.memberId, result.member.id);
  assert.equal(result.user.passwordHash, "hashed-password");
  assert.equal(fake.state.clubInvite[0].usageCount, 1);
  assert.equal(fake.state.adminRole.length, 1, "registration must not create a management grant");
  assert.equal(fake.state.memberOrganizationAssignment.length, 1);
  assert.deepEqual(fake.state.memberOrganizationAssignment[0], {
    memberId: result.member.id, toOrganizationId: INTAKE, toOrganizationName: "AI臺科大獅子會",
    previousAssignmentStatus: "NEEDS_ASSIGNMENT", assignmentStatus: "NEEDS_ASSIGNMENT",
    reason: "中央註冊：先開通平台，正式分會待名單核對",
  });
  assert.deepEqual(fake.queries("member", "create")[0].data?.tags, {
    connectOrCreate: ["服務", "AI"].map((name) => ({ where: { name }, create: { name } })),
  });
  assert.deepEqual(fake.calls.find((call) => call.table === "$transaction")?.args, { isolationLevel: "Serializable" });
});

test("PIN lookup remains invitation source only, never client-selected destination", async () => {
  const fake = new FakePrisma();
  const result = await createCentralMember(fake.prisma, registration({ pin: "123456", organizationId: OTHER }), "hash", true);
  assert.equal(result.member.organizationId, INTAKE);
  assert.equal(fake.state.clubInvite[0].usageCount, 1);
  const wrong = new FakePrisma();
  await assert.rejects(createCentralMember(wrong.prisma, registration({ pin: "123456", organizationId: OUTSIDE }), "hash", true), errorStatus(400));
  assert.equal(wrong.state.user.length, 0);
});

test("missing, invalid, expired, future, revoked, inactive, ambiguous and full invites cannot create accounts", async (t) => {
  const cases: { name: string; input: Row; arrange?: (fake: FakePrisma) => void }[] = [
    { name: "missing", input: {} },
    { name: "invalid token", input: { token: "unknown" } },
    { name: "source mismatch", input: { token: "valid-token", organizationId: OUTSIDE } },
    { name: "expired", input: { token: "valid-token" }, arrange: (fake) => { fake.state.clubInvite[0].validUntil = PAST; } },
    { name: "not yet valid", input: { token: "valid-token" }, arrange: (fake) => { fake.state.clubInvite[0].validFrom = FUTURE; } },
    { name: "revoked", input: { token: "valid-token" }, arrange: (fake) => { fake.state.clubInvite[0].revokedAt = PAST; } },
    { name: "inactive source", input: { token: "valid-token" }, arrange: (fake) => { fake.state.organization.find((org) => org.id === OTHER)!.isActive = false; } },
    { name: "full", input: { token: "valid-token" }, arrange: (fake) => { fake.state.clubInvite[0].usageCount = 5; } },
    { name: "ambiguous PIN", input: { pin: "123456", organizationId: OTHER }, arrange: (fake) => { fake.state.clubInvite.push({ ...fake.state.clubInvite[0], id: "invite-duplicate", token: "another-token" }); } },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const fake = new FakePrisma();
    item.arrange?.(fake);
    const before = structuredClone(fake.state);
    await assert.rejects(createCentralMember(fake.prisma, registration(item.input), "hash", true), errorStatus(400));
    assert.deepEqual(fake.state, before, "failure must not consume quota or leave partial accounts/history");
    assert.equal(fake.queries("user", "create").length, 0);
    assert.equal(fake.queries("member", "create").length, 0);
  });
});

test("transaction rolls back claimed invite and member/history if account creation fails", async () => {
  const fake = new FakePrisma();
  fake.failCreate = "user";
  const before = structuredClone(fake.state);
  await assert.rejects(createCentralMember(fake.prisma, registration({ token: "valid-token" }), "hash", true), errorStatus(409));
  assert.equal(fake.queries("clubInvite", "updateMany").length, 1, "quota was claimed inside aborted transaction");
  assert.equal(fake.queries("member", "create").length, 1, "member creation was attempted before failure");
  assert.deepEqual(fake.state, before);
});

test("explicit open mode permits no invite but still ignores client-selected club", async () => {
  const fake = new FakePrisma();
  const result = await createCentralMember(fake.prisma, registration({ organizationId: OUTSIDE }), "hash", requiresRegistrationInvite("false"));
  assert.equal(result.member.organizationId, INTAKE);
  assert.equal(result.member.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
  assert.equal(fake.queries("clubInvite", "updateMany").length, 0);
  const invalid = new FakePrisma();
  await assert.rejects(createCentralMember(invalid.prisma, registration({ token: "invalid" }), "hash", false), errorStatus(400), "open mode cannot bypass an explicitly provided invalid invite");
});

test("serializable registration conflicts retry three attempts, claim once, then return 409 on exhaustion", async () => {
  const fake = new FakePrisma();
  fake.conflicts = 2;
  await createCentralMember(fake.prisma, registration({ token: "valid-token" }), "hash", true);
  assert.equal(fake.calls.filter((call) => call.table === "$transaction").length, 3);
  assert.equal(fake.state.clubInvite[0].usageCount, 1);
  assert.equal(fake.state.user.length, 1);
  const exhausted = new FakePrisma();
  exhausted.conflicts = 3;
  const before = structuredClone(exhausted.state);
  await assert.rejects(createCentralMember(exhausted.prisma, registration({ token: "valid-token" }), "hash", true), errorStatus(409));
  assert.equal(exhausted.calls.filter((call) => call.table === "$transaction").length, 3);
  assert.deepEqual(exhausted.state, before);
});

test("case-insensitive duplicate User or Member email returns 409 without consuming quota", async (t) => {
  for (const table of ["user", "member"] as const) await t.test(table, async () => {
    const fake = new FakePrisma();
    fake.state[table].push({ id: "existing", email: "New@Example.Test" });
    const before = structuredClone(fake.state);
    await assert.rejects(createCentralMember(fake.prisma, registration({ token: "valid-token" }), "hash", true), errorStatus(409));
    assert.deepEqual(fake.state, before);
    assert.equal(fake.queries("clubInvite", "updateMany").length, 0);
    assert.deepEqual(fake.queries(table, "findFirst")[0].where, { email: { equals: "new@example.test", mode: "insensitive" } });
  });
});

test("only active SUPER_ADMIN is global; finance, officer, inactive and empty scopes are denied", async (t) => {
  const fake = new FakePrisma();
  assert.equal(await getAssignmentScope(fake.prisma, ACTOR), undefined);
  assert.equal(fake.queries("organization", "findMany").length, 0);
  for (const role of ["CLUB_FINANCE", "CLUB_OFFICER", "CLUB_PRESIDENT", "DISTRICT_ADMIN"]) await t.test(`${role} without authorized scope`, async () => {
    const denied = new FakePrisma();
    denied.state.adminRole[0] = { ...denied.state.adminRole[0], role, scopeId: ["CLUB_FINANCE", "CLUB_OFFICER"].includes(role) ? INTAKE : null };
    await assert.rejects(getAssignmentScope(denied.prisma, ACTOR), errorStatus(403));
  });
  const inactive = new FakePrisma();
  inactive.state.member.find((member) => member.id === ACTOR)!.status = "SUSPENDED";
  await assert.rejects(getAssignmentScope(inactive.prisma, ACTOR), errorStatus(403));
  for (const validity of [{ validFrom: FUTURE, validUntil: null }, { validFrom: PAST, validUntil: PAST }]) {
    const timedOut = new FakePrisma();
    timedOut.state.adminRole[0] = { ...timedOut.state.adminRole[0], ...validity };
    await assert.rejects(getAssignmentScope(timedOut.prisma, ACTOR), errorStatus(403));
  }
});

test("scope obeys validFrom/validUntil, club boundaries and cycle-safe descendant traversal", async () => {
  const fake = new FakePrisma();
  districtRole(fake);
  fake.state.adminRole.push(
    { id: "future-global", memberId: ACTOR, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: null, validFrom: FUTURE, validUntil: null },
    { id: "expired-global", memberId: ACTOR, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: null, validFrom: PAST, validUntil: PAST },
  );
  assert.deepEqual(new Set(await getAssignmentScope(fake.prisma, ACTOR)), new Set(["district", INTAKE, OTHER]));
  const query = fake.queries("adminRole", "findMany")[0].where!;
  assert.ok(object(query.validFrom) && query.validFrom.lte instanceof Date);
  assert.deepEqual(query.OR, [{ validUntil: null }, { validUntil: { gt: (query.validFrom as Row).lte } }]);
  fake.state.organization.find((org) => org.id === "district")!.parentId = INTAKE;
  assert.deepEqual(new Set(await getAssignmentScope(fake.prisma, ACTOR)), new Set(["district", INTAKE, OTHER]));
  assert.ok(fake.queries("organization", "findMany").length <= 5, "cycle must not loop indefinitely");
  const club = new FakePrisma();
  club.state.adminRole[0] = { ...club.state.adminRole[0], role: "CLUB_PRESIDENT", scopeType: "club", scopeId: INTAKE };
  assert.deepEqual(await getAssignmentScope(club.prisma, ACTOR), [INTAKE]);
});

test("assignment requires both source and destination scope, another actor and active member/club", async (t) => {
  const cases: { name: string; status: number; input?: Row; memberId?: string; arrange: (fake: FakePrisma) => void }[] = [
    { name: "unmanaged source", status: 404, arrange: (fake) => { target(fake).organizationId = OUTSIDE; } },
    { name: "unmanaged destination", status: 403, input: { organizationId: OUTSIDE }, arrange: () => {} },
    { name: "self assignment", status: 403, memberId: ACTOR, arrange: () => {} },
    { name: "pending member", status: 400, arrange: (fake) => { target(fake).status = "PENDING"; } },
    { name: "suspended member", status: 400, arrange: (fake) => { target(fake).status = "SUSPENDED"; } },
    { name: "inactive destination", status: 400, arrange: (fake) => { fake.state.organization.find((org) => org.id === OTHER)!.isActive = false; } },
    { name: "district destination", status: 400, input: { organizationId: "district" }, arrange: () => {} },
    { name: "missing member", status: 404, memberId: "missing", arrange: () => {} },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const fake = new FakePrisma();
    districtRole(fake);
    item.arrange(fake);
    const before = structuredClone(fake.state);
    await assert.rejects(assignMemberOrganization(fake.prisma, ACTOR, item.memberId ?? TARGET, assignment(item.input)), errorStatus(item.status));
    assert.deepEqual(fake.state, before);
    assert.equal(fake.writes().length, 0);
  });
});

test("assignment rejects stale source/version, conditional-update race and serializable conflicts", async (t) => {
  const cases: { name: string; input?: Row; arrange?: (fake: FakePrisma) => void }[] = [
    { name: "stale source", input: { expectedOrganizationId: OTHER } },
    { name: "stale version", input: { expectedAssignmentVersion: 1 } },
    { name: "conditional race", arrange: (fake) => { fake.failConditionalMemberUpdate = true; } },
    { name: "serialization conflict", arrange: (fake) => { fake.conflicts = 1; } },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const fake = new FakePrisma();
    item.arrange?.(fake);
    const before = structuredClone(fake.state);
    await assert.rejects(assignMemberOrganization(fake.prisma, ACTOR, TARGET, assignment(item.input)), errorStatus(409));
    assert.deepEqual(fake.state, before);
    assert.equal(fake.queries("memberOrganizationAssignment", "create").length, 0);
    assert.equal(fake.queries("clubInvite", "updateMany").length, 0);
  });
});

test("same-club confirmation increments version/history without revoking roles/invites; duplicate confirmation denied", async () => {
  const fake = new FakePrisma();
  const result = await assignMemberOrganization(fake.prisma, ACTOR, TARGET, assignment({ organizationId: INTAKE }));
  assert.equal(result.ok, true);
  assert.equal(target(fake).organizationAssignmentStatus, "ASSIGNED");
  assert.equal(target(fake).organizationAssignmentVersion, 1);
  assert.deepEqual(result.revokedRoleNames, []);
  assert.equal(result.revokedInviteCount, 0);
  assert.equal(fake.queries("adminRole", "updateMany").length, 0);
  assert.equal(fake.queries("clubInvite", "updateMany").length, 0);
  assert.equal(fake.state.memberOrganizationAssignment[0].fromOrganizationId, INTAKE);
  assert.equal(fake.state.memberOrganizationAssignment[0].toOrganizationId, INTAKE);
  assert.equal(fake.state.memberOrganizationAssignment[0].assignedById, ACTOR);
  const before = structuredClone(fake.state);
  await assert.rejects(assignMemberOrganization(fake.prisma, ACTOR, TARGET, assignment({ organizationId: INTAKE, expectedAssignmentVersion: 1 })), errorStatus(409));
  assert.deepEqual(fake.state, before);
});

test("SUPER_ADMIN may assign across district boundaries without transferring permissions", async () => {
  const fake = new FakePrisma();
  const result = await assignMemberOrganization(fake.prisma, ACTOR, TARGET, assignment({ organizationId: OUTSIDE }));
  assert.equal(result.organization.id, OUTSIDE);
  assert.equal(target(fake).organizationId, OUTSIDE);
  assert.equal(target(fake).memberNo, "300A-1-0042", "existing platform identifier is stable across district transfer");
  assert.equal(fake.queries("adminRole", "create").length, 0);
});

test("cross-club assignment revokes source-club grants/invites, records snapshots and preserves histories/identity", async () => {
  const fake = new FakePrisma();
  const original = structuredClone(target(fake));
  const preserved = structuredClone({ friendships: fake.state.friendships, registrations: fake.state.registrations, experiences: fake.state.experiences });
  const roles: Row[] = [
    { id: "source-officer", memberId: TARGET, role: "CLUB_OFFICER", scopeType: "club", scopeId: INTAKE, validFrom: PAST, validUntil: null },
    { id: "source-future", memberId: TARGET, role: "CLUB_PRESIDENT", scopeType: "club", scopeId: INTAKE, validFrom: FUTURE, validUntil: null },
    { id: "source-expired", memberId: TARGET, role: "CLUB_FINANCE", scopeType: "club", scopeId: INTAKE, validFrom: PAST, validUntil: PAST },
    { id: "other-club-role", memberId: TARGET, role: "CLUB_FINANCE", scopeType: "club", scopeId: OTHER, validFrom: PAST, validUntil: null },
    { id: "district-role", memberId: TARGET, role: "DISTRICT_ADMIN", scopeType: "district", scopeId: "district", validFrom: PAST, validUntil: null },
  ];
  fake.state.adminRole.push(...roles);
  fake.state.clubInvite.push(
    { ...fake.state.clubInvite[0], id: "issued-source", issuedById: TARGET, organizationId: INTAKE },
    { ...fake.state.clubInvite[0], id: "issued-other", issuedById: TARGET, organizationId: OTHER },
    { ...fake.state.clubInvite[0], id: "already-revoked", issuedById: TARGET, organizationId: INTAKE, revokedAt: PAST },
  );
  const result = await assignMemberOrganization(fake.prisma, ACTOR, TARGET, assignment());
  assert.equal(target(fake).organizationId, OTHER);
  assert.equal(target(fake).organizationAssignmentStatus, "ASSIGNED");
  assert.equal(target(fake).organizationAssignmentVersion, 1);
  assert.deepEqual(target(fake), { ...original, organizationId: OTHER, organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: 1 });
  assert.deepEqual({ friendships: fake.state.friendships, registrations: fake.state.registrations, experiences: fake.state.experiences }, preserved);
  assert.deepEqual(new Set(result.revokedRoleNames), new Set(["CLUB_OFFICER", "CLUB_PRESIDENT"]));
  assert.equal(result.revokedInviteCount, 1);
  for (const id of ["source-officer", "source-future"]) assert.ok(fake.state.adminRole.find((role) => role.id === id)!.validUntil instanceof Date);
  for (const id of ["other-club-role", "district-role"]) assert.equal(fake.state.adminRole.find((role) => role.id === id)!.validUntil, null);
  assert.deepEqual(fake.state.adminRole.find((role) => role.id === "source-expired")!.validUntil, PAST);
  assert.ok(fake.state.clubInvite.find((invite) => invite.id === "issued-source")!.revokedAt instanceof Date);
  assert.equal(fake.state.clubInvite.find((invite) => invite.id === "issued-other")!.revokedAt, null);
  assert.deepEqual(fake.state.clubInvite.find((invite) => invite.id === "already-revoked")!.revokedAt, PAST);
  assert.equal(fake.queries("adminRole", "create").length, 0, "never move management permission to target club");
  assert.deepEqual(fake.queries("member", "updateMany")[0].data, { organizationId: OTHER, organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: { increment: 1 } });
  const history = fake.state.memberOrganizationAssignment[0];
  assert.deepEqual(history, {
    id: "memberOrganizationAssignment-1", memberId: TARGET, fromOrganizationId: INTAKE, fromOrganizationName: "AI臺科大獅子會",
    toOrganizationId: OTHER, toOrganizationName: "正式資料分會", previousAssignmentStatus: "NEEDS_ASSIGNMENT", assignmentStatus: "ASSIGNED",
    assignedById: ACTOR, reason: "依正式會員名單核對", revokedRoleNames: ["CLUB_OFFICER", "CLUB_PRESIDENT"], revokedInviteCount: 1,
  });
});

test("audit-history failure rolls back organization/version and source authority revocations", async () => {
  const fake = new FakePrisma();
  fake.state.adminRole.push({ id: "source-role", memberId: TARGET, role: "CLUB_PRESIDENT", scopeType: "club", scopeId: INTAKE, validFrom: PAST, validUntil: null });
  fake.state.clubInvite.push({ ...fake.state.clubInvite[0], id: "source-invite", issuedById: TARGET, organizationId: INTAKE });
  fake.failCreate = "memberOrganizationAssignment";
  fake.failCode = "P2034";
  const before = structuredClone(fake.state);
  await assert.rejects(assignMemberOrganization(fake.prisma, ACTOR, TARGET, assignment()), errorStatus(409));
  assert.equal(fake.queries("member", "updateMany").length, 1);
  assert.equal(fake.queries("adminRole", "updateMany").length, 1);
  assert.equal(fake.queries("clubInvite", "updateMany").length, 1);
  assert.deepEqual(fake.state, before);
});
