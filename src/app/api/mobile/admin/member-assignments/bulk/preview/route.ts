import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { bulkPreviewSchema, previewBulkAssignments } from "@/lib/bulk-member-assignment";

export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });

  const parsed = bulkPreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  try { return NextResponse.json(await previewBulkAssignments(auth.prisma, auth.member.id, parsed.data.rows), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return onboardingErrorResponse(error); }
}
