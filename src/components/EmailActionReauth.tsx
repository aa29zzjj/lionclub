"use client";
import { useEffect, useRef, useState } from "react";
import { confirmEmailAction, requestEmailAction, type EmailAction, type EmailChallenge } from "@/lib/email-action-client";
type Props = { memberId: string; action: EmailAction; maskedEmail: string; disabled?: boolean; onVerified: () => void };
export default function EmailActionReauth(props: Props) { return <EmailActionContent key={`${props.memberId}:${props.action}`} {...props} />; }
function EmailActionContent({ memberId, action, maskedEmail, disabled, onVerified }: Props) {
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const mounted = useRef(false), lock = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  async function perform(verifying: boolean) {
    if (!mounted.current || disabled || lock.current || verifying && (!challenge || !/^[0-9]{6}$/.test(code))) return;
    const controller = new AbortController(); request.current = controller; lock.current = true; setBusy(true); setError("");
    const current = () => mounted.current && !controller.signal.aborted && request.current === controller;
    try {
      if (verifying && challenge) {
        await confirmEmailAction(memberId, action, challenge.challengeId, code, fetch, controller.signal);
        if (current()) { setCode(""); setChallenge(null); onVerified(); }
      } else {
        const result = await requestEmailAction(memberId, action, fetch, controller.signal);
        if (current()) { setChallenge(result); setCode(""); }
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : "本人驗證尚未確認，請稍後重新取得驗證碼。");
    } finally { lock.current = false; if (current()) setBusy(false); }
  }
  const description = action === "delete" ? "刪除帳號" : action === "sessions" ? "登出其他裝置" : "連結另一種登入方式";
  return <div className="space-y-2 rounded-xl border border-lion-border p-3" aria-label="既有信箱本人驗證" aria-busy={busy}>
    <p className="text-sm">可寄送一次性驗證碼至既有 Apple 驗證信箱 {challenge?.maskedEmail ?? maskedEmail}，僅用於本次「{description}」。此處不能更換收件信箱。</p>
    <button type="button" disabled={disabled || busy} onClick={() => void perform(false)} className="min-h-12 w-full rounded-xl border border-lion-border px-3 text-base disabled:opacity-50">{busy ? "確認中…" : challenge ? "重新取得驗證碼" : "寄送本人驗證碼"}</button>
    {challenge ? <>
      <label htmlFor={`email-action-code-${action}`} className="block text-sm">六位數驗證碼（10 分鐘內有效）</label>
      <input id={`email-action-code-${action}`} autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={code}
        disabled={disabled || busy} onChange={event => setCode(event.target.value)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 text-base" />
      <button type="button" disabled={disabled || busy || !/^[0-9]{6}$/.test(code)} onClick={() => void perform(true)} className="min-h-12 w-full rounded-xl bg-lion-action px-3 font-semibold text-lion-navyDeep disabled:opacity-50">確認驗證碼（不執行安全操作）</button>
    </> : null}
    <p className="text-sm text-lion-muted">完成後仍須另外確認「{description}」；驗證碼不會代為執行，也不代表 Apple 剛完成密碼或 Face ID 驗證。</p>
    {error ? <p role="alert" className="text-sm text-lion-danger">{error}</p> : null}
  </div>;
}
