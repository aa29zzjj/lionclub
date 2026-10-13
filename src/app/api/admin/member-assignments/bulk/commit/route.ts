import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { assignMemberOrganization, OnboardingError } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

const rowSchema = z.object({
  memberId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  expectedOrganizationId: z.string().trim().min(1),
  expectedAssignmentVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(2).max(1000),
});
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(200) });

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作分派" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const prisma = await getPrisma();
  const results = [];
  // 逐筆處理（非單一大交易），讓單筆失敗不影響其他筆，並個別記錄異動紀錄。
  for (const row of parsed.data.rows) {
    try {
      const result = await assignMemberOrganization(prisma, me.id, row.memberId, {
        organizationId: row.organizationId,
        expectedOrganizationId: row.expectedOrganizationId,
        expectedAssignmentVersion: row.expectedAssignmentVersion,
        reason: row.reason,
      });
      results.push({ memberId: row.memberId, ok: true, organization: result.organization });
    } catch (error) {
      results.push({
        memberId: row.memberId,
        ok: false,
        error: error instanceof OnboardingError ? error.message : "分派失敗，請重試",
      });
    }
  }

  return NextResponse.json({ results });
}
