import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { MobilePushSettings } from "./mobile-push-config";

export type PushBinding = { installationId: string; userId: string; memberId: string; sessionVersion: number; bindingVersion: number; environment: string; topic: string };
export function normalizedPushToken(token: string) {
  // APNs explicitly says not to assume a fixed token size.
  if (!/^[0-9a-fA-F]{32,512}$/.test(token) || token.length % 2) throw new Error("INVALID_PUSH_TOKEN");
  return token.toLowerCase();
}
export function pushTokenHash(token: string) { return createHash("sha256").update(normalizedPushToken(token), "ascii").digest("hex"); }
function aad(binding: PushBinding) {
  return Buffer.from(JSON.stringify(["lionclubs-push-v1", binding.installationId, binding.userId, binding.memberId,
    binding.sessionVersion, binding.bindingVersion, binding.environment, binding.topic]));
}
export function encryptPushToken(token: string, binding: PushBinding, settings: MobilePushSettings) {
  if (!settings.enabled) throw new Error("PUSH_NOT_CONFIGURED");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(settings.encryptionKey, "hex"), iv);
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(normalizedPushToken(token), "ascii"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptPushToken(value: string, binding: PushBinding, settings: MobilePushSettings) {
  if (!settings.enabled || value.length > 2048) throw new Error("PUSH_TOKEN_UNAVAILABLE");
  try {
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const [iv, tag, ciphertext] = parts.slice(1).map(part => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 512) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(settings.encryptionKey, "hex"), iv);
    decipher.setAAD(aad(binding)); decipher.setAuthTag(tag);
    return normalizedPushToken(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("ascii"));
  } catch { throw new Error("PUSH_TOKEN_UNAVAILABLE"); }
}
