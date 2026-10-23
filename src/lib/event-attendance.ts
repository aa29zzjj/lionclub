import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { parseFriendQrPayload } from "./friend-qr";
import type { EventManagementTarget } from "./event-scope";
import { isPersonalEventHidden } from "./event-visibility";

export const EVENT_ATTENDANCE_ROLES = ["CLUB_OFFICER", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT", "CLUB_FINANCE", "ZONE_ADMIN", "REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
export class AttendanceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const checkInInputSchema = z.union([
  z.object({ qrValue: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ memberId: z.string().trim().min(1).max(200), method: z.literal("manual"), reason: z.string().trim().min(2, "補登原因至少 2 字").max(1000) }).strict(),
]);
type Transaction = Prisma.TransactionClient;
type EventPermission = (tx: Transaction, actorId: string, organizationId: string, event: EventManagementTarget) => Promise<boolean>;

async function transactionRetry<T>(prisma: PrismaClient, callback: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(callback, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
        if (attempt < 2) continue;
        throw new AttendanceError(409, "報名或報到資料同時更新，請重新載入後再試");
      }
      throw error;
    }
  }
  throw new AttendanceError(409, "請重新載入後再試");
}

export async function attendanceCounts(db: Pick<Transaction, "eventRegistration">, eventId: string) {
  const [registeredCount, checkedInCount] = await Promise.all([
    db.eventRegistration.count({ where: { eventId, status: "REGISTERED" } }),
    db.eventRegistration.count({ where: { eventId, status: "REGISTERED", checkedInAt: { not: null } } }),
  ]);
  return { registeredCount, checkedInCount };
}

/** Cancel/reactivate records, never delete a registration or its attendance audit. */
export async function toggleEventRegistration(prisma: PrismaClient, memberId: string, eventId: string) {
  return transactionRetry(prisma, async tx => {
    const member = await tx.member.findFirst({ where: { id: memberId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
    if (!member) throw new AttendanceError(403, "帳號未啟用，無法變更報名");
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { capacity: true, category: true, createdById: true } });
    if (!event) throw new AttendanceError(404, "找不到此活動");
    const existing = await tx.eventRegistration.findUnique({ where: { eventId_memberId: { eventId, memberId } } });
    if (existing?.checkedInAt) throw new AttendanceError(409, "您已完成報到，不能自行取消或重新報名；請聯絡活動幹部處理");
    if (existing?.status === "REGISTERED") {
      const changed = await tx.eventRegistration.updateMany({ where: { id: existing.id, status: "REGISTERED", checkedInAt: null }, data: { status: "CANCELLED" } });
      if (changed.count !== 1) throw new AttendanceError(409, "報到狀態已更新，請重新載入");
      return { ok: true, registered: false };
    }
    if (existing && existing.status !== "CANCELLED") throw new AttendanceError(409, "報名狀態需由活動幹部確認");
    // A member can still cancel an existing booking, but cannot join/rejoin hidden content.
    if (await isPersonalEventHidden(tx, memberId, event)) throw new AttendanceError(404, "找不到此活動");
    const count = await tx.eventRegistration.count({ where: { eventId, status: "REGISTERED" } });
    if (event.capacity !== null && count >= event.capacity) throw new AttendanceError(409, "活動名額已滿");
    if (existing) {
      const changed = await tx.eventRegistration.updateMany({ where: { id: existing.id, status: "CANCELLED", checkedInAt: null }, data: { status: "REGISTERED", registeredAt: new Date() } });
      if (changed.count !== 1) throw new AttendanceError(409, "報名狀態已更新，請重新載入");
    } else await tx.eventRegistration.create({ data: { eventId, memberId, status: "REGISTERED" } });
    return { ok: true, registered: true };
  });
}

/** First atomic claim owns timestamp/operator/audit; retries do not overwrite it. */
export async function checkInMember(prisma: PrismaClient, actorId: string, eventId: string, input: z.infer<typeof checkInInputSchema>, hasScope: EventPermission) {
  const memberId = "qrValue" in input ? parseFriendQrPayload(input.qrValue) : input.memberId;
  if (!memberId) throw new AttendanceError(400, "這不是有效的會員證 QR Code");
  return transactionRetry(prisma, async tx => {
    const actor = await tx.member.findFirst({ where: { id: actorId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
    if (!actor) throw new AttendanceError(403, "帳號未啟用，無法辦理報到");
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, createdById: true, hostOrganizationId: true, category: true, scope: true } });
    if (!event) throw new AttendanceError(404, "找不到此活動");
    const personalOwner = event.category === "PERSONAL" && event.scope === "CLUB" && event.createdById === actorId;
    if (!personalOwner && !(await hasScope(tx, actorId, event.hostOrganizationId, event))) throw new AttendanceError(403, "沒有權限為此活動報到");
    const lookup = { where: { eventId_memberId: { eventId, memberId } }, include: { member: { select: { id: true, name: true, nickname: true, photoUrl: true, status: true, deletedAt: true } } } } as const;
    let registration = await tx.eventRegistration.findUnique(lookup);
    if (!registration || registration.status !== "REGISTERED") throw new AttendanceError(404, "此會員尚未報名或已取消報名");
    if (registration.member.status !== "ACTIVE" || registration.member.deletedAt) throw new AttendanceError(409, "此會員帳號未啟用，無法辦理報到");
    let alreadyCheckedIn = Boolean(registration.checkedInAt);
    if (!alreadyCheckedIn) {
      const checkedInAt = new Date();
      const changed = await tx.eventRegistration.updateMany({ where: { id: registration.id, eventId, memberId, status: "REGISTERED", checkedInAt: null }, data: { checkedInAt, checkedInById: actorId } });
      if (changed.count === 1) {
        await tx.eventCheckInAudit.create({ data: { eventId, registrationId: registration.id, memberId, actorId, method: "qrValue" in input ? "QR" : "MANUAL", reason: "qrValue" in input ? null : input.reason, checkedInAt } });
        registration = { ...registration, checkedInAt, checkedInById: actorId };
      } else {
        registration = await tx.eventRegistration.findUnique(lookup);
        if (!registration?.checkedInAt || registration.status !== "REGISTERED") throw new AttendanceError(409, "報名狀態已更新，請重新載入");
        alreadyCheckedIn = true;
      }
    }
    const { id, name, nickname, photoUrl } = registration.member;
    return { ok: true, alreadyCheckedIn, member: { id, name, nickname, photoUrl }, checkedInAt: registration.checkedInAt, ...await attendanceCounts(tx, eventId) };
  });
}
