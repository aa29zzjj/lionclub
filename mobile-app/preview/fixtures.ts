import type { BlockedMember, EventCard, EventPublishingOption, FriendCard, Member, MemberExperience, PendingMember } from "../src/contract";

// Deliberately fictitious: no account can authenticate with these data.
export const member: Member = {
  id: "preview-synthetic-member", name: "林明善（合成）", nickname: "明善",
  email: "native-ui@example.invalid", title: "會員", bio: "這是原生 App 介面預覽的合成資料，不代表任何真實會員。",
  phone: null, photoUrl: null, memberNo: "PREVIEW-001", joinYear: 2022, joinMonth: 7,
  birthday: null, status: "ACTIVE", organization: { name: "共好示範獅子會（合成）" },
  tags: [{ name: "公益服務" }, { name: "教育培訓" }], adminRoles: [], emailVerifiedAt: "2026-11-01T00:00:00.000Z",
};
export const friends: FriendCard[] = [
  { id: "preview-synthetic-friend-1", name: "陳怡安（合成）", nickname: "怡安", chapter: "共好示範獅子會（合成）", title: "會員", status: "friend" },
  { id: "preview-synthetic-friend-2", name: "黃志遠（合成）", nickname: "志遠", chapter: "晨光示範獅子會（合成）", title: "會員", status: "friend" },
  { id: "preview-synthetic-friend-3", name: "吳美華（合成）", nickname: "美華", chapter: "共好示範獅子會（合成）", title: "會員", status: "friend" },
];
export const incoming: FriendCard[] = [{
  id: "preview-synthetic-invitation-member", friendshipId: "preview-synthetic-friendship", name: "周文德（合成）",
  chapter: "山海示範獅子會（合成）", title: "會員", status: "pending-in",
}];
const poster = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240"><rect width="640" height="240" fill="${color}"/><circle cx="530" cy="36" r="135" fill="#c8a951" opacity=".22"/><path d="M0 215 Q180 95 370 215 T700 190" fill="none" stroke="#ffffff" opacity=".22" stroke-width="40"/><text x="28" y="54" fill="#f3f1ea" font-family="sans-serif" font-size="20">SYNTHETIC PREVIEW</text></svg>`)}`;
export const events: EventCard[] = [
  { id: "preview-synthetic-event-1", title: "攜手服務・秋日社區關懷（合成活動）", description: "僅供介面預覽，不會開放報名或通知任何人。", location: "共好社區活動中心（合成地點）", category: "CLUB_OFFICIAL", scope: "CLUB", hostChapter: "共好示範獅子會（合成）", startAt: "2026-11-14T01:00:00.000Z", coverPhotoUrl: poster("#1d3557"), registeredCount: 18, isRegistered: false, isFull: false },
  { id: "preview-synthetic-event-2", title: "獅友交流・服務經驗分享（合成活動）", description: "這是合成內容，所有操作均不儲存。", location: "晨光交流空間（合成地點）", category: "PERSONAL", scope: "CLUB", hostChapter: "晨光示範獅子會（合成）", startAt: "2026-11-21T06:00:00.000Z", coverPhotoUrl: poster("#29493e"), registeredCount: 12, isRegistered: true, isFull: false },
];
export const experiences: MemberExperience[] = [{
  id: "preview-synthetic-experience", kind: "membership", level: "club", positionCode: "membership_joined",
  positionName: "分會會員（合成資歷）", organizationName: "共好示範獅子會（合成）", organizationIsUnlisted: true,
  startYear: 2022, startMonth: 7, datePrecision: "month", isCurrent: true, verificationStatus: "verified", visibility: "members",
}];

// Fixed allowlist for exercising API-authorized scope+host pairs. These are
// never inferred from a member title, home chapter or any user-entered text.
export const eventPublishingOptions: EventPublishingOption[] = [
  { scope: "CLUB", hostOrganizationId: "preview-synthetic-org-club", hostOrganizationName: "共好示範獅子會（合成）" },
  { scope: "ZONE", hostOrganizationId: "preview-synthetic-org-zone", hostOrganizationName: "示範分區（合成）" },
  { scope: "DISTRICT", hostOrganizationId: "preview-synthetic-org-district", hostOrganizationName: "示範區（合成）" },
];
export const blockedMembers: BlockedMember[] = [{
  member: { id: "preview-synthetic-blocked-member", name: "合成封鎖會員", nickname: null, photoUrl: null },
  createdAt: "2026-11-07T01:00:00.000Z",
}];
export const pendingMembers: PendingMember[] = [
  { id: "preview-synthetic-pending-known", name: "合成申請人・已知歷史年月", email: "pending-known@example.invalid", phone: null,
    organization: { id: "preview-synthetic-org-club", name: "共好示範獅子會（合成）" }, createdAt: "2026-11-01T01:00:00.000Z", updatedAt: "2026-11-07T01:00:00.000Z", joinYear: 2014, joinMonth: 7 },
  { id: "preview-synthetic-pending-unknown", name: "合成申請人・年月未知", email: null, phone: null,
    organization: { id: "preview-synthetic-org-other", name: "晨光示範獅子會（合成）" }, createdAt: "2026-11-02T01:00:00.000Z", updatedAt: "2026-11-07T02:00:00.000Z", joinYear: null, joinMonth: null },
  { id: "preview-synthetic-pending-partial", name: "合成申請人・僅知年份", email: "pending-partial@example.invalid", phone: null,
    organization: { id: "preview-synthetic-org-club", name: "共好示範獅子會（合成）" }, createdAt: "2026-11-03T01:00:00.000Z", updatedAt: "2026-11-07T03:00:00.000Z", joinYear: 1999, joinMonth: null },
];
