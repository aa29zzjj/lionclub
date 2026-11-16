import type { Prisma, PrismaClient } from "@prisma/client";
import { notifyMeetupChange, readPhaseNotices, scheduleMeetupReminder } from "./phase-notices";
import { getBlockedMemberIds } from "./member-block";
import { ServiceError } from "./service-contract";
import { hasAcceptedCurrentTerms } from "./terms-gate";
import { maxBusinessCardBytes, type BusinessCardData, type MeetupDetail, type MeetupList, type MeetupSummary, type NextPhaseAction, type NextPhaseQuery } from "./next-phase-contract";

type Db = Prisma.TransactionClient;
const activeMember = { status: "ACTIVE", deletedAt: null } as const;
const assignedMember = { ...activeMember, organizationAssignmentStatus: "ASSIGNED" } as const;
const maxMeetups = 60;
const maxMessages = 80;
const retainedHistory = 30 * 24 * 60 * 60 * 1000;

export async function hasNextPhaseSchema(db: Pick<Db, "$queryRaw">) {
  const [row] = await db.$queryRaw<{ available: boolean }[]> `SELECT to_regclass('"Meetup"') IS NOT NULL AND to_regclass('"MeetupMessage"') IS NOT NULL AND to_regclass('"MeetupRegistration"') IS NOT NULL AND to_regclass('"BusinessCard"') IS NOT NULL AS available`;
  return row?.available === true;
}

async function currentActor(db: Db, memberId: string) {
  const member = await db.member.findFirst({ where: { id: memberId, ...activeMember }, include: { organization: true } });
  if (!member) throw new ServiceError(401, "未登入或登入已過期");
  return member;
}
type Actor = Awaited<ReturnType<typeof currentActor>>;

function requireClub(actor: Actor, now: Date) {
  const organization = actor.organization;
  if (actor.organizationAssignmentStatus !== "ASSIGNED" || organization.level !== "club" || !organization.isActive
    || (organization.validFrom && organization.validFrom > now) || (organization.validTo && organization.validTo <= now)) {
    throw new ServiceError(403, "揪團開放給已完成分會核對的會員，請洽分會幹部。");
  }
}

function meetupContext(actor: Actor, blocked: string[]) {
  return {
    organizationId: actor.organizationId,
    hostId: { notIn: blocked },
    host: { ...assignedMember, organizationId: actor.organizationId },
  } satisfies Prisma.MeetupWhereInput;
}

function meetupDetails(actor: Actor) {
  return {
    host: { select: { name: true } },
    registrations: { where: { memberId: actor.id }, select: { memberId: true } },
    _count: { select: { registrations: { where: {
      member: { ...assignedMember, organizationId: actor.organizationId },
    } } } },
  } satisfies Prisma.MeetupInclude;
}

type MeetupRow = Prisma.MeetupGetPayload<{ include: ReturnType<typeof meetupDetails> }>;
function meetupSummary(row: MeetupRow, memberId: string, now: Date): MeetupSummary {
  return {
    id: row.id, title: row.title, category: row.category, location: row.location, description: row.description,
    startsAt: row.startsAt.toISOString(), capacity: row.capacity, registeredCount: row._count.registrations,
    hostName: row.host.name, isHost: row.hostId === memberId, joined: row.registrations.length > 0,
    state: row.cancelledAt ? "cancelled" : row.startsAt <= now ? "ended" : "open",
  };
}

export async function readNextPhase(prisma: PrismaClient, memberId: string, query: NextPhaseQuery, now = new Date()) {
  return prisma.$transaction(async db => {
    const actor = await currentActor(db, memberId);
    if (query.view === "notices") return readPhaseNotices(db, memberId, now);
    if (query.view === "card") {
      const card = await db.businessCard.findUnique({ where: { memberId } });
      return { card: card ? { image: Buffer.from(card.image).toString("base64"), tags: card.tags, shareTags: card.shareTags } satisfies BusinessCardData : null };
    }
    requireClub(actor, now);
    const blocked = await getBlockedMemberIds(db, memberId);
    const where = meetupContext(actor, blocked);
    const include = meetupDetails(actor);
    if (query.view === "meetups") {
      const upcoming = await db.meetup.findMany({
        where: { ...where, startsAt: { gt: now }, cancelledAt: null },
        include, take: maxMeetups + 1, orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      });
      const remaining = maxMeetups + 1 - upcoming.length;
      const history = remaining > 0 ? await db.meetup.findMany({
        where: { ...where, startsAt: { gte: new Date(now.getTime() - retainedHistory) }, OR: [{ cancelledAt: { not: null } }, { startsAt: { lte: now } }] },
        include, take: remaining, orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      }) : [];
      const meetups = [...upcoming, ...history];
      return { organizationName: actor.organization.name, meetups: meetups.slice(0, maxMeetups).map(row => meetupSummary(row, memberId, now)), limited: meetups.length > maxMeetups } satisfies MeetupList;
    }
    const row = await db.meetup.findFirst({ where: { ...where, id: query.id }, include });
    if (!row) throw new ServiceError(404, "找不到這個揪團");
    const summary = meetupSummary(row, memberId, now);
    const canReadChat = summary.joined || summary.isHost;
    const messages = canReadChat ? await db.meetupMessage.findMany({
      where: { meetupId: row.id, memberId: { notIn: blocked }, member: { ...assignedMember, organizationId: actor.organizationId } },
      include: { member: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: maxMessages,
    }) : [];
    return { ...summary, revision: row.revision, canReadChat, canWriteChat: canReadChat && !row.cancelledAt, messages: messages.reverse().map(message => ({
      id: message.id, author: message.member.name, own: message.memberId === memberId, body: message.body, createdAt: message.createdAt.toISOString(),
    })) } satisfies MeetupDetail;
  }, { isolationLevel: "RepeatableRead" });
}

function decodeCardImage(image: string) {
  const bytes = Buffer.from(image, "base64");
  if (bytes.toString("base64") !== image || bytes.length > maxBusinessCardBytes || bytes.length < 16
    || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new ServiceError(400, "名片影像格式不正確，請重新選擇圖片。");
  }
  return new Uint8Array(bytes);
}

export async function writeNextPhase(prisma: PrismaClient, memberId: string, action: NextPhaseAction, now = new Date()) {
  try {
    return await prisma.$transaction(async db => {
      const actor = await currentActor(db, memberId);
      if (action.action === "notice.read") {
        await db.phaseNotice.updateMany({ where: { id: action.id, recipientId: memberId, availableAt: { lte: now }, readAt: null }, data: { readAt: now } });
        return { ok: true };
      }
      if (action.action === "card.delete") {
        await db.businessCard.deleteMany({ where: { memberId } });
        return { ok: true };
      }
      if (action.action === "card.save") {
        if (action.shareTags && !hasAcceptedCurrentTerms(actor)) throw new ServiceError(403, "分享標籤前，請先同意使用條款。");
        const fields = { tags: [...new Set(action.tags)], shareTags: action.shareTags && action.tags.length > 0 };
        if (action.image) {
          const image = decodeCardImage(action.image);
          await db.businessCard.upsert({ where: { memberId }, create: { memberId, image, ...fields }, update: { image, ...fields } });
        } else {
          const saved = await db.businessCard.updateMany({ where: { memberId }, data: fields });
          if (!saved.count) throw new ServiceError(404, "請先選擇名片圖片。");
        }
        return { ok: true };
      }

      requireClub(actor, now);
      if (action.action === "meetup.create") {
        const { action: _, requestId, startsAt, ...fields } = action;
        const duplicate = await db.meetup.findUnique({ where: { hostId_requestId: { hostId: memberId, requestId } }, select: { id: true, organizationId: true } });
        if (duplicate?.organizationId === actor.organizationId) return { ok: true, id: duplicate.id };
        if (!hasAcceptedCurrentTerms(actor)) throw new ServiceError(403, "發布前，請先同意使用條款。");
        const date = new Date(startsAt);
        if (date <= now || date.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) throw new ServiceError(400, "請選擇未來 90 天內的時間。");
        const meetup = await db.meetup.create({ data: {
          ...fields, startsAt: date, requestId, organizationId: actor.organizationId, hostId: memberId,
          registrations: { create: { memberId } },
        }, select: { id: true } });
        return { ok: true, id: meetup.id };
      }

      const blocked = await getBlockedMemberIds(db, memberId);
      const meetup = await db.meetup.findFirst({ where: { ...meetupContext(actor, blocked), id: action.id } });
      if (!meetup) throw new ServiceError(404, "找不到這個揪團");
      const isHost = meetup.hostId === memberId;
      const registration = { meetupId: meetup.id, memberId };
      const registered = await db.meetupRegistration.findUnique({ where: { meetupId_memberId: registration } });
      if (action.action === "meetup.update") {
        if (!isHost) throw new ServiceError(403, "只有主揪可以變更時間或地點。");
        if (meetup.cancelledAt || meetup.startsAt <= now) throw new ServiceError(409, "這個揪團已開始或取消。");
        const startsAt = new Date(action.startsAt);
        if (startsAt <= now || startsAt.getTime() > now.getTime() + 90 * 86_400_000) throw new ServiceError(400, "請選擇未來 90 天內的時間。");
        if (+startsAt === +meetup.startsAt && action.location === meetup.location) return { ok: true, changed: false };
        if (action.revision !== meetup.revision) throw new ServiceError(409, "揪團已更新，請重新載入再試。");
        const updated = await db.meetup.update({ where: { id: meetup.id, revision: action.revision },
          data: { startsAt, location: action.location, revision: { increment: 1 } } });
        await notifyMeetupChange(db, updated, "MEETUP_CHANGED", now);
      } else if (action.action === "meetup.cancel") {
        if (!isHost) throw new ServiceError(403, "只有主揪可以取消揪團");
        if (!meetup.cancelledAt) {
          if (meetup.startsAt <= now) throw new ServiceError(409, "這個揪團已開始，無法取消。");
          const updated = await db.meetup.update({ where: { id: meetup.id }, data: { cancelledAt: now, revision: { increment: 1 } } });
          await notifyMeetupChange(db, updated, "MEETUP_CANCELLED", now);
        }
      } else if (action.action === "meetup.join" || action.action === "meetup.leave") {
        if (meetup.cancelledAt || meetup.startsAt <= now) throw new ServiceError(409, "這個揪團已開始或取消，報名已關閉。");
        if (action.action === "meetup.leave") {
          if (isHost) throw new ServiceError(403, "主揪可以取消整個揪團");
          await db.meetupRegistration.deleteMany({ where: registration });
        } else if (!registered) {
          // Include all active registrations in the capacity check, even if some people are blocked by this viewer.
          const count = await db.meetupRegistration.count({ where: { meetupId: meetup.id, member: { ...assignedMember, organizationId: meetup.organizationId } } });
          if (count >= meetup.capacity) throw new ServiceError(409, "報名名額已滿。");
          await db.meetupRegistration.create({ data: registration });
          await scheduleMeetupReminder(db, meetup, [memberId], now);
        }
      } else if (action.action === "meetup.message") {
        if (!registered && !isHost) throw new ServiceError(403, "報名後才可使用揪團聊天室");
        if (meetup.cancelledAt) throw new ServiceError(409, "這個揪團已取消，聊天室已關閉發言。");
        if (!hasAcceptedCurrentTerms(actor)) throw new ServiceError(403, "發言前，請先同意使用條款。");
        const duplicate = await db.meetupMessage.findUnique({ where: { memberId_requestId: { memberId, requestId: action.requestId } }, select: { meetupId: true } });
        if (duplicate && duplicate.meetupId !== meetup.id) throw new ServiceError(409, "請重新整理後再送出訊息");
        if (!duplicate) await db.meetupMessage.create({ data: { ...registration, body: action.body, requestId: action.requestId } });
      } else if (action.action === "meetup.message.delete") {
        await db.meetupMessage.deleteMany({ where: { id: action.messageId, ...registration } });
      } else {
        let targetId = meetup.hostId;
        let details = `揪團：${meetup.title}（${meetup.id}）\n${meetup.description}`;
        if (action.messageId) {
          if (!registered && !isHost) throw new ServiceError(403, "報名後才可檢舉聊天室訊息");
          const message = await db.meetupMessage.findFirst({ where: {
            id: action.messageId, meetupId: meetup.id, memberId: { notIn: blocked },
            member: { ...assignedMember, organizationId: actor.organizationId },
          } });
          if (!message) throw new ServiceError(404, "找不到這則訊息");
          targetId = message.memberId;
          details = `揪團：${meetup.title}（${meetup.id}）\n訊息：${message.body}`;
        }
        if (targetId === memberId) throw new ServiceError(400, "不能檢舉自己的內容");
        await db.memberReport.create({ data: { reporterId: memberId, targetId, reason: action.reason, details } });
      }
      return { ok: true };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) {
      throw new ServiceError(409, "資料同時更新，請重新載入後再試。");
    }
    throw error;
  }
}
