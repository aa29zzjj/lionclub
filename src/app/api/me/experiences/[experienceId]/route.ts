import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { experienceData, experienceInputSchema, serializeExperience } from "@/lib/member-experience";

type Context = { params: Promise<{ experienceId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
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

  const experience = await prisma.memberExperience.update({
    where: { id: experienceId },
    data: experienceData(parsed.data),
  });
  return NextResponse.json({ experience: serializeExperience(experience) });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { experienceId } = await context.params;
  const prisma = await getPrisma();
  const existing = await prisma.memberExperience.findFirst({ where: { id: experienceId, memberId: me.id } });
  if (!existing) return NextResponse.json({ error: "找不到這筆資歷" }, { status: 404 });
  if (existing.verificationStatus === "verified") {
    return NextResponse.json({ error: "已核實資歷需由管理員退回後才能刪除" }, { status: 409 });
  }

  await prisma.memberExperience.delete({ where: { id: experienceId } });
  return NextResponse.json({ ok: true });
}
