// Server-only configuration. No NEXT_PUBLIC_* flags, no key in API responses.
export const MOBILE_PUSH_TOPIC = "com.lionclubsmembership.app";
export const MOBILE_PUSH_LEASE_MS = 24 * 60 * 60 * 1000;
export const MOBILE_PUSH_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MOBILE_PUSH_DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;
export type MobilePushEnvironment = "sandbox" | "production";
export type MobilePushSettings = { enabled: false } | {
  enabled: true; environment: MobilePushEnvironment; topic: typeof MOBILE_PUSH_TOPIC; encryptionKey: string;
};
export function mobilePushSettings(environment: Record<string, string | undefined> = process.env): MobilePushSettings {
  const mode = environment.APNS_ENVIRONMENT, key = environment.PUSH_DEVICE_ENCRYPTION_KEY;
  if (environment.MOBILE_PUSH_ENABLED !== "true" || !["sandbox", "production"].includes(mode ?? "")
    || environment.APNS_TOPIC !== MOBILE_PUSH_TOPIC || !key || !/^[0-9a-fA-F]{64}$/.test(key)) return { enabled: false };
  return { enabled: true, environment: mode as MobilePushEnvironment, topic: MOBILE_PUSH_TOPIC, encryptionKey: key.toLowerCase() };
}
export function publicMobilePushConfig(settings = mobilePushSettings()) {
  return { enabled: settings.enabled, environment: settings.enabled ? settings.environment : null,
    topic: settings.enabled ? settings.topic : null, privacyMode: "generic" as const };
}
