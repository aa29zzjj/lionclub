"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) return setError("兩次密碼輸入不一致");
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const result = await response.json();
    if (response.ok) setComplete(true);
    else setError(result.error ?? "密碼重設失敗");
    setLoading(false);
  }

  if (!token) return <p className="text-sm text-red-300">重設連結缺少驗證碼，請重新申請。</p>;
  if (complete) return <><p className="text-emerald-300">密碼已更新，現在可以使用新密碼登入。</p><Link href="/login" className="mt-6 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 text-center">前往登入</Link></>;
  return <form onSubmit={submit} className="flex flex-col gap-4">
    <PasswordInput minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="新密碼（至少 8 個字元）" className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 outline-none focus:border-lion-gold" />
    <PasswordInput minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次輸入新密碼" className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 outline-none focus:border-lion-gold" />
    {error && <p className="text-sm text-red-300">{error}</p>}
    <button disabled={loading} className="rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 disabled:opacity-50">{loading ? "更新中…" : "更新密碼"}</button>
  </form>;
}

export default function ResetPasswordPage() {
  return <div className="app-canvas w-full bg-lion-canvas flex justify-center"><div className="w-full max-w-[480px] app-frame auth-frame bg-lion-page text-lion-cream flex flex-col justify-center px-8 py-12">
    <h1 className="text-2xl font-bold mb-7">設定新密碼</h1>
    <Suspense fallback={<p className="text-sm text-lion-muted">載入中…</p>}><ResetPasswordForm /></Suspense>
  </div></div>;
}
