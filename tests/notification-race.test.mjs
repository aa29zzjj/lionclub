import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

async function login(sim, person, password) {
  const jar = sim.jar();
  const result = await sim.call("/api/auth/login", "POST", { email: person.email, password }, jar);
  assert.equal(result.status, 200);
  return jar;
}

// Controlled boundaries on a single-connection SQL simulation, not a claim of
// production PostgreSQL multi-connection concurrency or real mail delivery.
test("notification/deletion race regression uses real routes and isolated SQL", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    await t.test("a deletion committed after request authentication but before the send transaction rejects the stale sender", async () => {
      const s = await seedScenario(sim, "notice-deletion");
      const sending = await login(sim, s.member, s.password);
      const deleting = await login(sim, s.member, s.password);
      const original = sim.prisma.$transaction.bind(sim.prisma);
      let injected = false;
      sim.prisma.$transaction = async (callback, options) => {
        assert.equal(options.isolationLevel, "Serializable");
        // No SQL transaction is open yet: deleting inside a callback would
        // deadlock this intentionally single-connection test database.
        if (!injected) {
          injected = true;
          sim.prisma.$transaction = original;
          const result = await sim.call("/api/me/account-deletion", "POST", { password: s.password }, deleting);
          assert.equal(result.status, 200);
        }
        return original(callback, options);
      };
      try {
        const result = await sim.call("/api/notifications", "POST", {
          eventId: s.event.id, memberIds: [s.friend.id], message: "合成個資，不可在刪帳後寫回",
        }, sending);
        assert.equal(injected, true);
        assert.equal(result.status, 409);
        assert.equal(await sim.prisma.eventNotification.count({ where: { senderId: s.member.id } }), 0);
        assert.ok((await sim.prisma.member.findUnique({ where: { id: s.member.id } })).deletedAt);
      } finally { sim.prisma.$transaction = original; }
    });

    await t.test("sender/event/friend/block/recipient guards and message creation use the same serializable transaction", async () => {
      const s = await seedScenario(sim, "notice-boundary");
      const jar = await login(sim, s.member, s.password);
      const original = sim.prisma.$transaction.bind(sim.prisma);
      const observed = new Set();
      const observe = (model, property, run) => new Proxy(model, { get(target, key) {
        const value = target[key];
        if (key === property) return run(value.bind(target));
        return typeof value === "function" ? value.bind(target) : value;
      } });
      sim.prisma.$transaction = async (callback, options) => {
        assert.equal(options.isolationLevel, "Serializable");
        return original(tx => callback(new Proxy(tx, { get(target, key) {
          if (key === "member") return new Proxy(target.member, { get(model, method) {
            const value = model[method];
            if (method === "findFirst") return async args => {
              assert.deepEqual(structuredClone(args.where), { id: s.member.id, status: "ACTIVE", deletedAt: null });
              observed.add("sender"); return value.call(model, args);
            };
            if (method === "findMany") return async args => {
              assert.equal(args.where.status, "ACTIVE"); assert.equal(args.where.deletedAt, null);
              observed.add("recipients"); return value.call(model, args);
            };
            return typeof value === "function" ? value.bind(model) : value;
          } });
          if (key === "event") return observe(target.event, "findUnique", run => async args => { observed.add("event"); return run(args); });
          if (key === "friendship") return observe(target.friendship, "findMany", run => async args => { observed.add("friends"); return run(args); });
          if (key === "memberBlock") return observe(target.memberBlock, "findMany", run => async args => { observed.add("blocks"); return run(args); });
          if (key === "eventNotification") return observe(target.eventNotification, "create", run => async args => {
            assert.deepEqual([...observed].sort(), ["blocks", "event", "friends", "recipients", "sender"]);
            observed.add("create"); return run(args);
          });
          return target[key];
        } })), options);
      };
      try {
        const result = await sim.call("/api/notifications", "POST", { eventId: s.event.id, memberIds: [s.friend.id], message: "合成有效通知" }, jar);
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.ok(observed.has("create"));
        assert.equal(await sim.prisma.eventNotification.count({ where: { senderId: s.member.id } }), 1);
      } finally { sim.prisma.$transaction = original; }
    });

    await t.test("serialization and deleted-reference conflicts return 409 with no notification written", async () => {
      const s = await seedScenario(sim, "notice-conflict");
      const jar = await login(sim, s.member, s.password);
      const original = sim.prisma.$transaction.bind(sim.prisma);
      try {
        for (const code of ["P2034", "P2003"]) {
          sim.prisma.$transaction = async () => { throw Object.assign(new Error("controlled synthetic SQL conflict"), { code }); };
          const result = await sim.call("/api/notifications", "POST", { eventId: s.event.id, memberIds: [s.friend.id] }, jar);
          assert.equal(result.status, 409, code);
        }
        assert.equal(await sim.prisma.eventNotification.count({ where: { senderId: s.member.id } }), 0);
      } finally { sim.prisma.$transaction = original; }
    });
  } finally { await sim.close(); }
});
