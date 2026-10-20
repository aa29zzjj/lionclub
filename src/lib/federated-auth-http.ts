import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FederatedAuthError } from "./federated-auth";
import { isMissingFederatedTable } from "./federated-auth-service";

export const OAUTH_BROWSER_COOKIE = "lionclub_oauth_browser";
export const OAUTH_PENDING_COOKIE = "lionclub_oauth_pending";
export const OAUTH_REAUTH_COOKIE = "lionclub_oauth_reauth";
export const oauthNoStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export function oauthJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: oauthNoStore }); }
export async function readOAuthCookie(name: string) { return (await cookies()).get(name)?.value; }
export async function setOAuthCookie(name: string, value: string, seconds: number, crossSite = false) {
  const secure = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https:") || process.env.NODE_ENV === "production";
  (await cookies()).set(name, value, { httpOnly: true, secure, sameSite: crossSite && secure ? "none" : "lax", path: "/", maxAge: seconds });
}
export async function clearOAuthCookie(name: string) { (await cookies()).delete(name); }
export function oauthErrorResponse(error: unknown) {
  if (error instanceof FederatedAuthError) return oauthJson({ error: error.message, code: error.code }, error.status);
  if (isMissingFederatedTable(error)) return oauthJson({ error: "第三方登入尚未完成資料庫部署，請使用既有登入方式", code: "OAUTH_NOT_DEPLOYED" }, 503);
  if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) return oauthJson({ error: "帳號或驗證資料同時更新，請重新開始", code: "OAUTH_CONFLICT" }, 409);
  return oauthJson({ error: "第三方驗證暫時無法完成，請重新開始", code: "OAUTH_FAILED" }, 503);
}
export function oauthErrorCode(error: unknown) {
  const response = error instanceof FederatedAuthError ? error.code : isMissingFederatedTable(error) ? "OAUTH_NOT_DEPLOYED" : "OAUTH_FAILED";
  return /^[A-Z_]{1,60}$/.test(response) ? response : "OAUTH_FAILED";
}
