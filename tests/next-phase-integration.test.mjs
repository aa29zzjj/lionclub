import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

const endpoint = "/api/next-phase";
const testJpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 217]).toString("base64");

test("meetup reservations and discussion stay within the eligible club; private cards opt into matching", async t => {
  const sim = await createSimulation({ environment: { NEXT_PUBLIC_NEXT_PHASE_ENABLED: "true" } });
  t.after(() => sim.close());
  const { chair, member, friend, other, password } = await seedScenario(sim, "phase");
  const terms = { termsVersion: sim.load("src/lib/terms.ts").TERMS_VERSION, termsAcceptedAt: new Date(), organizationAssignmentStatus: "ASSIGNED" };
  await sim.prisma.member.updateMany({ where: { id: { in: [chair.id, member.id, friend.id] } }, data: terms });

  async function browser(actor) {
    const jar = sim.jar();
    const result = await sim.call("/api/auth/login", "POST", { email: actor.email, password }, jar);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const options = { headers: { "x-lionclubs-member": actor.id } };
    return {
      read: (view, path = endpoint) => sim.call(`${path}?${view}`, "GET", undefined, jar, options),
      write: (body, path = endpoint) => sim.call(path, "POST", body, jar, options),
    };
  }
  const host = await browser(chair);
  const guest = await browser(member);
  const outsider = await browser(friend);
  const draft = { action: "meetup.create", requestId: randomUUID(), title: "好樂迪唱歌", category: "唱歌", location: "大廳集合", description: "請準時到場", startsAt: new Date(Date.now() + 86400000).toISOString(), capacity: 2 };
  const created = await host.write(draft);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal((await host.write(draft)).data.id, id);
  const view = `view=meetup&id=${id}`;
  assert.equal((await guest.read(view)).data.canReadChat, false);
  assert.equal((await guest.write({ action: "meetup.message", id, body: "不能先發言", requestId: randomUUID() })).status, 403);
  assert.equal((await guest.write({ action: "meetup.join", id })).status, 200);
  assert.equal((await guest.write({ action: "meetup.join", id })).status, 200);
  assert.equal((await outsider.write({ action: "meetup.join", id })).status, 409);
  await sim.prisma.member.update({ where: { id: friend.id }, data: { organizationId: other.id } });
  assert.equal((await outsider.read(view)).status, 404);
  assert.equal((await outsider.write({ action: "meetup.join", id })).status, 404);

  const notices = sim.load("src/lib/phase-notices.ts");
  const scheduled = await sim.prisma.phaseNotice.findFirstOrThrow({ where: { meetupId: id, kind: "MEETUP_REMINDER" } });
  assert.equal(scheduled.recipientId, member.id);
  const rescheduledAt = new Date(Date.now() + 3 * 86_400_000);
  const update = { action: "meetup.update", id, revision: 1, startsAt: rescheduledAt.toISOString(), location: "二樓包廂" };
  assert.equal((await guest.write(update)).status, 403);
  assert.equal((await host.write(update)).status, 200);
  assert.equal((await host.write(update)).data.changed, false);
  assert.equal((await host.write({ ...update, location: "錯誤的舊版本" })).status, 409);
  const changed = (await guest.read("view=notices")).data.items;
  assert.deepEqual(changed.map(item => [item.title, item.targetId]), [["揪團時間或地點已更新", id]]);
  assert.match(changed[0].message, /二樓包廂/);
  assert.deepEqual((await outsider.read("view=notices")).data.items, []);
  await outsider.write({ action: "notice.read", id: changed[0].id });
  assert.equal((await guest.read("view=notices")).data.items[0].readAt, null);
  await guest.write({ action: "notice.read", id: changed[0].id });
  assert.ok((await guest.read("view=notices")).data.items[0].readAt);
  const due = new Date(rescheduledAt.getTime() - 86_400_000);
  assert.equal((await notices.readPhaseNotices(sim.prisma, member.id, new Date(+due - 1))).items.length, 1);
  assert.equal((await notices.readPhaseNotices(sim.prisma, member.id, due)).items[0].title, "揪團行前提醒");

  const message = { action: "meetup.message", id, requestId: randomUUID(), body: "我會提前到場" };
  assert.equal((await guest.write(message)).status, 200);
  assert.equal((await guest.write(message)).status, 200);
  assert.deepEqual((await host.read(view)).data.messages.map(value => value.body), [message.body]);
  assert.equal((await guest.write({ action: "meetup.leave", id })).status, 200);
  assert.deepEqual((await guest.read(view)).data.messages, []);
  assert.deepEqual((await guest.read("view=notices")).data.items, []);
  assert.equal((await guest.write({ action: "meetup.join", id })).status, 200);
  assert.equal((await host.write({ action: "meetup.cancel", id })).status, 200);
  assert.deepEqual((await guest.read("view=notices")).data.items.map(item => item.title), ["揪團已取消"]);
  assert.equal(await sim.prisma.phaseNotice.count({ where: { meetupId: id, kind: "MEETUP_REMINDER" } }), 0);
  assert.equal((await guest.write({ action: "meetup.join", id })).status, 409);

  const mobileLogin = await sim.call("/api/mobile/auth/login", "POST", { email: member.email, password });
  assert.equal(mobileLogin.status, 200, JSON.stringify(mobileLogin.data));
  const mobile = (method, data, id = member.id) => sim.call(`/api/mobile/next-phase${method === "GET" ? "?view=card" : ""}`, method, data, sim.jar(), {
    headers: { Authorization: `Bearer ${mobileLogin.data.accessToken}`, "x-lionclubs-member": id },
  });
  const card = { action: "card.save", image: testJpeg, tags: ["保險"], shareTags: false };
  assert.equal((await mobile("POST", card)).status, 200);
  assert.equal((await mobile("GET", undefined, chair.id)).status, 409);
  assert.equal((await guest.read("view=card")).data.card.image, testJpeg);
  assert.equal((await host.read("view=card")).data.card, null);
  const resource = await sim.prisma.resourceNeed.create({ data: {
    requestId: randomUUID(), ownerId: chair.id, organizationId: chair.organizationId, kind: "NEED", title: "公益講座準備",
    description: "需要熟悉產險的獅友", category: "其他", targetDate: new Date(), quantity: 1, quantityUnit: "位",
  } });
  const getNeed = async () => {
    const result = await outsider.read("view=hub", "/api/services");
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data.needs[0];
  };
  assert.equal((await getNeed()).suggestedMembers, undefined);
  assert.equal((await mobile("POST", { action: "card.save", tags: ["保險"], shareTags: true })).status, 200);
  const suggestions = (await getNeed()).suggestedMembers;
  assert.deepEqual(suggestions.map(({ id, matchingTags }) => ({ id, matchingTags })), [{ id: member.id, matchingTags: ["保險"] }]);
  assert.equal(JSON.stringify(suggestions).includes(testJpeg), false);
  const invite = { action: "need.invite", id: resource.id, memberId: member.id, message: "可否協助看一下保障範圍？" };
  assert.equal((await outsider.write(invite, "/api/services")).status, 403);
  assert.equal((await host.write({ ...invite, memberId: friend.id }, "/api/services")).status, 404);
  const sent = await host.write(invite, "/api/services");
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal((await host.write(invite, "/api/services")).data.id, sent.data.id);
  const push = sim.load("src/lib/mobile-push.ts");
  const queue = sim.load("src/lib/phase-push.ts").queueDuePhasePushes;
  const delivery = sim.load("src/lib/mobile-push-delivery.ts").processMobilePushBatch;
  const settings = sim.load("src/lib/mobile-push-config.ts").mobilePushSettings({
    MOBILE_PUSH_ENABLED: "true", APNS_ENVIRONMENT: "sandbox", APNS_TOPIC: "com.lionclubsmembership.app", PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32),
  });
  await push.registerMobilePushDevice(sim.prisma, { userId: member.user.id, memberId: member.id, sessionVersion: member.user.sessionVersion }, {
    installationId: randomUUID(), revision: 1, token: "ab".repeat(32), authorization: "granted",
  }, settings);
  assert.equal(await queue(sim.prisma, settings), 2);
  assert.equal(await queue(sim.prisma, settings), 0);
  const sentPayloads = [];
  await delivery(sim.prisma, async request => {
    sentPayloads.push(JSON.parse(JSON.stringify(request.payload)));
    return { kind: "accepted" };
  }, settings);
  assert.equal(sentPayloads.length, 2);
  assert.ok(sentPayloads.every(payload => payload.data.kind === "next_phase" && !JSON.stringify(payload).includes("保障範圍")));
  const invitation = (await guest.read("view=notices")).data.items.find(item => item.target === "need");
  assert.equal(invitation.targetId, resource.id);
  assert.match(invitation.message, /保障範圍/);
  assert.equal(await notices.authorizedPhasePush(sim.prisma, sent.data.id, chair.id, member.id, new Date()), true);
  assert.ok(!(await outsider.read("view=notices")).data.items.some(item => item.target === "need"));
  const focused = await guest.read(`view=hub&needId=${resource.id}`, "/api/services");
  assert.deepEqual(focused.data.needs.map(need => need.id), [resource.id]);
  assert.equal((await guest.write({ action: "need.respond", id: resource.id, message: "可以協助。" }, "/api/services")).status, 200);
  assert.equal(await notices.authorizedPhasePush(sim.prisma, sent.data.id, chair.id, member.id, new Date()), false);
  assert.equal((await host.read("view=hub", "/api/services")).data.needs[0].suggestedMembers[0].inviteStatus, "responded");
  await sim.prisma.memberBlock.create({ data: { blockerId: member.id, blockedId: friend.id } });
  assert.equal((await getNeed()).suggestedMembers, undefined);
  assert.equal((await mobile("POST", { action: "card.delete" })).status, 200);
  assert.equal((await guest.read("view=card")).data.card, null);
});
