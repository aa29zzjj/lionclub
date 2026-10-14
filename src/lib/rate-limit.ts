import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "./prisma";

export const WINDOW_MS = 10 * 60 * 1000;
export type RateLimitDatabase = {
  rateLimitAttempt: {
    upsert: (query: { where: { key: string }; create: { key: string; windowStart: Date; count: number }; update: { count: { increment: number } } }) => Promise<{ count: number }>;
  };
};
export type RateLimitResult = { limited: boolean; count: number; limit: number; retryAfterSeconds: number; resetAt: Date };

export function getClientIp(req: Pick<NextRequest, "headers">): string {
  const value = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return value.slice(0, 100);
}

/** One unique row per key AND time window; first hits also use atomic increment. */
export async function consumeRateLimit(db: RateLimitDatabase, key: string, limit: number, windowMs = WINDOW_MS, now = new Date()): Promise<RateLimitResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) throw new Error("INVALID_RATE_LIMIT");
  const windowNumber = Math.floor(now.getTime() / windowMs);
  const windowStart = new Date(windowNumber * windowMs);
  const resetAt = new Date((windowNumber + 1) * windowMs);
  const windowKey = `v2:${crypto.createHash("sha256").update(key).digest("hex")}:${windowMs}:${windowNumber}`;
  const row = await db.rateLimitAttempt.upsert({ where: { key: windowKey }, create: { key: windowKey, windowStart, count: 1 }, update: { count: { increment: 1 } } });
  return { limited: row.count > limit, count: row.count, limit, retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)), resetAt };
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json({ error: "操作次數過多，請稍後再試", code: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds, resetAt: result.resetAt.toISOString() },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } });
}

// Compatibility for existing non-auth callers. Keep data-store errors fail-closed.
export async function isRateLimited(key: string, limit: number, windowMs = WINDOW_MS) {
  return (await consumeRateLimit(await getPrisma(), key, limit, windowMs)).limited;
}

export type AuthAction = "register" | "login" | "forgot-password" | "resend-verification" | "reset-password" | "verify-email" | "revoke-sessions";
const IP_LIMITS: Record<AuthAction, number> = { register: 1000, login: 600, "forgot-password": 100, "resend-verification": 100, "reset-password": 100, "verify-email": 600, "revoke-sessions": 100 };
const IDENTITY_LIMITS: Record<AuthAction, number> = { register: 5, login: 20, "forgot-password": 5, "resend-verification": 5, "reset-password": 10, "verify-email": 20, "revoke-sessions": 5 };

export async function consumeAuthLimits(db: RateLimitDatabase, action: AuthAction, ip: string, identity: string, invite?: string, now = new Date()) {
  const limits: Array<[string, number]> = [
    [`${action}:ip:${ip}`, IP_LIMITS[action]],
    [`${action}:identity:${identity.trim().toLowerCase()}`, IDENTITY_LIMITS[action]],
  ];
  if (action === "register" && invite) limits.push([`register:invite:${invite}`, 2000]);
  for (const [key, limit] of limits) {
    const result = await consumeRateLimit(db, key, limit, WINDOW_MS, now);
    if (result.limited) return result;
  }
  return null;
}
