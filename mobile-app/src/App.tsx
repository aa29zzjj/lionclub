import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createApiClient, ApiError, type Member, type OAuthProvider } from "./contract";
import Shell from "./Shell";
import ProfileScreen from "./ProfileScreen";
import FriendsScreen from "./FriendsScreen";
import EventsScreen from "./EventsScreen";
import NotificationsScreen from "./NotificationsScreen";
import SecurityScreen from "./SecurityScreen";
import AdminScreen from "./AdminScreen";
import logoAsset from "./lions-logo.png";
// Next.js's repo-wide "*.png" ambient type says StaticImageData, but esbuild's
// dataurl loader actually emits a plain string at runtime.
const logo = logoAsset as unknown as string;

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type Phase = "checking" | "signed-out" | "signed-in";

export default function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [member, setMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
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

  async function handleOAuthLogin(provider: OAuthProvider) {
    if (busy || oauthBusy) return;
    setOauthBusy(provider);
    setError(null);
    try {
      await api.loginWithProvider(provider);
      await loadMe();
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.code === "UNAUTHENTICATED" && failure.message === "OAUTH_CANCELLED")) {
        setError(failure instanceof ApiError ? failure.message : `${provider === "google" ? "Google" : "Apple"} 登入失敗，請稍後再試`);
      }
    } finally {
      setOauthBusy(null);
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

  const brand = (
    <div className="brand">
      <span className="logo-badge">
        <img src={logo} alt="Lions Clubs International" />
      </span>
      <h1>LionClubs</h1>
      <p className="subtitle">LIONS CLUB MEMBER PORTAL</p>
    </div>
  );

  if (phase === "checking") {
    return (
      <main className="screen" aria-busy="true">
        {brand}
        <p>確認登入狀態中…</p>
      </main>
    );
  }

  if (phase === "signed-in" && member) {
    return (
      <Shell
        member={member}
        onLogout={handleLogout}
        busy={busy}
        renderTab={(tab, m) => {
          if (tab === "home") return <ProfileScreen member={m} onUpdated={setMember} />;
          if (tab === "friends") return <FriendsScreen member={m} />;
          if (tab === "events") return <EventsScreen member={m} />;
          if (tab === "notifications") return <NotificationsScreen />;
          if (tab === "security") return <SecurityScreen />;
          if (tab === "admin") return <AdminScreen member={m} />;
          return null;
        }}
      />
    );
  }

  return (
    <main className="screen">
      {brand}
      <form onSubmit={handleLogin}>
        <div>
          <label htmlFor="login-email">會員信箱</label>
          <input
            type="email"
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="you@lions.tw"
            required
          />
        </div>
        <div>
          <label htmlFor="login-password">密碼</label>
          <input
            type="password"
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={busy || Boolean(oauthBusy)}>
          {busy ? "登入中…" : "登入"}
        </button>
      </form>
      <div className="oauth-block">
        <p className="divider-text">或使用第三方帳號</p>
        <button type="button" className="secondary" onClick={() => handleOAuthLogin("google")} disabled={busy || Boolean(oauthBusy)}>
          {oauthBusy === "google" ? "正在開啟驗證…" : "使用 Google 繼續"}
        </button>
        <button type="button" className="secondary" onClick={() => handleOAuthLogin("apple")} disabled={busy || Boolean(oauthBusy)}>
          {oauthBusy === "apple" ? "正在開啟驗證…" : "使用 Apple 繼續"}
        </button>
      </div>
    </main>
  );
}
