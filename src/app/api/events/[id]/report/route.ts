import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

const bodySchema = z.object({
  reason: z.string().trim().min(2, "請簡述檢舉原因").max(200),
  details: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  if (await isRateLimited(`report:${getClientIp(request)}`, 10)) {
    return NextResponse.json({ error: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const { id } = await params;
  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, title: true, createdById: true } });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });
  if (event.createdById === me.id) return NextResponse.json({ error: "不能檢舉自己發布的活動" }, { status: 400 });

  // One open report per reporter per event; repeating it adds nothing for the reviewer.
  const open = await prisma.eventReport.findFirst({ where: { reporterId: me.id, eventId: event.id, status: "PENDING" }, select: { id: true } });
  if (!open) {
    await prisma.eventReport.create({
      data: { reporterId: me.id, eventId: event.id, eventTitle: event.title.slice(0, 200), reason: parsed.data.reason, details: parsed.data.details || null },
    });
  }
  return NextResponse.json({ ok: true });
}
