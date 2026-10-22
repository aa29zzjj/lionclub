// Browser-only transport contract. No environment variables, server settings or tokens.
export type AuthProvider = "google" | "apple";
export type OAuthPurpose = "login" | "link" | "reauth";
export type PublicProvider = { id: AuthProvider; name: string; enabled: boolean; reasonCode?: string };
export type AuthMethods = {
  hasPassword: boolean; available: boolean;
  identities: { provider: AuthProvider; email: string | null; reauthAvailable: boolean; reauthReason?: string }[];
  reauthenticated: boolean; reauthActions: ("link" | "sessions")[];
};
export type PendingFederatedProfile = { pending: false } | { pending: true; provider: AuthProvider; email: string; name?: string; hasInvite: boolean };
type Transport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const isProvider = (value: unknown): value is AuthProvider => value === "google" || value === "apple";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function oauthErrorMessage(code: string | null) {
  const messages: Record<string, string> = {
    PROVIDER_DISABLED: "此登入方式尚未啟用，請使用原有登入方式，或稍後重新確認設定。",
    OAUTH_CONFIGURATION_UNAVAILABLE: "登入設定暫時無法取得，請稍後再試；尚未建立或連結帳號。",
    OAUTH_RUNTIME_UNAVAILABLE: "登入設定暫時無法取得，請稍後再試；尚未建立或連結帳號。",
    OAUTH_CANCELLED: "您已取消第三方登入，可重新選擇登入方式。",
    OAUTH_EXPIRED: "驗證已到期或已使用，請重新開始；尚未自動建立帳號。",
    ACCOUNT_LINK_REQUIRED: "此信箱已有帳號。請先以原有方式登入，再到「我的 → 登入方式」連結 Google，不會自動合併帳號。",
    IDENTITY_ALREADY_LINKED: "此第三方身分已連結其他帳號，未變更綁定。",
    PROVIDER_ALREADY_LINKED: "此帳號已有相同類型的登入方式，未取代原有連結。",
    ACCOUNT_UNAVAILABLE: "此帳號目前無法使用，請聯絡客服。",
    OAUTH_NOT_DEPLOYED: "第三方登入尚待完成資料庫部署，請先使用原有登入方式。",
    OAUTH_CONFLICT: "帳號或驗證狀態同時更新，請重新開始，不會自動重送。",
    PROVIDER_UNAVAILABLE: "Google／Apple 暫時無法完成驗證，請稍後重新開始。",
    PROVIDER_REAUTH_UNAVAILABLE: "此登入方式尚未提供可驗收的近期本人驗證，一般登入不受影響。",
    PROVIDER_FRESH_AUTH_REQUIRED: "尚未取得足夠的近期本人驗證，沒有執行安全操作；一般 Google 登入仍可使用。",
    REAUTH_REQUIRED: "請先以目前密碼或已啟用的本人驗證方式確認，再連結帳號。",
    LOGIN_REQUIRED: "請先登入本人帳號，再連結第三方登入。",
    SESSION_CHANGED: "目前登入狀態已更新，請先重新登入。",
    OAUTH_CONSENT_REQUIRED: "請先明確同意連結第三方身分資料。",
    INVITE_INVALID: "邀請已失效或名額已滿，請取得新的邀請 QR 後再試。",
    RATE_LIMITED: "嘗試次數過多，請等待後再操作。",
    OAUTH_NETWORK: "連線中斷或逾時，請重新確認。尚未確認結果，不會自動重送。",
    OAUTH_RESPONSE_INVALID: "登入服務回覆不完整，請稍後重新確認設定。",
  };
  return code ? messages[code] ?? "第三方驗證未完成，請重新開始；帳號與管理權限不會因此自動變更。" : "";
}

export class OAuthClientError extends Error {
  constructor(public code: string, public retryAfterSeconds?: number) { super(oauthErrorMessage(code)); }
}

async function jsonRequest(path: string, init: RequestInit, transport: Transport, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await transport(path, { ...init, credentials: "same-origin", cache: "no-store", signal: controller.signal });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = response.status === 429 ? "RATE_LIMITED" : object(data) && typeof data.code === "string" ? data.code : response.status === 401 ? "LOGIN_REQUIRED" : "OAUTH_RESPONSE_INVALID";
      const seconds = Number(response.headers.get("Retry-After"));
      throw new OAuthClientError(code, Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined);
    }
    if (!object(data)) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
    return data;
  } catch (error) { if (error instanceof OAuthClientError) throw error; throw new OAuthClientError("OAUTH_NETWORK"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

export async function readOAuthProviders(transport: Transport = fetch, signal?: AbortSignal): Promise<PublicProvider[]> {
  const data = await jsonRequest("/api/auth/providers", {}, transport, signal) as Record<string, unknown>;
  if (!Array.isArray(data.providers) || data.providers.length !== 2) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  const providers = data.providers.map((entry): PublicProvider => {
    if (!object(entry) || !isProvider(entry.id) || typeof entry.enabled !== "boolean") throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
    return { id: entry.id, name: entry.id === "google" ? "Google" : "Apple", enabled: entry.enabled,
      ...(typeof entry.reasonCode === "string" ? { reasonCode: entry.reasonCode } : {}) };
  });
  if (new Set(providers.map((entry) => entry.id)).size !== 2) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  return providers;
}

export async function readAuthMethods(transport: Transport = fetch, signal?: AbortSignal): Promise<AuthMethods> {
  const data = await jsonRequest("/api/me/auth-methods", {}, transport, signal) as Record<string, unknown>;
  if (typeof data.hasPassword !== "boolean" || !Array.isArray(data.identities)) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  const identities = data.identities.map((entry): AuthMethods["identities"][number] => {
    if (!object(entry) || !isProvider(entry.provider) || !(entry.email === null || typeof entry.email === "string" && entry.email.length <= 254)) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
    return { provider: entry.provider, email: entry.email, reauthAvailable: entry.reauthAvailable === true,
      ...(typeof entry.reauthReason === "string" ? { reauthReason: entry.reauthReason.slice(0, 200) } : {}) };
  });
  if (identities.length > 2 || new Set(identities.map((entry) => entry.provider)).size !== identities.length) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  const reauthActions = (Array.isArray(data.reauthActions) ? data.reauthActions : []).filter((value): value is "link" | "sessions" => value === "link" || value === "sessions");
  return { hasPassword: data.hasPassword, identities, available: data.available === true,
    reauthenticated: data.reauthenticated === true && reauthActions.length > 0, reauthActions };
}

export async function readPendingFederatedProfile(transport: Transport = fetch, signal?: AbortSignal): Promise<PendingFederatedProfile> {
  const data = await jsonRequest("/api/auth/oauth/pending", {}, transport, signal) as Record<string, unknown>;
  if (data.pending === false) return { pending: false };
  if (data.pending !== true || !isProvider(data.provider) || typeof data.email !== "string" || data.email.length > 254 || !data.email.includes("@")) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  return { pending: true, provider: data.provider, email: data.email, hasInvite: data.hasInvite === true,
    ...(typeof data.name === "string" ? { name: data.name.slice(0, 100) } : {}) };
}

export async function startFederatedLogin(provider: AuthProvider, input: { purpose: OAuthPurpose; token?: string; password?: string; oauthConsent?: boolean }, transport: Transport = fetch, signal?: AbortSignal): Promise<string> {
  const data = await jsonRequest(`/api/auth/oauth/${provider}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, transport, signal) as Record<string, unknown>;
  if (typeof data.authorizationUrl !== "string") throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  let url: URL;
  try { url = new URL(data.authorizationUrl); } catch { throw new OAuthClientError("OAUTH_RESPONSE_INVALID"); }
  const expected = provider === "google" ? ["accounts.google.com", "/o/oauth2/v2/auth"] : ["appleid.apple.com", "/auth/authorize"];
  if (url.protocol !== "https:" || url.hostname !== expected[0] || url.pathname !== expected[1] || url.port || url.username || url.password || url.hash) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
  return url.toString();
}

export async function cancelFederatedSignup(transport: Transport = fetch) {
  const data = await jsonRequest("/api/auth/oauth/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, transport) as Record<string, unknown>;
  if (data.ok !== true) throw new OAuthClientError("OAUTH_RESPONSE_INVALID");
}
