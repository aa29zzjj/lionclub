import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createDemoState, handleDemoApi } from "./demo-fixtures.mjs";

// Real HTTP requests against synthetic fixtures only; no Next/API/DB imports.
async function fixture(run) {
  const state = createDemoState();
  let memberOrigin;
  const servers = ["chair", "member"].map(role => http.createServer(async (request, response) => {
    const origin = `http://127.0.0.1:${serverPorts[role]}`;
    const handled = await handleDemoApi(request, response, { state, role, publicOrigin: origin, memberOrigin });
    if (!handled) { response.writeHead(404); response.end(); }
  }));
  const serverPorts = {};
  for (const [index, role] of ["chair", "member"].entries()) {
    await new Promise(resolve => servers[index].listen(0, "127.0.0.1", resolve));
    serverPorts[role] = servers[index].address().port;
  }
  memberOrigin = `http://127.0.0.1:${serverPorts.member}`;
  const request = async (role, path, method = "GET", input, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${serverPorts[role]}${path}`, { method, ...(input !== undefined ? { body: typeof input === "string" || Buffer.isBuffer(input) ? input : JSON.stringify(input), headers: { "Content-Type": "application/json", ...headers } } : { headers }) });
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, data, headers: response.headers };
  };
  try { await run({ state, request, memberOrigin }); }
  finally { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
}

const registration = (extra = {}) => ({ name: "新的合成會員", email: "new@example.test", password: "demoPass123", token: "preview-shared-invite", organizationId: "preview-ai-club", declaredOrganizationName: "示範正式分會", ...extra });
const experience = (extra = {}) => ({ kind: "position", level: "club", positionCode: "club_secretary", organizationName: "合成任職組織", organizationIsUnlisted: true, multipleDistrictCode: "300A", districtCode: "300A-1", startYear: 2026, datePrecision: "lions-year", isCurrent: true, visibility: "members", note: "合成資歷測試", ...extra });
const assign = (extra = {}) => ({ organizationId: "preview-other-club", expectedOrganizationId: "preview-ai-club", expectedAssignmentVersion: 0, reason: "正式合成名單核對", ...extra });

test("chair/member fixed roles and unknown API fail-closed are independent of caller input", async () => fixture(async ({ request }) => {
  const chair = await request("chair", "/api/me"); const member = await request("member", "/api/me?role=chair", "GET", undefined, { cookie: "role=SUPER_ADMIN" });
  assert.equal(chair.data.id, "preview-chair"); assert.equal(chair.data.adminRoles.length, 2);
  assert.ok(chair.data.adminRoles.every(grant => grant.role === "CLUB_PRESIDENT" && grant.scopeId));
  assert.equal(member.data.id, "preview-member"); assert.deepEqual(member.data.adminRoles, []);
  for (const path of ["/api/admin/pending-members", "/api/admin/pending-experiences", "/api/admin/member-assignments", "/api/admin/member-assignments/preview-member", "/api/admin/roles", "/api/invites"]) {
    assert.equal((await request("member", path)).status, 403, path);
    assert.equal((await request("member", path, "POST", {})).status, 403, path);
  }
  const unknown = await request("chair", "/api/unknown-backend-secret"); assert.equal(unknown.status, 404); assert.equal(unknown.data.syntheticOnly, true);
  assert.equal((await request("member", "/api/auth/login", "POST", { role: "chair" })).status, 403);
}));

test("member profile edits persist but cannot assign organization or management role", async () => fixture(async ({ request, state }) => {
  const changed = await request("member", "/api/me", "PATCH", { name: "合成新名字", phone: "0000", bio: "測試簡介", birthday: "2000-02-29", tags: ["AI", "AI"], role: "SUPER_ADMIN", organizationId: "preview-other-club" });
  assert.equal(changed.status, 200); assert.equal(changed.data.name, "合成新名字"); assert.equal(changed.data.organization.id, "preview-ai-club"); assert.deepEqual(changed.data.adminRoles, []);
  assert.equal((await request("member", "/api/me")).data.phone, "0000");
  assert.equal(state.members.find(member => member.id === "preview-member").role, "MEMBER");
  assert.equal(changed.data.tags.length, 1);
}));

test("QR-only central registration uses shared quota and switches only member identity", async () => fixture(async ({ request, state, memberOrigin }) => {
  const onboarding = await request("member", "/api/onboarding"); assert.equal(onboarding.data.mode, "central"); assert.equal(onboarding.data.requiresInvite, true); assert.equal(onboarding.data.inviteMethod, "qr");
  const originalInfo = await request("member", "/api/demo/info");
  assert.equal("demoPin" in originalInfo.data, false);
  assert.ok(originalInfo.data.demoInviteUrl.startsWith(`${memberOrigin}/register?`));
  assert.equal(new URL(originalInfo.data.demoInviteUrl).searchParams.get("token"), "preview-shared-invite");
  const generated = await request("chair", "/api/invites", "POST", { validDays: 30, usageLimit: 1 });
  assert.equal(generated.status, 200); assert.equal("pin" in generated.data.invite, false); assert.ok(generated.data.registerUrl.startsWith(`${memberOrigin}/register?`));
  assert.ok((await request("chair", "/api/invites")).data.invites.every(invite => !("pin" in invite)));
  assert.equal((await request("chair", "/api/demo/info")).data.demoInviteUrl, generated.data.registerUrl);
  assert.equal((await request("member", "/api/demo/info")).data.demoInviteUrl, generated.data.registerUrl);
  assert.ok(Date.parse(generated.data.invite.validUntil) - Date.now() <= 30 * 86400000);
  const token = generated.data.invite.token;
  const verified = await request("member", `/api/invites/verify?token=${token}`);
  assert.equal(verified.data.valid, true); assert.equal("pin" in verified.data, false);
  assert.equal((await request("member", "/api/invites/verify?token=preview-shared-invite")).data.valid, false);
  const registered = await request("member", "/api/auth/register", "POST", registration({ token, role: "SUPER_ADMIN", organizationAssignmentStatus: "ASSIGNED", birthday: "2000-02-29", tags: ["公益服務"] }));
  assert.equal(registered.status, 200); assert.equal(registered.data.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
  const member = (await request("member", "/api/me")).data; assert.equal(member.id, registered.data.memberId); assert.equal(member.organization.id, "preview-ai-club"); assert.equal(member.status, "ACTIVE"); assert.deepEqual(member.adminRoles, []);
  assert.equal(member.birthday, "2000-02-29T00:00:00.000Z"); assert.equal(member.tags[0].name, "公益服務");
  assert.equal((await request("chair", "/api/me")).data.id, "preview-chair");
  assert.equal((await request("member", `/api/invites/verify?token=${token}`)).data.valid, false);
  const count = state.members.length;
  assert.equal((await request("member", "/api/auth/register", "POST", registration({ token, email: "second@example.test" }))).status, 400); assert.equal(state.members.length, count);
  assert.equal(state.invites.find(invite => invite.token === token).usageCount, 1);
  assert.equal((await request("member", "/api/demo/info")).data.demoInviteUrl, null);
  assert.ok((await request("chair", "/api/admin/member-assignments")).data.members.some(row => row.id === registered.data.memberId));
  assert.equal((await request("member", "/api/demo/reset", "POST")).status, 200); assert.equal((await request("member", "/api/me")).data.id, "preview-member");
}));

test("missing, PIN-only, invalid and expired QR invitations cannot create synthetic members", async () => fixture(async ({ request, state }) => {
  const before = structuredClone({ members: state.members, assignments: state.assignments, activeMemberId: state.activeMemberId, sequence: state.sequence });
  for (const extra of [
    { token: undefined },
    { token: undefined, pin: "123456" },
    { token: undefined, pin: "123456", email: "preview-member@example.test" },
    { token: "invalid-preview-token", pin: "123456" },
    { token: "" },
  ]) {
    const rejected = await request("member", "/api/auth/register", "POST", registration(extra));
    assert.equal(rejected.status, 400);
    assert.deepEqual({ members: state.members, assignments: state.assignments, activeMemberId: state.activeMemberId, sequence: state.sequence }, before);
    assert.equal(state.invites.find(invite => invite.token === "preview-shared-invite").usageCount, 0);
  }
  state.invites.find(invite => invite.token === "preview-shared-invite").validUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal((await request("member", "/api/invites/verify?token=preview-shared-invite")).data.valid, false);
  assert.equal((await request("member", "/api/auth/register", "POST", registration())).status, 400);
  assert.deepEqual({ members: state.members, assignments: state.assignments, activeMemberId: state.activeMemberId, sequence: state.sequence }, before);
  assert.equal((await request("member", "/api/demo/info")).data.demoInviteUrl, null);
}));

test("demo info chooses the newest live shared QR and uses the current member origin", async () => fixture(async ({ request, state, memberOrigin }) => {
  state.invites.push({ ...structuredClone(state.invites[0]), id: "preview-newest-live", token: "preview-newest-live-token", createdAt: new Date(Date.now() + 1000).toISOString() });
  state.invites.push({ ...structuredClone(state.invites[0]), id: "preview-newest-revoked", token: "preview-revoked-token", createdAt: new Date(Date.now() + 2000).toISOString(), revokedAt: new Date().toISOString() });
  const chair = (await request("chair", "/api/demo/info")).data.demoInviteUrl;
  const member = (await request("member", "/api/demo/info")).data.demoInviteUrl;
  assert.equal(chair, member);
  assert.equal(new URL(member).origin, memberOrigin);
  assert.equal(new URL(member).searchParams.get("token"), "preview-newest-live-token");
  assert.equal("demoPin" in (await request("chair", "/api/demo/info")).data, false);
}));

test("assignment is shared, CAS-protected and revokes original roles/invites without rewriting histories", async () => fixture(async ({ request, state }) => {
  const memberNo = state.members.find(member => member.id === "preview-member").memberNo;
  const changed = await request("chair", "/api/admin/member-assignments/preview-member", "POST", assign()); assert.equal(changed.status, 200);
  assert.equal((await request("member", "/api/me")).data.organization.id, "preview-other-club");
  assert.equal((await request("member", "/api/me")).data.memberNo, memberNo);
  assert.equal((await request("chair", "/api/admin/member-assignments/preview-member", "POST", assign())).status, 409);
  const detail = await request("chair", "/api/admin/member-assignments/preview-member"); assert.equal(detail.data.member.organizationAssignmentVersion, 1); assert.equal(detail.data.history.length, 2);
  assert.equal((await request("chair", "/api/admin/member-assignments/preview-chair", "POST", assign())).status, 403);
  const preserved = structuredClone({ experiences: state.experiences, friendships: state.friendships, registrations: state.registrations });
  const officer = await request("chair", "/api/admin/member-assignments/preview-officer", "POST", assign()); assert.deepEqual(officer.data.revokedRoleNames, ["CLUB_OFFICER"]); assert.equal(officer.data.revokedInviteCount, 1);
  assert.deepEqual({ experiences: state.experiences, friendships: state.friendships, registrations: state.registrations }, preserved);
  assert.ok(state.adminRoles.find(grant => grant.id === "preview-officer-grant").validUntil);
  assert.ok(state.invites.find(invite => invite.id === "preview-officer-invite").revokedAt);
  assert.equal((await request("chair", "/api/admin/member-assignments?status=ASSIGNED")).data.canAssignAcrossAllClubs, false);
}));

test("experience CRUD, chair verification and member verified-lock have frontend-compatible shapes", async () => fixture(async ({ request }) => {
  const added = await request("member", "/api/me/experiences", "POST", experience({ positionName: "分會秘書" })); assert.equal(added.status, 201); assert.equal(added.data.experience.verificationStatus, "under-review"); assert.equal(added.data.experience.positionName, "分會秘書");
  const id = added.data.experience.id;
  assert.equal((await request("member", `/api/me/experiences/${id}`, "PATCH", experience({ note: "新版說明" }))).data.experience.note, "新版說明");
  const pending = await request("chair", "/api/admin/pending-experiences"); assert.ok(pending.data.experiences.some(item => item.id === id && item.member.name === "體驗會員"));
  assert.equal((await request("chair", `/api/admin/pending-experiences/${id}`, "POST", { action: "verify" })).data.status, "verified");
  assert.equal((await request("member", `/api/me/experiences/${id}`, "PATCH", experience())).status, 409);
  assert.equal((await request("member", `/api/me/experiences/${id}`, "DELETE")).status, 409);
  const second = (await request("member", "/api/me/experiences", "POST", experience())).data.experience.id;
  assert.equal((await request("chair", `/api/admin/pending-experiences/${second}`, "POST", { action: "reject", rejectedReason: "請補合成資料" })).data.status, "rejected");
  assert.equal((await request("member", `/api/me/experiences/${second}`, "DELETE")).status, 200);
}));

test("legacy pending-member approval/rejection and scoped admin-role changes remain synthetic", async () => fixture(async ({ request, state }) => {
  assert.equal((await request("chair", "/api/admin/pending-members")).data.members[0].id, "preview-pending");
  assert.equal((await request("chair", "/api/admin/pending-members/preview-pending", "POST", { action: "approve", joinYear: 2026, joinMonth: 10 })).data.status, "ACTIVE");
  const granted = await request("chair", "/api/admin/roles", "POST", { organizationId: "preview-ai-club", memberId: "preview-pending", role: "CLUB_FINANCE" }); assert.equal(granted.status, 201);
  assert.equal((await request("chair", `/api/admin/roles/${granted.data.role.id}`, "DELETE")).status, 200);
  assert.equal((await request("chair", "/api/admin/roles/preview-chair-grant-0", "DELETE")).status, 409);
  assert.equal((await request("chair", "/api/demo/reset", "POST")).status, 200);
  assert.equal((await request("chair", "/api/admin/pending-members/preview-pending", "POST", { action: "reject" })).data.status, "REJECTED");
  assert.equal(state.members.some(member => member.id === "preview-pending"), false);
}));

test("friends, friend detail, activity registration and notification flows are functional", async () => fixture(async ({ request }) => {
  const friends = await request("member", "/api/friends"); assert.equal(friends.data.friends[0].id, "preview-chair");
  const detail = await request("member", "/api/members/preview-chair"); assert.equal(detail.status, 200); assert.equal("email" in detail.data.member, false);
  assert.equal((await request("member", "/api/members/preview-officer")).status, 403);
  assert.equal((await request("member", "/api/friends/qr-add", "POST", { memberId: "preview-officer" })).status, 200); assert.equal((await request("member", "/api/members/preview-officer")).status, 200);
  assert.equal((await request("member", "/api/friends/preview-member-incoming/respond", "POST", { action: "accept" })).status, 200);
  assert.equal((await request("member", "/api/events/preview-event")).data.event.canManage, false);
  assert.equal((await request("member", "/api/events/preview-event/registrations")).status, 403);
  assert.equal((await request("member", "/api/events/preview-event/register", "POST")).data.registered, true);
  assert.ok((await request("chair", "/api/events/preview-event/registrations")).data.registrations.some(item => item.member.id === "preview-member"));
  assert.equal((await request("member", "/api/events/preview-event/register", "POST")).data.registered, false);
  const notification = await request("member", "/api/notifications", "POST", { eventId: "preview-event", recipientType: "selected", memberIds: ["preview-chair"], message: "合成邀請" }); assert.equal(notification.data.recipientCount, 1);
  assert.equal((await request("member", "/api/notifications")).data.notifications[0].message, "合成邀請");
}));

test("synthetic uploads never use S3; bodies and shared storage are bounded", async () => fixture(async ({ request, state }) => {
  const sign = await request("member", "/api/me/avatar-upload", "POST", { contentType: "image/png", size: 8 }); assert.equal(sign.status, 200);
  assert.equal(sign.data.photoUrl, sign.data.uploadUrl);
  const path = new URL(sign.data.uploadUrl).pathname; assert.ok(path.startsWith("/api/demo/uploads/preview-"));
  assert.equal((await request("member", path, "PUT", Buffer.from("PNG-DEMO"), { "Content-Type": "image/png" })).status, 200);
  const image = await request("member", path); assert.equal(image.data, "PNG-DEMO"); assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal((await request("member", "/api/me", "PATCH", { photoUrl: sign.data.photoUrl })).data.photoUrl, sign.data.photoUrl);
  assert.equal((await request("member", "/api/me", "PATCH", { photoUrl: "" })).data.photoUrl, null);
  assert.equal((await request("member", "/api/me", "PATCH", { photoUrl: "https://tracking.example.test/pixel" })).status, 400);
  assert.equal((await request("chair", path, "PUT", "cannot-upload-member-image")).status, 403);
  const cover = await request("chair", "/api/events/cover-upload", "POST", { contentType: "image/jpeg", size: 8 }); assert.equal(cover.status, 200); assert.equal(cover.data.coverPhotoUrl, cover.data.uploadUrl);
  assert.equal((await request("chair", "/api/events", "POST", { title: "測試照片", location: "合成場地", startAt: "2026-11-01T00:00:00.000Z", coverPhotoUrl: "https://tracking.example.test/pixel" })).status, 400);
  assert.equal((await request("member", "/api/me", "PATCH", JSON.stringify({ bio: "x".repeat(128 * 1024) }))).status, 413);
  while (state.uploads.size < 10) state.uploads.set(`preview-cap-${state.uploads.size}`, { bytes: null });
  assert.equal((await request("member", "/api/me/avatar-upload", "POST", { contentType: "image/png", size: 8 })).status, 429);
  while (state.experiences.length < 200) state.experiences.push({ id: `preview-cap-${state.experiences.length}` });
  assert.equal((await request("member", "/api/me/experiences", "POST", experience())).status, 429);
}));
