import type { PrismaClient } from "@prisma/client";
import type { SessionPayload } from "./auth-session";

export class SessionRevocationError extends Error {
  constructor(public readonly code: "PASSWORD_INVALID" | "SESSION_CONFLICT") { super(code); }
}

/** CAS the password/version checked, then retain only this device with a fresh JWT. */
export async function revokeOtherSessions(prisma: PrismaClient, session: SessionPayload, password: string,
  dependencies: {
    verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
    renewSession: (session: SessionPayload) => Promise<void>;
    clearSession: () => Promise<void>;
  },
) {
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.memberId !== session.memberId || user.sessionVersion !== session.sessionVersion) throw new SessionRevocationError("SESSION_CONFLICT");
  if (!(await dependencies.verifyPassword(password, user.passwordHash))) throw new SessionRevocationError("PASSWORD_INVALID");
  const changed = await prisma.user.updateMany({
    where: { id: user.id, memberId: session.memberId, sessionVersion: session.sessionVersion, passwordHash: user.passwordHash },
    data: { sessionVersion: { increment: 1 } },
  });
  if (changed.count !== 1) throw new SessionRevocationError("SESSION_CONFLICT");
  try {
    await dependencies.renewSession({ userId: user.id, memberId: session.memberId, email: user.email, sessionVersion: session.sessionVersion + 1 });
    return { currentSessionRetained: true };
  } catch {
    await dependencies.clearSession();
    return { currentSessionRetained: false };
  }
}
