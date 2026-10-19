import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { TERMS_VERSION } from "@/lib/terms";

const bodySchema = z.object({ accept: z.literal(true) });

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!bodySchema.safeParse(await request.json().catch(() => null)).success) {
    return NextResponse.json({ error: "請先勾選同意使用條款" }, { status: 400 });
  }

  const prisma = await getPrisma();
  await prisma.member.updateMany({
    where: { id: me.id, status: "ACTIVE", deletedAt: null },
    data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
  });
  return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
}
