import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorizedMobilePushRecipients, type MobilePushKind } from "./mobile-push";
import { mobilePushSettings, type MobilePushEnvironment } from "./mobile-push-config";
import { decryptPushToken } from "./mobile-push-crypto";

export const MOBILE_PUSH_MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const KINDS: MobilePushKind[] = ["activity", "friend_invitation", "experience_review", "membership_review"];
export type MobilePushPayload = { aps: { alert: { title: string; body: string }; sound: string }; data: { version: 1; kind: MobilePushKind } };
export function mobilePushPayload(kind: MobilePushKind): MobilePushPayload {
  if (!KINDS.includes(kind)) throw new Error("INVALID_PUSH_KIND");
  return { aps: { alert: { title: "LionClubs", body: "你有一則新的通知，開啟 App 查看。" }, sound: "default" }, data: { version: 1, kind } };
}
export type MobilePushTransportRequest = {
  token: string; environment: MobilePushEnvironment; topic: string; apnsId: string; collapseId: string; expiration: number; payload: MobilePushPayload;
};
// The trusted transport must return only these classified outcomes; never raw
// response bodies/errors, tokens, or a claim that APNs acceptance is delivery.
export type MobilePushTransportResult = { kind: "accepted" } | { kind: "invalid-token" } |
  { kind: "retryable"; reason: "rate-limited" | "unavailable" } | { kind: "rejected" };
export type MobilePushTransport = (request: MobilePushTransportRequest) => Promise<MobilePushTransportResult>;
export type MobilePushDeliveryOutcome = { status: "disabled" | "missing" | "busy" | "accepted" | "retry" | "discarded" };
export function mobilePushRetryDelay(attempt: number, reason: "rate-limited" | "unavailable") {
  const base = reason === "unavailable" ? 15 * 60 * 1000 : 60 * 1000;
  return Math.min(6 * 60 * 60 * 1000, base * 2 ** Math.max(0, Math.min(attempt - 1, MOBILE_PUSH_MAX_ATTEMPTS)));
}

/** Trusted worker domain only. Never invoked after a web response as untracked
 * work, and never creates a cron, cloud resource or APNs connection by itself. */
export async function deliverMobilePush(prisma: PrismaClient, id: string, transport: MobilePushTransport,
  settings = mobilePushSettings(), now = new Date()): Promise<MobilePushDeliveryOutcome> {
  if (!settings.enabled) return { status: "disabled" };
  const lockId = randomUUID();
  const prepared = await prisma.$transaction(async tx => {
    const existing = await tx.mobilePushDelivery.findUnique({ where: { id }, select: { status: true, lockedAt: true, expiresAt: true, attemptCount: true } });
    if (!existing) return { outcome: "missing" as const };
    if (["ACCEPTED", "DISCARDED"].includes(existing.status)) return { outcome: existing.status === "ACCEPTED" ? "accepted" as const : "discarded" as const };
    if (existing.status === "SENDING") {
      if (!existing.lockedAt || existing.lockedAt.getTime() > now.getTime() - CLAIM_TIMEOUT_MS) return { outcome: "busy" as const };
      // A worker may have died AFTER APNs accepted its request. Do not blindly
      // redeliver an unknown outcome; the original in-app notification remains.
      await tx.mobilePushDelivery.updateMany({ where: { id, status: "SENDING", lockedAt: existing.lockedAt },
        data: { status: "DISCARDED", lockId: null, lockedAt: null, lastErrorCode: "WORKER_OUTCOME_UNKNOWN" } });
      return { outcome: "discarded" as const };
    }
    if (existing.expiresAt <= now || existing.attemptCount >= MOBILE_PUSH_MAX_ATTEMPTS) {
      await tx.mobilePushDelivery.updateMany({ where: { id, status: { in: ["PENDING", "RETRY"] } }, data: { status: "DISCARDED", lastErrorCode: "EXPIRED_OR_EXHAUSTED" } });
      return { outcome: "discarded" as const };
    }
    const claim = await tx.mobilePushDelivery.updateMany({ where: { id, status: { in: ["PENDING", "RETRY"] }, availableAt: { lte: now },
      expiresAt: { gt: now }, attemptCount: { lt: MOBILE_PUSH_MAX_ATTEMPTS } },
      data: { status: "SENDING", lockId, lockedAt: now, attemptCount: { increment: 1 } } });
    if (claim.count !== 1) return { outcome: "busy" as const };
    const delivery = await tx.mobilePushDelivery.findUnique({ where: { id }, include: { receipt: true,
      device: { include: { user: { select: { id: true, memberId: true, sessionVersion: true } }, member: { select: { status: true, deletedAt: true } } } } } });
    if (!delivery) return { outcome: "missing" as const };
    const { device, receipt } = delivery;
    const valid = device.enabled && device.leaseExpiresAt > now && device.environment === settings.environment && device.topic === settings.topic
      && device.tokenCiphertext && device.bindingVersion === delivery.bindingVersion && device.sessionVersion === delivery.sessionVersion
      && device.userId === receipt.userId && device.memberId === receipt.memberId && device.user.memberId === receipt.memberId
      && device.user.sessionVersion === delivery.sessionVersion && device.member.status === "ACTIVE" && !device.member.deletedAt
      && receipt.expiresAt > now && !receipt.readAt && KINDS.includes(receipt.kind as MobilePushKind);
    const allowed = valid && (await authorizedMobilePushRecipients(tx, { kind: receipt.kind as MobilePushKind, sourceId: receipt.sourceId,
      sourceRevision: receipt.sourceRevision, actorId: receipt.actorId, recipientMemberIds: [receipt.memberId] }, now, receipt.createdAt)).includes(receipt.memberId);
    if (!allowed) {
      await tx.mobilePushDelivery.updateMany({ where: { id, status: "SENDING", lockId }, data: { status: "DISCARDED", lockId: null, lockedAt: null, lastErrorCode: "NO_LONGER_AUTHORIZED" } });
      return { outcome: "discarded" as const };
    }
    return { delivery };
  }, { isolationLevel: "Serializable" });
  if (prepared.outcome) return { status: prepared.outcome };
  const { delivery } = prepared;
  if (!delivery) return { status: "missing" };
  async function finish(status: "ACCEPTED" | "RETRY" | "DISCARDED", code: string | null, availableAt?: Date) {
    const result = await prisma.mobilePushDelivery.updateMany({ where: { id, status: "SENDING", lockId }, data: {
      status, lockId: null, lockedAt: null, lastErrorCode: code, ...(status === "ACCEPTED" ? { acceptedAt: now } : {}), ...(availableAt ? { availableAt } : {}),
    } });
    return result.count === 1;
  }
  let token: string;
  try { token = decryptPushToken(delivery.device.tokenCiphertext!, delivery.device, settings); }
  catch { await finish("DISCARDED", "PUSH_TOKEN_UNAVAILABLE"); return { status: "discarded" }; }
  let result: MobilePushTransportResult;
  try {
    // Network I/O is deliberately outside the SQL transaction. Revocation and
    // token/permission changes cannot recall a notification already accepted by
    // APNs; lock-screen content is therefore always generic.
    result = await transport({ token, environment: settings.environment, topic: settings.topic, apnsId: delivery.apnsId,
      collapseId: createHash("sha256").update(`${delivery.receiptId}:${delivery.deviceId}:${delivery.bindingVersion}`).digest("hex"),
      expiration: Math.floor(Math.min(delivery.expiresAt.getTime(), delivery.device.leaseExpiresAt.getTime()) / 1000),
      payload: mobilePushPayload(delivery.receipt.kind as MobilePushKind) });
  } catch {
    await finish("DISCARDED", "PROVIDER_OUTCOME_UNKNOWN"); return { status: "discarded" };
  }
  if (result.kind === "accepted") return { status: await finish("ACCEPTED", null) ? "accepted" : "missing" };
  if (result.kind === "invalid-token") {
    await prisma.mobilePushDevice.updateMany({ where: { id: delivery.deviceId, bindingVersion: delivery.bindingVersion, revision: delivery.device.revision },
      data: { enabled: false, tokenHash: null, tokenCiphertext: null, leaseExpiresAt: now, lastSeenAt: now } });
    await finish("DISCARDED", "INVALID_DEVICE_TOKEN"); return { status: "discarded" };
  }
  if (result.kind === "retryable" && delivery.attemptCount < MOBILE_PUSH_MAX_ATTEMPTS) {
    const availableAt = new Date(now.getTime() + mobilePushRetryDelay(delivery.attemptCount, result.reason));
    if (availableAt < delivery.expiresAt && availableAt < delivery.device.leaseExpiresAt) {
      return { status: await finish("RETRY", result.reason === "rate-limited" ? "APNS_RATE_LIMITED" : "APNS_UNAVAILABLE", availableAt) ? "retry" : "missing" };
    }
  }
  await finish("DISCARDED", result.kind === "retryable" ? "EXPIRED_OR_EXHAUSTED" : "PROVIDER_REJECTED");
  return { status: "discarded" };
}

export async function processMobilePushBatch(prisma: PrismaClient, transport: MobilePushTransport,
  settings = mobilePushSettings(), now = new Date(), limit = 25) {
  if (!settings.enabled) return { enabled: false, processed: 0 };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("INVALID_PUSH_BATCH_LIMIT");
  const rows = await prisma.mobilePushDelivery.findMany({ where: { OR: [
    { status: { in: ["PENDING", "RETRY"] }, availableAt: { lte: now } },
    { status: "SENDING", lockedAt: { lte: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
  ] }, orderBy: { availableAt: "asc" }, take: limit, select: { id: true } });
  const counts: Record<string, number> = {};
  for (const row of rows) { const result = await deliverMobilePush(prisma, row.id, transport, settings, now); counts[result.status] = (counts[result.status] ?? 0) + 1; }
  return { enabled: true, processed: rows.length, counts };
}
