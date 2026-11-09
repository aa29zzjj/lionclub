import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessionPayload } from "./auth-session";
import { consumeRateLimit } from "./rate-limit";
import { sendSesEmail } from "./aws-http";

export type EmailAction = "link" | "sessions" | "delete";
type Database = PrismaClient | Prisma.TransactionClient;
export const EMAIL_ACTION_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_ACTION_PROOF_TTL_MS = 5 * 60_000;
export const EMAIL_ACTION_MAX_ATTEMPTS = 5;
export const EMAIL_ACTION_COOKIE = "lionclub_email_action";
export class EmailActionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfterSeconds?: number) { super(message); }
}
const invalid = () => new EmailActionError(400, "EMAIL_ACTION_INVALID", "驗證碼或驗證已失效，請重新取得；尚未執行安全操作。");
const unavailable = () => new EmailActionError(503, "EMAIL_ACTION_UNAVAILABLE", "信箱本人驗證尚未開放或暫不可用，尚未執行安全操作。");
export const emailActionEnabled = (env: Record<string, string | undefined> = process.env) => env.EMAIL_ACTION_REAUTH_ENABLED === "true";
const isAction = (action: unknown): action is EmailAction => ["link", "sessions", "delete"].includes(String(action));
const normalize = (email: string) => email.trim().toLowerCase();
const validEmail = (email: string) => email === normalize(email) && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const label: Record<EmailAction, string> = { link: "連結另一種登入方式", sessions: "登出其他裝置", delete: "刪除帳號" };
const proofHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const equalHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function secretKey(key: string) { if (typeof key !== "string" || key.length < 32) throw unavailable(); return key; }
export function maskSecurityEmail(email: string) { const [local, domain] = email.split("@"); return `${local.slice(0, 1)}***@${domain}`; }

async function transaction<T>(prisma: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (attempt < 2 && error && typeof error === "object" && "code" in error && error.code === "P2034") continue;
      throw error;
    }
  }
}
async function trustedActor(db: Database, session: SessionPayload) {
  const user = await db.user.findFirst({ where: { id: session.userId, memberId: session.memberId, sessionVersion: session.sessionVersion,
    passwordHash: null, member: { status: "ACTIVE", deletedAt: null } }, include: { federatedIdentities: true } });
  const identity = user?.federatedIdentities.length === 1 ? user.federatedIdentities[0] : null;
  if (!user || !identity || identity.provider !== "apple" || !identity.securityEmailVerifiedAt || !validEmail(identity.email)) return null;
  return { user, identity };
}
export type EmailActionAuthorization = {
  id: string; userId: string; memberId: string; sessionVersion: number; action: string;
  identityId: string; identityUpdatedAt: Date; identityVerifiedAt: Date; email: string;
};
function identityMatches(row: EmailActionAuthorization, session: SessionPayload, identity: { id: string; updatedAt: Date; securityEmailVerifiedAt: Date | null; email: string }) {
  return row.userId === session.userId && row.memberId === session.memberId && row.sessionVersion === session.sessionVersion
    && row.identityId === identity.id && row.email === identity.email && +row.identityUpdatedAt === +identity.updatedAt
    && identity.securityEmailVerifiedAt !== null && +row.identityVerifiedAt === +identity.securityEmailVerifiedAt;
}
export function emailActionIdentityMatches(binding: EmailActionAuthorization, identity: { id: string; updatedAt: Date; securityEmailVerifiedAt: Date | null; email: string }) {
  return binding.identityId === identity.id && binding.email === identity.email && +binding.identityUpdatedAt === +identity.updatedAt
    && identity.securityEmailVerifiedAt !== null && +binding.identityVerifiedAt === +identity.securityEmailVerifiedAt;
}
function codeHash(key: string, row: EmailActionAuthorization, code: string) {
  return crypto.createHmac("sha256", secretKey(key)).update(JSON.stringify(["lionclub:email-action:v1", row.id, row.userId, row.memberId,
    row.sessionVersion, row.action, row.identityId, row.email, +row.identityVerifiedAt, +row.identityUpdatedAt, code])).digest("hex");
}
export async function emailActionAvailability(db: Database, session: SessionPayload, enabled = emailActionEnabled()) {
  if (!enabled) return { available: false as const };
  const actor = await trustedActor(db, session);
  return actor ? { available: true as const, maskedEmail: maskSecurityEmail(actor.identity.email) } : { available: false as const };
}

/** Bounded physical cleanup helper, invoked only on an opted-in explicit start.
 * Expiry by itself is not a claim that a scheduled cleanup has been deployed. */
export async function cleanupEmailActions(prisma: PrismaClient, now = new Date(), limit = 25) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error("INVALID_EMAIL_ACTION_CLEANUP_LIMIT");
  const where = { expiresAt: { lt: now }, OR: [{ proofExpiresAt: null }, { proofExpiresAt: { lt: now } }] };
  const rows = await prisma.emailActionChallenge.findMany({ where, orderBy: { expiresAt: "asc" }, take: limit, select: { id: true } });
  return prisma.emailActionChallenge.deleteMany({ where: { ...where, id: { in: rows.map(row => row.id) } } });
}

export async function startEmailAction(prisma: PrismaClient, session: SessionPayload, action: EmailAction, key: string, options: {
  enabled?: boolean; now?: Date; sender?: typeof sendSesEmail; from?: string; region?: string;
} = {}) {
  if (!(options.enabled ?? emailActionEnabled())) throw unavailable();
  if (!isAction(action)) throw invalid();
  secretKey(key);
  const from = options.from ?? process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from || !validEmail(normalize(from))) throw unavailable();
  const now = options.now ?? new Date(), id = crypto.randomUUID(), code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await cleanupEmailActions(prisma, now);
  const result = await transaction(prisma, async tx => {
    const actor = await trustedActor(tx, session);
    if (!actor) throw new EmailActionError(403, "EMAIL_ACTION_NOT_ELIGIBLE", "此帳號沒有可用的既有 Apple 驗證信箱，請使用其他已連結的本人驗證方式。");
    const limit = await consumeRateLimit(tx, `email-action-send:${session.userId}`, 3, 10 * 60_000, now);
    if (limit.limited) return { limited: limit };
    await tx.emailActionChallenge.updateMany({ where: { userId: session.userId, action, invalidatedAt: null },
      data: { invalidatedAt: now, codeHash: null, proofHash: null } });
    const binding = { id, userId: session.userId, memberId: session.memberId, sessionVersion: session.sessionVersion, action,
      identityId: actor.identity.id, identityUpdatedAt: actor.identity.updatedAt, identityVerifiedAt: actor.identity.securityEmailVerifiedAt!, email: actor.identity.email };
    const row = await tx.emailActionChallenge.create({ data: { ...binding, codeHash: codeHash(key, binding, code),
      createdAt: now, expiresAt: new Date(+now + EMAIL_ACTION_CODE_TTL_MS) } });
    return { row };
  });
  if ("limited" in result) throw new EmailActionError(429, "RATE_LIMITED", "寄送次數過多，請稍後再試。", result.limited!.retryAfterSeconds);
  const row = result.row!;
  try {
    await (options.sender ?? sendSesEmail)({ region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-northeast-1",
      from, to: row.email, subject: "LionClubs 本人安全操作驗證碼",
      text: `您要求${label[action]}。驗證碼：${code}\n\n驗證碼 10 分鐘內有效，僅適用本次「${label[action]}」。驗證後仍須自行確認操作，不會自動執行。\n請勿把驗證碼交給他人。若非本人要求，請忽略此信。` });
    const confirmed = await transaction(prisma, async tx => {
      const actor = await trustedActor(tx, session);
      if (!actor || !identityMatches(row, session, actor.identity)) return false;
      const changed = await tx.emailActionChallenge.updateMany({ where: { id, invalidatedAt: null, deliveryState: "PENDING", expiresAt: { gt: new Date() } }, data: { deliveryState: "SENT" } });
      return changed.count === 1;
    });
    if (!confirmed) throw invalid();
  } catch {
    await prisma.emailActionChallenge.updateMany({ where: { id, verifiedAt: null }, data: { deliveryState: "FAILED", invalidatedAt: new Date(), codeHash: null, proofHash: null } });
    throw new EmailActionError(503, "EMAIL_ACTION_SEND_UNCONFIRMED", "驗證碼寄送尚未確認，請稍後重新取得；尚未執行安全操作。");
  }
  return { ok: true as const, memberId: session.memberId, action, challengeId: id, expiresAt: row.expiresAt.toISOString(), maskedEmail: maskSecurityEmail(row.email) };
}

export async function verifyEmailAction(prisma: PrismaClient, session: SessionPayload, input: { challengeId: string; action: EmailAction; code: string }, key: string,
  options: { enabled?: boolean; now?: Date } = {}) {
  if (!(options.enabled ?? emailActionEnabled())) throw unavailable();
  if (!isAction(input.action) || !/^[0-9]{6}$/.test(input.code) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.challengeId)) throw invalid();
  secretKey(key);
  const now = options.now ?? new Date(), proof = `email1.${crypto.randomBytes(32).toString("base64url")}`;
  const result = await transaction(prisma, async tx => {
    const actor = await trustedActor(tx, session);
    const row = await tx.emailActionChallenge.findUnique({ where: { id: input.challengeId } });
    if (!actor || !row || !identityMatches(row, session, actor.identity) || row.action !== input.action || row.deliveryState !== "SENT"
      || row.invalidatedAt || row.verifiedAt || row.expiresAt <= now || row.attempts >= EMAIL_ACTION_MAX_ATTEMPTS || !row.codeHash) return null;
    const correct = equalHash(row.codeHash, codeHash(key, row, input.code));
    const proofExpiresAt = new Date(+now + EMAIL_ACTION_PROOF_TTL_MS);
    const changed = await tx.emailActionChallenge.updateMany({ where: { id: row.id, attempts: row.attempts, verifiedAt: null,
      invalidatedAt: null, deliveryState: "SENT", expiresAt: { gt: now } }, data: { attempts: { increment: 1 },
      ...(correct ? { verifiedAt: now, codeHash: null, proofHash: proofHash(proof), proofExpiresAt }
        : row.attempts + 1 >= EMAIL_ACTION_MAX_ATTEMPTS ? { invalidatedAt: now, codeHash: null } : {}) } });
    if (changed.count !== 1) throw Object.assign(new Error("EMAIL_ACTION_CONFLICT"), { code: "P2034" });
    return correct ? { proof, proofExpiresAt } : null;
  });
  if (!result) throw invalid();
  return { ...result, memberId: session.memberId, action: input.action };
}

export async function consumeEmailActionProofInTransaction(tx: Prisma.TransactionClient, session: SessionPayload, proof: string | undefined, action: EmailAction,
  consume = true, now = new Date(), enabled = emailActionEnabled()): Promise<EmailActionAuthorization | null> {
  if (!enabled) return null;
  if (!isAction(action) || !proof || !/^email1\.[A-Za-z0-9_-]{43}$/.test(proof)) return null;
  const actor = await trustedActor(tx, session);
  const row = await tx.emailActionChallenge.findUnique({ where: { proofHash: proofHash(proof) } });
  if (!actor || !row || !identityMatches(row, session, actor.identity) || row.action !== action || !row.verifiedAt || row.invalidatedAt
    || row.deliveryState !== "SENT" || row.proofUsedAt || !row.proofExpiresAt || row.proofExpiresAt <= now) return null;
  if (consume) {
    const claimed = await tx.emailActionChallenge.updateMany({ where: { id: row.id, proofHash: row.proofHash, invalidatedAt: null,
      proofUsedAt: null, proofExpiresAt: { gt: now } }, data: { proofUsedAt: now } });
    if (claimed.count !== 1) return null;
  }
  return row;
}
export async function consumeEmailActionProof(prisma: PrismaClient, session: SessionPayload, proof: string | undefined, action: EmailAction,
  consume = true, options: { enabled?: boolean; now?: Date } = {}) {
  if (!(options.enabled ?? emailActionEnabled())) return null;
  return transaction(prisma, tx => consumeEmailActionProofInTransaction(tx, session, proof, action, consume, options.now, options.enabled ?? emailActionEnabled()));
}
export async function assertConsumedEmailAction(db: Database, session: SessionPayload, id: string, action: EmailAction, now = new Date()) {
  if (!emailActionEnabled()) throw invalid();
  const actor = await trustedActor(db, session), row = await db.emailActionChallenge.findUnique({ where: { id } });
  if (!actor || !row || !identityMatches(row, session, actor.identity) || row.action !== action || !row.verifiedAt || !row.proofUsedAt
    || row.invalidatedAt || !row.proofExpiresAt || row.proofExpiresAt <= now) throw invalid();
  return row;
}
