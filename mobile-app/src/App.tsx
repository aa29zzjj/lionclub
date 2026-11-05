import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { App as NativeApp } from "@capacitor/app";
import { createApiClient, ApiError, nativeOAuthAvailable, type Member, type OAuthProvider } from "./contract";
import Shell from "./Shell";
import HomeScreen from "./HomeScreen";
import FriendsScreen from "./FriendsScreen";
import EventsScreen from "./EventsScreen";
import NotificationsScreen from "./NotificationsScreen";
import MyScreen from "./MyScreen";
import { useMobilePush } from "./NotificationSettings";
import logoAsset from "./lions-logo.png";
// Next.js's repo-wide "*.png" ambient type says StaticImageData, but esbuild's
// dataurl loader actually emits a plain string at runtime.
const logo = logoAsset as unknown as string;

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type Phase = "checking" | "signed-out" | "signed-in" | "offline";

export default function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [member, setMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);
  const [notificationNavigationRevision, setNotificationNavigationRevision] = useState(0);
  const oauthAvailable = nativeOAuthAvailable();
  const loadGeneration = useRef(0);
  const openPushNotifications = useCallback(() => setNotificationNavigationRevision(value => value + 1), []);
  const push = useMobilePush(phase === "signed-in" ? member?.id ?? null : null, api, openPushNotifications);

  const loadMe = useCallback(async () => {
    const attempt = ++loadGeneration.current;
    try {
      const result = await api.me();
      if (loadGeneration.current !== attempt) return;
      setMember(result);
      setPhase("signed-in");
    } catch (failure) {
      if (loadGeneration.current !== attempt) return;
      setMember(null);
      setPhase(failure instanceof ApiError && failure.code === "UNAUTHENTICATED" ? "signed-out" : "offline");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (await api.hasStoredSession()) await loadMe();
        else setPhase("signed-out");
      } catch { setPhase("offline"); }
    })();
  }, [loadMe]);

  useEffect(() => {
    if (phase !== "signed-in") return;
    let active = true;
    const listener = NativeApp.addListener("appStateChange", event => {
      if (event.isActive && active) { setPhase("checking"); void loadMe(); }
    });
    return () => { active = false; void listener.then(handle => handle.remove()).catch(() => {}); };
  }, [phase, loadMe]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    loadGeneration.current++;
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
    if (!oauthAvailable) { setError("第三方登入尚未開放，請使用會員信箱與密碼登入。"); return; }
    if (busy || oauthBusy) return;
    loadGeneration.current++;
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
    loadGeneration.current++;
    setBusy(true);
    setAccountMessage(null);
    try {
      // Revoke this installation while its old account's bearer is still usable.
      const stopped = await push.disable();
      await api.logout();
      setMember(null);
      setPhase("signed-out");
      setSignedOutNotice(!stopped.serverConfirmed || !stopped.nativeConfirmed
        ? "已清除本機登入，但通知停用尚未全部確認。恢復連線後請重新確認；這不代表其他裝置或所有伺服器登入已撤銷。" : null);
    } catch {
      setAccountMessage("本機登入清除尚未確認，請稍後重試；不會假稱已登出。");
    } finally {
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

  if (phase === "offline") return <main className="screen">
    {brand}<h1>目前無法確認登入狀態</h1>
    <p role="status">會員資料已隱藏。連線或儲存未確認不代表已登出，不會自動重送任何操作。</p>
    {accountMessage && <p role="alert" className="error">{accountMessage}</p>}
    <button type="button" className="primary" disabled={busy} onClick={() => { setPhase("checking"); void loadMe(); }}>重新連線確認</button>
    <button type="button" className="secondary" disabled={busy} onClick={() => void handleLogout()}>登出此 App</button>
  </main>;

  if (phase === "signed-in" && member) {
    return (
      <Shell
        member={member}
        notificationNavigationRevision={notificationNavigationRevision}
        renderTab={(tab, m, setTab) => {
          if (tab === "home") return (
            <HomeScreen
              member={m}
              onOpenProfile={() => setTab("security")}
              onOpenNotifications={() => setTab("notifications")}
              onOpenFriends={() => setTab("friends")}
              onOpenEvents={() => setTab("events")}
            />
          );
          if (tab === "friends") return <FriendsScreen member={m} />;
          if (tab === "events") return <EventsScreen member={m} />;
          if (tab === "notifications") return <NotificationsScreen />;
          if (tab === "security") return <MyScreen member={m} onUpdated={setMember} onLogout={handleLogout} busy={busy} push={push} accountMessage={accountMessage} />;
          return null;
        }}
      />
    );
  }

  return (
    <main className="screen">
      {brand}
      {signedOutNotice && <p role="status" className="member-meta">{signedOutNotice}</p>}
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
      {oauthAvailable ? <div className="oauth-block">
        <p className="divider-text">或使用第三方帳號</p>
        <button type="button" className="secondary" onClick={() => handleOAuthLogin("google")} disabled={busy || Boolean(oauthBusy)}>
          {oauthBusy === "google" ? "正在開啟驗證…" : "使用 Google 繼續"}
        </button>
        <button type="button" className="secondary" onClick={() => handleOAuthLogin("apple")} disabled={busy || Boolean(oauthBusy)}>
          {oauthBusy === "apple" ? "正在開啟驗證…" : "使用 Apple 繼續"}
        </button>
      </div> : <p className="member-meta" role="status">第三方登入尚未開放，請使用會員信箱與密碼登入。</p>}
    </main>
  );
}
