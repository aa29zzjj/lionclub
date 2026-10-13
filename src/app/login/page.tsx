"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("請輸入帳號與密碼");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登入失敗，請再試一次");
        return;
      }
      router.push("/home");
      router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-canvas w-full bg-lion-canvas flex justify-center">
      <div className="w-full max-w-[480px] app-frame auth-frame bg-lion-page text-lion-cream flex flex-col justify-center px-8 py-12">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-full bg-white border-2 border-lion-gold flex items-center justify-center p-2 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lions-logo.svg" alt="Lions Clubs International" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-lion-cream tracking-wide">獅子會 App</h1>
          <p className="text-lion-cream/50 text-sm mt-1">LIONS CLUB MEMBER PORTAL</p>
          <p className="text-lion-gold/70 text-xs mt-3">展示帳號：demo@lions.tw ／ 密碼：demo1234</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-lion-muted mb-1 block">會員信箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lions.tw"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-lion-muted mb-1 block">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold transition-colors"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-lion-gold/80 hover:text-lion-gold">
              忘記密碼？
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 hover:bg-lion-actionHover transition-colors disabled:opacity-60"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </form>

        <p className="text-center text-xs text-lion-muted mt-8">
          還不是會員？
          <Link href="/register" className="text-lion-gold">
            掃描邀請 QR Code 加入
          </Link>
        </p>
      </div>
    </div>
  );
}
