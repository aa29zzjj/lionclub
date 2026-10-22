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

test("privacy page discloses removed self-service deletion without inventing request acceptance", () => {
  const html = renderToStaticMarkup(React.createElement(PrivacyPage));
  assert.match(html, /id="deletion"/); assert.match(html, /目前無自助刪除帳號功能/);
  assert.match(html, /共享活動/); assert.match(html, /詢問不代表刪除申請已受理/);
  assert.match(html, /Apple 登入目前未啟用/); assert.doesNotMatch(html, /刪帳時須完成撤銷|Apple 可撤銷憑證經加密保存/);
  assert.doesNotMatch(html, /href="\/account\/delete"/);
});

test("public support retains password help but offers no deletion action or invented acceptance", () => {
  const html = renderToStaticMarkup(React.createElement(SupportPage));
  assert.doesNotMatch(html, /href="\/account\/delete"/); assert.match(html, /href="\/forgot-password"/);
  assert.match(html, /目前無自助刪除帳號功能/); assert.match(html, /不代表刪除申請已受理/);
  assert.match(html, /不假稱已受理案件/);
  if (!metadata.contacts.supportEmail && !metadata.contacts.privacyEmail) {
    assert.match(html, /沿用既有網站公開資訊/); assert.match(html, /仍待服務持有人確認/);
    assert.match(html, /href="mailto:jaijai0830@gmail\.com"/);
    assert.doesNotMatch(html, /3 個工作天/);
  }
  if (metadata.contacts.supportEmail) assert.ok(html.includes(`href="mailto:${metadata.contacts.supportEmail}"`));
  if (metadata.app.nameConfirmed) assert.doesNotMatch(html, /名稱及品牌資料待持有人確認/);
  assert.doesNotMatch(html, /3 個工作天/);
});

test("old deletion URL renders only a retirement notice, with no form or request action", () => {
  const html = renderToStaticMarkup(React.createElement(AccountDeletionPage));
  assert.ok(html.includes(metadata.app.name));
  assert.match(html, /此功能已移除/); assert.match(html, /不會刪除帳號、接受刪除申請/);
  assert.match(html, /不代表刪除申請已受理/);
  assert.doesNotMatch(html, /<form|<input|<button|本人刪除操作|正在確認登入狀態|確認刪除|deletion-action/);
  assert.doesNotMatch(html, /原生上架已完成/);
});
