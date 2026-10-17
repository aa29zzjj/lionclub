import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../mobile-client-spike/src/App";
import { SpikeError, createSessionController, createSyntheticTransport, createTransport, evaluateSyntheticQr, type SpikeTransport, type SyntheticMember } from "../mobile-client-spike/src/contract";

const member: SyntheticMember = { id: "synthetic-only", name: "合成人物", organization: "合成組織", synthetic: true };
const hasCode = (code: string) => (error: unknown) => error instanceof SpikeError && error.code === code;

test("default synthetic login → me → logout has no password/token and no persistent login", async () => {
  const transport = createTransport();
  assert.equal(transport.kind, "synthetic");
  await assert.rejects(transport.me(), hasCode("UNAUTHENTICATED"));
  await transport.login();
  const result = await transport.me();
  assert.equal(result.synthetic, true);
  assert.deepEqual(Object.keys(result).sort(), ["id", "name", "organization", "synthetic"]);
  await transport.logout();
  await assert.rejects(transport.me(), hasCode("UNAUTHENTICATED"));
  await assert.rejects(createTransport().me(), hasCode("UNAUTHENTICATED"));
});

test("real, production and unknown modes fail closed for every method", async () => {
  for (const mode of ["real", "production", "", "unknown"]) {
    const transport = createTransport(mode);
    assert.equal(transport.kind, "unconfigured");
    await assert.rejects(transport.login(), hasCode("UNCONFIGURED_TRANSPORT"));
    await assert.rejects(transport.me(), hasCode("UNCONFIGURED_TRANSPORT"));
    await assert.rejects(transport.logout(), hasCode("UNCONFIGURED_TRANSPORT"));
  }
  const controller = createSessionController(createTransport("real"));
  await controller.login();
  assert.equal(controller.getSnapshot().phase, "signed-out");
  assert.equal(controller.getSnapshot().member, null);
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().errorCode, "UNCONFIGURED_TRANSPORT");
});

test("controller confirms me after login and rejects non-synthetic member data", async () => {
  const calls: string[] = [];
  const transport: SpikeTransport = { kind: "synthetic", login: async () => { calls.push("login"); }, me: async () => { calls.push("me"); return member; }, logout: async () => ({ confirmation: "synthetic" }) };
  const controller = createSessionController(transport);
  await controller.login();
  assert.deepEqual(calls, ["login", "me"]);
  assert.equal(controller.getSnapshot().phase, "signed-in");
  const unsafe = createSessionController({ ...transport, me: async () => ({ ...member, synthetic: false } as unknown as SyntheticMember) });
  await unsafe.login();
  assert.equal(unsafe.getSnapshot().member, null);
  assert.equal(unsafe.getSnapshot().phase, "signed-out");
});

test("offline confirmation hides data, offline logout clears the synthetic identity", async () => {
  const transport = createSyntheticTransport();
  const controller = createSessionController(transport);
  await controller.login();
  transport.setOnline(false);
  await controller.refreshMe();
  assert.equal(controller.getSnapshot().phase, "offline-unverified");
  assert.equal(controller.getSnapshot().member, null);
  await controller.logout();
  assert.equal(controller.getSnapshot().phase, "signed-out");
  assert.match(controller.getSnapshot().message, /沒有正式伺服器登出/);
  transport.setOnline(true);
  await assert.rejects(transport.me(), hasCode("UNAUTHENTICATED"));
});

test("busy guard blocks duplicate login and late me cannot restore a logged-out screen", async () => {
  let finishMe!: (value: SyntheticMember) => void;
  let loginCalls = 0;
  const transport: SpikeTransport = { kind: "synthetic", login: async () => { loginCalls++; }, me: () => new Promise(resolve => { finishMe = resolve; }), logout: async () => ({ confirmation: "synthetic" }) };
  const controller = createSessionController(transport);
  const first = controller.login();
  await controller.login();
  await Promise.resolve();
  assert.equal(loginCalls, 1);
  assert.equal(controller.getSnapshot().busy, true);
  await controller.logout();
  finishMe(member); await first;
  assert.equal(controller.getSnapshot().phase, "signed-out");
  assert.equal(controller.getSnapshot().member, null);
  assert.equal(controller.getSnapshot().busy, false);
});

test("QR state previews distinguish permission, invalid, recognized and offline without mutations", () => {
  assert.equal(evaluateSyntheticQr("permission-denied").status, "denied");
  assert.equal(evaluateSyntheticQr("invalid").status, "invalid");
  assert.equal(evaluateSyntheticQr("sample").status, "recognized");
  assert.match(evaluateSyntheticQr("sample").message, /未新增好友、未完成報到/);
  assert.equal(evaluateSyntheticQr("sample", false).status, "offline");
  assert.match(evaluateSyntheticQr("sample", false).message, /不排隊送出/);
});

test("UI labels synthetic-only, has no password input, and static bundle CSP blocks connections", () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /LionClubs/);
  assert.match(html, /合成工程試作/);
  assert.match(html, /不是原生包／正式登入/);
  assert.doesNotMatch(html, /<input|<video|<form/);
  const source = (name: string) => readFileSync(new URL(`../mobile-client-spike/${name}`, import.meta.url), "utf8");
  assert.match(source("index.html"), /connect-src 'none'/);
  assert.doesNotMatch(source("src/App.tsx") + source("src/contract.ts"), /\bfetch\s*\(|getUserMedia\s*\(|localStorage\.|sessionStorage\.|document\.cookie/);
  assert.match(source("serve.mjs"), /camera=\(\), microphone=\(\)/);
  assert.match(source("serve.mjs"), /server\.listen\(port, "127\.0\.0\.1"/);
});
