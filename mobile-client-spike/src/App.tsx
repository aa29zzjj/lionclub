import React, { useMemo, useState, useSyncExternalStore } from "react";
import { createSessionController, createSyntheticTransport, createTransport, evaluateSyntheticQr, idleQr, type QrState } from "./contract";

export default function App() {
  const transport = useMemo(() => createSyntheticTransport(), []);
  const controller = useMemo(() => createSessionController(transport), [transport]);
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [online, setOnline] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [qr, setQr] = useState<QrState>(idleQr);
  const [guardMessage, setGuardMessage] = useState("");

  function changeConnection() {
    const next = !online;
    setOnline(next); transport.setOnline(next); setQr(idleQr());
    void controller.refreshMe();
  }
  async function checkRealGuard() {
    try { await createTransport("real").login(); setGuardMessage("錯誤：不應允許未配置 real transport。"); }
    catch (error) { setGuardMessage(error instanceof Error ? error.message : "未配置，安全拒絕。"); }
  }

  return <div className="spike-shell" data-theme={theme}>
    <main>
      <header>
        <p className="eyebrow">SYNTHETIC CLIENT CONTRACT SPIKE</p>
        <h1>LionClubs</h1>
        <p className="notice">合成工程試作 · 不是原生包／正式登入</p>
        <p>不輸入真帳密、不開相機、不連正式 API。此頁沒有真會員資料，也不是可安裝的 App。</p>
        <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>切換為{theme === "light" ? "夜間" : "日間"}顯示</button>
      </header>

      <section aria-labelledby="session-heading">
        <div className="section-heading"><h2 id="session-heading">1. 合成登入與會員</h2><span className="badge">僅記憶體</span></div>
        <p>沒有帳號或密碼欄位；按鈕只切換固定的合成人物狀態。</p>
        <div className="button-grid">
          <button type="button" className="primary" disabled={session.busy} onClick={() => { setQr(idleQr()); void controller.login(); }}>使用合成會員進入</button>
          <button type="button" disabled={session.busy} onClick={() => void controller.refreshMe()}>重新核對合成 me</button>
          <button type="button" disabled={session.busy} onClick={() => { setQr(idleQr()); void controller.logout(); }}>登出合成會員</button>
        </div>
        <div className={`feedback ${session.errorCode ? "error" : ""}`} role={session.errorCode ? "alert" : "status"} aria-live="polite">
          <strong>{session.busy ? "處理中" : session.phase === "signed-in" ? "合成會員已核對" : session.phase === "offline-unverified" ? "模擬離線，身份未確認" : "未登入合成會員"}</strong>
          <p>{session.message}</p>
          {session.errorCode && <p className="code">{session.errorCode}</p>}
        </div>
        {session.member && <dl className="member-card"><div><dt>合成姓名</dt><dd>{session.member.name}</dd></div><div><dt>合成組織</dt><dd>{session.member.organization}</dd></div><div><dt>資料用途</dt><dd>工程狀態驗證，不代表正式會籍或系統授權</dd></div></dl>}
      </section>

      <section aria-labelledby="qr-heading">
        <h2 id="qr-heading">2. QR 狀態預演</h2>
        <p>下面只預演提示，不產生可供正式系統掃描的 QR，也不要求相機／相簿權限。</p>
        <div className="button-grid">
          <button type="button" onClick={() => setQr(evaluateSyntheticQr("sample", online))}>辨識合成範例</button>
          <button type="button" onClick={() => setQr(evaluateSyntheticQr("permission-denied", online))}>預演相機拒絕</button>
          <button type="button" onClick={() => setQr(evaluateSyntheticQr("invalid", online))}>預演無效圖片</button>
          <button type="button" onClick={() => setQr(idleQr())}>取消／重設 QR 提示</button>
        </div>
        <div className={`feedback ${qr.status === "invalid" || qr.status === "denied" ? "error" : ""}`} role="status" aria-live="polite"><p>{qr.message}</p></div>
      </section>

      <section aria-labelledby="guard-heading">
        <h2 id="guard-heading">3. 離線與安全拒絕</h2>
        <p>這是合成 transport 的離線開關，不是網路偵測；全程沒有外部請求。</p>
        <button type="button" disabled={session.busy} aria-pressed={!online} onClick={changeConnection}>{online ? "改為模擬離線" : "恢復合成連線"}</button>
        <p className="badge">目前：{online ? "合成連線可用" : "模擬離線"}</p>
        <button type="button" onClick={() => void checkRealGuard()}>檢查未配置 real transport（預期拒絕）</button>
        {guardMessage && <div className="feedback error" role="status">{guardMessage}</div>}
      </section>
      <footer><p>重開／重新整理會回到初始合成狀態；尚未驗證原生 Session 持久化、相機或商店上架。</p><p>24 項原生真機測例仍未執行。請勿以此頁當正式後台或 App 測試帳號。</p></footer>
    </main>
  </div>;
}
