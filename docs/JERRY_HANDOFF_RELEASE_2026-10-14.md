# 獅子會 App：Jerry 接續發版交接

日期：2026-10-14｜交接對象：Jerry、Hao、Tom

## 1. 先看結論

本機功能已完成，正式站尚未換版本。本輪依 Hao 最新決策，將目前缺少權限與工具的 AWS／DB 工作交給 Jerry；程式與文件先存發版分支，不讓 main 自動部署未配套 schema 的新版。

| 狀態 | 可直接接續的內容 |
| --- | --- |
| 功能已完成 | F01-F10 修復、長者友善日夜 UI、活動月曆、7 月制會籍／幹部任期；既定共用 QR 暫入台科大 AI 流程保留。 |
| 本機已驗證 | TS 109 + MJS 41 = 150/150；Next production build、Prisma schema、migration 回滾與 rollout 測試通過。 |
| Jerry 待執行 | 正式備份、migration、main／Amplify 部署、雲端清理排程與正式服務複驗。本輪未執行這些操作。 |
| 手機待完成 | 原生工程、真機／簽章／安裝包、商店素材與送審；沒有 IPA、APK、AAB 或已上架成果。 |

程式來源：[GitHub 發版分支](https://github.com/aa29zzjj/lionclub/tree/codex/acceptance-fixes-2026-10-14)。main 基準 `8962dd4`，功能 commit `0e99138`；接手請記錄分支最新 HEAD 完整 SHA，包含本次交接文件。詳細變更見 [進版 MD](https://github.com/aa29zzjj/lionclub/blob/codex/acceptance-fixes-2026-10-14/docs/RELEASE_2026-10-14.md)。

模擬已涵蓋真實路由與隔離 PostgreSQL/WASM，但不等於正式 RDS 多連線、SES 收件、S3 清理、相機硬體或真人長者驗收。舊修復 PDF 的 143 項是補強前快照，最新為 150 項。

**可以並行準備 App；不能先部署依賴新欄位的後端，再等 migration 補上。安全順序是 DB → 同版後端 → 原生實測／送審。**

<!-- pagebreak -->

## 2. Migration 契約與使用者影響

目標：`prisma/migrations/20261014090000_acceptance_security_and_history/migration.sql`。

SHA-256：`2b28635ba88974c07e229f691dfb1174a94f53f66180b517b5b0f8602d8b53c5`。

| 變更 | 部署時要知道的事 |
| --- | --- |
| sessionVersion／token Email | 舊裝置必須重登；舊未使用驗證／重設連結失效，需重寄。未更改會員密碼；正式環境不接受 0204 等短密碼，需重設。 |
| deletedAt／限制性外鍵 | 刪帳改匿名停用會員，保留共享活動／他人報到錨點。回退舊的連帶刪除邏輯不安全。 |
| AccountDeletionCleanup | 刪帳後頭像由耐久工作清理，不代表 API 成功時 S3 已全刪。Jerry 需接上排程、IAM、重試與監控。 |
| EventCheckInAudit | 報到保留首次紀錄；已報到不可自行取消。不能以硬刪報名抹除歷史。 |
| startMonth 與年度 | 入會月份可空，舊資料不猜；6/30 屬上一會籍、7/1 屬新會籍。自填資歷不直接改正式會籍／授權。 |

SQL 包在 BEGIN／COMMIT；lock timeout 10 秒，每條 statement timeout 120 秒。雖有完整回滾測試，正式鎖等待、索引與掃表仍需短維護窗口，不保證尖峰零停頓。

Token Email 空字串 default 是切換期間給舊 writer 的 sentinel；新版拒絕未綁 Email 的連結。這只是局部 rollout 相容，不是整版可任意回退或新程式能讀舊 schema 的保證。

`prisma migrate deploy` 會處理所有 pending migration，不是只跑本次。前置版本須逐一核對，特別是中央入會／分派、帳號安全、nickname、event check-in。若有其他 pending／失敗版本，先盤點對應歷史變更與備份，不跳過、不修改已上線 SQL、不 reset／seed／db push。

<!-- pagebreak -->

## 3. Jerry 的正式操作順序

1. 核對 AWS 帳號、區域、Amplify app／main、正式網域 `lionclubsmembership.com` 與實際 RDS target。確認 main 自動部署是否暫停，先保持不觸發候選版。憑證由受控環境注入，不貼聊天或 GitHub。

2. 建立可還原的 DB snapshot／備份，等待完成，記錄識別及時間；選維護停寫窗口，記錄四類資料數量與 migration history。Git commit 不是 DB 備份。

3. 使用同一候選 checkout、安裝鎖定依賴並 generate Prisma。只讀檢查器要求受控注入 RELEASE_DATABASE_URL（含加密連線），不自動讀 .env 或 Secrets。以下 target 是待核實代稱，不能原樣執行；命令請從 MD 複製，避免 PDF 排版換行。

```bash
node scripts/production-preflight.mjs --confirm-host VERIFIED_RDS_HOST --confirm-database VERIFIED_DB --confirm-schema public --phase before
```

4. before 必須無未處理問題；該工具容許只缺本次版本。如有更早缺版，先評估其變更、受控補齊，再跑 before。確認 DATABASE_URL 指向同一已驗證 target 後，以本機鎖定的 Prisma CLI 執行，不把 URL 寫在命令參數或版本檔。

```bash
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma generate
node scripts/production-preflight.mjs --confirm-host VERIFIED_RDS_HOST --confirm-database VERIFIED_DB --confirm-schema public --phase after
```

5. after 必須通過；工具不會自動比對前後數量，需人工確認停寫窗口前後 Member／User／Event／EventRegistration 完全相同。資歷／token 總數不應減少；舊未使用 token 失效、已 used 時間保留、舊月份仍空，不虛構回填報到歷史。保留核對記錄，不上傳 DB dump／會員名單。

6. 核對 main 是否前進；先整合並重跑測試，再合入同版程式。不要 force push。記錄 main SHA、Amplify job／建置 SHA、成功與否，驗收後才恢復流量／自動部署。

完整操作見 [部署 MD](https://github.com/aa29zzjj/lionclub/blob/codex/acceptance-fixes-2026-10-14/docs/DEPLOYMENT_2026-10-14.md)。preflight 不備份、不修 DB、不證明 IAM／應用成功；長交易可見性受 DB role 限制，不能替代 RDS 維護監看。

<!-- pagebreak -->

## 4. 雲端待辦與失敗處置

| 優先 | Jerry 接續項目 |
| --- | --- |
| P0 | 核對 HTTPS NEXT_PUBLIC_APP_URL、寄信來源／SES、AWS 區域與頭像 bucket。以專用測試資料驗證收信與回流；不以模擬寄信代簽正式成功。 |
| P0 | 安裝 AccountDeletionCleanup 執行環境、工作發現器、排程／重試與告警。附的 worker 每次只處理指定一筆 job，並非已建好整個排程。 |
| P0 | 同版部署後做第 5 節 smoke test；檢查非 SUPER 空 scope、未生效／過期角色不得越權。 |
| P1 | 規劃 RateLimitAttempt 過期資料保留與定期清理；不在登入／註冊熱路徑跑全表刪除。 |
| P1 | 確認共享活動、稽核文字與匿名歷史保存期；建立刪帳阻擋時的人工處理管道與對外隱私／客服頁。 |

頭像 worker 需完整 checkout、Node、tsx、同版 Prisma 與對應執行平台 engine。受控注入 ACCOUNT_CLEANUP_DATABASE_URL，先 preview：

```bash
node --import tsx scripts/run-account-deletion-cleanup.mjs --job VERIFIED_JOB_ID --environment production --confirm-host VERIFIED_RDS_HOST --confirm-database VERIFIED_DB
```

正式刪除另外需要 `--execute` 與受控環境 `ACCOUNT_CLEANUP_ALLOW_STORAGE_DELETE=YES_DELETE_MEMBER_AVATARS`。worker 本身不強制 TLS，Jerry 須確保 URL 為加密連線。至少等刪帳 6 分鐘；延後／忙碌／失敗回非零，需要排程重試。DB 最小權限為清理工作 SELECT／狀態 UPDATE、Member id／deletedAt SELECT；S3 只限指定 bucket 的 avatars prefix List／Delete。

另外核對 S3 versioning、歷史版本保留、CDN 快取。現有 worker 僅刪目前物件；不可宣稱已抹除舊版本與快取。job 儲存刪帳當下 bucket／region，後補環境變數不會修復既有 NULL 工作。

失敗處置：migration 失敗先查 schema 與 _prisma_migrations；不要自動 resolve、reset 或盲目重跑。成功後無 down script，優先 forward fix，不直接退舊程式、DROP 新欄位或改回 CASCADE。Git revert 不還原 DB／session／token；snapshot 復原需評估備份後新增資料損失，也不能復活已刪 S3 物件。先停寫、留日誌再決策。

<!-- pagebreak -->

## 5. 上線驗收、手機並行與回填

Jerry 的正式 smoke test（專用測試資料，不對真會員做破壞性操作）：

- 重登／短密碼重設／Email 改址與重寄；舊連結不能用，兩裝置重設或撤銷後狀態正確。
- 共用 QR 加入台科大 AI 可立即試用；PIN 不恢復；原分會只是待核實資料。後台分派需有效範圍、衝突提示與稽核，不能只改顯示文字。
- 活動月曆切月／點日／詳情；報名取消／重複報到／人工補登不丟首次時間；有歷史的活動不可誤刪。
- 2026/06/30 → 25-26、2026/07/01 → 26-27；未知月份仍待補；幹部任期 7/1 到隔年 6/30。
- 非 SUPER／空 scope／未生效角色 403；封鎖／解除、通知未讀、401 重新登入與網路重試正確。
- 專用刪帳與 S3 job 完成證據；真機相機拒絕／恢復、暗場 QR、200% 放大、日夜畫面與長者操作。

手機可以先做架構、介面、商店素材及隔離 API 測試；**新版真機連正式 API 與送審前，先完成 migration＋同版後端驗收。** 商店 App 不會補資料庫。

目前有 Apple 帳號但有效 Developer 會員／Team ID 未驗證；沒有 Google Play。沒有 Play 不阻擋測試 APK，仍需 Android 工具鏈與簽章。此機缺完整 Xcode／iOS SDK、Android JDK／SDK，倉庫也未建立原生工程，沒有可上傳的 IPA／APK／AAB。

網站採同網域 HttpOnly Cookie、Origin 保護；原生 App 不能僅更換 API 網址，不能關閉安全檢查或以遠端網站外殼假裝完成。先決定原生登入／API 相容方式，再做登入、QR、個人頁縱向串接與相機測試。詳見 [手機發行條件](https://github.com/aa29zzjj/lionclub/blob/codex/acceptance-fixes-2026-10-14/docs/app-store/RELEASE_INPUTS_2026-10-14.md)。

Hao 待提供：正式 App 名稱、上架個人／法人名稱、客服及隱私 Email、Apple Team／Bundle ID（若已有）、品牌圖示；不貼密碼／私鑰。未知值維持待補，不代填永久識別碼。

Jerry 回填此 MD：候選 SHA／正式 SHA、備份識別與時間、migration 狀態及 checksum、before／after 摘要、Amplify job／驗收時間、清理排程與測試結果、未通過項目的負責人。文件目前的「待執行」不可改成「已完成」而沒有對應證據。
