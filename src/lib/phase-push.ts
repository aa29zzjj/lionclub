import type { PrismaClient } from "@prisma/client";
import { enqueueMobilePush } from "./mobile-push";
import type { MobilePushSettings } from "./mobile-push-config";
import { hasPhaseNoticeSchema } from "./phase-notices";

/** The trusted push worker materializes device deliveries at send time. */
export async function queueDuePhasePushes(prisma: PrismaClient, settings: MobilePushSettings, now = new Date()) {
  if (!settings.enabled || !await hasPhaseNoticeSchema(prisma)) return 0;
  const rows = await prisma.phaseNotice.findMany({
    where: { pushQueuedAt: null, availableAt: { lte: now, gte: new Date(now.getTime() - 86_400_000) } },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: 50, select: { id: true, actorId: true, recipientId: true },
  });
  let queued = 0;
  for (const notice of rows) {
    try {
      queued += await prisma.$transaction(async tx => {
        const claimed = await tx.phaseNotice.updateMany({ where: { id: notice.id, pushQueuedAt: null }, data: { pushQueuedAt: now } });
        if (!claimed.count) return 0;
        const result = await enqueueMobilePush(tx, { kind: "next_phase", sourceId: notice.id, actorId: notice.actorId,
          recipientMemberIds: [notice.recipientId] }, settings, now);
        return result.deliveryCount;
      }, { isolationLevel: "Serializable" });
    } catch (failure) {
      // Another worker, an edit, or cancellation may win the transaction.
      if (!failure || typeof failure !== "object" || !("code" in failure) || failure.code !== "P2034") throw failure;
    }
  }
  return queued;
}
