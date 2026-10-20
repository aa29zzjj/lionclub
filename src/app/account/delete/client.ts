// Browser-only request contract. No automatic retries for a destructive action.
export type DeletionIdentity = { id: string; name: string; email: string | null };
type Transport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type DeletionResult =
  | { kind: "deleted"; cleanupPending: boolean }
  | { kind: "rejected"; status: number; message: string; retryAfterSeconds?: number }
  | { kind: "unknown"; message: string };

const unknownResult = (): DeletionResult => ({ kind: "unknown", message: "連線或回覆中斷，尚無法確認刪除結果。請先重新確認登入狀態，不要直接重複提交。" });

export async function readDeletionIdentity(transport: Transport = fetch): Promise<DeletionIdentity | null> {
  const response = await transport("/api/me", { cache: "no-store", credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("目前無法確認登入狀態，請重新載入後再操作。");
  const data = await response.json().catch(() => null);
  if (!data || typeof data.id !== "string" || typeof data.name !== "string" || (data.email !== null && typeof data.email !== "string")) throw new Error("登入資料不完整，請重新載入後再操作。");
  return { id: data.id, name: data.name, email: data.email };
}

export async function loginForDeletion(email: string, password: string, transport: Transport = fetch) {
  const response = await transport("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "登入未完成，請檢查信箱與密碼。");
  if (data.ok !== true) throw new Error("登入結果尚未確認，請重新確認登入狀態。");
}

export async function deleteOwnAccount(password: string, transport: Transport = fetch, options: { federatedReauthenticated?: boolean } = {}): Promise<DeletionResult> {
  if (!password && !options.federatedReauthenticated) return { kind: "rejected", status: 400, message: "請輸入目前密碼確認。" };
  try {
    const response = await transport("/api/me/account-deletion", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(password ? { password } : {}) });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      return data?.ok === true && data.accountDeleted === true && typeof data.cleanupPending === "boolean"
        ? { kind: "deleted", cleanupPending: data.cleanupPending } : unknownResult();
    }
    // A 5xx can occur after a commit; do not tell the person that nothing changed.
    if (response.status >= 500) return unknownResult();
    const retry = Number(response.headers.get("Retry-After"));
    return { kind: "rejected", status: response.status, message: typeof data?.error === "string" ? data.error : "尚未完成刪除，請確認登入狀態與密碼後再試。", ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.ceil(retry) } : {}) };
  } catch { return unknownResult(); }
}
