import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { ExperienceReviewError, reviewExperience } from "@/lib/experience-review";

const bodySchema = z.object({
  action: z.enum(["verify", "reject"]),
  rejectedReason: z.string().trim().max(1000).optional(),
  reviewReason: z.string().trim().max(1000).optional(),
  expectedUpdatedAt: z.string().datetime(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ experienceId: string }> }) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { experienceId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請重新載入名單後，以完整版本及有效理由審核" }, { status: 400 });

  const prisma = await getPrisma();
  try {
    return NextResponse.json(await reviewExperience(prisma, {
      actorId: me.id, experienceId, action: parsed.data.action, expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      reason: parsed.data.reviewReason || parsed.data.rejectedReason,
    }));
  } catch (error) {
    if (error instanceof ExperienceReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
