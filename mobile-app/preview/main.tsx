import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Shell, { type TabKey } from "../src/Shell";
import HomeScreen from "../src/HomeScreen";
import FriendsScreen from "../src/FriendsScreen";
import EventsScreen from "../src/EventsScreen";
import NotificationsScreen from "../src/NotificationsScreen";
import MyScreen from "../src/MyScreen";
import App from "../src/App";
import { createNativeOAuthAttempt } from "../src/native-oauth";
import PreviewRenderFailure from "./render-failure";
import type { MobilePushUi } from "../src/NotificationSettings";
import { getPreviewMember, previewNotice, setPreviewFeatureFixture, setPreviewNotificationFixture, type PreviewFeatureFixture, type PreviewNotificationFixture } from "./mock-contract";

const push: MobilePushUi = {
  status: "unavailable",
  async enable() { previewNotice("介面預覽：不會要求手機通知權限或登記裝置。"); },
  async refresh() { previewNotice("介面預覽：推播服務未啟用，不會連線或要求權限。"); },
  async disable() { previewNotice("介面預覽：未更改任何裝置設定。"); return { serverConfirmed: false, nativeConfirmed: false }; },
};
function initialTab(): TabKey {
  const tab = window.location.hash.slice(1);
  return ["home", "friends", "events", "notifications", "security"].includes(tab) ? tab as TabKey : "home";
}
function Preview() {
  const [notice, setNotice] = useState("不需要登入；所有內容皆為合成資料，任何操作均不儲存。");
  const [large, setLarge] = useState(false);
  const [mode, setMode] = useState<"member" | "signed-out">("member");
  const [fixture, setFixture] = useState<PreviewNotificationFixture>("normal");
  const [feature, setFeature] = useState<PreviewFeatureFixture>("normal");
  const member = getPreviewMember();
  const featureTab: TabKey = feature.startsWith("event-") || feature.startsWith("terms-") ? "events" : "security";
  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "string") setNotice(detail);
    };
    window.addEventListener("native-preview-notice", onNotice);
    return () => window.removeEventListener("native-preview-notice", onNotice);
  }, []);
  useEffect(() => { document.documentElement.dataset.previewLargeText = String(large); }, [large]);
  return <div className="preview-frame">
    <aside className="preview-banner" aria-label="隔離介面預覽說明">
      <div className="preview-banner-heading"><strong>介面預覽 · 合成資料</strong><button type="button" className="secondary" aria-pressed={large} onClick={() => {
        setLarge((current) => !current);
        setNotice(!large ? "大字版面模擬，不代表已通過系統 Dynamic Type／讀屏驗收。" : "不需要登入；所有內容皆為合成資料，任何操作均不儲存。");
      }}>{large ? "標準文字" : "大字模擬"}</button></div>
      <p>原生 App 介面候選，非已上架版本畫面。</p>
      <p role="status">{notice}</p>
      <button type="button" className="secondary" onClick={() => {
        void createNativeOAuthAttempt().then(() => setNotice("此畫面可產生安全登入驗證資料；尚未進行任何登入或連線。"),
          () => setNotice("此畫面無法產生安全登入驗證資料；不得開放第三方登入。"));
      }}>檢查登入保護</button>
      <div className="preview-controls">
        <label htmlFor="preview-mode">畫面
          <select id="preview-mode" value={mode} onChange={event => {
            setMode(event.target.value === "signed-out" ? "signed-out" : "member");
            setNotice("只顯示合成介面；請勿輸入真實帳號、密碼或驗證碼。");
          }}>
            <option value="member">會員畫面</option><option value="signed-out">App 登入頁</option>
          </select>
        </label>
        <label htmlFor="preview-notification-fixture">通知情境
          <select id="preview-notification-fixture" value={fixture} onChange={event => {
            const value = event.target.value as PreviewNotificationFixture;
            setPreviewFeatureFixture("normal"); setFeature("normal");
            setPreviewNotificationFixture(value); setFixture(value); setMode("member");
            setNotice(value === "normal" ? "正常合成資料；所有寫入均拒絕。" : "合成通知情境已切換；可進入發送頁檢查錯誤、重試及按鈕狀態，沒有真實連線。");
          }}>
            <option value="normal">正常合成資料</option><option value="load-error">通知載入失敗</option>
            <option value="malformed">通知格式錯誤</option><option value="compose-error">發送頁讀取失敗</option>
            <option value="empty-friends">發送頁沒有好友</option>
            <option value="render-error">合成畫面錯誤保護</option>
          </select>
        </label>
        <label htmlFor="preview-feature-fixture" className="preview-feature-control">其他功能情境
          <select id="preview-feature-fixture" value={feature} onChange={event => {
            const value = event.target.value as PreviewFeatureFixture;
            setPreviewNotificationFixture("normal"); setFixture("normal");
            setPreviewFeatureFixture(value); setFeature(value); setMode("member");
            setNotice(value === "normal" ? "正常合成資料；所有寫入均拒絕。" : "合成功能情境已切換。請由畫面按鈕進入操作；條款同意、發布、審核及帳號變更均不會執行。");
          }}>
            <option value="normal">正常合成資料</option>
            <option value="event-scope">活動・授權層級與主辦配對</option>
            <option value="event-settings-error">活動・發布設定讀取失敗</option>
            <option value="event-options-invalid">活動・授權資料格式錯誤</option>
            <option value="terms-required">活動・需要同意條款</option>
            <option value="terms-read-error">活動・條款讀取失敗</option>
            <option value="security-read-error">帳號安全・封鎖名單讀取失敗</option>
            <option value="security-malformed">帳號安全・封鎖名單格式錯誤</option>
            <option value="security-blocked">帳號安全・一位合成封鎖會員</option>
            <option value="browser-error">帳號管理・網頁開啟失敗</option>
            <option value="pending-members">幹部管理・歷史入會年月</option>
          </select>
        </label>
      </div>
    </aside>
    {mode === "signed-out" ? <div className="preview-app-content"><App key="signed-out-preview" /></div> :
    <Shell key={`member:${fixture}:${feature}`} member={member} initialTab={feature !== "normal" ? featureTab : fixture === "normal" ? initialTab() : "notifications"} renderTab={(tab, current, setTab) => {
      if (tab === "home") return <HomeScreen member={current} onOpenProfile={() => setTab("security")} onOpenNotifications={() => setTab("notifications")} onOpenFriends={() => setTab("friends")} onOpenEvents={() => setTab("events")} />;
      if (tab === "friends") return <FriendsScreen member={current} />;
      if (tab === "events") return <EventsScreen member={current} />;
      if (tab === "notifications") return fixture === "render-error" ? <PreviewRenderFailure /> : <NotificationsScreen onOpenProfile={() => setTab("security")} />;
      return <MyScreen member={current} onUpdated={() => previewNotice("介面預覽不儲存會員資料。")} onLogout={() => previewNotice("介面預覽沒有真實登入，登出操作未執行。")} busy={false} push={push} />;
    }} />}
  </div>;
}
const root = document.getElementById("root");
if (!root) throw new Error("PREVIEW_ROOT_REQUIRED");
createRoot(root).render(<Preview />);
