import { NextRequest } from "next/server";
import { getPrisma } from "./prisma";
import { getAppSecrets } from "./secrets";
import { bearerToken, readMobileToken } from "./mobile-auth";
import { getMemberForSession } from "./current-member";
import type { SessionUser } from "./auth-session";

/**
 * Bearer-token counterpart of getCurrentMember(), for /api/mobile/* routes.
 * Mobile mutations intentionally skip isTrustedBrowserMutation() — see
 * mobile-auth.ts's module comment for why bearer possession is the trust
 * boundary instead of the web cookie flow's Origin check.
 */
export async function requireMobileMember(req: NextRequest) {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return null;

  const prisma = await getPrisma();
  const { AUTH_SECRET } = await getAppSecrets();
  const key = new TextEncoder().encode(AUTH_SECRET);

  const session = await readMobileToken(token, "mobile_access", {
    key,
    findUser: (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { id: true, memberId: true, email: true, sessionVersion: true, member: { select: { memberNo: true } } },
      }) as unknown as Promise<SessionUser | null>,
    production: process.env.NODE_ENV === "production",
  });
  if (!session) return null;

  const member = await getMemberForSession(session);
  if (!member) return null;

  return { prisma, session, member };
}
