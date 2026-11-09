# iOS 更新執行紀錄 - 2026-11-09

## 已完成

- App Store Connect 已重新登入，實際確認已發布版本為 1.0（4），當時最新上傳為 1.0.1（5）。已建立 **1.0.1 更新草稿**，儲存本版更新說明；尚未新增以供審查或正式送審。
- 沿用既有審查帳號，在正式網站實際登入成功；`/api/me` 確認沒有任何管理角色。私人帳密未寫入本文件或 Git，未建立替代假真人帳號。
- 修正原生登入畫面以平台推定供應商可用的缺口。新增 `/api/mobile/auth/providers`，依原生 v2 與真正供應商設定回覆；App 在確認前不顯示可操作按鈕。舊服務 404、格式不正確、未啟用及連線失敗不會誤稱可用；帳密登入仍可使用，未知失敗有明確重試。
- 原生來源 `cbe1e5fec4e978574ea98b8d1b10c6c207a3eef2`，本機測試 **529/529 TypeScript、268/268 路由／SQL／介面整合通過**，正式模式建置及隔離原生預覽建置通過。
- 產生 **1.0.1（8）** 簽署 Archive 與 IPA。既有團隊／憑證／描述檔沿用，不建立或撤銷簽章憑證。封裝、版本、權限、來源／Archive／IPA 三份資源與 strict/deep codesign 驗證通過。
- IPA：`output/releases/LionClubs-iOS-1.0.1-build8-2026-11-09.ipa`；5,054,136 bytes；SHA-256 `815fe4080535ae4815b8d55b4e0413000c1902a2ee5482548934b23e3a08ebf7`。Build 7 保留，不能當成已包含本次按鈕修正。
- **15:33（臺灣時間）上傳工具回報成功**。接續已於 App Store Connect 確認 Apple 處理完成，Build 8 可選取，並已加入 1.0.1 更新草稿；畫面儲存按鈕停用，確認草稿已儲存。尚未新增以供審查、提交審查或公開發布；也不能把此結果當作 TestFlight 已分發。
- PR #3 已合併，正式 `main` 為 `a3ae1ee38a48cc8af951126897ec7696adc9fab1`，Amplify job 94 為 **SUCCEED**。本次配套後端已部署；原生 OAuth v2、Apple 登入、Email 安全驗證與手機推播開關仍關閉，不因部署成功就宣稱供應商或手機推播可用。聖迪活動 QR 仍在有效期限內，邀請網址及 token 不放入公開文件。

## 正式 API 與模擬器驗收進度

未簽章的模擬器宿主曾在帳密登入顯示通用失敗訊息。使用**完全相同的 JS 資源**，以 Xcode 正常的 `CODE_SIGNING_ALLOWED=YES`、`CODE_SIGN_IDENTITY=-` 重建模擬器宿主後，操作人手動輸入同一審查帳密登入成功，畫面已顯示審查會員首頁。沒有重設帳密、替換安全儲存或改用不安全的儲存方式。結果支持原問題與該模擬器宿主的簽署狀態有關；未取得原始 OSStatus，因此不聲稱已證實特定 Keychain 錯誤碼。這也不是現有 App Store 二進位或實機登入的完整驗收。

本輪已確認模擬器通知重新載入、已發送空列表、發送表單開啟（**沒有發送通知**）、活動列表、活動詳情與返回，以及「我的」基本頁可顯示。好友邀請及收到的活動通知均為空，尚未驗收有資料時的邀請回覆、通知內容或點擊結果；其餘操作仍在驗證中。既有審查帳號可在網站及本輪模擬器登入，不代表幹部、Apple-only 帳號、推播或刪帳流程已全部驗收。

## 正式資料庫配套

唯讀核對先驗明既有 AWS 帳號、核准的 secret 引用、RDS 實例與資料庫／public schema，使用官方 RDS CA 及嚴格憑證／主機驗證。既有備份保留為 1 天、PITR 時點可用，未更動備份或建立額外付費資源。

9 項歷史 checksum 差異均精確比對為換行／結尾換行格式差異；沒有 SQL 內容差異、未結束遷移或變造歷史紀錄。保留既有 checksum，不回寫舊紀錄。

已在有互斥與 3 秒 lock timeout 的單一 PostgreSQL 交易套用以下精確 SHA-256 的新增遷移，並寫入標準遷移紀錄：

| 遷移 | SHA-256 |
| --- | --- |
| `20261105090000_mobile_push_foundation` | `ecbae0930e4c13f8176474a5fa6580d24de051c4c3094464254c8230eb72cbb2` |
| `20261107010000_native_oauth_v2_binding` | `0aeb730a1e2fff4f1bb54f6c67f61c16a213adf28b766d659257ae0a563be662` |
| `20261109090000_email_action_step_up` | `b457635efcaa977e0385fb904c87357388ed3ac1875ede47423a0724049d86d5` |

驗證四張新表與八個 nullable 欄位完整；新表均為空，不回填 Apple 信箱可信來源。Member／User／Event／報名／登入連結／角色筆數在遷移交易內前後一致。部署功能旗標沒有改動，沒有重置、刪除或分派會員，聖迪活動流程仍沿用。

隔離 SQL 演練先證實：途中失敗可一併 rollback DDL 與 journal，成功才原子套用三份遷移。單連線演練不冒稱模擬正式併發；正式使用 Prisma migration advisory lock 協調及 metadata 鎖定。

詳細本機證據：`output/acceptance/native-release-20261109-b8/` 的 `PRODUCTION_ADDITIVE_MIGRATIONS.json`、`PRODUCTION_MIGRATION_POSTCHECK.json`、`SIGNED_IPA_VALIDATION.json`、`BUILD_SOURCE.json`、`ASC_VERSION_DRAFT.png`、`ASC_BUILD8_DRAFT_SAVED.png`、`NATIVE_SIGNED_SIM_LOGIN_OK.png`、通知／活動驗收截圖與建置／上傳紀錄。這些是本機驗收資料；公開文件不包含審查會員身分、憑證、密碼、token 或 DB 連線資料。

## Apple 執行期設定仍未安裝完成

既有 Apple 登入私鑰已將同一把金鑰的 DER 主體正規化為 PEM 格式，並儲存於既有 Amplify App 設定；沒有新生或替換金鑰。核准的既有秘密託管項目 `lionclub/app-secrets` 尚未安裝所需五欄。實際寫入回覆 `SECRETSMANAGER_400_ACCESSDENIEDEXCEPTION`，未建立新的秘密版本階段；後續 CloudTrail 唯讀查核也被拒絕，沒有擴張 IAM 權限或假稱託管已完成。保留既有憑證及加密金鑰，接續需由具備該既有項目寫入權限的人員完成精確範圍的安裝，再驗收真實 Apple 隱藏信箱及安全操作。

## 尚未等同完成的項目

二進位檔上傳、Apple 處理完成、Build 8 選入並儲存草稿及正式後端部署均已完成；測試分發、正式送審與公開發布仍是後續獨立步驟。**目前仍未達送審條件**，不將商店草稿或部分模擬器操作當作完整整合驗收。

Google／Apple 真實原生回跳、Apple 隱藏信箱收信及安全操作、真機通知／相機仍需完成相應驗收。APNs 金鑰先前僅授權建立與保管，本紀錄沒有啟用正式投遞或發送手機通知。CloudWatch retention 按持有人指示不變更，未新增未核准付費資源。
