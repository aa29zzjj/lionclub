/** Never build credential-bearing email links from an untrusted production Host. */
export function getAuthAppOrigin(fallbackOrigin: string, options: { configuredOrigin?: string; production?: boolean } = {}) {
  const configured = options.configuredOrigin ?? process.env.NEXT_PUBLIC_APP_URL;
  const production = options.production ?? process.env.NODE_ENV === "production";
  if (production && !configured) throw new Error("AUTH_APP_ORIGIN_UNCONFIGURED");
  let parsed: URL;
  try { parsed = new URL(configured || fallbackOrigin); }
  catch { throw new Error("AUTH_APP_ORIGIN_INVALID"); }
  if (parsed.username || parsed.password || !["https:", "http:"].includes(parsed.protocol) || (production && parsed.protocol !== "https:")) throw new Error("AUTH_APP_ORIGIN_INVALID");
  return parsed.origin;
}
