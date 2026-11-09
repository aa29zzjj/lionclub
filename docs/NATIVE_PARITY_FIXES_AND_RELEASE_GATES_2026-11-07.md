# 網頁／iOS 差異修正與新版發行關卡

日期：2026-11-07（台灣）。本文件記錄本輪本機候選；**尚未部署到正式服務或更新 App Store，不能當作手機上的版本已修復。** 固定基線完整矩陣見 [WEB_IOS_PARITY_AUDIT_2026-11-07.md](WEB_IOS_PARITY_AUDIT_2026-11-07.md)。

後續狀態已更新：請見 [2026-11-09 續作進度](IOS_BUG_FOLLOWUP_2026-11-09.md)，包含 Xcode 已登入、活動／條款／歷史日期及帳號狀態修正。以下保留 11 月 7 日當時的觀察。

## 已查證的版本與設定

- 重新取得 GitHub `origin/main`，仍是 `844e82defbe459700a29dcb56adc1e7238907de8`。本輪在 `codex/android-play-prep-20261105` 本機工作，沒有推送、合併或觸發雲端部署。
- Apple 公開查詢顯示商店版為 **1.0**，發布時間 `2026-11-03T01:25:46Z`。公開頁無法證明內部 Build，也未擷取使用者手機上的二進位。[App Store](https://apps.apple.com/tw/app/lionclubs/id6826321953)
- 正式公開 `/api/auth/providers` 在本輪查詢回 200：Google `enabled=true`；Apple `enabled=false / APPLE_UNAVAILABLE`。未登入會員、未嘗試連結真實第三方身分。
- Safari 唯讀確認團隊 **Prepmate AI inc.／2TWCSJNDWG**，`com.lionclubsmembership.app` 的 **Push Notifications 與 Sign In with Apple 原本已啟用**，Apple 登入為 primary App ID。既有 Services ID 為 `com.lionclubsmembership.signin`；未儲存或改變 portal 設定。
- 該 Services ID 已列出 `lionclubsmembership.com` 與 `https://lionclubsmembership.com/api/auth/oauth/apple/callback`。既有登入金鑰 `N2S9R6YY26` 也綁定 LionClubs；本機找到同名 `.p8`，只做離線 EC P-256 簽章／驗證及檔案權限收窄至 0600，未輸出私鑰、未重建／撤銷金鑰，尚未證明 Apple 接受此檔案。
- 以既有授權身分先驗明 AWS 帳號後，唯讀檢查 `us-east-2` 的既有 `lionclub/app-secrets`：可讀，但五個 Apple client／team／key／private-key／token-encryption 欄位均未提供。僅輸出存在與否，沒有輸出值、完整 JSON 或資料庫憑證。此結論只限該核准 secret，不代表其他執行期來源一定沒有設定。
- 接續唯讀核對同一 Amplify App `d3e0lg3sq8xr96` 及 `main`：branch 沒有 override，**App 層級已提供全部五個 Apple 欄位**，且引用既有 `lionclub/app-secrets`；新 opt-in flags 均未啟用。因此不能因 secret JSON 沒有 Apple 欄位就說 Jerry 沒設定，更不能新生或替換現有 token encryption key。沒有輸出環境值、複製環境、更新雲端或把秘密寫入檔案。
- 本機目前為 **0 個有效程式簽章身分**；unsigned 編譯不代表可以上傳。
- Xcode 27.1 的 Apple Accounts 畫面目前顯示「Sign in to your Apple Account」，與使用者先前已完成登入的回報不同；這是本輪實際觀察，不推斷原因。Safari 的 Developer 登入仍有效，但不會自動替 Xcode 提供發行簽章。

## 本輪原始碼修正

| 項目 | 本機候選已處理 | 仍需驗收／部署 |
| --- | --- | --- |
| 通知與黑畫面防護 | 活動內頁／返回、審核結果前往「我的」、單筆與批次手動已讀；不再一開列表就自動全部已讀；發送頁有取消、載入失敗重試、收件人與長度限制；格式錯誤轉成可恢復訊息；非同步讀取世代與同步操作鎖；未知發送結果不自動重送 | 真實 App Store 舊版的黑畫面尚未取得可重現記錄，不能歸因為單一已證實原因；新版真機及正式 API 操作仍待驗收 |
| Google／Apple 登入入口 | iOS 原始碼本來就有兩個按鈕；候選可捲動登入頁、取消／逾時、精確 callback、舊 listener 清理；新增 v2 App state＋S256 與一次性 opaque handoff | 正式服務仍跑舊協定；Apple 服務未開啟。需配套後端、資料庫 migration、平台設定與新 App 發布 |
| 個人資料 | Email 編輯與重新驗證說明；JPEG／PNG／WebP 頭像預覽、取消、大小檢查；換帳號或離開後阻擋舊上傳接續更新 | 尚未真的寄驗證信、上傳圖片或改正式會員資料 |
| 圖片上傳 | iOS 改為原生二進位 PUT；只允許本次登入取得的精確預簽 URL、類型與大小，短效且單次；無 Bearer、無重導；本機照片讀取 CSP 保留 self／blob；後端簽章避開空檔 CRC32 | 前後端須同版部署。Android SDK 舊版 API 的 file transport 有缺口，暫明確拒絕原生上傳；沒有放寬成任意 S3／網路白名單 |
| 資歷 | 移除空白時代填「中央獅子會」；保留既有列冊狀態與地區碼；清空月份送 null；職務／層級、年限與文字檢查 | 組織目錄與名冊候選等完整 Web 體驗仍缺；後端既有日期正規化未改 |
| 管理操作 | 組織、角色、到期日選擇與有效選項驗證；既有持有人仍可撤銷；資歷審核具體理由、版本與確認 | 會籍分派、歷史入會年月與部分檢舉管理等差異仍見基線矩陣；未授予、撤銷或審核任何真實會員 |

不能以「有入口」推論兩端功能完全一致。尚未補齊的主要類別包括：註冊與忘記密碼、App 內條款同意、活動編輯／刪除、官方活動發佈範圍與分類標籤、會籍分派與入會年月、月曆／組織目錄／外觀與法務客服入口。完整欄位、權限與操作差異以基線矩陣為準。

## 實際畫面檢查的範圍

1. **隔離 iOS 宿主**：Bundle ID `com.lionclubsmembership.uipreview`，不是正式 App。合成資料、無網路、無真實登入／Keychain／APNs 操作。iOS 27.1 的實際 WKWebView 啟動首頁、通知、發送與登入畫面；安全亂數／SHA-256 能力檢查成功；刻意 render 錯誤出現重試畫面，仍可切回首頁。
2. **相同 React 畫面的本機互動檢查**：通知收到／已發送、重新載入、接受／拒絕、審核與活動已讀、查看活動／返回、至我的檔案、活動與收件人選擇、指定好友／整個分會、訊息與取消。所有寫入明確拒絕，不會冒稱送達或已更新。
3. **異常情境**：載入失敗、格式錯誤、發送頁資料失敗、沒有好友、刻意 render 失敗、重試及底部分頁離開。Google／Apple 兩個按鈕在合成登出畫面可操作；390×844、390×500 與大字候選檢查未把按鈕截斷成無法操作。
4. Device Hub 的自動捲動未能穩定帶動頁面，因此沒有把第二層互動檢查冒稱全部完成了 iOS 實機操作；鍵盤、VoiceOver、系統 Dynamic Type、iPad 與真實 App Store 安裝仍有獨立驗收工作。

畫面紀錄位於 `output/acceptance/native-parity-20261107/`，包括合成大字登入畫面與 iOS 錯誤隔離畫面。這些截圖不是公開商店或真實會員畫面。

## 本輪最後驗證

| 驗證 | 結果與界線 |
| --- | --- |
| 全部 TypeScript 測試 | 445／445 通過；包括新 OAuth、頭像、資歷、角色與通知邊界 |
| 全部隔離整合與 demo 測試 | 208／208 通過；使用測試自有 PGlite、路由與 Prisma SQL，無正式資料、外部寄信／Google token／APNs 發送 |
| 隔離介面安全測試 | 9／9 通過；真實 API、原生權限、網路與寫入皆禁止 |
| TypeScript／Prisma | 型別檢查及本機 Prisma Client generate 通過；migration 已在隔離資料庫驗證，未碰 RDS |
| Next production build | 通過；使用合成 DB／session 設定、關閉 provider／push，未使用正式秘密建置 |
| iOS Release | iPhoneOS 27.1 unsigned Release `BUILD SUCCEEDED`；不等於 Archive／有效簽章／可上傳 IPA |
| iOS 隔離宿主 | Simulator build、安裝與上述 WKWebView 操作通過；不等於已上架二進位或真機端到端測試 |

登入競態複查已補測：同一 provider callback 的輸家不能取消正在處理的贏家；只有精確 claim 擁有者能處理自己的失敗。Apple callback 的 refresh token 加密與刪帳撤銷也明確使用同一份已解析的設定及 encryption key，不會暗中回讀另一來源。

## 登入協定與部署順序

- App 每次在記憶體產生獨立 state 與 verifier；start 只傳 S256 challenge。callback 必須匹配精確 scheme／host、單一 state、`protocolVersion=2`。exchange 才送 verifier。
- 完成碼為 32-byte 隨機 opaque code，資料庫僅存 hash，最長 60 秒。exchange 重新確認有效會員與 sessionVersion，在 Serializable 交易中 CAS 消費一次才簽出 token；不存在 JWT-only／v1 fallback。bootstrap 也只能使用一次。
- 新增 nullable migration `20261107010000_native_oauth_v2_binding`；只在隔離 PostgreSQL 模擬執行，**沒有 apply 到正式資料庫**。
- migration 必須在新版後端之前套用；即使旗標關閉，共用 Web OAuth 的讀取與清理仍會用到新增欄位，不能把 default-off 當成免做 migration。
- `MOBILE_OAUTH_V2_ENABLED` 與 `APPLE_OAUTH_ENABLED` **預設關閉**。Android 第三方登入仍維持原 gate；不能因為有 v2 程式便宣稱 Android／iOS 真機登入已驗收。
- **不得單獨上線這個後端**：新後端拒絕 legacy 原生交換；舊 App 的第三方登入需明確安排更新及帳密替代方式。先在隔離環境執行 migration、配套後端與 App 驗收，確認舊版影響，再決定正式開旗與更新順序。
- Apple runtime 改為明確 opt-in、同來源完整設定；原本 Google-only allowlist 不再使合法 Apple 設定永遠被丟棄。這不會自動啟用 Apple，亦不解除 fresh reauth 等敏感操作 gate。

## 正式送出更新前還缺什麼

1. 確認既有 Apple Services ID 的 primary App、正式網域與 return URL：`https://lionclubsmembership.com/api/auth/oauth/apple/callback`，並確認 Apple 登入專用金鑰的管理人及秘密託管。APNs 金鑰不可挪用。新增金鑰、秘密託管與開放正式登入須採明確範圍。[Apple 網頁登入設定](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)、[Apple 專用金鑰](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key)
2. Google／Apple 實際 consent、已連結／未連結身分、取消、冷啟動／返回、登出換帳號，以及 Apple-only 會員安全操作與刪帳／撤銷驗收。**Apple fresh reauth 尚未驗收，不可先開旗來假裝完成。**
3. 配套後端圖片簽章、native v2 migration 與部署計畫，以及隔離測試用會員／幹部範圍。未建立新增付費 AWS 資源。
4. 本輪及剩餘差異的 iPhone／iPad 真機驗收；確認產品是否本版補齊所有 Web 功能，或明確接受尚未移植的範圍。
5. 取得既有授權團隊的可用發行簽章，設定高於目前商店／已上傳 build 的版本與 Build，完成簽署 Archive、TestFlight 驗收，再送 App Store 更新。目前未建立或撤銷任何憑證／金鑰，未上傳新 build。
6. 隱私政策、資料收集與推播託管／保留的核對仍是發行關卡。CloudWatch 保留期限維持使用者先前「暫不變更，交 Jerry 確認」；沒有刪日誌或宣稱已設 90 天。

Google Play 註冊另線保留：目前仍未確認 US$25 付款／開發者帳號建立完成，沒有因本輪 iOS 修正而自動上架或提交 Android。
