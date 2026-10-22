import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getCurrentMember } from "@/lib/current-member";
import { consumeOAuthReauth, isMissingFederatedTable } from "@/lib/federated-auth-service";
import { OAUTH_REAUTH_COOKIE, oauthErrorResponse, oauthJson, readOAuthCookie } from "@/lib/federated-auth-http";
import { providerReauthAvailable, providerConfig } from "@/lib/federated-auth";
import { resolveOAuthRuntimeSettings } from "@/lib/federated-auth-runtime";
export async function GET() {
  const session = await getSession();
  if (!session || !await getCurrentMember()) return oauthJson({ error: "未登入" }, 401);
  const prisma = await getPrisma(), user = await prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  const base = { hasPassword: Boolean(user?.passwordHash), identities: [], reauthenticated: false, reauthActions: [] as string[], available: false };
  try {
    const settings = await resolveOAuthRuntimeSettings();
    if (!providerConfig("google", settings)) return oauthJson(base);
    const identities = await prisma.federatedIdentity.findMany({ where: { userId: session.userId }, select: { provider: true, email: true } });
    const proof = await readOAuthCookie(OAUTH_REAUTH_COOKIE);
    const reauthenticated = await consumeOAuthReauth(prisma, session, proof, "sessions", false);
    const reauthActions = reauthenticated ? ["link", "sessions"] : [];
    return oauthJson({ hasPassword: base.hasPassword, identities: identities.map(identity => ({ ...identity, reauthAvailable: providerReauthAvailable(identity.provider, settings),
      ...(!providerReauthAvailable(identity.provider, settings) ? { reauthReason: "近期本人再驗證尚未完成供應商驗收，暫不支援安全操作", reauthReasonCode: "PROVIDER_REAUTH_UNAVAILABLE" } : {}) })), reauthenticated, reauthActions, available: true });
  } catch (error) {
    if (isMissingFederatedTable(error)) return oauthJson(base);
    return oauthErrorResponse(error);
  }
}
