// v2 fixtures; all data synthetic. Only the district public read endpoint may leave localhost.
import { createSimulationPreview } from './simulation-preview.mjs';
const fetcher = async (input, options) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://www.300a1.org.tw' || url.pathname !== '/activity/getcalendarevents') throw Error('Non-allowlisted UAT request');
  return fetch(url, options);
};
const app = await createSimulationPreview({ port: 3196, frontendPort: 3195, fetcher });
const { prisma, load } = app.sim;
await prisma.member.updateMany({ data: { termsAcceptedAt: new Date(), termsVersion: load('src/lib/terms.ts').TERMS_VERSION } });
await prisma.friendship.deleteMany({});
await prisma.friendship.create({ data: { requesterId: 'chair-default', addresseeId: 'member-default' } });
await prisma.friendship.create({ data: { requesterId: 'friend-default', addresseeId: 'member-default' } });
await prisma.event.createMany({ data: [
  { id: 'v2-past', title: '合成-過往公益服務', location: '合成場地', startAt: new Date('2025-01-01T04:00:00Z'), hostOrganizationId: 'ai-default', createdById: 'member-default', category: 'PERSONAL' },
  { id: 'v2-future', title: '合成-未來公益服務', location: '合成場地', startAt: new Date('2027-02-01T04:00:00Z'), hostOrganizationId: 'ai-default', createdById: 'member-default', category: 'PERSONAL' },
  { id: 'v2-business', title: '合成-工商交流', location: '合成場地', startAt: new Date('2027-02-02T04:00:00Z'), hostOrganizationId: 'ai-default', createdById: 'member-default', category: 'PERSONAL' },
] });
await prisma.$transaction(async tx => {
  const { writeEventTags } = load('src/lib/event-tags.ts');
  await writeEventTags(tx, 'v2-past', ['SERVICE']);
  await writeEventTags(tx, 'v2-future', ['SERVICE', 'LEARNING']);
  await writeEventTags(tx, 'v2-business', ['BUSINESS']);
});
app.server.listen(3196, '127.0.0.1', () => console.log('UAT fixes preview: http://localhost:3196/__simulation'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
