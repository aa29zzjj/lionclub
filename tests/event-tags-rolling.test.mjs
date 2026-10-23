import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createSimulation, seedScenario, ROOT } from './helpers/simulation.mjs';

test('rolling tags: old DB stays usable, tagged mutations fail atomically, additive migration enables tags without restart', async () => {
  const sim = await createSimulation();
  const ok = (r, expected = 200) => { assert.equal(r.status, expected, JSON.stringify(r.data)); return r.data; };
  try {
    // Disposable PGlite only. Never load an ambient DB URL or operator credentials.
    await sim.database.exec('ALTER TABLE "Event" DROP COLUMN "tags"');
    const s = await seedScenario(sim, 'rolling-tags');
    const jar = sim.jar();
    ok(await sim.call('/api/auth/login', 'POST', { email: s.member.email, password: s.password }, jar));
    ok(await sim.call('/api/me/terms-consent', 'POST', { accept: true }, jar));
    const input = { title: 'rolling synthetic event', location: 'synthetic', startAt: '2027-02-01T04:00:00.000Z', category: 'PERSONAL' };
    const list = ok(await sim.call('/api/events', 'GET', undefined, jar));
    assert.equal(list.tagsAvailable, false); assert.deepEqual(list.events[0].tags, []);
    const created = ok(await sim.call('/api/events', 'POST', input, jar));
    const before = await sim.prisma.event.count();
    const failed = ok(await sim.call('/api/events', 'POST', { ...input, tags: ['SERVICE'] }, jar), 503);
    assert.equal(failed.code, 'EVENT_TAGS_UNAVAILABLE');
    assert.equal(await sim.prisma.event.count(), before, 'tagged create must roll back, not silently lose tags');
    const path = `/api/events/${created.eventId}`;
    assert.equal(ok(await sim.call(path, 'GET', undefined, jar)).tagsAvailable, false);
    ok(await sim.call(path, 'PATCH', { ...input, title: 'must roll back', tags: ['SPORT'] }, jar), 503);
    assert.equal((await sim.prisma.event.findUnique({ where: { id: created.eventId } })).title, input.title);
    ok(await sim.call(path, 'PATCH', { ...input, title: 'legacy edit works', tags: [] }, jar));
    ok(await sim.call(`${path}/register`, 'POST', {}, jar));
    ok(await sim.call('/api/notifications', 'GET', undefined, jar));
    await sim.database.exec(readFileSync(`${ROOT}/prisma/migrations/20261023110000_event_tags/migration.sql`, 'utf8'));
    assert.equal(ok(await sim.call(path, 'GET', undefined, jar)).tagsAvailable, true);
    ok(await sim.call(path, 'PATCH', { ...input, tags: ['SERVICE'] }, jar));
    assert.deepEqual(ok(await sim.call(path, 'GET', undefined, jar)).event.tags, ['SERVICE']);
    ok(await sim.call('/api/events', 'POST', { ...input, tags: ['LEARNING'] }, jar));
    assert.ok(ok(await sim.call('/api/events', 'GET', undefined, jar)).events.some(e => e.tags.includes('LEARNING')));
  } finally { await sim.close(); }
});
