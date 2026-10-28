"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";
import FederatedAuthButtons, { oauthErrorMessage } from "@/components/FederatedAuthButtons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetRequired, setResetRequired] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providerError = oauthErrorMessage(params.get("oauth_error"));
    if (providerError) { setError(providerError); return; }
    const reason = params.get("reason");
    if (reason === "sessions-revoked") setError("所有裝置的登入已撤銷，請重新登入。");
    else if (reason) setError("登入已到期或安全設定已更新，請重新登入後繼續。");
  }, []);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const busyRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!email || !password) {
      setError("請輸入帳號與密碼");
      return;
    }
    setError("");
    setResetRequired(false);
    busyRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetRequired(data.code === "PASSWORD_RESET_REQUIRED");
        setError(data.error ?? "登入失敗，請再試一次");
        return;
      }
      router.push("/home");
      router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="app-canvas w-full bg-lion-canvas flex justify-center">
      <div className="w-full max-w-[480px] app-frame auth-frame bg-lion-page text-lion-cream flex flex-col justify-center px-8 py-12">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-full bg-white border-2 border-lion-gold flex items-center justify-center p-2 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lions-logo.png" alt="Lions Clubs International" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-lion-cream tracking-wide">LionClubs</h1>
          <p className="text-lion-cream/50 text-sm mt-1">LIONS CLUB MEMBER PORTAL</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-busy={loading || oauthBusy}>
          <div>
            <label htmlFor="login-email" className="text-sm text-lion-muted mb-1 block">會員信箱</label>
            <input
              type="email"
              id="login-email"
              autoComplete="username"
              autoCapitalize="none"
              required
              disabled={loading || oauthBusy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lions.tw"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold transition-colors"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-sm text-lion-muted mb-1 block">密碼</label>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              required
              disabled={loading || oauthBusy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold transition-colors"
            />
          </div>

          {error && <p role="alert" className="text-base text-lion-danger">{error}</p>}
          {resetRequired && <Link href="/forgot-password" className="flex min-h-12 items-center justify-center rounded-xl border border-lion-border px-3 text-base font-semibold text-lion-gold">前往設定新密碼</Link>}

          <div className="flex justify-end">
            <Link href="/forgot-password" className="touch-link text-sm text-lion-gold hover:text-lion-gold">
              忘記密碼？
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading || oauthBusy}
            className="mt-2 w-full rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 hover:bg-lion-actionHover transition-colors disabled:opacity-60"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </form>

        <div className="mt-6 space-y-3"><p className="text-center text-sm text-lion-muted">或使用第三方帳號</p><FederatedAuthButtons disabled={loading} onBusyChange={(busy) => { busyRef.current = busy; setOauthBusy(busy); }} /><p className="text-xs leading-relaxed text-lion-muted">將前往已啟用的第三方授權。新會員仍需有效邀請，並確認資料與使用條款；不使用電話號碼登入。</p></div>
        <p className="text-center text-xs text-lion-muted mt-8">
          還不是會員？
          <Link href="/register" className="text-lion-gold">
            掃描邀請 QR Code 加入
          </Link>
        </p>

        <p className="text-center text-xs text-lion-muted mt-4 flex items-center justify-center gap-3">
          <Link href="/privacy" className="hover:text-lion-gold">隱私權政策</Link>
          <span aria-hidden="true">·</span>
          <Link href="/support" className="hover:text-lion-gold">客服／聯絡我們</Link>
        </p>
      </div>
    </div>
  );
}
