import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { clubApplicationEnabled, getIntakeOrganization, requiresRegistrationInvite } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";

export async function GET() {
  try {
    if (clubApplicationEnabled()) return NextResponse.json({ requiresInvite: true, inviteMethod: "qr", mode: "club_application" },
      { headers: { "Cache-Control": "no-store" } });
    const organization = await getIntakeOrganization(await getPrisma());
    return NextResponse.json({ organization, requiresInvite: requiresRegistrationInvite(), inviteMethod: "qr", mode: "central" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
