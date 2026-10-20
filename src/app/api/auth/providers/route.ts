import { publicProviders } from "@/lib/federated-auth";
import { oauthJson } from "@/lib/federated-auth-http";
export async function GET() { return oauthJson({ providers: publicProviders() }); }
