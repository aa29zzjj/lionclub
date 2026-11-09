// Browser-only transport: no provider tokens, runtime settings or secret values.
export type EmailAction = "link" | "sessions" | "delete";
export type EmailChallenge = { challengeId: string; action: EmailAction; memberId: string; expiresAt: string; maskedEmail: string };
type Transport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function send(path: string, body: unknown, transport: Transport, signal?: AbortSignal) {
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await transport(path, { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || !record(data) || data.ok !== true) throw Error(response.status === 429 ? "操作次數過多，請稍後再試。" : "信箱驗證結果尚未確認，請重新取得驗證碼；尚未執行安全操作。");
    return data;
  } catch (error) {
    if (error instanceof Error && !(error instanceof TypeError) && !controller.signal.aborted) throw error;
    throw Error("連線中斷或逾時，驗證結果尚未確認；不會自動重送。");
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}
export async function requestEmailAction(memberId: string, action: EmailAction, transport: Transport = fetch, signal?: AbortSignal): Promise<EmailChallenge> {
  if (!memberId || !["link", "sessions", "delete"].includes(action)) throw Error("請先重新確認本人帳號及操作。");
  const data = await send("/api/me/email-action/start", { action }, transport, signal);
  if (data.memberId !== memberId || data.action !== action || !uuid(data.challengeId) || !date(data.expiresAt)
    || typeof data.maskedEmail !== "string" || data.maskedEmail.length > 254 || !data.maskedEmail.includes("***@")) throw Error("驗證碼寄送回覆與本人操作不符，請重新確認。");
  return data as unknown as EmailChallenge;
}
export async function confirmEmailAction(memberId: string, action: EmailAction, challengeId: string, code: string, transport: Transport = fetch, signal?: AbortSignal) {
  if (!memberId || !["link", "sessions", "delete"].includes(action) || !uuid(challengeId) || !/^[0-9]{6}$/.test(code)) throw Error("請輸入本次六位數驗證碼。");
  const data = await send("/api/me/email-action/verify", { action, challengeId, code }, transport, signal);
  if (data.memberId !== memberId || data.action !== action || !date(data.proofExpiresAt) || "proof" in data) throw Error("本人驗證回覆尚未確認，請重新讀取驗證方式。");
  return { proofExpiresAt: data.proofExpiresAt };
}
