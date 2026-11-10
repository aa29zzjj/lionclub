import { servicePreviewData } from "./service-fixtures";
import type { createApiClient as RealClient } from "../src/contract";
import { member, friends, incoming, events, experiences, eventPublishingOptions, blockedMembers, pendingMembers } from "./fixtures";
import { readNotificationsResponse } from "../src/notification-contract";
import { readBlockedMembersResponse } from "../src/security-contract";
import { readPendingMembers } from "../src/pending-member-review";
import { TERMS_VERSION } from "../../src/lib/terms";
export type * from "../src/contract";

type NativeApi = ReturnType<typeof RealClient>;
export const PREVIEW_NOTIFICATION_FIXTURES = ["normal", "load-error", "malformed", "compose-error", "empty-friends", "render-error"] as const;
export type PreviewNotificationFixture = typeof PREVIEW_NOTIFICATION_FIXTURES[number];
let notificationFixture: PreviewNotificationFixture = "normal";
export function setPreviewNotificationFixture(value: PreviewNotificationFixture) {
  if (!(PREVIEW_NOTIFICATION_FIXTURES as readonly unknown[]).includes(value)) throw Error("UNKNOWN_PREVIEW_FIXTURE");
  notificationFixture = value;
}
export function getPreviewNotificationFixture() { return notificationFixture; }
export const PREVIEW_FEATURE_FIXTURES = ["normal", "event-scope", "event-settings-error", "event-options-invalid", "terms-required", "terms-read-error", "security-read-error", "security-malformed", "security-blocked", "browser-error", "pending-members"] as const;
export type PreviewFeatureFixture = typeof PREVIEW_FEATURE_FIXTURES[number];
let featureFixture: PreviewFeatureFixture = "normal";
export function setPreviewFeatureFixture(value: PreviewFeatureFixture) {
  if (!(PREVIEW_FEATURE_FIXTURES as readonly unknown[]).includes(value)) throw Error("UNKNOWN_PREVIEW_FEATURE_FIXTURE");
  featureFixture = value;
}
export function getPreviewFeatureFixture() { return featureFixture; }
export function getPreviewMember() {
  return copy(featureFixture === "pending-members" ? { ...member, title: "分會幹部（合成）", adminRoles: [{ role: "CLUB_PRESIDENT" }] }
    : featureFixture === "browser-error" ? { ...member, emailVerifiedAt: null } : member);
}
// UI visibility fixture only; neither provider can authenticate in this bundle.
export function nativeOAuthAvailable() { return true; }
export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) { super(message); }
}
export function previewNotice(message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("native-preview-notice", { detail: message }));
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const refused = async (): Promise<never> => {
  previewNotice("介面預覽：這項操作未執行，也不會儲存。");
  throw new ApiError("UNKNOWN", "介面預覽：操作未執行，也不會儲存。", 409);
};
export async function uploadToPresignedUrl(): Promise<never> { return refused(); }

export function createApiClient(baseUrl: string): NativeApi {
  if (baseUrl !== "https://native-preview.invalid") throw new Error("PREVIEW_ORIGIN_REQUIRED");
  const reads: Record<string, (...args: any[]) => unknown> = {
    captureSessionGuard: () => () => true,
    onSessionInvalidated: () => () => {},
    serviceRequest: async (method: string, query: string) => method !== "GET" ? { status: 409, data: { error: "合成介面預覽：操作未儲存，草稿保留。" } } : new URLSearchParams(query).get("view")?.endsWith("export") ? { status: 200, data: { filename: "LionClubs-synthetic-preview.md", content: "# 合成服務摘要\n\n此文件只有合成資料，不是正式會員紀錄。\n\n已確認服務：4 小時\n待確認：2 小時\n\n不是官方核定服務證明。" } } : { status: 200, data: servicePreviewData(getPreviewMember().id) },
    me: async () => getPreviewMember(),
    hasStoredSession: async () => false,
    getOAuthProviders: async () => ["google", "apple"],
    getFriends: async () => {
      if (notificationFixture === "compose-error") throw new ApiError("NETWORK_ERROR", "合成情境：活動與好友尚未讀取完成，請重新讀取。");
      return copy(notificationFixture === "empty-friends" ? { friends: [], incoming: [], suggestions: [] } : { friends, incoming, suggestions: [] });
    },
    searchMembers: async (query: string) => copy(friends.filter((friend) => friend.name.includes(query) || friend.nickname?.includes(query))),
    getMember: async (id: string) => {
      const selected = [...friends, ...incoming].find((friend) => friend.id === id);
      if (!selected) throw new ApiError("UNKNOWN", "預覽中沒有這位合成會員", 404);
      return copy({ ...selected, nickname: selected.nickname ?? null, bio: "合成會員檔案，非真實人物。", photoUrl: null, memberNo: "PREVIEW", joinYear: 2023, joinMonth: 7, organization: { id: "preview-org", name: selected.chapter, districtCode: null }, tags: [], experiences, blockedByMe: false });
    },
    getEvents: async () => copy(events),
    getEventsFull: async () => {
      if (featureFixture === "event-settings-error") throw new ApiError("NETWORK_ERROR", "合成情境：活動發布設定尚未讀取完成，請重新讀取；草稿仍保留。");
      if (featureFixture === "event-options-invalid") return copy({ events, allowedScopes: ["CLUB"], officialHosts: [{ ...eventPublishingOptions[0], scope: "ZONE" }], tagsAvailable: false });
      return copy({ events, allowedScopes: featureFixture === "event-scope" ? eventPublishingOptions.map(option => option.scope) : [],
        officialHosts: featureFixture === "event-scope" ? eventPublishingOptions : [], tagsAvailable: false });
    },
    getTermsConsent: async () => {
      if (featureFixture === "terms-read-error") throw new ApiError("NETWORK_ERROR", "合成情境：使用條款狀態尚未讀取完成，並不表示已同意。");
      return { termsVersion: TERMS_VERSION, accepted: false, termsAcceptedAt: null };
    },
    createEvent: async (input: unknown) => {
      if (["terms-required", "terms-read-error"].includes(featureFixture)) throw new ApiError("TERMS_REQUIRED", "發布內容前，請先閱讀並同意使用條款。", 428);
      if (featureFixture === "event-scope" && input && typeof input === "object") {
        const candidate = input as { category?: unknown; scope?: unknown; hostOrganizationId?: unknown };
        const option = candidate.category === "CLUB_OFFICIAL" ? eventPublishingOptions.find(item => item.scope === candidate.scope && item.hostOrganizationId === candidate.hostOrganizationId) : undefined;
        if (option) {
          previewNotice(`介面預覽：已核對合成發布範圍 ${option.scope}／主辦 ${option.hostOrganizationId}；發布未執行，也不會儲存。`);
          throw new ApiError("UNKNOWN", "介面預覽：操作未執行，也不會儲存。", 409);
        }
      }
      return refused();
    },
    getEvent: async (id: string) => {
      const selected = events.find((event) => event.id === id);
      if (!selected) throw new ApiError("UNKNOWN", "預覽中沒有這場合成活動", 404);
      return copy({ ...selected, isCheckedIn: false, canManage: false, canConvertToPersonal: false, hostOrganizationId: "preview-org" });
    },
    getEventRegistrations: async () => ({ registrations: [], checkedInCount: 0, registeredCount: 0 }),
    getNotifications: async () => {
      if (notificationFixture === "load-error") throw new ApiError("NETWORK_ERROR", "合成情境：通知讀取失敗，請重新載入。");
      const data = {
      inbox: [{ id: "preview-inbox", notificationId: "preview-notification", eventId: events[0].id, eventTitle: events[0].title, message: "誠摯邀請獅友參與服務交流。這是合成內容，不是真實邀請。", sentAt: "2026-11-05T01:00:00.000Z", readAt: null, sender: { id: friends[0].id, name: friends[0].name, nickname: friends[0].nickname } }],
      unreadCount: 1, pendingFriendCount: 1,
      friendInvitations: incoming.map((friend) => ({ friendshipId: friend.friendshipId, createdAt: "2026-11-05T00:00:00.000Z", requester: { id: friend.id, name: friend.name, nickname: null, photoUrl: null } })),
      notifications: [{ id: "preview-sent", eventTitle: events[1].title, message: "這是已發送列表的合成示意，未發送給任何會員。", sentAt: "2026-11-04T02:00:00.000Z", recipients: [friends[0].name] }],
      };
      // Exercise the real shape reader: bad transport data must become a
      // recoverable contract error, not fabricated empty lists or a root crash.
      const raw: unknown = notificationFixture === "malformed" ? { ...data, inbox: [{ ...data.inbox[0], sender: null }] } : data;
      try { return readNotificationsResponse(copy(raw)); }
      catch { throw new ApiError("UNKNOWN", "通知資料格式尚未確認，請重新讀取；不代表沒有通知"); }
    },
    getPushReceipts: async () => copy({ enabled: true, receipts: [{ id: "preview-review", kind: "experience_review", title: "會員資料有新的審核結果", body: "這是合成審核通知，請至「我的」查看預覽資料。", createdAt: "2026-11-05T01:30:00.000Z", readAt: null }], unreadCount: 1 }),
    getPushConfig: async () => ({ enabled: false, privacyMode: "generic" }),
    getMyExperiences: async () => copy(experiences),
    getBlockedMembers: async () => {
      if (featureFixture === "security-read-error") throw new ApiError("NETWORK_ERROR", "合成情境：封鎖名單尚未讀取完成，請重新讀取；不代表沒有封鎖會員。");
      const raw: unknown = featureFixture === "security-malformed" ? { blocks: [{ member: null, createdAt: "2026-11-07T01:00:00.000Z" }] }
        : { blocks: featureFixture === "security-blocked" ? blockedMembers : [] };
      try { return readBlockedMembersResponse(copy(raw)); }
      catch { throw new ApiError("UNKNOWN", "封鎖名單格式尚未確認，請重新讀取；不代表沒有封鎖會員。"); }
    },
    getInvites: async () => [],
    getPendingMembers: async () => readPendingMembers(copy({ members: featureFixture === "pending-members" ? pendingMembers : [] })),
    getPendingExperiences: async () => [],
    getRoles: async () => ({ organizations: [], organization: { id: "preview-org", name: "合成分會", level: "club", districtCode: null }, members: [], assignableRoles: [] }),
    getReports: async () => ({ reports: [], eventReports: [] }),
  };
  return new Proxy(reads, {
    get(target, property) {
      // Unknown methods, including future mutations, are fail-closed by default.
      return typeof property === "string" && Object.prototype.hasOwnProperty.call(target, property) ? target[property] : refused;
    },
  }) as unknown as NativeApi;
}
