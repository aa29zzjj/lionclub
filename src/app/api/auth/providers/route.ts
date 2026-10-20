import { publicProviders } from "@/lib/federated-auth";
import { oauthJson } from "@/lib/federated-auth-http";
export const dynamic = "force-dynamic";
export async function GET() {
  console.log("[diag-oauth-env]", JSON.stringify({
    enabled: process.env.FEDERATED_AUTH_ENABLED ?? null,
    hasGoogleId: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    hasGoogleSecret: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  }));
  return oauthJson({ providers: publicProviders() });
}
