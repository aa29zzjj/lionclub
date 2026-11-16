import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createSimulation, seedScenario } from "../tests/helpers/simulation.mjs";

const port = Number(process.env.NEXT_PHASE_PREVIEW_PORT || "3126");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a port between 1024 and 65535.");
const origin = `http://localhost:${port}`;
const sim = await createSimulation();
let child;
let stopping = false;
async function close(code) {
  if (stopping) return;
  stopping = true;
  child?.kill();
  await sim.close();
  process.exit(code);
}
process.on("SIGINT", () => void close(0));
process.on("SIGTERM", () => void close(0));

try {
  const { ai, chair, member, friend } = await seedScenario(sim, "next-phase");
  const termsVersion = sim.load("src/lib/terms.ts").TERMS_VERSION;
  const now = new Date();
  const email = "member-next-phase@example.test";
  await sim.prisma.adminRole.create({ data: { memberId: friend.id, role: "SUPER_ADMIN", scopeType: "GLOBAL" } });
  await sim.prisma.organization.update({ where: { id: ai.id }, data: { name: "青禾獅子會（測試分會）" } });
  for (const [actor, name] of [[chair, "林主揪"], [member, "陳獅友"], [friend, "許獅友"]]) {
    await sim.prisma.member.update({ where: { id: actor.id }, data: { name, organizationAssignmentStatus: "ASSIGNED", termsVersion, termsAcceptedAt: now, emailVerifiedAt: now } });
  }
  for (const [days, title, category, location, description] of [
    [3, "週末好樂迪唱歌", "唱歌", "好樂迪西門店 · 大廳集合", "歡迎點歌！先在聊天室討論包廂時間與費用。"],
    [5, "服務後一起吃晚餐", "餐敘", "台北車站 · 東三門", "活動結束後自由參加。請在聊天室告知飲食偏好。"],
  ]) {
    const startsAt = new Date(now.getTime() + days * 86400000);
    startsAt.setUTCHours(11, 0, 0, 0);
    await sim.prisma.meetup.create({ data: { organizationId: ai.id, hostId: chair.id, requestId: randomUUID(), title, category, location, description, startsAt, capacity: 8, registrations: { create: { memberId: chair.id } }, messages: { create: { memberId: chair.id, requestId: randomUUID(), body: "大家好！報名後可以在這裡一起討論。" } } } });
  }
  const upcoming = await sim.prisma.meetup.create({ data: {
    organizationId: ai.id, hostId: chair.id, requestId: randomUUID(), title: "明天一起喝咖啡", category: "交流",
    location: "台北車站 · 東三門", description: "行前提醒示範", startsAt: new Date(now.getTime() + 18 * 3_600_000),
    capacity: 6, registrations: { create: [{ memberId: chair.id }, { memberId: member.id }] },
  } });
  await sim.load("src/lib/phase-notices.ts").scheduleMeetupReminder(sim.prisma, upcoming, [member.id], now);
  await sim.prisma.resourceNeed.create({ data: {
    ownerId: chair.id, organizationId: ai.id, requestId: randomUUID(), kind: "NEED", title: "公益講座需要保險專長協助",
    category: "保險", description: "想找熟悉公共意外責任保險的獅友，一起確認活動準備事項。",
    targetDate: new Date(now.getTime() + 12 * 86400000), quantity: 1, quantityUnit: "位",
  } });

  await sim.prisma.$disconnect();
  // PGlite's socket adapter shares a single PostgreSQL session across clients.
  await sim.database.exec("DISCARD ALL");

  const env = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development",
    DATABASE_URL: sim.env.DATABASE_URL + "&pgbouncer=true&statement_cache_size=0",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    NEXT_PUBLIC_APP_URL: origin,
    MOBILE_APP_API_BASE_URL: origin,
    NEXT_PUBLIC_NEXT_PHASE_ENABLED: "true",
    REGISTRATION_CLUB_APPLICATION_ENABLED: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    LIONCLUBS_WEB_PREVIEW: process.env.LIONCLUBS_WEB_PREVIEW,
  };
  const run = (script, ...args) => spawn(process.execPath, [script, ...args], { env, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    const assets = run("scripts/copy-card-ocr.mjs", "--web");
    assets.once("error", reject);
    assets.once("exit", code => code === 0 ? resolve() : reject(new Error("Could not prepare OCR assets.")));
  });
  if (env.LIONCLUBS_WEB_PREVIEW !== "true") await new Promise((resolve, reject) => {
    const native = run("mobile-app/build.mjs", "--web-preview");
    native.once("error", reject);
    native.once("exit", code => code === 0 ? resolve() : reject(new Error("Could not build the native preview.")));
  });
  child = run("node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port));
  child.once("error", failure => { console.error(failure); void close(1); });
  child.once("exit", code => void close(code ?? 0));
  console.log(`Preview: ${origin}/login\nSynthetic accounts: ${email}, chair-next-phase@example.test, friend-next-phase@example.test\nShared test password: SimulationPass42!\nRegistration preview: ${origin}/register?token=sim-invite-next-phase`);
} catch (error) {
  console.error(error);
  await close(1);
}
