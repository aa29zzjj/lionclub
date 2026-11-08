import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient, ApiError, type BlockedMember } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

export default function SecurityScreen() {
  const [blocked, setBlocked] = useState<BlockedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [revoking, setRevoking] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const unblockLock = useRef(false);
  const revokeLock = useRef(false);

  const load = useCallback(async () => {
    if (unblockLock.current) return;
    const attempt = ++generation.current, isCurrent = api.captureSessionGuard();
    setLoading(true); setReadError(null);
    try {
      const data = await api.getBlockedMembers();
      if (mounted.current && isCurrent() && generation.current === attempt) setBlocked(data);
    } catch (failure) {
      if (mounted.current && isCurrent() && generation.current === attempt) setReadError(failure instanceof ApiError ? failure.message : "封鎖名單尚未讀取完成，請重新讀取。");
    } finally { if (mounted.current && isCurrent() && generation.current === attempt) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; generation.current++; };
  }, [load]);

  async function handleUnblock(memberId: string) {
    if (unblockLock.current || revokeLock.current) return;
    unblockLock.current = true; generation.current++;
    const isCurrent = api.captureSessionGuard();
    setBusyId(memberId); setLoading(false); setError(null); setToast(null);
    try {
      await api.unblockMember(memberId);
      if (!mounted.current || !isCurrent()) return;
      setBlocked(current => current.filter(item => item.member.id !== memberId));
      setToast("已取消封鎖");
    } catch (failure) {
      if (mounted.current && isCurrent()) setError(failure instanceof ApiError ? failure.message : "取消封鎖結果尚未確認，請重新讀取名單。");
    } finally {
      unblockLock.current = false;
      if (mounted.current && isCurrent()) setBusyId(null);
    }
  }

  async function handleRevoke(event: React.FormEvent) {
    event.preventDefault();
    if (revokeLock.current || unblockLock.current || !password) return;
    revokeLock.current = true;
    const isCurrent = api.captureSessionGuard();
    setRevoking(true); setError(null); setToast(null);
    try {
      const result = await api.revokeOtherSessions(password);
      // A confirmed server-side loss of this session changes the local epoch.
      // Its result carries a guard for that exact ended session, not a later login.
      if (!mounted.current || !result.isCurrent()) return;
      setToast(result.message); setPassword("");
    } catch (failure) {
      const sameSession = failure instanceof ApiError && failure.isCurrentSession ? failure.isCurrentSession() : isCurrent();
      if (mounted.current && sameSession) {
        setError(failure instanceof ApiError ? failure.message : "登出結果尚未確認，請重新確認登入狀態；不會自動重送。");
      }
    } finally {
      revokeLock.current = false;
      if (mounted.current) setRevoking(false);
    }
  }

  return <div className="security-screen">
    {toast ? <div className="toast" role="status">{toast}</div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section>
      <h2 className="section-title">登出其他裝置</h2>
      <form onSubmit={handleRevoke} className="profile-form" style={{ gap: "0.6rem" }}>
        <label htmlFor="revoke-session-password">目前密碼</label>
        <input id="revoke-session-password" type="password" autoComplete="current-password" maxLength={200}
          disabled={revoking} placeholder="輸入目前密碼確認" value={password} onChange={event => setPassword(event.target.value)} />
        <button type="submit" className="primary" disabled={revoking || Boolean(busyId) || !password}>{revoking ? "處理中…" : "登出所有其他裝置"}</button>
      </form>
      <p className="member-meta" style={{ marginTop: "0.4rem" }}>此帳號若使用第三方登入（無密碼），請改到網站操作。</p>
    </section>
    <section style={{ marginTop: "1rem" }} aria-busy={loading}>
      <h2 className="section-title">封鎖名單</h2>
      {loading ? <p className="member-meta" role="status">讀取封鎖名單中…</p> : null}
      {readError ? <p className="error" role="alert">{readError}</p> : null}
      <button type="button" className="secondary" disabled={loading || Boolean(busyId) || revoking} onClick={() => void load()}>重新讀取封鎖名單</button>
      {!loading && !readError && blocked.length === 0 ? <p className="member-meta">目前沒有封鎖任何會員。</p> : null}
      <div className="list-stack">{blocked.map(item => <div key={item.member.id} className="list-card">
        <div className="list-card-main"><p className="list-card-title">{item.member.nickname || item.member.name}</p></div>
        <div className="list-card-actions">
          <button type="button" className="secondary" disabled={Boolean(busyId) || revoking} onClick={() => void handleUnblock(item.member.id)}>{busyId === item.member.id ? "處理中…" : "取消封鎖"}</button>
        </div>
      </div>)}</div>
    </section>
  </div>;
}
