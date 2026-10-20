"use client";

import { useEffect, useState } from "react";

export type AuthProvider = "google" | "apple";
type Provider = { id: AuthProvider; name: string; enabled: boolean; reason?: string };
export type AuthMethods = { hasPassword: boolean; available?: boolean; identities: { provider: AuthProvider; email: string | null; reauthAvailable?: boolean; reauthReason?: string }[]; reauthenticated: boolean; reauthActions?: ("link" | "sessions" | "delete")[] };

export function useAuthMethods() {
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/me/auth-methods", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || typeof data.hasPassword !== "boolean" || !Array.isArray(data.identities)) throw new Error();
        if (!controller.signal.aborted) { setMethods(data); setError(""); }
      }).catch(() => { if (!controller.signal.aborted) setError("無法確認登入方式，請重新載入後再操作。"); });
    return () => controller.abort();
  }, [attempt]);
  return { methods, error, reload: () => { setMethods(null); setError(""); setAttempt((value) => value + 1); } };
}

export const oauthErrorMessage = (code: string | null) => {
  if (!code) return "";
  const messages: Record<string, string> = {
    PROVIDER_DISABLED: "此第三方登入尚未啟用，請使用原有登入方式。",
    OAUTH_CANCELLED: "您已取消第三方登入，可重新選擇登入方式。",
    OAUTH_EXPIRED: "第三方驗證已到期，請重新開始。",
    ACCOUNT_LINK_REQUIRED: "此信箱已有帳號。請先以原有方式登入，再到「我的 → 登入方式」連結，不會自動合併帳號。",
    IDENTITY_ALREADY_LINKED: "這個第三方身分已連結其他帳號，未變更綁定。",
    PROVIDER_ALREADY_LINKED: "此帳號已有相同類型的第三方登入，未取代原有連結。",
    ACCOUNT_UNAVAILABLE: "目前帳號不可登入，請聯絡客服。",
    OAUTH_NOT_DEPLOYED: "第三方登入尚待部署設定，請使用原有登入方式。",
  };
  return messages[code] ?? "第三方驗證未完成，請重新開始。帳號與權限不會因此自動變更。";
};

export default function FederatedAuthButtons({ purpose = "login", token, password, oauthConsent, allowedProviders, disabled = false }: {
  purpose?: "login" | "link" | "reauth" | "delete";
  token?: string; password?: string; oauthConsent?: boolean; allowedProviders?: AuthProvider[]; disabled?: boolean;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/providers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.providers)) throw new Error();
        if (!controller.signal.aborted) setProviders(data.providers.filter((item: Provider) => ["google", "apple"].includes(item.id)));
      }).catch(() => { if (!controller.signal.aborted) setError("第三方登入設定暫時無法確認，請使用原有方式或稍後重試。"); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, []);

  async function start(provider: AuthProvider) {
    if (busy || disabled) return;
    setBusy(provider); setError("");
    try {
      const response = await fetch(`/api/auth/oauth/${provider}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ purpose, ...(token ? { token } : {}), ...(password ? { password } : {}), ...(oauthConsent ? { oauthConsent: true } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "第三方登入未能開始，請稍後再試。");
      const url = new URL(data?.authorizationUrl);
      const expected = provider === "google" ? "accounts.google.com" : "appleid.apple.com";
      if (url.protocol !== "https:" || url.hostname !== expected || url.username || url.password) throw new Error("第三方登入網址無效，未開啟連結。");
      window.location.assign(url.toString());
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線失敗，請重新嘗試。");
      setBusy(null);
    }
  }

  const visible = providers.filter((provider) => !allowedProviders || allowedProviders.includes(provider.id));
  return <div className="space-y-2" aria-busy={Boolean(busy)}>
    {!loaded && <p role="status" className="text-sm text-lion-muted">確認 Apple／Google 登入設定中…</p>}
    {visible.map((provider) => <div key={provider.id}>
      <button type="button" disabled={disabled || !provider.enabled || Boolean(busy)} onClick={() => void start(provider.id)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-card px-4 py-3 text-base font-semibold disabled:opacity-50">
        {busy === provider.id ? "正在開啟驗證…" : `${purpose === "link" ? "連結" : purpose === "reauth" || purpose === "delete" ? "重新驗證" : "使用"} ${provider.name}${purpose === "login" ? " 繼續" : ""}`}
      </button>
      {!provider.enabled && <p className="mt-1 text-xs text-lion-muted">{provider.name} 尚未啟用；待管理者完成憑證與部署設定。</p>}
    </div>)}
    {error && <p role="alert" className="text-sm text-lion-danger">{error}</p>}
  </div>;
}
