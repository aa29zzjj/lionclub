import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { productionLoginDenial } from "@/lib/auth-session";
import { findUserByEmail } from "@/lib/user-email";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { signMobileAccessToken, signMobileRefreshToken, MOBILE_ACCESS_TOKEN_DURATION_SECONDS } from "@/lib/mobile-auth";

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

/** No isTrustedBrowserMutation() Origin check here: bearer tokens are not sent
 * automatically by any client the way cookies are, so this flow is not CSRF-exposed. */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "請輸入帳號與密碼" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const prisma = await getPrisma();
  const limited = await consumeAuthLimits(prisma, "login", getClientIp(req), email);
  if (limited) return rateLimitResponse(limited);

  const inputDenial = productionLoginDenial(email, password);
  if (inputDenial) return NextResponse.json({ error: inputDenial.error, code: inputDenial.code }, { status: inputDenial.status });

  const user = await findUserByEmail(prisma, email);
  if (!user || !user.passwordHash || productionLoginDenial(email, password, user)) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  if (!user.member) {
    return NextResponse.json({ error: "此帳號尚未綁定會員資料" }, { status: 403 });
  }
  if (user.member.status === "PENDING") {
    return NextResponse.json({ error: "您的入會申請尚待審核" }, { status: 403 });
  }
  if (user.member.status !== "ACTIVE") {
    return NextResponse.json({ error: "此帳號已被停權" }, { status: 403 });
  }

  const payload = { userId: user.id, memberId: user.member.id, email: user.email, sessionVersion: user.sessionVersion };
  const { AUTH_SECRET } = await getAppSecrets();
  const key = new TextEncoder().encode(AUTH_SECRET);
  const [accessToken, refreshToken] = await Promise.all([
    signMobileAccessToken(payload, key),
    signMobileRefreshToken(payload, key),
  ]);

  return NextResponse.json({ accessToken, refreshToken, expiresIn: MOBILE_ACCESS_TOKEN_DURATION_SECONDS, memberId: user.member.id });
}
