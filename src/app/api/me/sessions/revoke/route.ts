import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getSession, createSession, destroySession } from "@/lib/session";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { revokeOtherSessions, SessionRevocationError } from "@/lib/session-revocation";

const schema = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入目前密碼確認" }, { status: 400 });
  const prisma = await getPrisma();
  const limited = await consumeAuthLimits(prisma, "revoke-sessions", getClientIp(request), session.userId);
  if (limited) return rateLimitResponse(limited);
  try {
    const result = await revokeOtherSessions(prisma, session, parsed.data.password, { verifyPassword: bcrypt.compare, renewSession: createSession, clearSession: destroySession });
    return NextResponse.json({ ok: true, ...result, message: result.currentSessionRetained ? "其他裝置已登出，此裝置繼續使用" : "所有裝置已登出，請重新登入" });
  } catch (error) {
    if (error instanceof SessionRevocationError) return NextResponse.json({ error: error.code === "PASSWORD_INVALID" ? "密碼不正確" : "登入狀態已更新，請重新登入" }, { status: error.code === "PASSWORD_INVALID" ? 401 : 409 });
    throw error;
  }
}
