# Android 原生登入安全關卡（2026-11-05）

適用新 Android 候選，不是已發布或已通過登入驗收的聲明。

## 本輪最小處理

- Android 登入畫面不顯示 Google／Apple 入口，改為「第三方登入尚未開放，請使用會員信箱與密碼登入。」
- 同一平台判定也放在 `createApiClient().loginWithProvider()` 第一個步驟；直接呼叫仍拒絕，尚未改變登入世代、清除本機登入、註冊 callback、開啟瀏覽器或發送網路請求。
- 會員信箱／密碼登入不受此 gate 影響。沒有停用網站登入、沒有更動正式環境，也沒有擅自修改既有 iOS 行為。

## 尚未完成的共同登入風險

既有原生流程的 custom-scheme callback 可由 Android 其他 App 註冊；前端目前僅以 `startsWith` 判斷返回網址。後端 handoff 是短效 JWT，交換介面只收 code，尚未綁定發起 App 的 verifier／state，也沒有一次性使用紀錄。純合成、零網路檢查確認同一 handoff 目前可被驗證兩次；「60 秒」不等於「只能使用一次」。因此本輪不在新 Android 候選開啟此流程。

重新開啟前須完成並驗收：App 綁定 PKCE／state、原子一次性交換與重播拒絕、精確 callback URL／參數驗證、取消／逾時／冷啟動／換帳號情境，以及自訂 scheme 攔截防護（或適當的 verified HTTPS App Links）。不能僅加一行 `autoVerify` 就視為 custom scheme 已獲域名驗證。

**iOS 仍保留其原生第三方登入端到端／交換安全發行關卡。** Android-only gate 沒有修復共同後端、沒有證明 iOS 流程安全，也沒有新增 Apple／Google 憑證或資源。

## 驗證邊界

回歸測試採記憶體原生插件替身，確認 Android 直接呼叫零網路／零儲存／零瀏覽器，以及不影響舊登入；另確認 iOS 仍抵達既有 provider-start。之後已同步此 gate 並完成 Debug APK 與 unsigned Release AAB 編譯；產物內的 App JavaScript 與目前 mobile-app/dist 一致。這不是 Android 真機或真實供應商驗收，沒有發行簽章或配送 bundle。

官方參考：[Android 深層連結風險與驗證](https://developer.android.com/privacy-and-security/risks/unsafe-use-of-deeplinks)。
