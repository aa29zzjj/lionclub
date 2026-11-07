import type { createApiClient as RealClient } from "../src/contract";
import { member, friends, incoming, events, experiences } from "./fixtures";
import { readNotificationsResponse } from "../src/notification-contract";
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
  const reads: Record<string, (...args: any[]) => Promise<unknown>> = {
    me: async () => copy(member),
    hasStoredSession: async () => false,
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
    getEventsFull: async () => copy({ events, allowedScopes: [], officialHosts: [], tagsAvailable: false }),
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
    getBlockedMembers: async () => [],
    getInvites: async () => [],
    getPendingMembers: async () => [],
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
