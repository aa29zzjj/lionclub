# LionClubs APNs 設定與啟用順序

2026-11-05。使用者已完成 Safari 登入。已核對 Prepmate AI inc.／Team **2TWCSJNDWG** 與 **com.lionclubsmembership.app**，並在使用者於操作時明確確認後，儲存 Push Notifications；重進 App ID 頁確認為開啟，Broadcast Capability 仍關閉。Apple 提醒相關 provisioning profiles 已失效、需為後續建置更新。

APNs 專用 key 的 Production／Topic Specific／單一 LionClubs topic 表單已準備並停在最終 Register。建立與下載的操作時確認仍待回覆；尚未產生金鑰、下載私鑰、發送通知或變更 AWS。

本機工程已加入 `App.entitlements` 與 Push capability，unsigned iPhone SDK Release 重新編譯通過；模擬預覽宿主明確移除 signing entitlement。這不是已完成 distribution 簽章：目前這台 Mac 仍為 **0 個有效 code-signing identity**，沒有建立或撤銷憑證／profile。

## 1. 登入並核對團隊

在 Safari 直接完成 Apple 登入及雙重驗證，不將密碼或驗證碼傳到聊天。進入 [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)。核對發行 Team **2TWCSJNDWG** 與 App ID **com.lionclubsmembership.app**，不是 Personal Team 或 UI 預覽 bundle。

若看不到 Keys 或不能建立，先核對既有角色及 Certificates, Identifiers & Profiles 存取；Apple 要求建立服務金鑰者為 Account Holder 或 Admin。不為了方便而自行授予另一人更大角色。[Apple 建立金鑰說明](https://developer.apple.com/help/account/keys/create-a-private-key/)

## 2. 核對 App ID 與推播能力

查看既有 App ID 的 Push Notifications。若尚未啟用，先展示精確 Team／Bundle 與擬開啟的能力，取得操作時確認再儲存。只做一般可見通知，不順帶開啟 Critical Alerts、VoIP、遠端控制或背景靜默通知。

Xcode 工程的推播 entitlement、對應簽章與 provisioning 也必須一致。候選 `App.entitlements` 使用標準 development 值，實際簽章／匯出環境由 provisioning 決定；正式發佈前要核對匯出 binary 是 production，不能把 unsigned 編譯成功當成有效推播 profile。[Apple 能力設定](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/)、[Apple aps-environment](https://developer.apple.com/documentation/bundleresources/entitlements/aps-environment)

## 3. 準備 APNs 專用金鑰

Keys → ＋，使用可辨識名稱（例如 LionClubs APNs Production），只勾 APNs，進入 Configure。依當下 Apple 介面核對環境與 Key Restriction；優先選 Topic Specific，限 **com.lionclubsmembership.app**，不使用覆蓋整個團隊 App 的權限。不借用 Sign in with Apple 或 App Store Connect key。

TestFlight／App Store 使用 production APNs；開發簽章的裝置使用 sandbox。若目前介面要求分開的環境金鑰，按實際用途分開配置，不把一個環境的成功視為另一環境通過，也不為沒有安排的環境預建金鑰。

到最終設定摘要後，先列出 Team、用途、topic、環境與權限，取得新增金鑰的操作時確認再 Register／Confirm。這項確認來自電腦操作工具對新增安全敏感存取的要求。

Apple 目前提供 Team Scoped／Topic Specific 與環境設定；依實際摘要確認，避免套用舊版通用金鑰教學。[Apple 金鑰設定說明](https://developer.apple.com/help/account/keys/create-a-private-key/)

## 4. 下載與保管

Apple 的 `.p8` 僅能下載一次。下載後由持有人放入已核定的受控秘密儲存位置；不寄聊天、不上傳 GitHub、不放網站公開目錄或前端環境變數。可以記錄非秘密的 Key ID、Team ID、topic、環境及保管責任人，文件不記私鑰內容。[Apple 下載提醒](https://developer.apple.com/help/account/keys/create-a-private-key/)

APNs 私鑰與裝置 Token 的 AES-GCM 加密金鑰是不同用途，不能共用。worker 私鑰檔需要只有擁有人能讀取的權限。本輪尚未選定秘密託管或更改 IAM，也沒有新增付費雲端資源。

## 5. 接上後端與專用裝置

先確認部署目標、備份及 additive migration；API 與 worker 分開提供必要設定，再核對隱私說明。受控 worker 需要明確的資料庫／topic／環境確認，只處理指定測試來源及專用測試收件人，不能用正式會員廣播測試。

完成新 build 的簽章／TestFlight 安裝後，由測試者在 App「我的 → 手機通知」主動開啟。驗收活動公告、好友邀請、資歷核准／退回與會籍核准，並測前景／背景／關閉、拒絕、重啟、停用、換帳號、撤銷／刪帳及點擊後重新授權讀取。

現有「入會拒絕」會刪除登入帳號，暫不推播；24 小時裝置租約、來源更新後抑制與實體清理排程亦須確認。APNs 回 200 只代表 Apple 接受請求，不是手機已顯示。最後才更新商店資料與送審下一版。

程式及設定細節見 [實作紀錄](NATIVE_UI_AND_PUSH_IMPLEMENTATION_2026-11-05.md)。
