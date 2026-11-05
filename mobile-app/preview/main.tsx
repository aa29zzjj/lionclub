import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Shell, { type TabKey } from "../src/Shell";
import HomeScreen from "../src/HomeScreen";
import FriendsScreen from "../src/FriendsScreen";
import EventsScreen from "../src/EventsScreen";
import NotificationsScreen from "../src/NotificationsScreen";
import MyScreen from "../src/MyScreen";
import type { MobilePushUi } from "../src/NotificationSettings";
import { member } from "./fixtures";
import { previewNotice } from "./mock-contract";

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
    </aside>
    <Shell member={member} initialTab={initialTab()} renderTab={(tab, current, setTab) => {
      if (tab === "home") return <HomeScreen member={current} onOpenProfile={() => setTab("security")} onOpenNotifications={() => setTab("notifications")} onOpenFriends={() => setTab("friends")} onOpenEvents={() => setTab("events")} />;
      if (tab === "friends") return <FriendsScreen member={current} />;
      if (tab === "events") return <EventsScreen member={current} />;
      if (tab === "notifications") return <NotificationsScreen />;
      return <MyScreen member={current} onUpdated={() => previewNotice("介面預覽不儲存會員資料。")} onLogout={() => previewNotice("介面預覽沒有真實登入，登出操作未執行。")} busy={false} push={push} />;
    }} />
  </div>;
}
const root = document.getElementById("root");
if (!root) throw new Error("PREVIEW_ROOT_REQUIRED");
createRoot(root).render(<Preview />);
