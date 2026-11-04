import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type BlockedMember } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

export default function SecurityScreen() {
  const [blocked, setBlocked] = useState<BlockedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      setBlocked(await api.getBlockedMembers());
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "讀取封鎖名單失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUnblock(memberId: string) {
    setBusyId(memberId);
    try {
      await api.unblockMember(memberId);
      setBlocked((prev) => prev.filter((b) => b.member.id !== memberId));
      setToast("已取消封鎖");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "取消封鎖失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(event: React.FormEvent) {
    event.preventDefault();
    if (revoking || !password) return;
    setRevoking(true);
    setError(null);
    try {
      const result = await api.revokeOtherSessions(password);
      setToast(result.message);
      setPassword("");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "操作失敗，請再試一次");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="security-screen">
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <section>
        <h2 className="section-title">登出其他裝置</h2>
        <form onSubmit={handleRevoke} className="profile-form" style={{ gap: "0.6rem" }}>
          <input type="password" placeholder="輸入目前密碼確認" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="primary" disabled={revoking || !password}>{revoking ? "處理中…" : "登出所有其他裝置"}</button>
        </form>
        <p className="member-meta" style={{ marginTop: "0.4rem" }}>此帳號若使用第三方登入（無密碼），請改到網站操作。</p>
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h2 className="section-title">封鎖名單</h2>
        {loading ? <p className="member-meta">載入中…</p> : null}
        {!loading && blocked.length === 0 ? <p className="member-meta">目前沒有封鎖任何會員。</p> : null}
        <div className="list-stack">
          {blocked.map((b) => (
            <div key={b.member.id} className="list-card">
              <div className="list-card-main">
                <p className="list-card-title">{b.member.nickname || b.member.name}</p>
              </div>
              <div className="list-card-actions">
                <button type="button" className="secondary" disabled={busyId === b.member.id} onClick={() => handleUnblock(b.member.id)}>取消封鎖</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
