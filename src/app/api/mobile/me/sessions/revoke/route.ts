import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { getAppSecrets } from "@/lib/secrets";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { revokeOtherSessions, SessionRevocationError } from "@/lib/session-revocation";
import { signMobileAccessToken, signMobileRefreshToken } from "@/lib/mobile-auth";

const schema = z.object({ password: z.string().min(1).max(200).optional() });

// Mobile has no reauth cookie (that's a web browser-redirect flow), so unlike
// the web route, OAuth-only accounts can't revoke other sessions from the app
// yet — point them at the website rather than fake a check that can't run here.
export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, session } = auth;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入目前密碼確認" }, { status: 400 });

  const limited = await consumeAuthLimits(prisma, "revoke-sessions", getClientIp(request), session.userId);
  if (limited) return rateLimitResponse(limited);

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "登入狀態已更新，請重新登入" }, { status: 401 });
  if (!user.passwordHash) {
    return NextResponse.json({ error: "此帳號使用第三方登入，請改到網站撤銷其他裝置登入", code: "REAUTH_REQUIRED" }, { status: 401 });
  }

  try {
    let nextTokens: { accessToken: string; refreshToken: string } | null = null;
    const result = await revokeOtherSessions(prisma, session, parsed.data.password || "", {
      verifyPassword: bcrypt.compare,
      renewSession: async (renewed) => {
        const { AUTH_SECRET } = await getAppSecrets();
        const key = new TextEncoder().encode(AUTH_SECRET);
        nextTokens = {
          accessToken: await signMobileAccessToken(renewed, key),
          refreshToken: await signMobileRefreshToken(renewed, key),
        };
      },
      clearSession: async () => {},
    });
    return NextResponse.json({
      ok: true, ...result, ...(nextTokens ?? {}),
      message: result.currentSessionRetained ? "其他裝置已登出，此裝置繼續使用" : "所有裝置已登出，請重新登入",
    });
  } catch (error) {
    if (error instanceof SessionRevocationError) return NextResponse.json({ error: error.code === "PASSWORD_INVALID" ? "密碼不正確" : "登入狀態已更新，請重新登入" }, { status: error.code === "PASSWORD_INVALID" ? 401 : 409 });
    throw error;
  }
}
