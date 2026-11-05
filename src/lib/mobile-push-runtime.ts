import { mobilePushSettings, MOBILE_PUSH_TOPIC, type MobilePushSettings } from "./mobile-push-config";
type Environment = Record<string, string | undefined>;

/** Explicit secret reference, cached outside SQL transactions. Never load a
 * secret on unconfigured installs, never bundle a key into Amplify artifacts. */
export function createMobilePushRuntimeResolver(options: { environment: Environment; fetchSecret(name: string): Promise<unknown>; now?: () => number }) {
  const env = options.environment, clock = options.now ?? Date.now;
  let cached: MobilePushSettings | undefined, expiresAt = 0, pending: Promise<MobilePushSettings> | undefined;
  return async function resolve(): Promise<MobilePushSettings> {
    if (env.MOBILE_PUSH_ENABLED !== "true" || env.APNS_TOPIC !== MOBILE_PUSH_TOPIC || !["sandbox", "production"].includes(env.APNS_ENVIRONMENT ?? "")) return { enabled: false };
    if (env.PUSH_DEVICE_ENCRYPTION_KEY) return mobilePushSettings(env); // An explicit invalid key never borrows another source.
    const name = env.MOBILE_PUSH_SECRETS_NAME;
    if (env.MOBILE_PUSH_RUNTIME_SECRETS_ENABLED !== "true" || !name || !/^[A-Za-z0-9/_+=.@:-]{1,2048}$/.test(name)) return { enabled: false };
    if (cached && expiresAt > clock()) return cached;
    if (!pending) pending = options.fetchSecret(name).then(value => {
      const key = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).PUSH_DEVICE_ENCRYPTION_KEY : undefined;
      cached = mobilePushSettings({ ...env, PUSH_DEVICE_ENCRYPTION_KEY: typeof key === "string" ? key : undefined });
      expiresAt = clock() + 5 * 60_000; return cached;
    }).catch(() => { cached = { enabled: false }; expiresAt = clock() + 10_000; return cached; }).finally(() => { pending = undefined; });
    return pending;
  };
}
export const resolveMobilePushSettings = createMobilePushRuntimeResolver({ environment: process.env, fetchSecret: async name => {
  const { loadFromSecretsManager } = await import("./secrets-aws");
  return loadFromSecretsManager(name);
} });
