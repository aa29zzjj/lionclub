import type { PrismaClient } from "@prisma/client";
import type { SessionPayload } from "./auth-session";

export type ProfilePatch = { name?: string; nickname?: string; title?: string; email?: string; phone?: string; bio?: string; tags?: string[]; photoUrl?: string; birthday?: string };
const normalized = (email: string) => email.trim().toLowerCase();

export async function updateOwnProfile(prisma: PrismaClient, session: SessionPayload, input: ProfilePatch) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: session.userId } });
    if (!user || user.memberId !== session.memberId || user.sessionVersion !== session.sessionVersion) throw new Error("PROFILE_SESSION_INVALID");
    const email = input.email === undefined ? undefined : normalized(input.email);
    const emailChanged = email !== undefined && email !== normalized(user.email);
    if (emailChanged) {
      // Keep the same case-insensitive identity rule as registration, including
      // legacy mixed-case accounts and imported members without a login yet.
      const duplicateUser = await tx.user.findFirst({ where: { id: { not: user.id }, email: { equals: email, mode: "insensitive" } }, select: { id: true } });
      const duplicateMember = await tx.member.findFirst({ where: { id: { not: session.memberId }, email: { equals: email, mode: "insensitive" } }, select: { id: true } });
      if (duplicateUser || duplicateMember) throw new Error("PROFILE_EMAIL_CONFLICT");
      await tx.user.update({ where: { id: user.id }, data: { email } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    }
    const member = await tx.member.update({ where: { id: session.memberId }, data: {
      name: input.name, nickname: input.nickname === "" ? null : input.nickname,
      title: input.title, email: emailChanged ? email : undefined, phone: input.phone, bio: input.bio,
      photoUrl: input.photoUrl === "" ? null : input.photoUrl,
      birthday: input.birthday === "" ? null : input.birthday ? new Date(input.birthday) : undefined,
      emailVerifiedAt: emailChanged ? null : undefined,
      tags: input.tags ? { set: [], connectOrCreate: [...new Set(input.tags)].map(name => ({ where: { name }, create: { name } })) } : undefined,
    }, include: { organization: true, tags: true, adminRoles: { where: { validFrom: { lte: new Date() }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] } } } });
    return { member, emailChanged };
  }, { isolationLevel: "Serializable" });
}
