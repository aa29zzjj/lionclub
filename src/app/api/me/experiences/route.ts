import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { experienceData, experienceInputSchema, serializeExperience } from "@/lib/member-experience";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const experiences = await prisma.memberExperience.findMany({
    where: { memberId: me.id },
    orderBy: [{ startYear: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ experiences: experiences.map(serializeExperience) });
}

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = experienceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }

  const prisma = await getPrisma();
  const experience = await prisma.memberExperience.create({
    data: { memberId: me.id, ...experienceData(parsed.data) },
  });

  return NextResponse.json({ experience: serializeExperience(experience) }, { status: 201 });
}
