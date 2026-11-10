import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

const compiled = build({ entryPoints: ["mobile-app/src/service-export.ts"], bundle: true, write: false, format: "cjs", platform: "node", external: ["@capacitor/core", "@capacitor/filesystem", "@capacitor/share"] }).then(r => r.outputFiles[0].text);
async function harness(options: { afterWrite?: () => void; shareFails?: boolean; android?: boolean } = {}) {
  const calls: { action: string; value: any }[] = [];
  const context = { module: { exports: {} as any }, exports: {}, crypto: { randomUUID }, require(name: string) {
    if (name === "@capacitor/core") return { Capacitor: { getPlatform: () => options.android ? "android" : "ios" } };
    if (name === "@capacitor/filesystem") return { Directory: { Cache: "CACHE" }, Encoding: { UTF8: "UTF8" }, Filesystem: {
      async readdir() { return { files: [] }; }, async rmdir() {},
      async writeFile(value: any) { calls.push({ action: "write", value }); options.afterWrite?.(); return { uri: `file:///private-cache/${value.path}` }; },
      async deleteFile(value: any) { calls.push({ action: "delete", value }); },
    } };
    if (name === "@capacitor/share") return { Share: { async share(value: any) { calls.push({ action: "share", value }); if (options.shareFails) throw Error("synthetic sensitive native error"); return {}; } } };
    throw Error("UNEXPECTED_MODULE");
  } };
  runInNewContext(await compiled, context);
  return { exportFile: context.module.exports.shareServiceFile, calls };
}
const file = { filename: "LionClubs-service-passport-2026.md", content: "合成個人服務紀錄" };
test("native export uses only its nonce-scoped private cache file and cleans after system sharing", async () => {
  const h = await harness(); await h.exportFile(file, () => true);
  assert.deepEqual(h.calls.map(c => c.action), ["write", "share", "delete"]);
  assert.equal(h.calls[0].value.directory, "CACHE"); assert.equal(h.calls[0].value.encoding, "UTF8");
  assert.match(h.calls[0].value.path, /^service-exports\/[0-9]{13}-[0-9a-f-]{36}\/LionClubs-service-passport-2026\.md$/);
  assert.equal(h.calls[2].value.path, h.calls[0].value.path);
  assert.equal(h.calls[1].value.files.length, 1); assert.equal(h.calls[1].value.url, undefined);
});
test("account replacement during file creation cannot open the share sheet; partial file is removed", async () => {
  let current = true; const h = await harness({ afterWrite() { current = false; } });
  await assert.rejects(h.exportFile(file, () => current), /EXPORT_UNCONFIRMED/);
  assert.deepEqual(h.calls.map(c => c.action), ["write", "delete"]);
});
test("cancelled sharing keeps errors generic and removes the file; invalid or stale inputs do not write", async () => {
  const h = await harness({ shareFails: true });
  await assert.rejects(h.exportFile(file, () => true), /^Error: EXPORT_UNCONFIRMED$/);
  assert.equal(h.calls.at(-1)?.action, "delete");
  const clean = await harness();
  await assert.rejects(clean.exportFile({ ...file, filename: "../../escape.md" }, () => true));
  await assert.rejects(clean.exportFile(file, () => false)); assert.equal(clean.calls.length, 0);
});

test("Android keeps the private cache file available after the chooser so the receiving app can read it", async () => { const h = await harness({ android: true }); await h.exportFile(file, () => true); assert.deepEqual(h.calls.map(c => c.action), ["write", "share"]); });
