# 既有 Next.js 專案的原生封裝選項

狀態：架構決策草案；未建立原生工程、未新增套件。以下依據 2026-10-13 的程式與官方文件。

## 已知程式邊界

- 現有 Next.js 15.5.27 的 `/api/*` 使用 Prisma、AWS、`next/headers` Cookie 與 POST／PATCH 等動態操作；正式服務為 `https://lionclubsmembership.com/`。
- `src/lib/session.ts` 使用 30 天 HttpOnly JWT Cookie；production 為 Secure、SameSite=Lax、同網域 path `/`。前端沒有保存登入 JWT。
- `FriendQrScanner.tsx` 使用 `html5-qrcode` 開相機並本機辨識圖片 QR；App 中仍需驗收 WebView 的相機與相簿權限。
- UI 已加日夜外觀、`viewport-fit=cover`、安全區、觸控尺寸與表單文字基礎。原生狀態列、鍵盤及返回行為還沒實作。

Next.js 靜態匯出不支援依 Request 執行的 Route Handler、Cookie，以及未預先列舉參數的動態路由；不能將目前整個 Next.js 設為 `output: 'export'` 就保留既有後端。[Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)

## 方案比較

| 方案 | 既有程式影響 | 適用範圍 |
| --- | --- | --- |
| A. 本機打包可離線啟動的 React 客戶端＋遠端 API，使用 Capacitor 8 | 共用／搬移前端元件；把 server API 留在現有服務；要設計跨源登入及未知 ID 路由 | 建議正式雙平台方向；先做登入＋QR＋會員頁的垂直試作，再擴全部功能 |
| B. Swift／Android 原生客戶端呼叫既有 API | UI 重建與 API 登入改造較多；平台體驗可細緻控制 | 若上架後要大量原生能力，可作長期方向 |
| C. 遠端網站載入 WebView 外殼 | 前端重用最多；冷啟動、離線、Session、導航及相機都依遠端頁面 | 原型／開發真機驗收可以評估；需審慎驗證可靠性與 Apple 4.2；不等同已可送審 |

Capacitor 官方 `server.url` 是 live reload 用途，明確不建議 production；`allowNavigation`、`cleartext` 也不是正式環境捷徑。因此這次沒有建立指向正式網站的 production `server.url` shell。[Capacitor config](https://capacitorjs.com/docs/config)

方案 A 是工程建議，不是 Apple 強制要求必須使用 Capacitor；方案 C 也不能被解讀為必然拒審。Apple 判斷實際功能、品質與體驗。[Apple 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)

## 登入接法要先做試作

本機 Capacitor iOS 通常以 `capacitor://localhost` 啟動，Android 以本機 HTTPS 啟動；直接 fetch 正式 HTTPS API 與既有同源網站不同。現有 SameSite=Lax Cookie 不能靠改 API 地址就保證可用；需同時考慮 credentials、CORS／CSRF、iOS 第三方 Cookie 限制、原生 Cookie Store 與 Session 撤銷。[Capacitor Cookies](https://capacitorjs.com/docs/apis/cookies)

Jerry／Hao 應選擇並驗證其一：

1. 原生 HTTP／Cookie 整合層：後端仍核發 HttpOnly Session；原生層管理 Cookie，避免把 Session 值暴露到 JavaScript、日誌或 localStorage。登入、登出與所有 API 要走同一通道。
2. 專屬 mobile auth：後端核發短期憑證，更新憑證由 Keychain／Keystore 保存；設計續期、撤銷與 API 限流。不要把現有長期網頁 JWT 直接改成前端儲存。

這是兩種候選，未自動選定或實作。先驗證登入→`/api/me`→關閉重開→登出，再驗證 QR／上傳，通過後才大量搬頁。

## 原生試作交付條件

- Xcode 26+ 與 Node 22+（Capacitor 8）可用，確認合法 App ID／Team ID，再生成 iOS／Android 工程。[Environment](https://capacitorjs.com/docs/getting-started/environment-setup)
- 本機客戶端不含資料庫／AWS secret；正式 API 主機只允許明確來源，發行包不開 cleartext、不暴露 debug bridge。
- 相機用途描述可用「用於掃描獅友的會員 QR Code，建立好友連結」；只在使用者啟動掃描時請求，拒絕時有替代操作。[iOS configuration](https://capacitorjs.com/docs/ios/configuration)、[Apple camera purpose](https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription)
- Android 返回、iOS 歷史、未儲存表單、外部網站／mailto／tel、冷啟動離線、前景恢復、深色狀態列與安全區均通過真機測試。
- 原生插件需要的 privacy manifest 必須按實際使用 API／SDK 填寫；App Privacy 資料蒐集宣告也要獨立核對。[Capacitor privacy manifest](https://capacitorjs.com/docs/ios/privacy-manifest)

PWA manifest／Service Worker 是網頁安裝與離線體驗工具，本身不會產生 App Store 簽名包，也不保證符合 App Review。可另作網頁功能，但不可當原生工程已完成。
