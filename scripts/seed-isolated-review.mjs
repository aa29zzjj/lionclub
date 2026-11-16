import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const organizationId = "review-only-club";
const email = "reviewer@lionclubs-review.example.test";

/** Provision one synthetic member in a fresh, separately migrated database. */
export async function seedIsolatedReview(prisma, passwordHash) {
  return prisma.$transaction(async tx => {
    const organizations = await tx.organization.findMany({ select: { id: true }, take: 2 });
    const users = await tx.user.findMany({ select: { id: true, email: true, memberId: true }, take: 2 });
    if (organizations.length > 1 || organizations.some(org => org.id !== organizationId)
      || users.length > 1 || users.some(user => user.email !== email)) throw Error("REVIEW_DATABASE_CONTAINS_EXISTING_DATA");
    const members = await tx.member.findMany({ select: { id: true, email: true, organizationId: true }, take: 2 });
    if (members.length > 1 || members.some(member => member.email !== email || member.organizationId !== organizationId)
      || (users.length && users[0].memberId !== members[0]?.id)) throw Error("REVIEW_DATABASE_CONTAINS_EXISTING_DATA");
    if (users.length) return { email, alreadyProvisioned: true };

    await tx.organization.upsert({
      where: { id: organizationId }, update: {},
      create: { id: organizationId, level: "club", name: "LionClubs 審查示範分會", districtCode: "REVIEW" },
    });
    const now = new Date();
    const member = await tx.member.create({
      data: { email, organizationId, name: "審查示範會員", status: "ACTIVE", emailVerifiedAt: now,
        organizationAssignmentStatus: "ASSIGNED", user: { create: { email, passwordHash } } },
      select: { id: true },
    });
    await tx.meetup.create({ data: {
      organizationId, hostId: member.id, requestId: "review-meetup", title: "志工交流晚餐", category: "餐敘",
      startsAt: new Date(+now + 30 * 86_400_000), location: "示範集合點", description: "此為合成審查資料。",
      capacity: 8, registrations: { create: { memberId: member.id } },
    } });
    return { email, alreadyProvisioned: false };
  }, { isolationLevel: "Serializable" });
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
