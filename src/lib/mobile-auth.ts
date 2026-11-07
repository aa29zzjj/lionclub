import { SignJWT, jwtVerify } from "jose";
import { isProductionDemoEmail, isProductionDemoUser } from "./auth-session";
import type { SessionPayload, SessionUser } from "./auth-session";

/** Native app auth (Candidate B): bearer tokens instead of the web's HttpOnly cookie.
 * Not CSRF-exposed like the cookie flow, so it does not use isTrustedBrowserMutation().
 * Short access token bounds leak exposure; both types share the web session's
 * sessionVersion revocation, so "登出其他裝置" already invalidates mobile tokens too. */
export const MOBILE_ACCESS_TOKEN_DURATION_SECONDS = 15 * 60;
export const MOBILE_REFRESH_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 90;

type MobileTokenType = "mobile_access" | "mobile_refresh";

async function signMobileToken(payload: SessionPayload, key: Uint8Array, typ: MobileTokenType, durationSeconds: number) {
  return new SignJWT({ ...payload, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${durationSeconds}s`)
    .sign(key);
}

export function signMobileAccessToken(payload: SessionPayload, key: Uint8Array) {
  return signMobileToken(payload, key, "mobile_access", MOBILE_ACCESS_TOKEN_DURATION_SECONDS);
}

export function signMobileRefreshToken(payload: SessionPayload, key: Uint8Array) {
  return signMobileToken(payload, key, "mobile_refresh", MOBILE_REFRESH_TOKEN_DURATION_SECONDS);
}

/** DB identity and sessionVersion are authoritative, same trust model as readSessionToken. */
export async function readMobileToken(token: string, expectedType: MobileTokenType, dependencies: {
  key: Uint8Array;
  findUser: (id: string) => Promise<SessionUser | null>;
  production?: boolean;
}): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, dependencies.key, { algorithms: ["HS256"] });
    if (payload.typ !== expectedType) return null;
    if (typeof payload.userId !== "string" || typeof payload.memberId !== "string" || typeof payload.email !== "string") return null;
    const version = payload.sessionVersion === undefined ? 0 : payload.sessionVersion;
    if (!Number.isSafeInteger(version) || Number(version) < 0) return null;
    if (isProductionDemoEmail(payload.email, dependencies.production)) return null;
    const user = await dependencies.findUser(payload.userId);
    if (!user || user.memberId !== payload.memberId || user.sessionVersion !== version || isProductionDemoUser(user, dependencies.production)) return null;
    return { userId: user.id, memberId: user.memberId, email: user.email, sessionVersion: user.sessionVersion };
  } catch {
    return null;
  }
}

export function bearerToken(authorizationHeader: string | null): string | null {
  const match = authorizationHeader ? /^Bearer\s+(.+)$/i.exec(authorizationHeader) : null;
  return match ? match[1] : null;
}

/** Native OAuth: the app's bearer-token /start call and the ASWebAuthenticationSession's own
 * cookie jar are two different storage contexts, so the OAUTH_BROWSER_COOKIE binding can't reach
 * the browser session directly. This short-lived, single-purpose token carries the browserSecret
 * and the real provider authorizationUrl through one redirect hop (the "bootstrap" route) that
 * runs INSIDE that browser session, where it can set the cookie before continuing to the provider. */
const OAUTH_BOOTSTRAP_DURATION_SECONDS = 2 * 60;
export async function signOAuthBootstrapToken(payload: { transactionId: string; provider: string; browserSecret: string; authorizationUrl: string }, key: Uint8Array) {
  return new SignJWT({ ...payload, protocolVersion: 2, typ: "oauth_bootstrap" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${OAUTH_BOOTSTRAP_DURATION_SECONDS}s`).sign(key);
}
export async function readOAuthBootstrapToken(token: string, key: Uint8Array) {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.typ !== "oauth_bootstrap" || payload.protocolVersion !== 2) return null;
    if (typeof payload.transactionId !== "string" || !payload.transactionId || payload.transactionId.length > 200
      || !["google", "apple"].includes(String(payload.provider)) || typeof payload.browserSecret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(payload.browserSecret)
      || typeof payload.authorizationUrl !== "string" || payload.authorizationUrl.length > 4096) return null;
    return { transactionId: payload.transactionId, provider: payload.provider as string, browserSecret: payload.browserSecret, authorizationUrl: payload.authorizationUrl };
  } catch {
    return null;
  }
}

// Browser-to-App handoffs are opaque, app-bound, database-consumed codes.
// See mobile-oauth.ts. Legacy JWT handoffs are deliberately not accepted.
