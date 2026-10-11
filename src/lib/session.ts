import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAppSecrets } from "./secrets";

const COOKIE_NAME = "lionclub_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 天

async function getSecretKey() {
  const { AUTH_SECRET } = await getAppSecrets();
  return new TextEncoder().encode(AUTH_SECRET);
}

export type SessionPayload = {
  userId: string;
  memberId: string;
  email: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(await getSecretKey());

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

  try {
    const { payload } = await jwtVerify(token, await getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
