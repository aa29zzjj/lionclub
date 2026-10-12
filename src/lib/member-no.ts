import { getPrisma } from "./prisma";

/**
 * Generates the next member number for an organization's district, formatted as
 * `{districtCode}-{seq}` (e.g. "300A-1-0007") so the district is identifiable at a glance.
 */
export async function generateMemberNo(prisma: Awaited<ReturnType<typeof getPrisma>>, organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { districtCode: true },
  });
  const prefix = org?.districtCode || "UNK";

  const existing = await prisma.member.findMany({
    where: { memberNo: { startsWith: `${prefix}-` } },
    select: { memberNo: true },
  });

  let maxSeq = 0;
  for (const m of existing) {
    const match = m.memberNo?.match(/-(\d+)$/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }

  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
}
