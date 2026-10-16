# A1 2026-2027 核定名冊匯入作業

核定日期：2026-10-15。執行者：Jerry。此文件不含具名名冊、電話、Email、照片或邀請 QR。

## 資料與核定範圍

- 使用者於本對話表示「名單核對無誤」。公開版只含 131 筆組織：1 複合區、1 區、12 專區、24 分區、93 分會。
- 私人核定檔有 305 筆有姓名任職。原草稿共 323 個任職欄位，其中 18 個姓名空白／裁切欄位未補猜，列為 omissions，不建立虛構人員。
- 核定的是照片可見欄位，不是已完成正式 DB ID 映射、Email 驗證、本人帳號連結或角色授權。
- 來源限第 1-9、51-62 頁。第 10-49 頁未提供，第 50 頁局部不計，第 63 頁活動計畫不納入。不得宣稱全冊已齊。
- 300A 是複合區，300A-1 是區，以下依序是專區、分區、分會。AI臺科大和台北科大是兩個分會，不能模糊合併。
- 正式名稱與 DB ID 由操作人精確核對。「紳德」、「僑商」等照片原文不能直接套用近似分會。

## 新資料模型

`RosterImportBatch` 保存核定來源摘要、年度與批次。`AnnualAppointment` 保存具名年度列載任職，不需要 Email／MemberID。它沒有 User／Member 關聯，也不觸發 MemberExperience 或 AdminRole 寫入。

歷任／榮譽保留 listingNature，不當成本年度現任管理者。年度為名冊列載年度；未捏造個別任期起訖。之後本人核實、帳號連結、資歷核實、行政授權為獨立流程。

新 migration 只建表及索引，不自動套名冊、不改既有角色。`ExperienceReviewAudit` 同批提供資歷核實稽核。先備份、核對 migration status，再由 Jerry 套用 migration。

## 私人輸入契約

檔案 schema 為 `lionclub-approved-roster-v1`，包含 batchId、yearStart、approval、organizations、appointments、omissions。approval 必須有核定來源與含時區的 ISO 時間。

每筆組織以來源 key 與 parentKey 連結。每筆任職有來源 key、organizationKey、職稱、姓名、原文所屬分會、列載性質與來源頁。候選 key 不是正式 DB ID，不能用人名當 upsert key。

操作人另提供 mapping，所有組織都必須明確選擇 existing 或 create。existing 必須填 targetId、DB 原名與 expectedParentId，全部與快照相符；create 必須明確指定新 targetId 與正式名稱。工具不按姓名配對，也不按分會相近名稱選擇第一筆。

mapping 單列範例（合成，不能直接用於正式資料）：

```json
{"sourceKey":"R01","action":"create","targetId":"operator-chosen-region-id","name":"第1專區"}
```

existing 單列範例（合成）：

```json
{"sourceKey":"D300A1","action":"existing","targetId":"operator-confirmed-id","name":"DB中的原名","expectedParentId":"operator-confirmed-md-id"}
```

## 安全執行順序

1. Jerry 私下取得具名核定 JSON 與摘要，核對檔案 SHA-256。禁止放 GitHub、CI artifact、issue 或公開雲端連結。
2. 確認正式目標、備份已完成及還原責任人。使用限定角色與既有安全連線路徑，不開公開 RDS、不索取 root 或明文密碼。
3. 套用 `20261015090000_review_audit_and_annual_roster`，核對 `prisma migrate status`。這是 Jerry 的正式環境工作，本輪沒有代跑。
4. 用唯讀組織快照填 mapping。既有分會移到核定分區會影響後代權限範圍，必須逐筆審核 reparent 差異，不能只看總筆數。
5. 先離線預覽，再以唯讀 DB 預覽取得最新 planDigest。正式套用必須顯式確認此摘要與 DB label。
6. 整批 Serializable 交易內重讀組織與祖先、檢查父層及循環。任一失敗整批回滾。更動後 planDigest 不符會拒絕，需重新預覽。
7. 同批同內容再次執行為 alreadyApplied。相同 batchId 不同內容拒絕；年度／組織／來源列另有唯一索引，防止換批次重複塞同一列。修訂另走受控差異流程，不覆蓋歷史。
8. 完成後核對組織、任職筆數與父層，確認 User／Member／MemberExperience／AdminRole 數量未因名冊匯入增加。抽查近似分會、歷任／榮譽與 18 個排除欄位。

## 命令

以下只示範參數，不在此文件放連線字串。CLI 不載入 .env，不使用 ambient DATABASE_URL 或 AWS Secrets。預設離線，沒有 `--apply` 不執行 DB 寫入。

```sh
node scripts/import-annual-roster.mjs --help
```

取得組織唯讀快照，須由操作人安全注入 ROSTER_DATABASE_URL：

```sh
node scripts/import-annual-roster.mjs --export-organizations --output /private/path/organizations.private.json
```

離線預覽（不連 DB）：

```sh
node scripts/import-annual-roster.mjs --input /private/path/approved.private.json --mapping /private/path/mapping.private.json --snapshot /private/path/organizations.private.json
```

唯讀 DB 預覽：

```sh
node scripts/import-annual-roster.mjs --input /private/path/approved.private.json --mapping /private/path/mapping.private.json --inspect-db
```

核對輸出的 planDigest，安全注入 ROSTER_DATABASE_URL 與 ROSTER_DATABASE_LABEL，才執行：

```sh
node scripts/import-annual-roster.mjs --input /private/path/approved.private.json --mapping /private/path/mapping.private.json --apply --confirm-plan REVIEWED_SHA256 --confirm-database CONFIRMED_LABEL
```

CLI 日誌只輸出摘要與筆數，不印人名、連線字串或原始 provider 錯誤。私有檔案使用最小檔案權限。`private-data/`、`*.private.json` 等已排除 Git；這不是公開上傳的授權。

## Jerry 回填

請回覆正式 SHA、Amplify job／分支、migration status、備份完成／還原責任人、mapping 與 planDigest 的私有留存位置、實際新增／移動／略過筆數、未配對組織，以及正式正反權限驗收。不要回傳密碼、Token、Cookie、AWS key 或完整電話名單。
