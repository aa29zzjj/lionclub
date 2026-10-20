import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getSession, createSession, destroySession } from "@/lib/session";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { revokeOtherSessions, SessionRevocationError } from "@/lib/session-revocation";
import { consumeOAuthReauth } from "@/lib/federated-auth-service";
import { FederatedAuthError } from "@/lib/federated-auth";
import { OAUTH_REAUTH_COOKIE, clearOAuthCookie, readOAuthCookie } from "@/lib/federated-auth-http";

const schema = z.object({ password: z.string().min(1).max(200).optional() });

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
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: "登入狀態已更新，請重新登入" }, { status: 401 });
    if (!user.passwordHash) {
      if (!await consumeOAuthReauth(prisma, session, await readOAuthCookie(OAUTH_REAUTH_COOKIE), "sessions")) return NextResponse.json({ error: "請先以已連結的第三方帳號重新驗證", code: "REAUTH_REQUIRED" }, { status: 401 });
      await clearOAuthCookie(OAUTH_REAUTH_COOKIE);
      const changed = await prisma.user.updateMany({ where: { id: user.id, memberId: session.memberId, passwordHash: null, sessionVersion: session.sessionVersion }, data: { sessionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new SessionRevocationError("SESSION_CONFLICT");
      let currentSessionRetained = true;
      try { await createSession({ ...session, email: user.email, sessionVersion: session.sessionVersion + 1 }); }
      catch { await destroySession(); currentSessionRetained = false; }
      return NextResponse.json({ ok: true, currentSessionRetained, message: currentSessionRetained ? "其他裝置已登出，此裝置繼續使用" : "所有裝置已登出，請重新登入" });
    }
    const result = await revokeOtherSessions(prisma, session, parsed.data.password || "", { verifyPassword: bcrypt.compare, renewSession: createSession, clearSession: destroySession });
    return NextResponse.json({ ok: true, ...result, message: result.currentSessionRetained ? "其他裝置已登出，此裝置繼續使用" : "所有裝置已登出，請重新登入" });
  } catch (error) {
    if (error instanceof SessionRevocationError) return NextResponse.json({ error: error.code === "PASSWORD_INVALID" ? "密碼不正確" : "登入狀態已更新，請重新登入" }, { status: error.code === "PASSWORD_INVALID" ? 401 : 409 });
    if (error instanceof FederatedAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
