import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "./prisma";
import { getCurrentMember } from "./current-member";
import { requireMobileMember } from "./mobile-request-auth";
import { isTrustedBrowserMutation } from "./browser-origin";
import { isRateLimited } from "./rate-limit";
import { ServiceError, currentServiceYear } from "./service-contract";
import { hasServiceSchema, getServiceHub, performServiceAction, exportEventOutcome, exportServicePassport } from "./service-hub";

const id = z.string().trim().min(1).max(200);
const querySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).default(() => currentServiceYear()),
  view: z.enum(["hub", "passport-export", "outcome-export"]).default("hub"), id: id.optional(),
  needsCursor: id.optional(), entriesCursor: id.optional(), eventsCursor: id.optional(), reviewCursor: id.optional(),
  category: z.string().trim().max(40).optional(), kind: z.enum(["NEED", "OFFER"]).optional(), mine: z.enum(["true", "false"]).optional(),
  reviewStatus: z.enum(["PENDING", "CONFIRMED", "REJECTED", "REVOKED"]).optional(),
}).strict();
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, Authorization", "Referrer-Policy": "no-referrer" } });

/** The two transports share business rules, never authentication credentials. */
export async function serviceHttp(request: NextRequest, mobile: boolean) {
  try {
    const mutation = request.method === "POST";
    if (!mobile && mutation && !isTrustedBrowserMutation(request)) return json({ error: "請從網站操作" }, 403);
    const auth = mobile ? await requireMobileMember(request) : await (async () => {
      const member = await getCurrentMember();
      return member ? { member, prisma: await getPrisma() } : null;
    })();
    if (!auth) return json({ error: mobile ? "未登入或登入已過期" : "未登入" }, 401);
    const expectedMember = request.headers.get("x-lionclubs-member");
    if ((mutation || expectedMember !== null) && expectedMember !== auth.member.id) return json({ error: "登入帳號已切換，請返回首頁重新確認。", code: "SESSION_CHANGED" }, 409);
    if (process.env.SERVICE_FEATURES_ENABLED === "false" || !await hasServiceSchema(auth.prisma)) return json({ error: "服務中心正在準備中，請稍後再試。", code: "SERVICE_UNAVAILABLE" }, 503);
    if (mutation) {
      if (await isRateLimited(`service-write:${auth.member.id}`, 30)) return json({ error: "操作太頻繁，請稍後再試。" }, 429);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "請填寫操作內容" }, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > 16384) { await reader.cancel(); return json({ error: "資料超過大小限制" }, 413); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const body = Buffer.concat(chunks).toString("utf8");
      let value: unknown; try { value = JSON.parse(body); } catch { return json({ error: "資料格式不正確" }, 400); }
      return json(await performServiceAction(auth.prisma, auth.member.id, value));
    }
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return json({ error: "篩選條件或頁次格式不正確" }, 400);
    const q = parsed.data;
    if (q.view === "passport-export") return json(await exportServicePassport(auth.prisma, auth.member.id, q.year));
    if (q.view === "outcome-export") {
      if (!q.id) return json({ error: "請選擇活動" }, 400);
      return json(await exportEventOutcome(auth.prisma, auth.member.id, q.id));
    }
    return json(await getServiceHub(auth.prisma, auth.member.id, { ...q, mine: q.mine === "true" }));
  } catch (error) {
    if (error instanceof ServiceError) return json({ error: error.message, ...(error.status === 403 && error.message.includes("使用條款") ? { code: "TERMS_REQUIRED" } : {}) }, error.status);
    // Native/server exceptions can contain database details. Do not surface or log them.
    return json({ error: "服務資料未完成讀取或儲存。請重新載入核對結果後再試。", code: "SERVICE_UNAVAILABLE" }, 503);
  }
}
