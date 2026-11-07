import assert from "node:assert/strict";
import { test } from "node:test";
import { canSendNotification, notificationSendCount, readNotificationComposeData, readNotificationsResponse } from "../mobile-app/src/notification-contract";
import { actionFromApnsUserInfo, isKnownPushAction } from "../mobile-app/src/push-controller";
import { mobilePushPayload } from "../src/lib/mobile-push-delivery";
test("older notification APIs may omit lists, without losing current inbox entries", () => {
  assert.deepEqual(readNotificationsResponse({}), { inbox: [], friendInvitations: [], notifications: [], unreadCount: 0, pendingFriendCount: 0 });
});
test("wrong list, count or nested sender types are read failures, not fake empty states", () => {
  for (const data of [null, [], { inbox: "not a list" }, { notifications: {} }, { unreadCount: "3" }, { friendInvitations: [null] },
    { inbox: [{ id: "n", notificationId: "n", eventId: "e", eventTitle: "Synthetic", message: "Synthetic", sentAt: "2026-11-05T00:00:00Z", readAt: null, sender: null }] }]) {
    assert.throws(() => readNotificationsResponse(data), /NOTIFICATION_RESPONSE_INVALID/);
  }
});
test("sent recipient arrays remain backward compatible but cannot carry malformed render data", () => {
  const row = { id: "n", eventTitle: "Synthetic", message: "Synthetic", sentAt: "2026-11-05T00:00:00Z" };
  assert.deepEqual(readNotificationsResponse({ notifications: [row] }).notifications[0].recipients, []);
  assert.throws(() => readNotificationsResponse({ notifications: [{ ...row, recipients: [{}] }] }));
});
test("compose reads reject absent or malformed options before they reach render", () => {
  for (const [events, friends] of [
    [undefined, { friends: [] }], [[], {}], [{}, { friends: [] }], [[], { friends: "invalid" }],
    [[{ id: "event", title: {} }], { friends: [] }], [[], { friends: [null] }],
    [[], { friends: [{ id: "friend", name: "Synthetic", nickname: {} }] }],
    [[], { friends: [{ id: "friend", name: "Synthetic", chapter: {} }] }],
  ]) assert.throws(() => readNotificationComposeData(events, friends), /NOTIFICATION_RESPONSE_INVALID/);
  assert.deepEqual(readNotificationComposeData([], { friends: [] }), { events: [], friends: [] });
  assert.deepEqual(readNotificationComposeData([{ id: "event", title: "Synthetic", ignored: {} }], {
    friends: [{ id: "friend", name: "Synthetic", nickname: null, chapter: null, ignored: {} }],
  }), { events: [{ id: "event", title: "Synthetic" }], friends: [{ id: "friend", name: "Synthetic", nickname: undefined, chapter: "" }] });
});
test("send remains disabled during loading or a pending result, with no event or selected friends, and beyond API limits", () => {
  const valid = { ready: true, busy: false, eventId: "event", recipientType: "selected" as const, selected: ["friend"], message: "" };
  assert.equal(canSendNotification(valid), true);
  for (const change of [{ ready: false }, { busy: true }, { eventId: "" }, { selected: [] },
    { selected: Array(1001).fill("friend") }, { message: "x".repeat(1001) }]) assert.equal(canSendNotification({ ...valid, ...change }), false);
  assert.equal(canSendNotification({ ...valid, message: "x".repeat(1000) }), true);
  // Organization permission and final recipient eligibility stay on the server.
  assert.equal(canSendNotification({ ...valid, recipientType: "organization", selected: [] }), true);
});
test("a missing or invalid send acknowledgement is uncertain, never an invented success count", () => {
  for (const result of [null, {}, [], { recipientCount: "1" }, { recipientCount: 0 }, { recipientCount: -1 },
    { recipientCount: 1.1 }, { recipientCount: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(notificationSendCount(result), null);
  assert.equal(notificationSendCount({ recipientCount: 2 }), 2);
});
test("real APNs payload survives Capacitor's whole-userInfo wrapper and opens only a known inbox action", () => {
  for (const kind of ["activity", "friend_invitation", "experience_review", "membership_review"] as const) {
    const userInfo = mobilePushPayload(kind);
    assert.equal(isKnownPushAction(userInfo), false);
    assert.deepEqual(actionFromApnsUserInfo(userInfo), { version: 1, kind });
    assert.equal(isKnownPushAction(actionFromApnsUserInfo(userInfo)), true);
  }
  for (const userInfo of [null, { data: { version: 2, kind: "activity" } }, { data: { version: 1, kind: "https://evil.invalid" } }]) assert.equal(actionFromApnsUserInfo(userInfo), null);
  assert.deepEqual(actionFromApnsUserInfo({ data: { version: 1, kind: "activity", url: "https://evil.invalid", token: "synthetic" } }), { version: 1, kind: "activity" });
});
