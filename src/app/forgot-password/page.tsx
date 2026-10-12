"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (response.ok) setMessage(result.message);
    else setError(result.error ?? "申請失敗，請稍後再試");
    setLoading(false);
  }

  return <div className="min-h-screen w-full bg-[#e9ebf1] flex justify-center"><div className="w-full max-w-[480px] min-h-screen bg-lion-navyDeep text-lion-cream flex flex-col justify-center px-8 py-12">
    <h1 className="text-2xl font-bold">忘記密碼</h1>
    <p className="mt-2 mb-7 text-sm text-lion-muted">輸入註冊信箱，我們會寄出 30 分鐘有效的重設連結。</p>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@lions.tw" className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 outline-none focus:border-lion-gold" />
      {message && <p className="text-sm text-emerald-300">{message}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button disabled={loading} className="rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-3 disabled:opacity-50">{loading ? "寄送中…" : "寄送重設信"}</button>
    </form>
    <Link href="/login" className="mt-6 text-center text-sm text-lion-gold">返回登入</Link>
  </div></div>;
}
