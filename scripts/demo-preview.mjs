// Explicitly opt-in synthetic demo. This server is NOT part of the Next app.
// It never forwards APIs, credentials, writes or Server Actions to Next.js.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createDemoState, handleDemoApi } from "./demo-fixtures.mjs";

const pagePaths = new Set([
  "/home", "/profile", "/profile/experience", "/friends", "/events",
  "/notifications", "/register", "/admin/invites", "/admin/roles",
  "/admin/member-assignment", "/admin/pending-members", "/admin/pending-experiences",
]);

export function isDemoFrontendPath(pathname) {
  return pagePaths.has(pathname) || /^\/(members|events)\/[a-zA-Z0-9_-]+$/.test(pathname)
    || /^\/_next\/static\/[a-zA-Z0-9_.\/-]+$/.test(pathname)
    || pathname === "/icon.svg" || pathname === "/favicon.ico" || pathname === "/lions-logo.svg";
}

function send(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType, "Cache-Control": "no-store",
    "X-Lionclub-Demo": "synthetic-only", "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
  });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function demoBanner(role) {
  const label = role === "chair" ? "分會長測試" : "會員測試";
  // No production component, auth session or localStorage token is changed.
  // Mount outside the app after load so client-side navigation keeps the label.
  return `<script data-lionclub-demo>window.addEventListener('load',function(){
    const bar=document.createElement('aside');bar.id='lionclub-demo-bar';bar.setAttribute('aria-label','免登入合成資料測試');
    bar.innerHTML='<span>${label} · 合成資料</span><a href="/demo">測試說明</a><button type="button">重設</button>';
    bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;height:calc(48px + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);display:flex;align-items:center;justify-content:center;gap:12px;background:#103b58;color:#fff;font:12px system-ui;box-shadow:0 2px 8px #0002';
    bar.querySelector('a').style.cssText='color:#ffe09b;text-decoration:underline;min-height:40px;display:flex;align-items:center';
    const button=bar.querySelector('button');button.style.cssText='background:transparent;color:#ffe09b;border:1px solid #7990a0;border-radius:8px;padding:4px 8px;min-height:44px';
    button.addEventListener('click',async function(){if(!confirm('重設兩個網址共用的合成測試資料？這不會影響正式會員。'))return;button.disabled=true;try{const r=await fetch('/api/demo/reset',{method:'POST'});if(!r.ok)throw Error();location.href='/profile';}catch{button.disabled=false;alert('重設失敗，請稍後再試。');}});
    document.body.append(bar);document.body.style.paddingTop='calc(48px + env(safe-area-inset-top,0px))';
    const style=document.createElement('style');style.textContent='.app-canvas,.app-frame{min-height:calc(100dvh - 48px - env(safe-area-inset-top,0px))!important}';document.head.append(style);
  });</script>`;
}

function guidePage(role) {
  const chair = role === "chair";
  const links = chair ? [
    ["/admin/invites", "1. 產生共用邀請 QR", "同一張 QR 可供多人掃描，立即開通；可選短效註冊期限。"],
    ["/admin/member-assignment", "2. 核對會員與分會分派", "選測試會員、填原因並確認。另一個會員網址重整後會反映。"],
    ["/admin/pending-members", "3. 審核舊制待審會員", "舊制 PENDING 才需審核；這次新註冊不必等此審核。"],
    ["/admin/pending-experiences", "4. 審核會員資歷", "會員端新增待審資歷，這裡可通過或退回。"],
    ["/admin/roles", "5. 指派幹部權限", "資歷不等於系統權限；本測試會長模擬獲兩個分會的授權。"],
  ] : [
    ["/profile", "1. 編輯個人資料", "不必登入，已模擬台科大 AI 的新會員；可查看待分派提示。"],
    ["/profile/experience", "2. 新增資歷與送審", "新增任職、選擇組織，並於分會長網址測試審核。"],
    ["/friends", "3. 好友與個人頁面", "開啟合成好友、測試好友 QR／邀請；無真實聯絡資料。"],
    ["/events", "4. 活動與報名", "測試報名／取消，不會寄信或通知真實會員。"],
    ["/admin/member-assignment", "5. 驗證權限隔離", "一般會員進入管理頁應顯示無權限；API 也會拒絕。"],
  ];
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${chair ? "分會長" : "會員"}測試入口｜Lionclub</title><style>
    :root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}*{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#183248}.page{max-width:600px;margin:auto;padding:32px 22px 70px}.badge{font-size:12px;background:#e6c965;color:#12314d;border-radius:8px;padding:6px 10px;display:inline-block}h1{font-size:27px;margin:20px 0 12px}p{font-size:14px;line-height:1.8;color:#52677b}.notice{padding:14px 16px;background:#e6eef4;border-radius:14px}.card{display:block;color:inherit;text-decoration:none;background:white;padding:18px;border:1px solid #d7e0e7;border-radius:16px;margin:14px 0}.card h2{font-size:17px;margin:0 0 8px}.card p{margin:0}.start{display:block;text-align:center;color:white;background:#103b58;border-radius:12px;padding:14px;text-decoration:none;margin-top:24px}button{font:inherit;border:1px solid #bbc9d3;background:transparent;color:inherit;border-radius:10px;min-height:44px;padding:10px 14px;margin-top:10px}@media(prefers-color-scheme:dark){body{background:#081521;color:#f2f5f7}.card{background:#112535;border-color:#30465a}.notice{background:#142d41}p{color:#b5c5d2}}
  </style></head><body><main class="page">
    <span class="badge">免登入 · 僅合成測試資料</span><h1>${chair ? "分會長管理測試" : "會員操作測試"}</h1>
    <p>這是本次「共用 QR 加入台科大 AI、立即試用、後續核對分會」更新的操作體驗，使用目前的實際前端頁面。</p>
    <div class="notice"><p>不連正式資料庫，不會寄信、建立真實帳號或影響正式會員。請勿輸入個資或正式密碼。兩個入口共用合成資料，其他測試者的操作會反映；可按「重設」重來。網址暫時由本機提供，電腦／隧道停止後將失效。</p>
      ${chair ? "<p>這個測試角色對兩個合成分會各有會長授權，不代表一般會長可管理所有分會。</p>" : "<p>一般會員不能產生管理邀請、審核或分派；不需實際登入。</p>"}
    </div>
    <a class="start" href="/profile">直接進入${chair ? "分會長" : "會員"}個人頁面 →</a>
    ${links.map(([url, title, description]) => `<a class="card" href="${url}"><h2>${title} →</h2><p>${description}</p></a>`).join("")}
    <a class="card" id="demo-qr-link" href="/register"><h2>加測共同邀請 QR 註冊 →</h2><p>相當於掃描目前有效的合成 QR。使用假姓名、example.test 信箱及測試密碼。送出後，會員入口會切換到新建合成會員；邀請不代表正式獅子會會籍已核實。</p></a>
    <button type="button" id="reset">重設共用測試資料</button><p id="status" role="status"></p></main>
    <script>
      async function loadInvite(){try{const r=await fetch('/api/demo/info');const d=await r.json();const a=document.getElementById('demo-qr-link');if(d.demoInviteUrl)a.href=d.demoInviteUrl;else{a.removeAttribute('href');a.setAttribute('aria-disabled','true');document.getElementById('status').textContent='共同邀請已失效，請會長產生新 QR 或重設資料';}}catch{document.getElementById('status').textContent='邀請載入失敗，請重新整理';}}
      loadInvite();
      document.getElementById('reset').onclick=async function(){if(!confirm('重設共用的合成資料？正式資料不受影響。'))return;this.disabled=true;try{const r=await fetch('/api/demo/reset',{method:'POST'});document.getElementById('status').textContent=r.ok?'測試資料已重設，請重新進入頁面。':'重設失敗，請稍後重試';if(r.ok)await loadInvite();}catch{document.getElementById('status').textContent='連線失敗'}this.disabled=false};
    </script></body></html>`;
}

export function createDemoServer({ role, state, frontendPort = 3102, origins = {}, originsFile }) {
  if (!["chair", "member"].includes(role)) throw new Error("Explicit synthetic demo role required");
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Lionclub-Demo", `synthetic-only; role=${role}`);
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        let configuredOrigins = origins;
        if (originsFile) {
          try { configuredOrigins = { ...origins, ...JSON.parse(await readFile(originsFile, "utf8")) }; } catch { /* local default */ }
        }
        await handleDemoApi(request, response, { state, role, publicOrigin: configuredOrigins[role] || `http://localhost:${role === "chair" ? 3103 : 3104}`, memberOrigin: configuredOrigins.member || "http://localhost:3104" });
        if (!response.writableEnded) send(response, 404, { error: "此 API 未開放於合成測試" });
        return;
      }
      // Do not expose server mutations, auth pages, files or image proxying.
      if (!["GET", "HEAD"].includes(request.method) || request.headers["next-action"]) {
        return send(response, 405, { error: "測試入口禁止轉送伺服器操作" });
      }
      if (url.pathname === "/" || ["/login", "/forgot-password", "/reset-password"].includes(url.pathname)) {
        response.writeHead(302, { Location: "/profile", "Cache-Control": "no-store" });
        return response.end();
      }
      if (url.pathname === "/demo") return send(response, 200, guidePage(role), "text/html; charset=utf-8");
      if (!isDemoFrontendPath(url.pathname)) return send(response, 404, { error: "此路徑不在測試範圍" });

      const headers = { host: `127.0.0.1:${frontendPort}`, "accept-encoding": "identity" };
      // Only headers needed to render this frontend, never internal override,
      // auth, middleware or forwarded routing headers supplied by a caller.
      for (const key of ["accept", "accept-language", "user-agent", "rsc", "next-router-state-tree", "next-router-prefetch"]) {
        if (request.headers[key]) headers[key] = request.headers[key];
      }
      const upstream = http.request({ hostname: "127.0.0.1", port: frontendPort, path: url.pathname + url.search, method: request.method, headers, timeout: 15000 }, upstreamResponse => {
        const upstreamHeaders = { ...upstreamResponse.headers, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff" };
        delete upstreamHeaders["set-cookie"];
        if (upstreamResponse.headers["content-type"]?.includes("text/html")) {
          const chunks = [];
          upstreamResponse.on("data", chunk => chunks.push(chunk));
          upstreamResponse.on("end", () => {
            delete upstreamHeaders["content-length"];
            delete upstreamHeaders["transfer-encoding"];
            const html = Buffer.concat(chunks).toString("utf8").replace("</body>", `${demoBanner(role)}</body>`);
            response.writeHead(upstreamResponse.statusCode ?? 502, upstreamHeaders);
            response.end(request.method === "HEAD" ? undefined : html);
          });
        } else {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamHeaders);
          upstreamResponse.pipe(response);
        }
      });
      upstream.on("timeout", () => upstream.destroy(new Error("Demo frontend timeout")));
      upstream.on("error", () => { if (!response.headersSent) send(response, 502, { error: "前端測試服務尚未啟動" }); else response.end(); });
      upstream.end();
    } catch {
      if (!response.headersSent) send(response, 500, { error: "合成測試操作失敗，請重設或稍後重試" });
      else response.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const originsFile = args.includes("--origins-file") ? args[args.indexOf("--origins-file") + 1] : undefined;
  const state = createDemoState();
  for (const [role, port] of [["chair", 3103], ["member", 3104]]) {
    createDemoServer({ role, state, originsFile }).listen(port, "127.0.0.1", () => console.log(`Synthetic ${role} demo: http://localhost:${port}/demo`));
  }
}
