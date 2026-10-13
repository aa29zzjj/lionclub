// SYNTHETIC PREVIEW ONLY. No Prisma, AWS, credentials, sessions, email or real DB.
// Fixed server-side role; never infer privilege from request data or cookies.
const AI = "preview-ai-club";
const OTHER = "preview-other-club";
const CHAIR = "preview-chair";
const MEMBER = "preview-member";
const MAX_BODY = 128 * 1024;
const MAX_RECORDS = 200;
const MAX_UPLOADS = 10;
const allowedGrantRoles = ["CLUB_OFFICER", "CLUB_FINANCE", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT"];
const stamp = () => new Date().toISOString();
const nextId = (state, type) => `preview-${type}-${++state.sequence}`;
const clone = (value) => structuredClone(value);
const qrInvite = ({ pin: _legacyPin, ...invite }) => clone(invite);

export function createDemoState() {
  const now = stamp();
  const organizations = [
    { id: AI, name: "AI臺科大獅子會（體驗）", districtCode: "300A-1", level: "club", isActive: true },
    { id: OTHER, name: "示範正式分會（體驗）", districtCode: "300A-1", level: "club", isActive: true },
  ];
  const person = (id, name, extra = {}) => ({ id, name, email: `${id}@example.test`, phone: "0900-000-000", title: "獅友", bio: "這是合成體驗資料，非真實會員。", photoUrl: null,
    memberNo: `DEMO-${id.replace("preview-", "")}`, joinYear: 2024, joinMonth: 7, birthday: "1990-01-01T00:00:00.000Z", status: "ACTIVE", role: "MEMBER", organizationId: AI,
    organizationAssignmentStatus: "NEEDS_ASSIGNMENT", organizationAssignmentVersion: 0, declaredOrganizationName: "示範正式分會", tags: [{ id: "preview-tag-service", name: "社區服務", category: "interest" }], createdAt: now, updatedAt: now, ...extra });
  const members = [
    person(CHAIR, "體驗會長", { title: "分會會長", organizationAssignmentStatus: "ASSIGNED", declaredOrganizationName: null }),
    person(MEMBER, "體驗會員"),
    person("preview-officer", "待改派幹部", { title: "原分會幹部" }),
    person("preview-friend", "體驗好友", { organizationId: OTHER, organizationAssignmentStatus: "ASSIGNED" }),
    person("preview-pending", "舊流程待審會員", { status: "PENDING", organizationAssignmentStatus: "ASSIGNED", joinYear: null, joinMonth: null }),
  ];
  const adminRoles = [AI, OTHER].map((scopeId, i) => ({ id: `preview-chair-grant-${i}`, memberId: CHAIR, role: "CLUB_PRESIDENT", scopeId, scopeType: "club", validFrom: now, validUntil: null }));
  adminRoles.push({ id: "preview-officer-grant", memberId: "preview-officer", role: "CLUB_OFFICER", scopeId: AI, scopeType: "club", validFrom: now, validUntil: null });
  const experience = (id, memberId, extra = {}) => ({ id, memberId, kind: "position", level: "club", positionCode: "club_president", positionName: "會長", organizationName: organizations[0].name, organizationIsUnlisted: false, multipleDistrictCode: "300A", districtCode: "300A-1", startYear: 2025, endYear: 2026, datePrecision: "lions-year", isCurrent: false, visibility: "members", verificationStatus: "under-review", note: "合成資歷，可體驗幹部審核。", verifiedAt: null, verifiedById: null, rejectedReason: null, createdAt: now, updatedAt: now, isDemo: false, ...extra });
  return {
    sequence: 100, activeMemberId: MEMBER, organizations, members, adminRoles,
    experiences: [experience("preview-member-experience", MEMBER), experience("preview-chair-experience", CHAIR, { verificationStatus: "verified" }), experience("preview-chair-editable", CHAIR, { positionCode: "club_secretary", positionName: "秘書", startYear: 2024 })],
    invites: [{ id: "preview-invite", organizationId: AI, pin: "123456", token: "preview-shared-invite", issuedById: CHAIR, validFrom: now, validUntil: new Date(Date.now() + 3 * 86400000).toISOString(), revokedAt: null, usageCount: 0, usageLimit: 100, createdAt: now },
      { id: "preview-officer-invite", organizationId: AI, pin: "234567", token: "preview-officer-invite-token", issuedById: "preview-officer", validFrom: now, validUntil: new Date(Date.now() + 3 * 86400000).toISOString(), revokedAt: null, usageCount: 0, usageLimit: 10, createdAt: now }],
    assignments: [MEMBER, "preview-officer"].map((memberId, i) => ({ id: `preview-initial-assignment-${i}`, memberId, fromOrganizationName: null, toOrganizationName: organizations[0].name, reason: "中央註冊：先開通平台，正式分會待名單核對", assignedAt: now, assignedBy: null, revokedRoleNames: [], revokedInviteCount: 0 })),
    friendships: [{ id: "preview-chair-member-friend", requesterId: CHAIR, addresseeId: MEMBER, status: "ACCEPTED" }, { id: "preview-member-incoming", requesterId: "preview-friend", addresseeId: MEMBER, status: "PENDING" }, { id: "preview-chair-incoming", requesterId: "preview-friend", addresseeId: CHAIR, status: "PENDING" }],
    events: [{ id: "preview-event", title: "分會交流與服務體驗", description: "合成活動：可以報名、取消、編輯與查看報名者。", location: "示範活動中心（非實際場地）", capacity: 30, startAt: new Date(Date.now() + 7 * 86400000).toISOString(), coverPhotoUrl: null, hostOrganizationId: AI, createdById: CHAIR }],
    registrations: [{ id: "preview-registration", eventId: "preview-event", memberId: "preview-friend", status: "REGISTERED", registeredAt: now }],
    notifications: [], uploads: new Map(),
  };
}

class DemoError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new DemoError(status, message); };
function requireRoom(records, max = MAX_RECORDS) { if (records.length >= max) fail(429, "合成測試資料已達上限，請按重設後再試"); }
function send(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Lionclub-Demo": "synthetic-only" });
  response.end(JSON.stringify(value));
  return true;
}
async function rawBody(request) {
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY) fail(413, "體驗模式單次資料最多 128KB，圖片請使用小圖");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function body(request) {
  try {
    const data = JSON.parse((await rawBody(request)).toString("utf8") || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) fail(400, "欄位格式錯誤");
    return data;
  } catch (error) { if (error instanceof DemoError) throw error; fail(400, "JSON 格式錯誤"); }
}
function text(value, label, max = 1000, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(400, `${label}格式錯誤`);
  return value.trim();
}
const memberById = (state, id) => state.members.find((member) => member.id === id);
const organizationById = (state, id) => state.organizations.find((org) => org.id === id);
function demoImageUrl(state, value, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || ![...state.uploads.values()].some(upload => upload.publicUrl === value)) fail(400, `${label}僅能使用本次體驗模式上傳的圖片，不能使用外部網址`);
  return value;
}
const liveRoles = (state, id) => state.adminRoles.filter((grant) => grant.memberId === id && new Date(grant.validFrom) <= new Date() && (!grant.validUntil || new Date(grant.validUntil) > new Date()));
const managedIds = (state) => liveRoles(state, CHAIR).filter((grant) => grant.role === "CLUB_PRESIDENT" && grant.scopeId).map((grant) => grant.scopeId);
function requireScope(state, organizationId) { if (!managedIds(state).includes(organizationId)) fail(403, "沒有此示範分會權限"); }
function publicMember(state, member, { role, own = false } = {}) {
  const output = clone(member);
  output.organization = clone(organizationById(state, member.organizationId));
  output.adminRoles = role === "member" && own ? [] : clone(liveRoles(state, member.id));
  if (!own) { delete output.email; delete output.phone; delete output.birthday; }
  return output;
}
const connected = (friendship, id) => friendship.requesterId === id || friendship.addresseeId === id;
const counterpart = (friendship, id) => friendship.requesterId === id ? friendship.addresseeId : friendship.requesterId;
function friendCard(state, id) { const member = memberById(state, id); return member ? { id: member.id, name: member.name, title: member.title, photoUrl: member.photoUrl, chapter: organizationById(state, member.organizationId)?.name ?? "示範分會" } : null; }
function isFriend(state, left, right) { return state.friendships.some((item) => item.status === "ACCEPTED" && connected(item, left) && counterpart(item, left) === right); }
function assignmentCard(state, member) { return { id: member.id, name: member.name, email: member.email, phone: member.phone, status: member.status, declaredOrganizationName: member.declaredOrganizationName, organizationAssignmentStatus: member.organizationAssignmentStatus, organizationAssignmentVersion: member.organizationAssignmentVersion, updatedAt: member.updatedAt, organization: clone(organizationById(state, member.organizationId)) }; }
function validInvite(state, invite) { return invite && !invite.revokedAt && organizationById(state, invite.organizationId)?.isActive && new Date(invite.validFrom) <= new Date() && new Date(invite.validUntil) >= new Date() && (invite.usageLimit == null || invite.usageCount < invite.usageLimit); }
function registrationUrl(invite, memberOrigin) {
  if (!invite) return null;
  const url = new URL("/register", memberOrigin);
  url.searchParams.set("org", invite.organizationId);
  url.searchParams.set("token", invite.token);
  return url.toString();
}
function sharedInvite(state) {
  return state.invites.filter(invite => invite.organizationId === AI && invite.issuedById === CHAIR && validInvite(state, invite))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0];
}
function canManageEvent(state, event, me, role) { return event.createdById === me.id || (role === "chair" && managedIds(state).includes(event.hostOrganizationId)); }
function eventCard(state, event, me, role) {
  const registrations = state.registrations.filter((registration) => registration.eventId === event.id && registration.status === "REGISTERED");
  return { ...clone(event), hostChapter: organizationById(state, event.hostOrganizationId)?.name, registeredCount: registrations.length, isRegistered: registrations.some((registration) => registration.memberId === me.id), isFull: event.capacity != null && registrations.length >= event.capacity, canManage: canManageEvent(state, event, me, role) };
}
function experienceInput(input) {
  if (!["membership", "position", "honorary", "advisor", "other"].includes(input.kind) || !["international", "md", "district", "region", "zone", "club", "foundation"].includes(input.level)) fail(400, "資歷類型或組織層級格式錯誤");
  if (!Number.isInteger(input.startYear) || input.startYear < 1917 || input.startYear > 2200 || (input.endYear !== undefined && (!Number.isInteger(input.endYear) || input.endYear < input.startYear || input.endYear > 2200))) fail(400, "資歷年度格式錯誤");
  if (typeof input.isCurrent !== "boolean" || !["public", "members", "only-me"].includes(input.visibility) || !["month", "lions-year", "approximate"].includes(input.datePrecision)) fail(400, "資歷狀態格式錯誤");
  const code = input.kind === "membership" ? "membership_joined" : text(input.positionCode, "職務", 80, true);
  const positions = { membership_joined: "加入獅子會", club_president: "會長", club_secretary: "秘書", club_treasurer: "財務", club_member: "會員" };
  return { kind: input.kind, level: input.kind === "membership" ? "club" : input.level, positionCode: code, positionName: input.kind === "membership" ? "加入獅子會" : text(input.positionName, "職務名稱", 100) || positions[code] || code, organizationName: text(input.organizationName, "任職組織", 160, true), organizationIsUnlisted: Boolean(input.organizationIsUnlisted), multipleDistrictCode: text(input.multipleDistrictCode, "複合區", 20), districtCode: text(input.districtCode, "區", 30), startYear: input.startYear, endYear: input.isCurrent ? null : input.endYear ?? null, datePrecision: input.datePrecision, isCurrent: input.isCurrent, visibility: input.visibility, note: text(input.note, "說明", 1000), verificationStatus: "under-review", verifiedAt: null, verifiedById: null, rejectedReason: null, updatedAt: stamp(), isDemo: false };
}

/** Returns false only for non-API URLs. All unknown API URLs fail closed here. */
export async function handleDemoApi(request, response, { state, role, publicOrigin = "http://localhost:3103", memberOrigin = "http://localhost:3104" }) {
  const url = new URL(request.url, "http://preview.invalid");
  const path = url.pathname;
  if (path !== "/api" && !path.startsWith("/api/")) return false;
  try {
    if (!["chair", "member"].includes(role)) fail(503, "體驗伺服器角色設定錯誤");
    const method = request.method ?? "GET";
    const me = memberById(state, role === "chair" ? CHAIR : state.activeMemberId);
    if (!me) fail(503, "體驗狀態需要重設");
    // Member role is immutable, including after synthetic role-grant operations.
    if (role === "member" && (path.startsWith("/api/admin/") || (path === "/api/invites"))) fail(403, "一般會員體驗沒有幹部管理或發邀請權限");
    if (path === "/api/demo/info" && method === "GET") return send(response, { syntheticOnly: true, sharedState: true, role, memberId: me.id, memberName: me.name, activeMemberId: state.activeMemberId, intakeOrganizationId: AI, demoInviteUrl: registrationUrl(sharedInvite(state), memberOrigin), message: "免登入體驗，所有資料共用於記憶體，不連正式資料庫。註冊只接受有效共同邀請 QR，請勿填寫真實個資。" });
    if (path === "/api/demo/reset" && method === "POST") {
      Object.assign(state, createDemoState());
      return send(response, { ok: true, syntheticOnly: true });
    }
    if (path === "/api/me" && method === "GET") return send(response, publicMember(state, me, { role, own: true }));
    if (path === "/api/me" && method === "PATCH") {
      const input = await body(request);
      const update = {};
      for (const field of ["name", "title", "bio", "phone", "photoUrl", "email"]) if (field in input) update[field] = text(input[field], field, field === "bio" ? 3000 : 300, field === "name");
      if ("photoUrl" in input) update.photoUrl = demoImageUrl(state, input.photoUrl, "大頭貼");
      if (update.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email) || state.members.some((member) => member.id !== me.id && member.email?.toLowerCase() === update.email.toLowerCase()))) fail(409, "Email 格式錯誤或此 Email 已使用");
      if ("birthday" in input) {
        if (input.birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthday) || Number.isNaN(Date.parse(input.birthday)))) fail(400, "生日格式錯誤");
        update.birthday = input.birthday ? new Date(input.birthday).toISOString() : null;
      }
      if ("tags" in input) {
        if (!Array.isArray(input.tags) || input.tags.length > 30 || input.tags.some((tag) => typeof tag !== "string" || tag.length > 50)) fail(400, "標籤格式錯誤");
        update.tags = [...new Set(input.tags)].map((name, i) => ({ id: `preview-tag-${i}`, name, category: "interest" }));
      }
      Object.assign(me, update, { photoUrl: "photoUrl" in input ? update.photoUrl : me.photoUrl, updatedAt: stamp() });
      return send(response, publicMember(state, me, { role, own: true }));
    }
    if (path === "/api/onboarding" && method === "GET") return send(response, { organization: clone(organizationById(state, AI)), requiresInvite: true, inviteMethod: "qr", mode: "central" });
    if (path === "/api/organizations" && method === "GET") return send(response, { organizations: state.organizations.filter((org) => (!url.searchParams.get("level") || org.level === url.searchParams.get("level")) && (!url.searchParams.get("districtCode") || org.districtCode === url.searchParams.get("districtCode")) && org.name.includes(url.searchParams.get("q") ?? "")).map(clone) });
    if (path === "/api/auth/logout" && method === "POST") return send(response, { ok: true, syntheticOnly: true, fixedRole: role });
    if (path === "/api/auth/login" || path === "/api/auth/reset-password" || path === "/api/auth/forgot-password") fail(403, "體驗網址已自動登入固定角色，不使用真實帳密或寄信");
    if (path === "/api/auth/register" && method === "POST") {
      const input = await body(request);
      const token = text(input.token, "共同邀請 QR", 200, true);
      const name = text(input.name, "姓名", 100, true);
      const email = text(input.email, "Email", 254, true).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof input.password !== "string" || input.password.length < 8 || Buffer.byteLength(input.password, "utf8") > 72) fail(400, "Email 或密碼格式錯誤（密碼至少 8 字且最多 72 位元組）");
      if (state.members.some((member) => member.email?.toLowerCase() === email)) fail(409, "此 Email 已經註冊過了");
      const candidates = state.invites.filter((invite) => invite.token === token && validInvite(state, invite));
      if (candidates.length !== 1 || (input.organizationId && candidates[0].organizationId !== input.organizationId)) fail(400, "邀請 QR 不正確、已過期或已達使用上限");
      const declaredOrganizationName = text(input.declaredOrganizationName, "自填分會", 200) || null;
      if (input.birthday && (typeof input.birthday !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.birthday) || Number.isNaN(Date.parse(input.birthday)))) fail(400, "生日格式錯誤");
      const tags = input.tags ?? [];
      if (!Array.isArray(tags) || tags.length > 30 || tags.some(tag => typeof tag !== "string" || tag.length > 50)) fail(400, "標籤格式錯誤");
      requireRoom(state.members); requireRoom(state.assignments);
      const id = nextId(state, "registered-member");
      const member = { ...clone(memberById(state, MEMBER)), id, name, email, memberNo: `DEMO-${state.sequence}`, phone: text(input.phone, "電話", 50) || null, birthday: null, title: text(input.title, "職稱", 100) || "獅友", bio: text(input.bio, "簡介", 3000) || "新註冊合成會員", photoUrl: null, tags: [], joinYear: null, joinMonth: null, organizationId: AI, status: "ACTIVE", role: "MEMBER", organizationAssignmentStatus: "NEEDS_ASSIGNMENT", organizationAssignmentVersion: 0, declaredOrganizationName, createdAt: stamp(), updatedAt: stamp() };
      member.birthday = input.birthday ? new Date(input.birthday).toISOString() : null;
      member.tags = [...new Set(tags)].map((tag, i) => ({ id: `preview-tag-${i}`, name: tag, category: "interest" }));
      candidates[0].usageCount++;
      state.members.push(member);
      state.assignments.push({ id: nextId(state, "assignment"), memberId: id, fromOrganizationName: null, toOrganizationName: organizationById(state, AI).name, reason: "中央註冊：先開通平台，正式分會待名單核對", assignedAt: stamp(), assignedBy: null, revokedRoleNames: [], revokedInviteCount: 0 });
      // Only the member port changes its synthetic current identity; never its role.
      state.activeMemberId = id;
      return send(response, { ok: true, memberId: id, organizationName: organizationById(state, AI).name, organizationAssignmentStatus: "NEEDS_ASSIGNMENT", canLogin: true, syntheticOnly: true });
    }
    if (path === "/api/invites/verify" && method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) fail(400, "缺少邀請 token");
      const invite = state.invites.find((item) => item.token === token);
      return send(response, validInvite(state, invite) ? { valid: true, organizationId: invite.organizationId, organizationName: organizationById(state, invite.organizationId).name } : { valid: false });
    }
    if (path === "/api/invites" && method === "GET") return send(response, { invites: state.invites.filter((invite) => invite.organizationId === me.organizationId).map((invite) => ({ ...qrInvite(invite), organization: { name: organizationById(state, invite.organizationId).name } })) });
    if (path === "/api/invites" && method === "POST") {
      requireScope(state, me.organizationId);
      const input = await body(request);
      const days = input.validDays ?? 3; const limit = input.usageLimit ?? null;
      if (!Number.isInteger(days) || days < 1 || days > 365 || (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 10000))) fail(400, "邀請設定格式錯誤");
      requireRoom(state.invites);
      // Rotate the shared chair invitation. PIN is retained only as a legacy storage field.
      state.invites.filter((invite) => invite.organizationId === me.organizationId && invite.issuedById === CHAIR && !invite.revokedAt).forEach((invite) => { invite.revokedAt = stamp(); });
      const invite = { id: nextId(state, "invite"), organizationId: me.organizationId, issuedById: me.id, pin: "123456", token: nextId(state, "token"), validFrom: stamp(), validUntil: new Date(Date.now() + days * 86400000).toISOString(), revokedAt: null, usageCount: 0, usageLimit: limit, createdAt: stamp() };
      state.invites.unshift(invite);
      return send(response, { invite: { ...qrInvite(invite), organization: { name: organizationById(state, invite.organizationId).name } }, registerUrl: registrationUrl(invite, memberOrigin) });
    }
    if (path === "/api/me/experiences" && method === "GET") return send(response, { experiences: state.experiences.filter((experience) => experience.memberId === me.id).map(clone) });
    if (path === "/api/me/experiences" && method === "POST") {
      requireRoom(state.experiences);
      const experience = { id: nextId(state, "experience"), memberId: me.id, createdAt: stamp(), ...experienceInput(await body(request)) };
      state.experiences.push(experience); return send(response, { experience: clone(experience) }, 201);
    }
    let match = path.match(/^\/api\/me\/experiences\/([^/]+)$/);
    if (match && ["PATCH", "DELETE"].includes(method)) {
      const experience = state.experiences.find((item) => item.id === match[1] && item.memberId === me.id);
      if (!experience) fail(404, "找不到這筆資歷");
      if (experience.verificationStatus === "verified") fail(409, "已核實資歷需由管理員退回後才能修改或刪除");
      if (method === "DELETE") { state.experiences = state.experiences.filter((item) => item.id !== experience.id); return send(response, { ok: true }); }
      Object.assign(experience, experienceInput(await body(request))); return send(response, { experience: clone(experience) });
    }
    if (path === "/api/admin/pending-experiences" && method === "GET") return send(response, { experiences: state.experiences.filter((experience) => experience.verificationStatus === "under-review" && managedIds(state).includes(memberById(state, experience.memberId)?.organizationId)).map((experience) => ({ ...clone(experience), member: { id: experience.memberId, name: memberById(state, experience.memberId).name, organization: { name: organizationById(state, memberById(state, experience.memberId).organizationId).name } } })) });
    match = path.match(/^\/api\/admin\/pending-experiences\/([^/]+)$/);
    if (match && method === "POST") {
      const experience = state.experiences.find((item) => item.id === match[1] && item.verificationStatus === "under-review");
      if (!experience) fail(404, "找不到此待審核資歷");
      requireScope(state, memberById(state, experience.memberId)?.organizationId);
      const input = await body(request); if (!["verify", "reject"].includes(input.action)) fail(400, "缺少 action");
      Object.assign(experience, { verificationStatus: input.action === "verify" ? "verified" : "rejected", verifiedById: me.id, verifiedAt: stamp(), rejectedReason: input.action === "reject" ? text(input.rejectedReason, "退回原因", 500) || null : null });
      return send(response, { ok: true, status: experience.verificationStatus });
    }
    if (path === "/api/admin/pending-members" && method === "GET") return send(response, { members: state.members.filter((member) => member.status === "PENDING" && managedIds(state).includes(member.organizationId)).map((member) => ({ id: member.id, name: member.name, email: member.email, phone: member.phone, organization: clone(organizationById(state, member.organizationId)), createdAt: member.createdAt })) });
    match = path.match(/^\/api\/admin\/pending-members\/([^/]+)$/);
    if (match && method === "POST") {
      const target = memberById(state, match[1]); if (!target || target.status !== "PENDING") fail(404, "找不到此待審核會員");
      requireScope(state, target.organizationId); const input = await body(request);
      if (!["approve", "reject"].includes(input.action)) fail(400, "缺少 action");
      if (input.action === "approve") {
        if (input.joinYear !== undefined && (!Number.isInteger(input.joinYear) || input.joinYear < 1900 || input.joinYear > 2100)) fail(400, "入會年度格式錯誤");
        if (input.joinMonth !== undefined && (!Number.isInteger(input.joinMonth) || input.joinMonth < 1 || input.joinMonth > 12)) fail(400, "入會月份格式錯誤");
        Object.assign(target, { status: "ACTIVE", joinYear: input.joinYear ?? new Date().getFullYear(), joinMonth: input.joinMonth ?? new Date().getMonth() + 1, updatedAt: stamp() });
      } else state.members = state.members.filter((member) => member.id !== target.id);
      return send(response, { ok: true, status: input.action === "approve" ? "ACTIVE" : "REJECTED" });
    }
    if (path === "/api/admin/member-assignments" && method === "GET") {
      const status = url.searchParams.get("status") ?? "NEEDS_ASSIGNMENT"; const q = (url.searchParams.get("q") ?? "").trim().toLowerCase(); const page = Number(url.searchParams.get("page") ?? 1);
      if (!["NEEDS_ASSIGNMENT", "ASSIGNED", "ALL"].includes(status) || !Number.isInteger(page) || page < 1 || q.length > 100) fail(400, "查詢格式錯誤");
      const members = state.members.filter((member) => member.id !== me.id && member.status === "ACTIVE" && managedIds(state).includes(member.organizationId) && (status === "ALL" || member.organizationAssignmentStatus === status) && `${member.name} ${member.email}`.toLowerCase().includes(q));
      return send(response, { members: members.slice((page - 1) * 30, page * 30).map((member) => assignmentCard(state, member)), organizations: state.organizations.filter((org) => org.isActive && managedIds(state).includes(org.id)).map(clone), canAssignAcrossAllClubs: false, pagination: { page, pageSize: 30, total: members.length, totalPages: Math.max(1, Math.ceil(members.length / 30)) } });
    }
    match = path.match(/^\/api\/admin\/member-assignments\/([^/]+)$/);
    if (match && ["GET", "POST"].includes(method)) {
      const target = memberById(state, match[1]); if (!target || !managedIds(state).includes(target.organizationId)) fail(404, "找不到可管理的會員");
      if (method === "GET") return send(response, { member: { ...assignmentCard(state, target), adminRoles: clone(liveRoles(state, target.id)) }, history: state.assignments.filter((item) => item.memberId === target.id).slice().reverse().map(clone) });
      if (target.id === me.id) fail(403, "不能更改自己的分會");
      if (target.status !== "ACTIVE") fail(400, "僅能分派已啟用會員");
      const input = await body(request); const reason = text(input.reason, "分派依據", 1000, true);
      if (reason.length < 2 || !Number.isInteger(input.expectedAssignmentVersion) || input.expectedAssignmentVersion < 0) fail(400, "請填寫至少 2 字的分派依據並核對版本");
      requireScope(state, input.organizationId);
      const org = organizationById(state, input.organizationId); if (!org?.isActive || org.level !== "club") fail(400, "目標必須是啟用的分會");
      if (input.expectedOrganizationId !== target.organizationId || input.expectedAssignmentVersion !== target.organizationAssignmentVersion) fail(409, "會員資料已被其他管理者更新，請重新載入並核對");
      if (target.organizationId === org.id && target.organizationAssignmentStatus === "ASSIGNED") fail(409, "此會員已完成目前分會確認");
      requireRoom(state.assignments);
      const oldOrg = organizationById(state, target.organizationId); const revokedRoleNames = []; let revokedInviteCount = 0;
      if (target.organizationId !== org.id) {
        for (const grant of state.adminRoles.filter((grant) => grant.memberId === target.id && grant.scopeType === "club" && grant.scopeId === target.organizationId && (!grant.validUntil || new Date(grant.validUntil) > new Date()))) { revokedRoleNames.push(grant.role); grant.validUntil = stamp(); }
        for (const invite of state.invites.filter((invite) => invite.issuedById === target.id && invite.organizationId === target.organizationId && !invite.revokedAt)) { invite.revokedAt = stamp(); revokedInviteCount++; }
      }
      state.assignments.push({ id: nextId(state, "assignment"), memberId: target.id, fromOrganizationName: oldOrg.name, toOrganizationName: org.name, reason, assignedAt: stamp(), assignedBy: { name: me.name }, revokedRoleNames: [...new Set(revokedRoleNames)], revokedInviteCount });
      Object.assign(target, { organizationId: org.id, organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: target.organizationAssignmentVersion + 1, updatedAt: stamp() });
      return send(response, { ok: true, organization: clone(org), organizationAssignmentStatus: "ASSIGNED", revokedRoleNames: [...new Set(revokedRoleNames)], revokedInviteCount });
    }
    if (path === "/api/admin/roles" && method === "GET") {
      const organizations = state.organizations.filter((org) => org.isActive && managedIds(state).includes(org.id)); const orgId = url.searchParams.get("organizationId") || me.organizationId;
      const organization = organizations.find((org) => org.id === orgId); if (!organization) fail(403, "沒有權限管理此分會");
      return send(response, { organizations: organizations.map(clone), organization: clone(organization), members: state.members.filter((member) => member.status === "ACTIVE" && member.organizationId === orgId).map((member) => ({ id: member.id, name: member.name, email: member.email, title: member.title, adminRoles: clone(liveRoles(state, member.id).filter((grant) => grant.scopeId === orgId && allowedGrantRoles.includes(grant.role))) })), assignableRoles: allowedGrantRoles });
    }
    if (path === "/api/admin/roles" && method === "POST") {
      const input = await body(request); requireScope(state, input.organizationId);
      const target = memberById(state, input.memberId); if (!target || target.status !== "ACTIVE" || target.organizationId !== input.organizationId) fail(404, "找不到此分會啟用會員");
      if (!allowedGrantRoles.includes(input.role)) fail(400, "權限格式錯誤");
      if (liveRoles(state, target.id).some((grant) => grant.role === input.role && grant.scopeId === input.organizationId)) fail(409, "此會員已有相同權限");
      requireRoom(state.adminRoles);
      const grant = { id: nextId(state, "grant"), memberId: target.id, role: input.role, scopeType: "club", scopeId: input.organizationId, grantedById: me.id, validFrom: stamp(), validUntil: null };
      state.adminRoles.push(grant); return send(response, { role: clone(grant) }, 201);
    }
    match = path.match(/^\/api\/admin\/roles\/([^/]+)$/);
    if (match && method === "DELETE") {
      const grant = state.adminRoles.find((item) => item.id === match[1] && !item.validUntil); if (!grant) fail(404, "找不到可撤銷的權限");
      requireScope(state, grant.scopeId); if (grant.memberId === me.id) fail(409, "不能撤銷自己的管理權限");
      grant.validUntil = stamp(); return send(response, { ok: true });
    }
    if (path === "/api/friends" && method === "GET") {
      const relationships = state.friendships.filter((item) => connected(item, me.id)); const connectedIds = relationships.map((item) => counterpart(item, me.id));
      return send(response, { friends: relationships.filter((item) => item.status === "ACCEPTED").map((item) => ({ ...friendCard(state, counterpart(item, me.id)), status: "friend" })), incoming: relationships.filter((item) => item.status === "PENDING" && item.addresseeId === me.id).map((item) => ({ ...friendCard(state, item.requesterId), status: "pending-in", friendshipId: item.id })), suggestions: state.members.filter((member) => member.status === "ACTIVE" && member.id !== me.id && !connectedIds.includes(member.id)).map((member) => ({ ...friendCard(state, member.id), status: "none" })) });
    }
    if (path === "/api/friends/search" && method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim(); return send(response, { members: q ? state.members.filter((member) => member.id !== me.id && member.status === "ACTIVE" && member.name.includes(q) && !state.friendships.some((friendship) => connected(friendship, me.id) && counterpart(friendship, me.id) === member.id)).map((member) => friendCard(state, member.id)) : [] });
    }
    if (["/api/friends/request", "/api/friends/qr-add"].includes(path) && method === "POST") {
      const input = await body(request); const target = memberById(state, input.memberId);
      if (!target || target.status !== "ACTIVE") fail(404, "找不到此示範會員");
      if (target.id === me.id) fail(400, "不能加自己為好友");
      const existing = state.friendships.find((item) => connected(item, me.id) && counterpart(item, me.id) === target.id);
      if (path.endsWith("/request") && existing) fail(409, "已經是好友或邀請已送出");
      if (!existing) requireRoom(state.friendships);
      const item = existing || { id: nextId(state, "friendship"), requesterId: me.id, addresseeId: target.id };
      item.status = path.endsWith("/qr-add") ? "ACCEPTED" : "PENDING"; if (!existing) state.friendships.push(item);
      return send(response, path.endsWith("/qr-add") ? { ok: true, friend: friendCard(state, target.id) } : { ok: true, friendshipId: item.id });
    }
    match = path.match(/^\/api\/friends\/([^/]+)\/respond$/);
    if (match && method === "POST") {
      const item = state.friendships.find((friendship) => friendship.id === match[1] && friendship.addresseeId === me.id && friendship.status === "PENDING"); if (!item) fail(404, "找不到此邀請");
      const input = await body(request); if (!["accept", "decline"].includes(input.action)) fail(400, "缺少 action");
      item.status = input.action === "accept" ? "ACCEPTED" : "BLOCKED"; return send(response, { ok: true, status: item.status });
    }
    match = path.match(/^\/api\/members\/([^/]+)$/);
    if (match && method === "GET") {
      const target = memberById(state, match[1]); if (!target || target.status !== "ACTIVE") fail(404, "找不到此會員");
      if (target.id !== me.id && !isFriend(state, me.id, target.id)) fail(403, "只有好友可以查看此會員資料");
      return send(response, { member: { ...publicMember(state, target), experiences: state.experiences.filter((experience) => experience.memberId === target.id && (target.id === me.id || ["public", "members"].includes(experience.visibility))).map(clone) } });
    }
    if (path === "/api/events" && method === "GET") return send(response, { events: state.events.map((event) => eventCard(state, event, me, role)) });
    if (path === "/api/events" && method === "POST") {
      requireRoom(state.events);
      const input = await body(request); const title = text(input.title, "活動名稱", 160, true); const location = text(input.location, "活動地點", 240, true);
      if (Number.isNaN(Date.parse(input.startAt)) || (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1))) fail(400, "活動時間或名額格式錯誤");
      const event = { id: nextId(state, "event"), title, location, startAt: new Date(input.startAt).toISOString(), capacity: input.capacity ?? null, description: text(input.description, "活動說明", 3000) ?? null, coverPhotoUrl: demoImageUrl(state, input.coverPhotoUrl, "活動照片"), hostOrganizationId: me.organizationId, createdById: me.id };
      state.events.push(event); return send(response, { ok: true, eventId: event.id });
    }
    match = path.match(/^\/api\/events\/([^/]+)(?:\/(register|registrations))?$/);
    if (match && match[1] !== "cover-upload") {
      const event = state.events.find((item) => item.id === match[1]); if (!event) fail(404, "找不到此活動");
      if (match[2] === "register" && method === "POST") {
        const existing = state.registrations.find((item) => item.eventId === event.id && item.memberId === me.id);
        if (existing) { state.registrations = state.registrations.filter((item) => item.id !== existing.id); return send(response, { ok: true, registered: false }); }
        if (eventCard(state, event, me, role).isFull) fail(409, "活動名額已滿");
        requireRoom(state.registrations);
        state.registrations.push({ id: nextId(state, "registration"), eventId: event.id, memberId: me.id, status: "REGISTERED", registeredAt: stamp() }); return send(response, { ok: true, registered: true });
      }
      if (match[2] === "registrations" && method === "GET") {
        if (!canManageEvent(state, event, me, role)) fail(403, "沒有權限查看報名者資料");
        return send(response, { registrations: state.registrations.filter((item) => item.eventId === event.id).map((item) => { const member = memberById(state, item.memberId); return { id: item.id, registeredAt: item.registeredAt, member: { id: member.id, name: member.name, email: member.email, phone: member.phone, title: member.title, photoUrl: member.photoUrl, organization: { name: organizationById(state, member.organizationId).name } } }; }) });
      }
      if (!match[2] && method === "GET") return send(response, { event: eventCard(state, event, me, role) });
      if (!match[2] && ["PATCH", "DELETE"].includes(method)) {
        if (!canManageEvent(state, event, me, role)) fail(403, "沒有活動管理權限");
        if (method === "DELETE") { state.events = state.events.filter((item) => item.id !== event.id); state.registrations = state.registrations.filter((item) => item.eventId !== event.id); state.notifications = state.notifications.filter((item) => item.eventId !== event.id); return send(response, { ok: true }); }
        const input = await body(request); const title = text(input.title, "活動名稱", 160, true); const location = text(input.location, "活動地點", 240, true);
        if (typeof input.startAt !== "string" || Number.isNaN(Date.parse(input.startAt)) || (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity < 1))) fail(400, "活動時間或名額格式錯誤");
        const count = state.registrations.filter((item) => item.eventId === event.id).length; if (input.capacity != null && input.capacity < count) fail(409, "名額不能低於目前報名人數");
        Object.assign(event, { title, location, startAt: new Date(input.startAt).toISOString(), capacity: input.capacity ?? null, description: text(input.description ?? "", "活動說明", 3000) || null, ...(input.coverPhotoUrl !== undefined ? { coverPhotoUrl: demoImageUrl(state, input.coverPhotoUrl, "活動照片") } : {}) }); return send(response, { ok: true });
      }
    }
    if (path === "/api/notifications" && method === "GET") return send(response, { notifications: state.notifications.filter((item) => item.senderId === me.id).map((item) => ({ id: item.id, eventTitle: state.events.find((event) => event.id === item.eventId)?.title ?? "合成活動", message: item.message, sentAt: item.sentAt, recipients: item.memberIds.map((id) => memberById(state, id)?.name ?? "體驗會員") })) });
    if (path === "/api/notifications" && method === "POST") {
      const input = await body(request); const event = state.events.find((item) => item.id === input.eventId); if (!event) fail(404, "找不到此活動");
      let memberIds;
      if (input.recipientType === "organization") {
        if (role !== "chair" && event.createdById !== me.id) fail(403, "只有活動建立者或幹部可以通知整個分會");
        memberIds = state.members.filter((member) => member.status === "ACTIVE" && member.organizationId === me.organizationId && member.id !== me.id).map((member) => member.id);
      } else {
        if (input.recipientType && input.recipientType !== "selected") fail(400, "通知對象格式錯誤");
        if (!Array.isArray(input.memberIds)) fail(400, "請選擇好友");
        memberIds = [...new Set(input.memberIds)].filter((id) => id !== me.id); if (memberIds.some((id) => !isFriend(state, me.id, id))) fail(403, "收件人包含尚未成為好友的會員");
      }
      if (!memberIds.length) fail(400, "此範圍目前沒有可通知的會員");
      requireRoom(state.notifications);
      const notification = { id: nextId(state, "notification"), eventId: event.id, senderId: me.id, memberIds, message: text(input.message, "通知內容", 1000) || `邀請你一起參加「${event.title}」！`, sentAt: stamp() };
      state.notifications.unshift(notification); return send(response, { ok: true, notificationId: notification.id, recipientCount: memberIds.length });
    }
    if (["/api/me/avatar-upload", "/api/events/cover-upload"].includes(path) && method === "POST") {
      const input = await body(request); if (!["image/jpeg", "image/png", "image/webp"].includes(input.contentType)) fail(400, "體驗圖片僅支援 JPEG、PNG 或 WebP");
      if (input.size !== undefined && (!Number.isInteger(input.size) || input.size < 1 || input.size > MAX_BODY)) fail(413, "體驗圖片最多 128KB，請選擇小圖");
      requireRoom([...state.uploads], MAX_UPLOADS);
      const id = nextId(state, "upload");
      const uploadUrl = new URL(`/api/demo/uploads/${id}`, publicOrigin).toString();
      state.uploads.set(id, { ownerId: me.id, contentType: input.contentType, bytes: null, publicUrl: uploadUrl });
      return send(response, { uploadUrl, publicUrl: uploadUrl, ...(path === "/api/me/avatar-upload" ? { photoUrl: uploadUrl } : { coverPhotoUrl: uploadUrl }) });
    }
    match = path.match(/^\/api\/demo\/uploads\/([^/]+)$/);
    if (match && ["PUT", "GET"].includes(method)) {
      const upload = state.uploads.get(match[1]); if (!upload) fail(404, "找不到示範圖片");
      if (method === "PUT") { if (upload.ownerId !== me.id) fail(403, "只能上傳自己的示範圖片"); upload.bytes = await rawBody(request); return send(response, { ok: true }); }
      if (!upload.bytes) fail(404, "示範圖片尚未上傳");
      response.writeHead(200, { "Content-Type": upload.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); response.end(upload.bytes); return true;
    }
    return send(response, { error: "此體驗 API 尚未提供，不會轉送正式服務", syntheticOnly: true }, 404);
  } catch (error) {
    return send(response, { error: error instanceof DemoError ? error.message : "體驗操作未完成，請重設或稍後再試", syntheticOnly: true }, error instanceof DemoError ? error.status : 500);
  }
}
