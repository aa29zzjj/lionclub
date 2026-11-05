import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { activeAdminRoleWhere } from "./active-admin-role";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "./admin-scope";
import { getBlockedMemberIds } from "./member-block";
import { mobilePushSettings, MOBILE_PUSH_LEASE_MS, MOBILE_PUSH_RECEIPT_TTL_MS, MOBILE_PUSH_DELIVERY_TTL_MS, type MobilePushSettings } from "./mobile-push-config";
import { encryptPushToken, normalizedPushToken, pushTokenHash } from "./mobile-push-crypto";

export type MobilePushKind = "activity" | "friend_invitation" | "experience_review" | "membership_review";
export type MobilePushEvent = { kind: MobilePushKind; sourceId: string; actorId: string; recipientMemberIds: string[]; sourceRevision?: string };
export type MobilePushActor = { userId: string; memberId: string; sessionVersion: number };
type Database = PrismaClient | Prisma.TransactionClient;
export class MobilePushError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const pushRegistrationSchema = z.object({ installationId: z.string().uuid().transform(value => value.toLowerCase()), revision,
  token: z.string().min(32).max(512).refine(value => /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0), authorization: z.literal("granted") }).strict();
export const pushDisableSchema = z.object({ installationId: z.string().uuid().transform(value => value.toLowerCase()), revision }).strict();
export const pushReceiptReadSchema = z.object({ ids: z.array(z.string().min(1).max(200)).min(1).max(100) }).strict();
const revisionConflict = () => new MobilePushError(409, "PUSH_REVISION_CONFLICT", "通知設定已更新，請重新確認目前裝置設定");
function enabled(settings: MobilePushSettings): asserts settings is Extract<MobilePushSettings, { enabled: true }> {
  if (!settings.enabled) throw new MobilePushError(503, "PUSH_UNAVAILABLE", "手機推播尚未啟用，站內通知仍可使用");
}
async function requireLiveActor(db: Database, actor: MobilePushActor) {
  if (!await db.user.findFirst({ where: { id: actor.userId, memberId: actor.memberId, sessionVersion: actor.sessionVersion,
    member: { status: "ACTIVE", deletedAt: null } }, select: { id: true } })) throw new MobilePushError(401, "UNAUTHENTICATED", "登入狀態已更新，請重新登入");
}

export async function registerMobilePushDevice(prisma: PrismaClient, actor: MobilePushActor,
  input: z.infer<typeof pushRegistrationSchema>, settings = mobilePushSettings(), now = new Date()) {
  enabled(settings);
  const owner = { userId: actor.userId, memberId: actor.memberId, sessionVersion: actor.sessionVersion };
  const token = normalizedPushToken(input.token), hash = pushTokenHash(token), requestedRevision = BigInt(input.revision);
  return prisma.$transaction(async tx => {
    await requireLiveActor(tx, actor);
    const current = await tx.mobilePushDevice.findUnique({ where: { installationId: input.installationId } });
    if (!current && await tx.mobilePushDevice.count({ where: { userId: actor.userId } }) >= 50) throw new MobilePushError(409, "PUSH_DEVICE_LIMIT", "裝置設定數量已達上限，請聯絡客服協助整理");
    if (current && current.revision > requestedRevision) throw revisionConflict();
    if (current && current.revision === requestedRevision) {
      if (!current.enabled || current.userId !== actor.userId || current.memberId !== actor.memberId || current.sessionVersion !== actor.sessionVersion
        || current.tokenHash !== hash || current.environment !== settings.environment || current.topic !== settings.topic || current.leaseExpiresAt <= now) throw revisionConflict();
      return { ok: true as const, enabled: true as const, revision: input.revision, leaseExpiresAt: current.leaseExpiresAt.toISOString() };
    }
    const duplicate = await tx.mobilePushDevice.findUnique({ where: { environment_topic_tokenHash: { environment: settings.environment, topic: settings.topic, tokenHash: hash } } });
    const excluded = [current?.id, duplicate?.id].filter((id): id is string => Boolean(id));
    if (await tx.mobilePushDevice.count({ where: { userId: actor.userId, enabled: true, leaseExpiresAt: { gt: now }, id: { notIn: excluded } } }) >= 10) {
      throw new MobilePushError(409, "PUSH_DEVICE_LIMIT", "已達可啟用通知的裝置上限，請先停用不再使用的裝置");
    }
    const changed = !current || !current.enabled || current.userId !== actor.userId || current.memberId !== actor.memberId
      || current.sessionVersion !== actor.sessionVersion || current.tokenHash !== hash || current.environment !== settings.environment || current.topic !== settings.topic;
    const bindingVersion = current ? current.bindingVersion + (changed ? 1 : 0) : 1;
    // A duplicate token is atomically detached, but its installation revision
    // tombstone remains. Never expose previous account/device details to callers.
    if (duplicate && duplicate.id !== current?.id) {
      await tx.mobilePushDelivery.deleteMany({ where: { deviceId: duplicate.id } });
      await tx.mobilePushDevice.update({ where: { id: duplicate.id }, data: { enabled: false, tokenHash: null, tokenCiphertext: null,
        bindingVersion: { increment: 1 }, lastSeenAt: now, leaseExpiresAt: now } });
    }
    if (current && changed) await tx.mobilePushDelivery.deleteMany({ where: { deviceId: current.id } });
    const binding = { ...owner, installationId: input.installationId, bindingVersion, environment: settings.environment, topic: settings.topic };
    const leaseExpiresAt = new Date(now.getTime() + MOBILE_PUSH_LEASE_MS);
    const data = { ...owner, revision: requestedRevision, bindingVersion, environment: settings.environment, topic: settings.topic,
      tokenHash: hash, tokenCiphertext: encryptPushToken(token, binding, settings), enabled: true, lastSeenAt: now, leaseExpiresAt };
    await tx.mobilePushDevice.upsert({ where: { installationId: input.installationId }, create: { installationId: input.installationId, ...data }, update: data });
    return { ok: true as const, enabled: true as const, revision: input.revision, leaseExpiresAt: leaseExpiresAt.toISOString() };
  }, { isolationLevel: "Serializable" });
}

export async function disableMobilePushDevice(prisma: PrismaClient, actor: MobilePushActor,
  input: z.infer<typeof pushDisableSchema>, settings = mobilePushSettings(), now = new Date()) {
  enabled(settings);
  const owner = { userId: actor.userId, memberId: actor.memberId, sessionVersion: actor.sessionVersion };
  return prisma.$transaction(async tx => {
    await requireLiveActor(tx, actor);
    const current = await tx.mobilePushDevice.findUnique({ where: { installationId: input.installationId } });
    if (!current && await tx.mobilePushDevice.count({ where: { userId: actor.userId } }) >= 50) throw new MobilePushError(409, "PUSH_DEVICE_LIMIT", "裝置設定數量已達上限，請聯絡客服協助整理");
    const requestedRevision = BigInt(input.revision);
    if (current && (current.userId !== actor.userId || current.memberId !== actor.memberId || current.revision > requestedRevision)) throw revisionConflict();
    if (current && current.revision === requestedRevision) {
      if (current.enabled) throw revisionConflict();
      return { ok: true as const, enabled: false as const, revision: input.revision };
    }
    if (current) await tx.mobilePushDelivery.deleteMany({ where: { deviceId: current.id } });
    const data = { ...owner, revision: requestedRevision, bindingVersion: current ? current.bindingVersion + 1 : 1,
      environment: settings.environment, topic: settings.topic, enabled: false, tokenHash: null, tokenCiphertext: null, lastSeenAt: now, leaseExpiresAt: now };
    // Creating a disabled tombstone also fences a registration that arrives late
    // before the first registration has even committed.
    await tx.mobilePushDevice.upsert({ where: { installationId: input.installationId }, create: { installationId: input.installationId, ...data }, update: data });
    return { ok: true as const, enabled: false as const, revision: input.revision };
  }, { isolationLevel: "Serializable" });
}

/** Source authorization is shared by enqueue, feed and worker. It never trusts
 * arbitrary source IDs or stale payload data as an authorization grant. */
export async function authorizedMobilePushRecipients(db: Database, input: MobilePushEvent, now = new Date(), sourceCutoff = now): Promise<string[]> {
  const requested = [...new Set(input.recipientMemberIds)].filter(id => id !== input.actorId);
  if (!requested.length || requested.length > 1000 || !await db.member.findFirst({ where: { id: input.actorId, status: "ACTIVE", deletedAt: null }, select: { id: true } })) return [];
  const blocked = new Set(await getBlockedMemberIds(db, input.actorId));
  let permitted: string[] = [];
  if (input.kind === "activity") {
    const source = await db.eventNotification.findUnique({ where: { id: input.sourceId }, select: { senderId: true,
      event: { select: { category: true, createdById: true } }, recipients: { where: { recipientId: { in: requested }, readAt: null }, select: { recipientId: true } } } });
    if (!source || source.senderId !== input.actorId) return [];
    if (source.event.category === "PERSONAL") for (const id of await getBlockedMemberIds(db, source.event.createdById)) blocked.add(id);
    permitted = source.recipients.map(row => row.recipientId);
  } else if (input.kind === "friend_invitation") {
    const source = await db.friendship.findUnique({ where: { id: input.sourceId }, select: { requesterId: true, addresseeId: true, status: true } });
    if (!source || source.requesterId !== input.actorId || source.status !== "PENDING") return [];
    permitted = [source.addresseeId];
  } else if (input.kind === "experience_review") {
    const source = await db.experienceReviewAudit.findUnique({ where: { id: input.sourceId }, include: { experience: true } });
    const target = source?.experience;
    if (!source || !target || source.actorId !== input.actorId || target.verifiedById !== input.actorId || target.updatedAt > sourceCutoff
      || !["verify", "reject"].includes(source.action) || target.verificationStatus !== (source.action === "verify" ? "verified" : "rejected")) return [];
    const latest = await db.experienceReviewAudit.findFirst({ where: { experienceId: target.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (latest?.id !== source.id || !await db.adminRole.findFirst({ where: { memberId: input.actorId, role: source.reviewRole,
      scopeId: source.scopeId, ...activeAdminRoleWhere(now) }, select: { id: true } })) return [];
    permitted = [target.memberId];
  } else if (input.kind === "membership_review") {
    const source = await db.member.findUnique({ where: { id: input.sourceId }, select: { id: true, organizationId: true, status: true, deletedAt: true, updatedAt: true } });
    if (!source || source.status !== "ACTIVE" || source.deletedAt || !input.sourceRevision || source.updatedAt.toISOString() !== input.sourceRevision) return [];
    const roles = await db.adminRole.findMany({ where: { memberId: input.actorId, role: { in: APPROVER_ROLES }, ...activeAdminRoleWhere(now) } });
    if (!roles.length) return [];
    const organizations = await getAdministeredOrganizationIds(db, roles);
    if (organizations && !organizations.includes(source.organizationId)) return [];
    permitted = [source.id];
  }
  const ids = permitted.filter(id => requested.includes(id) && !blocked.has(id));
  if (!ids.length) return [];
  const live = await db.user.findMany({ where: { memberId: { in: ids }, member: { status: "ACTIVE", deletedAt: null } }, select: { memberId: true } });
  return live.map(user => user.memberId).filter((id): id is string => Boolean(id));
}

/** Called INSIDE the existing source transaction. No APNs/network dependency,
 * no fire-and-forget work, no table access whatsoever when disabled. */
export async function enqueueMobilePush(tx: Prisma.TransactionClient, input: MobilePushEvent, settings = mobilePushSettings(), now = new Date()) {
  if (!settings.enabled) return { enabled: false, receiptCount: 0, deliveryCount: 0 };
  const members = await authorizedMobilePushRecipients(tx, input, now);
  if (!members.length) return { enabled: true, receiptCount: 0, deliveryCount: 0 };
  const users = await tx.user.findMany({ where: { memberId: { in: members }, member: { status: "ACTIVE", deletedAt: null } }, select: { id: true, memberId: true, sessionVersion: true } });
  let deliveryCount = 0;
  for (const user of users) {
    if (!user.memberId) continue;
    const key = { userId: user.id, kind: input.kind, sourceId: input.sourceId, sourceRevision: input.sourceRevision ?? "" };
    const receipt = await tx.mobilePushReceipt.upsert({ where: { userId_kind_sourceId_sourceRevision: key },
      create: { ...key, memberId: user.memberId, actorId: input.actorId, createdAt: now, expiresAt: new Date(now.getTime() + MOBILE_PUSH_RECEIPT_TTL_MS) }, update: {} });
    if (receipt.readAt || receipt.expiresAt <= now) continue;
    const devices = await tx.mobilePushDevice.findMany({ where: { userId: user.id, memberId: user.memberId, sessionVersion: user.sessionVersion,
      enabled: true, leaseExpiresAt: { gt: now }, environment: settings.environment, topic: settings.topic }, take: 10,
      select: { id: true, bindingVersion: true, sessionVersion: true, leaseExpiresAt: true } });
    if (devices.length) deliveryCount += (await tx.mobilePushDelivery.createMany({ data: devices.map(device => ({ receiptId: receipt.id, deviceId: device.id,
      bindingVersion: device.bindingVersion, sessionVersion: device.sessionVersion, apnsId: randomUUID(),
      expiresAt: new Date(Math.min(now.getTime() + MOBILE_PUSH_DELIVERY_TTL_MS, device.leaseExpiresAt.getTime())), availableAt: now })), skipDuplicates: true })).count;
  }
  return { enabled: true, receiptCount: users.length, deliveryCount };
}

export function genericMobilePushCopy(kind: MobilePushKind) {
  const titles: Record<MobilePushKind, string> = { activity: "有新的活動公告", friend_invitation: "有新的好友邀請",
    experience_review: "資歷審核狀態已更新", membership_review: "會籍審核狀態已更新" };
  return { title: titles[kind], body: kind === "experience_review" ? "請到「我的」查看本人資歷。" : kind === "membership_review" ? "請到「我的」查看本人會籍。" : "開啟 App 通知查看。" };
}
export async function mobilePushReceiptFeed(db: Database, actor: MobilePushActor, settings = mobilePushSettings(), now = new Date()) {
  if (!settings.enabled) return { enabled: false, receipts: [], unreadCount: 0 };
  await requireLiveActor(db, actor);
  const candidates = await db.mobilePushReceipt.findMany({ where: { userId: actor.userId, memberId: actor.memberId,
    kind: { in: ["experience_review", "membership_review"] }, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, take: 100 });
  const receipts = [];
  for (const receipt of candidates) {
    if (!(await authorizedMobilePushRecipients(db, { kind: receipt.kind as MobilePushKind, sourceId: receipt.sourceId, sourceRevision: receipt.sourceRevision,
      actorId: receipt.actorId, recipientMemberIds: [actor.memberId] }, now, receipt.createdAt)).includes(actor.memberId)) continue;
    receipts.push({ id: receipt.id, kind: receipt.kind, ...genericMobilePushCopy(receipt.kind as MobilePushKind), createdAt: receipt.createdAt.toISOString(), readAt: receipt.readAt?.toISOString() ?? null });
  }
  return { enabled: true, receipts, unreadCount: receipts.filter(receipt => !receipt.readAt).length };
}

export async function readMobilePushReceipts(db: Database, actor: MobilePushActor, ids: string[], settings = mobilePushSettings(), now = new Date()) {
  enabled(settings); await requireLiveActor(db, actor);
  const result = await db.mobilePushReceipt.updateMany({ where: { id: { in: [...new Set(ids)] }, userId: actor.userId, memberId: actor.memberId,
    kind: { in: ["experience_review", "membership_review"] }, expiresAt: { gt: now }, readAt: null }, data: { readAt: now } });
  return { ok: true, updatedCount: result.count };
}
