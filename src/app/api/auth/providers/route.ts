import { resolvePublicProviders } from "@/lib/federated-auth-runtime";
import { oauthJson } from "@/lib/federated-auth-http";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return oauthJson({ providers: await resolvePublicProviders() }); }
  catch { return oauthJson({ providers: ["google", "apple"].map(id => ({ id, name: id === "google" ? "Google" : "Apple", enabled: false, reasonCode: "OAUTH_RUNTIME_UNAVAILABLE" })) }, 503); }
}
