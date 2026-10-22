"use client";

import { useEffect, useRef, useState } from "react";
import { OAuthClientError, readAuthMethods, readOAuthProviders, startFederatedLogin } from "@/lib/federated-auth-client";
import type { AuthMethods, AuthProvider, OAuthPurpose, PublicProvider } from "@/lib/federated-auth-client";
export { oauthErrorMessage } from "@/lib/federated-auth-client";
export type { AuthMethods, AuthProvider } from "@/lib/federated-auth-client";

export function useAuthMethods() {
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readAuthMethods(fetch, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setMethods(data); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setError("無法確認登入方式，請重新載入後再操作。"); });
    return () => controller.abort();
  }, [attempt]);
  return { methods, error, reload: () => { setMethods(null); setError(""); setAttempt((value) => value + 1); } };
}

export default function FederatedAuthButtons({ purpose = "login", token, password, oauthConsent, allowedProviders, disabled = false, onBusyChange }: {
  purpose?: OAuthPurpose; token?: string; password?: string; oauthConsent?: boolean;
  allowedProviders?: AuthProvider[]; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const starting = useRef(false);
  const startController = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number>();
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => () => { startController.current?.abort(); startController.current = null; starting.current = false; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setError("");
    void readOAuthProviders(fetch, controller.signal).then((data) => {
      if (!controller.signal.aborted) setProviders(data);
    }).catch((failure) => { if (!controller.signal.aborted) { setProviders([]); setError(failure instanceof OAuthClientError ? failure.message : "第三方登入設定暫時無法確認。"); } })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [attempt]);

  async function start(provider: AuthProvider) {
    if (starting.current || disabled || !providers.some((entry) => entry.id === provider && entry.enabled)) return;
    const controller = new AbortController(); startController.current = controller;
    starting.current = true; setBusy(provider); onBusyChange?.(true); setError(""); setRetryAfterSeconds(undefined);
    try {
      const url = await startFederatedLogin(provider, { purpose, ...(token ? { token } : {}), ...(password ? { password } : {}), ...(oauthConsent ? { oauthConsent: true } : {}) }, fetch, controller.signal);
      if (controller.signal.aborted || startController.current !== controller) return;
      window.location.assign(url);
    } catch (failure) {
      if (controller.signal.aborted || startController.current !== controller) return;
      setError(failure instanceof OAuthClientError ? failure.message : "連線失敗，請重新嘗試。");
      if (failure instanceof OAuthClientError) setRetryAfterSeconds(failure.retryAfterSeconds);
      starting.current = false; startController.current = null; setBusy(null); onBusyChange?.(false);
    }
  }

  const visible = providers.filter((provider) => !allowedProviders || allowedProviders.includes(provider.id));
  return <div className="space-y-2" aria-busy={!loaded || Boolean(busy)}>
    {!loaded && <p role="status" className="text-sm text-lion-muted">確認第三方登入設定中…</p>}
    {visible.map((provider) => <div key={provider.id}>
      <button type="button" disabled={disabled || !loaded || !provider.enabled || Boolean(busy)} onClick={() => void start(provider.id)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-card px-4 py-3 text-base font-semibold disabled:opacity-50">
        {busy === provider.id ? "正在開啟驗證…" : `${purpose === "link" ? "連結" : purpose === "reauth" ? "重新驗證" : "使用"} ${provider.name}${purpose === "login" ? " 繼續" : ""}`}
      </button>
      {!provider.enabled && <p className="mt-1 text-xs leading-relaxed text-lion-muted">{provider.name} 目前未啟用或設定暫不可用；可稍後重新確認，原有密碼登入仍可使用。</p>}
    </div>)}
    {error && <p role="alert" className="text-sm text-lion-danger">{error}</p>}
    {retryAfterSeconds && <p role="status" className="text-sm text-lion-muted">請至少等待 {retryAfterSeconds} 秒再試；不會自動重送。</p>}
    {loaded && !busy && (error || visible.some((provider) => !provider.enabled)) && <button type="button" disabled={disabled} onClick={() => setAttempt((value) => value + 1)} className="min-h-12 w-full rounded-xl border border-lion-border px-3 text-sm text-lion-gold disabled:opacity-50">重新確認登入設定</button>}
  </div>;
}
