import type { PrismaClient } from "@prisma/client";

export class AccountDeletionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Delete authentication and private profile data, not the shared Member anchor.
 * The anonymous SUSPENDED tombstone retains event ownership, others' attendance,
 * sent notification delivery anchors and moderation/assignment/check-in audit refs.
 * Authored notification text is redacted. Shared Event content and restricted audit
 * reasons are retained; policies must document retention for free-text audit PII.
 * Storage deletion is a durable, retryable task, never an un-awaited AWS call.
 */
export async function anonymizeAccount(
  prisma: PrismaClient,
  input: { memberId: string; userId: string; expectedPasswordHash: string; bucket?: string; region?: string },
) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.memberId)) throw new AccountDeletionError(400, "會員識別格式錯誤");
  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { id: input.memberId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      const user = await tx.user.findFirst({ where: { id: input.userId, memberId: input.memberId, passwordHash: input.expectedPasswordHash }, select: { id: true } });
      if (!member || !user) throw new AccountDeletionError(409, "帳號或密碼已變更，請重新登入後操作");
      const now = new Date();
      // Scheduled future grants also block deletion until another manager revokes them.
      const activeRoles = await tx.adminRole.count({ where: { memberId: input.memberId, OR: [{ validUntil: null }, { validUntil: { gt: now } }] } });
      if (activeRoles) throw new AccountDeletionError(409, "您仍持有有效或預定的幹部權限，請先由其他管理者撤銷後再刪除帳號");
      const upcomingEvents = await tx.event.count({ where: { createdById: input.memberId, startAt: { gte: now } } });
      if (upcomingEvents) throw new AccountDeletionError(409, "您有尚未開始的活動，請先刪除或請其他幹部接手該活動後再刪除帳號");

      await tx.memberExperience.deleteMany({ where: { memberId: input.memberId } });
      await tx.friendship.deleteMany({ where: { OR: [{ requesterId: input.memberId }, { addresseeId: input.memberId }] } });
      await tx.memberBlock.deleteMany({ where: { OR: [{ blockerId: input.memberId }, { blockedId: input.memberId }] } });
      await tx.eventNotificationRecipient.deleteMany({ where: { recipientId: input.memberId } });
      await tx.eventNotification.updateMany({ where: { senderId: input.memberId }, data: { message: "此通知的發送帳號已刪除，原訊息已移除。" } });
      await tx.clubInvite.updateMany({ where: { issuedById: input.memberId, revokedAt: null }, data: { revokedAt: now } });
      // Cancel only the member's unchecked registrations; preserve signed-in history.
      await tx.eventRegistration.updateMany({ where: { memberId: input.memberId, status: "REGISTERED", checkedInAt: null }, data: { status: "CANCELLED" } });
      await tx.member.update({ where: { id: input.memberId }, data: {
        name: "已刪除會員", nickname: null, birthday: null, photoUrl: null, title: null, bio: null,
        email: null, phone: null, memberNo: null, joinYear: null, joinMonth: null, validUntil: null,
        lineUserId: null, emailVerifiedAt: null, declaredOrganizationName: null,
        tags: { set: [] }, role: "MEMBER", status: "SUSPENDED", deletedAt: now,
      } });
      // Cascades remove password-reset and verification tokens. All devices fail the
      // existing live User/member binding check, even if an old JWT is still signed.
      await tx.user.delete({ where: { id: user.id } });
      const cleanup = await tx.accountDeletionCleanup.upsert({ where: { memberId: input.memberId },
        create: { memberId: input.memberId, avatarPrefix: `avatars/${input.memberId}/`, bucket: input.bucket || null, region: input.region || null, status: "PENDING" },
        update: {}, select: { id: true, status: true },
      });
      return { ok: true, accountDeleted: true, cleanupPending: cleanup.status !== "COMPLETED", cleanupId: cleanup.id };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new AccountDeletionError(409, "帳號、幹部權限或活動同時更新，請重新確認後操作");
    throw error;
  }
}

export type AvatarCleanupStorage = {
  listKeys(input: { bucket: string; region: string; prefix: string }): Promise<string[]>;
  deleteKeys(input: { bucket: string; region: string; keys: string[] }): Promise<void>;
};

// Presigned avatar PUTs last 300s. Wait one extra minute before the final sweep
// so an upload authorized just before deletion cannot recreate a "cleaned" avatar.
export const AVATAR_CLEANUP_DELAY_MS = 6 * 60 * 1000;

/** Run only from a trusted job with a storage adapter; no network by itself. */
export async function processAccountDeletionCleanup(prisma: PrismaClient, cleanupId: string, storage: AvatarCleanupStorage, now = new Date()) {
  const task = await prisma.accountDeletionCleanup.findUnique({ where: { id: cleanupId } });
  if (!task) throw new AccountDeletionError(404, "找不到頭像清理工作");
  if (task.status === "COMPLETED") return { completed: true, alreadyCompleted: true };
  const safeAfter = new Date(task.createdAt.getTime() + AVATAR_CLEANUP_DELAY_MS);
  if (now < safeAfter) return { completed: false, delayed: true, retryAfterSeconds: Math.ceil((safeAfter.getTime() - now.getTime()) / 1000) };
  const claimed = await prisma.accountDeletionCleanup.updateMany({ where: { id: task.id, OR: [
    { status: { in: ["PENDING", "FAILED"] } },
    { status: "PROCESSING", processingStartedAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) } },
  ] }, data: { status: "PROCESSING", processingStartedAt: now, attemptCount: { increment: 1 }, lastError: null } });
  if (claimed.count !== 1) return { completed: false, busy: true };
  let code = "AVATAR_CLEANUP_FAILED";
  try {
    const member = await prisma.member.findUnique({ where: { id: task.memberId }, select: { deletedAt: true } });
    if (!member?.deletedAt || !/^[A-Za-z0-9_-]{1,200}$/.test(task.memberId) || task.avatarPrefix !== `avatars/${task.memberId}/`) { code = "UNSAFE_AVATAR_PREFIX"; throw new Error(code); }
    if (!task.bucket || !task.region) { code = "STORAGE_NOT_CONFIGURED"; throw new Error(code); }
    // Re-list the same prefix after deleting a batch; no unbounded memory/pagination.
    for (let batch = 0; batch < 10; batch++) {
      const keys = await storage.listKeys({ bucket: task.bucket, region: task.region, prefix: task.avatarPrefix });
      if (!keys.length) {
        const finished = await prisma.accountDeletionCleanup.updateMany({ where: { id: task.id, status: "PROCESSING", processingStartedAt: now }, data: { status: "COMPLETED", completedAt: new Date(), processingStartedAt: null, lastError: null } });
        if (finished.count !== 1) return { completed: false, busy: true };
        return { completed: true, alreadyCompleted: false };
      }
      if (keys.length > 1000 || keys.some(key => !key.startsWith(task.avatarPrefix) || /[\r\n\0]/.test(key))) { code = "UNSAFE_STORAGE_KEYS"; throw new Error(code); }
      await storage.deleteKeys({ bucket: task.bucket, region: task.region, keys });
    }
    code = "MORE_AVATARS_REMAIN";
    throw new Error(code);
  } catch {
    // Never persist raw AWS errors, credential details, original URLs or personal data.
    const failed = await prisma.accountDeletionCleanup.updateMany({ where: { id: task.id, status: "PROCESSING", processingStartedAt: now }, data: { status: "FAILED", processingStartedAt: null, lastError: code } });
    if (failed.count !== 1) return { completed: false, busy: true };
    return { completed: false, retryable: true, errorCode: code };
  }
}
