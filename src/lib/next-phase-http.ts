import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "./current-member";
import { getPrisma } from "./prisma";
import { requireMobileMember } from "./mobile-request-auth";
import { isTrustedBrowserMutation } from "./browser-origin";
import { isRateLimited } from "./rate-limit";
import { ServiceError } from "./service-contract";
import { maxBusinessCardBytes, nextPhaseAction, nextPhaseEnabled, nextPhaseQuery } from "./next-phase-contract";
import { hasPhaseNoticeSchema } from "./phase-notices";
import { hasNextPhaseSchema, readNextPhase, writeNextPhase } from "./next-phase";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });

async function readBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > Math.ceil(maxBusinessCardBytes / 3) * 4 + 4096) {
        await reader.cancel();
        throw new ServiceError(413, "資料超過大小限制");
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return null; }
}

export async function nextPhaseHttp(request: NextRequest, mobile: boolean) {
  if (!nextPhaseEnabled) return json({ error: "測試功能尚未開放" }, 404);
  try {
    const mutation = request.method === "POST";
    if (!mobile && mutation && !isTrustedBrowserMutation(request)) return json({ error: "請從網站操作" }, 403);
    const auth = mobile ? await requireMobileMember(request) : await (async () => {
      const member = await getCurrentMember();
      return member ? { member, prisma: await getPrisma() } : null;
    })();
    if (!auth) return json({ error: "未登入或登入已過期" }, 401);
    const memberId = auth.member.id;
    if (request.headers.get("x-lionclubs-member") !== memberId) return json({ error: "登入帳號已切換，請重新開啟畫面。" }, 409);
    if (!await hasNextPhaseSchema(auth.prisma) || !await hasPhaseNoticeSchema(auth.prisma)) return json({ error: "測試資料庫尚未準備完成" }, 503);
    if (mutation) {
      if (await isRateLimited(`next-phase-write:${memberId}`, 45)) return json({ error: "操作太頻繁，請稍後再試。" }, 429);
      const action = nextPhaseAction.safeParse(await readBody(request));
      if (!action.success) return json({ error: "資料格式不正確，請檢查輸入內容和圖片大小。" }, 400);
      if (action.data.action === "meetup.report" && await isRateLimited(`next-phase-report:${memberId}`, 5)) return json({ error: "檢舉次數過多，請稍後再試。" }, 429);
      return json(await writeNextPhase(auth.prisma, memberId, action.data));
    }
    const query = nextPhaseQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return json({ error: "讀取條件不正確" }, 400);
    return json(await readNextPhase(auth.prisma, memberId, query.data));
  } catch (error) {
    if (error instanceof ServiceError) return json({ error: error.message, ...(error.status === 403 && error.message.includes("使用條款") ? { code: "TERMS_REQUIRED" } : {}) }, error.status);
    return json({ error: "資料未完成讀取或儲存。請重新載入核對後再試。" }, 503);
  }
}
