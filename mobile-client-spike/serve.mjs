// Loopback-only static preview. No proxy, API route, write handler or external request.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "dist");
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !/^\d{4,5}$/.test(args[0]))) throw new Error("Usage: node mobile-client-spike/serve.mjs [port]");
const port = Number(args[0] ?? 3137);
if (port < 1024 || port > 65535) throw new Error("Use a local port between 1024 and 65535");
const files = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/index.html", ["index.html", "text/html; charset=utf-8"]], ["/app.js", ["app.js", "text/javascript; charset=utf-8"]], ["/app.css", ["app.css", "text/css; charset=utf-8"]]]);
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { Allow: "GET, HEAD" }); response.end("Static preview only"); return; }
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const file = files.get(pathname);
  if (!file) { response.writeHead(404); response.end("No API or requested file in synthetic preview"); return; }
  try {
    const data = await readFile(join(root, file[0]));
    response.writeHead(200, { "Content-Type": file[1] }); response.end(request.method === "HEAD" ? undefined : data);
  } catch { response.writeHead(503); response.end("Build local assets first; no dependency downloads are performed."); }
});
server.listen(port, "127.0.0.1", () => console.log(`Synthetic client only: http://127.0.0.1:${port} (Ctrl+C to stop). Not a native app or production login.`));
server.on("error", (error) => { console.error(`Local preview unavailable (${error.code ?? "UNKNOWN"}); check loopback permission or the chosen port.`); process.exitCode = 1; });
