import type { Prisma, PrismaClient } from "@prisma/client";
import { getBlockedMemberIds } from "./member-block";

type Db = Prisma.TransactionClient;
const day = 86_400_000;
const live = { status: "ACTIVE", deletedAt: null } as const;
const assigned = { ...live, organizationAssignmentStatus: "ASSIGNED" } as const;
type MeetupSource = { id: string; hostId: string; organizationId: string; startsAt: Date; revision: number };
export type PhaseNoticeItem = {
  id: string; target: "meetup" | "need"; targetId: string;
  title: string; subject: string; message: string; availableAt: string; readAt: string | null;
};
const date = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short" });

export async function hasPhaseNoticeSchema(db: Pick<Db, "$queryRaw">) {
  const [row] = await db.$queryRaw<{ available: boolean }[]>`SELECT to_regclass('"PhaseNotice"') IS NOT NULL AS available`;
  return row?.available === true;
}

export async function scheduleMeetupReminder(db: Db, meetup: MeetupSource, recipients: string[], now: Date) {
  if (!recipients.length) return;
  const availableAt = new Date(Math.max(now.getTime(), meetup.startsAt.getTime() - day));
  await db.phaseNotice.createMany({ skipDuplicates: true, data: recipients.map(recipientId => ({
    recipientId, actorId: meetup.hostId, meetupId: meetup.id, sourceKey: meetup.id,
    revision: meetup.revision, kind: "MEETUP_REMINDER", availableAt,
  })) });
}

export async function notifyMeetupChange(db: Db, meetup: MeetupSource, kind: "MEETUP_CHANGED" | "MEETUP_CANCELLED", now: Date) {
  const blocked = await getBlockedMemberIds(db, meetup.hostId);
  const recipients = await db.meetupRegistration.findMany({
    where: { meetupId: meetup.id, memberId: { notIn: [meetup.hostId, ...blocked] },
      member: { ...assigned, organizationId: meetup.organizationId, user: { isNot: null } } },
    select: { memberId: true },
  });
  await db.phaseNotice.deleteMany({ where: { meetupId: meetup.id, kind: { in: ["MEETUP_REMINDER", "MEETUP_CHANGED"] } } });
  if (!recipients.length) return;
  const ids = recipients.map(row => row.memberId);
  await db.phaseNotice.createMany({ skipDuplicates: true, data: ids.map(recipientId => ({
    recipientId, actorId: meetup.hostId, meetupId: meetup.id, sourceKey: meetup.id,
    revision: meetup.revision, kind, availableAt: now,
  })) });
  if (kind === "MEETUP_CHANGED") {
    await scheduleMeetupReminder(db, meetup, ids, now);
  }
}

async function visibleNotices(db: Db, memberId: string, now: Date, onlyId?: string) {
  const member = await db.member.findFirst({ where: { id: memberId, ...live },
    select: { organizationId: true, organizationAssignmentStatus: true } });
  if (!member) return [];
  const blocked = await getBlockedMemberIds(db, memberId);
  const club = member.organizationId;
  return db.phaseNotice.findMany({
    where: {
      recipientId: memberId, actorId: { notIn: blocked }, actor: live,
      availableAt: { gte: new Date(now.getTime() - 30 * day), lte: now }, ...(onlyId ? { id: onlyId } : {}),
      OR: [
        { kind: "COOPERATION_INVITE", need: { owner: live } },
        ...(member.organizationAssignmentStatus !== "ASSIGNED" ? [] : [{
          meetup: {
            organizationId: club, organization: { isActive: true, level: "club" as const, AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validTo: null }, { validTo: { gt: now } }] },
            ] },
            host: { ...assigned, organizationId: club }, registrations: { some: { memberId } },
          },
        }]),
      ],
    },
    include: {
      actor: { select: { name: true } },
      meetup: { select: { title: true, location: true, startsAt: true, cancelledAt: true, revision: true } },
      need: { select: { title: true, status: true, ownerId: true, responses: { where: { memberId }, select: { id: true } } } },
    },
    orderBy: [{ availableAt: "desc" }, { id: "desc" }], take: onlyId ? 1 : 50,
  });
}

export async function readPhaseNotices(db: Db, memberId: string, now: Date): Promise<{ items: PhaseNoticeItem[] }> {
  const rows = await visibleNotices(db, memberId, now);
  return { items: rows.flatMap((row): PhaseNoticeItem[] => {
    const shared = { id: row.id, availableAt: row.availableAt.toISOString(), readAt: row.readAt?.toISOString() ?? null };
    if (row.need && row.needId) return [{ ...shared, target: "need", targetId: row.needId, title: "收到合作邀請",
      subject: row.need.title, message: `${row.actor.name} 邀請你協助。${row.message ? "\n" + row.message : ""}` }];
    if (!row.meetup || !row.meetupId) return [];
    const cancelled = row.kind === "MEETUP_CANCELLED";
    return [{ ...shared, target: "meetup", targetId: row.meetupId,
      title: cancelled ? "揪團已取消" : row.kind === "MEETUP_CHANGED" ? "揪團時間或地點已更新" : "揪團行前提醒",
      subject: row.meetup.title, message: cancelled ? "主揪已取消這次邀約。" : `${date.format(row.meetup.startsAt)} · ${row.meetup.location}` }];
  }) };
}

export async function authorizedPhasePush(db: PrismaClient | Db, sourceId: string, actorId: string, memberId: string, now: Date) {
  const [row] = await visibleNotices(db, memberId, now, sourceId);
  if (!row || row.actorId !== actorId || row.readAt) return false;
  if (row.need) return row.need.ownerId === actorId && ["OPEN", "RESPONDED"].includes(row.need.status) && !row.need.responses.length;
  if (row.meetup?.revision !== row.revision) return false;
  if (row.kind === "MEETUP_CANCELLED") return Boolean(row.meetup.cancelledAt);
  return !row.meetup.cancelledAt && row.meetup.startsAt > now;
}
