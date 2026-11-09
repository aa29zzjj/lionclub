import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";
const require = createRequire(import.meta.url), { NextRequest } = require("next/server");

async function request(sim, person, method = "GET", body, options = {}) {
  const { signMobileAccessToken } = sim.load("src/lib/mobile-auth.ts");
  const token = options.token ?? (person ? await signMobileAccessToken({ userId: person.user.id, memberId: person.id,
    email: person.email, sessionVersion: person.user.sessionVersion }, new TextEncoder().encode(sim.env.AUTH_SECRET)) : null);
  const req = new NextRequest(`${sim.origin}/api/mobile/me/terms-consent`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...(body === undefined ? {} : { body: options.rawBody ?? JSON.stringify(body) }),
  });
  const result = await sim.load("src/app/api/mobile/me/terms-consent/route.ts")[method](req);
  return { status: result.status, data: await result.json(), headers: result.headers };
}
const expect = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.data)); return response.data; };

test("native terms require an explicit, exact-version Bearer consent scoped to the current actor", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "native-terms"), { TERMS_VERSION } = sim.load("src/lib/terms.ts");
    const body = { accept: true, termsVersion: TERMS_VERSION };
    const stored = id => sim.prisma.member.findUniqueOrThrow({ where: { id }, select: { termsVersion: true, termsAcceptedAt: true } });
    await t.test("missing or web-cookie-only auth cannot read or write native consent", async () => {
      for (const method of ["GET", "POST"]) expect(await request(sim, null, method, method === "POST" ? body : undefined), 401);
      const jar = sim.jar(); expect(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }, jar));
      const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
      expect(await request(sim, null, "POST", body, { headers: { Cookie: cookie } }), 401);
      assert.equal((await stored(s.member.id)).termsAcceptedAt, null);
    });
    await t.test("read is private/no-store and never creates consent", async () => {
      const response = await request(sim, s.member);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.deepEqual(expect(response), { termsVersion: TERMS_VERSION, accepted: false, termsAcceptedAt: null });
      assert.equal((await stored(s.member.id)).termsAcceptedAt, null);
    });
    await t.test("unchecked, omitted, malformed, stale and caller-selected-member payloads cannot consent", async () => {
      for (const invalid of [{}, { accept: false, termsVersion: TERMS_VERSION }, { accept: "true", termsVersion: TERMS_VERSION },
        { accept: true }, { ...body, memberId: s.friend.id }, null]) expect(await request(sim, s.member, "POST", invalid), 400);
      expect(await request(sim, s.member, "POST", body, { rawBody: "{" }), 400);
      const stale = expect(await request(sim, s.member, "POST", { accept: true, termsVersion: "2020-01-01" }), 409);
      assert.equal(stale.code, "TERMS_VERSION_MISMATCH");
      assert.equal((await stored(s.member.id)).termsAcceptedAt, null);
    });
    await t.test("old-version or timestamp-free stored state is not inherited as accepted", async () => {
      for (const value of [{ termsVersion: "2020-01-01", termsAcceptedAt: new Date("2020-01-01") }, { termsVersion: TERMS_VERSION, termsAcceptedAt: null }]) {
        await sim.prisma.member.update({ where: { id: s.member.id }, data: value });
        assert.deepEqual(expect(await request(sim, s.member)), { termsVersion: TERMS_VERSION, accepted: false, termsAcceptedAt: null });
      }
    });
    await t.test("explicit valid consent writes only this member and returns the persisted version/timestamp", async () => {
      const result = expect(await request(sim, s.member, "POST", body));
      assert.equal(result.ok, true); assert.equal(result.accepted, true); assert.equal(result.termsVersion, TERMS_VERSION);
      assert.equal(result.termsAcceptedAt, (await stored(s.member.id)).termsAcceptedAt.toISOString());
      assert.equal((await stored(s.friend.id)).termsAcceptedAt, null);
      assert.deepEqual(expect(await request(sim, s.member)), { termsVersion: TERMS_VERSION, accepted: true, termsAcceptedAt: result.termsAcceptedAt });
      assert.equal(expect(await request(sim, s.member, "POST", body)).termsAcceptedAt, result.termsAcceptedAt, "retries preserve the original current-version consent timestamp");
    });
    await t.test("consent unlocks the existing mobile posting gate without creating or automatically retrying an activity", async () => {
      const { signMobileAccessToken } = sim.load("src/lib/mobile-auth.ts");
      const token = await signMobileAccessToken({ userId: s.friend.user.id, memberId: s.friend.id, email: s.friend.email,
        sessionVersion: s.friend.user.sessionVersion }, new TextEncoder().encode(sim.env.AUTH_SECRET));
      const postEvent = () => sim.load("src/app/api/mobile/events/route.ts").POST(new NextRequest(`${sim.origin}/api/mobile/events`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "合成條款測試活動", startAt: "2027-01-01T01:00:00.000Z", location: "合成會址", category: "PERSONAL" }),
      }));
      const before = await sim.prisma.event.count();
      const refused = await postEvent(); assert.equal(refused.status, 403); assert.equal((await refused.json()).code, "TERMS_REQUIRED");
      expect(await request(sim, s.friend, "POST", body));
      assert.equal(await sim.prisma.event.count(), before, "consenting itself cannot publish");
      const created = await postEvent(); assert.equal(created.status, 200); assert.ok((await created.json()).eventId);
      assert.equal(await sim.prisma.event.count(), before + 1);
    });
    await t.test("revocation, deletion, reassignment and suspension after auth are rechecked inside the transaction", async () => {
      for (const mutation of [
        () => sim.prisma.user.update({ where: { id: s.chair.user.id }, data: { sessionVersion: { increment: 1 } } }),
        () => sim.prisma.member.update({ where: { id: s.chair.id }, data: { deletedAt: new Date() } }),
        () => sim.prisma.user.update({ where: { id: s.chair.user.id }, data: { memberId: null } }),
        () => sim.prisma.member.update({ where: { id: s.chair.id }, data: { status: "SUSPENDED" } }),
      ]) {
        const original = sim.prisma.$transaction;
        sim.prisma.$transaction = async (...args) => { await mutation(); return original.apply(sim.prisma, args); };
        try { expect(await request(sim, s.chair, "POST", body), 401); }
        finally { sim.prisma.$transaction = original; }
        assert.equal((await stored(s.chair.id)).termsAcceptedAt, null);
        await sim.prisma.user.update({ where: { id: s.chair.user.id }, data: { memberId: s.chair.id, sessionVersion: s.chair.user.sessionVersion } });
        await sim.prisma.member.update({ where: { id: s.chair.id }, data: { status: "ACTIVE", deletedAt: null } });
      }
    });
    await t.test("transaction failure cannot return a successful acknowledgement", async () => {
      const original = sim.prisma.$transaction;
      try {
        for (const error of [Object.assign(new Error("synthetic conflict"), { code: "P2034" }), new Error("synthetic database unavailable")]) {
          sim.prisma.$transaction = async () => { throw error; };
          expect(await request(sim, s.chair, "POST", body), error.code === "P2034" ? 409 : 503);
          expect(await request(sim, s.chair), error.code === "P2034" ? 409 : 503);
        }
      } finally { sim.prisma.$transaction = original; }
      assert.equal((await stored(s.chair.id)).termsAcceptedAt, null);
    });
  } finally { await sim.close(); }
});
