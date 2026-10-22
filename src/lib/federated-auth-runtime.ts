import { getOAuthRuntimeSettings } from "./secrets";
import { FederatedAuthError, providerConfig, publicProviders, providerReauthAvailable } from "./federated-auth";
import type { AuthProvider } from "./federated-auth";

export async function resolveOAuthRuntimeSettings() {
  try { return await getOAuthRuntimeSettings(); }
  catch { throw new FederatedAuthError(503, "OAUTH_RUNTIME_UNAVAILABLE", "第三方登入安全設定暫時無法讀取，請稍後再試或使用既有登入方式"); }
}
export async function resolveProviderConfig(provider: AuthProvider) { return providerConfig(provider, await resolveOAuthRuntimeSettings()); }
export async function resolvePublicProviders() { return publicProviders(await resolveOAuthRuntimeSettings()); }
export async function resolveProviderReauthAvailable(provider: string) { return providerReauthAvailable(provider, await resolveOAuthRuntimeSettings()); }
export function configuredOAuthOrigin(settings: { OAUTH_APP_ORIGIN?: string; NEXT_PUBLIC_APP_URL?: string; NODE_ENV?: string }) {
  try {
    const value = settings.OAUTH_APP_ORIGIN || settings.NEXT_PUBLIC_APP_URL || "";
    if (value.trim() !== value) return null;
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.protocol !== "https:" && !(settings.NODE_ENV !== "production" && local && url.protocol === "http:")) return null;
    return url.origin;
  } catch { return null; }
}
export async function resolveOAuthOrigin() { return configuredOAuthOrigin(await resolveOAuthRuntimeSettings()); }
