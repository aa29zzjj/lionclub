import { Prisma } from "@prisma/client";
import { eventTagsSchema, type EventTag } from "./event-list";

type Database = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

export class EventTagsUnavailableError extends Error {
  status = 503;
  code = "EVENT_TAGS_UNAVAILABLE";
  constructor() { super("活動標籤尚未啟用，請先取消標籤後重試，或稍後再試。"); }
}

/** No cache: an operator's later additive migration becomes usable without a restart.
 * @ignore keeps ordinary Prisma Event reads/creates compatible with the old table.
 * Only this adapter accesses the additive column, using parameter-bound SQL.
 */
async function available(db: Database) {
  const rows = await db.$queryRaw<{ available: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Event'
        AND column_name = 'tags' AND data_type = 'ARRAY' AND udt_name = '_text'
    ) AS available`;
  return rows[0]?.available === true;
}

export async function readEventTags(db: Database, ids: string[]) {
  const tagsAvailable = await available(db);
  const byId = new Map<string, EventTag[]>();
  if (tagsAvailable && ids.length) {
    const rows = await db.$queryRaw<{ id: string; tags: string[] }[]>(Prisma.sql`
      SELECT "id", "tags" FROM "Event" WHERE "id" IN (${Prisma.join(ids)})`);
    for (const row of rows) {
      const parsed = eventTagsSchema.safeParse(row.tags);
      byId.set(row.id, parsed.success ? parsed.data : []);
    }
  }
  return { tagsAvailable, byId };
}

/** Must run in the same transaction as the event mutation: never silently discard tags. */
export async function writeEventTags(db: Database, id: string, tags: EventTag[]) {
  if (!await available(db)) {
    if (tags.length) throw new EventTagsUnavailableError();
    return;
  }
  await db.$executeRaw`UPDATE "Event" SET "tags" = ${tags}::text[] WHERE "id" = ${id}`;
}
