/** Local-only acceptance UI. Real API handlers + disposable PostgreSQL/WASM.
 * External cookies, mail, S3 and AWS are never forwarded. Not a production route.
 */
import http from "node:http";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createSimulation, seedScenario } from "../tests/helpers/simulation.mjs";
import { isDemoFrontendPath } from "./demo-preview.mjs";

const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const css = "body{max-width:700px;margin:auto;padding:30px 20px;font:18px/1.7 system-ui;background:#f4f6f8;color:#173247}button,a{min-height:48px}button{font:inherit;padding:10px 18px;margin:8px;border-radius:12px;border:1px solid #456}a{display:inline-block;color:#14558b;margin:8px}article{padding:16px;border:1px solid #ccd;border-radius:12px;margin:16px 0;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:16px/1.6 system-ui}";
const html = body => `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔離模擬驗收</title><style>${css}</style><body>${body}</body></html>`;
const banner = `<script>addEventListener('load',()=>{let b=document.createElement('aside');b.textContent='隔離模擬：不寄真信／不寫正式資料　';let a=document.createElement('a');a.href='/__simulation';a.textContent='切換角色／假信箱';a.style.color='#fff3b0';b.append(a);b.style.cssText='position:sticky;top:0;z-index:9999;padding:10px;background:#153954;color:white;font:14px/1.6 system-ui;text-align:center';document.body.prepend(b)})</script>`;

export async function createSimulationPreview({ port = 3196, frontendPort = 3195 } = {}) {
  const sim = await createSimulation(); const data = await seedScenario(sim);
  await sim.prisma.member.update({ where: { id: data.chair.id }, data: { joinYear: 2026, joinMonth: 6 } });
  await sim.prisma.member.update({ where: { id: data.member.id }, data: { joinYear: 2026, joinMonth: 7 } });
  await sim.prisma.memberExperience.createMany({ data: [
    { memberId: data.chair.id, kind: "membership", level: "club", positionCode: "membership_joined", organizationName: data.ai.name, startYear: 2026, startMonth: 6, datePrecision: "month", isCurrent: true },
    { memberId: data.chair.id, kind: "position", level: "club", positionCode: "club_president", organizationName: data.ai.name, startYear: 2026, endYear: 2026, datePrecision: "lions_year", isCurrent: true },
  ] });
  const deletion = await seedScenario(sim, "delete-preview");
  await sim.prisma.adminRole.create({ data: { memberId: data.friend.id, role: "SUPER_ADMIN", scopeType: "GLOBAL" } });
  const pending = await sim.prisma.member.create({ data: { name: "模擬待審核會員", email: "pending-preview@example.test", status: "PENDING", organizationId: data.ai.id } });
  await sim.prisma.memberReport.create({ data: { reporterId: data.member.id, targetId: pending.id, reason: "模擬測試檢舉" } });
  await sim.prisma.eventRegistration.create({ data: { eventId: data.event.id, memberId: data.member.id } });
  await sim.prisma.eventNotification.create({ data: { eventId: data.event.id, senderId: data.chair.id, message: "模擬：歡迎參加活動，請記得攜帶手機。", recipients: { create: { recipientId: data.member.id } } } });
  const roles = { chair: data.chair, member: data.member, super: data.friend, deletion: deletion.member };
  const devices = new Map();
  const origin = `http://localhost:${port}`;
  function send(response, status, body, contentType = "application/json; charset=utf-8") {
    response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "X-Lionclub-Simulation": "isolated-real-routes" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  }
  const localOrigin = value => [`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(value);
  function device(request, response) {
    const existing = request.headers.cookie?.match(/(?:^|;\s*)lion_sim_device=([a-f0-9]{48})(?:;|$)/)?.[1];
    if (existing && devices.has(existing)) return devices.get(existing);
    if (devices.size >= 32) throw Error("Synthetic device limit reached; restart simulation");
    const id = crypto.randomBytes(24).toString("hex"), jar = sim.jar(); devices.set(id, jar);
    response.setHeader("Set-Cookie", `lion_sim_device=${id}; HttpOnly; SameSite=Strict; Path=/`); return jar;
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (!localOrigin(`http://${request.headers.host}`) || request.headers["next-action"]) return send(response, 403, { error: "Local simulation only" });
      const url = new URL(request.url, origin);
      if (/%2f|%5c|%00|\\/i.test(url.pathname)) return send(response, 400, { error: "Invalid path" });
      if (!["GET", "HEAD"].includes(request.method) && !localOrigin(request.headers.origin)) return send(response, 403, { error: "Local origin required" });
      if (url.pathname === "/__simulation") return send(response, 200, html(`<h1>隔離模擬驗收</h1><p>不寄真信、不連正式 DB。以下角色使用真實登入 API；資料於關閉服務後消失。請勿輸入個資或正式密碼。</p><p>測試密碼：SimulationPass42!</p>${Object.keys(roles).map(role => `<form method="post" action="/__simulation/login?role=${role}"><button>${({ chair: "分會長", member: "一般會員", super: "全域管理者", deletion: "歷史維護測試會員" })[role]}</button></form>`).join("")}<p><a href="/__simulation/inbox">假收件匣</a><a href="/register?token=${data.invite.token}&org=${data.ai.id}">掃描共用 QR 後的註冊</a><a href="/profile">個人頁面</a><a href="/events/${data.event.id}">模擬活動</a></p>`), "text/html; charset=utf-8");
      if (url.pathname === "/__simulation/inbox") return send(response, 200, html(`<h1>假收件匣</h1><a href="/__simulation">切換角色</a>${sim.inbox.slice(-100).reverse().map(mail => `<article><strong>${escape(mail.subject)}</strong><p>收件人：${escape(mail.to)}</p><pre>${escape(mail.text).replace(/https:\/\/simulation\.example\.test\/(verify-email|reset-password)\?token=([A-Za-z0-9_-]+)/g, (_, path, token) => `<a href="/${path}?token=${token}">開啟模擬${path === "verify-email" ? "驗證" : "重設"}連結</a>`)}</pre></article>`).join("") || "<p>目前沒有模擬信件</p>"}`), "text/html; charset=utf-8");
      if (url.pathname === "/__simulation/login" && request.method === "POST") {
        const person = roles[url.searchParams.get("role")]; if (!person) return send(response, 400, { error: "Unknown synthetic role" });
        const result = await sim.call("/api/auth/login", "POST", { email: person.email, password: "SimulationPass42!" }, device(request, response));
        if (result.status !== 200) return send(response, result.status, result.data);
        response.writeHead(303, { Location: "/profile" }); return response.end();
      }
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/simulation/info") return send(response, 200, { synthetic: true, inviteUrl: `${origin}/register?token=${data.invite.token}&org=${data.ai.id}`, eventId: data.event.id });
        if (url.pathname.includes("presign") || ["/api/me/avatar-upload", "/api/events/cover-upload"].includes(url.pathname)) return send(response, 501, { error: "模擬驗收不連真實儲存空間；上傳需在正式環境另行確認" });
        let raw = ""; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 131072) return send(response, 413, { error: "Request too large" }); }
        let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { return send(response, 400, { error: "Invalid JSON" }); }
        const result = await sim.call(url.pathname + url.search, request.method, body, device(request, response));
        if (sim.inbox.length > 100) sim.inbox.splice(0, sim.inbox.length - 100);
        if (result.headers?.get("Retry-After")) response.setHeader("Retry-After", result.headers.get("Retry-After"));
        return send(response, result.status, JSON.stringify(result.data).replaceAll(sim.origin, origin));
      }
      const extra = new Set(["/login", "/verify-email", "/forgot-password", "/reset-password", "/admin/reports", "/events/calendar", "/events/official-calendar", "/organizations", "/account/delete", "/privacy", "/terms", "/support"]);
      if (!["GET", "HEAD"].includes(request.method) || !isDemoFrontendPath(url.pathname) && !extra.has(url.pathname)) return send(response, 404, { error: "Not in local preview" });
      const headers = { host: `127.0.0.1:${frontendPort}`, "accept-encoding": "identity" };
      for (const key of ["accept", "accept-language", "user-agent", "rsc", "next-router-state-tree", "next-router-prefetch"]) if (request.headers[key]) headers[key] = request.headers[key];
      const upstream = http.request({ hostname: "127.0.0.1", port: frontendPort, path: url.pathname + url.search, method: request.method, headers, timeout: 10000 }, incoming => {
        const outputHeaders = { ...incoming.headers, "cache-control": "no-store" }; delete outputHeaders["set-cookie"];
        if (incoming.headers["content-type"]?.includes("text/html")) {
          const chunks = []; incoming.on("data", chunk => chunks.push(chunk)); incoming.on("end", () => { delete outputHeaders["content-length"]; delete outputHeaders["transfer-encoding"]; response.writeHead(incoming.statusCode ?? 502, outputHeaders); response.end(Buffer.concat(chunks).toString().replace("</body>", `${banner}</body>`)); });
        } else { response.writeHead(incoming.statusCode ?? 502, outputHeaders); incoming.pipe(response); }
      });
      upstream.on("timeout", () => upstream.destroy()); upstream.on("error", () => { if (!response.headersSent) send(response, 502, { error: "Local frontend unavailable" }); else response.end(); }); upstream.end();
    } catch (error) { const unknown = error.message?.startsWith("Unknown simulated route:"); console.error(unknown ? "SIMULATION_ROUTE_NOT_ALLOWED" : "SIMULATION_REQUEST_FAILED"); if (!response.headersSent) send(response, unknown ? 404 : 500, { error: "隔離模擬操作失敗，請查看本機測試記錄" }); else response.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, sim, async close() { await new Promise(resolve => server.close(resolve)); await sim.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const number = (name, fallback) => { const i = process.argv.indexOf(name); const value = i >= 0 ? Number(process.argv[i + 1]) : fallback; if (!Number.isInteger(value) || value < 1024 || value > 65535) throw Error("Invalid port"); return value; };
  const port = number("--port", 3196), frontendPort = number("--frontend-port", 3195);
  const app = await createSimulationPreview({ port, frontendPort });
  app.server.listen(port, "127.0.0.1", () => console.log(`Isolated simulation: http://localhost:${port}/__simulation`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await app.close(); process.exit(0); });
}
