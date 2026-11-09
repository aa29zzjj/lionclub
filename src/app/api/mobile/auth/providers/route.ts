import { resolvePublicProviders } from "@/lib/federated-auth-runtime";
import { nativeOAuthJson } from "@/lib/mobile-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const unavailable = (reasonCode: string) => ["google", "apple"].map(id => ({
    id, name: id === "google" ? "Google" : "Apple", enabled: false, reasonCode,
  }));
  // Availability is public configuration. Disabled native OAuth must neither
  // read credentials nor depend on the database/migration being deployed.
  if (process.env.MOBILE_OAUTH_V2_ENABLED !== "true") {
    return nativeOAuthJson({ protocolVersion: 2, providers: unavailable("PROVIDER_DISABLED") });
  }
  try { return nativeOAuthJson({ protocolVersion: 2, providers: await resolvePublicProviders() }); }
  catch { return nativeOAuthJson({ protocolVersion: 2, providers: unavailable("OAUTH_RUNTIME_UNAVAILABLE") }, 503); }
}
