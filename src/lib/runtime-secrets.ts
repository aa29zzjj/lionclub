// Pure, dependency-injected resolver for tests. The AWS adapter lives in the
// server-only secrets-aws.ts module; never import that adapter from a client module.
export const OAUTH_RUNTIME_KEYS = ["FEDERATED_AUTH_ENABLED", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_FRESH_REAUTH_ENABLED", "OAUTH_APP_ORIGIN", "NEXT_PUBLIC_APP_URL"] as const;
const SECRET_KEYS = ["DATABASE_URL", "AUTH_SECRET", ...OAUTH_RUNTIME_KEYS] as const;
type SecretKey = typeof SECRET_KEYS[number];
export type OAuthRuntimeSettings = Partial<Record<typeof OAUTH_RUNTIME_KEYS[number], string>> & { NODE_ENV?: string };
export type AppSecrets = { DATABASE_URL: string; AUTH_SECRET: string };
type Environment = Record<string, string | undefined>;
const present = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function canonicalOrigin(value: string) {
  try { const url = new URL(value); return value.trim() === value && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null; }
  catch { return null; }
}

export function pickApprovedSecrets(value: unknown): Partial<Record<SecretKey, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("APP_SECRET_INVALID");
  const result: Partial<Record<SecretKey, string>> = {};
  for (const key of SECRET_KEYS) {
    const candidate = (value as Record<string, unknown>)[key];
    if (candidate === undefined || candidate === null || candidate === "") continue;
    // Invalid optional OAuth settings must disable OAuth, not break otherwise
    // valid DATABASE_URL/AUTH_SECRET used by existing password accounts.
    if (!present(candidate)) continue;
    result[key] = candidate;
  }
  return result;
}

export function createRuntimeSecretsResolver(options: { environment: Environment; fetchSecret: (name: string) => Promise<unknown>; now?: () => number; cacheMs?: number }) {
  const env = options.environment, clock = options.now ?? Date.now;
  let cached: Partial<Record<SecretKey, string>> | undefined, expiresAt = 0;
  let pending: Promise<Partial<Record<SecretKey, string>>> | undefined;
  async function stored() {
    if (cached && expiresAt > clock()) return cached;
    if (!pending) {
      const name = env.APP_SECRETS_NAME?.trim() || "lionclub/app-secrets";
      // This name is operator-controlled, never derived from an HTTP request.
      pending = options.fetchSecret(name).then(pickApprovedSecrets).then(value => {
        cached = value; expiresAt = clock() + (options.cacheMs ?? 5 * 60_000); return value;
      }).catch(() => { throw Error("APP_SECRET_UNAVAILABLE"); }).finally(() => { pending = undefined; });
    }
    return pending;
  }
  function preferred(key: SecretKey, fallback?: Partial<Record<SecretKey, string>>) { return present(env[key]) ? env[key] : fallback?.[key]; }
  async function getAppSecrets(): Promise<AppSecrets> {
    const fallback = present(env.DATABASE_URL) && present(env.AUTH_SECRET) ? undefined : await stored();
    const DATABASE_URL = preferred("DATABASE_URL", fallback), AUTH_SECRET = preferred("AUTH_SECRET", fallback);
    if (!DATABASE_URL || !AUTH_SECRET) throw Error("APP_SECRET_INCOMPLETE");
    return { DATABASE_URL, AUTH_SECRET };
  }
  async function getOAuthRuntimeSettings(): Promise<OAuthRuntimeSettings> {
    // Explicit false wins over a stored true. In unconfigured installations a
    // public providers request must not probe the AWS metadata credential chain.
    const hasGoogle = present(env.GOOGLE_OAUTH_CLIENT_ID) && present(env.GOOGLE_OAUTH_CLIENT_SECRET)
      && (present(env.OAUTH_APP_ORIGIN) || present(env.NEXT_PUBLIC_APP_URL)) && present(env.FEDERATED_AUTH_ENABLED);
    const fallback = env.OAUTH_RUNTIME_SECRETS_ENABLED === "true" && env.FEDERATED_AUTH_ENABLED !== "false" && !hasGoogle ? await stored() : undefined;
    if (fallback) {
      // An incomplete env credential bundle may borrow only from the SAME
      // stored client, never silently pair client A with client B's secret.
      const envId = present(env.GOOGLE_OAUTH_CLIENT_ID) ? env.GOOGLE_OAUTH_CLIENT_ID : undefined;
      const envSecret = present(env.GOOGLE_OAUTH_CLIENT_SECRET) ? env.GOOGLE_OAUTH_CLIENT_SECRET : undefined;
      if (envId && fallback.GOOGLE_OAUTH_CLIENT_ID !== envId
        || envSecret && fallback.GOOGLE_OAUTH_CLIENT_SECRET !== envSecret) throw Error("APP_OAUTH_SOURCE_CONFLICT");
      const envOrigin = env.OAUTH_APP_ORIGIN || env.NEXT_PUBLIC_APP_URL;
      const storedOrigin = fallback.OAUTH_APP_ORIGIN || fallback.NEXT_PUBLIC_APP_URL;
      if (present(envOrigin) && present(storedOrigin) && (!canonicalOrigin(envOrigin) || canonicalOrigin(envOrigin) !== canonicalOrigin(storedOrigin))) throw Error("APP_OAUTH_SOURCE_CONFLICT");
    }
    const result: OAuthRuntimeSettings = { NODE_ENV: env.NODE_ENV };
    for (const key of OAUTH_RUNTIME_KEYS) { const value = preferred(key, fallback); if (value !== undefined) result[key] = value; }
    // Apple credentials are intentionally not allowlisted for this release.
    return result;
  }
  return { getAppSecrets, getOAuthRuntimeSettings };
}
