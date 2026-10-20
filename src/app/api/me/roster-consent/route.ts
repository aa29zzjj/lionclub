import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { readRosterConsent, RosterConsentError, ROSTER_CONSENT_VERSION, updateRosterConsent } from "@/lib/roster-consent";

const schema = z.discriminatedUnion("accepted", [
  z.object({ accepted: z.literal(true), version: z.literal(ROSTER_CONSENT_VERSION) }),
  z.object({ accepted: z.literal(false) }),
]);
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const failure = (error: unknown) => error instanceof RosterConsentError
  ? response({ error: error.message, code: error.code, available: error.status !== 503 }, error.status) : null;

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return response({ error: "未登入" }, 401);
  try { return response(await readRosterConsent(await getPrisma(), me.id)); }
  catch (error) { const result = failure(error); if (result) return result; throw error; }
}

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return response({ error: "請從網站操作" }, 403);
  const me = await getCurrentMember();
  if (!me) return response({ error: "未登入" }, 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "請明確勾選目前版本的同意，或選擇撤回。", code: "EXPLICIT_CONSENT_REQUIRED" }, 400);
  try { return response(await updateRosterConsent(await getPrisma(), me.id, parsed.data.accepted)); }
  catch (error) { const result = failure(error); if (result) return result; throw error; }
}
