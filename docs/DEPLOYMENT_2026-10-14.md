# 2026-10-14 正式發版操作紀錄與接續入口

## 授權與實際狀態

使用者已授權直接推 main、正式資料庫 migration、開啟正式部署。本文件不是再次詢問是否准許部署。

目前已確認：

- GitHub `aa29zzjj/lionclub`（公開 repository）可讀寫，main 基準為 `8962dd40c397a37ebbe91e449a84d05684bfcfc0`；本輪 fetch 無新的 main commit。
- 倉庫沒有 GitHub Actions workflows、Actions secrets、Actions variables 或 GitHub deployments 記錄，不能假設已有可代跑正式 migration 的 CI。
- 本機無 AWS shared profile／credential、AWS 環境憑證、正式 `.env` 或正式 DB URL；SDK default credentials provider 未取得身分。
- AWS Console 顯示未登入；已保留登入頁等待使用者登入。整合搜尋僅找到資料分析用途插件，不是 Amplify／RDS 部署工具；[插件目錄](https://chatgpt.com/plugins)仍可能有其他整合。
- **尚未執行正式 migration、尚未推 main、尚未重啟／啟用 Amplify 部署。** 不能把本機成功或 Git commit 視為資料庫備份與已上線證據。

因此只先保存本機發版候選。取得對應 AWS 帳號／區域的登入後，接續下方步驟；不需要使用者把金鑰、DB 密碼或私鑰貼在聊天。

## 本次上線前追加補強

最後本機回歸：TS 109/109、MJS 整合／模擬／部署護欄／既有展示 41/41，共 150/150 通過。相較先前 PDF 的 143 項，新增 rollout／完整回滾與部署前檢查規則測試；PDF 保留作為當時的修復驗收紀錄。

- 新 migration `20261014090000_acceptance_security_and_history` 明確使用 BEGIN／COMMIT；任何中途 SQL 失敗會回滾本次變更。
- `lock_timeout=10s`、每條 `statement_timeout=120s`。逾時需確認 migration history；不得自動 reset、seed、resolve 或盲目重跑。
- 兩張 token 表的 Email 欄位提供空字串 rollout sentinel，允許切換期間舊程式仍能新增記錄；新版拒絕 sentinel，不把未綁信箱的連結視為有效。
- 原有未使用 token 會失效；sessionVersion 使舊登入重登。新欄位、掃表、索引及限制性外鍵仍會持鎖，不保證尖峰零停頓。
- `.gitignore` 增加環境檔、備份與原生簽章／安裝包排除，避免公開 repository 混入密碼、DB dump、Apple／Android signing material。

## 取得 AWS 存取後的執行順序

1. 確認 STS／Console 帳號、區域、Amplify app 與 main branch，網域必須對應 `lionclubsmembership.com`；查明自動部署是否暫停。不把另一個 AWS profile 當正式環境。
2. 確認 RDS instance、Secrets Manager 中實際 DB target、加密連線及復原能力。執行備份／snapshot，等待狀態 available，記錄 snapshot ARN／時間；Git commit 不代替這一步。備份內容不得進 GitHub。
3. 選短維護窗口／停寫，記錄 migration history、前置數量與長交易；檢查沒有先前失敗 migration、缺少前置版本或 checksum 改動。不要強制中斷未知業務交易。
4. 在同版完整 checkout 以已驗證 DB target 執行 `prisma migrate deploy`；不使用 `db push`、`migrate dev`、reset 或 seed。正式密碼由受控執行環境注入，不在終端列印。
5. 套用後比對 migration checksum、欄位、FK、Member／User／Event／Registration 數量與月份約束；本次 migration 不應降低四類數量。套用失敗時先檢查 DB，不能只憑 CLI 非零就推論所有內容已還原。
6. 推相同候選 commit 到 main；若 main 已前進，先整合及重跑測試，不 force push。確認 Amplify 建置採用正確 commit、部署成功，才恢復流量／自動部署。
7. 驗收 release SHA、登入／重寄信、QR 註冊、月曆、7 月制資歷、報到、管理範圍與 401／403。使用專用測試資料；實際 SES／S3／相機結果另外記錄，不用模擬結果代簽。
8. 部署結果回填本文件：備份識別、migration status、候選與正式 SHA、Amplify job ID、網域驗收時間、背景清理工作狀態。

## 只讀 DB 檢查器

`scripts/production-preflight.mjs` 不會 migration 或寫資料。明確使用 `RELEASE_DATABASE_URL`，不讀 `.env`／Secrets Manager，也不回退一般 `DATABASE_URL`。連線必須加密，要求精確 host／database／schema 與 before／after phase。

由受控環境注入 URL 後執行（以下非真實主機、不得原樣當正式 target）：

```bash
node scripts/production-preflight.mjs --confirm-host VERIFIED_RDS_HOST --confirm-database VERIFIED_DB --confirm-schema public --phase before
node scripts/production-preflight.mjs --confirm-host VERIFIED_RDS_HOST --confirm-database VERIFIED_DB --confirm-schema public --phase after
```

輸出僅為 migration、catalog、彙總數量與交易等待資訊，不含會員姓名、Email、密碼或 token。before 容許只缺本次 migration；after 要求全部 checksum 與版本一致。它不建立備份，也不證明 IAM、S3 或應用已正確部署。未取得正式存取前只有參數／規則的本機測試，不能宣稱正式前置檢查已通過。

## 背景頭像清理與個資保留

worker 需要完整 checkout、Node、tsx 與同版 generated Prisma；不能假設 Amplify `.next` 自動執行本機 script。需獨立可信執行環境及排程／重試，至少等刪帳 6 分鐘才清理。

- DB 注入 `ACCOUNT_CLEANUP_DATABASE_URL`；正式執行須 exact host／database 與 `ACCOUNT_CLEANUP_ALLOW_STORAGE_DELETE=YES_DELETE_MEMBER_AVATARS` opt-in。預設僅 preview。
- 最小 DB 權限為 CONNECT、schema USAGE、清理表 SELECT／狀態 UPDATE、Member 的 id／deletedAt SELECT。不需讀 User／密碼或授權資料庫 DELETE。
- IAM 限指定 bucket 的 ListBucket（prefix `avatars/*`）及該 prefix 的 DeleteObject，不開整個 bucket 的 Get／Put／Delete。
- 先確認 avatar bucket versioning、noncurrent version retention 與 CDN cache TTL／失效。現有 worker 清目前物件，不宣稱永久版本和 CDN 快取已抹除。
- job 存刪帳當時 bucket／region；補環境變數不會自動修復既有 NULL 設定的工作，須先受控盤點。
- 活動自由文字、稽核理由與共享歷史的保存／刪除政策仍需確認，不能僅因有刪帳 API 就宣稱 App Store 個資要求已通過。

## 本輪手機上架準備

使用者已回覆有 Apple 帳號、沒有 Google Play。Apple Developer 有效會員、Team ID 與可用 App ID 仍待實際核實。無 Play 帳號不阻擋先做本機測試 APK，但會阻擋 Google Play 發行。

本機缺完整 Xcode／iOS SDK、Android Studio／JDK／Android SDK，尚未產生 IPA／APK／AAB。接續資料與官方要求見 `docs/app-store/RELEASE_INPUTS_2026-10-14.md`；不把網站遠端載入外殼當成已完成正式雙平台 App。
