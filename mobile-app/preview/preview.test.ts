import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApiClient, ApiError, uploadToPresignedUrl, nativeOAuthAvailable, setPreviewNotificationFixture, getPreviewNotificationFixture, PREVIEW_NOTIFICATION_FIXTURES,
  setPreviewFeatureFixture, getPreviewFeatureFixture, getPreviewMember, PREVIEW_FEATURE_FIXTURES } from "./mock-contract";
import { App as PreviewNativeApp, Browser, Camera } from "./native-stubs";
import PreviewRenderFailure from "./render-failure";
import { readEventPublishingOptions } from "../src/event-draft";

const root = fileURLToPath(new URL("../../", import.meta.url));
const api = () => createApiClient("https://native-preview.invalid");
beforeEach(() => { setPreviewNotificationFixture("normal"); setPreviewFeatureFixture("normal"); });

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
  for (const method of ["login", "loginWithProvider", "logout", "updateProfile", "createAvatarUpload", "createEventCoverUpload", "createEvent", "acceptTerms", "toggleEventRegistration", "requestFriend", "respondFriend", "createExperience", "deleteExperience", "sendNotification", "registerPushDevice", "disablePushDevice", "markNotificationsRead", "markPushReceiptsRead", "blockMember", "unblockMember", "resendVerificationEmail", "revokeOtherSessions", "reviewPendingMember", "reviewPendingExperience", "grantRole", "moderateReport", "futureMutation"]) {
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

test("feature fixture selection is an explicit allowlist and leaves the normal member unchanged", async () => {
  assert.deepEqual(getPreviewMember(), await api().me());
  assert.deepEqual(getPreviewMember().adminRoles, []); assert.ok(getPreviewMember().emailVerifiedAt);
  for (const fixture of PREVIEW_FEATURE_FIXTURES) { setPreviewFeatureFixture(fixture); assert.equal(getPreviewFeatureFixture(), fixture); }
  assert.throws(() => setPreviewFeatureFixture("production" as any), /UNKNOWN_PREVIEW_FEATURE_FIXTURE/);
  assert.equal(getPreviewFeatureFixture(), "pending-members");
  setPreviewFeatureFixture("normal"); assert.deepEqual(getPreviewMember().adminRoles, []);
  assert.equal(api().captureSessionGuard()(), true);
});

test("event scope fixtures expose only exact synthetic API pairs, never a scope-only inferred grant", async () => {
  setPreviewFeatureFixture("event-scope");
  const response = await api().getEventsFull(), options = readEventPublishingOptions(response);
  assert.deepEqual(options.map(option => [option.scope, option.hostOrganizationId]), [
    ["CLUB", "preview-synthetic-org-club"], ["ZONE", "preview-synthetic-org-zone"], ["DISTRICT", "preview-synthetic-org-district"],
  ]);
  response.officialHosts.length = 0; assert.equal((await api().getEventsFull()).officialHosts.length, 3);
  setPreviewFeatureFixture("event-settings-error"); await assert.rejects(api().getEventsFull(), /發布設定尚未讀取完成/);
  assert.ok((await api().getEvents()).length, "a settings failure does not fabricate an empty event list");
  setPreviewFeatureFixture("event-options-invalid");
  const invalid = await api().getEventsFull();
  assert.throws(() => readEventPublishingOptions(invalid), /權限資料尚未確認/);
});

test("event publication notices use only allowlisted fixture IDs and all publication attempts remain refused", async () => {
  setPreviewFeatureFixture("event-scope");
  const notices: string[] = [];
  const host = globalThis as unknown as { window?: { dispatchEvent(event: CustomEvent): void } };
  const previous = host.window;
  host.window = { dispatchEvent(event) { notices.push(String(event.detail)); } };
  try {
    const options = (await api().getEventsFull()).officialHosts;
    const privateText = "USER_ENTERED_TEXT_MUST_NOT_REACH_NOTICE";
    for (const option of options) await assert.rejects(api().createEvent({ title: privateText, startAt: "2027-01-01T01:00:00.000Z", location: privateText,
      category: "CLUB_OFFICIAL", scope: option.scope as "CLUB" | "ZONE" | "DISTRICT", hostOrganizationId: option.hostOrganizationId }), ApiError);
    assert.ok(notices.some(notice => notice.includes("ZONE／主辦 preview-synthetic-org-zone")));
    assert.ok(notices.every(notice => !notice.includes(privateText)));
    notices.length = 0;
    await assert.rejects(api().createEvent({ title: privateText, startAt: "2027-01-01T01:00:00.000Z", location: privateText,
      category: "CLUB_OFFICIAL", scope: "ZONE", hostOrganizationId: privateText }), ApiError);
    assert.ok(notices.every(notice => !notice.includes(privateText) && !notice.includes("已核對")));
  } finally { if (previous === undefined) delete host.window; else host.window = previous; }
  assert.equal((await api().getEvents()).length, 2);
});

test("terms fixtures require the real prompt but can never record consent or create an event", async () => {
  const client = api(); const before = await client.getEvents();
  for (const fixture of ["terms-required", "terms-read-error"] as const) {
    setPreviewFeatureFixture(fixture);
    await assert.rejects(client.createEvent({ title: "合成活動", startAt: "2027-01-01T01:00:00.000Z", location: "合成會址" }), { code: "TERMS_REQUIRED", status: 428 });
    await assert.rejects(client.acceptTerms("2026-10-23"), ApiError);
  }
  await assert.rejects(client.getTermsConsent(), /使用條款狀態尚未讀取完成/);
  setPreviewFeatureFixture("terms-required");
  assert.deepEqual(await client.getTermsConsent(), { termsVersion: "2026-10-23", accepted: false, termsAcceptedAt: null });
  await assert.rejects(client.acceptTerms("2026-10-23"), ApiError);
  assert.equal((await client.getTermsConsent()).accepted, false);
  assert.deepEqual(await client.getEvents(), before);
});

test("security fixtures exercise the real shape reader and refusal never removes the synthetic block", async () => {
  setPreviewFeatureFixture("security-read-error"); await assert.rejects(api().getBlockedMembers(), /尚未讀取完成/);
  setPreviewFeatureFixture("security-malformed"); await assert.rejects(api().getBlockedMembers(), /格式尚未確認/);
  setPreviewFeatureFixture("security-blocked");
  const rows = await api().getBlockedMembers(); assert.equal(rows.length, 1); assert.match(rows[0].member.id, /^preview-synthetic-/);
  await assert.rejects(api().unblockMember(rows[0].member.id), ApiError);
  rows[0].member.name = "changed"; assert.equal((await api().getBlockedMembers())[0].member.name, "合成封鎖會員");
  setPreviewFeatureFixture("normal"); assert.deepEqual(await api().getBlockedMembers(), []);
});

test("browser failure is isolated to its fixture and cannot open a real browser or send verification mail", async () => {
  await Browser.open(); setPreviewFeatureFixture("browser-error");
  assert.equal(getPreviewMember().emailVerifiedAt, null);
  await assert.rejects(Browser.open(), /SYNTHETIC_PREVIEW_BROWSER_UNAVAILABLE/);
  await assert.rejects(api().resendVerificationEmail(), ApiError);
  setPreviewFeatureFixture("normal"); await Browser.open(); assert.ok(getPreviewMember().emailVerifiedAt);
});

test("pending-member fixture preserves historical/null dates, original organization and version without granting real authority", async () => {
  setPreviewFeatureFixture("pending-members");
  assert.deepEqual(getPreviewMember().adminRoles, [{ role: "CLUB_PRESIDENT" }]);
  const client = api(), members = await client.getPendingMembers();
  assert.deepEqual(members.map(member => [member.joinYear, member.joinMonth]), [[2014, 7], [null, null], [1999, null]]);
  assert.ok(members.every(member => member.id.startsWith("preview-synthetic-") && member.organization.id.startsWith("preview-synthetic-") && Number.isFinite(Date.parse(member.updatedAt))));
  for (const member of members) for (const action of ["approve", "reject"] as const) await assert.rejects(client.reviewPendingMember(member.id, action, {
    expectedUpdatedAt: member.updatedAt, expectedOrganizationId: member.organization.id, joinYear: member.joinYear, joinMonth: member.joinMonth,
  }), ApiError);
  assert.deepEqual(await client.getPendingMembers(), members);
});

test("preview build includes real native screen components but excludes all real API/native/private adapters", () => {
  execFileSync(process.execPath, ["mobile-app/preview/build.mjs"], { cwd: root, stdio: "pipe" });
  const evidence = JSON.parse(readFileSync(new URL("../../tmp/native-ui-preview/build-evidence.json", import.meta.url), "utf8"));
  assert.equal(evidence.mode, "isolated-native-ui-candidate-synthetic-only");
  for (const flag of ["productionChanged", "nativePermissions", "networkAllowed", "keychainAccess", "credentialsIncluded", "physicalDeviceAcceptance"]) assert.equal(evidence[flag], false);
  assert.equal(evidence.realAppSignedOutPreview, true); assert.equal(evidence.mutations, "all-rejected");
  assert.deepEqual(evidence.notificationFixtures, [...PREVIEW_NOTIFICATION_FIXTURES]);
  assert.deepEqual(evidence.featureFixtures, [...PREVIEW_FEATURE_FIXTURES]);
  for (const key of ["termsAcceptance", "eventPublication", "moderation"]) assert.equal(evidence[key], "always-rejected");
  for (const screen of ["App", "Shell", "HomeScreen", "FriendsScreen", "EventsScreen", "NotificationsScreen", "MyScreen", "ScreenErrorBoundary", "SecurityScreen", "TermsConsentPrompt", "AdminScreen"]) assert.ok(evidence.sources.includes(`mobile-app/src/${screen}.tsx`));
  for (const helper of ["security-contract", "pending-member-review", "event-draft"]) assert.ok(evidence.sources.includes(`mobile-app/src/${helper}.ts`));
  assert.ok(evidence.sources.includes("mobile-app/preview/render-failure.tsx"));
  assert.ok(evidence.sources.includes("mobile-app/preview/native-stubs.ts"));
  assert.ok(evidence.sources.every((path: string) => !/mobile-app\/src\/(?:contract|native-push)\.ts$|node_modules\/@(?:capacitor|aparajita)\/|@aws-sdk|\.env(?:\.|$)/.test(path)));
  const html = readFileSync(new URL("../../tmp/native-ui-preview/index.html", import.meta.url), "utf8");
  assert.match(html, /connect-src 'none'/); assert.match(html, /img-src 'self' data:/); assert.match(html, /form-action 'none'/);
  const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
  assert.match(main, /id="preview-feature-fixture"/);
  for (const fixture of PREVIEW_FEATURE_FIXTURES) assert.ok(main.includes(`value="${fixture}"`));
});
