import type { NotificationsResponse } from "./contract";
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value));
const invalid = () => new Error("NOTIFICATION_RESPONSE_INVALID");
function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid();
  return value;
}
function count(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}
/** Missing old-API lists are compatible; wrong types are an explicit read error,
 * never a fabricated empty inbox or an unchecked render-time exception. */
export function readNotificationsResponse(value: unknown): NotificationsResponse {
  if (!record(value)) throw invalid();
  const inbox = list(value.inbox), invitations = list(value.friendInvitations), sent = list(value.notifications);
  for (const row of inbox) {
    if (!record(row) || ![row.id, row.notificationId, row.eventId, row.eventTitle, row.message].every(text)
      || !date(row.sentAt) || !(row.readAt === null || date(row.readAt)) || !record(row.sender)
      || !text(row.sender.id) || !text(row.sender.name) || !nullableText(row.sender.nickname)) throw invalid();
  }
  for (const row of invitations) {
    if (!record(row) || !text(row.friendshipId) || !date(row.createdAt) || !record(row.requester)
      || !text(row.requester.id) || !text(row.requester.name) || !nullableText(row.requester.nickname)
      || !nullableText(row.requester.photoUrl)) throw invalid();
  }
  const notifications = sent.map(row => {
    if (!record(row) || ![row.id, row.eventTitle, row.message].every(text) || !date(row.sentAt)) throw invalid();
    const recipients = list(row.recipients);
    if (!recipients.every(text)) throw invalid();
    return { ...row, recipients };
  });
  return { inbox, friendInvitations: invitations, notifications,
    unreadCount: count(value.unreadCount, inbox.filter(row => record(row) && row.readAt === null).length),
    pendingFriendCount: count(value.pendingFriendCount, invitations.length) } as NotificationsResponse;
}
