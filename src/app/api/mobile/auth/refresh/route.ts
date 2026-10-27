import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { readMobileToken, signMobileAccessToken, signMobileRefreshToken, MOBILE_ACCESS_TOKEN_DURATION_SECONDS } from "@/lib/mobile-auth";
import type { SessionUser } from "@/lib/auth-session";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 refreshToken" }, { status: 400 });

  const prisma = await getPrisma();
  const { AUTH_SECRET } = await getAppSecrets();
  const key = new TextEncoder().encode(AUTH_SECRET);

  const session = await readMobileToken(parsed.data.refreshToken, "mobile_refresh", {
    key,
    findUser: (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { id: true, memberId: true, email: true, sessionVersion: true, member: { select: { memberNo: true } } },
      }) as unknown as Promise<SessionUser | null>,
    production: process.env.NODE_ENV === "production",
  });
  if (!session) return NextResponse.json({ error: "登入已過期，請重新登入" }, { status: 401 });

  // Rotate the refresh token on every use so a stale copy left in logs/backups has a shrinking window.
  const [accessToken, refreshToken] = await Promise.all([
    signMobileAccessToken(session, key),
    signMobileRefreshToken(session, key),
  ]);

  return NextResponse.json({ accessToken, refreshToken, expiresIn: MOBILE_ACCESS_TOKEN_DURATION_SECONDS });
}
