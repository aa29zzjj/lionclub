// Isolated visual candidate only. Does not sync Capacitor, change app IDs,
// provision, sign, install, start a server or upload anything.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const output = resolve(root, "tmp/native-ui-preview");
const mock = resolve(here, "mock-contract.ts");
const native = resolve(here, "native-stubs.ts");
const push = resolve(here, "push-stubs.ts");
const html = await readFile(resolve(here, "index.html"), "utf8");
if (!html.includes("connect-src 'none'") || !html.includes("img-src 'self' data:")) throw Error("PREVIEW_CSP_REQUIRED");
const result = await build({
  absWorkingDir: root, entryPoints: ["mobile-app/preview/main.tsx"],
  outfile: resolve(output, "app.js"), write: false, metafile: true,
  bundle: true, platform: "browser", format: "iife", jsx: "automatic", target: ["ios15"],
  minify: true, sourcemap: false, loader: { ".png": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"', API_BASE_URL: '"https://native-preview.invalid"' },
  plugins: [{ name: "isolated-native-preview", setup(builder) {
    builder.onResolve({ filter: /^\.\/contract$/ }, () => ({ path: mock }));
    builder.onResolve({ filter: /^\.\/native-push$/ }, () => ({ path: push }));
    builder.onResolve({ filter: /^@(?:capacitor|aparajita)\// }, (args) => {
      if (["@capacitor/browser", "@capacitor/camera", "@capacitor/app"].includes(args.path)) return { path: native };
      throw Error("REAL_NATIVE_PLUGIN_FORBIDDEN_IN_PREVIEW");
    });
  } }],
});
const inputs = Object.keys(result.metafile.inputs);
if (inputs.some(path => /mobile-app\/src\/(?:contract|native-push)\.ts$|node_modules\/@(?:capacitor|aparajita)\/|(?:^|\/)(?:prisma|secrets[^/]*|private-data)(?:\/|$)|@aws-sdk|\.env(?:\.|$)/.test(path))) throw Error("REAL_API_OR_PRIVATE_SOURCE_IN_PREVIEW");
const css = await readFile(resolve(root, "mobile-app/src/styles.css"), "utf8");
const previewCss = await readFile(resolve(here, "preview.css"), "utf8");
await mkdir(output, { recursive: true });
for (const file of result.outputFiles) await writeFile(file.path, file.contents);
await writeFile(resolve(output, "app.css"), css + "\n" + previewCss);
await copyFile(resolve(here, "index.html"), resolve(output, "index.html"));
await writeFile(resolve(output, "build-evidence.json"), JSON.stringify({
  mode: "isolated-native-ui-candidate-synthetic-only", output: relative(root, output),
  productionChanged: false, nativePermissions: false, networkAllowed: false,
  keychainAccess: false, credentialsIncluded: false, sources: inputs,
  mutations: "all-rejected", realAppSignedOutPreview: true,
  notificationFixtures: ["normal", "load-error", "malformed", "compose-error", "empty-friends", "render-error"],
  featureFixtures: ["normal", "event-scope", "event-settings-error", "event-options-invalid", "terms-required", "terms-read-error", "security-read-error", "security-malformed", "security-blocked", "browser-error", "pending-members"],
  termsAcceptance: "always-rejected", eventPublication: "always-rejected", moderation: "always-rejected",
  physicalDeviceAcceptance: false,
}, null, 2));
console.log("Built isolated native UI candidate in tmp/native-ui-preview; no real API, plugins, credentials or network access.");
