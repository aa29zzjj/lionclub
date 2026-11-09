import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { resolveInviteOrganization } from "@/lib/invite-organization";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { registrationTargetsInvitedClub } from "@/lib/club-registration-policy";

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Retain the legacy DB column, but never expose it as a signup method.
function qrInvite<T extends { pin: string }>(invite: T): Omit<T, "pin"> {
  const { pin: _legacyPin, ...output } = invite;
  return output;
}

export async function GET(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const requested = organizationIdSchema.optional().safeParse(req.nextUrl.searchParams.get("organizationId") ?? undefined);
  if (!requested.success) return NextResponse.json({ error: "分會設定格式錯誤" }, { status: 400 });
  const prisma = await getPrisma();
  try {
    const { organization, invites } = await prisma.$transaction(async tx => {
      const organization = await resolveInviteOrganization(tx, member, requested.data);
      const invites = await tx.clubInvite.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "desc" }, include: { organization: { select: { id: true, name: true } } } });
      return { organization, invites };
    }, { isolationLevel: "Serializable" });
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).origin;
    return NextResponse.json({ organization, approvalRequired: false, registrationMode: registrationTargetsInvitedClub(organization.id) ? "direct_club" : "central", invites: invites.map(invite => {
      const registerUrl = new URL("/register", origin);
      registerUrl.searchParams.set("org", invite.organizationId);
      registerUrl.searchParams.set("token", invite.token);
      return { ...qrInvite(invite), registerUrl: registerUrl.toString() };
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return inviteErrorResponse(error); }
}

const organizationIdSchema = z.string().trim().min(1).max(256);
const bodySchema = z.object({
  organizationId: organizationIdSchema.optional(),
  validDays: z.number().int().min(1).max(365).optional(),
  usageLimit: z.number().int().min(1).optional(),
});

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作邀請" }, { status: 403 });
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "邀請設定格式錯誤" }, { status: 400 });
  const validDays = parsed.data.validDays ?? 3;
  const usageLimit = parsed.data.usageLimit;
  const prisma = await getPrisma();
  try {
    const { organization, invite } = await prisma.$transaction(async (tx) => {
      const organization = await resolveInviteOrganization(tx, member, parsed.data.organizationId);
      const now = new Date();
      const invite = await tx.clubInvite.create({ data: { organizationId: organization.id, pin: generatePin(), token: crypto.randomBytes(24).toString("base64url"), issuedById: member.id,
        validFrom: now, validUntil: new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000), usageLimit }, include: { organization: { select: { id: true, name: true } } } });
      return { organization, invite };
    }, { isolationLevel: "Serializable" });

    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const registerUrl = new URL("/register", `${appOrigin}/`);
    registerUrl.searchParams.set("org", invite.organizationId);
    registerUrl.searchParams.set("token", invite.token);

    return NextResponse.json({ organization, approvalRequired: false, registrationMode: registrationTargetsInvitedClub(organization.id) ? "direct_club" : "central", invite: qrInvite(invite), registerUrl: registerUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return inviteErrorResponse(error);
  }
}

function inviteErrorResponse(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "會籍或權限同時更新，請重新載入後操作" }, { status: 409 });
  return onboardingErrorResponse(error);
}
