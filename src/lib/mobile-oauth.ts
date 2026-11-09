import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { FederatedAuthError, hashOAuthSecret, validOAuthSecret } from "./federated-auth";
import { isProductionDemoUser } from "./auth-session";
import { signMobileAccessToken, signMobileRefreshToken, MOBILE_ACCESS_TOKEN_DURATION_SECONDS } from "./mobile-auth";

export const NATIVE_OAUTH_PROTOCOL_VERSION = 2;
export const NATIVE_OAUTH_REDIRECT_URI = "com.lionclubsmembership.app://oauth-callback";
export const NATIVE_OAUTH_HANDOFF_SECONDS = 60;
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const nativeOAuthStartSchema = z.object({ protocolVersion: z.literal(2), redirectUri: z.literal(NATIVE_OAUTH_REDIRECT_URI),
  state: secret, codeChallenge: secret, codeChallengeMethod: z.literal("S256") }).strict();
export const nativeOAuthExchangeSchema = z.object({ protocolVersion: z.literal(2), redirectUri: z.literal(NATIVE_OAUTH_REDIRECT_URI),
  code: secret, state: secret, codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) }).strict();
export type NativeOAuthBinding = { state: string; codeChallenge: string };
export type NativeOAuthExchange = z.infer<typeof nativeOAuthExchangeSchema>;
export const nativeOAuthNoStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export function requireNativeOAuthV2() {
  // Public deployment flag, intentionally not read from provider credential fallbacks.
  if (process.env.MOBILE_OAUTH_V2_ENABLED !== "true") throw new FederatedAuthError(503, "PROVIDER_DISABLED", "App 第三方登入尚未開放，請使用會員信箱與密碼登入。");
}
export function nativeOAuthJson(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: nativeOAuthNoStore }); }
export function nativeOAuthFailure(error: unknown) {
  if (error instanceof FederatedAuthError) return nativeOAuthJson({ error: error.message, code: error.code }, error.status);
  if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) return nativeOAuthJson({ error: "登入資料同時更新，請重新開始。", code: "OAUTH_CONFLICT" }, 409);
  return nativeOAuthJson({ error: "第三方登入暫時無法完成，請重新開始。", code: "OAUTH_UNAVAILABLE" }, 503);
}
const invalid = () => new FederatedAuthError(401, "OAUTH_EXPIRED", "登入連結已過期或已使用，請重新開始。");
export function isNativeOAuthBinding(value: { nativeState?: string | null; nativeCodeChallenge?: string | null; nativeRedirectUri?: string | null }) {
  return value.nativeRedirectUri === NATIVE_OAUTH_REDIRECT_URI && validOAuthSecret(value.nativeState) && validOAuthSecret(value.nativeCodeChallenge);
}
export function equalNativeOAuthSecret(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function nativePkceChallenge(verifier: string) { return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url"); }

/** Only a valid provider/browser transaction may carry an error back to the
 * app. Never derive a redirect or app state from untrusted callback fields. */
export async function cancelNativeOAuthCallback(prisma: PrismaClient, provider: string, state: string, browserSecret: string, now = new Date()): Promise<string | null> {
  if (process.env.MOBILE_OAUTH_V2_ENABLED !== "true" || !["google", "apple"].includes(provider)
    || !validOAuthSecret(state) || !validOAuthSecret(browserSecret)) return null;
  const row = await prisma.oAuthTransaction.findUnique({ where: { stateHash: hashOAuthSecret(state) } });
  if (!row || row.provider !== provider || row.purpose !== "login" || !isNativeOAuthBinding(row) || !row.nativeBootstrapUsedAt
    || row.claimedAt || row.verifiedAt || row.completedAt || row.expiresAt <= now || !equalNativeOAuthSecret(row.browserHash, hashOAuthSecret(browserSecret))) return null;
  const claimed = await prisma.oAuthTransaction.updateMany({ where: { id: row.id, claimedAt: null, verifiedAt: null, completedAt: null, browserHash: row.browserHash, expiresAt: { gt: now } },
    data: { completedAt: now, nativeState: null, nativeCodeChallenge: null, codeVerifier: null, nonce: "", browserHash: "",
      subject: null, email: null, providerName: null, refreshTokenCiphertext: null, inviteToken: null } });
  return claimed.count === 1 ? row.nativeState! : null;
}

/** Only the callback which actually acquired this exact provider claim may
 * turn its own provider failure into an app error. A replay owns no claim. */
export async function cancelNativeOAuthClaim(prisma: PrismaClient, row: {
  id: string; provider: string; stateHash: string; nativeRedirectUri: string | null;
  nativeState: string | null; nativeCodeChallenge: string | null;
}, claimedAt: Date, browserHash: string, now = new Date()): Promise<string | null> {
  if (process.env.MOBILE_OAUTH_V2_ENABLED !== "true" || !isNativeOAuthBinding(row)) return null;
  const appState = row.nativeState;
  const changed = await prisma.oAuthTransaction.updateMany({ where: { id: row.id, provider: row.provider, purpose: "login", stateHash: row.stateHash,
    browserHash, claimedAt, verifiedAt: null, completedAt: null, expiresAt: { gt: now }, nativeBootstrapUsedAt: { not: null },
    nativeState: row.nativeState, nativeCodeChallenge: row.nativeCodeChallenge, nativeRedirectUri: NATIVE_OAUTH_REDIRECT_URI },
    data: { completedAt: now, nativeState: null, nativeCodeChallenge: null, codeVerifier: null, nonce: "", browserHash: "",
      subject: null, email: null, providerName: null, refreshTokenCiphertext: null, inviteToken: null } });
  return changed.count === 1 ? appState : null;
}

export class NativeOAuthClaimFailure extends FederatedAuthError {
  constructor(public readonly nativeState: string, cause: unknown) {
    super(cause instanceof FederatedAuthError ? cause.status : 503,
      cause instanceof FederatedAuthError ? cause.code : "OAUTH_FAILED",
      cause instanceof FederatedAuthError ? cause.message : "第三方驗證暫時無法完成，請重新開始。");
  }
}

/** Bound actual bytes as well as Content-Length; do not buffer an unbounded exchange body. */
export async function readNativeOAuthBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096) throw new FederatedAuthError(413, "OAUTH_BODY_TOO_LARGE", "登入參數過長。");
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new FederatedAuthError(413, "OAUTH_BODY_TOO_LARGE", "登入參數過長。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export async function consumeNativeOAuthBootstrap(prisma: PrismaClient, bootstrap: {
  transactionId: string; provider: string; browserSecret: string; authorizationUrl: string;
}, now = new Date()) {
  requireNativeOAuthV2();
  let state: string | null;
  try { state = new URL(bootstrap.authorizationUrl).searchParams.get("state"); } catch { throw invalid(); }
  if (!validOAuthSecret(state) || !validOAuthSecret(bootstrap.browserSecret)) throw invalid();
  const changed = await prisma.oAuthTransaction.updateMany({ where: { id: bootstrap.transactionId, provider: bootstrap.provider,
    purpose: "login", stateHash: hashOAuthSecret(state), browserHash: hashOAuthSecret(bootstrap.browserSecret),
    nativeRedirectUri: NATIVE_OAUTH_REDIRECT_URI, nativeState: { not: null }, nativeCodeChallenge: { not: null },
    nativeBootstrapUsedAt: null, claimedAt: null, completedAt: null, expiresAt: { gt: now } }, data: { nativeBootstrapUsedAt: now } });
  if (changed.count !== 1) throw invalid();
}

/** One database transaction validates the live identity and claims the opaque
 * handoff before returning tokens. No JWT-only or v1 fallback exists. */
export async function exchangeNativeOAuthHandoff(prisma: PrismaClient, input: NativeOAuthExchange, key: Uint8Array, now = new Date()) {
  requireNativeOAuthV2();
  if (!nativeOAuthExchangeSchema.safeParse(input).success) throw invalid();
  return prisma.$transaction(async tx => {
    const hash = hashOAuthSecret(input.code);
    const row = await tx.oAuthTransaction.findUnique({ where: { nativeHandoffHash: hash } });
    if (!row || row.purpose !== "login" || !isNativeOAuthBinding(row) || !row.completedAt || !row.verifiedAt || !row.nativeBootstrapUsedAt
      || row.nativeHandoffUsedAt || !row.nativeHandoffExpiresAt || row.nativeHandoffExpiresAt <= now || row.expiresAt <= now
      || !row.userId || row.sessionVersion === null || !equalNativeOAuthSecret(row.nativeState!, input.state)
      || !equalNativeOAuthSecret(row.nativeCodeChallenge!, nativePkceChallenge(input.codeVerifier))) throw invalid();
    const user = await tx.user.findUnique({ where: { id: row.userId }, include: { member: true } });
    if (!user?.member || user.member.status !== "ACTIVE" || user.member.deletedAt || user.sessionVersion !== row.sessionVersion || isProductionDemoUser(user)) throw invalid();
    const claimed = await tx.oAuthTransaction.updateMany({ where: { id: row.id, nativeHandoffHash: hash, nativeHandoffUsedAt: null,
      nativeHandoffExpiresAt: { gt: now }, expiresAt: { gt: now }, userId: user.id, sessionVersion: user.sessionVersion },
      data: { nativeHandoffUsedAt: now, nativeState: null, nativeCodeChallenge: null } });
    if (claimed.count !== 1) throw invalid();
    const session = { userId: user.id, memberId: user.member.id, email: user.email, sessionVersion: user.sessionVersion };
    const [accessToken, refreshToken] = await Promise.all([signMobileAccessToken(session, key), signMobileRefreshToken(session, key)]);
    return { accessToken, refreshToken, expiresIn: MOBILE_ACCESS_TOKEN_DURATION_SECONDS, memberId: session.memberId };
  }, { isolationLevel: "Serializable" });
}
