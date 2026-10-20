import { publicProviders } from "@/lib/federated-auth";
import { oauthJson } from "@/lib/federated-auth-http";
export const dynamic = "force-dynamic";
export async function GET() { return oauthJson({ providers: publicProviders() }); }
