import { getPrisma } from "./prisma";

export async function isBlockedEitherWay(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  memberIdA: string,
  memberIdB: string
) {
  const block = await prisma.memberBlock.findFirst({
    where: {
      OR: [
        { blockerId: memberIdA, blockedId: memberIdB },
        { blockerId: memberIdB, blockedId: memberIdA },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
}
