# App Store／Google Play 上架準備（2026-10-13）

目前已具備會員、好友 QR、活動、幹部管理與日夜 UI；尚未產生 iOS／Android 原生專案或可簽名安裝包。本資料夾是上架準備包，不代表已申請開發者帳號、提交審查或完成商店要求。

## 這次可直接使用的內容

- [繁體中文商店資料草稿](METADATA.zh-Hant.json)：名稱暫用「獅子會 App」，未知資料保留 `null`，未驗收項目為 `false`。
- [原生架構選項](NATIVE_ARCHITECTURE.md)：說明既有 Next.js 動態 API、Cookie 登入與 QR 掃描如何延續。
- [隱私、帳號刪除與 UGC 契約](PRIVACY_AND_ACCOUNT_API_DRAFT.md)：給 Jerry／Hao 的後端與介面接點；全部是待實作草案。
- 無依賴盤點指令：`node scripts/check-app-store-readiness.mjs`。需要在 CI 阻擋缺項時加 `--strict`；它只看檔案／設定與本機 Xcode，不連正式服務，也不能證明功能或政策已通過驗收。

## 分工與順序

| 優先順序 | 工作 | 負責／驗收 |
| --- | --- | --- |
| P0 | 正式 App 名稱、持有商標／Logo 的授權、上架法律實體、客服與隱私聯絡信箱、公開政策網址、發行地區 | Hao／Tom 提供及確認；Jerry 核對實際資料處理 |
| P0 | 決定原生架構與 App 身分，確認 Apple Developer／Play Console 所有人；建立 Bundle ID、簽名與 Xcode 環境 | Hao 主導；Jerry 協作 API／登入 |
| P0 | 真正可用的帳號刪除；保留資料與匿名化決策、S3 圖片清除、Session 失效、公開外部刪除入口 | Jerry 後端；Hao 前端；共同驗收 |
| P0 | 會員介紹／照片與活動內容的檢舉、封鎖、管理審核及回應流程 | Jerry 後端；Hao 入口與管理 UI；營運負責人回應 |
| P0 | 公開 HTML 隱私政策與客服頁、App Privacy／Google Data safety 宣告 | Hao 頁面；Jerry 核對 AWS／SDK／記錄與保留；法律實體確認內容 |
| P1 | 原生相機權限、照片選擇、返回、外部連結、斷線畫面、登入持久化、日夜狀態列與安全區 | Hao；Jerry 協作 Cookie／API；Tom 真機驗收 |
| P1 | 合成審查帳號、第二名合成會員 QR、可操作活動、審查說明與完整商店圖片 | Jerry 配置合成資料；Hao 文案／素材；共同 TestFlight 驗收 |
| P1 | Build／Archive／簽名，TestFlight 內部測試、Android internal testing，修正後送審 | Hao；由帳號所有人處理付費、協議與提交 |

## 官方要求核對

Apple 要求有足夠實際用途與 App 體驗；單純網站包裝存在 4.2 審查風險。會員資料與活動內容由使用者產生，需評估 1.2 的篩選、檢舉、封鎖與公開聯絡方式。登入服務須提供可使用的審查帳號與必要樣本 QR。[Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

提供帳號建立的 App 必須讓使用者在 App 內發起整個帳號刪除；僅停權不足，也不應要求一般服務使用者先電話或 Email 客服。[Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)

Google Play 另要求 App 外可提出刪除的網頁入口；隱私政策需是可公開存取的 HTML 網址，應載明 App／法律實體、聯絡、資料用途／分享／安全／保留／刪除。[Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)、[Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311)

截至本文件查證日，Apple 自 2026-04-28 起要求 Xcode 26+／iOS 26 SDK；Capacitor 8 的環境需求是 Node 22+、Xcode 26+，預設可使用 Swift Package Manager。這是建置工具需求，不是要求使用者裝置全部升級到 iOS 26。[Apple requirements](https://developer.apple.com/news/upcoming-requirements/)、[Capacitor environment](https://capacitorjs.com/docs/getting-started/environment-setup)

Google 新 App／更新目前需 target Android 16（API 36）；若 Play Console 是 2023-11-13 後建立的個人帳號，正式發行前需至少 12 名測試者連續加入 closed testing 14 天，再申請 production 權限。[Target API](https://support.google.com/googleplay/android-developer/answer/11926878)、[Personal account testing](https://support.google.com/googleplay/android-developer/answer/14151465)

## 送審驗收重點

- 真機：iPhone 與 Android 螢幕、瀏海／手勢區、鍵盤、日夜／系統切換、大字、VoiceOver／TalkBack。
- 相機：首次同意、拒絕後說明／重試、相簿 QR fallback、背景／前景恢復與相機釋放。
- 登入：首次登入、重啟、30 天到期、登出、密碼重設與帳號刪除後撤銷；不要將 HttpOnly Session 複製到 localStorage。
- 隱私：一般會員看不到活動報名聯絡資料；幹部依區／分會範圍管理；會員封鎖不能被 QR 掃描覆蓋。
- 斷線：可理解的錯誤及重試；不能離線假裝已成功儲存／報名。原生冷啟動斷線也要有可見畫面。
- 商店：品牌權利、真實截圖、年齡問卷、App Privacy／Data safety、帳號刪除網址、審查帳號皆已確認。

商店名稱、版本、類別、定價與國家目前仍為草稿；不應直接把 JSON 當已核准的提交資料。官方要求在正式提交日前再核對一次。
