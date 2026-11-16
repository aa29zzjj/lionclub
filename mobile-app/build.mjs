import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyCardOcr } from "../scripts/copy-card-ocr.mjs";

const root = dirname(fileURLToPath(import.meta.url));
let build;
try {
  ({ build } = await import("esbuild"));
} catch {
  throw new Error("esbuild unavailable in this workspace.");
}

const API_BASE_URL = process.env.MOBILE_APP_API_BASE_URL ?? "https://lionclubsmembership.com";

const reviewInput = process.env.MOBILE_APP_REVIEW_API_ORIGIN ?? "";
let reviewOrigin = "";
if (reviewInput) {
  const url = new URL(reviewInput);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+$/i.test(url.hostname) || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || url.origin === new URL(API_BASE_URL).origin) throw new Error("Review API must be a distinct HTTPS origin.");
  reviewOrigin = url.origin;
}

const nextPhase = process.env.NEXT_PUBLIC_NEXT_PHASE_ENABLED === "true";
const output = process.argv.includes("--web-preview") ? join(root, "../public/native-preview") : join(root, "dist");
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["src/main.tsx"],
  outfile: join(output, "app.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  target: ["ios15", "chrome100"],
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  loader: { ".png": "dataurl" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_NEXT_PHASE_ENABLED": JSON.stringify(String(nextPhase)),
    API_BASE_URL: JSON.stringify(API_BASE_URL),
    REVIEW_API_ORIGIN: JSON.stringify(reviewOrigin),
  },
});
if (nextPhase || reviewOrigin) {
  let html = await readFile(join(root, "index.html"), "utf8");
  if (nextPhase) html = html.replace("script-src 'self';", "script-src 'self' 'wasm-unsafe-eval';").replace("worker-src 'none'", "worker-src 'self'");
  if (reviewOrigin) html = html.replace("connect-src ", `connect-src ${reviewOrigin} `);
  await writeFile(join(output, "index.html"), html);
} else {
  await copyFile(join(root, "index.html"), join(output, "index.html"));
}
await writeFile(join(output, "app.css"), (await readFile(join(root, "src/styles.css"), "utf8")) + "\n" + (await readFile(join(root, "../src/components/service-hub.css"), "utf8")));
if (nextPhase) {
  await copyCardOcr(join(output, "card-ocr"));
  await writeFile(join(output, "app.css"), "\n" + await readFile(join(root, "../src/components/next-phase.css"), "utf8"), { flag: "a" });
} else {
  await rm(join(output, "card-ocr"), { recursive: true, force: true });
}
console.log(`Built mobile client against API_BASE_URL=${API_BASE_URL}`);
