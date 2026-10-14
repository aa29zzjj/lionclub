import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createSimulation, seedScenario, ROOT } from "./helpers/simulation.mjs";

const hash = token => crypto.createHash("sha256").update(token).digest("hex");
const check = (result, expected) => { assert.equal(result.status, expected, JSON.stringify(result.data)); return result.data; };
const mailToken = mail => new URL(mail.text.match(/https:\/\/simulation\.example\.test\/\S+/)[0]).searchParams.get("token");

test("explicit migration transaction rolls back every earlier step on a mid-script SQL failure", { timeout: 180000 }, async () => {
  let inspectedRollback = false;
  const sim = await createSimulation({ beforeFinalMigration: async db => {
    await db.exec(`
      INSERT INTO "Organization" (id,level,name,"updatedAt") VALUES ('rollback-club','club','synthetic',now());
      INSERT INTO "Member" (id,name,"organizationId","updatedAt") VALUES ('rollback-member','synthetic','rollback-club',now());
      INSERT INTO "User" (id,email,"passwordHash","memberId") VALUES ('rollback-user','rollback@example.test','synthetic-hash','rollback-member');
      INSERT INTO "EmailVerificationToken" (id,"userId","tokenHash","expiresAt") VALUES ('rollback-token','rollback-user','synthetic-rollback-hash','2100-01-01');
    `);
    const migration = readFileSync(join(ROOT, "prisma/migrations/20261014090000_acceptance_security_and_history/migration.sql"), "utf8");
    assert.match(migration, /BEGIN;/);
    assert.match(migration, /SET LOCAL lock_timeout = '10s';/);
    assert.match(migration, /SET LOCAL statement_timeout = '120s';/);
    assert.match(migration, /COMMIT;/);
    const broken = migration.replace('CREATE TABLE "EventCheckInAudit"', 'SELECT * FROM "__simulation_intentional_migration_failure__";\nCREATE TABLE "EventCheckInAudit"');
    assert.notEqual(broken, migration);
    await assert.rejects(db.exec(broken));
    // PostgreSQL leaves an explicit failed transaction aborted until rollback.
    await db.exec("ROLLBACK;");
    const columns = await db.query(`SELECT count(*)::integer AS count FROM information_schema.columns
      WHERE table_schema='public' AND ((table_name='User' AND column_name='sessionVersion')
        OR (table_name='Member' AND column_name='deletedAt')
        OR (table_name IN ('EmailVerificationToken','PasswordResetToken') AND column_name='email'))`);
    assert.equal(columns.rows[0].count, 0);
    assert.equal((await db.query(`SELECT to_regclass('"AccountDeletionCleanup"') AS relation`)).rows[0].relation, null);
    assert.equal((await db.query(`SELECT "usedAt" FROM "EmailVerificationToken" WHERE id='rollback-token'`)).rows[0].usedAt, null);
    const foreignKeys = await db.query(`SELECT confdeltype FROM pg_constraint WHERE conname IN ('Event_createdById_fkey','EventNotification_senderId_fkey')`);
    assert.equal(foreignKeys.rows.length, 2);
    assert.ok(foreignKeys.rows.every(row => row.confdeltype === "c"));
    inspectedRollback = true;
    // createSimulation now applies the original unmodified migration normally.
  } });
  try {
    assert.equal(inspectedRollback, true);
    assert.equal((await sim.prisma.user.findUnique({ where: { id: "rollback-user" } })).sessionVersion, 1);
    assert.ok((await sim.prisma.emailVerificationToken.findUnique({ where: { id: "rollback-token" } })).usedAt);
  } finally { await sim.close(); }
});

// All migrations execute as real SQL against an isolated in-memory PGlite DB.
// Real route handlers/Prisma are used; cookies and SES are test adapters. This
// never reads an ambient DB URL, sends email or substitutes for RDS lock testing.
test("rolling token migration keeps old writers working but new consumers fail closed", { timeout: 180000 }, async t => {
  const oldVerify = "pre-migration-verification-token-synthetic";
  const oldReset = "pre-migration-reset-token-synthetic";
  const sim = await createSimulation({ beforeFinalMigration: async db => {
    await db.exec(`
      INSERT INTO "Organization" (id,level,name,"updatedAt") VALUES ('rolling-club','club','synthetic',now());
      INSERT INTO "Member" (id,name,email,status,"organizationId","updatedAt") VALUES ('rolling-member','synthetic',' Legacy@Example.Test ','ACTIVE','rolling-club',now());
      INSERT INTO "User" (id,email,"passwordHash","memberId") VALUES ('rolling-user',' Legacy@Example.Test ','synthetic-hash','rolling-member');
      INSERT INTO "EmailVerificationToken" (id,"userId","tokenHash","expiresAt") VALUES ('rolling-old-verify','rolling-user','${hash(oldVerify)}','2100-01-01');
      INSERT INTO "PasswordResetToken" (id,"userId","tokenHash","expiresAt") VALUES ('rolling-old-reset','rolling-user','${hash(oldReset)}','2100-01-01');
      INSERT INTO "EmailVerificationToken" (id,"userId","tokenHash","expiresAt","usedAt") VALUES ('rolling-used-verify','rolling-user','synthetic-used-verify','2100-01-01','2020-01-02');
      INSERT INTO "PasswordResetToken" (id,"userId","tokenHash","expiresAt","usedAt") VALUES ('rolling-used-reset','rolling-user','synthetic-used-reset','2100-01-01','2020-01-02');
    `);
  } });
  try {
    await t.test("pre-migration tokens are bound, invalidated, and already-used timestamps retained", async () => {
      for (const model of [sim.prisma.emailVerificationToken, sim.prisma.passwordResetToken]) {
        const rows = await model.findMany({ where: { userId: "rolling-user" } });
        assert.equal(rows.length, 2);
        for (const row of rows) { assert.equal(row.email, "legacy@example.test"); assert.ok(row.usedAt); }
        assert.equal(rows.find(row => row.id.includes("used")).usedAt.toISOString(), "2020-01-02T00:00:00.000Z");
      }
      check(await sim.call("/api/auth/verify-email", "POST", { token: oldVerify }), 400);
      check(await sim.call("/api/auth/reset-password", "POST", { token: oldReset, password: "SyntheticReset42!" }), 400);
      assert.equal((await sim.prisma.user.findUnique({ where: { id: "rolling-user" } })).passwordHash, "synthetic-hash");
      assert.equal(await sim.prisma.member.count(), 1);
    });
    const s = await seedScenario(sim, "rolling");
    await t.test("legacy SQL inserts omit email successfully, empty-default tokens cannot verify or reset", async () => {
      const verify = "legacy-writer-verification-token-synthetic";
      const reset = "legacy-writer-reset-token-synthetic";
      const future = new Date("2100-01-01");
      // SQL intentionally omits email: no generated-client default can mask a
      // missing DATABASE default during a mixed-version deployment.
      await sim.prisma.$executeRaw`INSERT INTO "EmailVerificationToken" (id,"userId","tokenHash","expiresAt") VALUES ('rolling-legacy-writer-verify',${s.member.user.id},${hash(verify)},${future})`;
      await sim.prisma.$executeRaw`INSERT INTO "PasswordResetToken" (id,"userId","tokenHash","expiresAt") VALUES ('rolling-legacy-writer-reset',${s.member.user.id},${hash(reset)},${future})`;
      const before = await sim.prisma.user.findUnique({ where: { id: s.member.user.id } });
      assert.equal((await sim.prisma.emailVerificationToken.findUnique({ where: { id: "rolling-legacy-writer-verify" } })).email, "");
      assert.equal((await sim.prisma.passwordResetToken.findUnique({ where: { id: "rolling-legacy-writer-reset" } })).email, "");
      check(await sim.call("/api/auth/verify-email", "POST", { token: verify }), 400);
      check(await sim.call("/api/auth/reset-password", "POST", { token: reset, password: "SyntheticReset42!" }), 400);
      const after = await sim.prisma.user.findUnique({ where: { id: s.member.user.id } });
      assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.sessionVersion, before.sessionVersion);
      assert.equal((await sim.prisma.member.findUnique({ where: { id: s.member.id } })).emailVerifiedAt, null);
      for (const model of [sim.prisma.emailVerificationToken, sim.prisma.passwordResetToken]) {
        const row = await model.findFirst({ where: { userId: s.member.user.id } });
        assert.equal(row.usedAt, null);
      }
    });
    await t.test("new nonempty-bound verification and reset tokens still succeed once", async () => {
      const jar = sim.jar();
      check(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }, jar), 200);
      check(await sim.call("/api/me/resend-verification", "POST", {}, jar), 200);
      const verify = mailToken(sim.inbox.at(-1));
      assert.equal((await sim.prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash(verify) } })).email, s.member.email);
      check(await sim.call("/api/auth/verify-email", "POST", { token: verify }), 200);
      check(await sim.call("/api/auth/verify-email", "POST", { token: verify }), 400);
      check(await sim.call("/api/auth/forgot-password", "POST", { email: s.member.email }), 200);
      const reset = mailToken(sim.inbox.at(-1));
      assert.equal((await sim.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash(reset) } })).email, s.member.email);
      check(await sim.call("/api/auth/reset-password", "POST", { token: reset, password: "SyntheticReset42!" }), 200);
      check(await sim.call("/api/auth/reset-password", "POST", { token: reset, password: "SyntheticReset42!" }), 400);
      check(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: "SyntheticReset42!" }, sim.jar()), 200);
    });
  } finally { await sim.close(); }
});
