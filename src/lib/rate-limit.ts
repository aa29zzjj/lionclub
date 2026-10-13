import { NextRequest } from "next/server";
import { getPrisma } from "./prisma";

const WINDOW_MS = 10 * 60 * 1000; // 10 分鐘固定時窗

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** 回傳 true 表示已超過限制，呼叫端應回 429。輕微競態可接受（略多算幾次），不影響安全性。 */
export async function isRateLimited(key: string, limit: number, windowMs = WINDOW_MS): Promise<boolean> {
  const prisma = await getPrisma();
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const existing = await prisma.rateLimitAttempt.findUnique({ where: { key } });
  if (!existing || existing.windowStart.getTime() !== windowStart.getTime()) {
    await prisma.rateLimitAttempt.upsert({
      where: { key },
      create: { key, windowStart, count: 1 },
      update: { windowStart, count: 1 },
    });
    return false;
  }
  const updated = await prisma.rateLimitAttempt.update({ where: { key }, data: { count: { increment: 1 } } });
  return updated.count > limit;
}
