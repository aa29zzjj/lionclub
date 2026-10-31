import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { readOAuthHandoffCode, signMobileAccessToken, signMobileRefreshToken, MOBILE_ACCESS_TOKEN_DURATION_SECONDS } from "@/lib/mobile-auth";
import type { SessionUser } from "@/lib/auth-session";

const schema = z.object({ code: z.string().min(1).max(4096) });

/** Exchanges the one-time OAuth handoff code (from the custom-scheme redirect) for the same
 * mobile access/refresh token pair POST /api/mobile/auth/login issues. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 code" }, { status: 400 });

  const prisma = await getPrisma();
  const { AUTH_SECRET } = await getAppSecrets();
  const key = new TextEncoder().encode(AUTH_SECRET);

  const session = await readOAuthHandoffCode(parsed.data.code, {
    key,
    findUser: (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { id: true, memberId: true, email: true, sessionVersion: true, member: { select: { memberNo: true } } },
      }) as unknown as Promise<SessionUser | null>,
    production: process.env.NODE_ENV === "production",
  });
  if (!session) return NextResponse.json({ error: "登入連結已過期或已使用，請重新開始" }, { status: 401 });

  const [accessToken, refreshToken] = await Promise.all([signMobileAccessToken(session, key), signMobileRefreshToken(session, key)]);
  return NextResponse.json({ accessToken, refreshToken, expiresIn: MOBILE_ACCESS_TOKEN_DURATION_SECONDS, memberId: session.memberId });
}
