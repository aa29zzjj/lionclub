# 原生 App 隔離介面候選

此包重用真正 `mobile-app/src` 的 App 登入頁、Shell、首頁、好友、活動、通知、我的與其子畫面，資料由本資料夾提供。不是網站版、已上架 Build 4、原生功能驗收或可送審 App。

執行 `node mobile-app/preview/build.mjs`，僅產生被忽略的 `tmp/native-ui-preview`。不會改正式 build、Capacitor 設定、簽章、安裝或開啟 GUI。若要在 WKWebView 檢視，由主代理另行使用專屬測試宿主，不覆蓋使用者的已安裝正式 App。

安全邊界：

- 不需要登入，不含帳密／token／真實會員資料；聯絡欄位使用無法作為正式服務的 `.invalid` 合成值。
- 建置時替換真正 contract、App 生命週期、相機／外部瀏覽器與原生推播儲存。metafile 若含真 contract、native push、Capacitor／SecureStorage runtime 或伺服器敏感來源會直接失敗。
- CSP 禁止所有連線、表單送出及外部圖片；圖片只用既有內嵌品牌圖與合成 SVG。
- 所有資料變更方法（包含登入、第三方登入及已讀）一律拒絕，不改合成來源；原生權限、相機與 Keychain 都不會呼叫。
- 頂部持續標示「介面預覽 · 合成資料」。大字切換只是版面模擬，不代表 Dynamic Type／讀屏／真機通過。

頂部「畫面」可切換會員模式或真正 App 元件的未登入畫面。登入模式固定 `hasStoredSession=false`，mock `nativeOAuthAvailable=true` 僅用來觀察 Google／Apple 按鈕，並不代表登入服務可用。按任一登入按鈕只會顯示操作未執行；請勿輸入真實帳密。

頂部「通知情境」可切換正常資料、載入失敗、格式錯誤、發送頁讀取失敗、發送頁無好友及「合成畫面錯誤保護」。切換會回到通知分頁；發送頁兩種情境需再按「發送通知」觀察。格式錯誤由真正的通知 shape reader 拒絕成明確錯誤，並未放寬資料檢查。情境設定只存在本機記憶體，不寫入儲存、不改正式功能旗標。

「合成畫面錯誤保護」在通知分頁刻意拋出不含個資的 render error，由真正 Shell 的 ScreenErrorBoundary 接住，可測 fallback、重試及下方分頁逃生。未切換情境時，重新載入本頁會再次顯示 fallback；選首頁／其他分頁應能離開，或將情境切回正常。這是刻意測錯誤邊界，不是聲稱正式通知 API 有此錯誤。

仍須在真正 iOS WKWebView 檢查標準／大字、鍵盤、五個分頁、iPad、安全區與錯誤 Boundary。輸出只能作介面討論，不得拿去當正式商店截圖或上架證明。
