import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { canManageEvent } from "./event-scope";
import { getBlockedMemberIds, isBlockedEitherWay } from "./member-block";
import { isPersonalEventHidden, visibleEventsWhere } from "./event-visibility";
import { activeAdminRoleWhere } from "./active-admin-role";
import { hasAcceptedCurrentTerms } from "./terms-gate";
import { shortPositionLabel } from "./experience-data";
import { ServiceError, parseServiceAction, serviceReviewOrganizationIds, assertReviewAllowed, validateOutcome, validateServiceDate, serviceDedupKey, serviceYearRange, needTransition, markdownText, localDate, type ServiceHubData } from "./service-contract";

type Db = Prisma.TransactionClient;
const personSelect = { id: true, name: true, organizationAssignmentStatus: true, organization: { select: { name: true } } } as const;
const entryInclude = { member: { select: { name: true } }, organization: { select: { name: true } } } as const;
type Person = { id: string; name: string; organizationAssignmentStatus: string; organization: { name: string } };
const person = (p: Person) => ({ id: p.id, name: p.name, organizationName: p.organization.name + (p.organizationAssignmentStatus === "ASSIGNED" ? "" : "（分會待核對）") });
const date = (d: Date) => d.toISOString().slice(0, 10);
const dedup = (day: string, title: string, eventId: string | null) => createHash("sha256").update(serviceDedupKey(day, title, eventId)).digest("hex");

export async function hasServiceSchema(db: Pick<Db, "$queryRaw">) {
  const rows = await db.$queryRaw<{ available: boolean }[]>`SELECT to_regclass('"EventOutcome"') IS NOT NULL AND to_regclass('"ResourceNeed"') IS NOT NULL AND to_regclass('"ResourceResponse"') IS NOT NULL AND to_regclass('"ServiceEntry"') IS NOT NULL AND to_regclass('"ServiceAudit"') IS NOT NULL AS available`;
  return rows[0]?.available === true;
}
async function context(db: Db, actorId: string, now = new Date()) {
  const actor = await db.member.findFirst({ where: { id: actorId, status: "ACTIVE", deletedAt: null }, include: { organization: true } });
  if (!actor) throw new ServiceError(401, "未登入或登入已過期");
  const roles = await db.adminRole.findMany({ where: { memberId: actorId, ...activeAdminRoleWhere(now) } });
  const organizations = await db.organization.findMany({ select: { id: true, name: true, level: true, parentId: true, isActive: true, validFrom: true, validTo: true } });
  const allowed = serviceReviewOrganizationIds(roles, organizations, now);
  return { actor, allowed };
}
async function audit(db: Db, actorId: string, entityType: string, entityId: string, action: string, version: number, reason?: string) {
  await db.serviceAudit.create({ data: { actorId, entityType, entityId, action, version, reason: reason || null } });
}
const conflict = () => new ServiceError(409, "資料已被其他操作更新，請重新載入後再確認。");
async function guardVersion(count: number) { if (count !== 1) throw conflict(); }
export async function performServiceAction(prisma: PrismaClient, actorId: string, raw: unknown, now = new Date()) {
  const input = parseServiceAction(raw);
  try {
    return await prisma.$transaction(async db => {
      const { actor, allowed } = await context(db, actorId, now);
      if (!hasAcceptedCurrentTerms(actor)) throw new ServiceError(403, "發布內容前，請先閱讀並同意使用條款。");
      if (["need.create", "entry.create"].includes(input.action) && (!actor.organization.isActive || actor.organization.validFrom && actor.organization.validFrom > now || actor.organization.validTo && actor.organization.validTo <= now)) throw new ServiceError(403, "目前分會資料未啟用，請洽幹部核對。" );
      if (input.action === "need.create") {
        const existing = await db.resourceNeed.findUnique({ where: { ownerId_requestId: { ownerId: actorId, requestId: input.requestId } } });
        if (existing) return { ok: true, id: existing.id, duplicate: true };
        const { action: _, requestId, ...fields } = input;
        const created = await db.resourceNeed.create({ data: { ...fields, targetDate: new Date(`${fields.targetDate}T00:00:00Z`), requestId, ownerId: actorId, organizationId: actor.organizationId } });
        await audit(db, actorId, "NEED", created.id, "CREATED", 1); return { ok: true, id: created.id };
      }
      if (["need.respond", "need.accept", "need.complete", "need.close", "need.report"].includes(input.action) && "id" in input) {
        const need = await db.resourceNeed.findUnique({ where: { id: input.id }, include: { owner: { select: { status: true, deletedAt: true } } } });
        if (!need || need.owner.status !== "ACTIVE" || need.owner.deletedAt || (actorId !== need.ownerId && await isBlockedEitherWay(db, actorId, need.ownerId))) throw new ServiceError(404, "找不到此需求");
        if (input.action === "need.report") {
          if (need.ownerId === actorId) throw new ServiceError(400, "不能檢舉自己發布的內容");
          const existing = await db.memberReport.findFirst({ where: { reporterId: actorId, targetId: need.ownerId, status: "PENDING", details: `資源媒合：${need.id}` } });
          if (!existing) await db.memberReport.create({ data: { reporterId: actorId, targetId: need.ownerId, reason: input.reason, details: `資源媒合：${need.id}` } });
          return { ok: true };
        }
        if (input.action === "need.respond") {
          if (need.ownerId === actorId) throw new ServiceError(400, "不能回應自己發布的需求");
          const existing = await db.resourceResponse.findUnique({ where: { needId_memberId: { needId: need.id, memberId: actorId } } });
          if (existing) return { ok: true, id: existing.id, duplicate: true };
          if (!["OPEN", "RESPONDED"].includes(need.status)) throw conflict();
          if (await db.resourceResponse.count({ where: { needId: need.id } }) >= 100) throw new ServiceError(409, "此需求回應已達上限，請洽發布者整理。" );
          const created = await db.resourceResponse.create({ data: { needId: need.id, memberId: actorId, message: input.message } });
          const changed = await db.resourceNeed.updateMany({ where: { id: need.id, version: need.version, status: need.status }, data: { status: "RESPONDED", version: { increment: 1 } } });
          await guardVersion(changed.count); await audit(db, actorId, "NEED", need.id, "RESPONDED", need.version + 1); return { ok: true, id: created.id };
        }
        if (need.ownerId !== actorId && !allowed.includes(need.organizationId)) throw new ServiceError(403, "沒有管理此需求的權限");
        if (!("version" in input) || input.version !== need.version) throw conflict();
        if (input.action === "need.accept") {
          const status = needTransition(need.status, "accept");
          const response = await db.resourceResponse.findFirst({ where: { id: input.responseId, needId: need.id, status: "PENDING", member: { status: "ACTIVE", deletedAt: null } } });
          if (!response || await isBlockedEitherWay(db, need.ownerId, response.memberId)) throw new ServiceError(409, "此回應目前無法接受，請重新載入。");
          const changed = await db.resourceNeed.updateMany({ where: { id: need.id, version: input.version, status: need.status, acceptedResponseId: null }, data: { status, acceptedResponseId: response.id, version: { increment: 1 } } });
          await guardVersion(changed.count);
          await db.resourceResponse.updateMany({ where: { needId: need.id, status: "PENDING", id: { not: response.id } }, data: { status: "NOT_SELECTED" } });
          await db.resourceResponse.update({ where: { id: response.id }, data: { status: "ACCEPTED" } });
          await audit(db, actorId, "NEED", need.id, "ACCEPTED", input.version + 1); return { ok: true };
        }
        if (input.action === "need.complete" || input.action === "need.close") {
          const status = needTransition(need.status, input.action === "need.complete" ? "complete" : "close");
          const note = input.action === "need.complete" ? input.note : input.reason;
          const changed = await db.resourceNeed.updateMany({ where: { id: need.id, status: need.status, version: input.version }, data: { status, completionNote: note, completedAt: status === "COMPLETED" ? now : null, version: { increment: 1 } } });
          await guardVersion(changed.count); await audit(db, actorId, "NEED", need.id, status, input.version + 1, note); return { ok: true };
        }
      }
      if (input.action === "entry.create") {
        const existing = await db.serviceEntry.findUnique({ where: { memberId_requestId: { memberId: actorId, requestId: input.requestId } } });
        if (existing) return { ok: true, id: existing.id, duplicate: true };
        validateServiceDate(input.date, now);
        let organizationId = actor.organizationId;
        if (input.eventId) {
          const event = await db.event.findUnique({ where: { id: input.eventId }, include: { serviceOutcome: true } });
          if (!event || await isPersonalEventHidden(db, actorId, event)) throw new ServiceError(404, "找不到此活動");
          const registration = await db.eventRegistration.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId: actorId } } });
          if (!event.serviceOutcome || event.serviceOutcome.endAt > now || !registration?.checkedInAt || registration.status !== "REGISTERED") throw new ServiceError(400, "連結活動須已完成成果整理，且您已有實際報到紀錄；也可先以一般補登交由幹部確認。");
          if (localDate(event.startAt) !== input.date || input.minutes > Math.min(960, Math.floor((event.serviceOutcome.endAt.getTime() - event.startAt.getTime()) / 60000))) throw new ServiceError(400, "服務日期或時數超過連結活動範圍");
          organizationId = event.hostOrganizationId;
        }
        const { action: _, requestId, eventId, ...fields } = input;
        const created = await db.serviceEntry.create({ data: { ...fields, date: new Date(`${input.date}T00:00:00Z`), requestId, eventId, organizationId, memberId: actorId, dedupKey: dedup(input.date, input.title, eventId) } });
        await audit(db, actorId, "ENTRY", created.id, "SUBMITTED", 1); return { ok: true, id: created.id };
      }
      if (input.action === "entry.update" || input.action === "entry.review" || input.action === "entry.revoke") {
        const entry = await db.serviceEntry.findUnique({ where: { id: input.id }, include: { member: { select: { status: true, deletedAt: true } } } });
        if (!entry || entry.member.status !== "ACTIVE" || entry.member.deletedAt) throw new ServiceError(404, "找不到此服務紀錄");
        if (entry.version !== input.version) throw conflict();
        if (input.action === "entry.update") {
          if (entry.memberId !== actorId || !["PENDING", "REJECTED", "REVOKED"].includes(entry.status)) throw new ServiceError(403, "只有本人可編輯尚未確認的服務紀錄");
          // Linked dates/minutes remain subject to the original event evidence.
          if (entry.eventId) throw new ServiceError(409, "活動連結紀錄請由主辦幹部核對，不能自行改寫報到範圍。");
          validateServiceDate(input.date, now);
          const { action: _, id: __, version: ___, ...fields } = input;
          const changed = await db.serviceEntry.updateMany({ where: { id: entry.id, version: input.version, status: entry.status }, data: { ...fields, date: new Date(`${input.date}T00:00:00Z`), dedupKey: dedup(input.date, input.title, entry.eventId), status: "PENDING", reviewedById: null, reviewedAt: null, reviewReason: null, version: { increment: 1 } } });
          await guardVersion(changed.count); await audit(db, actorId, "ENTRY", entry.id, "RESUBMITTED", input.version + 1); return { ok: true };
        }
        assertReviewAllowed(actorId, entry.memberId, entry.organizationId, allowed);
        const status = input.action === "entry.revoke" ? "REVOKED" : input.decision;
        if (input.action === "entry.revoke" ? entry.status !== "CONFIRMED" : entry.status !== "PENDING") throw conflict();
        if (status !== "CONFIRMED" && input.reason.trim().length < 2) throw new ServiceError(400, "退回或撤回確認須填寫原因");
        const changed = await db.serviceEntry.updateMany({ where: { id: entry.id, version: input.version, status: entry.status }, data: { status, reviewedAt: now, reviewedById: actorId, reviewReason: input.reason || null, version: { increment: 1 } } });
        await guardVersion(changed.count); await audit(db, actorId, "ENTRY", entry.id, status, input.version + 1, input.reason); return { ok: true };
      }
      if (input.action === "outcome.save") {
        const event = await db.event.findUnique({ where: { id: input.eventId }, include: { serviceOutcome: true } });
        if (!event || await isPersonalEventHidden(db, actorId, event)) throw new ServiceError(404, "找不到此活動");
        if (!await canManageEvent(db, actorId, event, now)) throw new ServiceError(403, "沒有整理此活動成果的權限");
        const checkedInCount = await db.eventRegistration.count({ where: { eventId: event.id, status: "REGISTERED", checkedInAt: { not: null } } });
        const endAt = validateOutcome(input, event.startAt, checkedInCount, now);
        const data = { endAt, beneficiaryCount: input.beneficiaryCount, quantity: input.quantity, quantityUnit: input.quantityUnit, totalServiceMinutes: input.totalServiceMinutes, summary: input.summary, editedById: actorId };
        if (!event.serviceOutcome && input.version === 0) await db.eventOutcome.create({ data: { ...data, eventId: event.id } });
        else {
          if (!event.serviceOutcome || input.version !== event.serviceOutcome.version) throw conflict();
          await guardVersion((await db.eventOutcome.updateMany({ where: { eventId: event.id, version: input.version }, data: { ...data, version: { increment: 1 } } })).count);
        }
        await audit(db, actorId, "OUTCOME", event.id, "SAVED", input.version + 1); return { ok: true };
      }
      throw new ServiceError(400, "不支援此操作");
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) throw new ServiceError(409, "已有相同紀錄或資料同時更新，請先重新載入核對結果。");
    throw error;
  }
}

export type ServiceQuery = { year: number; needsCursor?: string; entriesCursor?: string; eventsCursor?: string; reviewCursor?: string; category?: string; kind?: "NEED" | "OFFER"; mine?: boolean; reviewStatus?: "PENDING" | "CONFIRMED" | "REJECTED" | "REVOKED" };
const page = <T extends { id: string }>(rows: T[], limit: number) => ({ rows: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null });
const cursor = (id?: string): { cursor?: { id: string }; skip?: number } => id ? { cursor: { id }, skip: 1 } : {};
function entryDto(row: Prisma.ServiceEntryGetPayload<{ include: typeof entryInclude }>) {
  return { id: row.id, memberId: row.memberId, memberName: row.member.name, organizationName: row.organization.name, eventId: row.eventId, title: row.title, date: date(row.date), category: row.category, minutes: row.minutes, note: row.note, status: row.status, version: row.version, reviewReason: row.reviewReason, reviewedAt: row.reviewedAt?.toISOString() ?? null };
}
export async function getServiceHub(prisma: PrismaClient, actorId: string, query: ServiceQuery): Promise<ServiceHubData> {
  const { actor, allowed } = await context(prisma, actorId);
  const range = serviceYearRange(query.year);
  const blocked = await getBlockedMemberIds(prisma, actorId);
  const needs = page(await prisma.resourceNeed.findMany({
    where: { ownerId: { notIn: blocked }, owner: { status: "ACTIVE", deletedAt: null }, ...(query.category ? { category: query.category } : {}), ...(query.kind ? { kind: query.kind } : {}), ...(query.mine ? { ownerId: actorId } : {}) },
    include: { owner: { select: personSelect }, responses: { where: { member: { status: "ACTIVE", deletedAt: null }, memberId: { notIn: blocked } }, select: { id: true, message: true, status: true, memberId: true, member: { select: personSelect } }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...cursor(query.needsCursor),
  }), 50);
  const entries = page(await prisma.serviceEntry.findMany({ where: { memberId: actorId, date: range }, include: entryInclude, orderBy: [{ date: "desc" }, { id: "desc" }], take: 101, ...cursor(query.entriesCursor) }), 100);
  const reviews = page(await prisma.serviceEntry.findMany({ where: { memberId: { not: actorId }, member: { status: "ACTIVE", deletedAt: null }, organizationId: { in: allowed }, status: query.reviewStatus ?? "PENDING", date: range }, include: entryInclude, orderBy: [{ date: "desc" }, { id: "desc" }], take: 101, ...cursor(query.reviewCursor) }), 100);
  const [confirmed, pending] = await Promise.all(["CONFIRMED", "PENDING"].map(status => prisma.serviceEntry.aggregate({ where: { memberId: actorId, date: range, status }, _count: true, _sum: { minutes: true } })));
  const events = page(await prisma.event.findMany({ where: { AND: [await visibleEventsWhere(prisma, actorId), { startAt: { gte: new Date(`${query.year}-07-01T00:00:00+08:00`), lt: new Date(`${query.year + 1}-07-01T00:00:00+08:00`) } }] }, include: { serviceOutcome: true, registrations: { where: { memberId: actorId, status: "REGISTERED", checkedInAt: { not: null } }, select: { id: true } }, _count: { select: { registrations: { where: { status: "REGISTERED" } } } } }, orderBy: [{ startAt: "desc" }, { id: "desc" }], take: 31, ...cursor(query.eventsCursor) }), 30);
  const checkedIn = await prisma.eventRegistration.groupBy({ by: ["eventId"], where: { eventId: { in: events.rows.map(e => e.id) }, status: "REGISTERED", checkedInAt: { not: null } }, _count: true });
  return {
    viewerId: actorId, year: query.year, memberName: actor.name, organizationName: actor.organization.name, canReview: allowed.length > 0,
    needs: needs.rows.map(need => {
      const canManage = need.ownerId === actorId || allowed.includes(need.organizationId);
      const dto = (r: typeof need.responses[number]) => ({ id: r.id, member: person(r.member), message: r.message, status: r.status as "PENDING" | "ACCEPTED" | "NOT_SELECTED" });
      return { id: need.id, kind: need.kind as "NEED" | "OFFER", owner: person(need.owner), title: need.title, category: need.category, description: need.description, targetDate: date(need.targetDate), quantity: need.quantity, quantityUnit: need.quantityUnit, status: need.status as ServiceHubData["needs"][number]["status"], version: need.version, canManage, canRespond: need.ownerId !== actorId && !need.responses.some(r => r.memberId === actorId) && ["OPEN", "RESPONDED"].includes(need.status), completionNote: need.completionNote, myResponse: need.responses.find(r => r.memberId === actorId) ? dto(need.responses.find(r => r.memberId === actorId)!) : null, responses: canManage ? need.responses.map(dto) : [] };
    }),
    entries: entries.rows.map(entryDto) as ServiceHubData["entries"], reviewEntries: reviews.rows.map(entryDto) as ServiceHubData["reviewEntries"],
    totals: { confirmedMinutes: confirmed._sum.minutes ?? 0, pendingMinutes: pending._sum.minutes ?? 0, confirmedCount: confirmed._count, pendingCount: pending._count },
    events: await Promise.all(events.rows.map(async event => ({ id: event.id, title: event.title, location: event.location ?? "", startAt: event.startAt.toISOString(), registeredCount: event._count.registrations, checkedInCount: checkedIn.find(e => e.eventId === event.id)?._count ?? 0, canManage: await canManageEvent(prisma, actorId, event), canLinkService: event.registrations.length > 0 && !!event.serviceOutcome && event.serviceOutcome.endAt <= new Date(), outcome: event.serviceOutcome ? { endAt: event.serviceOutcome.endAt.toISOString(), beneficiaryCount: event.serviceOutcome.beneficiaryCount, quantity: event.serviceOutcome.quantity, quantityUnit: event.serviceOutcome.quantityUnit, totalServiceMinutes: event.serviceOutcome.totalServiceMinutes, summary: event.serviceOutcome.summary, version: event.serviceOutcome.version } : null }))),
    nextCursors: { needs: needs.next, entries: entries.next, events: events.next, review: reviews.next },
  };
}

export async function exportServicePassport(prisma: PrismaClient, actorId: string, year: number) {
  const { actor } = await context(prisma, actorId);
  const entries = await prisma.serviceEntry.findMany({ where: { memberId: actorId, date: serviceYearRange(year) }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 2001 });
  if (entries.length > 2000) throw new ServiceError(409, "本年度紀錄超過單次匯出範圍，請聯絡支援協助取得完整資料；沒有匯出不完整的履歷。");
  const experiences = await prisma.memberExperience.findMany({ where: { memberId: actorId }, orderBy: { startYear: "desc" }, take: 501 });
  if (experiences.length > 500) throw new ServiceError(409, "資歷超過單次匯出範圍，請聯絡支援協助匯出；沒有截短資料。");
  const total = (status: string) => entries.filter(e => e.status === status).reduce((n, e) => n + e.minutes, 0) / 60;
  const label: Record<string, string> = { CONFIRMED: "平台幹部已確認", PENDING: "本人填寫，待確認", REJECTED: "已退回", REVOKED: "已撤回確認" };
  const lines = [`# ${markdownText(actor.name)}｜服務護照與資歷摘要`, "", `目前分會：${markdownText(actor.organization.name)}`, `獅年：${year}-${year + 1}（臺北每年 7 月 1 日起算）`, `已確認服務：${total("CONFIRMED")} 小時`, `本人填寫待確認：${total("PENDING")} 小時（不計入已確認）`, "", "## 個人服務紀錄"];
  for (const entry of entries) lines.push(`${date(entry.date)}｜${markdownText(entry.title)}｜${entry.minutes / 60} 小時｜${label[entry.status] ?? "狀態待核對"}`);
  if (!entries.length) lines.push("本年度尚無服務紀錄。");
  lines.push("", "## 任職資歷（獨立於服務時數）");
  for (const e of experiences) lines.push(`${e.startYear}｜${markdownText(e.organizationName)}｜${markdownText(shortPositionLabel(e.positionCode, e.positionCode))}｜${e.verificationStatus === "verified" ? "已核實資歷" : "本人自述／尚未核實"}`);
  if (!experiences.length) lines.push("尚未填寫任職資歷。");
  lines.push("", "本文件為 LionClubs 平台紀錄摘要，不是官方核定服務證明或簽章證書。任職資歷、活動報到、個人服務確認與行政授權分開處理；活動團體總時數不會自動計入個人時數。分享前請自行確認內容。");
  return { filename: `LionClubs-service-passport-${year}.md`, content: lines.join("\n") };
}

export async function exportEventOutcome(prisma: PrismaClient, actorId: string, eventId: string) {
  await context(prisma, actorId);
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { serviceOutcome: true } });
  if (!event || await isPersonalEventHidden(prisma, actorId, event)) throw new ServiceError(404, "找不到此活動");
  const outcome = event.serviceOutcome;
  if (!outcome || outcome.endAt > new Date()) throw new ServiceError(409, "主辦單位尚未完成活動成果草稿");
  const [registeredCount, checkedInCount] = await Promise.all([prisma.eventRegistration.count({ where: { eventId, status: "REGISTERED" } }), prisma.eventRegistration.count({ where: { eventId, status: "REGISTERED", checkedInAt: { not: null } } })]);
  const lines = [`# ${markdownText(event.title)}｜活動成果草稿`, "", `活動日期：${localDate(event.startAt)}`, `地點：${markdownText(event.location ?? "未填寫")}`, `實際報名：${registeredCount} 人`, `實際報到：${checkedInCount} 人`, `主辦自填受益估計：${outcome.beneficiaryCount ?? "未估計"}`, `服務數量：${outcome.quantity} ${markdownText(outcome.quantityUnit)}`, `主辦自填團體服務總時數：${outcome.totalServiceMinutes / 60} 小時`, "", "## 主辦摘要", markdownText(outcome.summary), "", "本文件為平台成果草稿，未向國際獅子會官方通報，也不是官方已核定成果。受益人數及團體時數為主辦自填，團體時數不會自動轉為任何個人的已確認服務時數。報到統計依匯出時的實際紀錄。"];
  return { filename: `LionClubs-event-outcome-${event.id}.md`, content: lines.join("\n") };
}
