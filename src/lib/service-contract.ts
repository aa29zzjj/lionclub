import { z } from "zod";
import { getCurrentLionYearStart, getLionYearForDate } from "./lion-year";

export class ServiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), "文字包含不支援的字元");
const id = text(1, 200);
export const serviceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => getLionYearForDate(v) !== null, "日期格式不正確");
const version = z.number().int().min(1).max(2147483646);
const needFields = { kind: z.enum(["NEED", "OFFER"]), title: text(2, 120), category: text(1, 40), description: text(2, 1500), targetDate: serviceDate, quantity: z.number().int().min(1).max(10000), quantityUnit: text(1, 12) };
const entryFields = { title: text(2, 120), date: serviceDate, category: text(1, 40), minutes: z.number().int().min(15).max(960), note: text(0, 1000).default("") };
export const serviceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("need.create"), requestId: z.uuid(), ...needFields }).strict(),
  z.object({ action: z.literal("need.respond"), id, message: text(2, 1000) }).strict(),
  z.object({ action: z.literal("need.accept"), id, responseId: id, version }).strict(),
  z.object({ action: z.literal("need.complete"), id, version, note: text(0, 1000).default("") }).strict(),
  z.object({ action: z.literal("need.close"), id, version, reason: text(2, 500) }).strict(),
  z.object({ action: z.literal("need.report"), id, reason: text(2, 200) }).strict(),
  z.object({ action: z.literal("entry.create"), requestId: z.uuid(), eventId: id.nullable().default(null), ...entryFields }).strict(),
  z.object({ action: z.literal("entry.update"), id, version, ...entryFields }).strict(),
  z.object({ action: z.literal("entry.review"), id, version, decision: z.enum(["CONFIRMED", "REJECTED"]), reason: text(0, 500).default("") }).strict(),
  z.object({ action: z.literal("entry.revoke"), id, version, reason: text(2, 500) }).strict(),
  z.object({ action: z.literal("outcome.save"), eventId: id, version: z.number().int().min(0).max(2147483646), endAt: z.iso.datetime({ offset: true }), beneficiaryCount: z.number().int().min(0).max(1000000).nullable(), quantity: z.number().int().min(0).max(1000000), quantityUnit: text(1, 12), totalServiceMinutes: z.number().int().min(0).max(100000000), summary: text(2, 3000) }).strict(),
]);
export type ServiceAction = z.infer<typeof serviceActionSchema>;
export function parseServiceAction(value: unknown): ServiceAction {
  const result = serviceActionSchema.safeParse(value);
  if (!result.success) throw new ServiceError(400, "資料格式不正確，請檢查日期、數量、時數與必填欄位。");
  return result.data;
}
export function serviceYearRange(year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new ServiceError(400, "請選擇有效獅年");
  return { gte: new Date(`${year}-07-01T00:00:00Z`), lt: new Date(`${year + 1}-07-01T00:00:00Z`) };
}
export function localDate(now: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function validateServiceDate(date: string, now = new Date()) {
  if (!serviceDate.safeParse(date).success || date > localDate(now)) throw new ServiceError(400, "只能補登已發生的服務，日期不可在未來。");
}
export function serviceDedupKey(date: string, title: string, eventId?: string | null) {
  return eventId ? `event:${eventId}` : `${date}:${title.normalize("NFKC").trim().toLocaleLowerCase("zh-TW").replace(/\s+/g, " ")}`;
}
export function validateOutcome(input: { endAt: string; totalServiceMinutes: number }, startAt: Date, checkedInCount: number, now = new Date()) {
  const end = new Date(input.endAt), elapsed = end.getTime() - startAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0 || end > now) throw new ServiceError(400, "活動須已結束，且結束時間必須晚於開始時間。");
  const maxMinutes = Math.floor(Math.min(960, elapsed / 60000)) * checkedInCount;
  if (input.totalServiceMinutes > maxMinutes) throw new ServiceError(400, "總服務時數不可超過實際報到人數乘以活動時長（每人最多 16 小時）。");
  return end;
}
export function needTransition(status: string, action: "accept" | "complete" | "close") {
  if (action === "accept" && status === "RESPONDED") return "MATCHED";
  if (action === "complete" && status === "MATCHED") return "COMPLETED";
  if (action === "close" && ["OPEN", "RESPONDED", "MATCHED"].includes(status)) return "CLOSED";
  throw new ServiceError(409, "媒合狀態已更新，請重新載入；須先回應、接受，才能確認完成。");
}
type Grant = { role: string; scopeType: string; scopeId: string | null; validFrom: Date; validUntil: Date | null };
type Org = { id: string; level: string; parentId: string | null; isActive: boolean; validFrom: Date | null; validTo: Date | null };
const roleLevels: Record<string, string> = { CLUB_OFFICER: "club", CLUB_VICE_PRESIDENT: "club", CLUB_PRESIDENT: "club", ZONE_ADMIN: "zone", REGION_ADMIN: "region", DISTRICT_ADMIN: "district", MULTIDISTRICT_ADMIN: "md" };
export function serviceReviewOrganizationIds(grants: Grant[], organizations: Org[], now = new Date()): string[] {
  const roles = grants.filter(r => r.validFrom <= now && (!r.validUntil || r.validUntil > now));
  const byId = new Map(organizations.map(o => [o.id, o]));
  return organizations.filter(target => {
    const chain: Org[] = []; const seen = new Set<string>(); let node: Org | undefined = target;
    while (node) {
      if (seen.has(node.id) || seen.size >= 32 || !node.isActive || (node.validFrom && node.validFrom > now) || (node.validTo && node.validTo <= now)) return false;
      seen.add(node.id); chain.push(node);
      if (!node.parentId) break;
      node = byId.get(node.parentId); if (!node) return false;
    }
    return roles.some(r => r.role === "SUPER_ADMIN" ? r.scopeType === "GLOBAL" && r.scopeId === null : Boolean(roleLevels[r.role] && r.scopeType === roleLevels[r.role] && r.scopeId && chain.some(o => o.id === r.scopeId && o.level === r.scopeType)));
  }).map(o => o.id);
}
export function assertReviewAllowed(actorId: string, memberId: string, organizationId: string, allowed: string[]) {
  if (actorId === memberId) throw new ServiceError(403, "不能核實自己的服務紀錄。");
  if (!allowed.includes(organizationId)) throw new ServiceError(403, "沒有這個組織的服務紀錄核實權限。");
}
export function markdownText(value: string) { return value.replace(/[\\`*_{}\[\]<>|#!]/g, "\\$&").replace(/[\r\n]+/g, " "); }
export const currentServiceYear = getCurrentLionYearStart;

const person = z.object({ id: z.string(), name: z.string(), organizationName: z.string() });
const response = z.object({ id: z.string(), member: person, message: z.string(), status: z.enum(["PENDING", "ACCEPTED", "NOT_SELECTED"]) });
const entry = z.object({ id: z.string(), memberId: z.string(), memberName: z.string(), organizationName: z.string(), eventId: z.string().nullable(), title: z.string(), date: serviceDate, category: z.string(), minutes: z.number().int().min(15).max(960), note: z.string().nullable(), status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "REVOKED"]), version: z.number().int(), reviewReason: z.string().nullable(), reviewedAt: z.string().nullable() });
export const serviceHubSchema = z.object({
  viewerId: z.string(), year: z.number().int(), memberName: z.string(), organizationName: z.string(), canReview: z.boolean(),
  needs: z.array(z.object({ id: z.string(), kind: z.enum(["NEED", "OFFER"]), owner: person, title: z.string(), category: z.string(), description: z.string(), targetDate: serviceDate, quantity: z.number().int(), quantityUnit: z.string(), status: z.enum(["OPEN", "RESPONDED", "MATCHED", "COMPLETED", "CLOSED"]), version: z.number().int(), canManage: z.boolean(), canRespond: z.boolean(), completionNote: z.string().nullable(), myResponse: response.nullable(), responses: z.array(response) })),
  entries: z.array(entry), reviewEntries: z.array(entry),
  totals: z.object({ confirmedMinutes: z.number(), pendingMinutes: z.number(), confirmedCount: z.number(), pendingCount: z.number() }),
  events: z.array(z.object({ id: z.string(), title: z.string(), location: z.string(), startAt: z.string(), registeredCount: z.number(), checkedInCount: z.number(), canManage: z.boolean(), canLinkService: z.boolean(), outcome: z.object({ endAt: z.string(), beneficiaryCount: z.number().nullable(), quantity: z.number(), quantityUnit: z.string(), totalServiceMinutes: z.number(), summary: z.string(), version: z.number() }).nullable() })),
  nextCursors: z.object({ needs: z.string().nullable(), entries: z.string().nullable(), events: z.string().nullable(), review: z.string().nullable() }),
});
export type ServiceHubData = z.infer<typeof serviceHubSchema>;
export function readServiceHub(value: unknown): ServiceHubData {
  const result = serviceHubSchema.safeParse(value);
  if (!result.success) throw new Error("服務資料回覆未確認，請重新載入。");
  return result.data;
}
