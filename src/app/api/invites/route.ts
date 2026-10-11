import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";

const ALLOWED_ISSUER_ROLES = [
  "CLUB_OFFICER",
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

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const invites = await prisma.clubInvite.findMany({
    where: { organizationId: member.organizationId },
    orderBy: { createdAt: "desc" },
    include: { organization: { select: { name: true } } },
  });

  return NextResponse.json({ invites });
}

const bodySchema = z.object({
  validDays: z.number().int().min(1).max(365).optional(),
  usageLimit: z.number().int().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const allowed = await hasAdminRoleForOrganization(member.id, member.organizationId, ALLOWED_ISSUER_ROLES);
  if (!allowed) {
    return NextResponse.json({ error: "您沒有權限產生本分會的邀請" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const validDays = parsed.success && parsed.data.validDays ? parsed.data.validDays : 365;
  const usageLimit = parsed.success ? parsed.data.usageLimit : undefined;

  const prisma = await getPrisma();
  const invite = await prisma.clubInvite.create({
    data: {
      organizationId: member.organizationId,
      pin: generatePin(),
      token: crypto.randomBytes(24).toString("base64url"),
      issuedById: member.id,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
      usageLimit,
    },
  });

  const registerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/register?org=${invite.organizationId}&token=${invite.token}`;

  return NextResponse.json({ invite, registerUrl });
}
