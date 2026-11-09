# 隱私說明本機候選修正 — 2026-11-09

狀態：僅本機候選文案，不是服務持有人核准的正式政策、法律意見、App Privacy 填答驗收或商店送審完成紀錄。本次沒有部署、修改雲端／資料庫、變更商店 metadata 或 ready 旗標。

## 本次檔案與差異

| 檔案 | 修正 |
| --- | --- |
| `src/app/privacy/page.tsx` | 範圍由網站擴至網站與 iOS App；保留既有 `ServiceContactDetails`，未發明責任主體、聯絡、區域或保存值。 |
| `src/lib/privacy-policy.ts` | 版本由 `2026-10-27` 改為 `2026-11-09`，註解改為實際行為，不再暗示常數會自動觸發既有會員重新同意。 |

具體文案調整：

1. 區分網站 HttpOnly Cookie 與 iOS App 的存取／更新憑證、Keychain 安全儲存，及通知選擇、隨機安裝識別碼、登記版本；不承諾解除安裝會清除所有資料。
2. 說明原生相機拍攝後在裝置辨識 QR；只有主動選擇並執行上傳流程的頭像／活動圖片傳至圖片儲存。不把未要求裝置定位權限寫成完全不處理活動場地。
3. 說明條件式、可選 iOS APNs：需要服務啟用、明確選用與系統權限；未啟用仍可看 App 內通知，不宣稱 Android 推播已提供或正式推播已完成真機驗收。
4. 揭露安裝識別碼、APNs token、帳號／會員／登入關聯、token 加密與雜湊、通知來源／類型與投遞狀態。加密或雜湊不是匿名化。
5. APNs 僅傳通用提示及通知類型，不帶姓名、活動原文或審核理由；實際內容由登入後權限檢查。說明 App 與 iPhone 的停用選項、離線未同步風險及無法保證收回已交付系統的通知。
6. 不再一概聲稱 Apple 登入未啟用：此 checkout 有 Apple runtime gate，實際提供方式依服務設定與畫面；本次未查正式 runtime。Meta 尚未提供。
7. 移除名冊撤回後 30 天、操作日誌 90 天、頭像刪帳後 30 天及備份不額外延長等未驗明承諾；保留資料類別、清理限制與須由營運確認的事實。
8. 名冊撤回說明對齊程式：停止後續比對，不自動刪既有草稿或原始年度名冊；本人草稿可編輯／刪除，來源授權、揭露及保存規則仍需核定。
9. 不把內部測試、簽署或驗收程序當成產品操作步驟。保留真正的個人資料修改、本人刪除流程、幹部／活動交接限制及未建立申請佇列的說明。

## 程式依據與保留期限界線

- `mobile-app/src/contract.ts`、`mobile-session.ts`：原生 Bearer 存取／更新憑證，由注入的安全儲存介面寫入／清除；不是網站 Cookie 流程。
- `mobile-app/src/native-push.ts`：iOS PushNotifications、Keychain 安裝識別碼與通知偏好；`push-controller.ts`：明確按鈕才要求通知權限，停用分別確認伺服器及原生結果。
- `src/lib/mobile-push.ts`、`mobile-push-crypto.ts`、Prisma `MobilePushDevice/Receipt/Delivery`：與使用者連結的登記及投遞資料；成功停用清 token 與裝置待發工作，但登記修訂／其他紀錄不因此全部刪除。
- `src/lib/mobile-push-config.ts`：lease／delivery 24 小時、receipt 7 天是使用有效期，不是物理保存上限。`mobile-push-delivery.ts` 與 worker 會拒絕／丟棄失效工作，所讀程式未提供這些過期資料的定期刪除工作。
- `mobile-app/src/FriendsScreen.tsx`、`EventDetailScreen.tsx`：相機圖片以 `jsQR` 在裝置辨識；圖片上傳另經主動選擇與限定的圖片上傳流程。
- `src/lib/roster-consent.ts`：撤回移除比對同意；沒有「30 天後刪除原始名冊」排程。
- `src/lib/account-deletion.ts`：保留共享資料及受限稽核，建立可重試頭像清理工作；至少六分鐘安全等待，不是完成 SLA，也沒有程式上保證的 30 天完成期限。
- root 本輪已取得的 AWS 只讀盤點顯示相關 CloudWatch retention 未設、account policy 存取遭拒；本次未自行連 AWS 核實或修改。不能由未知帳戶政策推定 90 天刪除或無限保留。本輪決定將核實與設定交給 Jerry，不擴張權限處理。

## 版本及既有同意的影響

`PRIVACY_POLICY_VERSION` 目前只在 `central-onboarding.ts` 記錄新註冊的 `Member.privacyConsentedAt`／`privacyConsentVersion`，並供政策頁顯示。這次改常數：

- 不需要新增 schema 或 migration。
- 不修改既有會員同意、時間或帳號狀態；沒有批次資料庫改寫。
- 不會使舊會員自動重新同意、登出，或阻止其繼續使用。
- 註冊 API 接收的是明確的 `privacyConsent` 布林值，由伺服器寫當時版本；目前沒有客戶端政策版本比對或既有會員新版確認 API／畫面。
- 原生 `TermsConsentPrompt` 與 `/api/mobile/me/terms-consent` 只處理 `TERMS_VERSION`，不能代替新版隱私同意。

正式發布前須由持有人決定新增資料處理的適當告知／同意安排，保留舊版文案及差異紀錄；若需要既有會員重新確認，另行實作及驗收真正的版本查核與明確同意流程。不得只改常數或批次改 DB 就宣稱所有人已同意。推播選用與系統權限也不代表同意其他未揭露用途。

這三個候選檔案不更改原生 `mobile-app/dist`。若其他工作新增 App 內隱私入口或改 App 程式，仍須依新資源重新建置與驗收，不能沿用舊 IPA 的資源雜湊證明。

## 正式公開前必須由持有人／Jerry 補齊

| 負責方 | 必要確認／證據 |
| --- | --- |
| 服務持有人 | 核准這份政策及新增資料處理的告知／同意依據、舊會員處理及回應安排。既有 `ServiceContactDetails` 已填的營運主體與客服／隱私信箱維持原值；是否已核准依持有人已有紀錄，不由本候選重新認定為空白或杜撰新值。仍須確認實際承接與處理責任。 |
| 持有人與 Jerry | AWS／Apple／登入供應商等資料接收與處理安排、實際區域、角色／存取及 SDK 資料清單；不能只因未見廣告 SDK 就填「不收集資料」。 |
| Jerry | CloudWatch 實際記錄欄位、log-group／account retention；RDS 自動／手動備份；S3 歷史版本、快取及刪除作業；已保留共享／稽核資料各自用途與保存規則。取得合法權限並核准後再變更，不先宣稱固定天數。 |
| Jerry | 名冊來源與被列名者揭露授權、撤回／刪除的實際範圍；推播裝置／收據／投遞紀錄的保存與受限清理工作；頭像清理排程、失敗監測與實際完成期限。 |
| App 負責人與持有人 | 正式 URL 與實際發布版本、登入／推播設定、真機行為、商店 App Privacy 填答及第三方 SDK／隱私清單一致。root 已另外在候選 My 頁加入政策入口（`e2826de`），並回報合成錯誤／大字體畫面檢查通過；這些 App 變更預備重建 build 7，不能當成已驗收的 build 6 IPA 已包含。 |

尚未核實的期限不能靠文案補成事實。這次移除假承諾只是修正候選內容，不是上述營運與商店要求已完成。

## 本機檢查

- TypeScript：`tsc --noEmit --incremental false` 通過，未執行 production build。
- `tests/central-onboarding.test.ts`：48/48 通過，包含新註冊寫入當前隱私版本與時間的既有測試。
- `tests/terms-gate.test.ts`、`tests/native-terms-consent.test.ts`：9/9 通過；這些是使用條款的正常同意行為，不是新增的隱私重同意驗收。
- 既有 `tests/public-service-pages.test.ts` 初跑 2/3，因其第一例硬要求「六分鐘」及「30 天內清除」，與本輪移除未驗明固定天數的要求衝突。沒有為滿足舊斷言而恢復假 SLA。其後 root 已改驗共享資料保留、未知期限揭露及不含未驗明 SLA，並回報 3/3 通過。本代理未修改該所有權範圍外測試或新增鏡像文案測試。
- 只檢查本機程式與公開 Apple 文件，未連正式 DB／AWS，未更動既有同意資料或商店回答。

安全操作信箱驗證的本機實作與隔離測試已完成，root 已補上條件式揭露：只用既有經 Apple 驗證的登入信箱，不採自填檔案 Email；帳號／登入狀態、操作、Apple 身分與信箱快照、雜湊碼／操作憑證、嘗試／寄送與使用時間等資料。10 分鐘驗證碼與 5 分鐘操作確認只是可用期限，不是物理保存期限；目前僅有主動取碼時分批清理，不宣稱部署定期清理。功能預設關閉；真實 Apple 隱藏信箱收信及指定操作仍須驗收，本候選不將本機完成說成正式啟用。

## 官方來源（2026-11-09 查閱）

- [Apple App Review Guidelines 5.1](https://developer.apple.com/app-store/review/guidelines/#privacy)：App 內及商店應能取得政策，說明收集、用途、第三方及保存／刪除、撤回選擇；不強迫開啟非必要系統功能。
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)：包含第三方資料實務；功能用途或初次選用後持續收集也須依規則揭露，不能把選填當全面豁免。裝置／使用者識別碼與帳號關聯須據實盤點，雜湊或加密不等於已去識別。
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)：政策 URL 及 App Privacy 回答是另外的商店資料；本次沒有發布或改寫這些回答。

以上為依程式作的候選揭露與盤點，非法律結論或 Apple 核准。
