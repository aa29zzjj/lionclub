import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { centralRegistrationSchema, createCentralMember } from "@/lib/central-onboarding";
import { createSession } from "@/lib/session";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { readOAuthTransaction } from "@/lib/federated-auth-service";
import { FederatedAuthError, hashOAuthSecret, isAuthProvider, providerConfig } from "@/lib/federated-auth";
import { OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, clearOAuthCookie, oauthErrorResponse, oauthJson, readOAuthCookie } from "@/lib/federated-auth-http";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { OnboardingError } from "@/lib/central-onboarding";
const schema = centralRegistrationSchema.omit({ password: true, email: true }).extend({ oauthConsent: z.literal(true, "請同意以第三方身分資料建立登入連結") });
export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return oauthJson({ error: "請從網站操作註冊" }, 403);
  if (process.env.FEDERATED_AUTH_ENABLED !== "true") return oauthJson({ error: "第三方註冊尚未開放", code: "PROVIDER_DISABLED" }, 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return oauthJson({ error: parsed.error.issues[0]?.message || "註冊資料不正確" }, 400);
  try {
    const prisma = await getPrisma(), browser = await readOAuthCookie(OAUTH_BROWSER_COOKIE) || "";
    const row = await readOAuthTransaction(prisma, await readOAuthCookie(OAUTH_PENDING_COOKIE) || "", browser);
    if (row.purpose !== "login" || !row.email || !row.subject || !row.verifiedAt || !isAuthProvider(row.provider) || !providerConfig(row.provider)) throw new FederatedAuthError(400, "OAUTH_EXPIRED", "請重新完成第三方驗證");
    const token = parsed.data.token || row.inviteToken || undefined;
    const limited = await consumeAuthLimits(prisma, "register", getClientIp(request), row.email, token);
    if (limited) return rateLimitResponse(limited);
    const { member, user, organization } = await createCentralMember(prisma, { ...parsed.data, token, email: row.email }, null, undefined,
      { transactionId: row.id, browserHash: hashOAuthSecret(browser) });
    await createSession({ userId: user.id, memberId: member.id, email: user.email, sessionVersion: user.sessionVersion });
    await clearOAuthCookie(OAUTH_PENDING_COOKIE);
    return oauthJson({ ok: true, memberId: member.id, organizationName: organization.name, organizationAssignmentStatus: "NEEDS_ASSIGNMENT", canLogin: true });
  } catch (error) {
    if (error instanceof OnboardingError) return oauthJson({ error: error.message }, error.status);
    return oauthErrorResponse(error);
  }
}
