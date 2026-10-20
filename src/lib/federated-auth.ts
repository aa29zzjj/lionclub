import crypto from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import type { JWTVerifyGetKey, JWTPayload } from "jose";

export type AuthProvider = "google" | "apple";
export type OAuthPurpose = "login" | "link" | "reauth" | "delete";
export class FederatedAuthError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const OAUTH_DATA_VERSION = "2026-10-20";
export const randomOAuthSecret = () => crypto.randomBytes(32).toString("base64url");
export const hashOAuthSecret = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const validOAuthSecret = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const isAuthProvider = (value: string): value is AuthProvider => value === "google" || value === "apple";
type Environment = Record<string, string | undefined>;
export type ProviderConfig = { provider: AuthProvider; clientId: string; clientSecret?: string; origin: string; callback: string; teamId?: string; keyId?: string; privateKey?: string };

export function providerConfig(provider: AuthProvider, env: Environment = process.env): ProviderConfig | null {
  if (env.FEDERATED_AUTH_ENABLED !== "true") return null;
  let origin: URL;
  try { origin = new URL(env.NEXT_PUBLIC_APP_URL || ""); } catch { return null; }
  const local = ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
    || (origin.protocol !== "https:" && !(env.NODE_ENV !== "production" && local && origin.protocol === "http:"))) return null;
  const base = { provider, origin: origin.origin, callback: `${origin.origin}/api/auth/oauth/${provider}/callback` };
  if (provider === "google") {
    if (!env.GOOGLE_OAUTH_CLIENT_ID?.trim() || !env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()) return null;
    return { ...base, clientId: env.GOOGLE_OAUTH_CLIENT_ID.trim(), clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET };
  }
  // Apple uses form_post and requires a public HTTPS domain, not localhost/IP.
  if (env.APPLE_OAUTH_FRESH_REAUTH_ENABLED !== "true" || origin.protocol !== "https:" || local || /^[\d.:]+$/.test(origin.hostname)
    || !env.APPLE_OAUTH_CLIENT_ID?.trim() || !env.APPLE_OAUTH_TEAM_ID?.trim() || !env.APPLE_OAUTH_KEY_ID?.trim()
    || !env.APPLE_OAUTH_PRIVATE_KEY?.includes("PRIVATE KEY") || !validEncryptionKey(env.OAUTH_TOKEN_ENCRYPTION_KEY)) return null;
  return { ...base, clientId: env.APPLE_OAUTH_CLIENT_ID.trim(), teamId: env.APPLE_OAUTH_TEAM_ID,
    keyId: env.APPLE_OAUTH_KEY_ID, privateKey: env.APPLE_OAUTH_PRIVATE_KEY.replace(/\\n/g, "\n") };
}
export function publicProviders(env: Environment = process.env) {
  return (["google", "apple"] as const).map(id => ({ id, name: id === "apple" ? "Apple" : "Google", enabled: Boolean(providerConfig(id, env)),
    ...(!providerConfig(id, env) ? { reason: "尚未完成服務設定，目前不能使用" } : {}) }));
}
export function providerReauthAvailable(provider: string, env: Environment = process.env) {
  return isAuthProvider(provider) && Boolean(providerConfig(provider, env)) && (provider === "google" || env.APPLE_OAUTH_FRESH_REAUTH_ENABLED === "true");
}
export function verifyFreshProviderAuthentication(payload: JWTPayload, startedAt: Date, now = new Date()) {
  const authTime = payload.auth_time;
  const seconds = Math.floor(now.getTime() / 1000);
  if (typeof authTime !== "number" || !Number.isSafeInteger(authTime) || authTime > seconds + 30 || authTime < seconds - 300
    || authTime < Math.floor(startedAt.getTime() / 1000) - 60) {
    throw new FederatedAuthError(401, "PROVIDER_FRESH_AUTH_REQUIRED", "供應商未證明最近重新登入，尚未完成安全驗證；請重新開始或使用其他已連結的驗證方式");
  }
}
export function authorizationUrl(config: ProviderConfig, state: string, nonce: string, verifier: string, purpose: OAuthPurpose) {
  const url = new URL(config.provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://appleid.apple.com/auth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, state, nonce,
    response_type: config.provider === "apple" ? "code id_token" : "code",
    scope: config.provider === "google" ? "openid email profile" : "name email", response_mode: config.provider === "apple" ? "form_post" : "query" }).toString();
  if (config.provider === "google") {
    url.searchParams.set("code_challenge", crypto.createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    if (purpose === "reauth" || purpose === "delete") {
      url.searchParams.set("max_age", "0");
      url.searchParams.set("claims", JSON.stringify({ id_token: { auth_time: { essential: true } } }));
    }
  }
  // Apple does not advertise PKCE: hybrid signed c_hash + nonce binds its code.
  return url.toString();
}
const jwks = {
  google: createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 }),
  apple: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), { timeoutDuration: 5000 }),
};
export type VerifiedProvider = { subject: string; email: string; name?: string; payload: JWTPayload };
export async function verifyProviderToken(token: string, config: ProviderConfig, nonce: string,
  options: { key?: JWTVerifyGetKey | CryptoKey; now?: Date; code?: string; requireCodeHash?: boolean } = {},
): Promise<VerifiedProvider> {
  const { payload } = await jwtVerify(token, options.key ?? jwks[config.provider], {
    issuer: config.provider === "google" ? ["https://accounts.google.com", "accounts.google.com"] : "https://appleid.apple.com",
    audience: config.clientId, algorithms: ["RS256"], requiredClaims: ["sub", "iat", "exp", "nonce", "email", "email_verified"],
    clockTolerance: 30, currentDate: options.now,
  });
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (payload.nonce !== nonce || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255
    || typeof payload.email !== "string" || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
    || !(payload.email_verified === true || payload.email_verified === "true")
    || typeof payload.iat !== "number" || payload.iat > now + 30 || payload.iat < now - 600
    || payload.azp !== undefined && payload.azp !== config.clientId) throw new FederatedAuthError(400, "PROVIDER_TOKEN_INVALID", "第三方身分驗證失敗，請重新開始");
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) throw new FederatedAuthError(400, "PROVIDER_TOKEN_INVALID", "第三方身分驗證失敗");
  if (options.requireCodeHash) {
    const expected = crypto.createHash("sha256").update(options.code || "").digest().subarray(0, 16).toString("base64url");
    if (payload.c_hash !== expected) throw new FederatedAuthError(400, "CODE_BINDING_INVALID", "第三方授權碼不相符，請重新開始");
  }
  return { subject: payload.sub, email: payload.email.trim().toLowerCase(), name: typeof payload.name === "string" ? payload.name.slice(0, 100) : undefined, payload };
}
async function appleClientSecret(config: ProviderConfig) {
  const key = await importPKCS8(config.privateKey!, "ES256");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: config.keyId! }).setIssuer(config.teamId!).setSubject(config.clientId)
    .setAudience("https://appleid.apple.com").setIssuedAt().setExpirationTime("5m").sign(key);
}
async function postProvider(url: string, body: URLSearchParams, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new FederatedAuthError(503, "PROVIDER_UNAVAILABLE", "第三方驗證暫時無法完成，請重新開始或稍後再試");
  return response;
}
export async function exchangeProviderCode(config: ProviderConfig, code: string, verifier: string | null, fetcher: typeof fetch = fetch) {
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.provider === "apple" ? await appleClientSecret(config) : config.clientSecret!,
    code, redirect_uri: config.callback, grant_type: "authorization_code" });
  if (config.provider === "google") body.set("code_verifier", verifier || "");
  const response = await postProvider(config.provider === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", body, fetcher);
  const tokens = await response.json() as { id_token?: unknown; refresh_token?: unknown };
  if (typeof tokens.id_token !== "string" || tokens.id_token.length > 16000) throw new FederatedAuthError(400, "PROVIDER_TOKEN_INVALID", "第三方未回傳有效身分資訊");
  return { idToken: tokens.id_token, refreshToken: typeof tokens.refresh_token === "string" ? tokens.refresh_token : undefined };
}
function validEncryptionKey(value?: string) { return Boolean(value && /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, "base64").length === 32); }
export function encryptProviderToken(token: string, encodedKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY) {
  if (!validEncryptionKey(encodedKey)) throw new FederatedAuthError(503, "TOKEN_STORAGE_UNCONFIGURED", "第三方帳號安全儲存尚未設定");
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(encodedKey!, "base64"), iv);
  cipher.setAAD(Buffer.from("lionclub:apple-refresh:v1"));
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
export function decryptProviderToken(ciphertext: string, encodedKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY) {
  if (!validEncryptionKey(encodedKey)) throw new FederatedAuthError(503, "TOKEN_STORAGE_UNCONFIGURED", "第三方撤銷服務尚未設定");
  const [version, iv, tag, value, extra] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !value || extra) throw new Error("TOKEN_CIPHERTEXT_INVALID");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(encodedKey!, "base64"), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from("lionclub:apple-refresh:v1")); decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8");
}
export async function revokeAppleToken(ciphertext: string, config: ProviderConfig, fetcher: typeof fetch = fetch) {
  await postProvider("https://appleid.apple.com/auth/revoke", new URLSearchParams({ client_id: config.clientId,
    client_secret: await appleClientSecret(config), token: decryptProviderToken(ciphertext), token_type_hint: "refresh_token" }), fetcher);
}
