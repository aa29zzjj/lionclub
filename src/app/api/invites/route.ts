import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { OnboardingError } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";

const ALLOWED_ISSUER_ROLES = [
  "CLUB_OFFICER",
  "CLUB_VICE_PRESIDENT",
  "CLUB_PRESIDENT",
  "CLUB_FINANCE",
  "ZONE_ADMIN",
  "DISTRICT_ADMIN",
  "MULTIDISTRICT_ADMIN",
  "SUPER_ADMIN",
];

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Retain the legacy DB column, but never expose it as a signup method.
function qrInvite<T extends { pin: string }>(invite: T): Omit<T, "pin"> {
  const { pin: _legacyPin, ...output } = invite;
  return output;
}

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await hasAdminRoleForOrganization(member.id, member.organizationId, ALLOWED_ISSUER_ROLES))) {
    return NextResponse.json({ error: "您沒有權限查看本分會邀請" }, { status: 403 });
  }

  const prisma = await getPrisma();
  const invites = await prisma.clubInvite.findMany({
    where: { organizationId: member.organizationId },
    orderBy: { createdAt: "desc" },
    include: { organization: { select: { name: true } } },
  });

  return NextResponse.json({ invites: invites.map(qrInvite) });
}

const bodySchema = z.object({
  validDays: z.number().int().min(1).max(365).optional(),
  usageLimit: z.number().int().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "邀請設定格式錯誤" }, { status: 400 });
  const validDays = parsed.data.validDays ?? 3;
  const usageLimit = parsed.data.usageLimit;
  const prisma = await getPrisma();
  try {
    const invite = await prisma.$transaction(async (tx) => {
      const actor = await tx.member.findFirst({ where: { id: member.id, status: "ACTIVE", organizationId: member.organizationId }, select: { id: true } });
      const organization = await tx.organization.findFirst({ where: { id: member.organizationId, isActive: true, level: "club" }, select: { id: true } });
      if (!actor || !organization || !(await hasAdminRoleForOrganization(member.id, member.organizationId, ALLOWED_ISSUER_ROLES, tx))) throw new OnboardingError(403, "會籍或權限已變更，請重新載入後操作");
      return tx.clubInvite.create({ data: { organizationId: member.organizationId, pin: generatePin(), token: crypto.randomBytes(24).toString("base64url"), issuedById: member.id,
        validFrom: new Date(), validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000), usageLimit } });
    }, { isolationLevel: "Serializable" });

    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const registerUrl = new URL("/register", `${appOrigin}/`);
    registerUrl.searchParams.set("org", invite.organizationId);
    registerUrl.searchParams.set("token", invite.token);

    return NextResponse.json({ invite: qrInvite(invite), registerUrl: registerUrl.toString() });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "會籍或權限同時更新，請重新載入後操作" }, { status: 409 });
    return onboardingErrorResponse(error);
  }
}
