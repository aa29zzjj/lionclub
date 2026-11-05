import { CapacitorHttp } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Browser } from "@capacitor/browser";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import type { PushConfig, PushDeviceInput } from "./push-controller";
import { readNotificationsResponse } from "./notification-contract";
import { createMobileSessionCoordinator } from "./mobile-session";

export type OAuthProvider = "google" | "apple";
const OAUTH_REDIRECT_URI = "com.lionclubsmembership.app://oauth-callback";

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
export type PendingMember = { id: string; name: string; email: string; phone: string | null; organization: { id: string; name: string }; createdAt: string };
export type PendingExperience = { id: string; member: { id: string; name: string }; review: { label: string; requiresReason: boolean }; updatedAt: string; [key: string]: unknown };
export type AdminOrganization = { id: string; name: string; level: string; districtCode: string | null };
export type RoleMember = { id: string; name: string; email: string | null; title: string | null; eligibleForGrant: boolean; adminRoles: { id: string; role: string; validFrom: string; validUntil: string | null }[] };
export type RolesResponse = { organizations: AdminOrganization[]; organization: AdminOrganization; members: RoleMember[]; assignableRoles: string[] };
export type MemberReport = { id: string; reason: string; details: string | null; reporter: { id: string; name: string }; target: { id: string; name: string; status: string } };
export type EventReport = { id: string; reason: string; details: string | null; reporter: { id: string; name: string }; event: { id: string; title: string } | null };
export type ReportsResponse = { reports: MemberReport[]; eventReports: EventReport[] };

export type ApiErrorCode = "UNAUTHENTICATED" | "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NETWORK_ERROR" | "UNKNOWN";
export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly status?: number) {
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

/**
 * Uploads straight to the presigned S3 URL with plain `fetch`, not
 * CapacitorHttp — this request goes directly to S3, not through
 * createApiClient's origin-prefixed JSON wrapper, and needs a raw binary
 * body (CapacitorHttp's `data` field is JSON-oriented). The WebView's own
 * fetch behaves like a browser's here, so it works the same as the
 * website's identical upload step.
 */
export async function uploadToPresignedUrl(url: string, contentType: string, blob: Blob): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!response.ok) throw new ApiError("UNKNOWN", "封面照片上傳失敗，請稍後再試");
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

  async function loginWithProvider(provider: OAuthProvider): Promise<void> {
    const epoch = mobileSession.beginChange();
    await mobileSession.clear(epoch); mobileSession.assertCurrent(epoch);
    const start = await request(`/api/mobile/auth/oauth/${provider}/start`, { method: "POST", body: { redirectUri: OAUTH_REDIRECT_URI } });
    mobileSession.assertCurrent(epoch);
    if (start.status !== 200 || !start.data?.bootstrapUrl) {
      throw new ApiError("UNKNOWN", start.data?.error ?? `無法開始 ${provider} 登入`, start.status);
    }

    const result = await new Promise<{ code?: string; error?: string }>((resolve) => {
      let settled = false;
      const finish = (value: { code?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        urlListener.then((handle) => handle.remove());
        finishedListener.then((handle) => handle.remove());
        // A superseded login may clean up its own listeners but must not close
        // a newer account's browser sheet.
        if (mobileSession.isCurrent(epoch)) void Browser.close().catch(() => {});
        resolve(value);
      };
      const urlListener = App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
        if (!event.url.startsWith(OAUTH_REDIRECT_URI)) return;
        const params = new URL(event.url).searchParams;
        finish({ code: params.get("code") ?? undefined, error: params.get("error") ?? undefined });
      });
      // User dismissed the browser sheet without finishing (e.g. tapped "Cancel").
      const finishedListener = Browser.addListener("browserFinished", () => finish({ error: "OAUTH_CANCELLED" }));
      void Browser.open({ url: start.data.bootstrapUrl, presentationStyle: "popover" });
    });
    mobileSession.assertCurrent(epoch);

    if (!result.code) throw new ApiError(result.error === "OAUTH_CANCELLED" ? "UNAUTHENTICATED" : "UNKNOWN", result.error ?? `${provider} 登入未完成`);

    const exchange = await request("/api/mobile/auth/oauth/exchange", { method: "POST", body: { code: result.code } });
    mobileSession.assertCurrent(epoch);
    if (exchange.status !== 200) throw new ApiError("UNAUTHENTICATED", exchange.data?.error ?? "登入連結已過期，請重新開始", exchange.status);
    await mobileSession.writePair(epoch, exchange.data); mobileSession.assertCurrent(epoch);
  }

  async function refresh(epoch: number): Promise<boolean> {
    return mobileSession.refreshOnce(epoch, async () => {
      const { refreshToken } = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
      if (!refreshToken) return false;
      const response = await request("/api/mobile/auth/refresh", { method: "POST", body: { refreshToken } });
      mobileSession.assertCurrent(epoch);
      if (response.status === 401) {
        // Only explicit current-session rejection invalidates the pair. A late
        // 401 for A cannot clear B, and unknown network/5xx must not clear A.
        const rejectedEpoch = mobileSession.beginChange(epoch);
        await mobileSession.clear(rejectedEpoch); return false;
      }
      if (response.status !== 200) throw new ApiError("UNKNOWN", "登入更新暫時無法確認，請稍後重試", response.status);
      await mobileSession.writePair(epoch, response.data); mobileSession.assertCurrent(epoch);
      return true;
    });
  }

  /** Authenticated call with one automatic retry after a refresh, for any /api/mobile/* route. */
  async function authedRequest(path: string, init: { method: string; body?: unknown }) {
    const epoch = mobileSession.capture();
    const { accessToken } = await mobileSession.snapshot(epoch); mobileSession.assertCurrent(epoch);
    if (!accessToken) throw new ApiError("UNAUTHENTICATED", "尚未登入");

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
    }
    return response;
  }

  async function me(): Promise<Member> {
    const response = await authedRequest("/api/mobile/me", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取會員資料失敗（HTTP ${response.status}）`, response.status);
    return response.data as Member;
  }

  async function updateProfile(patch: Partial<{
    name: string; nickname: string; title: string; email: string; phone: string; bio: string; tags: string[]; birthday: string;
  }>): Promise<Member> {
    const response = await authedRequest("/api/mobile/me", { method: "PATCH", body: patch });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `更新失敗（HTTP ${response.status}）`, response.status);
    return response.data as Member;
  }

  async function resendVerificationEmail(): Promise<void> {
    const response = await authedRequest("/api/mobile/me/resend-verification", { method: "POST" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `寄送失敗（HTTP ${response.status}）`, response.status);
  }

  async function logout(): Promise<void> {
    const epoch = mobileSession.beginChange();
    const accessToken = await mobileSession.clear(epoch); mobileSession.assertCurrent(epoch);
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
  }

  async function unblockMember(memberId: string): Promise<void> {
    const response = await authedRequest(`/api/mobile/members/${memberId}/block`, { method: "DELETE" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `取消封鎖失敗（HTTP ${response.status}）`, response.status);
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
      if (response.data?.code === "TERMS_REQUIRED") throw new ApiError("UNKNOWN", "發布內容前，請先到網站閱讀並同意使用條款", response.status);
      throw new ApiError("UNKNOWN", response.data?.error ?? `發布活動失敗（HTTP ${response.status}）`, response.status);
    }
    return response.data;
  }

  async function createEventCoverUpload(contentType: string, size: number): Promise<{ uploadUrl: string; coverPhotoUrl: string }> {
    const response = await authedRequest("/api/mobile/events/cover-upload", { method: "POST", body: { contentType, size } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `準備封面照片上傳失敗（HTTP ${response.status}）`, response.status);
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
  }

  async function sendNotification(input: { eventId: string; recipientType: "selected" | "organization"; memberIds?: string[]; message?: string }): Promise<{ recipientCount: number }> {
    const response = await authedRequest("/api/mobile/notifications", { method: "POST", body: input });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `發送失敗（HTTP ${response.status}）`, response.status);
    return response.data;
  }

  async function getBlockedMembers(): Promise<BlockedMember[]> {
    const response = await authedRequest("/api/mobile/me/blocks", { method: "GET" });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取封鎖名單失敗（HTTP ${response.status}）`, response.status);
    return response.data.blocks;
  }

  async function revokeOtherSessions(password: string): Promise<{ currentSessionRetained: boolean; message: string }> {
    const epoch = mobileSession.capture();
    const response = await authedRequest("/api/mobile/me/sessions/revoke", { method: "POST", body: { password } });
    mobileSession.assertCurrent(epoch);
    if (response.status !== 200) {
      if (response.data?.code === "REAUTH_REQUIRED") throw new ApiError("UNAUTHENTICATED", response.data.error, response.status);
      throw new ApiError("UNKNOWN", response.data?.error ?? `操作失敗（HTTP ${response.status}）`, response.status);
    }
    if (response.data.accessToken && response.data.refreshToken) {
      await mobileSession.writePair(epoch, response.data); mobileSession.assertCurrent(epoch);
    }
    return response.data;
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
    return response.data.members;
  }

  async function reviewPendingMember(memberId: string, action: "approve" | "reject"): Promise<void> {
    const response = await authedRequest(`/api/mobile/admin/pending-members/${memberId}`, { method: "POST", body: { action } });
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `審核失敗（HTTP ${response.status}）`, response.status);
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
    getPushConfig, registerPushDevice, disablePushDevice, getPushReceipts, markPushReceiptsRead,
    login, loginWithProvider, me, updateProfile, resendVerificationEmail, logout, hasStoredSession,
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
