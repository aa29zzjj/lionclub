import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
let build;
try {
  ({ build } = await import("esbuild"));
} catch {
  throw new Error("esbuild unavailable in this workspace.");
}

const API_BASE_URL = process.env.MOBILE_APP_API_BASE_URL ?? "https://lionclubsmembership.com";

const output = join(root, "dist");
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
  define: {
    "process.env.NODE_ENV": '"production"',
    API_BASE_URL: JSON.stringify(API_BASE_URL),
  },
});
await copyFile(join(root, "index.html"), join(output, "index.html"));
await copyFile(join(root, "src/styles.css"), join(output, "app.css"));
console.log(`Built mobile-app/dist against API_BASE_URL=${API_BASE_URL}`);
