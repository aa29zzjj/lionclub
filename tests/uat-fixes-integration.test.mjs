import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

let sim, s, a, b, c, personal, personalB;
const status = (r, code) => { assert.equal(r.status, code, JSON.stringify(r.data)); return r.data; };
const draft = { title: "合成回歸活動", location: "合成場地", startAt: "2027-01-01T02:00:00.000Z", category: "PERSONAL", tags: ["SERVICE", "LEARNING"] };
const detail = (id, jar) => sim.call(`/api/events/${id}`, "GET", undefined, jar);
const block = () => sim.call(`/api/members/${s.friend.id}/block`, "POST", {}, a);
const unblock = () => sim.call(`/api/members/${s.friend.id}/block`, "DELETE", {}, a);
before(async () => {
  sim = await createSimulation(); s = await seedScenario(sim);
  const login = async (member) => { const jar = sim.jar(); status(await sim.call("/api/auth/login", "POST", { email: member.email, password: s.password }, jar), 200); status(await sim.call("/api/me/terms-consent", "POST", { accept: true }, jar), 200); return jar; };
  a = await login(s.member); b = await login(s.friend); c = await login(s.chair);
});
after(async () => { await sim?.close(); });

test("I02 additive migration leaves existing events tags empty; create/edit persist validated tags", async () => {
  assert.deepEqual(status(await detail(s.event.id, a), 200).event.tags, []);
  personal = status(await sim.call("/api/events", "POST", draft, a), 200).eventId;
  assert.deepEqual(status(await detail(personal, a), 200).event.tags, draft.tags);
  status(await sim.call(`/api/events/${personal}`, "PATCH", { ...draft, tags: ["NETWORKING"] }, a), 200);
  assert.deepEqual(status(await detail(personal, b), 200).event.tags, ["NETWORKING"]);
  assert.deepEqual(status(await sim.call("/api/events", "GET", undefined, b), 200).events.find((e) => e.id === personal).tags, ["NETWORKING"]);
  status(await sim.call("/api/events", "POST", { ...draft, tags: ["INVALID"] }, a), 400);
  status(await sim.call(`/api/events/${personal}`, "PATCH", { ...draft, tags: ["SPORT", "SPORT"] }, a), 400);
  status(await sim.call(`/api/events/${personal}`, "PATCH", { ...draft, tags: [] }, b), 403);
  status(await sim.call(`/api/events/${personal}`, "PATCH", { ...draft, tags: [] }, a), 200);
  assert.deepEqual(status(await detail(personal, a), 200).event.tags, []);
});
test("I01 block hides personal list/detail/notifications bidirectionally, including third-party forwarded notices", async () => {
  personalB = status(await sim.call("/api/events", "POST", draft, b), 200).eventId;
  await sim.prisma.eventNotification.create({ data: { eventId: personal, senderId: s.chair.id, message: "第三人轉發的合成活動", recipients: { create: { recipientId: s.friend.id } } } });
  status(await block(), 200);
  for (const [jar, id] of [[b, personal], [a, personalB]]) {
    assert.equal(status(await sim.call("/api/events", "GET", undefined, jar), 200).events.some((e) => e.id === id), false);
    status(await detail(id, jar), 404);
    status(await sim.call(`/api/events/${id}/register`, "POST", {}, jar), 404);
  }
  const inbox = status(await sim.call("/api/notifications", "GET", undefined, b), 200);
  assert.equal(inbox.inbox.some((n) => n.eventId === personal), false); assert.equal(inbox.unreadCount, 0);
  status(await sim.call("/api/notifications", "POST", { eventId: personalB, memberIds: [s.chair.id] }, a), 404);
  assert.ok(status(await sim.call("/api/events", "GET", undefined, a), 200).events.some((e) => e.id === s.event.id));
  status(await detail(s.event.id, b), 200);
  status(await unblock(), 200);
  status(await detail(personal, b), 200);
  assert.equal(status(await sim.call("/api/friends", "GET", undefined, a), 200).friends.length, 0);
});
test("I01 own bookings can be cancelled after block, never rejoined; authorized attendance records retained", async () => {
  status(await sim.call(`/api/events/${personal}/register`, "POST", {}, b), 200);
  status(await block(), 200);
  const result = status(await sim.call(`/api/events/${personal}/register`, "POST", {}, b), 200);
  assert.equal(result.registered, false);
  status(await sim.call(`/api/events/${personal}/register`, "POST", {}, b), 404);
  status(await sim.call(`/api/events/${personal}/registrations`, "GET", undefined, a), 200);
  assert.equal(await sim.prisma.eventRegistration.count({ where: { eventId: personal, memberId: s.friend.id } }), 1);
  status(await unblock(), 200);
});
test("I03 notifications include pending invitations without contact details, opening does not accept; accept is one-shot", async () => {
  const invitation = status(await sim.call("/api/friends/request", "POST", { memberId: s.friend.id }, a), 200);
  const notices = status(await sim.call("/api/notifications", "GET", undefined, b), 200);
  assert.equal(notices.pendingFriendCount, 1);
  assert.equal(notices.friendInvitations[0].friendshipId, invitation.friendshipId);
  assert.equal("email" in notices.friendInvitations[0].requester, false);
  assert.equal("phone" in notices.friendInvitations[0].requester, false);
  assert.equal((await sim.prisma.friendship.findUnique({ where: { id: invitation.friendshipId } })).status, "PENDING");
  const path = `/api/friends/${invitation.friendshipId}/respond`;
  status(await sim.call(path, "POST", { action: "accept" }, a), 404);
  status(await sim.call(path, "POST", { action: "accept" }, b), 200);
  status(await sim.call(path, "POST", { action: "accept" }, b), 404);
  assert.equal(status(await sim.call("/api/notifications", "GET", undefined, b), 200).pendingFriendCount, 0);
  for (const jar of [a, b]) assert.equal(status(await sim.call("/api/friends", "GET", undefined, jar), 200).friends.length, 1);
});
test("I03 decline, blocked stale invitation, inactive requester and cross-origin responses remain denied", async () => {
  await sim.prisma.friendship.deleteMany({});
  let invite = status(await sim.call("/api/friends/request", "POST", { memberId: s.friend.id }, a), 200);
  status(await sim.call(`/api/friends/${invite.friendshipId}/respond`, "POST", { action: "decline" }, b), 200);
  assert.equal(status(await sim.call("/api/friends", "GET", undefined, b), 200).friends.length, 0);
  await sim.prisma.friendship.deleteMany({});
  invite = status(await sim.call("/api/friends/request", "POST", { memberId: s.friend.id }, a), 200);
  // Preserve a stale pending row to exercise defensive checks, not only block's deletion.
  await sim.prisma.memberBlock.create({ data: { blockerId: s.member.id, blockedId: s.friend.id } });
  assert.equal(status(await sim.call("/api/notifications", "GET", undefined, b), 200).pendingFriendCount, 0);
  status(await sim.call(`/api/friends/${invite.friendshipId}/respond`, "POST", { action: "accept" }, b), 409);
  await sim.prisma.memberBlock.deleteMany({});
  await sim.prisma.member.update({ where: { id: s.member.id }, data: { status: "SUSPENDED" } });
  assert.equal(status(await sim.call("/api/notifications", "GET", undefined, b), 200).pendingFriendCount, 0);
  status(await sim.call(`/api/friends/${invite.friendshipId}/respond`, "POST", { action: "accept" }, b), 404);
  await sim.prisma.member.update({ where: { id: s.member.id }, data: { status: "ACTIVE" } });
  status(await sim.call(`/api/friends/${invite.friendshipId}/respond`, "POST", { action: "accept" }, b, { origin: "https://untrusted.example" }), 403);
});
