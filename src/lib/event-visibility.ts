import type { Prisma } from "@prisma/client";
import { getBlockedMemberIds, isBlockedEitherWay } from "./member-block";

type Database = Parameters<typeof getBlockedMemberIds>[0];

/** Official activities belong to an organization, not the publishing member.
 * Blocked personal content is hidden from normal browsing, in both directions.
 * Management/attendance audit routes retain their existing explicit authorization.
 */
export async function visibleEventsWhere(db: Database, memberId: string): Promise<Prisma.EventWhereInput> {
  const blocked = await getBlockedMemberIds(db, memberId);
  return { NOT: { category: "PERSONAL", createdById: { in: blocked } } };
}

export async function isPersonalEventHidden(db: Database, memberId: string, event: { category: string; createdById: string }) {
  return event.category === "PERSONAL" && event.createdById !== memberId
    && await isBlockedEitherWay(db, memberId, event.createdById);
}
