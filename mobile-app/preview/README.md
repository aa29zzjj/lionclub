# 原生 App 隔離介面候選

此包重用真正 `mobile-app/src` 的 Shell、首頁、好友、活動、通知、我的與其子畫面，資料由本資料夾提供。不是網站版、已上架 Build 4、原生功能驗收或可送審 App。

執行 `node mobile-app/preview/build.mjs`，僅產生被忽略的 `tmp/native-ui-preview`。不會改正式 build、Capacitor 設定、簽章、安裝或開啟 GUI。若要在 WKWebView 檢視，由主代理另行使用專屬測試宿主，不覆蓋使用者的已安裝正式 App。

安全邊界：

- 不需要登入，不含帳密／token／真實會員資料；聯絡欄位使用無法作為正式服務的 `.invalid` 合成值。
- 建置時替換真正 contract、相機／外部瀏覽器與原生推播儲存。metafile 若含真 contract、native push、Capacitor／SecureStorage runtime 或伺服器敏感來源會直接失敗。
- CSP 禁止所有連線、表單送出及外部圖片；圖片只用既有內嵌品牌圖與合成 SVG。
- 所有資料變更方法一律拒絕；已讀操作只顯示「不儲存」說明，不改合成來源；原生權限、相機與 Keychain 都不會呼叫。
- 頂部持續標示「介面預覽 · 合成資料」。大字切換只是版面模擬，不代表 Dynamic Type／讀屏／真機通過。

仍須在真正 iOS WKWebView 檢查標準／大字、鍵盤、五個分頁、iPad、安全區與錯誤 Boundary。輸出只能作介面討論，不得拿去當正式商店截圖或上架證明。
