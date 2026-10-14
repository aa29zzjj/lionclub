import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getAssignmentScope } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { bulkCommitSchema, commitBulkAssignments } from "@/lib/bulk-member-assignment";

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作分派" }, { status: 403 });
  const parsed = bulkCommitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  try {
    const prisma = await getPrisma();
    await getAssignmentScope(prisma, me.id);
    return NextResponse.json(await commitBulkAssignments(prisma, me.id, parsed.data.rows), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
