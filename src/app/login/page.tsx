"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("請輸入帳號與密碼");
      return;
    }
    setError("");
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push("/home");
    }, 500);
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-6 px-2 bg-[#e9ebf1]">
      <div className="relative w-full max-w-[420px] h-[860px] max-h-[92vh] bg-gradient-to-b from-lion-navy to-lion-navyDeep rounded-[2.5rem] shadow-2xl overflow-hidden border-8 border-black/80 flex flex-col">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-5 bg-black rounded-b-xl z-20" />

        <div className="flex-1 flex flex-col justify-center px-8">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 rounded-full bg-lion-gold/15 border-2 border-lion-gold flex items-center justify-center text-3xl mb-4">
              🦁
            </div>
            <h1 className="text-2xl font-bold text-lion-cream tracking-wide">獅子會 App</h1>
            <p className="text-lion-cream/50 text-sm mt-1">LIONS CLUB MEMBER PORTAL</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-lion-cream/60 mb-1 block">會員信箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lions.tw"
                className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-lion-cream/60 mb-1 block">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-lion-cream placeholder:text-lion-cream/30 outline-none focus:border-lion-gold transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end">
              <button type="button" className="text-xs text-lion-gold/80 hover:text-lion-gold">
                忘記密碼？
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-3 hover:bg-lion-goldLight transition-colors disabled:opacity-60"
            >
              {loading ? "登入中..." : "登入"}
            </button>
          </form>

          <p className="text-center text-xs text-lion-cream/40 mt-8">
            還不是會員？<span className="text-lion-gold">請洽所屬分會申請帳號</span>
          </p>
        </div>
      </div>
    </div>
  );
}
