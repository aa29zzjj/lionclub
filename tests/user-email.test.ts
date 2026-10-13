import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { findUserByEmail } from "../src/lib/user-email";

// Exercise the real legacy-email helper without creating a DB client/connection.
// node --import tsx --test tests/user-email.test.ts
type User = { id: string; email: string; member: { id: string } | null };
type Query = {
  where: { email: string | { equals: string; mode: string } };
  include: { member: boolean };
  take?: number;
};

function fakeUsers(users: User[]) {
  const calls: { method: "findUnique" | "findMany"; query: Query }[] = [];
  const database = {
    user: {
      findUnique: async (query: Query) => {
        calls.push({ method: "findUnique", query: structuredClone(query) });
        assert.equal(typeof query.where.email, "string", "first lookup must preserve exact legacy casing");
        return structuredClone(users.find((user) => user.email === query.where.email) ?? null);
      },
      findMany: async (query: Query) => {
        calls.push({ method: "findMany", query: structuredClone(query) });
        const email = query.where.email;
        assert.equal(typeof email, "object");
        if (typeof email === "string") throw new Error("Fallback must use a case-insensitive query");
        assert.equal(email.mode, "insensitive");
        return structuredClone(users.filter((user) => user.email.toLowerCase() === email.equals.toLowerCase()).slice(0, query.take));
      },
    },
  };
  return { database: database as unknown as Pick<PrismaClient, "user">, calls };
}

test("trimmed exact legacy Hao@Lion.com lookup takes priority and includes member", async () => {
  const exact = { id: "legacy-hao", email: "Hao@Lion.com", member: { id: "hao-member" } };
  const fake = fakeUsers([exact]);
  assert.deepEqual(await findUserByEmail(fake.database, "  Hao@Lion.com \n"), exact);
  assert.deepEqual(fake.calls, [{ method: "findUnique", query: { where: { email: "Hao@Lion.com" }, include: { member: true } } }]);
});

test("exact mixed-case account wins even if a second case-insensitive account exists", async () => {
  const fake = fakeUsers([
    { id: "legacy", email: "Hao@Lion.com", member: { id: "legacy-member" } },
    { id: "lower", email: "hao@lion.com", member: { id: "lower-member" } },
  ]);
  assert.equal((await findUserByEmail(fake.database, "Hao@Lion.com"))?.id, "legacy");
  assert.equal(fake.calls.length, 1, "must not redirect an exact legacy login to another account");
});

test("original mixed-case login falls back to one new normalized lowercase account", async () => {
  const fake = fakeUsers([{ id: "new-lowercase", email: "hao@lion.com", member: { id: "member" } }]);
  assert.equal((await findUserByEmail(fake.database, "  Hao@Lion.com  "))?.id, "new-lowercase");
  assert.deepEqual(fake.calls, [
    { method: "findUnique", query: { where: { email: "Hao@Lion.com" }, include: { member: true } } },
    { method: "findMany", query: { where: { email: { equals: "Hao@Lion.com", mode: "insensitive" } }, include: { member: true }, take: 2 } },
  ]);
});

test("a single differently cased legacy match works without requiring a linked member", async () => {
  const fake = fakeUsers([{ id: "legacy", email: "Tom@Lion.com", member: null }]);
  assert.equal((await findUserByEmail(fake.database, "TOM@LION.COM"))?.id, "legacy");
  assert.equal(fake.calls.length, 2);
});

test("ambiguous case-insensitive matches fail closed instead of choosing the first account", async () => {
  const fake = fakeUsers([
    { id: "legacy", email: "Hao@Lion.com", member: { id: "a" } },
    { id: "lowercase", email: "hao@lion.com", member: { id: "b" } },
    { id: "third", email: "HAO@LION.COM", member: { id: "c" } },
  ]);
  assert.equal(await findUserByEmail(fake.database, "hAo@LiOn.CoM"), null);
  assert.equal(fake.calls[1].query.take, 2, "two matches suffice to detect ambiguity");
});

test("no exact or insensitive match returns null", async () => {
  const fake = fakeUsers([{ id: "other", email: "other@example.test", member: null }]);
  assert.equal(await findUserByEmail(fake.database, " missing@example.test "), null);
  assert.equal(fake.calls.length, 2);
});
