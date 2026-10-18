import type { Prisma } from "@prisma/client";
import { getCurrentLionYearStart } from "./lion-year";

type Database = Pick<Prisma.TransactionClient, "annualAppointment" | "organization">;

const CLUB_SUFFIX = "獅子會";

function bareClubName(name: string) {
  return name.endsWith(CLUB_SUFFIX) ? name.slice(0, -CLUB_SUFFIX.length) : name;
}

/**
 * Finds this year's roster appointments that match the member by name + home club,
 * excluding any already claimed into a MemberExperience. Matching is name+club only —
 * the private roster never carries phone numbers, so a three-of-two match is not possible.
 */
export async function findAnnualAppointmentSuggestions(
  db: Database,
  member: { name: string; organizationName: string },
  now = new Date(),
) {
  const yearStart = getCurrentLionYearStart(now);
  const club = bareClubName(member.organizationName);
  return db.annualAppointment.findMany({
    where: {
      yearStart,
      personName: member.name,
      homeClubSourceName: club,
      claimedByExperience: null,
    },
    select: {
      id: true,
      positionName: true,
      listingNature: true,
      sourcePage: true,
      yearStart: true,
      organizationId: true,
      organization: { select: { id: true, name: true, level: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
