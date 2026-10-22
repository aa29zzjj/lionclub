import assert from "node:assert/strict";
// Historical internal anonymization/cleanup maintenance, not a public self-service
// feature. The retired public POST is separately required to return 410 unchanged.
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { anonymizeAccount, AccountDeletionError, AVATAR_CLEANUP_DELAY_MS, processAccountDeletionCleanup } from "../src/lib/account-deletion";
import { AttendanceError, attendanceCounts, checkInInputSchema, checkInMember, toggleEventRegistration } from "../src/lib/event-attendance";
import { bulkCommitSchema, commitBulkAssignments, previewBulkAssignments, resolveBulkMemberByEmail } from "../src/lib/bulk-member-assignment";
import { OnboardingError } from "../src/lib/central-onboarding";
import { TransactionFake, type Row } from "./helpers/transaction-fake";

// Real services with copy-on-write fake transactions. Never imports a worker/S3
// adapter, queries AWS/DB, or substitutes for real PostgreSQL concurrency tests.
const PAST = new Date("2020-01-01");
const FUTURE = new Date("2100-01-01");
const person = (id: string, extra: Row = {}) => ({ id, name: id, nickname: null, email: `${id}@example.test`, status: "ACTIVE", deletedAt: null, organizationId: "club-a", organizationAssignmentStatus: "NEEDS_ASSIGNMENT", organizationAssignmentVersion: 0, photoUrl: null, ...extra });
function fake() {
  return new TransactionFake({
    member: [person("actor"), person("guest", { nickname: "Guest", phone: "private-phone", bio: "private-bio", memberNo: "A-0001", birthday: PAST, title: "private-title", lineUserId: "private-line", tags: ["private-tag"] }), person("other")],
    user: [{ id: "user", memberId: "guest", passwordHash: "test-hash" }],
    organization: [{ id: "club-a", name: "A", level: "club", isActive: true, parentId: null }, { id: "club-b", name: "B", level: "club", isActive: true, parentId: null }],
    adminRole: [{ id: "global", memberId: "actor", role: "SUPER_ADMIN", scopeId: null, validFrom: PAST, validUntil: null }],
    event: [{ id: "event", createdById: "actor", hostOrganizationId: "club-a", category: "PERSONAL", scope: "CLUB", startAt: PAST, capacity: 2 }],
    eventRegistration: [{ id: "registration", eventId: "event", memberId: "guest", status: "REGISTERED", checkedInAt: null, checkedInById: null, registeredAt: PAST }],
    eventCheckInAudit: [], accountDeletionCleanup: [], memberExperience: [], friendship: [], memberBlock: [], eventNotification: [], eventNotificationRecipient: [], clubInvite: [], memberOrganizationAssignment: [],
  });
}
const deletion = { memberId: "guest", userId: "user", expectedPasswordHash: "test-hash", bucket: "synthetic-avatar-bucket", region: "ap-northeast-1" };
const hasStatus = (type: typeof AccountDeletionError | typeof AttendanceError | typeof OnboardingError, status: number) => (error: unknown) => error instanceof type && error.status === status;

test("deletion blocks permanent, finite active and scheduled future grants with no partial writes", async t => {
  for (const role of [{ validFrom: PAST, validUntil: null }, { validFrom: PAST, validUntil: FUTURE }, { validFrom: FUTURE, validUntil: null }]) await t.test(String(role.validUntil), async () => {
    const db = fake(); db.state.adminRole.push({ id: "guest-role", memberId: "guest", ...role });
    const before = structuredClone(db.state);
    await assert.rejects(anonymizeAccount(db.prisma, deletion), hasStatus(AccountDeletionError, 409));
    assert.deepEqual(db.state, before);
  });
});

test("deletion rechecks upcoming events and current password inside serializable transaction", async () => {
  const db = fake(); db.state.event[0] = { ...db.state.event[0], createdById: "guest", startAt: FUTURE };
  await assert.rejects(anonymizeAccount(db.prisma, deletion), hasStatus(AccountDeletionError, 409));
  db.state.event[0].startAt = PAST; db.state.user[0].passwordHash = "changed-after-password-check";
  await assert.rejects(anonymizeAccount(db.prisma, deletion), hasStatus(AccountDeletionError, 409));
  assert.equal(db.state.member.find(row => row.id === "guest")!.deletedAt, null);
});

test("deletion anonymizes private data, revokes login/invites and preserves shared event/audit/attendance", async () => {
  const db = fake(); db.state.event[0].createdById = "guest";
  db.state.eventRegistration.push({ id: "other-registration", eventId: "event", memberId: "other", status: "REGISTERED", checkedInAt: PAST, checkedInById: "guest" }, { id: "guest-signed", eventId: "past-event", memberId: "guest", status: "REGISTERED", checkedInAt: PAST });
  db.state.memberExperience.push({ id: "private", memberId: "guest" }, { id: "other", memberId: "other" });
  db.state.friendship.push({ requesterId: "guest", addresseeId: "other" }, { requesterId: "other", addresseeId: "guest" });
  db.state.memberBlock.push({ blockerId: "guest", blockedId: "other" }, { blockerId: "other", blockedId: "guest" });
  db.state.eventNotification.push({ id: "sent", senderId: "guest", message: "private authored text", eventId: "event" });
  db.state.eventNotificationRecipient.push({ recipientId: "guest" }, { recipientId: "other", notificationId: "sent" });
  db.state.clubInvite.push({ issuedById: "guest", revokedAt: null }, { issuedById: "other", revokedAt: null });
  db.state.memberOrganizationAssignment.push({ memberId: "guest", reason: "restricted historical audit" });
  const result = await anonymizeAccount(db.prisma, deletion);
  assert.equal(result.accountDeleted, true); assert.equal(result.cleanupPending, true);
  const member = db.state.member.find(row => row.id === "guest")!;
  assert.equal(member.name, "已刪除會員"); assert.equal(member.status, "SUSPENDED"); assert.ok(member.deletedAt instanceof Date);
  for (const field of ["nickname", "birthday", "photoUrl", "title", "bio", "email", "phone", "memberNo", "lineUserId", "emailVerifiedAt", "declaredOrganizationName"]) assert.equal(member[field], null, field);
  assert.deepEqual(member.tags, []); assert.equal(db.state.user.length, 0);
  assert.equal(db.state.event[0].createdById, "guest"); assert.equal(db.state.event.length, 1);
  assert.equal(db.state.eventRegistration.find(row => row.id === "other-registration")!.checkedInAt instanceof Date, true);
  assert.equal(db.state.eventRegistration.find(row => row.id === "guest-signed")!.status, "REGISTERED");
  assert.equal(db.state.eventRegistration.find(row => row.id === "registration")!.status, "CANCELLED");
  assert.deepEqual(db.state.memberExperience.map(row => row.id), ["other"]); assert.equal(db.state.friendship.length, 0); assert.equal(db.state.memberBlock.length, 0);
  assert.equal(db.state.eventNotificationRecipient.length, 1); assert.equal(db.state.eventNotificationRecipient[0].recipientId, "other");
  assert.notEqual(db.state.eventNotification[0].message, "private authored text");
  assert.equal(db.state.memberOrganizationAssignment[0].reason, "restricted historical audit");
  assert.ok(db.state.clubInvite[0].revokedAt instanceof Date); assert.equal(db.state.clubInvite[1].revokedAt, null);
  assert.equal(db.state.accountDeletionCleanup[0].avatarPrefix, "avatars/guest/");
  assert.equal(db.calls.some(call => call.table === "member" && call.method === "delete"), false);
});

test("cleanup task creation failure rolls back anonymization and deletion", async () => {
  const db = fake(); db.failCreateTable = "accountDeletionCleanup"; const before = structuredClone(db.state);
  await assert.rejects(anonymizeAccount(db.prisma, deletion)); assert.deepEqual(db.state, before);
});

test("avatar cleanup persists safe failure, retries lease, completes idempotently and never deletes events", async () => {
  const db = fake(); const deletionResult = await anonymizeAccount(db.prisma, deletion);
  let failStorage = true; let keys = ["avatars/guest/a.png", "avatars/guest/b.webp"]; const deleted: string[] = [];
  const storage = {
    async listKeys({ prefix }: { prefix: string }) { assert.equal(prefix, "avatars/guest/"); if (failStorage) throw new Error("secret AWS details not persisted"); return [...keys]; },
    async deleteKeys(input: { keys: string[] }) { deleted.push(...input.keys); keys = keys.filter(key => !input.keys.includes(key)); },
  };
  const first = await processAccountDeletionCleanup(db.prisma, deletionResult.cleanupId, storage);
  assert.equal(first.completed, false); assert.equal(db.state.accountDeletionCleanup[0].status, "FAILED"); assert.equal(db.state.accountDeletionCleanup[0].lastError, "AVATAR_CLEANUP_FAILED");
  const task = db.state.accountDeletionCleanup[0]; task.status = "PROCESSING"; task.processingStartedAt = new Date();
  assert.equal((await processAccountDeletionCleanup(db.prisma, deletionResult.cleanupId, storage)).busy, true);
  task.processingStartedAt = PAST; failStorage = false;
  assert.equal((await processAccountDeletionCleanup(db.prisma, deletionResult.cleanupId, storage)).completed, true);
  assert.equal(db.state.accountDeletionCleanup[0].attemptCount, 2); assert.deepEqual(deleted, ["avatars/guest/a.png", "avatars/guest/b.webp"]);
  assert.equal((await processAccountDeletionCleanup(db.prisma, deletionResult.cleanupId, storage)).alreadyCompleted, true);
});

test("avatar cleanup fails closed on any key outside deleted member's exact prefix", async () => {
  const db = fake(); const task = await anonymizeAccount(db.prisma, deletion); let calledDelete = false;
  const result = await processAccountDeletionCleanup(db.prisma, task.cleanupId, { listKeys: async () => ["events/shared-cover.jpg"], deleteKeys: async () => { calledDelete = true; } });
  assert.equal(result.errorCode, "UNSAFE_STORAGE_KEYS"); assert.equal(calledDelete, false);
});

test("cleanup waits for all pre-deletion upload URLs to expire before the final sweep", async () => {
  const db = fake(); const task = await anonymizeAccount(db.prisma, deletion);
  const createdAt = new Date(); db.state.accountDeletionCleanup[0].createdAt = createdAt;
  let keys: string[] = []; let reads = 0;
  const storage = { async listKeys() { reads++; return [...keys]; }, async deleteKeys(input: { keys: string[] }) { keys = keys.filter(key => !input.keys.includes(key)); } };
  const early = await processAccountDeletionCleanup(db.prisma, task.cleanupId, storage, createdAt);
  assert.equal(early.delayed, true); assert.equal(early.retryAfterSeconds, 360); assert.equal(reads, 0);
  // A previously issued five-minute upload URL can still finish during the wait.
  keys.push("avatars/guest/late-upload.png");
  const final = await processAccountDeletionCleanup(db.prisma, task.cleanupId, storage, new Date(+createdAt + AVATAR_CLEANUP_DELAY_MS));
  assert.equal(final.completed, true); assert.deepEqual(keys, []);
});

test("an old cleanup worker cannot overwrite a newer lease's result", async () => {
  const db = fake(); const task = await anonymizeAccount(db.prisma, deletion);
  const result = await processAccountDeletionCleanup(db.prisma, task.cleanupId, {
    async listKeys() { const row = db.state.accountDeletionCleanup[0]; row.processingStartedAt = FUTURE; return []; },
    async deleteKeys() { throw new Error("Must not delete"); },
  });
  assert.equal(result.busy, true); assert.equal(db.state.accountDeletionCleanup[0].status, "PROCESSING"); assert.deepEqual(db.state.accountDeletionCleanup[0].processingStartedAt, FUTURE);
});

test("check-in is idempotent, keeps first operator/time/audit and cannot be cleared by member cancellation", async () => {
  const db = fake();
  const input = checkInInputSchema.parse({ qrValue: "lionclub:member:guest" });
  const first = await checkInMember(db.prisma, "actor", "event", input, async () => false);
  assert.equal(first.alreadyCheckedIn, false); assert.equal(first.checkedInCount, 1); assert.equal(first.registeredCount, 1);
  const timestamp = db.state.eventRegistration[0].checkedInAt;
  const second = await checkInMember(db.prisma, "other", "event", input, async () => true);
  assert.equal(second.alreadyCheckedIn, true); assert.deepEqual(db.state.eventRegistration[0].checkedInAt, timestamp);
  assert.equal(db.state.eventRegistration[0].checkedInById, "actor"); assert.equal(db.state.eventCheckInAudit.length, 1);
  await assert.rejects(toggleEventRegistration(db.prisma, "guest", "event"), hasStatus(AttendanceError, 409));
  assert.equal(db.state.eventRegistration[0].status, "REGISTERED"); assert.equal(db.state.eventCheckInAudit[0].method, "QR");
});

test("manual check-in requires reason, active registered target and scoped staff; audit failure rolls back", async () => {
  assert.equal(checkInInputSchema.safeParse({ memberId: "guest", method: "manual", reason: " " }).success, false);
  const input = checkInInputSchema.parse({ memberId: "guest", method: "manual", reason: "紙本名冊人工補登" });
  const db = fake(); await assert.rejects(checkInMember(db.prisma, "other", "event", input, async () => false), hasStatus(AttendanceError, 403));
  db.state.member.find(row => row.id === "guest")!.status = "SUSPENDED";
  await assert.rejects(checkInMember(db.prisma, "actor", "event", input, async () => false), hasStatus(AttendanceError, 409));
  db.state.member.find(row => row.id === "guest")!.status = "ACTIVE"; db.failCreateTable = "eventCheckInAudit";
  await assert.rejects(checkInMember(db.prisma, "actor", "event", input, async () => false)); assert.equal(db.state.eventRegistration[0].checkedInAt, null);
  db.failCreateTable = undefined; await checkInMember(db.prisma, "actor", "event", input, async () => false);
  assert.equal(db.state.eventCheckInAudit[0].method, "MANUAL"); assert.equal(db.state.eventCheckInAudit[0].reason, "紙本名冊人工補登");
});

test("unchecked cancellation keeps row, reactivation preserves identity and excludes CANCELLED from capacity", async () => {
  const db = fake(); db.state.event[0].capacity = 1;
  assert.equal((await toggleEventRegistration(db.prisma, "guest", "event")).registered, false);
  assert.equal(db.state.eventRegistration.length, 1); assert.equal(db.state.eventRegistration[0].status, "CANCELLED");
  assert.equal((await attendanceCounts(db.prisma, "event")).registeredCount, 0);
  assert.equal((await toggleEventRegistration(db.prisma, "other", "event")).registered, true);
  await assert.rejects(toggleEventRegistration(db.prisma, "guest", "event"), hasStatus(AttendanceError, 409));
  await toggleEventRegistration(db.prisma, "other", "event"); await toggleEventRegistration(db.prisma, "guest", "event");
  assert.equal(db.state.eventRegistration.find(row => row.memberId === "guest")!.id, "registration");
  assert.equal(db.calls.some(call => call.table === "eventRegistration" && call.method === "delete"), false);
});

test("attendance serializable conflicts retry and exhaust safely", async () => {
  const db = fake(); db.conflicts = 2; await toggleEventRegistration(db.prisma, "guest", "event");
  assert.equal(db.calls.filter(call => call.table === "$transaction").length, 3);
  db.conflicts = 3; await assert.rejects(toggleEventRegistration(db.prisma, "guest", "event"), hasStatus(AttendanceError, 409));
});

test("bulk email resolution preserves exact legacy account, permits unique fallback, rejects ambiguity", async () => {
  const db = fake(); db.state.member.push(person("legacy", { email: "Hao@Lion.com" }), person("lower", { email: "hao@lion.com" }));
  assert.equal((await resolveBulkMemberByEmail(db.prisma, " Hao@Lion.com "))!.id, "legacy");
  await assert.rejects(resolveBulkMemberByEmail(db.prisma, "HAO@LION.COM"), hasStatus(OnboardingError, 409));
  db.state.member = db.state.member.filter(row => row.id !== "lower");
  assert.equal((await resolveBulkMemberByEmail(db.prisma, "HAO@LION.COM"))!.id, "legacy");
  assert.equal(await resolveBulkMemberByEmail(db.prisma, "unknown@example.test"), null);
});

test("bulk preview blocks self, repeated identities, ambiguous and unavailable target rows", async () => {
  const db = fake();
  const result = await previewBulkAssignments(db.prisma, "actor", [
    { email: "actor@example.test", organizationId: "club-b" }, { email: "guest@example.test", organizationId: "club-b" }, { email: "GUEST@EXAMPLE.TEST", organizationId: "club-b" }, { email: "other@example.test", organizationId: "missing" },
  ]);
  assert.ok(result.rows.every(row => row.error)); assert.match(result.rows[0].error!, /自己/); assert.match(result.rows[1].error!, /重複/); assert.match(result.rows[2].error!, /重複/);
});

test("bulk commit keeps mixed success/409 explicit, carries CAS/reason and blocks duplicate members", async () => {
  const rows = bulkCommitSchema.parse({ rows: ["guest", "other"].map(memberId => ({ memberId, organizationId: "club-b", expectedOrganizationId: "club-a", expectedAssignmentVersion: 7, reason: "正式名單逐筆核對" })) }).rows;
  const calls: string[] = [];
  const result = await commitBulkAssignments({} as PrismaClient, "actor", rows, async (_db, actorId, memberId, input) => {
    assert.equal(actorId, "actor"); assert.equal(input.expectedAssignmentVersion, 7); assert.equal(input.reason, "正式名單逐筆核對"); calls.push(memberId);
    if (memberId === "other") throw new OnboardingError(409, "其他管理者已更新");
    return { organization: { id: "club-b", name: "B" } };
  });
  assert.deepEqual(calls, ["guest", "other"]); assert.equal(result.results[0].ok, true); assert.equal(result.results[1].status, 409); assert.equal(result.results[1].ok, false);
  const repeated = await commitBulkAssignments({} as PrismaClient, "actor", [rows[0], rows[0]], async () => { throw new Error("Must not assign duplicates"); });
  assert.ok(repeated.results.every(row => row.status === 400));
});

test("bulk mixed results execute the real assignment transaction and preserve stale row/history", async () => {
  const db = fake();
  const rows = bulkCommitSchema.parse({ rows: [
    { memberId: "guest", organizationId: "club-b", expectedOrganizationId: "club-a", expectedAssignmentVersion: 0, reason: "正式名單成功筆" },
    { memberId: "other", organizationId: "club-b", expectedOrganizationId: "club-a", expectedAssignmentVersion: 9, reason: "過期版本衝突筆" },
  ] }).rows;
  const result = await commitBulkAssignments(db.prisma, "actor", rows);
  assert.equal(result.results[0].status, 200); assert.equal(result.results[1].status, 409);
  assert.equal(db.state.member.find(row => row.id === "guest")!.organizationId, "club-b");
  assert.equal(db.state.member.find(row => row.id === "other")!.organizationId, "club-a");
  assert.equal(db.state.memberOrganizationAssignment.length, 1); assert.equal(db.state.memberOrganizationAssignment[0].reason, "正式名單成功筆");
});

test("bulk preview enforces both source and destination scope without returning out-of-scope names", async () => {
  const db = fake(); db.state.adminRole = [{ memberId: "actor", role: "CLUB_PRESIDENT", scopeId: "club-a", validFrom: PAST, validUntil: null }];
  db.state.member.find(row => row.id === "other")!.organizationId = "club-b";
  const result = await previewBulkAssignments(db.prisma, "actor", [{ email: "guest@example.test", organizationId: "club-b" }, { email: "other@example.test", organizationId: "club-a" }]);
  assert.match(result.rows[0].error!, /目標分會超出/); assert.match(result.rows[1].error!, /目前分會超出/);
  assert.ok(result.rows.every(row => row.memberName === undefined && row.memberId === undefined));
});
