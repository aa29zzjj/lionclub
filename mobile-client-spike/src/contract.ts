/** Engineering-only contracts: no fetch, cookies, password, storage or native APIs. */
export type SpikeErrorCode = "UNCONFIGURED_TRANSPORT" | "OFFLINE" | "UNAUTHENTICATED";
export class SpikeError extends Error {
  constructor(public readonly code: SpikeErrorCode, message: string) { super(message); }
}
export type SyntheticMember = { id: string; name: string; organization: string; synthetic: true };
export type SpikeTransport = {
  readonly kind: "synthetic" | "unconfigured";
  login(): Promise<void>;
  me(): Promise<SyntheticMember>;
  logout(): Promise<{ confirmation: "synthetic" | "offline-local-only" }>;
};

export function createSyntheticTransport(initiallyOnline = true): SpikeTransport & { setOnline(value: boolean): void } {
  let online = initiallyOnline;
  let signedIn = false;
  const requireOnline = () => { if (!online) throw new SpikeError("OFFLINE", "模擬離線：無法確認合成登入，沒有發出網路請求。"); };
  return {
    kind: "synthetic",
    setOnline(value) { online = value; },
    async login() { requireOnline(); signedIn = true; },
    async me() {
      requireOnline();
      if (!signedIn) throw new SpikeError("UNAUTHENTICATED", "尚未進入合成會員，請使用下方合成登入按鈕。");
      return { id: "spike-synthetic-member", name: "合成體驗會員", organization: "工程試作分會（非正式名單）", synthetic: true };
    },
    async logout() { signedIn = false; return { confirmation: online ? "synthetic" : "offline-local-only" }; },
  };
}

/** Only an omitted mode or the exact synthetic mode is usable; no real fallback. */
export function createTransport(mode?: string): SpikeTransport {
  if (mode === undefined || mode === "synthetic") return createSyntheticTransport();
  const unavailable = async (): Promise<never> => { throw new SpikeError("UNCONFIGURED_TRANSPORT", "Real transport 尚未配置，已安全拒絕；沒有呼叫正式 API。"); };
  return { kind: "unconfigured", login: unavailable, me: unavailable, logout: unavailable };
}

export type QrState = { status: "idle" | "denied" | "recognized" | "offline" | "invalid"; message: string };
export const SYNTHETIC_QR = "spike:synthetic-only:guest";
export const idleQr = (): QrState => ({ status: "idle", message: "僅預演 QR 狀態；不開相機、不產生正式會員 QR。" });
export function evaluateSyntheticQr(input: "permission-denied" | "sample" | "invalid", online = true): QrState {
  if (input === "permission-denied") return { status: "denied", message: "合成權限拒絕：可以取消或改用合成圖片結果。此處未請求真相機或相簿。" };
  if (input !== "sample") return { status: "invalid", message: "合成辨識失敗：無效內容；不開啟任何 URL，也沒有新增好友或報到。" };
  return online
    ? { status: "recognized", message: "已辨識合成範例；未連線、未新增好友、未完成報到。" }
    : { status: "offline", message: "合成內容已在本機辨識，但模擬離線；不排隊送出，不顯示好友或報到成功。" };
}

export type SessionState = {
  phase: "signed-out" | "checking" | "signed-in" | "offline-unverified";
  busy: boolean;
  member: SyntheticMember | null;
  message: string;
  errorCode: SpikeErrorCode | null;
};

export function createSessionController(transport: SpikeTransport = createTransport()) {
  let state: SessionState = { phase: "signed-out", busy: false, member: null, message: "尚未進入合成會員。重開頁面會清空這份記憶體試作狀態。", errorCode: null };
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (next: SessionState) => { state = next; for (const listener of listeners) listener(); };
  const rejected = (failure: unknown): SessionState => {
    const code = failure instanceof SpikeError ? failure.code : "UNAUTHENTICATED";
    return { phase: code === "OFFLINE" ? "offline-unverified" : "signed-out", busy: false, member: null, errorCode: code,
      message: failure instanceof SpikeError ? failure.message : "合成流程失敗，未建立已登入狀態。" };
  };
  async function confirmMember(loginFirst: boolean) {
    if (state.busy) return;
    const request = ++generation;
    update({ phase: "checking", busy: true, member: null, errorCode: null, message: "核對合成登入與 me 契約中…（不是正式 API）" });
    try {
      if (loginFirst) await transport.login();
      if (request !== generation) return;
      const member = await transport.me();
      if (request !== generation) return;
      if (member.synthetic !== true) throw new Error("Synthetic member required");
      update({ phase: "signed-in", busy: false, member, errorCode: null, message: "合成登入 → 合成 me 已核對。沒有真帳號、Cookie 或 Token。" });
    } catch (failure) { if (request === generation) update(rejected(failure)); }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    login: () => confirmMember(true),
    refreshMe: () => confirmMember(false),
    async logout() {
      // Supersede an in-flight login/me so its late result cannot restore the screen.
      const request = ++generation;
      update({ phase: "signed-out", busy: true, member: null, message: "正在清除合成狀態…", errorCode: null });
      try {
        const result = await transport.logout();
        if (request !== generation) return;
        update({ phase: "signed-out", busy: false, member: null, errorCode: null, message: result.confirmation === "offline-local-only"
          ? "已清除這份本機合成登入；模擬離線，沒有正式伺服器登出或全域撤銷。"
          : "已登出合成會員並清除畫面資料；未操作任何正式 Session。" });
      } catch (failure) { if (request === generation) update({ ...rejected(failure), phase: "signed-out" }); }
    },
  };
}
