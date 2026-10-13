import type { NextRequest } from "next/server";

/** Cookie-writing browser requests need an explicit, trusted Origin. Native auth is separate. */
export function isTrustedBrowserMutation(request: Pick<NextRequest, "headers" | "nextUrl">, configuredOrigin = process.env.NEXT_PUBLIC_APP_URL) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return origin === new URL(configuredOrigin || request.nextUrl.origin).origin; }
  catch { return false; }
}
