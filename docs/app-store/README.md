# App Store／Google Play 上架準備

核對日期：2026-10-14。這是原生發行準備，不是已上架或已提交審查的聲明。正式網站的 main 部署／migration，與 iOS／Android 發行包是不同交付物；網站部署成功不會自動產生 IPA、APK 或 AAB。

## 現況：已有 Web 功能，原生建置仍有缺口

| 項目 | 儲存庫／本機證據 | 上架判定 |
| --- | --- | --- |
| Web 會員、QR、資歷、活動、幹部工具與日夜外觀 | 現有 Next.js 客戶端與動態 /api/* | 原生功能基礎，不是原生驗收 |
| 登入安全 | 已實作 Session version、密碼重設撤銷、其他裝置登出、地址綁定驗證信、同源防護 | 有隔離回歸測試；原生跨來源登入尚未實作 |
| 刪帳／檢舉／封鎖 | 已有 API、檔案內入口與封鎖名單；刪帳採匿名化與可重試頭像清理 | 部分實作；資料保留、刪帳阻擋、外部入口與營運仍待完成 |
| 公開政策／客服／外部刪帳頁 | 未找到 /privacy、/support、/account/delete 頁面 | 待聯絡資訊與政策定稿，不提交不存在的網址 |
| 原生工程／素材 | 未見 Capacitor、標準 iOS／Android 工程及已驗收原生素材 | 尚無可簽章發行包 |
| 本機工具 | macOS 26.3／arm64；Node 24.19.0；僅 Command Line Tools | 無可用完整 Xcode／iOS SDK；標準位置未找到 Android Studio、JDK、SDK 36 |

本次沒有讀取 Apple／Google 登入、Keychain、簽章、keystore、.env 或機密。自訂安裝位置未全面搜尋；帳號狀態是「未驗證」，不是「沒有帳號」。完整輸入清單見 [發行輸入與完成定義](RELEASE_INPUTS_2026-10-14.md)。

使用者已確認有 Apple 帳號、尚未建立 Google Play 帳號；Apple Developer 有效會員與 Team ID 尚未核實。未建 Play 帳號不阻擋先開發測試 APK，但會阻擋 Play 發行；本機工具鏈與簽章仍需另外準備。

## 文件與唯讀盤點

- [繁體中文商店資料草稿](METADATA.zh-Hant.json)：未知資料維持 null，未驗收維持 false；「獅子會 App」尚未定名。
- [原生架構選項](NATIVE_ARCHITECTURE.md)：仍待原生登入垂直試作，不可整包靜態匯出現有動態後端。
- [隱私與 API 歷史提案](PRIVACY_AND_ACCOUNT_API_DRAFT.md)：2026-10-13 草稿，其中「尚無刪帳／封鎖／Session version」已被新版程式取代，不能照抄成現行契約；以程式、本文件及本次交接為準。
- 以下盤點只證明欄位／檔案／工具存在，不能代替功能、簽章、真機或政策驗收。

    node scripts/check-app-store-readiness.mjs
    node scripts/check-native-environment.mjs
    node scripts/check-native-environment.mjs --json
    node scripts/check-native-environment.mjs --strict

新工具不連網、不安裝、不建置、不接受 SDK 授權、不列出裝置、不讀憑證；預設退出 0，只報缺項，strict 缺項退出 1。本機終端 PATH 尚未見一般 node；已驗證執行檔為 /Users/cerbeurs/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node，其他開發機使用自己的 Node 22+，不複製此使用者路徑。

## 官方建置與發行基線

| 範圍 | 2026-10-14 核對結果 | 本案影響 |
| --- | --- | --- |
| Apple 上傳 | 自 2026-04-28 起 Xcode 26+、iOS 26 SDK+ | Command Line Tools 不夠；SDK 不是最低使用者 iOS 版本 |
| Capacitor 8 工具 | Node 22+、Xcode 26+、Android Studio 2025.2.1+ | Node 已足夠，原生工具鏈仍缺 |
| Capacitor 8 裝置 | iOS deployment target 15；Android minSdk 24、compile／target 36 | 需核對會員舊手機；不是產品支援機型已定案 |
| Google Play 新手機 App／更新 | 自 2026-08-31 起 target Android 16／API 36 | 舊 target SDK 包裝不可直接提交 |
| Java | Android Gradle Plugin 8.x 最低 JDK 17 | 使用相容 JBR／Gradle 組合，不是任意新版 Java 都可用 |

來源：[Apple SDK 要求](https://developer.apple.com/news/upcoming-requirements/)、[Capacitor 環境](https://capacitorjs.com/docs/getting-started/environment-setup)、[Capacitor 8 基線](https://capacitorjs.com/docs/updating/8-0)、[Play target API](https://support.google.com/googleplay/android-developer/answer/11926878)、[Android JDK](https://developer.android.com/build/jdks)。提交日前再核對，不把文件日期當永久有效。

若加入帶 .so 的掃碼／影像等原生 SDK，要檢查最終產物的 64-bit 16 KB page-size 相容性；只設 targetSdk 36 不等於通過。[Android 16 KB 指引](https://developer.android.com/guide/practices/page-sizes)

## APK、AAB 與 iOS 測試包

| 產物 | 用途 | 本案狀態 |
| --- | --- | --- |
| APK | Android 直接安裝測試；debug／release 簽章用途不同 | 尚未產生，需標示測試環境 |
| AAB | Google Play 發布，由 Play 產生裝置適用 APK | 尚未產生，新 App 商店發布需準備簽章 AAB |
| iOS Archive／發行包 | 正確 Team 簽章／上傳，以 TestFlight 提供測試 | 尚未產生，需完整 Xcode、App ID 與簽章 |

AAB 不是直接點開安裝的 APK；Google Play 自 2021-08 起要求新 App 使用 App Bundle。[Android App Bundle](https://developer.android.com/guide/app-bundle)

若 Play 個人帳號建立於 2023-11-13 之後，需至少 12 名測試者連續加入 closed testing 14 天，再申請 production 權限；internal testing 或自行發 APK 不取代此程序。先確認實際帳號類型，不能推定適用與否。[Google 個人帳號測試](https://support.google.com/googleplay/android-developer/answer/14151465)

## 原生架構與登入：先完成一條流程

建議採本機打包的 React／Capacitor 客戶端＋遠端既有 API，先驗收「登入 → /api/me → 關閉重開 → 會員 QR／好友檔案 → 登出」，再搬其他頁。這是工程建議，尚未建立 mobile 工程或替團隊選定認證方案。

現有 /api/* 依賴 Prisma、AWS、Cookie 和動態 Route Handler，不能把整個 Next.js 改成靜態匯出就保留後端。[Next.js 靜態匯出限制](https://nextjs.org/docs/app/guides/static-exports)

不建立 production server.url 指向正式網站的捷徑殼。Capacitor 將它定位為 live reload；正式版仍需可控導航、本機冷啟動、離線錯誤與平台體驗。Apple 4.2 評估實際功能，不代表使用 WebView 必然拒審。[Capacitor config](https://capacitorjs.com/docs/config)、[Apple 最低功能](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)

Web Session 為 HttpOnly／Secure／SameSite=Lax，mutation 需可信 Origin。原生本機來源不是正式網站同源；只改 API URL、加 credentials、開放任意 CORS 都不完整。Jerry／Hao 需先選並驗證：原生 HTTP＋受保護 Cookie store，或專屬短效憑證／輪替更新憑證及 Keychain／Keystore。不要將 30 天網頁 JWT 放到 localStorage，也不要為原生關閉 Web CSRF／Origin 防護。[Capacitor Cookies 與 iOS 限制](https://capacitorjs.com/docs/apis/cookies)

## 必須補齊的功能與營運

1. 公開客服與 HTML 隱私政策，和實際 AWS／SDK／日誌／備份／保留期一致；完成 Apple App Privacy、Google Data safety，不因未見廣告 SDK 就勾「不蒐集」。Google 政策網址需公開可開啟、非 PDF。[Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/)、[Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311)
2. App 內可發起並完成本人刪帳，另有不需重裝 App 的外部途徑。現有刪帳阻擋仍持幹部權限／有未來主辦活動者，並保留匿名 Member、共享活動與受限稽核；共享歷史不能自動當合規理由。需逐項決定作者內容刪除／交接、法定保留依據與期限、可完成的刪除路徑；至少六分鐘後才執行的頭像清理也要接可信排程。API 存在不等於要求全部通過。[Apple 刪帳](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)、[Google 外部刪帳](https://support.google.com/googleplay/android-developer/answer/13327111)
3. 已有會員檢舉／封鎖基礎，仍需內容篩選、活動等內容處理、責任人及公開聯絡。獨立合成審查帳號使用強密碼，不用已公開且正式環境停用的舊 demo／短密碼帳號；審查需可操作後端及樣本 QR。[Apple UGC／審查可用性](https://developer.apple.com/app-store/review/guidelines/)
4. 原生相機／照片只在操作時請求；拒絕、重試、無相機與圖片辨識替代流程都要驗收。現有 Web QR 不等於原生權限已通過。狀態列、返回、鍵盤、安全區、大字、讀屏、日夜與斷線均要真機測。站內通知不是 APNs／FCM，未做就不宣傳背景推播。

## 分工與順序

| 順序 | Hao | Jerry | 所有人／Tom |
| --- | --- | --- | --- |
| 1 | 收齊輸入、素材與商店文案 | 核對實際資料處理與保留 | 定名、法律實體、品牌授權、發行地區與帳號 |
| 2 | 原生登入／QR 試作與長者可讀性 | mobile auth、Cookie／CORS／CSRF、撤銷 | 授權工具安裝；本人註冊、驗證、付費與簽協議 |
| 3 | 政策／客服／外部刪帳頁與入口 | 刪帳交接、保留、清理排程與審核接點 | 確認真客服／隱私聯絡及營運責任人 |
| 4 | 真機截圖、APK／TestFlight 與審查說明 | 合成資料與故障／撤銷驗收 | 安全角色邀請協作者、核准簽章與送審 |

缺口完成、產物可安裝、真機與隱私驗收通過後，才把 metadata 改 ready。這輪沒有安裝工具、新增原生套件、建立商店 App、讀取簽章或送審。
