import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import type { PushConfig, PushDeviceInput } from "./push-controller";
import { readNotificationsResponse } from "./notification-contract";
import { createMobileSessionCoordinator, mobileTokenPair } from "./mobile-session";
import { NATIVE_OAUTH_REDIRECT_URI, NATIVE_OAUTH_PROTOCOL_VERSION, createNativeOAuthAttempt, nativeOAuthErrorMessage, readNativeOAuthBootstrap, waitForNativeOAuth } from "./native-oauth";
import { bytesToBase64, createImageUploadGrants } from "./native-upload";
import { mobileActionAcknowledged, readBlockedMembersResponse, readSessionRevocationResponse } from "./security-contract";
import { TERMS_VERSION } from "../../src/lib/terms";
import { readPendingMembers, pendingMemberReviewAcknowledged, validPendingMemberReviewInput } from "./pending-member-review";
import { readNativeOAuthProviders } from "./oauth-providers";

export type OAuthProvider = "google" | "apple";
export type TermsConsentStatus = { termsVersion: string; accepted: boolean; termsAcceptedAt: string | null };
// Android is a new release candidate: do not expose the existing custom-scheme
// flow until app-bound PKCE/single-use exchange acceptance is complete. This
// gate does not change or claim acceptance of the existing iOS flow.
export function nativeOAuthAvailable() { return Capacitor.getPlatform() !== "android"; }

export type Member = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  title: string | null;
  bio: string | null;
  phone: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  joinMonth: number | null;
  birthday: string | null;
  status: string;
  organization: { name: string } | null;
  tags: { name: string }[];
  adminRoles: { role: string }[];
  emailVerifiedAt: string | null;
};

export type FriendStatus = "friend" | "pending-in" | "pending-out" | "none";
export type FriendCard = {
  id: string; name: string; nickname?: string; chapter: string; title?: string; photoUrl?: string;
  status: FriendStatus; friendshipId?: string;
};
export type FriendsResponse = { friends: FriendCard[]; incoming: FriendCard[]; suggestions: FriendCard[] };
export type MemberDetail = {
  id: string; name: string; nickname: string | null; title: string | null; bio: string | null;
  photoUrl: string | null; memberNo: string | null; joinYear: number | null; joinMonth: number | null;
  organization: { id: string; name: string; districtCode: string | null };
  tags: { id: string; name: string; category: string | null }[];
  experiences: MemberExperience[];
  blockedByMe: boolean;
};

export type EventCard = {
  id: string; title: string; description?: string; location: string; capacity?: number;
  category: string; scope: string; coverPhotoUrl?: string; hostChapter: string; startAt: string;
  registeredCount: number; isRegistered: boolean; isFull: boolean;
};
export type EventDetail = EventCard & { isCheckedIn: boolean; canManage: boolean; canConvertToPersonal: boolean; hostOrganizationId: string };
export type Registration = {
  id: string; registeredAt: string; checkedInAt: string | null;
  member: { id: string; name: string; nickname: string | null; email: string | null; phone: string | null; title: string | null; photoUrl: string | null; organization: { name: string } };
};

export type NotificationItem = {
  id: string; notificationId: string; eventId: string; eventTitle: string; message: string;
  sentAt: string; readAt: string | null; sender: { id: string; name: string; nickname: string | null };
};
export type FriendInvitation = { friendshipId: string; createdAt: string; requester: { id: string; name: string; nickname: string | null; photoUrl: string | null } };
export type SentNotification = { id: string; eventTitle: string; message: string; sentAt: string; recipients: string[] };
export type NotificationsResponse = {
  inbox: NotificationItem[]; unreadCount: number; friendInvitations: FriendInvitation[]; pendingFriendCount: number;
  notifications: SentNotification[];
};
export type PushReceipt = { id: string; kind: "experience_review" | "membership_review"; title: string; body: string; createdAt: string; readAt: string | null };
export type PushReceiptsResponse = { enabled: boolean; receipts: PushReceipt[]; unreadCount: number };

export type EventPublishingOption = { scope: string; hostOrganizationId: string; hostOrganizationName: string };
export type EventsFullResponse = { allowedScopes: string[]; officialHosts: EventPublishingOption[]; tagsAvailable: boolean; events: EventCard[] };
export type CreateEventInput = {
  title: string; startAt: string; location: string; capacity?: number; description?: string;
  coverPhotoUrl?: string; category?: "PERSONAL" | "CLUB_OFFICIAL"; tags?: string[];
  scope?: "CLUB" | "ZONE" | "REGION" | "DISTRICT"; hostOrganizationId?: string;
};

export type MemberExperience = {
  id: string; kind: string; level: string; positionCode: string; positionName: string;
  organizationName: string; organizationIsUnlisted: boolean;
  multipleDistrictCode?: string; districtCode?: string;
  startYear: number; startMonth: number | null; endYear?: number;
  datePrecision: string; isCurrent: boolean; verificationStatus: string; visibility: string; note?: string;
};
export type ExperienceInput = {
  kind: "membership" | "position" | "honorary" | "advisor" | "other";
  level: "international" | "md" | "district" | "region" | "zone" | "club" | "foundation";
  positionCode: string; organizationName: string; organizationIsUnlisted?: boolean;
  multipleDistrictCode?: string; districtCode?: string;
  startYear: number; startMonth?: number | null; endYear?: number;
  datePrecision: "month" | "lions-year" | "approximate";
  isCurrent: boolean; visibility: "public" | "members" | "only-me"; note?: string;
};

export type BlockedMember = { member: { id: string; name: string; nickname: string | null; photoUrl: string | null }; createdAt: string };

export type Invite = { id: string; validFrom: string; validUntil: string; usageLimit: number | null; usageCount: number; registerUrl: string };
export type PendingMember = { id: string; name: string; email: string | null; phone: string | null; organization: { id: string; name: string }; createdAt: string; updatedAt: string; joinYear: number | null; joinMonth: number | null };
export type PendingMemberReviewInput = { expectedUpdatedAt: string; expectedOrganizationId: string; joinYear?: number | null; joinMonth?: number | null };
export type PendingExperience = { id: string; member: { id: string; name: string }; review: { label: string; requiresReason: boolean }; updatedAt: string; [key: string]: unknown };
export type AdminOrganization = { id: string; name: string; level: string; districtCode: string | null };
export type RoleMember = { id: string; name: string; email: string | null; title: string | null; eligibleForGrant: boolean; adminRoles: { id: string; role: string; validFrom: string; validUntil: string | null }[] };
export type RolesResponse = { organizations: AdminOrganization[]; organization: AdminOrganization; members: RoleMember[]; assignableRoles: string[] };
export type MemberReport = { id: string; reason: string; details: string | null; reporter: { id: string; name: string }; target: { id: string; name: string; status: string } };
export type EventReport = { id: string; reason: string; details: string | null; reporter: { id: string; name: string }; event: { id: string; title: string } | null };
export type ReportsResponse = { reports: MemberReport[]; eventReports: EventReport[] };

export type ApiErrorCode = "UNAUTHENTICATED" | "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NETWORK_ERROR" | "PROVIDER_DISABLED" | "TERMS_REQUIRED" | "UNKNOWN";
export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly status?: number, public readonly isCurrentSession?: () => boolean) {
    super(message);
  }
}

/**
 * Keychain-backed (iOS) / Keystore-backed (Android) secure storage, per
 * NATIVE_SPIKE_ACCEPTANCE_2026-10-17.md (A06, 冷啟動持久化). Writes are
 * synchronous to the OS secure store, unlike UserDefaults/SharedPreferences
 * (the previous @capacitor/preferences approach), which could lose a write
 * made just before the process is terminated.
 */
// One coordinator across ALL createApiClient instances. Background push config,
// token rotation and ordinary requests share the same generation and serialized
// Keychain operations; disposing a React controller alone cannot fence storage.
const mobileSession = createMobileSessionCoordinator({
  getItem: key => SecureStorage.getItem(key),
  async setItem(key, value) { await SecureStorage.setItem(key, value); },
  async removeItem(key) { await SecureStorage.removeItem(key); },
}, () => new ApiError("UNAUTHENTICATED", "登入狀態已更新，請重新確認本人帳號"));
const imageUploadGrants = createImageUploadGrants();
const invalidatedListeners = new Set<(isCurrent: () => boolean) => void>();
function publishSessionInvalidation(epoch: number) {
  const isCurrent = () => mobileSession.isCurrent(epoch);
  if (!isCurrent()) return;
  for (const listener of [...invalidatedListeners]) {
    try { listener(isCurrent); } catch { /* UI recovery cannot replace the original result. */ }
  }
}
async function invalidateExpiredSession(epoch: number): Promise<never> {
  const ended = mobileSession.beginChange(epoch);
  let cleared = false;
  try { await mobileSession.clear(ended); mobileSession.assertCurrent(ended); cleared = true; }
  catch { /* Preserve the exact ended-session guard for UI recovery below. */ }
  finally { publishSessionInvalidation(ended); }
  throw new ApiError("UNAUTHENTICATED", cleared ? "登入已過期，請重新登入。" : "登入已失效，本機清除尚未確認，請重試登出。", 401, () => mobileSession.isCurrent(ended));
}

/** Native binary PUT, limited to one exact URL granted by an authenticated
 * presign call. No global fetch patch or wider CSP connection policy. */
export async function uploadToPresignedUrl(url: string, contentType: string, blob: Blob): Promise<void> {
  // Installed Android file transport writes no bytes on API 24–25. Keep all
  // Android versions closed until a trustworthy native decoder path is added.
  if (Capacitor.getPlatform() !== "ios") throw new ApiError("UNKNOWN", "此裝置的圖片上傳尚未開放，請至網站操作。");
  const epoch = mobileSession.capture();
  try {
    imageUploadGrants.consume(url, contentType, blob.size, epoch);
    if (blob.type && blob.type !== contentType) throw Error("Image type mismatch");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== blob.size) throw Error("Image size mismatch");
    mobileSession.assertCurrent(epoch);
    const response = await CapacitorHttp.request({
      url, method: "PUT", headers: { "Content-Type": contentType }, data: bytesToBase64(bytes), dataType: "file",
      disableRedirects: true, shouldEncodeUrlParams: false, responseType: "text", connectTimeout: 15_000, readTimeout: 60_000,
    });
    mobileSession.assertCurrent(epoch);
    if (response.status < 200 || response.status >= 300 || typeof response.url !== "string") throw Error("Upload not confirmed");
    const actual = new URL(response.url), issued = new URL(url);
    if (actual.origin !== issued.origin || actual.pathname !== issued.pathname) throw Error("Upload target changed");
  } catch {
    // Native errors can contain the signed URL. Never log or expose them.
    throw new ApiError("UNKNOWN", "圖片上傳未完成，請重新選擇圖片後再試。");
  }
}

export function createApiClient(baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, "");

  async function request(path: string, init: { method: string; body?: unknown; accessToken?: string | null }) {
    try {
      return await CapacitorHttp.request({
        method: init.method,
        url: `${origin}${path}`,
        headers: {
          "Content-Type": "application/json",
          ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
        },
        data: init.body,
      });
    } catch {
      throw new ApiError("NETWORK_ERROR", "無法連線，請檢查網路");
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const epoch = mobileSession.beginChange();
    await mobileSession.clear(epoch); mobileSession.assertCurrent(epoch);
    const response = await request("/api/mobile/auth/login", { method: "POST", body: { email, password } });
    mobileSession.assertCurrent(epoch);
    if (response.status === 401) throw new ApiError("INVALID_CREDENTIALS", response.data?.error ?? "帳號或密碼錯誤", 401);
    if (response.status === 429) throw new ApiError("RATE_LIMITED", response.data?.error ?? "嘗試次數過多，請稍後再試", 429);
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `登入失敗（HTTP ${response.status}）`, response.status);
    await mobileSession.writePair(epoch, response.data); mobileSession.assertCurrent(epoch);
  }

  async function getOAuthProviders(): Promise<OAuthProvider[]> {
    if (!nativeOAuthAvailable()) return [];
    const response = await request("/api/mobile/auth/providers", { method: "GET" });
    // An older server does not implement the v2 provider discovery contract.
    if (response.status === 404) return [];
    if (response.status !== 200) throw new ApiError("NETWORK_ERROR", "目前無法確認其他登入方式，仍可使用會員信箱與密碼登入。", response.status);
    try { return readNativeOAuthProviders(response.data); }
    catch { throw new ApiError("UNKNOWN", "其他登入方式的設定尚未確認，請重新確認或使用會員信箱與密碼登入。"); }
  }

  async function loginWithProvider(provider: OAuthProvider): Promise<void> {
    // Refuse even direct calls before changing a session, touching secure
    // storage, installing listeners, opening a browser or making a request.
    if (!nativeOAuthAvailable()) throw new ApiError("PROVIDER_DISABLED", "第三方登入尚未開放，請使用會員信箱與密碼登入。", 503);
    const epoch = mobileSession.beginChange();
    await mobileSession.clear(epoch); mobileSession.assertCurrent(epoch);
    let attempt: Awaited<ReturnType<typeof createNativeOAuthAttempt>>;
    try { attempt = await createNativeOAuthAttempt(); }
    catch { throw new ApiError("UNKNOWN", "目前無法安全開始登入，請稍後重試。"); }
    mobileSession.assertCurrent(epoch);
    const start = await request(`/api/mobile/auth/oauth/${provider}/start`, { method: "POST", body: {
      protocolVersion: NATIVE_OAUTH_PROTOCOL_VERSION, redirectUri: NATIVE_OAUTH_REDIRECT_URI,
      state: attempt.state, codeChallenge: attempt.codeChallenge, codeChallengeMethod: "S256",
    } });
    mobileSession.assertCurrent(epoch);
    if (start.status !== 200) {
      throw new ApiError("UNKNOWN", start.data?.error ?? `無法開始 ${provider} 登入`, start.status);
    }
    const bootstrapUrl = readNativeOAuthBootstrap(start.data, baseUrl, attempt.state);
    if (!bootstrapUrl) throw new ApiError("UNKNOWN", "第三方登入服務尚未完成更新，請先使用會員信箱與密碼登入。", 503);

    const result = await waitForNativeOAuth({
      state: attempt.state,
      listenForUrl: callback => App.addListener("appUrlOpen", event => callback(event.url)),
      listenForClose: callback => Browser.addListener("browserFinished", callback),
      openBrowser: () => Browser.open({ url: bootstrapUrl, presentationStyle: "popover" }),
      closeBrowser: () => Browser.close(),
      // An old attempt must never close a newer account's browser sheet.
      isCurrent: () => mobileSession.isCurrent(epoch),
    });
    mobileSession.assertCurrent(epoch);

    if (!result.code) throw new ApiError(result.error === "OAUTH_CANCELLED" ? "UNAUTHENTICATED" : "UNKNOWN", nativeOAuthErrorMessage(result.error));

    const exchange = await request("/api/mobile/auth/oauth/exchange", { method: "POST", body: {
      protocolVersion: NATIVE_OAUTH_PROTOCOL_VERSION, code: result.code, codeVerifier: attempt.codeVerifier,
      state: attempt.state, redirectUri: NATIVE_OAUTH_REDIRECT_URI,
    } });
    mobileSession.assertCurrent(epoch);
    if (exchange.status !== 200) throw new ApiError("UNAUTHENTICATED", exchange.data?.error ?? "登入連結已過期，請重新開始", exchange.status);
    await mobileSession.writePair(epoch, exchange.data); mobileSession.assertCurrent(epoch);
  }

  async function refresh(epoch: number): Promise<boolean> {
    return mobileSession.refreshOnce(epoch, async () => {
      const { refreshToken } = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
      if (!refreshToken) return invalidateExpiredSession(epoch);
      const response = await request("/api/mobile/auth/refresh", { method: "POST", body: { refreshToken } });
      mobileSession.assertCurrent(epoch);
      if (response.status === 401) {
        // Only explicit current-session rejection invalidates the pair. A late
        // 401 for A cannot clear B, and unknown network/5xx must not clear A.
        return invalidateExpiredSession(epoch);
      }
      if (response.status !== 200) throw new ApiError("UNKNOWN", "登入更新暫時無法確認，請稍後重試", response.status);
      let pair: ReturnType<typeof mobileTokenPair>;
      try { pair = mobileTokenPair(response.data); }
      catch { throw new ApiError("UNKNOWN", "登入更新回覆尚未確認，請稍後重試。", response.status); }
      try { await mobileSession.writePair(epoch, pair); mobileSession.assertCurrent(epoch); }
      catch {
        publishSessionInvalidation(epoch);
        throw new ApiError("UNKNOWN", "此裝置登入更新尚未保存，請重新登入。", undefined, () => mobileSession.isCurrent(epoch));
      }
      return true;
    });
  }

  /** Authenticated call with one automatic retry after a refresh, for any /api/mobile/* route. */
  async function authedRequest(path: string, init: { method: string; body?: unknown }) {
    const epoch = mobileSession.capture();
    const { accessToken } = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
    if (!accessToken) {
      publishSessionInvalidation(epoch);
      throw new ApiError("UNAUTHENTICATED", "尚未登入", 401, () => mobileSession.isCurrent(epoch));
    }

    let response = await request(path, { ...init, accessToken });
    mobileSession.assertCurrent(epoch);
    if (response.status === 401) {
      // Another request may already have refreshed this SAME session while our
      // old-token response was in flight. Never refresh or retry as a new epoch.
      const latest = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
      const refreshed = latest.accessToken && latest.accessToken !== accessToken ? true : await refresh(epoch);
      mobileSession.assertCurrent(epoch);
      if (!refreshed) throw new ApiError("UNAUTHENTICATED", "登入已過期，請重新登入");
      const { accessToken: refreshedAccessToken } = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
      if (!refreshedAccessToken) throw new ApiError("UNAUTHENTICATED", "尚未登入");
      response = await request(path, { ...init, accessToken: refreshedAccessToken });
      mobileSession.assertCurrent(epoch);
      // A retry may discover a revoked session even after refresh succeeded.
      // Match the backend's authentication refusal exactly: other 401s (for
      // example a wrong reauthentication password) do not end this session.
      if (response.status === 401 && response.data?.error === "未登入或登入已過期") {
        return invalidateExpiredSession(epoch);
      }
    }
    return response;
  }

  async function me(): Promise<Member> {
    const response = await authedRequest("/api/mobile/me", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取會員資料失敗（HTTP ${response.status}）`, response.status);
    return response.data as Member;
  }

  function readTermsConsent(data: unknown): TermsConsentStatus {
    const row = data as Partial<TermsConsentStatus> | null;
    if (!row || row.termsVersion !== TERMS_VERSION || typeof row.accepted !== "boolean"
      || (row.accepted ? typeof row.termsAcceptedAt !== "string" || !Number.isFinite(Date.parse(row.termsAcceptedAt))
        || new Date(row.termsAcceptedAt).toISOString() !== row.termsAcceptedAt : row.termsAcceptedAt !== null)) {
      throw new ApiError("UNKNOWN", "使用條款版本或同意狀態尚未確認，請更新 App 或稍後重新讀取。");
    }
    return row as TermsConsentStatus;
  }

  async function getTermsConsent(): Promise<TermsConsentStatus> {
    const response = await authedRequest("/api/mobile/me/terms-consent", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", "使用條款狀態尚未讀取完成，請稍後再試。", response.status);
    return readTermsConsent(response.data);
  }

  async function acceptTerms(termsVersion: string): Promise<TermsConsentStatus> {
    if (termsVersion !== TERMS_VERSION) throw new ApiError("UNKNOWN", "使用條款版本已更新，請重新讀取後再試。");
    const response = await authedRequest("/api/mobile/me/terms-consent", { method: "POST", body: { accept: true, termsVersion } });
    if (response.status !== 200 || response.data?.ok !== true) throw new ApiError("UNKNOWN", "同意結果尚未確認，請重新讀取後再試。", response.status);
    const status = readTermsConsent(response.data);
    if (!status.accepted) throw new ApiError("UNKNOWN", "同意結果尚未確認，請重新讀取後再試。");
    return status;
  }

  async function updateProfile(patch: Partial<{
    name: string; nickname: string; title: string; email: string; phone: string; bio: string; tags: string[]; birthday: string; photoUrl: string;
  }>): Promise<Member> {
    const response = await authedRequest("/api/mobile/me", { method: "PATCH", body: patch });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `更新失敗（HTTP ${response.status}）`, response.status);
    return response.data as Member;
  }

  async function createAvatarUpload(contentType: string, size: number): Promise<{ uploadUrl: string; photoUrl: string; expiresIn?: number }> {
    const response = await authedRequest("/api/mobile/me/avatar-upload", { method: "POST", body: { contentType, size } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `準備大頭貼上傳失敗（HTTP ${response.status}）`, response.status);
    try {
      if (typeof response.data?.uploadUrl !== "string" || typeof response.data?.photoUrl !== "string") throw Error("Invalid upload response");
      imageUploadGrants.register(response.data.uploadUrl, contentType, size, mobileSession.capture(), "avatars", response.data.expiresIn);
    } catch { throw new ApiError("UNKNOWN", "無法準備圖片上傳，請重新選擇圖片。"); }
    return response.data;
  }

  async function resendVerificationEmail(): Promise<void> {
    const response = await authedRequest("/api/mobile/me/resend-verification", { method: "POST" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `寄送失敗（HTTP ${response.status}）`, response.status);
    if (!mobileActionAcknowledged(response.data)) throw new ApiError("UNKNOWN", "寄送請求尚未確認，請稍後重新確認。", response.status);
  }

  async function logout(): Promise<() => boolean> {
    const epoch = mobileSession.beginChange();
    let accessToken: string | null;
    try { accessToken = await mobileSession.clear(epoch); mobileSession.assertCurrent(epoch); }
    catch { throw new ApiError("UNKNOWN", "此裝置的本機登入清除尚未確認，請重試登出。", undefined, () => mobileSession.isCurrent(epoch)); }
    if (accessToken) {
      // Best-effort only: stateless JWTs can't be revoked server-side per device.
      // Local tokens are already cleared above regardless of this call's outcome.
      try {
        await request("/api/mobile/auth/logout", { method: "POST", accessToken });
      } catch {
        /* ignore */
      }
    }
    mobileSession.assertCurrent(epoch);
    return () => mobileSession.isCurrent(epoch);
  }

  async function getPushConfig(): Promise<PushConfig> {
    const response = await authedRequest("/api/mobile/push/config", { method: "GET" });
    if ([404, 503].includes(response.status)) return { enabled: false, privacyMode: "generic" };
    if (response.status !== 200 || typeof response.data?.enabled !== "boolean" || response.data?.privacyMode !== "generic") throw new ApiError("UNKNOWN", "無法確認手機通知設定");
    return response.data as PushConfig;
  }
  async function registerPushDevice(input: PushDeviceInput): Promise<void> {
    const response = await authedRequest("/api/mobile/push/devices", { method: "POST", body: input });
    if (response.status !== 200 || response.data?.ok !== true) throw new ApiError("UNKNOWN", "手機通知登記尚未確認", response.status);
  }
  async function disablePushDevice(input: { installationId: string; revision: number }): Promise<void> {
    const response = await authedRequest("/api/mobile/push/devices", { method: "DELETE", body: input });
    if (response.status !== 200 || response.data?.ok !== true) throw new ApiError("UNKNOWN", "伺服器停用通知尚未確認", response.status);
  }
  async function getPushReceipts(): Promise<PushReceiptsResponse> {
    const response = await authedRequest("/api/mobile/push/receipts", { method: "GET" });
    if ([404, 503].includes(response.status)) return { enabled: false, receipts: [], unreadCount: 0 };
    const data = response.data;
    if (response.status !== 200 || typeof data?.enabled !== "boolean" || !Array.isArray(data?.receipts)
      || !Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0) throw new ApiError("UNKNOWN", "審核通知讀取尚未完成");
    for (const row of data.receipts) if (!row || !["experience_review", "membership_review"].includes(row.kind)
      || ![row.id, row.title, row.body, row.createdAt].every(value => typeof value === "string")
      || row.readAt !== null && typeof row.readAt !== "string") throw new ApiError("UNKNOWN", "審核通知格式尚未確認");
    return data as PushReceiptsResponse;
  }
  async function markPushReceiptsRead(ids: string[]): Promise<void> {
    const response = await authedRequest("/api/mobile/push/receipts", { method: "PATCH", body: { ids } });
    if (response.status !== 200 || response.data?.ok !== true) throw new ApiError("UNKNOWN", "通知已讀狀態尚未確認", response.status);
  }

  async function hasStoredSession(): Promise<boolean> {
    const epoch = mobileSession.capture();
    const pair = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
    return pair.accessToken !== null && pair.refreshToken !== null;
  }

  async function getFriends(): Promise<FriendsResponse> {
    const response = await authedRequest("/api/mobile/friends", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取好友失敗（HTTP ${response.status}）`, response.status);
    return response.data as FriendsResponse;
  }

  async function searchMembers(query: string): Promise<{ id: string; name: string; nickname?: string; chapter: string; title?: string }[]> {
    const response = await authedRequest(`/api/mobile/friends/search?q=${encodeURIComponent(query)}`, { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `搜尋失敗（HTTP ${response.status}）`, response.status);
    return response.data.members;
  }

  async function addFriendByQr(memberId: string): Promise<void> {
    const response = await authedRequest("/api/mobile/friends/qr-add", { method: "POST", body: { memberId } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `加好友失敗（HTTP ${response.status}）`, response.status);
  }

  async function requestFriend(memberId: string): Promise<void> {
    const response = await authedRequest("/api/mobile/friends/request", { method: "POST", body: { memberId } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `送出邀請失敗（HTTP ${response.status}）`, response.status);
  }

  async function respondFriend(friendshipId: string, action: "accept" | "decline"): Promise<void> {
    const response = await authedRequest(`/api/mobile/friends/${friendshipId}/respond`, { method: "POST", body: { action } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `回覆邀請失敗（HTTP ${response.status}）`, response.status);
  }

  async function getMember(memberId: string): Promise<MemberDetail> {
    const response = await authedRequest(`/api/mobile/members/${memberId}`, { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取會員資料失敗（HTTP ${response.status}）`, response.status);
    return response.data.member as MemberDetail;
  }

  async function blockMember(memberId: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/members/${memberId}/block`, { method: "POST" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `封鎖失敗（HTTP ${response.status}）`, response.status);
    if (!mobileActionAcknowledged(response.data)) throw new ApiError("UNKNOWN", "封鎖結果尚未確認，請重新讀取會員狀態。", response.status);
  }

  async function unblockMember(memberId: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/members/${memberId}/block`, { method: "DELETE" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `取消封鎖失敗（HTTP ${response.status}）`, response.status);
    if (!mobileActionAcknowledged(response.data)) throw new ApiError("UNKNOWN", "取消封鎖結果尚未確認，請重新讀取封鎖名單。", response.status);
  }

  async function reportMember(memberId: string, reason: string, details?: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/members/${memberId}/report`, { method: "POST", body: { reason, details } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `檢舉失敗（HTTP ${response.status}）`, response.status);
  }

  async function getEvents(): Promise<EventCard[]> {
    const response = await authedRequest("/api/mobile/events", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取活動失敗（HTTP ${response.status}）`, response.status);
    return response.data.events;
  }

  async function getEventsFull(): Promise<EventsFullResponse> {
    const response = await authedRequest("/api/mobile/events", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取活動失敗（HTTP ${response.status}）`, response.status);
    return response.data as EventsFullResponse;
  }

  async function createEvent(input: CreateEventInput): Promise<{ eventId: string }> {
    const response = await authedRequest("/api/mobile/events", { method: "POST", body: input });
    if (response.status !== 200) {
      if (response.data?.code === "TERMS_REQUIRED") throw new ApiError("TERMS_REQUIRED", "發布內容前，請先閱讀並同意使用條款。", response.status);
      throw new ApiError("UNKNOWN", response.data?.error ?? `發布活動失敗（HTTP ${response.status}）`, response.status);
    }
    return response.data;
  }

  async function createEventCoverUpload(contentType: string, size: number): Promise<{ uploadUrl: string; coverPhotoUrl: string }> {
    const response = await authedRequest("/api/mobile/events/cover-upload", { method: "POST", body: { contentType, size } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `準備封面照片上傳失敗（HTTP ${response.status}）`, response.status);
    try {
      if (typeof response.data?.uploadUrl !== "string" || typeof response.data?.coverPhotoUrl !== "string") throw Error("Invalid upload response");
      imageUploadGrants.register(response.data.uploadUrl, contentType, size, mobileSession.capture(), "events", response.data.expiresIn);
    } catch { throw new ApiError("UNKNOWN", "無法準備圖片上傳，請重新選擇圖片。"); }
    return response.data;
  }

  async function getEvent(eventId: string): Promise<EventDetail> {
    const response = await authedRequest(`/api/mobile/events/${eventId}`, { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取活動失敗（HTTP ${response.status}）`, response.status);
    return response.data.event;
  }

  async function toggleEventRegistration(eventId: string): Promise<{ registered: boolean }> {
    const response = await authedRequest(`/api/mobile/events/${eventId}/register`, { method: "POST" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `報名失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function checkInToEvent(eventId: string, body: { qrValue: string } | { memberId: string; method: "manual"; reason: string }): Promise<void> {
    const response = await authedRequest(`/api/mobile/events/${eventId}/check-in`, { method: "POST", body });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `報到失敗（HTTP ${response.status}）`, response.status);
  }

  async function getEventRegistrations(eventId: string): Promise<{ registrations: Registration[]; checkedInCount: number; registeredCount: number }> {
    const response = await authedRequest(`/api/mobile/events/${eventId}/registrations`, { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取報名名單失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function reportEvent(eventId: string, reason: string, details?: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/events/${eventId}/report`, { method: "POST", body: { reason, details } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `檢舉失敗（HTTP ${response.status}）`, response.status);
  }

  async function getNotifications(): Promise<NotificationsResponse> {
    const response = await authedRequest("/api/mobile/notifications", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取通知失敗（HTTP ${response.status}）`, response.status);
    try { return readNotificationsResponse(response.data); }
    catch { throw new ApiError("UNKNOWN", "通知資料格式尚未確認，請重新讀取；不代表沒有通知"); }
  }

  async function markNotificationsRead(ids: string[]): Promise<void> {
    const response = await authedRequest("/api/mobile/notifications", { method: "PATCH", body: { ids } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `標記已讀失敗（HTTP ${response.status}）`, response.status);
    if (response.data?.ok !== true || !Number.isSafeInteger(response.data.updatedCount)
      || response.data.updatedCount < 0 || response.data.updatedCount > new Set(ids).size) {
      throw new ApiError("UNKNOWN", "通知已讀狀態尚未確認，請重新讀取後再試。");
    }
  }

  async function sendNotification(input: { eventId: string; recipientType: "selected" | "organization"; memberIds?: string[]; message?: string }): Promise<{ recipientCount: number }> {
    const response = await authedRequest("/api/mobile/notifications", { method: "POST", body: input });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `發送失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function getBlockedMembers(): Promise<BlockedMember[]> {
    const response = await authedRequest("/api/mobile/me/blocks", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取封鎖名單失敗（HTTP ${response.status}）`, response.status);
    try { return readBlockedMembersResponse(response.data); }
    catch { throw new ApiError("UNKNOWN", "封鎖名單格式尚未確認，請重新讀取；不代表沒有封鎖會員。"); }
  }

  async function revokeOtherSessions(password: string): Promise<{ currentSessionRetained: boolean; message: string; isCurrent: () => boolean }> {
    const epoch = mobileSession.capture();
    const response = await authedRequest("/api/mobile/me/sessions/revoke", { method: "POST", body: { password } });
    mobileSession.assertCurrent(epoch);
    if (response.status !== 200) {
      if (response.data?.code === "REAUTH_REQUIRED") throw new ApiError("UNAUTHENTICATED", response.data.error, response.status);
      throw new ApiError("UNKNOWN", response.data?.error ?? `操作失敗（HTTP ${response.status}）`, response.status);
    }
    let result: ReturnType<typeof readSessionRevocationResponse>;
    try { result = readSessionRevocationResponse(response.data); }
    catch { throw new ApiError("UNKNOWN", "登出結果尚未確認，請重新確認登入狀態；不會自動重送。", response.status); }
    let isCurrent = () => mobileSession.isCurrent(epoch);
    if (result.currentSessionRetained) {
      try { await mobileSession.writePair(epoch, result.pair); mobileSession.assertCurrent(epoch); }
      catch {
        publishSessionInvalidation(epoch);
        throw new ApiError("UNKNOWN", "其他裝置已登出，但此裝置登入更新尚未保存，請重新登入。", undefined, () => mobileSession.isCurrent(epoch));
      }
    } else {
      const ended = mobileSession.beginChange(epoch);
      try { await mobileSession.clear(ended); mobileSession.assertCurrent(ended); }
      catch { throw new ApiError("UNKNOWN", "其他裝置已登出，但此裝置本機登入清除尚未確認，請重試登出。", undefined, () => mobileSession.isCurrent(ended)); }
      finally { publishSessionInvalidation(ended); }
      isCurrent = () => mobileSession.isCurrent(ended);
    }
    return { currentSessionRetained: result.currentSessionRetained, message: result.message, isCurrent };
  }

  async function getInvites(): Promise<Invite[]> {
    const response = await authedRequest("/api/mobile/admin/invites", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取邀請失敗（HTTP ${response.status}）`, response.status);
    return response.data.invites;
  }

  async function createInvite(validDays?: number): Promise<{ registerUrl: string }> {
    const response = await authedRequest("/api/mobile/admin/invites", { method: "POST", body: validDays ? { validDays } : {} });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `建立邀請失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function getPendingMembers(): Promise<PendingMember[]> {
    const response = await authedRequest("/api/mobile/admin/pending-members", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取待審會員失敗（HTTP ${response.status}）`, response.status);
    try { return readPendingMembers(response.data); }
    catch { throw new ApiError("UNKNOWN", "申請的歷史入會年月或版本尚未讀取完成，請重新載入；請勿以今天代替。"); }
  }

  async function reviewPendingMember(memberId: string, action: "approve" | "reject", input: PendingMemberReviewInput): Promise<void> {
    if (!validPendingMemberReviewInput(action, input)) throw new ApiError("UNKNOWN", "請先核對完整的入會年月、分會及申請版本。");
    const response = await authedRequest(`/api/mobile/admin/pending-members/${encodeURIComponent(memberId)}`, { method: "POST", body: { action,
      expectedUpdatedAt: input.expectedUpdatedAt, expectedOrganizationId: input.expectedOrganizationId,
      ...(action === "approve" ? { joinYear: input.joinYear, joinMonth: input.joinMonth } : {}),
    } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `審核失敗（HTTP ${response.status}）`, response.status);
    if (!pendingMemberReviewAcknowledged(response.data, action, input)) throw new ApiError("UNKNOWN", "審核結果尚未確認，請重新載入名單確認後再操作。");
  }

  async function getPendingExperiences(): Promise<PendingExperience[]> {
    const response = await authedRequest("/api/mobile/admin/pending-experiences", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取待審資歷失敗（HTTP ${response.status}）`, response.status);
    return response.data.experiences;
  }

  async function reviewPendingExperience(experienceId: string, action: "verify" | "reject", expectedUpdatedAt: string, reason?: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/admin/pending-experiences/${experienceId}`, { method: "POST", body: { action, expectedUpdatedAt, reviewReason: reason } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `審核失敗（HTTP ${response.status}）`, response.status);
  }

  async function getRoles(organizationId?: string): Promise<RolesResponse> {
    const response = await authedRequest(`/api/mobile/admin/roles${organizationId ? `?organizationId=${organizationId}` : ""}`, { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取角色失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function grantRole(organizationId: string, memberId: string, role: string, validUntil?: string): Promise<void> {
    const response = await authedRequest("/api/mobile/admin/roles", { method: "POST", body: { organizationId, memberId, role, validUntil } });
    if (response.status !== 201) throw new ApiError("UNKNOWN", response.data?.error ?? `授權失敗（HTTP ${response.status}）`, response.status);
  }

  async function revokeRole(roleId: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/admin/roles/${roleId}`, { method: "DELETE" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `撤銷失敗（HTTP ${response.status}）`, response.status);
  }

  async function getReports(): Promise<ReportsResponse> {
    const response = await authedRequest("/api/mobile/admin/reports", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取檢舉失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function moderateReport(reportId: string, kind: "member" | "event", action: "review" | "dismiss" | "suspend" | "remove_content"): Promise<void> {
    const response = await authedRequest(`/api/mobile/admin/reports/${reportId}`, { method: "POST", body: { kind, action } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `處理失敗（HTTP ${response.status}）`, response.status);
  }

  async function searchAssignableMembers(q: string): Promise<{ id: string; name: string; email: string | null; organizationAssignmentStatus: string }[]> {
    const response = await authedRequest(`/api/mobile/admin/member-assignments?status=ALL&q=${encodeURIComponent(q)}`, { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `搜尋失敗（HTTP ${response.status}）`, response.status);
    return response.data.members;
  }

  async function getMyExperiences(): Promise<MemberExperience[]> {
    const response = await authedRequest("/api/mobile/me/experiences", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取資歷失敗（HTTP ${response.status}）`, response.status);
    return response.data.experiences;
  }

  async function createExperience(input: ExperienceInput): Promise<MemberExperience> {
    const response = await authedRequest("/api/mobile/me/experiences", { method: "POST", body: input });
    if (response.status !== 201) throw new ApiError("UNKNOWN", response.data?.error ?? `新增資歷失敗（HTTP ${response.status}）`, response.status);
    return response.data.experience;
  }

  async function updateExperience(experienceId: string, input: ExperienceInput): Promise<MemberExperience> {
    const response = await authedRequest(`/api/mobile/me/experiences/${experienceId}`, { method: "PATCH", body: input });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `更新資歷失敗（HTTP ${response.status}）`, response.status);
    return response.data.experience;
  }

  async function deleteExperience(experienceId: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/me/experiences/${experienceId}`, { method: "DELETE" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `刪除資歷失敗（HTTP ${response.status}）`, response.status);
  }

  return {
    getOAuthProviders,
    onSessionInvalidated(listener: (isCurrent: () => boolean) => void) { invalidatedListeners.add(listener); return () => { invalidatedListeners.delete(listener); }; },
    captureSessionGuard() { const epoch = mobileSession.capture(); return () => mobileSession.isCurrent(epoch); },
    getPushConfig, registerPushDevice, disablePushDevice, getPushReceipts, markPushReceiptsRead,
    login, loginWithProvider, me, getTermsConsent, acceptTerms, updateProfile, createAvatarUpload, resendVerificationEmail, logout, hasStoredSession,
    getFriends, searchMembers, addFriendByQr, requestFriend, respondFriend,
    getMember, blockMember, unblockMember, reportMember,
    getEvents, getEventsFull, createEvent, createEventCoverUpload, getEvent, toggleEventRegistration, checkInToEvent,
    getEventRegistrations, reportEvent,
    getNotifications, markNotificationsRead, sendNotification,
    getBlockedMembers, revokeOtherSessions,
    getInvites, createInvite, getPendingMembers, reviewPendingMember,
    getPendingExperiences, reviewPendingExperience, getRoles, grantRole, revokeRole,
    getReports, moderateReport, searchAssignableMembers,
    getMyExperiences, createExperience, updateExperience, deleteExperience,
  };
}
