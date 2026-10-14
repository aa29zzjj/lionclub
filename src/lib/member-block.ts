import { getPrisma } from "./prisma";
import type { Prisma } from "@prisma/client";
type Database = Awaited<ReturnType<typeof getPrisma>> | Prisma.TransactionClient;

export async function isBlockedEitherWay(
  prisma: Database,
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

/** IDs hidden in suggestions, search, invitations and received notifications. */
export async function getBlockedMemberIds(prisma: Database, memberId: string) {
  const blocks = await prisma.memberBlock.findMany({
    where: { OR: [{ blockerId: memberId }, { blockedId: memberId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(blocks.map((block) => block.blockerId === memberId ? block.blockedId : block.blockerId))];
}
