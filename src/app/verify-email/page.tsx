"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailBody() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("驗證連結缺少驗證碼，請重新申請。");
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setStatus("ok");
        else {
          setStatus("error");
          setError(data.error ?? "驗證失敗");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("連線失敗，請稍後再試");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "loading") return <p className="text-sm text-lion-muted">驗證中…</p>;
  if (status === "ok")
    return (
      <>
        <p className="text-emerald-300">Email 已驗證成功。</p>
        <Link href="/home" className="mt-6 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 text-center">
          回到首頁
        </Link>
      </>
    );
  return (
    <>
      <p className="text-sm text-red-300">{error}</p>
      <Link href="/login" className="mt-6 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 text-center">
        前往登入
      </Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="app-canvas w-full bg-lion-canvas flex justify-center">
      <div className="w-full max-w-[480px] app-frame auth-frame bg-lion-page text-lion-cream flex flex-col justify-center px-8 py-12">
        <h1 className="text-2xl font-bold mb-7">Email 驗證</h1>
        <Suspense fallback={<p className="text-sm text-lion-muted">載入中…</p>}>
          <VerifyEmailBody />
        </Suspense>
      </div>
    </div>
  );
}
