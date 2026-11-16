import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const day = 86_400_000;
const organizationId = "review-only-club";
const peerId = "isolated-review-host";
const email = "reviewer@lionclubs-review.example.test";

/** Provision one synthetic member in a fresh, separately migrated database. */
export async function seedIsolatedReview(prisma, passwordHash, now = new Date()) {
  return prisma.$transaction(async tx => {
    const organizations = await tx.organization.findMany({ select: { id: true }, take: 2 });
    const users = await tx.user.findMany({ select: { id: true, email: true, memberId: true }, take: 2 });
    if (organizations.length > 1 || organizations.some(org => org.id !== organizationId)
      || users.length > 1 || users.some(user => user.email !== email)) throw Error("REVIEW_DATABASE_CONTAINS_EXISTING_DATA");
    const members = await tx.member.findMany({ select: { id: true, email: true, organizationId: true }, take: 3 });
    const reviewer = members.find(member => member.email === email);
    if (members.length > 2 || members.some(member =>
      member.organizationId !== organizationId || (member.email !== email && !(member.id === peerId && member.email === null)))
      || (users.length ? users[0].memberId !== reviewer?.id : Boolean(reviewer))) throw Error("REVIEW_DATABASE_CONTAINS_EXISTING_DATA");

    await tx.organization.upsert({
      where: { id: organizationId }, update: {},
      create: { id: organizationId, level: "club", name: "LionClubs 審查示範分會", districtCode: "REVIEW" },
    });
    const nextDate = new Date(+now + 30 * day);
    const reviewMember = reviewer ?? await tx.member.create({
      data: { email, organizationId, name: "審查示範會員", status: "ACTIVE", emailVerifiedAt: now,
        organizationAssignmentStatus: "ASSIGNED", user: { create: { email, passwordHash } } },
    });
    await tx.member.upsert({
      where: { id: peerId }, update: {},
      create: { id: peerId, organizationId, name: "示範主揪", status: "ACTIVE", organizationAssignmentStatus: "ASSIGNED" },
    });
    const meetup = await tx.meetup.upsert({
      where: { hostId_requestId: { hostId: peerId, requestId: "review-meetup" } }, update: {},
      create: { organizationId, hostId: peerId, requestId: "review-meetup", title: "志工交流晚餐", category: "餐敘",
        startsAt: nextDate, location: "示範集合點", description: "此為合成審查資料。",
        capacity: 8, registrations: { create: { memberId: peerId } },
        messages: { create: { memberId: peerId, requestId: "review-introduction", body: "歡迎報名，請在這裡留言討論集合方式。" } },
      },
    });
    if (meetup.startsAt <= now) {
      const updated = await tx.meetup.update({ where: { id: meetup.id }, data: { startsAt: nextDate, revision: { increment: 1 } } });
      await tx.phaseNotice.updateMany({
        where: { meetupId: meetup.id, kind: "MEETUP_REMINDER", revision: meetup.revision },
        data: { revision: updated.revision, availableAt: new Date(+nextDate - day), readAt: null },
      });
    }
    const need = await tx.resourceNeed.upsert({
      where: { ownerId_requestId: { ownerId: peerId, requestId: "review-resource" } }, update: {},
      create: { ownerId: peerId, organizationId, requestId: "review-resource", title: "公益講座保險協助", kind: "NEED", category: "保險",
        description: "示範需求，歡迎回應可協助的方向。", targetDate: nextDate, quantity: 1, quantityUnit: "位" },
    });
    if (need.targetDate <= now) {
      await tx.resourceNeed.update({ where: { id: need.id }, data: { targetDate: nextDate, version: { increment: 1 } } });
    }
    const invitation = {
      recipientId: reviewMember.id, kind: "COOPERATION_INVITE", sourceKey: need.id, revision: 1,
    };
    const notice = await tx.phaseNotice.upsert({
      where: { recipientId_kind_sourceKey_revision: invitation }, update: {},
      create: { ...invitation, actorId: peerId, needId: need.id, availableAt: now,
        message: "想請你協助確認公益講座的保險需求。" },
    });
    if (+notice.availableAt < +now - 29 * day) {
      await tx.phaseNotice.update({ where: { id: notice.id }, data: { availableAt: now } });
    }
    return { email, alreadyProvisioned: Boolean(reviewer) };
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const databaseUrl = process.env.LIONCLUBS_REVIEW_DATABASE_URL;
  const password = process.env.LIONCLUBS_REVIEW_PASSWORD;
  try {
    if (!databaseUrl || !password || Buffer.byteLength(password) < 16 || Buffer.byteLength(password) > 72) throw Error("REVIEW_SETTINGS_REQUIRED");
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error("INVALID_REVIEW_TARGET");
    if (!process.env.LIONCLUBS_REVIEW_DB_CONFIRM || process.env.LIONCLUBS_REVIEW_DB_CONFIRM !== url.host + url.pathname) throw Error("REVIEW_TARGET_NOT_CONFIRMED");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try { console.log(JSON.stringify(await seedIsolatedReview(prisma, await bcrypt.hash(password, 12)))); }
    finally { await prisma.$disconnect(); }
  } catch {
    console.error("審查環境初始化失敗，請核對獨立資料庫、遷移及初始化設定。");
    process.exitCode = 1;
  }
}
