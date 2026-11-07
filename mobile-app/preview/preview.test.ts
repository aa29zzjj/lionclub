import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApiClient, ApiError, uploadToPresignedUrl, nativeOAuthAvailable, setPreviewNotificationFixture, getPreviewNotificationFixture, PREVIEW_NOTIFICATION_FIXTURES } from "./mock-contract";
import { App as PreviewNativeApp, Browser, Camera } from "./native-stubs";
import PreviewRenderFailure from "./render-failure";

const root = fileURLToPath(new URL("../../", import.meta.url));
const api = () => createApiClient("https://native-preview.invalid");
beforeEach(() => setPreviewNotificationFixture("normal"));

test("preview contract refuses a production or arbitrary origin", () => {
  assert.throws(() => createApiClient("https://lionclubsmembership.com"), /PREVIEW_ORIGIN_REQUIRED/);
  assert.throws(() => createApiClient("http://localhost:3101"), /PREVIEW_ORIGIN_REQUIRED/);
});

test("preview read models are synthetic, cloned and usable across the five native destinations", async () => {
  const client = api(); const me = await client.me();
  assert.equal(await client.hasStoredSession(), false);
  assert.match(me.id, /^preview-synthetic-/); assert.match(me.email, /@example\.invalid$/);
  assert.deepEqual(me.adminRoles, []);
  const a = await client.getFriends(), b = await client.getFriends();
  assert.ok(a.friends.length); assert.ok(a.incoming.length);
  a.friends.length = 0; assert.ok(b.friends.length); assert.ok((await client.getFriends()).friends.length);
  const events = await client.getEvents(); assert.ok(events.length);
  assert.ok(events.every(event => event.id.startsWith("preview-synthetic-") && event.coverPhotoUrl?.startsWith("data:image/svg+xml,")));
  assert.equal((await client.getEvent(events[0].id)).canManage, false);
  assert.ok((await client.getMyExperiences()).length);
  assert.ok(Array.isArray(await client.getBlockedMembers()));
  const notifications = await client.getNotifications();
  assert.ok(notifications.inbox.length); assert.ok(notifications.friendInvitations.length); assert.ok(notifications.notifications.length);
  assert.ok((await client.getPushReceipts()).receipts.length);
  assert.equal((await client.getPushConfig()).enabled, false);
});

test("all preview mutations and unknown future methods fail closed without claiming success", async () => {
  const client = api();
  for (const method of ["login", "loginWithProvider", "logout", "updateProfile", "createAvatarUpload", "createEventCoverUpload", "createEvent", "toggleEventRegistration", "requestFriend", "respondFriend", "deleteExperience", "sendNotification", "registerPushDevice", "disablePushDevice", "markNotificationsRead", "markPushReceiptsRead", "futureMutation"]) {
    const action = Reflect.get(client, method) as (...args: unknown[]) => Promise<unknown>;
    await assert.rejects(action({}), (error: unknown) => error instanceof ApiError && /操作未執行，也不會儲存/.test(error.message));
  }
  await assert.rejects(uploadToPresignedUrl(), ApiError);
});

test("preview rejects read-state mutations without altering either synthetic inbox", async () => {
  const client = api(); const before = await client.getNotifications();
  await assert.rejects(client.markNotificationsRead(before.inbox.map(item => item.notificationId)), ApiError);
  assert.equal((await client.getNotifications()).inbox[0].readAt, null);
  const review = await client.getPushReceipts(); await assert.rejects(client.markPushReceiptsRead(review.receipts.map(item => item.id)), ApiError);
  assert.equal((await client.getPushReceipts()).receipts[0].readAt, null);
});

test("signed-out fixture exposes provider UI without stored session, native lifecycle calls or actual authentication", async () => {
  assert.equal(nativeOAuthAvailable(), true);
  assert.equal(await api().hasStoredSession(), false);
  let nativeCallbacks = 0;
  const listener = await PreviewNativeApp.addListener("appStateChange", () => { nativeCallbacks++; });
  await listener.remove(); assert.equal(nativeCallbacks, 0);
  await Browser.open(); await assert.rejects(Camera.takePhoto(), /PREVIEW_CAMERA_DISABLED/);
  for (const provider of ["google", "apple"] as const) await assert.rejects(api().loginWithProvider(provider), ApiError);
  assert.equal(await api().hasStoredSession(), false);
});

test("notification read-error and malformed fixtures return explicit errors while other synthetic reads remain available", async () => {
  setPreviewNotificationFixture("load-error");
  await assert.rejects(api().getNotifications(), (error: unknown) => error instanceof ApiError && error.code === "NETWORK_ERROR");
  assert.ok((await api().getFriends()).friends.length);
  setPreviewNotificationFixture("malformed");
  await assert.rejects(api().getNotifications(), /通知資料格式尚未確認/);
  assert.equal((await api().me()).id, "preview-synthetic-member");
  setPreviewNotificationFixture("normal"); assert.ok((await api().getNotifications()).inbox.length);
});

test("compose-error and empty-friends fixtures cannot convert a failed or empty read into a successful send", async () => {
  setPreviewNotificationFixture("compose-error");
  await assert.rejects(api().getFriends(), /活動與好友尚未讀取完成/);
  assert.ok((await api().getNotifications()).inbox.length);
  setPreviewNotificationFixture("empty-friends");
  assert.deepEqual(await api().getFriends(), { friends: [], incoming: [], suggestions: [] });
  assert.ok((await api().getEvents()).length);
  await assert.rejects(api().sendNotification({ eventId: "preview-synthetic-event-1", recipientType: "organization" }), ApiError);
  assert.throws(() => setPreviewNotificationFixture("production" as any), /UNKNOWN_PREVIEW_FIXTURE/);
  assert.equal(getPreviewNotificationFixture(), "empty-friends");
});

test("explicit render-error fixture throws only the named synthetic error and does not remove ordinary read fixtures", async () => {
  setPreviewNotificationFixture("render-error");
  assert.throws(() => PreviewRenderFailure(), /^Error: SYNTHETIC_PREVIEW_RENDER_FAILURE$/);
  assert.ok((await api().getEvents()).every(event => event.id.startsWith("preview-synthetic-")));
  assert.equal(await api().hasStoredSession(), false);
});

test("preview build includes real native screen components but excludes all real API/native/private adapters", () => {
  execFileSync(process.execPath, ["mobile-app/preview/build.mjs"], { cwd: root, stdio: "pipe" });
  const evidence = JSON.parse(readFileSync(new URL("../../tmp/native-ui-preview/build-evidence.json", import.meta.url), "utf8"));
  assert.equal(evidence.mode, "isolated-native-ui-candidate-synthetic-only");
  for (const flag of ["productionChanged", "nativePermissions", "networkAllowed", "keychainAccess", "credentialsIncluded", "physicalDeviceAcceptance"]) assert.equal(evidence[flag], false);
  assert.equal(evidence.realAppSignedOutPreview, true); assert.equal(evidence.mutations, "all-rejected");
  assert.deepEqual(evidence.notificationFixtures, [...PREVIEW_NOTIFICATION_FIXTURES]);
  for (const screen of ["App", "Shell", "HomeScreen", "FriendsScreen", "EventsScreen", "NotificationsScreen", "MyScreen", "ScreenErrorBoundary"]) assert.ok(evidence.sources.includes(`mobile-app/src/${screen}.tsx`));
  assert.ok(evidence.sources.includes("mobile-app/preview/render-failure.tsx"));
  assert.ok(evidence.sources.includes("mobile-app/preview/native-stubs.ts"));
  assert.ok(evidence.sources.every((path: string) => !/mobile-app\/src\/(?:contract|native-push)\.ts$|node_modules\/@(?:capacitor|aparajita)\/|@aws-sdk|\.env(?:\.|$)/.test(path)));
  const html = readFileSync(new URL("../../tmp/native-ui-preview/index.html", import.meta.url), "utf8");
  assert.match(html, /connect-src 'none'/); assert.match(html, /img-src 'self' data:/); assert.match(html, /form-action 'none'/);
});
