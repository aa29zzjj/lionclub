import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generateMemberNo } from "./member-no";
import { PRIVACY_POLICY_VERSION } from "./privacy-policy";

type Database = PrismaClient | Prisma.TransactionClient;
export const ASSIGNMENT_MANAGER_ROLES = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
export const assignmentMemberSelect = {
  id: true, name: true, email: true, phone: true, status: true,
  declaredOrganizationName: true, organizationAssignmentStatus: true,
  organizationAssignmentVersion: true, updatedAt: true,
  organization: { select: { id: true, name: true } },
} as const;

export class OnboardingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Fail closed: never choose the first arbitrary club or recreate production organizations. */
export async function getIntakeOrganization(db: Database, configuredId = process.env.ONBOARDING_ORGANIZATION_ID) {
  const organizations = await db.organization.findMany({
    where: {
      level: "club", isActive: true,
      ...(configuredId ? { id: configuredId } : { name: { in: ["AI臺科大獅子會", "AI台科大獅子會", "台科大AI獅子會", "台科大 AI 獅子會"] } }),
    },
    select: { id: true, name: true, districtCode: true }, take: 2,
  });
  if (organizations.length !== 1) throw new OnboardingError(503, "中央註冊分會尚未設定完成，請聯絡管理者確認 AI臺科大獅子會");
  return organizations[0];
}

/** QR invitation is mandatory; old public-registration flags/arguments are retired. */
export function requiresRegistrationInvite(_legacyValue?: string) {
  return true;
}

export const centralRegistrationSchema = z.object({
  organizationId: z.string().trim().min(1).max(200).optional(),
  token: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, "密碼至少需要 8 個字元").max(72, "密碼最多 72 個字元")
    .refine((value) => new TextEncoder().encode(value).length <= 72, "密碼最多 72 位元組（中文或表情符號會占用多個位元組）"),
  birthday: z.string().date().optional(),
  phone: z.string().trim().max(50).optional(),
  title: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(3000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  declaredOrganizationName: z.string().trim().max(200).optional(),
  privacyConsent: z.preprocess((value) => value === true, z.literal(true, "請先閱讀並同意隱私權政策與資料處理說明")),
});
export type CentralRegistrationInput = z.infer<typeof centralRegistrationSchema>;

export async function createCentralMember(
  prisma: PrismaClient, input: CentralRegistrationInput, passwordHash: string,
  _legacyRequireInvite?: boolean,
) {
  // Never authorize by PIN or a retired open-mode flag. Legacy QR tokens stay valid.
  if (!input.token) throw new OnboardingError(400, "請掃描共同邀請 QR Code 開啟註冊頁面");
  const token = input.token;
  const intake = await getIntakeOrganization(prisma);
  // Retry serializable conflicts; member number and invite quota share this transaction.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const activeIntake = await tx.organization.findFirst({ where: { id: intake.id, level: "club", isActive: true } });
        if (!activeIntake) throw new OnboardingError(503, "中央註冊分會暫時無法使用");
        const duplicate = await tx.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
        const duplicateMember = await tx.member.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
        if (duplicate || duplicateMember) throw new OnboardingError(409, "此 Email 已經註冊過了");

        const invites = await tx.clubInvite.findMany({
          where: {
            token, revokedAt: null, validFrom: { lte: now }, validUntil: { gte: now },
            organization: { level: "club", isActive: true },
          }, take: 2,
        });
        const invite = invites[0];
        if (invites.length !== 1 || !invite || (input.organizationId && input.organizationId !== invite.organizationId)) {
          throw new OnboardingError(400, "邀請 QR Code 不正確或已過期，請索取新的共同邀請");
        }
        // Conditional increment makes a concurrent last-slot claim fail, not overbook.
        const claimed = await tx.clubInvite.updateMany({
          where: { id: invite.id, revokedAt: null, validFrom: { lte: now }, validUntil: { gte: now },
            ...(invite.usageLimit == null ? {} : { usageCount: { lt: invite.usageLimit } }) },
          data: { usageCount: { increment: 1 } },
        });
        if (claimed.count !== 1) throw new OnboardingError(400, "此邀請 QR Code 已達使用上限或已失效，請索取新的邀請");

        const memberNo = await generateMemberNo(tx, intake.id);
        const member = await tx.member.create({
          data: {
            name: input.name, email: input.email, birthday: input.birthday ? new Date(input.birthday) : undefined,
            phone: input.phone, title: input.title, bio: input.bio,
            status: "ACTIVE", role: "MEMBER", organizationId: intake.id, memberNo,
            organizationAssignmentStatus: "NEEDS_ASSIGNMENT",
            declaredOrganizationName: input.declaredOrganizationName || null,
            privacyConsentedAt: now,
            privacyConsentVersion: PRIVACY_POLICY_VERSION,
            tags: input.tags?.length ? { connectOrCreate: [...new Set(input.tags)].map((name) => ({ where: { name }, create: { name } })) } : undefined,
            organizationAssignments: { create: {
              toOrganizationId: intake.id, toOrganizationName: intake.name,
              previousAssignmentStatus: "NEEDS_ASSIGNMENT", assignmentStatus: "NEEDS_ASSIGNMENT",
              reason: "中央註冊：先開通平台，正式分會待名單核對",
            } },
          },
        });
        const user = await tx.user.create({ data: { email: input.email, passwordHash, memberId: member.id } });
        return { member, user, organization: intake };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "P2034" && attempt < 2) continue;
      if (code === "P2034") throw new OnboardingError(409, "同時註冊人數較多，請稍後重新送出");
      if (code === "P2002") throw new OnboardingError(409, "此 Email 已經註冊過了");
      throw error;
    }
  }
  throw new OnboardingError(409, "請稍後重新送出");
}

/** Transfer is stronger than approval: only SUPER_ADMIN is implicitly global. */
export async function getAssignmentScope(db: Database, actorId: string) {
  const actor = await db.member.findFirst({ where: { id: actorId, status: "ACTIVE" }, select: { id: true } });
  if (!actor) throw new OnboardingError(403, "帳號未啟用，無法分派會員");
  const now = new Date();
  const roles = await db.adminRole.findMany({ where: {
    memberId: actorId, role: { in: ASSIGNMENT_MANAGER_ROLES }, validFrom: { lte: now },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  }, select: { role: true, scopeId: true } });
  if (roles.some((role) => role.role === "SUPER_ADMIN")) return undefined;
  const scopeIds = [...new Set(roles.map((role) => role.scopeId).filter((id): id is string => Boolean(id)))];
  if (!scopeIds.length) throw new OnboardingError(403, "沒有會員分會分派權限；跨區分派請由全域管理者處理");
  const visited = new Set(scopeIds);
  let frontier = scopeIds;
  while (frontier.length) {
    const children = await db.organization.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = children.map((child) => child.id).filter((id) => !visited.has(id));
    frontier.forEach((id) => visited.add(id));
  }
  return [...visited];
}

export const assignmentSchema = z.object({
  organizationId: z.string().trim().min(1).max(200),
  expectedOrganizationId: z.string().trim().min(1).max(200),
  expectedAssignmentVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(2, "請填寫正式名單或調整依據（至少 2 字）").max(1000),
});

export async function assignMemberOrganization(prisma: PrismaClient, actorId: string, memberId: string, input: z.infer<typeof assignmentSchema>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const scope = await getAssignmentScope(tx, actorId);
      const target = await tx.member.findUnique({ where: { id: memberId }, include: { organization: { select: { id: true, name: true } } } });
      if (!target || (scope && !scope.includes(target.organizationId))) throw new OnboardingError(404, "找不到可管理的會員");
      if (target.id === actorId) throw new OnboardingError(403, "不能透過此功能更改自己的分會，請由另一位管理者處理");
      if (target.status !== "ACTIVE") throw new OnboardingError(400, "僅能分派已啟用會員，待審核或停權帳號請先走既有流程");
      if (scope && !scope.includes(input.organizationId)) throw new OnboardingError(403, "沒有目標分會權限；跨區分派請由全域管理者處理");
      const organization = await tx.organization.findFirst({ where: { id: input.organizationId, level: "club", isActive: true }, select: { id: true, name: true } });
      if (!organization) throw new OnboardingError(400, "目標必須是啟用的分會");
      if (target.organizationId !== input.expectedOrganizationId || target.organizationAssignmentVersion !== input.expectedAssignmentVersion) throw new OnboardingError(409, "會員資料已被其他管理者更新，請重新載入並核對");
      if (target.organizationId === organization.id && target.organizationAssignmentStatus === "ASSIGNED") throw new OnboardingError(409, "此會員已完成目前分會的確認，無須重複分派");
      const now = new Date();
      const changed = await tx.member.updateMany({
        where: { id: memberId, organizationId: input.expectedOrganizationId, organizationAssignmentVersion: input.expectedAssignmentVersion, status: "ACTIVE" },
        data: { organizationId: organization.id, organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new OnboardingError(409, "會員資料已更新，請重新核對");
      let revokedRoleNames: string[] = [];
      let revokedInviteCount = 0;
      if (target.organizationId !== organization.id) {
        // Revoke all still-live source-club grants, including scheduled future grants.
        const roles = await tx.adminRole.findMany({ where: { memberId, scopeId: target.organizationId, scopeType: "club", OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, select: { id: true, role: true } });
        revokedRoleNames = [...new Set(roles.map((role) => role.role))];
        if (roles.length) await tx.adminRole.updateMany({ where: { id: { in: roles.map((role) => role.id) } }, data: { validUntil: now } });
        const invites = await tx.clubInvite.updateMany({ where: { issuedById: memberId, organizationId: target.organizationId, revokedAt: null }, data: { revokedAt: now } });
        revokedInviteCount = invites.count;
      }
      await tx.memberOrganizationAssignment.create({ data: {
        memberId, fromOrganizationId: target.organizationId, fromOrganizationName: target.organization.name,
        toOrganizationId: organization.id, toOrganizationName: organization.name,
        previousAssignmentStatus: target.organizationAssignmentStatus, assignmentStatus: "ASSIGNED",
        assignedById: actorId, reason: input.reason, revokedRoleNames, revokedInviteCount,
      } });
      return { ok: true, organization, organizationAssignmentStatus: "ASSIGNED", revokedRoleNames, revokedInviteCount };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new OnboardingError(409, "資料同時被更新，請重新載入並核對");
    throw error;
  }
}
