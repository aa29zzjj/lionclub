import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApiClient, ApiError, uploadToPresignedUrl } from "./mock-contract";

const root = fileURLToPath(new URL("../../", import.meta.url));
const api = () => createApiClient("https://native-preview.invalid");

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
  for (const method of ["login", "updateProfile", "createEvent", "toggleEventRegistration", "requestFriend", "respondFriend", "deleteExperience", "sendNotification", "registerPushDevice", "disablePushDevice", "futureMutation"]) {
    const action = Reflect.get(client, method) as (...args: unknown[]) => Promise<unknown>;
    await assert.rejects(action({}), (error: unknown) => error instanceof ApiError && /操作未執行，也不會儲存/.test(error.message));
  }
  await assert.rejects(uploadToPresignedUrl(), ApiError);
});

test("explicit preview read acknowledgements never persist the read state", async () => {
  const client = api(); const before = await client.getNotifications();
  await client.markNotificationsRead(before.inbox.map(item => item.notificationId));
  assert.equal((await client.getNotifications()).inbox[0].readAt, null);
  const review = await client.getPushReceipts(); await client.markPushReceiptsRead(review.receipts.map(item => item.id));
  assert.equal((await client.getPushReceipts()).receipts[0].readAt, null);
});

test("preview build includes real native screen components but excludes all real API/native/private adapters", () => {
  execFileSync(process.execPath, ["mobile-app/preview/build.mjs"], { cwd: root, stdio: "pipe" });
  const evidence = JSON.parse(readFileSync(new URL("../../tmp/native-ui-preview/build-evidence.json", import.meta.url), "utf8"));
  assert.equal(evidence.mode, "isolated-native-ui-candidate-synthetic-only");
  for (const flag of ["productionChanged", "nativePermissions", "networkAllowed", "keychainAccess", "credentialsIncluded", "physicalDeviceAcceptance"]) assert.equal(evidence[flag], false);
  for (const screen of ["Shell", "HomeScreen", "FriendsScreen", "EventsScreen", "NotificationsScreen", "MyScreen"]) assert.ok(evidence.sources.includes(`mobile-app/src/${screen}.tsx`));
  assert.ok(evidence.sources.every((path: string) => !/mobile-app\/src\/(?:contract|native-push)\.ts$|node_modules\/@(?:capacitor|aparajita)\/|@aws-sdk|\.env(?:\.|$)/.test(path)));
  const html = readFileSync(new URL("../../tmp/native-ui-preview/index.html", import.meta.url), "utf8");
  assert.match(html, /connect-src 'none'/); assert.match(html, /img-src 'self' data:/); assert.match(html, /form-action 'none'/);
});
