import type { PrismaClient } from "@prisma/client";

/** Preserve exact legacy mixed-case accounts; permit case-insensitive lookup only if unambiguous. */
export async function findUserByEmail(prisma: Pick<PrismaClient, "user">, email: string) {
  const normalized = email.trim();
  const exact = await prisma.user.findUnique({ where: { email: normalized }, include: { member: true } });
  if (exact) return exact;
  const matches = await prisma.user.findMany({ where: { email: { equals: normalized, mode: "insensitive" } }, include: { member: true }, take: 2 });
  return matches.length === 1 ? matches[0] : null;
}
