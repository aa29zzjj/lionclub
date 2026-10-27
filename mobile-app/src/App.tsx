import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createApiClient, ApiError, type Member } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type Phase = "checking" | "signed-out" | "signed-in";

export default function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [member, setMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const result = await api.me();
      setMember(result);
      setPhase("signed-in");
    } catch {
      setMember(null);
      setPhase("signed-out");
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (await api.hasStoredSession()) await loadMe();
      else setPhase("signed-out");
    })();
  }, [loadMe]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      await loadMe();
      setPassword("");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "登入失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await api.logout();
    } finally {
      setMember(null);
      setPhase("signed-out");
      setBusy(false);
    }
  }

  if (phase === "checking") {
    return (
      <main className="screen" aria-busy="true">
        <p>確認登入狀態中…</p>
      </main>
    );
  }

  if (phase === "signed-in" && member) {
    return (
      <main className="screen">
        <h1>LionClubs</h1>
        <p className="member-name">{member.name}</p>
        {member.memberNo ? <p className="member-meta">會員編號：{member.memberNo}</p> : null}
        <button type="button" className="primary" onClick={handleLogout} disabled={busy}>
          {busy ? "登出中…" : "登出"}
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1>LionClubs</h1>
      <form onSubmit={handleLogin}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          密碼
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "登入中…" : "登入"}
        </button>
      </form>
    </main>
  );
}
