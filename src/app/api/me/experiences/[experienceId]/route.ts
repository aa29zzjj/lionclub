import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { experienceData, experienceInputSchema, serializeExperience } from "@/lib/member-experience";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

type Context = { params: Promise<{ experienceId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = experienceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }

  const { experienceId } = await context.params;
  const prisma = await getPrisma();
  const existing = await prisma.memberExperience.findFirst({ where: { id: experienceId, memberId: me.id } });
  if (!existing) return NextResponse.json({ error: "找不到這筆資歷" }, { status: 404 });
  if (existing.verificationStatus === "verified") {
    return NextResponse.json({ error: "已核實資歷需由管理員退回後才能修改" }, { status: 409 });
  }

  try {
    const changed = await prisma.memberExperience.updateMany({
      where: { id: experienceId, memberId: me.id, verificationStatus: { not: "verified" }, member: { status: "ACTIVE", deletedAt: null } },
      data: experienceData(parsed.data, existing.startMonth),
    });
    if (!changed.count) return NextResponse.json({ error: "資歷或帳號狀態已更新，請重新載入" }, { status: 409 });
    const experience = await prisma.memberExperience.findUnique({ where: { id: experienceId } });
    if (!experience) return NextResponse.json({ error: "資歷已被刪除，請重新載入" }, { status: 409 });
    return NextResponse.json({ experience: serializeExperience(experience) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2025"].includes(String(error.code))) return NextResponse.json({ error: "資料同時更新，請重新載入" }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  if (!isTrustedBrowserMutation(_request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { experienceId } = await context.params;
  const prisma = await getPrisma();
  const existing = await prisma.memberExperience.findFirst({ where: { id: experienceId, memberId: me.id } });
  if (!existing) return NextResponse.json({ error: "找不到這筆資歷" }, { status: 404 });
  if (existing.verificationStatus === "verified") {
    return NextResponse.json({ error: "已核實資歷需由管理員退回後才能刪除" }, { status: 409 });
  }

  const removed = await prisma.memberExperience.deleteMany({ where: { id: experienceId, memberId: me.id, verificationStatus: { not: "verified" } } });
  if (!removed.count) return NextResponse.json({ error: "資歷狀態已更新，請重新載入" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
