import assert from "node:assert/strict";
import { test } from "node:test";
import { readNotificationsResponse } from "../mobile-app/src/notification-contract";
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
