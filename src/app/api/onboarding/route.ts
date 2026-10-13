import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getIntakeOrganization, requiresRegistrationInvite } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";

export async function GET() {
  try {
    const organization = await getIntakeOrganization(await getPrisma());
    return NextResponse.json({ organization, requiresInvite: requiresRegistrationInvite(), mode: "central" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
