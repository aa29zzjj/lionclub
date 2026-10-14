import type { Prisma, PrismaClient } from "@prisma/client";
export type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; create?: Row; update?: Row; include?: Row; select?: Row; take?: number };
type State = Record<string, Row[]>;
const isObject = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return Array.isArray(condition) && condition.some(part => isObject(part) && matches(row, part));
    if (key === "AND") return Array.isArray(condition) && condition.every(part => isObject(part) && matches(row, part));
    if (key === "eventId_memberId" || key === "blockerId_blockedId") return isObject(condition) && matches(row, condition);
    const value = row[key];
    if (!isObject(condition)) return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === "mode") return true;
      if (operator === "equals") return condition.mode === "insensitive" ? String(value).toLowerCase() === String(expected).toLowerCase() : value === expected;
      if (operator === "in") return Array.isArray(expected) && expected.includes(value);
      if (operator === "not") return value !== expected;
      const left = value instanceof Date ? +value : value;
      const right = expected instanceof Date ? +expected : expected;
      if (typeof left !== "number" || typeof right !== "number") throw new Error(`Unsupported fake comparison ${operator}`);
      if (operator === "gt") return left > right;
      if (operator === "gte") return left >= right;
      if (operator === "lte") return left <= right;
      throw new Error(`Unsupported fake operator ${operator}`);
    });
  });
}

/** Copy-on-write transaction fake. Not a substitute for PostgreSQL concurrency. */
export class TransactionFake {
  state: State;
  calls: { table: string; method: string; query: Query }[] = [];
  conflicts = 0;
  failCreateTable: string | undefined;
  forceZeroTable: string | undefined;
  constructor(state: State) { this.state = structuredClone(state); }
  private database(state: State, root: boolean): PrismaClient {
    const output: Record<string, unknown> = {};
    const read = (table: string, row: Row | undefined, query: Query) => {
      if (!row) return null;
      const result = structuredClone(row);
      if (query.include?.member) result.member = structuredClone(state.member?.find(member => member.id === row.memberId));
      if (query.include?.organization || (isObject(query.select?.organization))) result.organization = structuredClone(state.organization?.find(org => org.id === row.organizationId));
      return result;
    };
    const apply = (row: Row, data: Row = {}) => {
      for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = isObject(value) && typeof value.increment === "number" ? Number(row[key] ?? 0) + value.increment : isObject(value) && Array.isArray(value.set) ? structuredClone(value.set) : structuredClone(value);
    };
    for (const table of Object.keys(state)) {
      const capture = (method: string, query: Query) => { this.calls.push({ table, method, query: structuredClone(query) }); };
      const rows = (query: Query) => state[table].filter(row => matches(row, query.where));
      const create = (data: Row = {}) => {
        if (this.failCreateTable === table) throw new Error("INJECTED_WRITE_FAILURE");
        const row: Row = { id: `${table}-${state[table].length + 1}`, ...structuredClone(data) };
        if (table === "eventRegistration") { row.checkedInAt ??= null; row.checkedInById ??= null; }
        if (table === "accountDeletionCleanup") { row.createdAt ??= new Date("2020-01-01"); row.updatedAt ??= row.createdAt; row.attemptCount ??= 0; row.processingStartedAt ??= null; row.completedAt ??= null; }
        state[table].push(row); return row;
      };
      output[table] = {
        findFirst: async (query: Query) => { capture("findFirst", query); return read(table, rows(query)[0], query); },
        findUnique: async (query: Query) => { capture("findUnique", query); return read(table, rows(query)[0], query); },
        findMany: async (query: Query = {}) => { capture("findMany", query); return rows(query).slice(0, query.take).map(row => read(table, row, query)); },
        count: async (query: Query) => { capture("count", query); return rows(query).length; },
        create: async (query: Query) => { capture("create", query); return structuredClone(create(query.data)); },
        update: async (query: Query) => { capture("update", query); const row = rows(query)[0]; if (!row) throw new Error("FAKE_NOT_FOUND"); apply(row, query.data); return structuredClone(row); },
        updateMany: async (query: Query) => { capture("updateMany", query); if (this.forceZeroTable === table) return { count: 0 }; const changed = rows(query); changed.forEach(row => apply(row, query.data)); return { count: changed.length }; },
        delete: async (query: Query) => { capture("delete", query); const row = rows(query)[0]; state[table] = state[table].filter(candidate => candidate !== row); return structuredClone(row); },
        deleteMany: async (query: Query) => { capture("deleteMany", query); const found = rows(query); state[table] = state[table].filter(row => !found.includes(row)); return { count: found.length }; },
        upsert: async (query: Query) => { capture("upsert", query); let row = rows(query)[0]; if (!row) row = create(query.create); else apply(row, query.update); return structuredClone(row); },
      };
    }
    if (root) output.$transaction = async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Row) => {
      this.calls.push({ table: "$transaction", method: "run", query: { data: options } });
      if (this.conflicts-- > 0) throw Object.assign(new Error("SERIALIZABLE_CONFLICT"), { code: "P2034" });
      const draft = structuredClone(this.state);
      const result = await callback(this.database(draft, false) as unknown as Prisma.TransactionClient);
      this.state = draft; return result;
    };
    return output as unknown as PrismaClient;
  }
  get prisma(): PrismaClient { return this.database(this.state, true); }
}
