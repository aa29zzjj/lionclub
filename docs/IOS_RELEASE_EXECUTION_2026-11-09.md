# iOS 更新執行紀錄 - 2026-11-09

## 已完成

- App Store Connect 已重新登入，實際確認已發布版本為 1.0（4），當時最新上傳為 1.0.1（5）。已建立 **1.0.1 更新草稿**，儲存本版更新說明；尚未新增以供審查或正式送審。
- 沿用既有審查帳號，在正式網站實際登入成功；`/api/me` 確認沒有任何管理角色。私人帳密未寫入本文件或 Git，未建立替代假真人帳號。
- 修正原生登入畫面以平台推定供應商可用的缺口。新增 `/api/mobile/auth/providers`，依原生 v2 與真正供應商設定回覆；App 在確認前不顯示可操作按鈕。舊服務 404、格式不正確、未啟用及連線失敗不會誤稱可用；帳密登入仍可使用，未知失敗有明確重試。
- 原生來源 `cbe1e5f`，本機測試 **529/529 TypeScript、268/268 路由／SQL／介面整合通過**，正式模式建置及隔離原生預覽建置通過。
- 產生 **1.0.1（8）** 簽署 Archive 與 IPA。既有團隊／憑證／描述檔沿用，不建立或撤銷簽章憑證。封裝、版本、權限、來源／Archive／IPA 三份資源與 strict/deep codesign 驗證通過。
- IPA：`output/releases/LionClubs-iOS-1.0.1-build8-2026-11-09.ipa`；5,054,136 bytes；SHA-256 `815fe4080535ae4815b8d55b4e0413000c1902a2ee5482548934b23e3a08ebf7`。Build 7 保留，不能當成已包含本次按鈕修正。

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

詳細本機證據：`output/acceptance/native-release-20261109-b8/` 的 `PRODUCTION_ADDITIVE_MIGRATIONS.json`、`SIGNED_IPA_VALIDATION.json`、`BUILD_SOURCE.json`、`ASC_VERSION_DRAFT.png` 與建置／上傳紀錄。公開版本紀錄不含憑證、審查密碼、會員或 DB 連線資料。

## 尚未等同完成的項目

二進位檔上傳、Apple 處理完成、測試分發與正式送審須分別確認。正式後端／旗標及新 App 的整合狀態，需以實際部署與驗收更新，不由本機通過推定。

Google／Apple 真實原生回跳、Apple 隱藏信箱收信及安全操作、真機通知／相機仍需完成相應驗收。APNs 金鑰先前僅授權建立與保管，本紀錄沒有啟用正式投遞或發送手機通知。CloudWatch retention 按持有人指示不變更，未新增未核准付費資源。
