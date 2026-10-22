# 自助刪帳移除與上架阻斷（2026-10-22）

使用者明確要求「不要再有刪除我的帳號的功能」。本次依此移除整條自助操作流程，不以商店要求為由保留隱藏 API，也不新增人工申請、假排隊或自動刪除。

## 目前行為

- 「我的」安全工具、客服頁、隱私頁與公開頁導覽不再有刪帳操作入口。第三方登入連結及其他裝置登出保留。
- 舊 `/account/delete` 只顯示「此功能已移除」。沒有帳密／重新驗證表單、送出按鈕、刪除申請或背景操作。
- `POST /api/me/account-deletion` 一律回 `410`、`ACCOUNT_DELETION_REMOVED`、`accountDeleted:false`、`requestCreated:false`，`Cache-Control:no-store`。不讀請求 body／Session／DB，不消耗近期本人證明，不變更 Cookie、不寄信、不建立清理工作、不呼叫外部供應商。
- 目前無自助刪帳。仍可聯絡客服提出隱私詢問，但一般詢問不代表刪除申請已受理、排程或完成，不承諾刪除時限；這不免除營運方依法處理資料權利請求的責任。

## 歷史資料與清理維護

本輪不操作正式 DB／AWS，不回復歷史已完成的匿名化，也不取消已提交的清理工作。歷史 migration、內部匿名化／完整性 helper，以及只由受控維運執行的既有 cleanup workers 保留。維護測試透過內部 helper／合成 SQL fixture 驗證，不能把它當作公開可用自助刪帳功能。

既有已提交工作仍應依原有授權、最小存取、重試／lease／監控及備份保留安排維護；沒有新增可由會員觸發的公開執行入口。

## App Store／Google Play：明確 blocked，未送審

2026-10-22 核對官方要求：支援建立帳號的 App，Apple 要求可在 App 內發起刪除；Google Play 要求 App 內途徑及可提出刪除的外部網頁資源。只有停用、說明頁或一般客服詢問，不能當作本版已具備該能力。[Apple 官方](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/)、[Google Play 官方](https://support.google.com/googleplay/android-developer/answer/13327111)

因此 `METADATA.zh-Hant.json` 保持 `ready:false`、`submissionReady:false`，狀態 `blocked`，新增明確原因 `ACCOUNT_DELETION_REMOVED`；盤點工具不能再以舊 API／頁面檔案存在算通過。本次未提交商店。後續若仍要發行，需先由使用者重新決定產品方向及滿足適用要求，不會擅自恢復刪帳功能。

## 回歸驗收

- 退役 route 在匿名、登入、無效 Origin、惡意／缺失 body 等情況均固定 410，不載入 DB、Session、proof、寄信或 AWS 模組。
- 既有合成帳號、會員資料、角色、工作、proof、限流記錄及 Cookie 均不因呼叫退役 API 變更。
- UI 不含可操作刪帳入口；舊頁只顯示退役說明，不宣稱受理。歷史內部完整性與清理測試仍保留，與功能可用性分開報告。
