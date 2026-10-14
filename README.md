# 獅子會 App（會員端 / lionclub）

以 Next.js 實作的手機版會員網站，正式環境部署於 AWS Amplify，資料儲存於 PostgreSQL（Prisma）。視覺風格為深藍 `#12224A` + 金 `#C8A951`。

## 最新發版候選（2026-10-14，尚未部署）

本分支 `codex/acceptance-fixes-2026-10-14` 保存功能修復與交接，並非正式站部署紀錄。最新 [進版紀錄](docs/RELEASE_2026-10-14.md)、[Jerry 接續交接](docs/JERRY_HANDOFF_RELEASE_2026-10-14.md)、[交接 PDF](output/pdf/lionclub_jerry_handoff_release_2026-10-14.pdf)。本機測試 150/150 與 production build 通過；正式備份／migration／main／Amplify 由 Jerry 接續，固定先 DB、再同版程式。App 準備可並行，不能先上依賴新 schema 的後端再補 migration。

**R2 最終分工：Hao 不執行 migration、不操作正式 AWS／RDS；Jerry 完成正式後端與驗收後，Hao 接手機工程、真機與上架。** 同名交接 MD／PDF 已覆蓋上一版；舊接手資料表改為 [Jerry 完成回報表](docs/JERRY_RETURN_FORM_MIGRATION_MOBILE_2026-10-14.md)，不再要求移交 AWS／DB 憑證給 Hao。

- **驗證與註冊**：Email／密碼登入、HttpOnly Cookie Session；本次新註冊改為只使用共同邀請 QR。
- **好友系統**：好友、邀請、搜尋、推薦及 QR 掃描加好友均已串接 API。
- **會員 QR**：首頁與好友頁顯示可實際掃描的標準 QR；掃描器支援手機後鏡頭及相簿圖片。
- **活動與通知**：活動列表／月曆／報名、編輯／刪除／名額、QR／人工報到與歷史保護；收到／已發送通知及未讀狀態。
- **個人資料**：`/api/me`、生日、頭像上傳、Email 登入同步與斷線重試已完成。
- **會員／幹部資歷**：CRUD、可見性與幹部審核；入會月份及 7 月 1 日會籍／年度任期，未知月份不猜；含 300A-1／A-2／A-3／A-5 分會名單。
- **管理邀請**：具權限幹部可產生真正包含完整註冊網址的邀請 QR。
- **管理與審核**：新會員／資歷審核、分會角色授予及所轄跨分會管理。
- **日夜主題**：系統／淺色／深色，個人檔案補填與幹部工具卡片，行動安全區。
- **App Store**：已準備文案、契約草稿與檢查工具；正式原生封裝、刪除／檢舉流程與開發者資料續做。

前版 [QR-only 進版紀錄](docs/RELEASE_QR_ONLY_2026-10-13.md)、[Jerry 部署交接](docs/JERRY_HANDOFF_QR_ONLY_2026-10-13.md)、[交接 PDF](output/pdf/lionclub_jerry_handoff_qr_only_2026-10-13.pdf)。Git push 不代表正式網站已完成部署。

歷史 [日夜主題進版](docs/RELEASE_2026-10-13.md)、[先前 Jerry 交接](docs/HAO_TO_JERRY_HANDOFF_2026-10-13.md)、[App Store 準備](docs/app-store/README.md)。

接續實作：[中央註冊與分會分派](docs/CENTRAL_ONBOARDING_2026-10-13.md)、[分會長與會員使用手冊](docs/CLUB_LEADER_AND_MEMBER_GUIDE_2026-10-13.md)。本版需先部署新增 migration；共同邀請 QR 註冊後立即可用，再依名單／分會長確認結果核對分會。QR 是平台邀請，不代表正式獅子會會籍已核實。效期預設 3 天，只影響新註冊，不是帳號試用期限。

### 免登入合成資料測試

另有獨立的雙角色測試代理，[測試指南](docs/DEMO_TEST_GUIDE_2026-10-13.md)：會長 `http://localhost:3103/profile`、會員 `http://localhost:3104/profile`。兩者共用可重設的假資料，使用實際前端；不連正式資料庫、不寄信，也不改正式登入或 demo 帳號。只用於體驗，不代表正式後端整合驗收。

先完成 `npm run build`，另開終端執行前端（刻意覆寫成無法連正式服務的合成環境）：

```bash
DATABASE_URL=postgresql://127.0.0.1:65432/lionclub_synthetic_only AUTH_SECRET=synthetic-demo-not-a-production-secret AWS_ACCESS_KEY_ID=synthetic-only AWS_SECRET_ACCESS_KEY=synthetic-only AWS_EC2_METADATA_DISABLED=true npm run start -- -p 3102 --hostname 127.0.0.1
npm run demo:preview
```

執行 `npm run test:demo` 驗證雙角色、合成操作及代理隔離。需要分享時，只將 3103／3104 代理接臨時隧道，不能公開 3102 或原 `tmp/ui-preview.mjs`。臨時公開網址會隨隧道重啟改變；程式／電腦須持續運行。

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
- 帳號刪除雲端頭像清理排程與正式驗收、外部刪除／人工處理入口、檢舉營運、公開隱私政策與客服頁（封鎖／解除及刪帳 API 已有本機回歸）。
- 完整 Xcode、iOS 原生架構／簽章、TestFlight 及 Android 後續封裝。
- 行動裝置實機驗收與自動化測試。
- 正式 SES 驗證回流、同網路多人加入負載與好友推薦排序（Email token／限流修復已做隔離測試）。
- 上架前重新執行依賴安全稽核，依實際結果處理漏洞與套件更新。

執行 `npm run app-store:check` 可查看目前送審準備缺口；`npm run app-store:check -- --strict` 用於阻擋未完成的送審步驟。
