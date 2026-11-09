export const NATIVE_OAUTH_REDIRECT_URI = "com.lionclubsmembership.app://oauth-callback";
export const NATIVE_OAUTH_TIMEOUT_MS = 5 * 60_000;
export const NATIVE_OAUTH_PROTOCOL_VERSION = 2;
const opaque = /^[A-Za-z0-9_-]{43}$/;

function base64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "", bits = 0, value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 6) { bits -= 6; output += alphabet[(value >>> bits) & 63]; }
  }
  if (bits) output += alphabet[(value << (6 - bits)) & 63];
  return output;
}

/** A fresh attempt lives only in memory. There is deliberately no fallback to
 * Math.random, a stored verifier, or the old unbound handoff protocol. */
export async function createNativeOAuthAttempt(crypto: Crypto = globalThis.crypto) {
  if (!crypto?.getRandomValues || !crypto.subtle?.digest) throw new Error("OAUTH_SECURE_RANDOM_UNAVAILABLE");
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return { state, codeVerifier, codeChallenge: base64Url(new Uint8Array(digest)) };
}

export function readNativeOAuthBootstrap(value: unknown, apiBase: string, state: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.protocolVersion !== NATIVE_OAUTH_PROTOCOL_VERSION || data.state !== state || !opaque.test(state)
    || typeof data.bootstrapUrl !== "string" || data.bootstrapUrl.length > 16000) return null;
  try {
    const url = new URL(data.bootstrapUrl), origin = new URL(apiBase);
    if (url.protocol !== "https:" || url.origin !== origin.origin || url.pathname !== "/api/mobile/auth/oauth/bootstrap"
      || url.username || url.password || url.hash || url.searchParams.getAll("token").length !== 1
      || !url.searchParams.get("token") || [...url.searchParams.keys()].some(key => key !== "token")) return null;
    return url.toString();
  } catch { return null; }
}

export type NativeOAuthResult = { code?: string; error?: string };
type ListenerHandle = { remove(): Promise<void> };

/** Ignore other attempts, including legacy and duplicate/missing state. A
 * matching attempt still needs the server's atomic one-use + S256 exchange. */
export function readNativeOAuthCallback(value: string, expectedState: string): NativeOAuthResult | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const target = new URL(NATIVE_OAUTH_REDIRECT_URI);
  if (url.protocol !== target.protocol || url.host !== target.host || url.pathname !== target.pathname
    || url.username || url.password || url.hash) return null;
  const states = url.searchParams.getAll("state"), versions = url.searchParams.getAll("protocolVersion");
  if (!opaque.test(expectedState) || states.length !== 1 || states[0] !== expectedState
    || versions.length !== 1 || versions[0] !== "2") return null;
  if ([...url.searchParams.keys()].some(key => !["code", "error", "state", "protocolVersion"].includes(key))) return { error: "OAUTH_FAILED" };
  const codes = url.searchParams.getAll("code"), errors = url.searchParams.getAll("error");
  if (codes.length === 1 && errors.length === 0 && opaque.test(codes[0])) return { code: codes[0] };
  if (errors.length === 1 && codes.length === 0 && /^[A-Z_]{1,100}$/.test(errors[0])) return { error: errors[0] };
  return { error: "OAUTH_FAILED" };
}

export function nativeOAuthErrorMessage(error?: string): string {
  if (error === "OAUTH_CANCELLED") return "OAUTH_CANCELLED";
  if (error === "OAUTH_TIMEOUT") return "登入等待時間已結束，請重新開始。";
  if (error === "OAUTH_BROWSER_UNAVAILABLE") return "無法開啟登入視窗，請稍後再試。";
  if (error === "ACCOUNT_LINK_REQUIRED") return "請先用原有方式登入網站，連結第三方帳號後再回到 App 登入。";
  return "第三方登入未完成，請重新嘗試。";
}

type NativeOAuthOptions = {
  state: string;
  listenForUrl(callback: (url: string) => void): Promise<ListenerHandle>;
  listenForClose(callback: () => void): Promise<ListenerHandle>;
  openBrowser(): Promise<void>;
  closeBrowser(): Promise<void>;
  isCurrent(): boolean;
  timeoutMs?: number;
};

/** Register both listeners before opening. A failed/open-ended native call
 * cannot leave the login UI busy forever; late handles are also removed. */
export function waitForNativeOAuth(options: NativeOAuthOptions): Promise<NativeOAuthResult> {
  return new Promise(resolve => {
    let settled = false, openingStarted = false;
    const handles = new Set<ListenerHandle>();
    const remove = (handle: ListenerHandle) => {
      try { void Promise.resolve(handle.remove()).catch(() => {}); } catch { /* cleanup is best effort */ }
    };
    const close = () => {
      if (!openingStarted || !options.isCurrent()) return;
      try { void Promise.resolve(options.closeBrowser()).catch(() => {}); } catch { /* cleanup is best effort */ }
    };
    const finish = (result: NativeOAuthResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      for (const handle of handles) remove(handle);
      handles.clear();
      close();
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ error: "OAUTH_TIMEOUT" }), options.timeoutMs ?? NATIVE_OAUTH_TIMEOUT_MS);
    const register = async (add: () => Promise<ListenerHandle>) => {
      try {
        const handle = await add();
        if (settled) remove(handle);
        else handles.add(handle);
      } catch { finish({ error: "OAUTH_FAILED" }); }
    };
    const registrations = [
      register(() => options.listenForUrl(value => {
        if (!openingStarted) return;
        const result = readNativeOAuthCallback(value, options.state);
        if (result) finish(result);
      })),
      register(() => options.listenForClose(() => {
        if (openingStarted) finish({ error: "OAUTH_CANCELLED" });
      })),
    ];
    void Promise.all(registrations).then(async () => {
      if (settled) return;
      if (!options.isCurrent()) { finish({ error: "OAUTH_CANCELLED" }); return; }
      openingStarted = true;
      try {
        await options.openBrowser();
        if (settled) close();
      } catch { finish({ error: "OAUTH_BROWSER_UNAVAILABLE" }); }
    }).catch(() => finish({ error: "OAUTH_FAILED" }));
  });
}
