import { readServiceHub, type ServiceHubData } from "./service-contract";

export class ServiceClientError extends Error {
  constructor(message: string, public code = "UNKNOWN", public status?: number) { super(message); }
}
export type ServiceRequest = (method: "GET" | "POST", query: string, body: unknown, expectedMemberId: string) => Promise<{ status: number; data: unknown }>;
export type ServiceTransport = ReturnType<typeof createServiceTransport>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function createServiceTransport(memberId: string, request: ServiceRequest, current: () => boolean = () => true) {
  const assertCurrent = () => { if (!current()) throw new ServiceClientError("登入帳號已切換，請返回首頁重新確認。", "SESSION_CHANGED"); };
  async function call(method: "GET" | "POST", query: string, body?: unknown) {
    assertCurrent(); let response: { status: number; data: unknown };
    try { response = await request(method, query, body, memberId); }
    catch { assertCurrent(); throw new ServiceClientError(method === "POST" ? "儲存結果尚未確認，請先重新載入核對，草稿仍保留。" : "無法連線，請確認網路後重新載入。", "NETWORK"); }
    assertCurrent();
    if (response.status !== 200) {
      const data = object(response.data) ? response.data : {};
      const message = typeof data.error === "string" && data.error.length <= 500 ? data.error : "服務暫時無法完成，請重新載入核對。";
      throw new ServiceClientError(message, typeof data.code === "string" ? data.code : response.status === 401 ? "SESSION_CHANGED" : "UNKNOWN", response.status);
    }
    return response.data;
  }
  return {
    isCurrent: current,
    async read(query: string): Promise<ServiceHubData> {
      const data = readServiceHub(await call("GET", query));
      if (data.viewerId !== memberId) throw new ServiceClientError("登入帳號已切換，請返回首頁重新確認。", "SESSION_CHANGED");
      return data;
    },
    async mutate(body: unknown) {
      const data = await call("POST", "", body);
      if (!object(data) || data.ok !== true) throw new ServiceClientError("儲存回覆尚未確認，請先重新載入核對。", "UNCONFIRMED");
      return data;
    },
    async export(query: string) {
      const data = await call("GET", query);
      if (!object(data) || typeof data.content !== "string" || data.content.length > 1000000 || typeof data.filename !== "string" || !/^[A-Za-z0-9._-]+\.md$/.test(data.filename)) throw new ServiceClientError("匯出資料未完成，沒有產生不完整檔案。", "INVALID_RESPONSE");
      return { filename: data.filename, content: data.content };
    },
  };
}
