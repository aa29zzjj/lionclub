# 2026-10-14 正式發版操作紀錄與接續入口

## 授權與實際狀態

2026-10-14 R2 最終決策：**Jerry 負責全部正式 AWS 備份、migration、同版 main／Amplify 部署與正式驗收；Hao 不執行 migration，不接手 AWS／RDS 正式操作，負責手機版與上架。** 先前「Hao 接手 migration」的方案作廢，不再要求 AWS／DB 憑證移交給 Hao。Jerry 遇阻擋需回報，不默認轉交執行責任。

本輪只更新文件並留存在發版分支，不觸發 main 部署。下列正式操作全部是給 Jerry 的接續清單；使用者先前的發版授權不代表 Codex 本輪應代跑正式 DB。

目前已確認：

- GitHub `aa29zzjj/lionclub`（公開 repository）可讀寫，main 基準為 `8962dd40c397a37ebbe91e449a84d05684bfcfc0`；本輪 fetch 無新的 main commit。
- 倉庫沒有 GitHub Actions workflows、Actions secrets、Actions variables 或 GitHub deployments 記錄，不能假設已有可代跑正式 migration 的 CI。
- 本機無 AWS shared profile／credential、AWS 環境憑證、正式 `.env` 或正式 DB URL；SDK default credentials provider 未取得身分。
- AWS Console 顯示未登入，沒有適用的已連線 Amplify／RDS 部署管道。本輪不再要求使用者提供 AWS 登入，由 Jerry 在受控環境接續。
- **尚未執行正式 migration、尚未推 main、尚未重啟／啟用 Amplify 部署。** 不能把本機成功或 Git commit 視為資料庫備份與已上線證據。

發版候選保存在 `codex/acceptance-fixes-2026-10-14`，功能 commit 為 `0e99138`；GitHub 交接版以該分支最新 HEAD 為準。Jerry 的單一接續入口是 [JERRY_HANDOFF_RELEASE_2026-10-14.md](JERRY_HANDOFF_RELEASE_2026-10-14.md)，更新摘要為 [RELEASE_2026-10-14.md](RELEASE_2026-10-14.md)。不需要在聊天貼金鑰、DB 密碼或私鑰。

手機工程、商店素材與測試 APK 的準備可並行；**新版實際後端必須先 migration 再部署，同版後端通過驗收後才接正式原生 App／送審。** 不以 App Store 或 APK 取代 DB migration，也不保證延後 migration 時新版能運作。

## 本次上線前追加補強

最後本機回歸：TS 109/109、MJS 整合／模擬／部署護欄／既有展示 41/41，共 150/150 通過。相較先前 PDF 的 143 項，新增 rollout／完整回滾與部署前檢查規則測試；PDF 保留作為當時的修復驗收紀錄。

- 新 migration `20261014090000_acceptance_security_and_history` 明確使用 BEGIN／COMMIT；任何中途 SQL 失敗會回滾本次變更。
- `lock_timeout=10s`、每條 `statement_timeout=120s`。逾時需確認 migration history；不得自動 reset、seed、resolve 或盲目重跑。
- 兩張 token 表的 Email 欄位提供空字串 rollout sentinel，允許切換期間舊程式仍能新增記錄；新版拒絕 sentinel，不把未綁信箱的連結視為有效。
- 原有未使用 token 會失效；sessionVersion 使舊登入重登。新欄位、掃表、索引及限制性外鍵仍會持鎖，不保證尖峰零停頓。
- `.gitignore` 增加環境檔、備份與原生簽章／安裝包排除，避免公開 repository 混入密碼、DB dump、Apple／Android signing material。

## Jerry 在受控環境接續的執行順序

1. 確認 STS／Console 帳號、區域、Amplify app 與 main branch，網域必須對應 `lionclubsmembership.com`；查明自動部署是否暫停。不把另一個 AWS profile 當正式環境。
2. 確認 RDS instance、Secrets Manager 中實際 DB target、加密連線及復原能力。執行備份／snapshot，等待狀態 available，記錄 snapshot ARN／時間；Git commit 不代替這一步。備份內容不得進 GitHub。
3. 選短維護窗口／停寫，記錄 migration history、前置數量與長交易；檢查沒有先前失敗 migration、缺少前置版本或 checksum 改動。不要強制中斷未知業務交易。
4. 在同版完整 checkout 以已驗證 DB target 執行 `prisma migrate deploy`；不使用 `db push`、`migrate dev`、reset 或 seed。正式密碼由受控執行環境注入，不在終端列印。
5. 套用後比對 migration checksum、欄位、FK、Member／User／Event／Registration 數量與月份約束；停寫窗口前後四類數量應完全相同，資歷／token 總數也不應減少。preflight 不自動比兩次 JSON，須人工核對；token 失效與舊月份保持空另行確認。套用失敗時先檢查 DB，不能只憑 CLI 非零就推論所有內容已還原。
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
