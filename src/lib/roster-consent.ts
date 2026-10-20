import type { Prisma, PrismaClient } from "@prisma/client";

import { ROSTER_CONSENT_PURPOSE, ROSTER_CONSENT_VERSION } from "./roster-consent-policy";
export { ROSTER_CONSENT_PURPOSE, ROSTER_CONSENT_VERSION } from "./roster-consent-policy";
type Database = PrismaClient | Prisma.TransactionClient;
type ConsentReader = Pick<Database, "memberDataConsent">;

export class RosterConsentError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function isRosterSchemaUnavailable(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && ["P2021", "P2022"].includes(String(error.code));
}

export function rosterConsentUnavailable() {
  return new RosterConsentError(503, "ROSTER_CONSENT_UNAVAILABLE", "名冊比對尚未完成部署，暫不讀取或帶入；您仍可手動管理資歷，稍後可重新載入。");
}

export async function readRosterConsent(db: ConsentReader, memberId: string) {
  try {
    const consent = await db.memberDataConsent.findUnique({
      where: { memberId_purpose_version: { memberId, purpose: ROSTER_CONSENT_PURPOSE, version: ROSTER_CONSENT_VERSION } },
      select: { acceptedAt: true },
    });
    return { available: true, purpose: ROSTER_CONSENT_PURPOSE, version: ROSTER_CONSENT_VERSION,
      accepted: !!consent, acceptedAt: consent?.acceptedAt ?? null };
  } catch (error) {
    if (isRosterSchemaUnavailable(error)) throw rosterConsentUnavailable();
    throw error;
  }
}

export async function requireRosterConsent(db: ConsentReader, memberId: string) {
  const consent = await readRosterConsent(db, memberId);
  if (!consent.accepted) throw new RosterConsentError(403, "ROSTER_CONSENT_REQUIRED", "請先自行勾選同意名冊比對；不同意不影響登入與手動填寫資歷。");
}

export async function updateRosterConsent(prisma: PrismaClient, memberId: string, accepted: boolean) {
  try {
    return await prisma.$transaction(async tx => {
      if (!await tx.member.findFirst({ where: { id: memberId, status: "ACTIVE", deletedAt: null }, select: { id: true } })) {
        throw new RosterConsentError(409, "ACCOUNT_CHANGED", "帳號狀態已更新，請重新登入確認。");
      }
      if (accepted) await tx.memberDataConsent.upsert({
        where: { memberId_purpose_version: { memberId, purpose: ROSTER_CONSENT_PURPOSE, version: ROSTER_CONSENT_VERSION } },
        create: { memberId, purpose: ROSTER_CONSENT_PURPOSE, version: ROSTER_CONSENT_VERSION }, update: {},
      });
      else await tx.memberDataConsent.deleteMany({ where: { memberId, purpose: ROSTER_CONSENT_PURPOSE } });
      return readRosterConsent(tx, memberId);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isRosterSchemaUnavailable(error)) throw rosterConsentUnavailable();
    if (error && typeof error === "object" && "code" in error && String(error.code) === "P2034") {
      throw new RosterConsentError(409, "CONSENT_CHANGED", "同意或帳號狀態同時更新，請重新載入後再試。");
    }
    throw error;
  }
}
