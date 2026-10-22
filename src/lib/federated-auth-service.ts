import type { PrismaClient } from "@prisma/client";
import type { SessionPayload } from "./auth-session";
import { isProductionDemoUser } from "./auth-session";
import { authorizationUrl, encryptProviderToken, exchangeProviderCode, FederatedAuthError, hashOAuthSecret, isAuthProvider,
  providerConfig, randomOAuthSecret, validOAuthSecret, verifyFreshProviderAuthentication, verifyProviderToken } from "./federated-auth";
import type { AuthProvider, OAuthPurpose, ProviderConfig } from "./federated-auth";
import type { OAuthRuntimeSettings } from "./runtime-secrets";
import { OAUTH_DATA_VERSION } from "./federated-auth";
import { resolveOAuthRuntimeSettings, resolveProviderConfig } from "./federated-auth-runtime";

const invalid = () => new FederatedAuthError(400, "OAUTH_EXPIRED", "驗證已失效或已使用，請重新開始");
const completedScrub = { subject: null, email: null, providerName: null, refreshTokenCiphertext: null, inviteToken: null, codeVerifier: null, nonce: "", browserHash: "" };
/** Bounded housekeeping only; expiry is not a promise of physical deletion. */
export async function cleanupExpiredOAuthTransactions(prisma: PrismaClient, limit = 25, now = new Date(), apply = true) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("INVALID_OAUTH_CLEANUP_LIMIT");
  const eligible = { expiresAt: { lt: now }, OR: [{ reauthExpiresAt: null }, { reauthExpiresAt: { lt: now } }] };
  const rows = await prisma.oAuthTransaction.findMany({ where: eligible, orderBy: { expiresAt: "asc" }, take: limit, select: { id: true } });
  if (!apply || !rows.length) return { candidates: rows.length, deleted: 0, limit };
  const result = await prisma.oAuthTransaction.deleteMany({ where: { ...eligible, id: { in: rows.map(row => row.id) } } });
  return { candidates: rows.length, deleted: result.count, limit };
}
export function isMissingFederatedTable(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2021");
}
async function activeUser(prisma: PrismaClient, session: SessionPayload) {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { member: true } });
  if (!user || user.memberId !== session.memberId || user.sessionVersion !== session.sessionVersion || !user.member
    || user.member.status !== "ACTIVE" || user.member.deletedAt || isProductionDemoUser(user)) throw new FederatedAuthError(401, "SESSION_CHANGED", "登入狀態已更新，請重新登入");
  return user;
}
export async function beginOAuth(prisma: PrismaClient, provider: AuthProvider, purpose: OAuthPurpose, browserSecret: string,
  session: SessionPayload | null, confirmedExisting = false, now = new Date(), inviteToken?: string, configuration?: ProviderConfig | null) {
  const config = configuration === undefined ? await resolveProviderConfig(provider) : configuration;
  if (!config) throw new FederatedAuthError(503, "PROVIDER_DISABLED", "此第三方登入尚未完成設定");
  if (!validOAuthSecret(browserSecret)) throw invalid();
  if (!["login", "link", "reauth"].includes(purpose)) throw invalid();
  await cleanupExpiredOAuthTransactions(prisma);
  if (inviteToken) {
    const invite = await prisma.clubInvite.findFirst({ where: { token: inviteToken, revokedAt: null, validFrom: { lte: now }, validUntil: { gte: now }, organization: { level: "club", isActive: true } } });
    if (!invite || invite.usageLimit !== null && invite.usageCount >= invite.usageLimit) throw new FederatedAuthError(400, "INVITE_INVALID", "邀請 QR 已失效，請取得新的邀請");
  }
  if (purpose !== "login") {
    if (!session) throw new FederatedAuthError(401, "LOGIN_REQUIRED", "請先登入本人帳號");
    await activeUser(prisma, session);
    if (purpose === "link" && !confirmedExisting) throw new FederatedAuthError(401, "REAUTH_REQUIRED", "請先以目前密碼或已連結帳號重新驗證");
    if (purpose === "reauth") {
      if (!config.reauthEnabled) throw new FederatedAuthError(503, "PROVIDER_REAUTH_UNAVAILABLE", "此供應商的近期本人再驗證尚未驗收，暫不能用於安全操作；不會要求您設定假密碼");
      const linked = await prisma.federatedIdentity.findUnique({ where: { userId_provider: { userId: session.userId, provider } } });
      if (!linked) throw new FederatedAuthError(400, "IDENTITY_NOT_LINKED", "請選擇已連結的第三方帳號重新驗證");
    }
  }
  const state = randomOAuthSecret(), nonce = randomOAuthSecret(), verifier = randomOAuthSecret();
  await prisma.oAuthTransaction.create({ data: { provider, purpose, stateHash: hashOAuthSecret(state), browserHash: hashOAuthSecret(browserSecret),
    nonce, codeVerifier: provider === "google" ? verifier : null, inviteToken: purpose === "login" ? inviteToken : null, userId: purpose === "login" ? null : session!.userId,
    sessionVersion: purpose === "login" ? null : session!.sessionVersion, expiresAt: new Date(now.getTime() + 10 * 60_000) } });
  return { authorizationUrl: authorizationUrl(config, state, nonce, verifier, purpose) };
}
export async function readOAuthTransaction(prisma: PrismaClient, state: string, browserSecret: string, now = new Date()) {
  if (!validOAuthSecret(state) || !validOAuthSecret(browserSecret)) throw invalid();
  const row = await prisma.oAuthTransaction.findUnique({ where: { stateHash: hashOAuthSecret(state) } });
  if (!row || row.browserHash !== hashOAuthSecret(browserSecret) || row.expiresAt <= now || row.completedAt || !isAuthProvider(row.provider) || !["login", "link", "reauth"].includes(row.purpose)) throw invalid();
  return row;
}
/** Claim BEFORE contacting provider. Failure burns the challenge; never replay a code. */
export async function acceptOAuthCallback(prisma: PrismaClient, provider: AuthProvider, state: string, browserSecret: string,
  input: { code: string; idToken?: string; appleName?: string },
  dependencies: { exchange?: typeof exchangeProviderCode; verify?: typeof verifyProviderToken; encrypt?: typeof encryptProviderToken; config?: ProviderConfig | null } = {},
) {
  const config = dependencies.config === undefined ? await resolveProviderConfig(provider) : dependencies.config;
  if (!config) throw new FederatedAuthError(503, "PROVIDER_DISABLED", "此第三方登入尚未完成設定");
  const row = await readOAuthTransaction(prisma, state, browserSecret);
  if (row.provider !== provider || row.claimedAt || !input.code || input.code.length > 4096) throw invalid();
  const claimedAt = new Date(), browserHash = hashOAuthSecret(browserSecret);
  const claimed = await prisma.oAuthTransaction.updateMany({ where: { id: row.id, browserHash, claimedAt: null, completedAt: null, expiresAt: { gt: claimedAt } }, data: { claimedAt } });
  if (claimed.count !== 1) throw invalid();
  const verify = dependencies.verify ?? verifyProviderToken;
  let front;
  if (provider === "apple") {
    if (!input.idToken || input.idToken.length > 16000) throw invalid();
    front = await verify(input.idToken, config, row.nonce, { code: input.code, requireCodeHash: true });
  }
  const tokens = await (dependencies.exchange ?? exchangeProviderCode)(config, input.code, row.codeVerifier);
  const identity = await verify(tokens.idToken, config, row.nonce);
  if (front && (front.subject !== identity.subject || front.email !== identity.email)) throw invalid();
  if (row.purpose === "reauth") verifyFreshProviderAuthentication(identity.payload, row.createdAt);
  const ciphertext = provider === "apple" && tokens.refreshToken ? (dependencies.encrypt ?? encryptProviderToken)(tokens.refreshToken) : null;
  if (provider === "apple" && !ciphertext) throw new FederatedAuthError(503, "APPLE_REVOCATION_UNAVAILABLE", "Apple 未提供可撤銷憑證，暫不建立或連結帳號，請重新開始");
  // Provider I/O may outlive a browser cancellation or expiry. Never restore
  // scrubbed identity data unless this exact claim is still live and owned.
  const verifiedAt = new Date();
  const verified = await prisma.oAuthTransaction.updateMany({ where: { id: row.id, browserHash, claimedAt, completedAt: null, expiresAt: { gt: verifiedAt } },
    data: { verifiedAt, subject: identity.subject, email: identity.email,
      providerName: identity.name || input.appleName?.slice(0, 100), refreshTokenCiphertext: ciphertext, codeVerifier: null } });
  if (verified.count !== 1) throw invalid();
}
/** Same-site GET after Apple's form_post restores normal Lax application cookies. */
export async function finishOAuth(prisma: PrismaClient, state: string, browserSecret: string, session: SessionPayload | null, configuration?: OAuthRuntimeSettings) {
  const settings = configuration ?? await resolveOAuthRuntimeSettings();
  return prisma.$transaction(async tx => {
    const row = await readOAuthTransaction(tx as PrismaClient, state, browserSecret);
    if (!row.verifiedAt || !row.subject || !row.email) throw invalid();
    if (!isAuthProvider(row.provider) || !providerConfig(row.provider, settings)) throw new FederatedAuthError(503, "PROVIDER_DISABLED", "此第三方登入目前未開放");
    const identity = await tx.federatedIdentity.findUnique({ where: { provider_subject: { provider: row.provider, subject: row.subject } }, include: { user: { include: { member: true } } } });
    if (row.purpose === "login" && !identity) {
      // Never auto-link matching emails, including case-insensitive legacy addresses.
      const duplicate = await tx.user.findFirst({ where: { email: { equals: row.email, mode: "insensitive" } }, select: { id: true } });
      const imported = await tx.member.findFirst({ where: { email: { equals: row.email, mode: "insensitive" } }, select: { id: true } });
      if (duplicate || imported) throw new FederatedAuthError(409, "ACCOUNT_LINK_REQUIRED", "此信箱已有帳號或會員資料。請先用原登入方式登入，再到個人安全連結第三方帳號；不會自動合併。");
      return { kind: "register" as const };
    }
    if (row.purpose === "link") {
      if (!session || row.userId !== session.userId || row.sessionVersion !== session.sessionVersion) throw invalid();
      await activeUser(tx as PrismaClient, session);
      if (identity && identity.userId !== session.userId) throw new FederatedAuthError(409, "IDENTITY_ALREADY_LINKED", "此第三方身分已連結其他帳號");
      const other = await tx.federatedIdentity.findUnique({ where: { userId_provider: { userId: session.userId, provider: row.provider } } });
      if (other && other.subject !== row.subject) throw new FederatedAuthError(409, "PROVIDER_ALREADY_LINKED", "此帳號已連結另一個同服務身分，不能自動替換");
      if (!other) await tx.federatedIdentity.create({ data: { userId: session.userId, provider: row.provider, subject: row.subject, email: row.email, refreshTokenCiphertext: row.refreshTokenCiphertext } });
      else if (row.refreshTokenCiphertext) await tx.federatedIdentity.update({ where: { id: other.id }, data: { refreshTokenCiphertext: row.refreshTokenCiphertext } });
      await tx.memberDataConsent.upsert({ where: { memberId_purpose_version: { memberId: session.memberId, purpose: "federated_auth", version: OAUTH_DATA_VERSION } },
        create: { memberId: session.memberId, purpose: "federated_auth", version: OAUTH_DATA_VERSION }, update: {} });
      await claimCompleted(tx as PrismaClient, row.id);
      return { kind: "linked" as const };
    }
    const user = identity?.user;
    if (!user?.member || user.member.status !== "ACTIVE" || user.member.deletedAt || isProductionDemoUser(user)) throw new FederatedAuthError(403, "ACCOUNT_UNAVAILABLE", "此帳號未啟用或無法使用，請聯絡管理者");
    if (row.purpose === "reauth") {
      if (!session || user.id !== session.userId || row.userId !== session.userId || user.sessionVersion !== session.sessionVersion || row.sessionVersion !== session.sessionVersion) throw invalid();
      const proof = randomOAuthSecret();
      if (row.verifiedAt.getTime() < Date.now() - 5 * 60_000) throw invalid();
      await claimCompleted(tx as PrismaClient, row.id, { reauthHash: hashOAuthSecret(proof), reauthExpiresAt: new Date(row.verifiedAt.getTime() + 5 * 60_000) });
      if (row.refreshTokenCiphertext) await tx.federatedIdentity.update({ where: { id: identity!.id }, data: { refreshTokenCiphertext: row.refreshTokenCiphertext } });
      return { kind: "reauthenticated" as const, proof };
    }
    if (row.purpose !== "login") throw invalid();
    await claimCompleted(tx as PrismaClient, row.id, { userId: user.id, sessionVersion: user.sessionVersion });
    if (row.refreshTokenCiphertext) await tx.federatedIdentity.update({ where: { id: identity!.id }, data: { refreshTokenCiphertext: row.refreshTokenCiphertext } });
    return { kind: "login" as const, session: { userId: user.id, memberId: user.member.id, email: user.email, sessionVersion: user.sessionVersion } };
  }, { isolationLevel: "Serializable" });
}
async function claimCompleted(prisma: PrismaClient, id: string, extra = {}) {
  const claimed = await prisma.oAuthTransaction.updateMany({ where: { id, completedAt: null, expiresAt: { gt: new Date() } }, data: { completedAt: new Date(), ...completedScrub, ...extra } });
  if (claimed.count !== 1) throw invalid();
}
export async function consumeOAuthReauth(prisma: PrismaClient, session: SessionPayload, proof: string | undefined, _action: "link" | "sessions", consume = true) {
  if (!["link", "sessions"].includes(_action)) return false;
  if (!validOAuthSecret(proof)) return false;
  const row = await prisma.oAuthTransaction.findUnique({ where: { reauthHash: hashOAuthSecret(proof) } });
  if (!row || !row.completedAt || row.userId !== session.userId || row.sessionVersion !== session.sessionVersion || row.reauthUsedAt
    || !row.reauthExpiresAt || row.reauthExpiresAt <= new Date() || row.purpose !== "reauth") return false;
  await activeUser(prisma, session);
  if (!consume) return true;
  const claimed = await prisma.oAuthTransaction.updateMany({ where: { id: row.id, reauthUsedAt: null, reauthExpiresAt: { gt: new Date() } }, data: { reauthUsedAt: new Date() } });
  return claimed.count === 1;
}
/** Cancels only this browser's pending states and proof, never identities/users. */
export async function cancelOAuthBrowser(prisma: PrismaClient, browserSecret?: string, proof?: string, now = new Date()) {
  if (validOAuthSecret(browserSecret)) await prisma.oAuthTransaction.updateMany({
    where: { browserHash: hashOAuthSecret(browserSecret), completedAt: null },
    data: { completedAt: now, ...completedScrub, reauthHash: null, reauthExpiresAt: null, reauthUsedAt: now },
  });
  if (validOAuthSecret(proof)) await prisma.oAuthTransaction.updateMany({ where: { reauthHash: hashOAuthSecret(proof), reauthUsedAt: null },
    data: { reauthUsedAt: now, reauthHash: null, reauthExpiresAt: null } });
}
