import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { experienceData, experienceInputSchema, serializeExperience } from "@/lib/member-experience";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

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
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = experienceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }

  const prisma = await getPrisma();
  try {
    const experience = await prisma.$transaction(async tx => {
      if (!await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null } })) return null;
      return tx.memberExperience.create({ data: { memberId: me.id, ...experienceData(parsed.data) } });
    }, { isolationLevel: "Serializable" });
    if (!experience) return NextResponse.json({ error: "帳號已更新，請重新登入" }, { status: 409 });
    return NextResponse.json({ experience: serializeExperience(experience) }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2003"].includes(String(error.code))) return NextResponse.json({ error: "資料同時更新，請重新載入後重試" }, { status: 409 });
    throw error;
  }
}
