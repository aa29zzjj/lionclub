import { cookies } from "next/headers";
import { getAppSecrets } from "./secrets";
import { getPrisma } from "./prisma";
import { isProductionDemoUser, readSessionToken, signSessionToken, SESSION_DURATION_SECONDS } from "./auth-session";
import type { SessionPayload } from "./auth-session";
export type { SessionPayload } from "./auth-session";

const COOKIE_NAME = "lionclub_session";

async function getSecretKey() {
  const { AUTH_SECRET } = await getAppSecrets();
  return new TextEncoder().encode(AUTH_SECRET);
}

export async function createSession(payload: Omit<SessionPayload, "sessionVersion"> & { sessionVersion?: number }) {
  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, memberId: true, email: true, sessionVersion: true, member: { select: { memberNo: true } } } });
  if (!user || user.memberId !== payload.memberId || isProductionDemoUser(user)) throw new Error("SESSION_IDENTITY_INVALID");
  if (payload.sessionVersion !== undefined && payload.sessionVersion !== user.sessionVersion) throw new Error("SESSION_VERSION_CHANGED");
  const token = await signSessionToken({ userId: user.id, memberId: payload.memberId, email: user.email, sessionVersion: user.sessionVersion }, await getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const prisma = await getPrisma();
  return readSessionToken(token, {
    key: await getSecretKey(),
    findUser: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, memberId: true, email: true, sessionVersion: true, member: { select: { memberNo: true } } } }),
  });
}
