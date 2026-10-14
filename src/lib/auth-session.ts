import { SignJWT, jwtVerify } from "jose";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
export type SessionPayload = { userId: string; memberId: string; email: string; sessionVersion: number };
export type SessionUser = { id: string; memberId: string | null; email: string; sessionVersion: number; member?: { memberNo: string | null } | null };

export function isProductionDemoEmail(email: string, production = process.env.NODE_ENV === "production") {
  return production && email.trim().toLowerCase() === "demo@lions.tw";
}
export function isProductionDemoUser(user: Pick<SessionUser, "email" | "member">, production = process.env.NODE_ENV === "production") {
  return production && (isProductionDemoEmail(user.email, production) || user.member?.memberNo === "DEMO-0001");
}
export function productionLoginDenial(email: string, password: string, user?: Pick<SessionUser, "email" | "member">, production = process.env.NODE_ENV === "production") {
  if (!production) return null;
  if (isProductionDemoEmail(email, production) || (user && isProductionDemoUser(user, production))) return { status: 401, error: "帳號或密碼錯誤" };
  if (password.length < 8) return { status: 403, error: "請使用「忘記密碼」設定至少 8 字元的新密碼後登入", code: "PASSWORD_RESET_REQUIRED" };
  return null;
}

export async function signSessionToken(payload: SessionPayload, key: Uint8Array) {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime(`${SESSION_DURATION_SECONDS}s`).sign(key);
}

/** DB identity and version are authoritative; legacy JWTs only match version zero. */
export async function readSessionToken(token: string, dependencies: {
  key: Uint8Array;
  findUser: (id: string) => Promise<SessionUser | null>;
  production?: boolean;
}): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, dependencies.key, { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.memberId !== "string" || typeof payload.email !== "string") return null;
    const version = payload.sessionVersion === undefined ? 0 : payload.sessionVersion;
    if (!Number.isSafeInteger(version) || Number(version) < 0) return null;
    if (isProductionDemoEmail(payload.email, dependencies.production)) return null;
    const user = await dependencies.findUser(payload.userId);
    if (!user || user.memberId !== payload.memberId || user.sessionVersion !== version || isProductionDemoUser(user, dependencies.production)) return null;
    return { userId: user.id, memberId: user.memberId, email: user.email, sessionVersion: user.sessionVersion };
  } catch {
    return null;
  }
}
