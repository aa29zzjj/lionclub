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
import { attachForegroundListener, createForegroundRevalidator } from "./foreground-session";
import { createSessionEndController } from "./session-end-controller";
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
  const [endingSession, setEndingSession] = useState(false);
  const [foregroundRevalidating, setForegroundRevalidating] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);
  const [notificationNavigationRevision, setNotificationNavigationRevision] = useState(0);
  const oauthAvailable = nativeOAuthAvailable();
  const [providerLookup, setProviderLookup] = useState<{ status: "loading" | "ready" | "error"; providers: OAuthProvider[] }>({ status: "loading", providers: [] });
  const [providerAttempt, setProviderAttempt] = useState(0);
  const loadGeneration = useRef(0);
  const foregroundReady = useRef(false);
  foregroundReady.current = phase === "signed-in" && !busy && !endingSession;
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

  const sessionEnd = useRef<ReturnType<typeof createSessionEndController> | null>(null);
  if (!sessionEnd.current) sessionEnd.current = createSessionEndController({
    stopPush: push.disable,
    endSession: api.logout,
    errorGuard: failure => failure instanceof ApiError ? failure.isCurrentSession : undefined,
    onStart: () => {
      loadGeneration.current++;
      setBusy(true); setEndingSession(true); setAccountMessage(null);
    },
    onComplete: stopped => {
      loadGeneration.current++;
      setMember(null); setPhase("signed-out"); setPassword("");
      setSignedOutNotice(!stopped.serverConfirmed || !stopped.nativeConfirmed
        ? "已清除本機登入，但通知停用尚未全部確認。恢復連線後請重新確認；這不代表其他裝置或所有伺服器登入已撤銷。" : null);
    },
    onUnconfirmed: () => {
      loadGeneration.current++;
      setMember(null); setPhase("offline");
      setAccountMessage("本機登入清除尚未確認，會員資料已隱藏。請重試登出；不會假稱已完成。");
    },
    onOwnershipLost: () => {
      // The replacement may still be writing its credentials. Do not read an
      // incomplete pair and accidentally treat that new login as expired.
      loadGeneration.current++;
      setMember(null); setPhase("offline");
      setAccountMessage("登入狀態已更新，會員資料暫時隱藏。請完成登入後再按「重新連線確認」。");
    },
    onSettled: () => { setEndingSession(false); setBusy(false); },
  });
  const endCurrentSession = useCallback((isCurrent: () => boolean) => {
    return sessionEnd.current!.request(isCurrent).catch(() => {
      if (!isCurrent()) return;
      loadGeneration.current++;
      setMember(null); setPhase("offline"); setEndingSession(false); setBusy(false);
      setAccountMessage("登入清除尚未確認，會員資料已隱藏。請重新確認登入狀態。");
    });
  }, []);

  // Register before the cold-start read. Session loss belongs to the App,
  // including when the page that initiated the request has been left.
  useEffect(() => api.onSessionInvalidated(isCurrent => { void endCurrentSession(isCurrent); }), [endCurrentSession]);

  useEffect(() => {
    (async () => {
      try {
        if (await api.hasStoredSession()) await loadMe();
        else setPhase("signed-out");
      } catch { setPhase("offline"); }
    })();
  }, [loadMe]);

  useEffect(() => {
    if (phase !== "signed-out" || !oauthAvailable) return;
    let active = true;
    setProviderLookup({ status: "loading", providers: [] });
    void api.getOAuthProviders().then(providers => {
      if (active) setProviderLookup({ status: "ready", providers });
    }).catch(() => {
      if (active) setProviderLookup({ status: "error", providers: [] });
    });
    return () => { active = false; };
  }, [phase, oauthAvailable, providerAttempt]);

  useEffect(() => {
    if (phase !== "signed-in" || !member || busy || endingSession) {
      setForegroundRevalidating(false);
      return;
    }
    const foreground = createForegroundRevalidator({
      memberId: member.id,
      getMember: () => api.me(),
      captureSessionGuard: api.captureSessionGuard,
      getGeneration: () => loadGeneration.current,
      advanceGeneration: () => ++loadGeneration.current,
      isReady: () => foregroundReady.current,
      onPending: setForegroundRevalidating,
      onVerified: setMember,
      onUnavailable: failure => {
        setMember(null);
        setPhase(failure instanceof ApiError && failure.code === "UNAUTHENTICATED" ? "signed-out" : "offline");
      },
    });
    const detach = attachForegroundListener({
      addListener: listener => NativeApp.addListener("appStateChange", listener),
      onState: foreground.handleState,
      onUnavailable: foreground.unavailable,
    });
    return () => { foreground.dispose(); detach(); };
  }, [phase, member?.id, busy, endingSession]);

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
    if (!oauthAvailable || providerLookup.status !== "ready" || !providerLookup.providers.includes(provider)) {
      setError("此登入方式尚未確認可用，請重新確認或使用會員信箱與密碼登入。"); return;
    }
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
    await endCurrentSession(api.captureSessionGuard());
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

  if (endingSession) return <main className="screen" aria-busy="true">{brand}<p role="status">正在結束此裝置登入…</p></main>;

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
      <div aria-busy={foregroundRevalidating} style={{ height: "100%", minHeight: 0 }}>
      <div hidden={foregroundRevalidating} aria-hidden={foregroundRevalidating || undefined}
        style={{ height: "100%", minHeight: 0, ...(foregroundRevalidating ? { display: "none", pointerEvents: "none" as const } : {}) }}>
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
          if (tab === "notifications") return <NotificationsScreen onOpenProfile={() => setTab("security")} />;
          if (tab === "security") return <MyScreen member={m} onUpdated={setMember} onLogout={handleLogout} busy={busy} push={push} accountMessage={accountMessage} />;
          return null;
        }}
      />
      </div>
      {foregroundRevalidating && <main className="screen" aria-busy="true">
        {brand}<p role="status">正在重新確認登入狀態…</p>
        <p className="member-meta">會員畫面暫時隱藏，未送出的草稿仍保留；不會自動重送任何操作。</p>
      </main>}
      </div>
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
      {oauthAvailable && providerLookup.status === "ready" && providerLookup.providers.length > 0 ? <div className="oauth-block">
        <p className="divider-text">或使用第三方帳號</p>
        {providerLookup.providers.includes("google") && <button type="button" className="secondary" onClick={() => handleOAuthLogin("google")} disabled={busy || Boolean(oauthBusy)}>
          {oauthBusy === "google" ? "正在開啟驗證…" : "使用 Google 繼續"}
        </button>}
        {providerLookup.providers.includes("apple") && <button type="button" className="secondary" onClick={() => handleOAuthLogin("apple")} disabled={busy || Boolean(oauthBusy)}>
          {oauthBusy === "apple" ? "正在開啟驗證…" : "使用 Apple 繼續"}
        </button>}
      </div> : (!oauthAvailable || providerLookup.status === "ready") ? <p className="member-meta" role="status">第三方登入尚未開放，請使用會員信箱與密碼登入。</p> : null}
      {oauthAvailable && providerLookup.status === "loading" && <p role="status" className="member-meta">正在確認其他登入方式；您仍可使用會員信箱與密碼登入。</p>}
      {oauthAvailable && providerLookup.status === "error" && <div>
        <p role="status" className="member-meta">目前無法確認其他登入方式，請重新確認或使用會員信箱與密碼登入。</p>
        <button type="button" className="secondary" disabled={busy || Boolean(oauthBusy)} onClick={() => setProviderAttempt(value => value + 1)}>重新確認登入方式</button>
      </div>}
    </main>
  );
}
