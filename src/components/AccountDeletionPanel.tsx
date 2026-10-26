"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deleteOwnAccount, loginForDeletion, readDeletionIdentity, type DeletionIdentity, type DeletionResult } from "@/app/account/delete/client";
import PasswordInput from "@/components/PasswordInput";
import FederatedAuthButtons, { useAuthMethods } from "@/components/FederatedAuthButtons";

export default function AccountDeletionPanel() {
  const [phase, setPhase] = useState<"checking" | "signed-out" | "signed-in" | "unavailable" | "deleted">("checking");
  const [identity, setIdentity] = useState<DeletionIdentity | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<DeletionResult | null>(null);
  const requestBusy = useRef(false);
  const generation = useRef(0);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const { methods, error: methodsError, reload: reloadMethods } = useAuthMethods();
  const canConfirm = methods?.hasPassword ? Boolean(password) : Boolean(methods?.reauthActions?.includes("delete"));

  useEffect(() => { if (phase === "deleted") successHeading.current?.focus(); }, [phase]);

  async function refreshIdentity() {
    const current = ++generation.current;
    setPhase("checking"); setError(""); setPassword(""); setUnderstood(false);
    try {
      const member = await readDeletionIdentity();
      if (current !== generation.current) return;
      setIdentity(member); setPhase(member ? "signed-in" : "signed-out");
      if (member) reloadMethods();
      if (outcome?.kind === "unknown") setNotice(member ? "目前登入仍有效。需要重送時，請重新閱讀並確認；尚未收到成功回覆，不會顯示刪除完成。" : "目前未登入。這不代表刪除已完成；請重新登入確認，或依既有分會聯絡方式尋求協助。");
      setOutcome(null);
    } catch {
      if (current !== generation.current) return;
      setIdentity(null); setPhase("unavailable"); setError(outcome?.kind === "unknown" ? "無法確認登入狀態，剛才的刪除結果仍未確認。請檢查網路，稍後再確認。" : "無法確認目前登入狀態，請檢查網路後重試；本次未自動送出刪除操作。");
    }
  }

  useEffect(() => {
    void refreshIdentity();
    return () => { generation.current++; };
    // Initial identity check only; destructive requests are never automatic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (requestBusy.current || !loginEmail || !loginPassword) return;
    requestBusy.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await loginForDeletion(loginEmail, loginPassword);
      const member = await readDeletionIdentity();
      if (!member) throw new Error("登入尚未確認，請重試；不會自動刪除帳號。");
      setIdentity(member); setPhase("signed-in"); setOutcome(null); setUnderstood(false);
      reloadMethods();
      setNotice("登入已確認。請核對下方帳號，閱讀刪除範圍後再次輸入密碼；登入本身不會刪除帳號。");
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "登入連線中斷，請稍後重試。");
    } finally { setLoginPassword(""); requestBusy.current = false; setBusy(false); }
  }

  async function signOut() {
    if (requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("登出未完成，請重新確認登入狀態。");
      setIdentity(null); setPhase("signed-out"); setPassword(""); setUnderstood(false); setOutcome(null); setNotice("已登出，請登入您要刪除的本人帳號。");
    } catch { setError("登出結果尚未確認，請重新確認登入狀態。"); }
    finally { requestBusy.current = false; setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (requestBusy.current || !identity || !canConfirm || !understood || outcome?.kind === "unknown") return;
    requestBusy.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await deleteOwnAccount(password, fetch, { federatedReauthenticated: !methods?.hasPassword && methods?.reauthActions?.includes("delete") });
      setOutcome(result);
      if (result.kind === "deleted") { setIdentity(null); setPhase("deleted"); setUnderstood(false); }
      else setError(result.kind === "rejected" && result.status === 409 ? `尚未完成刪除，也沒有建立待辦申請。${result.message}` : result.message);
    } finally { setPassword(""); setUnderstood(false); reloadMethods(); requestBusy.current = false; setBusy(false); }
  }

  const inputClass = "min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 text-base disabled:opacity-60";
  const secondaryClass = "inline-flex min-h-12 items-center justify-center rounded-xl border border-lion-border px-4 text-base disabled:opacity-50";

  if (phase === "deleted" && outcome?.kind === "deleted") return <section id="deletion-action" role="status" className="scroll-mt-4 rounded-2xl border border-lion-border bg-lion-card p-4">
    <h2 ref={successHeading} tabIndex={-1} className="text-lg font-bold">登入帳號已移除</h2>
    <p className="mt-3">您的登入帳號與私有檔案資料已由伺服器移除，其他裝置也不能再以此帳號存取會員功能。</p>
    <p className="mt-3">{outcome.cleanupPending ? "頭像檔案清理仍待排程或重試，並非所有儲存資料已立即清除。" : "伺服器回覆頭像清理已完成。"}共享活動、報到及受限稽核依下方說明保留；此訊息不代表所有歷史或備份都已刪除。</p>
    <Link href="/privacy#deletion" className="touch-link mt-3 inline-flex text-lion-gold underline">查看保留範圍</Link>
    <Link href="/login?reason=account-deleted" className={`${secondaryClass} mt-4 w-full`}>返回登入頁</Link>
  </section>;

  return <section id="deletion-action" aria-labelledby="deletion-action-title" aria-busy={busy || phase === "checking"} className="scroll-mt-4 rounded-2xl border border-lion-border bg-lion-card p-4">
    <h2 id="deletion-action-title" className="text-lg font-bold">本人刪除操作</h2>
    <p className="mt-2 text-sm text-lion-muted">可在此網站登入並操作，不需要重新安裝 App，也不會自動送出刪除。</p>
    {notice && <p role="status" className="mt-3 text-base">{notice}</p>}
    {phase === "checking" && <p role="status" className="mt-4">正在確認登入狀態…</p>}
    {error && <p role="alert" className="mt-4 break-words text-base text-lion-danger">{error}</p>}
    {phase === "unavailable" && <button type="button" className={`${secondaryClass} mt-4 w-full`} onClick={() => void refreshIdentity()}>重新確認登入狀態</button>}

    {phase === "signed-out" && <form onSubmit={login} className="mt-4 space-y-3">
      <p>先登入您要刪除的本人帳號。若忘記密碼，可先重設後再回到本頁。</p>
      <label htmlFor="deletion-login-email" className="block text-base font-medium">會員信箱</label>
      <input id="deletion-login-email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} disabled={busy} value={loginEmail} onChange={event => setLoginEmail(event.target.value)} className={inputClass} />
      <label htmlFor="deletion-login-password" className="block text-base font-medium">登入密碼</label>
      <PasswordInput id="deletion-login-password" autoComplete="current-password" required maxLength={200} disabled={busy} value={loginPassword} onChange={event => setLoginPassword(event.target.value)} className={inputClass} />
      <button type="submit" disabled={busy || !loginEmail || !loginPassword} className="min-h-12 w-full rounded-xl bg-lion-action px-4 text-base font-semibold text-lion-navyDeep disabled:opacity-50">{busy ? "確認登入中…" : "登入並繼續（不會立即刪除）"}</button>
      <Link className="touch-link inline-flex text-lion-gold underline" href="/forgot-password">忘記密碼／需要設定新密碼</Link>
      <p className="text-sm">以 Apple／Google 加入者，請先到登入頁使用原第三方帳號登入，再回本頁；登入不會自動刪除帳號。</p><Link href="/login" className={`${secondaryClass} w-full`}>前往 Apple／Google 登入</Link>
    </form>}

    {phase === "signed-in" && identity && <>
      <div className="mt-4 rounded-xl border border-lion-border bg-lion-page p-3"><p className="font-semibold">將操作的本人帳號</p><p className="mt-1 break-words">{identity.name}</p><p className="break-all">{identity.email || "尚未填寫信箱"}</p><button type="button" disabled={busy} onClick={() => void signOut()} className="touch-link mt-2 text-lion-gold underline">不是這個帳號？登出後重新登入</button></div>
      {outcome?.kind === "rejected" && outcome.status === 409 && <div className="mt-4 rounded-xl border border-lion-border p-3 text-base"><p>若仍有有效或預定幹部權限，請由另一位有權管理者先完成撤銷；若有未來主辦活動，請先安排接手或依活動管理規則處理，再回本頁確認。</p><p className="mt-2">本頁沒有建立待辦申請，也不保證交接時間。請透過既有分會聯絡方式協調，勿把密碼交給代辦人。</p><Link className="touch-link mt-2 inline-flex text-lion-gold underline" href="/events">前往活動</Link></div>}
      {outcome?.kind === "unknown" ? <button type="button" disabled={busy} onClick={() => void refreshIdentity()} className={`${secondaryClass} mt-4 w-full`}>重新確認登入狀態</button> : <form onSubmit={submit} className="mt-4 space-y-3">
        <p>此操作不可復原。會移除登入帳號、私有檔案、好友關係與本人資歷；共享活動、報到及受限稽核不會整批永久刪除。</p>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-lion-border p-3" htmlFor="deletion-understood"><input id="deletion-understood" type="checkbox" required disabled={busy} checked={understood} onChange={event => setUnderstood(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" /><span>我已閱讀刪除與保留範圍，了解此操作無法復原。</span></label>
        {methods?.hasPassword ? <><label htmlFor="deletion-confirm-password" className="block text-base font-medium">再次輸入目前密碼確認</label><PasswordInput id="deletion-confirm-password" autoComplete="current-password" required maxLength={200} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className={inputClass} /></> : methods ? <><FederatedAuthButtons purpose="delete" disabled={busy} allowedProviders={methods.identities.filter((item) => item.reauthAvailable !== false).map((item) => item.provider)} />{methods.identities.filter((item) => item.reauthAvailable === false).map((item) => <p key={item.provider} className="text-sm text-lion-muted">{item.reauthReason || "此第三方重新驗證暫未可用，尚未執行刪除，也未建立申請。"}</p>)}<p className="text-sm">{methods.reauthActions?.includes("delete") ? "本人驗證已完成；仍須勾選上方確認並按刪除，才會送出。" : "請先以已連結的第三方帳號重新驗證。返回後仍需閱讀並確認；驗證不會自動刪除帳號。"}</p></> : <p role="status">正在確認本人驗證方式…</p>}
        {methodsError && <><p role="alert" className="text-sm text-lion-danger">{methodsError}</p><button type="button" onClick={reloadMethods} className="min-h-12 text-lion-gold underline">重新載入驗證方式</button></>}
        <button type="submit" disabled={busy || !canConfirm || !understood} className="min-h-12 w-full rounded-xl bg-lion-danger px-4 text-base font-bold text-white disabled:opacity-50">{busy ? "刪除處理中，請勿重複操作…" : "確認刪除我的帳號"}</button>
        <p className="text-sm text-lion-muted">僅明確收到伺服器成功回覆才會顯示完成；發生連線中斷不會自動重送。尚有交接事項時，伺服器會拒絕刪除。</p>
      </form>}
      {outcome?.kind === "rejected" && outcome.retryAfterSeconds && <p className="mt-3 text-sm text-lion-muted">請至少等待 {outcome.retryAfterSeconds} 秒再試。</p>}
      {outcome?.kind === "rejected" && outcome.status === 401 && methods?.hasPassword && <Link href="/forgot-password" className="touch-link mt-3 inline-flex text-lion-gold underline">忘記密碼？先重設再回本頁</Link>}
      {outcome?.kind === "rejected" && [401, 404].includes(outcome.status) && <button type="button" disabled={busy} onClick={() => void refreshIdentity()} className={`${secondaryClass} mt-3 w-full`}>重新確認登入狀態</button>}
    </>}
  </section>;
}
