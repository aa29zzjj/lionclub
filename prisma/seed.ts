import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { clubDirectoryByDistrict } from "../src/lib/club-directory";

const prisma = new PrismaClient();

async function main() {
  // ── 組織架構：300A 複合區 → 四個區 → 官方分會名單 ──
  const md = await prisma.organization.upsert({
    where: { id: "seed-md-300a" },
    update: {},
    create: {
      id: "seed-md-300a",
      level: "md",
      code: "300A",
      name: "300A 複合區",
      isActive: true,
    },
  });

  let demoClubId: string | null = null;

  for (const [districtCode, directory] of Object.entries(clubDirectoryByDistrict)) {
    if (!directory) continue;

    const district = await prisma.organization.upsert({
      where: { id: `seed-district-${districtCode}` },
      update: {},
      create: {
        id: `seed-district-${districtCode}`,
        level: "district",
        code: districtCode,
        name: `${districtCode} 區`,
        parentId: md.id,
        districtCode,
        isActive: true,
        sourceLabel: directory.sourceLabel,
        sourceUrl: directory.sourceUrl,
        verifiedAt: new Date(directory.verifiedAt),
      },
    });

    for (const clubName of directory.clubs) {
      const club = await prisma.organization.upsert({
        where: { id: `seed-club-${districtCode}-${clubName}` },
        update: {},
        create: {
          id: `seed-club-${districtCode}-${clubName}`,
          level: "club",
          name: clubName,
          parentId: district.id,
          districtCode,
          isActive: true,
          sourceLabel: directory.sourceLabel,
          sourceUrl: directory.sourceUrl,
          verifiedAt: new Date(directory.verifiedAt),
        },
      });

      // 記住第一間 300A-1 的分會，拿來建 demo 帳號與邀請
      if (districtCode === "300A-1" && !demoClubId) {
        demoClubId = club.id;
      }
    }
  }

  if (!demoClubId) throw new Error("沒有找到可用的 demo 分會，請檢查 club-directory.ts");

  // ── Demo 帳號：示範會長，擁有該分會的 AdminRole ──
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const demoMember = await prisma.member.upsert({
    where: { email: "demo@lions.tw" },
    update: {},
    create: {
      name: "示範會長",
      email: "demo@lions.tw",
      title: "會長",
      role: "CLUB_PRESIDENT",
      status: "ACTIVE",
      memberNo: "DEMO-0001",
      joinYear: 2020,
      organizationId: demoClubId,
    },
  });

  await prisma.user.upsert({
    where: { email: "demo@lions.tw" },
    update: { passwordHash },
    create: {
      email: "demo@lions.tw",
      passwordHash,
      memberId: demoMember.id,
    },
  });

  await prisma.adminRole.deleteMany({
    where: { memberId: demoMember.id, role: "CLUB_PRESIDENT" },
  });
  await prisma.adminRole.create({
    data: {
      memberId: demoMember.id,
      role: "CLUB_PRESIDENT",
      scopeType: "club",
      scopeId: demoClubId,
    },
  });

  // ── Demo 邀請：PIN 248613，一年有效，給新會員註冊用 ──
  await prisma.clubInvite.deleteMany({ where: { organizationId: demoClubId, pin: "248613" } });
  await prisma.clubInvite.create({
    data: {
      organizationId: demoClubId,
      pin: "248613",
      token: crypto.randomBytes(24).toString("base64url"),
      issuedById: demoMember.id,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("Seed 完成：");
  console.log(`- 組織資料已匯入（複合區/區/分會；專區與分區由核定名冊另行匯入）`);
  console.log(`- Demo 帳號：demo@lions.tw / demo1234（${demoClubId} 的會長）`);
  console.log(`- Demo 邀請 PIN：248613`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
