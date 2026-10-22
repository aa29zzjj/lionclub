"use client";

import { useEffect, useState } from "react";
import FederatedAuthButtons, { oauthErrorMessage, useAuthMethods } from "./FederatedAuthButtons";
import PasswordInput from "./PasswordInput";

export default function LinkedIdentitySettings() {
  const { methods, error, reload } = useAuthMethods();
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNotice(oauthErrorMessage(params.get("oauth_error")) || (params.get("oauth") === "reauthenticated" ? "本人重新驗證完成，五分鐘內可確認安全操作。驗證本身不會改變會籍或管理權限。" : params.get("oauth") === "linked" ? "第三方登入已連結。" : ""));
  }, []);
  return <section className="mt-3 space-y-3 rounded-xl border border-lion-border p-3" aria-labelledby="linked-identities-title">
    <h3 id="linked-identities-title" className="font-semibold">登入方式</h3>
    <p className="text-sm text-lion-muted">Apple／Google 使用唯一第三方身分連結；相同信箱不會自動合併帳號。手機僅為選填聯絡資料，不提供電話登入。</p>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <><p role="alert" className="text-sm text-lion-danger">{error}</p><button type="button" onClick={reload} className="min-h-12 text-lion-gold underline">重新載入登入方式</button></>}
    {methods && <>
      <p className="text-sm">{methods.hasPassword ? "已設定 Email／密碼登入" : "使用第三方帳號登入，無本機密碼"}</p>
      {methods.identities.map((identity) => <p key={identity.provider} className="break-all text-sm">已連結 {identity.provider === "apple" ? "Apple" : "Google"}{identity.email ? ` · ${identity.email}` : ""}</p>)}
      {methods.available !== false && methods.identities.length < 2 && <>
        {methods.hasPassword ? <><label htmlFor="identity-link-password" className="block text-sm">連結前請確認目前密碼</label><PasswordInput id="identity-link-password" autoComplete="current-password" disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3" /></> : !methods.reauthActions?.includes("link") && <><p className="text-sm">連結另一種登入方式前，請先以已連結帳號重新驗證。</p><FederatedAuthButtons purpose="reauth" disabled={busy} onBusyChange={setBusy} allowedProviders={methods.identities.filter((identity) => identity.reauthAvailable !== false).map((identity) => identity.provider)} />{methods.identities.filter((identity) => identity.reauthAvailable === false).map((identity) => <p key={identity.provider} className="text-sm text-lion-muted">{identity.reauthReason || "此第三方本人重新驗證暫未可用，尚不能執行安全操作。"}</p>)}</>}
        <label className="flex min-h-12 items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} className="mt-1" /><span>我同意使用所選第三方的唯一識別碼與已驗證信箱，連結至此登入帳號；不會據此授予會籍或幹部權限。</span></label>
        <FederatedAuthButtons purpose="link" password={password} oauthConsent={consent} onBusyChange={setBusy} disabled={busy || !consent || (methods.hasPassword ? !password : !methods.reauthActions?.includes("link"))} allowedProviders={(["google", "apple"] as const).filter((provider) => !methods.identities.some((identity) => identity.provider === provider))} />
      </>}
      {methods.available === false && <p className="text-sm text-lion-muted">第三方登入目前未啟用或暫不可用；原有密碼登入與安全功能仍可使用。</p>}
    </>}
  </section>;
}
