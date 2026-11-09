import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Shell, { isNotificationNavigationRevision, type TabKey } from "../mobile-app/src/Shell";
import ScreenErrorBoundary from "../mobile-app/src/ScreenErrorBoundary";
import type { Member } from "../mobile-app/src/contract";

// These are static markup and component-state unit checks, not mounted browser,
// WKWebView, VoiceOver, keyboard, push or ErrorBoundary interaction acceptance.
Object.assign(globalThis, { React });
const member: Member = {
  id: "synthetic-ui-member", name: "介面測試會員", nickname: null,
  email: "native-ui@example.invalid", title: null, bio: null, phone: null,
  photoUrl: null, memberNo: null, joinYear: null, joinMonth: null,
  birthday: null, status: "ACTIVE", organization: null, tags: [],
  adminRoles: [], emailVerifiedAt: null,
};
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const markup = (initialTab?: TabKey) => renderToStaticMarkup(React.createElement(Shell, {
  member, initialTab,
  renderTab: (tab) => React.createElement("section", { "data-native-test-tab": tab }, "合成頁面內容"),
}));

test("native shell exposes five named vector-icon destinations with exactly one current page", () => {
  const html = markup();
  const nav = html.match(/<nav class="tab-bar" aria-label="主要功能切換">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  assert.equal([...nav.matchAll(/<button\b/g)].length, 5);
  assert.equal([...nav.matchAll(/<svg\b/g)].length, 5);
  assert.equal([...nav.matchAll(/aria-hidden="true"/g)].length, 5);
  assert.equal([...nav.matchAll(/aria-current="page"/g)].length, 1);
  assert.equal([...nav.matchAll(/aria-controls="native-tab-content"/g)].length, 5);
  for (const label of ["首頁", "好友", "活動", "通知", "我的"]) assert.ok(nav.includes(`>${label}</span>`));
  assert.match(html, /<main id="native-tab-content"[^>]*aria-label="首頁內容"/);
});

test("a trusted initial native tab is rendered, and unknown runtime tab values fall back to home", () => {
  assert.match(markup("notifications"), /data-native-test-tab="notifications"/);
  assert.match(markup("security"), /aria-label="我的內容"/);
  assert.match(markup("https://untrusted.example" as TabKey), /data-native-test-tab="home"/);
});

test("push navigation accepts only a positive local integer revision and is limited to the inbox", () => {
  for (const value of [1, 2, Number.MAX_SAFE_INTEGER]) assert.equal(isNotificationNavigationRevision(value), true);
  for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(isNotificationNavigationRevision(value), false);
  const shell = source("mobile-app/src/Shell.tsx");
  assert.match(shell, /if \(isNotificationNavigationRevision\(notificationNavigationRevision\)\) setTab\("notifications"\)/);
  assert.doesNotMatch(shell, /window\.location|location\.href|Browser\.open|eventId|memberId/);
});

test("native screen rendering is composed inside a resettable boundary while navigation remains outside", () => {
  const shell = source("mobile-app/src/Shell.tsx");
  assert.match(shell, /function ScreenContent[\s\S]*?renderTab\(tab, member, setTab\)/);
  assert.match(shell, /<ScreenErrorBoundary[^>]*>[\s\S]*?<ScreenContent[\s\S]*?<\/ScreenErrorBoundary>[\s\S]*?<\/main>[\s\S]*?<nav className="tab-bar"/);
  assert.match(shell, /key=\{`\$\{tab\}:\$\{notificationNavigationRevision\}`\}/);
});

test("boundary fallback contains no private child or error detail and requests only a screen reset", () => {
  const boundary = new ScreenErrorBoundary({
    screenName: "通知", children: React.createElement("p", null, "private-child-must-not-render"),
  });
  boundary.state = ScreenErrorBoundary.getDerivedStateFromError();
  assert.deepEqual(boundary.state, { hasError: true });
  const fallback = boundary.render();
  const html = renderToStaticMarkup(fallback);
  assert.match(html, /role="alert"/);
  assert.match(html, /通知暫時無法顯示/);
  assert.match(html, /重新載入本頁/);
  assert.match(html, /不會自動重送報名、發送或刪除操作/);
  assert.doesNotMatch(html, /private-child-must-not-render/);
  assert.ok(React.isValidElement(fallback));
  const children = (fallback.props as { children: React.ReactElement[] }).children;
  const button = children.at(-1)!;
  const updates: unknown[] = [];
  boundary.setState = ((update: unknown) => { updates.push(update); }) as typeof boundary.setState;
  (button.props as { onClick: () => void }).onClick();
  assert.deepEqual(updates, [{ hasError: false }]);
  assert.doesNotMatch(source("mobile-app/src/ScreenErrorBoundary.tsx"), /console\.(?:error|log)|fetch\(/);
});

test("native readability CSS preserves independent scrolling, comfortable targets and tablet/reduced-motion rules", () => {
  const css = source("mobile-app/src/styles.css");
  assert.match(css, /--native-caption-size:\s*max\(0\.875rem, 14px\)/);
  assert.match(css, /:focus-visible/);
  assert.ok(css.indexOf(":focus-visible") > css.lastIndexOf("outline: none"));
  assert.match(css, /\.screen\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.shell-content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.dashboard-bell\s*\{[^}]*width:\s*48px;[^}]*height:\s*48px;/);
  assert.match(css, /button\s*\{[^}]*min-height:\s*48px;[^}]*min-width:\s*48px;/);
  assert.match(css, /@media \(min-width:\s*768px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("native home describes the member QR as adding a friend, not proof of identity", () => {
  const home = source("mobile-app/src/HomeScreen.tsx");
  assert.match(home, /出示 QR Code，讓獅友掃描加好友/);
  assert.match(home, /aria-label="顯示加好友 QR Code"/);
  assert.match(home, /createFriendQrPayload\(member\.id\)/);
  assert.doesNotMatch(home, /資源媒合驗證身分|掃描條碼供活動報到/);
});
