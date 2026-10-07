# 獅子會 App（會員端 / lionclub）

會員端 App 的 UI 原型，以 Next.js（手機尺寸網頁，可日後包裝成 PWA 或轉 React Native）實作，與 `lion_app`（管理後台）分開部署，共用視覺風格（深藍 `#12224A` + 金 `#C8A951`）。

## 本階段範圍（10/15 前）

僅完成以下三項可操作的 UI 流程，皆使用前端模擬資料（尚未接後端 API）：

- **會員登入** [src/app/login/page.tsx](src/app/login/page.tsx)
- **好友系統**（好友列表／邀請中／加好友）[src/app/friends/page.tsx](src/app/friends/page.tsx)
- **活動通知**（選活動、勾選好友、發送通知）[src/app/notifications/page.tsx](src/app/notifications/page.tsx)
- 另附簡易首頁架構 [src/app/home/page.tsx](src/app/home/page.tsx)，供导覽與後續串接使用

## 開發

\`\`\`bash
npm install
npm run dev
\`\`\`

開啟 http://localhost:3000 會自動導向 `/login`。

## 後續工作（不在本次範圍）

- 串接真實會員系統 API / 驗證
- 好友關係、通知的後端儲存與推播（LINE / APNs / FCM）
- 轉換為 React Native 原生 App（如團隊後續決定）
