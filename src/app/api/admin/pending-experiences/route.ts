import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { serializeExperience } from "@/lib/member-experience";
import { ExperienceReviewError, experienceReviewCandidateWhere, experienceReviewDecision, loadExperienceReviewContext } from "@/lib/experience-review";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  try {
    const result = await prisma.$transaction(async tx => {
      const context = await loadExperienceReviewContext(tx, me.id);
      const experiences = await tx.memberExperience.findMany({
        where: experienceReviewCandidateWhere(context), orderBy: [{ createdAt: "asc" }],
        include: { member: { select: { id: true, name: true, organization: { select: { name: true } } } } },
      });
      return experiences.flatMap(experience => {
        const decision = experienceReviewDecision(context, experience);
        return decision.allowed ? [{ ...serializeExperience(experience), member: experience.member,
          review: { label: decision.label, requiresReason: decision.requiresReason } }] : [];
      });
    }, { isolationLevel: "RepeatableRead" });
    return NextResponse.json({ experiences: result });
  } catch (error) {
    if (error instanceof ExperienceReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
