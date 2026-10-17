// Uses only already-installed dependencies. No npx, package install or environment loading.
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
let build;
try { ({ build } = await import("esbuild")); }
catch { throw new Error("Existing esbuild unavailable; do not download tools. Deliver contract modules/tests only."); }
const output = join(root, "dist");
await mkdir(output, { recursive: true });
const result = await build({
  absWorkingDir: root, entryPoints: ["src/main.tsx"], outfile: join(output, "app.js"),
  bundle: true, platform: "browser", format: "iife", jsx: "automatic", target: ["safari15", "chrome100"],
  minify: true, sourcemap: false, legalComments: "eof", metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
const unsafe = Object.keys(result.metafile.inputs).some(path => /(?:^|\/)(?:\.env[^/]*|prisma|secrets|private-data)(?:\/|$)|(?:^|\/)@aws-sdk\//.test(path));
if (unsafe) throw new Error("Unexpected server/private build input; do not distribute this build.");
await copyFile(join(root, "index.html"), join(output, "index.html"));
console.log("Built local synthetic assets: mobile-client-spike/dist/{index.html,app.js,app.css}. No native package or API connection.");
