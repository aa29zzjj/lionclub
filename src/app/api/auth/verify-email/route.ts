import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { consumeEmailVerification, EmailVerificationError } from "@/lib/email-verification";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({ token: z.string().trim().min(20).max(200) });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少驗證碼" }, { status: 400 });

  const prisma = await getPrisma();
  const limited = await consumeAuthLimits(prisma, "verify-email", getClientIp(request), parsed.data.token);
  if (limited) return rateLimitResponse(limited);
  try { await consumeEmailVerification(prisma, parsed.data.token); }
  catch (error) {
    if (error instanceof EmailVerificationError) return NextResponse.json({ error: "驗證連結不正確或已過期，請重新申請", code: "VERIFICATION_INVALID" }, { status: 400 });
    throw error;
  }

  return NextResponse.json({ ok: true });
}
