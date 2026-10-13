import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "缺少邀請 token" }, { status: 400 });
  }

  const prisma = await getPrisma();
  const invite = await prisma.clubInvite.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true, level: true, isActive: true } } },
  });

  const now = new Date();
  const valid =
    !!invite &&
    !invite.revokedAt &&
    invite.organization.isActive && invite.organization.level === "club" &&
    invite.validFrom <= now &&
    invite.validUntil >= now &&
    (invite.usageLimit == null || invite.usageCount < invite.usageLimit);

  if (!invite || !valid) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  return NextResponse.json({
    valid: true,
    organizationId: invite.organization.id,
    organizationName: invite.organization.name,
  });
}
