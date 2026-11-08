import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { TERMS_VERSION } from "@/lib/terms";
import { hasAcceptedCurrentTerms } from "@/lib/terms-gate";

const bodySchema = z.object({ accept: z.literal(true), termsVersion: z.string().min(1).max(80) }).strict();
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

async function consent(request: NextRequest, accepting: boolean) {
  const auth = await requireMobileMember(request);
  if (!auth) return json({ error: "未登入或登入已過期" }, 401);
  if (accepting) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "請明確勾選同意目前的使用條款" }, 400);
    if (parsed.data.termsVersion !== TERMS_VERSION) return json({ error: "使用條款版本已更新，請重新讀取後再試", code: "TERMS_VERSION_MISMATCH" }, 409);
  }

  try {
    const result = await auth.prisma.$transaction(async tx => {
      // Re-check the Bearer actor in the same transaction as the consent write:
      // a revoked session, reassigned user or removed member cannot consent.
      const where = {
        id: auth.session.memberId, status: "ACTIVE", deletedAt: null,
        user: { is: { id: auth.session.userId, sessionVersion: auth.session.sessionVersion } },
      };
      const member = await tx.member.findFirst({ where, select: { termsAcceptedAt: true, termsVersion: true } });
      if (!member) return null;
      let accepted = hasAcceptedCurrentTerms(member);
      let acceptedAt = accepted ? member.termsAcceptedAt : null;
      if (accepting && !accepted) {
        acceptedAt = new Date();
        const written = await tx.member.updateMany({ where, data: { termsAcceptedAt: acceptedAt, termsVersion: TERMS_VERSION } });
        if (written.count !== 1) return null;
        accepted = true;
      }
      return { termsVersion: TERMS_VERSION, accepted, termsAcceptedAt: acceptedAt?.toISOString() ?? null };
    }, { isolationLevel: "Serializable" });
    if (!result) return json({ error: "登入狀態已更新，請重新登入" }, 401);
    return json(accepting ? { ok: true, ...result } : result);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return json({ error: "資料同時更新，同意結果尚未確認，請重新讀取後再試" }, 409);
    return json({ error: "使用條款狀態尚未確認，請稍後重新讀取" }, 503);
  }
}

export async function GET(request: NextRequest) { return consent(request, false); }
export async function POST(request: NextRequest) { return consent(request, true); }
