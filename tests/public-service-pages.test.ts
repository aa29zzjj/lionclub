import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyPage from "../src/app/privacy/page";
import SupportPage from "../src/app/support/page";
import AccountDeletionPage from "../src/app/account/delete/page";
import metadata from "../docs/app-store/METADATA.zh-Hant.json";

// tsx's standalone test transform may use the classic JSX factory; Next.js uses
// its own compiler in production. No browser, cookies, DB or mail is accessed.
Object.assign(globalThis, { React });

test("privacy page discloses current deletion/retention limits rather than promising total immediate erasure", () => {
  const html = renderToStaticMarkup(React.createElement(PrivacyPage));
  assert.match(html, /id="deletion"/); assert.match(html, /六分鐘/);
  assert.match(html, /共享活動/); assert.match(html, /期限仍須營運方定案/);
  assert.match(html, /href="\/account\/delete"/);
});

test("public support gives functional deletion/password routes without inventing an inbound support channel", () => {
  const html = renderToStaticMarkup(React.createElement(SupportPage));
  assert.match(html, /href="\/account\/delete"/); assert.match(html, /href="\/forgot-password"/);
  assert.match(html, /不假稱已受理案件/);
  if (!metadata.contacts.supportEmail && !metadata.contacts.privacyEmail) {
    assert.match(html, /沿用既有網站公開資訊/); assert.match(html, /仍待服務持有人確認/);
    assert.match(html, /href="mailto:jaijai0830@gmail\.com"/);
    assert.doesNotMatch(html, /3 個工作天/);
  }
});

test("external deletion resource renders explanation and an identity-gated action, not only mailto instructions", () => {
  const html = renderToStaticMarkup(React.createElement(AccountDeletionPage));
  assert.ok(html.includes(metadata.app.name));
  assert.match(html, /本人刪除操作/); assert.match(html, /正在確認登入狀態/);
  assert.match(html, /未成功不得視為已送出申請/);
  assert.doesNotMatch(html, /href="mailto:/);
  assert.doesNotMatch(html, /原生上架已完成/);
});
