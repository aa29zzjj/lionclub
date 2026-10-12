# 獅子會 App（會員端 / lionclub）

以 Next.js 實作的手機版會員網站，正式環境部署於 AWS Amplify，資料儲存於 PostgreSQL（Prisma）。視覺風格為深藍 `#12224A` + 金 `#C8A951`。

## 目前進度（2026-10-12）

- **驗證與註冊**：Email／密碼登入、HttpOnly Cookie Session、幹部邀請 QR／PIN 註冊。
- **好友系統**：好友、邀請、搜尋、推薦及 QR 掃描加好友均已串接 API。
- **會員 QR**：首頁與好友頁顯示可實際掃描的標準 QR；掃描器支援手機後鏡頭及相簿圖片。
- **活動與通知**：活動列表／報名、通知列表及發送流程已串接 API。
- **個人資料**：`/api/me` 已串接；照片上傳尚待後端端點。
- **會員／幹部資歷**：前端互動與 300A-1／A-2／A-3／A-5 分會名單已完成，仍待 Jerry 的 CRUD API。
- **管理邀請**：具權限幹部可產生真正包含完整註冊網址的邀請 QR。

資歷資料契約與待辦請見 [docs/MEMBER_EXPERIENCE_HANDOFF.md](docs/MEMBER_EXPERIENCE_HANDOFF.md)，好友 QR 規格與驗證紀錄請見 [docs/FRIEND_QR_HANDOFF.md](docs/FRIEND_QR_HANDOFF.md)。

## 開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000 會自動導向 `/login`。

本機需要 AWS 區域與 Secrets Manager 權限，或可用的 `DATABASE_URL`／`AUTH_SECRET` 設定，才能讀取真實資料。

## 主要待辦

- 資歷 CRUD API 串接與審核流程。
- 頭像上傳 API 與前端上傳介面。
- 通知收件範圍、活動編輯／刪除／額滿狀態、管理角色與忘記密碼流程。
- 行動裝置實機驗收與自動化測試。
- 升級／處理 `npm audit --omit=dev` 回報的 Next.js、Prisma 間接依賴問題。
