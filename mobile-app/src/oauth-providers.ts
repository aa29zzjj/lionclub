export type NativeOAuthProvider = "google" | "apple";

/** Accept only the versioned server contract, never a platform-only guess. */
export function readNativeOAuthProviders(value: unknown): NativeOAuthProvider[] {
  if (!value || typeof value !== "object") throw Error("INVALID_PROVIDERS");
  const row = value as { protocolVersion?: unknown; providers?: unknown };
  if (row.protocolVersion !== 2 || !Array.isArray(row.providers) || row.providers.length !== 2) throw Error("INVALID_PROVIDERS");
  const seen = new Set<string>();
  const enabled: NativeOAuthProvider[] = [];
  for (const item of row.providers) {
    if (!item || typeof item !== "object" || !["google", "apple"].includes(item.id)
      || typeof item.enabled !== "boolean" || seen.has(item.id)) throw Error("INVALID_PROVIDERS");
    seen.add(item.id);
    if (item.enabled) enabled.push(item.id);
  }
  return enabled;
}
