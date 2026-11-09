import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  EVENT_CAPACITY_MAX, EVENT_COVER_MAX_BYTES, EventDraftError, EventPublishCancelled, EventPublicationUnknown,
  createEventSubmissionLock, eventPublicationKey, isEventCameraCancellation, publishEventDraft,
  readEventCameraPhoto, readEventCards, readEventDraft, readEventPublishingOptions, validateEventCover,
  type EventCover, type EventDraft, type EventPublicationOption,
} from "../mobile-app/src/event-draft";

// Pure validation/injected transport tests. No native camera, Keychain, storage,
// real API, cloud object or account is read/written by this suite.
const options: EventPublicationOption[] = [
  { scope: "CLUB", hostOrganizationId: "synthetic-club", hostOrganizationName: "合成分會" },
  { scope: "ZONE", hostOrganizationId: "synthetic-zone", hostOrganizationName: "合成分區" },
  { scope: "REGION", hostOrganizationId: "synthetic-region", hostOrganizationName: "合成專區" },
  { scope: "DISTRICT", hostOrganizationId: "synthetic-district", hostOrganizationName: "合成區" },
];
const draft: EventDraft = { title: " 合成活動 ", date: "2028-02-29", time: "09:15", location: " 合成會場 ", capacity: "30", description: " 合成說明 ", category: "PERSONAL", publicationKey: "" };
const jpeg = () => new Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 0, 0, 0, 0, 0, 0])], { type: "image/jpeg" });
const cover = (): EventCover => ({ webPath: "blob:synthetic-cover", blob: jpeg(), contentType: "image/jpeg" });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function publicationHarness() {
  let current = true;
  const calls: string[] = [], bodies: unknown[] = [];
  return {
    calls, bodies, isCurrent: () => current, leave: () => { current = false; },
    api: {
      async createEventCoverUpload() { calls.push("presign"); return { uploadUrl: "https://synthetic.s3.us-east-2.amazonaws.com/events/member/photo.jpg?signature=synthetic", coverPhotoUrl: "https://images.example.invalid/events/member/photo.jpg" }; },
      async createEvent(body: unknown) { calls.push("create"); bodies.push(body); return { eventId: "synthetic-created-event" }; },
    },
    async upload() { calls.push("upload"); },
  };
}

test("official publication preserves the exact API-returned scope AND host pair for all four levels", () => {
  const read = readEventPublishingOptions({ allowedScopes: options.map(option => option.scope), officialHosts: options });
  assert.deepEqual(read, options);
  for (const option of read) {
    const body = readEventDraft({ ...draft, category: "CLUB_OFFICIAL", publicationKey: eventPublicationKey(option) }, read);
    assert.equal(body.scope, option.scope); assert.equal(body.hostOrganizationId, option.hostOrganizationId);
    assert.equal(body.category, "CLUB_OFFICIAL");
  }
  const sameHost = readEventPublishingOptions({ allowedScopes: ["CLUB", "DISTRICT"], officialHosts: [{ ...options[0], hostOrganizationId: "shared-host" }, { ...options[3], hostOrganizationId: "shared-host" }] });
  assert.notEqual(eventPublicationKey(sameHost[0]), eventPublicationKey(sameHost[1]));
});

test("a scope alone, a stale host, a fabricated pair or a member title cannot grant official publication", () => {
  for (const publicationKey of ["", "DISTRICT", "synthetic-district", JSON.stringify(["DISTRICT", "synthetic-club"]), JSON.stringify(["GLOBAL", "synthetic-club"])]) {
    assert.throws(() => readEventDraft({ ...draft, category: "CLUB_OFFICIAL", publicationKey }, options), /API 已授權/);
  }
  assert.throws(() => readEventDraft({ ...draft, category: "CLUB_OFFICIAL", publicationKey: eventPublicationKey(options[0]) }, []), /API 已授權/);
  const personal = readEventDraft({ ...draft, publicationKey: eventPublicationKey(options[3]) }, options);
  assert.equal(personal.scope, undefined); assert.equal(personal.hostOrganizationId, undefined);
});

test("publishing settings fail closed on missing/malformed/unknown scope data rather than inventing a CLUB default", () => {
  for (const body of [null, {}, { allowedScopes: "CLUB", officialHosts: [] }, { allowedScopes: [], officialHosts: {} },
    { allowedScopes: ["GLOBAL"], officialHosts: [] }, { allowedScopes: ["CLUB"], officialHosts: [options[3]] },
    { allowedScopes: ["CLUB"], officialHosts: [{ ...options[0], hostOrganizationId: " synthetic-club " }] },
    { allowedScopes: ["CLUB"], officialHosts: [{ ...options[0], hostOrganizationName: "" }] }]) {
    assert.throws(() => readEventPublishingOptions(body), EventDraftError);
  }
  assert.deepEqual(readEventPublishingOptions({ allowedScopes: [], officialHosts: [] }), []);
  assert.equal(readEventPublishingOptions({ allowedScopes: ["CLUB", "CLUB"], officialHosts: [options[0], options[0]] }).length, 1);
});

test("event calendar validation rejects nonexistent days and malformed time without normalizing into another day", () => {
  const valid = readEventDraft(draft, options);
  assert.equal(valid.startAt, "2028-02-29T01:15:00.000Z");
  assert.equal(valid.title, "合成活動"); assert.equal(valid.location, "合成會場"); assert.equal(valid.description, "合成說明");
  for (const patch of [{ date: "2026-02-29" }, { date: "2026-02-30" }, { date: "2026-04-31" }, { date: "2026-13-01" }, { date: "2026-00-01" },
    { date: "2026-1-01" }, { date: "2026-01-01T10:00Z" }, { date: "" }, { time: "" }, { time: "24:00" }, { time: "12:60" }, { time: "9:00" }]) {
    assert.throws(() => readEventDraft({ ...draft, ...patch }, options), /實際存在的日期與正確時間/);
  }
});

test("capacity must be a bounded decimal positive integer or blank; no scientific, fractional or overflowing values", () => {
  assert.equal(readEventDraft({ ...draft, capacity: "   " }, options).capacity, undefined);
  assert.equal(readEventDraft({ ...draft, capacity: " 0005 " }, options).capacity, 5);
  assert.equal(readEventDraft({ ...draft, capacity: String(EVENT_CAPACITY_MAX) }, options).capacity, EVENT_CAPACITY_MAX);
  for (const capacity of ["0", "-1", "1.5", "1.0", "1e3", "0x10", "Infinity", "NaN", String(EVENT_CAPACITY_MAX + 1), "9".repeat(100)]) {
    assert.throws(() => readEventDraft({ ...draft, capacity }, options), /名額須/);
  }
});

test("text limits and control-character checks run before presigning or sending an event", async () => {
  for (const patch of [{ title: " " }, { title: "長".repeat(161) }, { title: "活動\u0000" }, { location: "長".repeat(241) }, { location: "" }, { description: "長".repeat(3001) }, { description: "說明\u0000" }]) {
    const h = publicationHarness();
    await assert.rejects(publishEventDraft({ draft: { ...draft, ...patch }, options, cover: cover(), ...h }), EventDraftError);
    assert.deepEqual(h.calls, []);
  }
  assert.equal(readEventDraft({ ...draft, description: "第一行\n第二行" }, options).description, "第一行\n第二行");
});

test("invalid event list shapes are not rendered as a successful empty list", () => {
  const valid = { id: "synthetic-event", title: "合成活動", location: "合成地點", hostChapter: "合成分會", startAt: "2026-11-20T01:00:00.000Z", category: "PERSONAL", scope: "CLUB", registeredCount: 0, isRegistered: false, isFull: false };
  assert.equal(readEventCards([valid]).length, 1); assert.deepEqual(readEventCards([]), []);
  for (const value of [undefined, null, {}, [null], [valid, valid], [{ ...valid, startAt: "not-a-date" }], [{ ...valid, registeredCount: -1 }], [{ ...valid, isRegistered: "true" }]]) {
    assert.throws(() => readEventCards(value), /不能視為沒有活動/);
  }
});

test("cover validation rejects unsafe formats, empty/oversized bodies and mismatched image signatures before any request", async () => {
  for (const file of [{ type: "image/heic", size: 20 }, { type: "image/jpeg", size: 0 }, { type: "image/png", size: EVENT_COVER_MAX_BYTES + 1 }, { type: "image/png", size: 1.5 }]) assert.throws(() => validateEventCover(file));
  for (const blob of [new Blob(["not-jpeg"], { type: "image/jpeg" }), new Blob([new Uint8Array([255, 216, 255])], { type: "image/png" })]) {
    const h = publicationHarness();
    await assert.rejects(publishEventDraft({ draft, options, cover: { webPath: "blob:synthetic", blob, contentType: blob.type }, ...h }), /照片內容與格式/);
    assert.deepEqual(h.calls, []);
  }
  const h = publicationHarness();
  await assert.rejects(publishEventDraft({ draft, options, cover: { ...cover(), contentType: "image/png" }, ...h }), /照片格式已變更/);
  assert.deepEqual(h.calls, []);
});

test("a successful cover flow is presign then native upload then exact-pair create, with a confirmed event ID", async () => {
  const h = publicationHarness();
  assert.deepEqual(await publishEventDraft({ draft: { ...draft, category: "CLUB_OFFICIAL", publicationKey: eventPublicationKey(options[2]) }, options, cover: cover(), ...h }), { eventId: "synthetic-created-event" });
  assert.deepEqual(h.calls, ["presign", "upload", "create"]);
  assert.equal((h.bodies[0] as any).scope, "REGION"); assert.equal((h.bodies[0] as any).hostOrganizationId, "synthetic-region");
  assert.equal((h.bodies[0] as any).coverPhotoUrl, "https://images.example.invalid/events/member/photo.jpg");
});

for (const stage of ["presign", "upload", "create"] as const) test("leaving the screen or changing the captured account at " + stage + " prevents subsequent steps or success", async () => {
  const h = publicationHarness();
  if (stage === "presign") {
    const original = h.api.createEventCoverUpload;
    h.api.createEventCoverUpload = async () => { const result = await original(); h.leave(); return result; };
  } else if (stage === "upload") h.upload = async () => { h.calls.push("upload"); h.leave(); };
  else h.api.createEvent = async () => { h.calls.push("create"); h.leave(); return { eventId: "synthetic-created-event" }; };
  await assert.rejects(publishEventDraft({ draft, options, cover: cover(), ...h }), EventPublishCancelled);
  assert.deepEqual(h.calls, stage === "presign" ? ["presign"] : stage === "upload" ? ["presign", "upload"] : ["presign", "upload", "create"]);
});

test("a synchronous submit lock blocks same-turn duplicate taps until success or failure settles", async () => {
  const lock = createEventSubmissionLock(), response = deferred<{ eventId: string }>(); const h = publicationHarness();
  h.api.createEvent = async () => { h.calls.push("create"); return response.promise; };
  const work = () => publishEventDraft({ draft, options, ...h });
  const first = lock.run(work), second = lock.run(work);
  assert.equal(lock.isBusy(), true); assert.equal(await second, undefined); assert.deepEqual(h.calls, ["create"]);
  response.resolve({ eventId: "synthetic-created-event" }); await first; assert.equal(lock.isBusy(), false);
  await assert.rejects(lock.run(async () => { throw Error("synthetic known rejection"); }));
  assert.equal(lock.isBusy(), false);
});

test("uncertain create/network/5xx/partial acknowledgement outcomes never auto-retry or report a completed event", async () => {
  const failures = [new Error("synthetic offline"), Object.assign(new Error("synthetic server"), { status: 503 })];
  for (const failure of failures) {
    const h = publicationHarness(); h.api.createEvent = async () => { h.calls.push("create"); throw failure; };
    await assert.rejects(publishEventDraft({ draft, options, ...h }), EventPublicationUnknown); assert.deepEqual(h.calls, ["create"]);
  }
  for (const response of [{}, { eventId: "" }, { eventId: 42 }, { eventId: " synthetic-id " }, { eventId: "synthetic", ok: false }]) {
    const h = publicationHarness(); h.api.createEvent = async () => response as any;
    await assert.rejects(publishEventDraft({ draft, options, ...h }), EventPublicationUnknown);
  }
});

test("terms-required is preserved as a known rejection and does not accept terms or resubmit", async () => {
  const h = publicationHarness(); const failure = Object.assign(new Error("synthetic terms required"), { code: "TERMS_REQUIRED", status: 428 });
  h.api.createEvent = async () => { h.calls.push("create"); throw failure; };
  await assert.rejects(publishEventDraft({ draft, options, ...h }), error => error === failure);
  assert.deepEqual(h.calls, ["create"]);
});

test("malformed or credential-bearing signed URLs do not upload bytes or create an event", async () => {
  for (const patch of [{ uploadUrl: "http://unsafe.example" }, { uploadUrl: "https://user:secret@example.invalid/upload" }, { coverPhotoUrl: "javascript:alert(1)" }]) {
    const h = publicationHarness(), original = h.api.createEventCoverUpload;
    h.api.createEventCoverUpload = async () => ({ ...await original(), ...patch });
    await assert.rejects(publishEventDraft({ draft, options, cover: cover(), ...h }), /封面上傳回覆不完整/);
    assert.deepEqual(h.calls, ["presign"]);
  }
});

test("camera reads only local resources without credentials and validates response status/type/content", async () => {
  let reads = 0;
  const fetcher = (async (url, init) => {
    reads++; assert.equal(url, "capacitor://localhost/_capacitor_file_/synthetic.jpg");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); return new Response(jpeg());
  }) as typeof fetch;
  const input = { pageHref: "capacitor://localhost/index.html", isCurrent: () => true, fetcher };
  assert.equal((await readEventCameraPhoto({ photo: { webPath: "/_capacitor_file_/synthetic.jpg" }, ...input })).contentType, "image/jpeg");
  for (const webPath of ["https://evil.example/file.jpg", "capacitor://other/_capacitor_file_/x.jpg", "capacitor://localhost/api/private", "file:///Users/private.jpg", "javascript:alert(1)"]) {
    await assert.rejects(readEventCameraPhoto({ photo: { webPath }, ...input }), EventDraftError);
  }
  assert.equal(reads, 1);
  await assert.rejects(readEventCameraPhoto({ photo: { webPath: "/_capacitor_file_/synthetic.jpg" }, ...input, fetcher: (async () => new Response("failed", { status: 500 })) as typeof fetch }), /無法讀取這張照片/);
});

test("a stale camera result is ignored and known cancellation is distinct from a permission or read failure", async () => {
  let current = true;
  await assert.rejects(readEventCameraPhoto({ photo: { webPath: "blob:synthetic" }, pageHref: "capacitor://localhost/index.html", isCurrent: () => current,
    fetcher: (async () => { current = false; return new Response(jpeg()); }) as typeof fetch }), EventPublishCancelled);
  assert.equal(isEventCameraCancellation(new Error("User cancelled photos app")), true);
  assert.equal(isEventCameraCancellation({ code: "USER_CANCELLED" }), true);
  for (const error of [new Error("User denied access to camera"), new Error("Unable to load photo"), new Error("cancel a network operation"), null]) assert.equal(isEventCameraCancellation(error), false);
});

test("native composer wiring retains cancel/retry/terms/draft and uses synchronous and session fences", () => {
  const source = readFileSync(new URL("../mobile-app/src/EventsScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /api\.captureSessionGuard\(\)/); assert.match(source, /submitLock\.current\.run/);
  assert.match(source, /readEventPublishingOptions\(data\)/); assert.match(source, /eventPublicationKey\(option\)/);
  assert.doesNotMatch(source, /scope:\s*category[^\n]*"CLUB"/);
  assert.match(source, /返回活動列表/); assert.match(source, /重新確認發布權限（保留草稿）/);
  assert.match(source, /TermsConsentPrompt memberId=\{memberId\}/);
  assert.match(source, /條款已確認。草稿仍保留，請再次按/);
  assert.match(source, /\{!loading && readConfirmed &&/);
  assert.match(source, /<MemberEventsScreen key=\{member\.id\}/);
  assert.match(source, /上一筆發布結果尚未確認/);
  assert.match(source, /setCreating\(false\); void load\(\)/);
});
