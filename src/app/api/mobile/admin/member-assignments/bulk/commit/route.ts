import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { getAssignmentScope } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { bulkCommitSchema, commitBulkAssignments } from "@/lib/bulk-member-assignment";

export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const parsed = bulkCommitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  try {
    await getAssignmentScope(prisma, me.id);
    return NextResponse.json(await commitBulkAssignments(prisma, me.id, parsed.data.rows), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
