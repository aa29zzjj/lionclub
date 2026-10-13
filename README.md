# 獅子會 App（會員端 / lionclub）

以 Next.js 實作的手機版會員網站，正式環境部署於 AWS Amplify，資料儲存於 PostgreSQL（Prisma）。視覺風格為深藍 `#12224A` + 金 `#C8A951`。

## 目前進度（2026-10-13）

- **驗證與註冊**：Email／密碼登入、HttpOnly Cookie Session、幹部邀請 QR／PIN 註冊。
- **好友系統**：好友、邀請、搜尋、推薦及 QR 掃描加好友均已串接 API。
- **會員 QR**：首頁與好友頁顯示可實際掃描的標準 QR；掃描器支援手機後鏡頭及相簿圖片。
- **活動與通知**：活動列表／報名、編輯／刪除／名額及管理者報名名單；好友／分會通知已串接 API。
- **個人資料**：`/api/me`、生日、頭像上傳、Email 登入同步與斷線重試已完成。
- **會員／幹部資歷**：CRUD、可見性與幹部審核已完成；含 300A-1／A-2／A-3／A-5 分會名單。
- **管理邀請**：具權限幹部可產生真正包含完整註冊網址的邀請 QR。
- **管理與審核**：新會員／資歷審核、分會角色授予及所轄跨分會管理。
- **日夜主題**：系統／淺色／深色，個人檔案補填與幹部工具卡片，行動安全區。
- **App Store**：已準備文案、契約草稿與檢查工具；正式原生封裝、刪除／檢舉流程與開發者資料續做。

本次 [進版紀錄](docs/RELEASE_2026-10-13.md)、[Jerry 交接](docs/HAO_TO_JERRY_HANDOFF_2026-10-13.md)、[App Store 準備](docs/app-store/README.md)。

資歷資料契約與待辦請見 [docs/MEMBER_EXPERIENCE_HANDOFF.md](docs/MEMBER_EXPERIENCE_HANDOFF.md)，好友 QR 規格與驗證紀錄請見 [docs/FRIEND_QR_HANDOFF.md](docs/FRIEND_QR_HANDOFF.md)。

## 開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000 會自動導向 `/login`。

本機需要 AWS 區域與 Secrets Manager 權限，或可用的 `DATABASE_URL`／`AUTH_SECRET` 設定，才能讀取真實資料。

## 主要待辦

- 完成部署後的報名名單與跨分會授權驗收，確認 S3 events IAM 與 RDS 網路設定。
- App 內帳號刪除／外部刪除入口、封鎖／檢舉、公開隱私政策與客服頁。
- 完整 Xcode、iOS 原生架構／簽章、TestFlight 及 Android 後續封裝。
- 行動裝置實機驗收與自動化測試。
- Email 驗證、速率限制與好友推薦排序。
- 上架前重新執行依賴安全稽核，依實際結果處理漏洞與套件更新。

執行 `npm run app-store:check` 可查看目前送審準備缺口；`npm run app-store:check -- --strict` 用於阻擋未完成的送審步驟。
