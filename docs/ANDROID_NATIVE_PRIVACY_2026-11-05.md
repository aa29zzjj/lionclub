# Android 原生隱私基線（2026-11-05）

本文件是新 Android 候選的實作紀錄，**不是已完成真機或 Google Play 驗收的聲明**。

## 照片暫存範圍

已核對目前安裝的 Capacitor Camera 原始碼：`CameraUtils.createImageFile()` 使用 `getExternalFilesDir(Environment.DIRECTORY_PICTURES)`。FileProvider 因此由整個外部儲存 `external-path="."`，縮為 App 自己的 `external-files-path="Pictures/"`；不再分享整個共用外部儲存範圍。

保留 `cache-path="."`，供目前插件的快取／編輯照片流程相容使用。這仍是 App cache 全目錄，不代表已達最小檔案子目錄；不能把登入憑證或會員名冊放進可分享快取。未修改插件、沒有新增儲存權限、沒有開放 provider 對外匯出，也沒有授予任何實際檔案 URI。

## 原生會員畫面遮罩

- `MainActivity` 在 `onPause`／`onStop` 及失去視窗焦點時，同步覆蓋不含會員資訊的深藍不透明畫面與金色「LionClubs」。顏色與 iOS 候選一致。
- 活動已恢復且視窗重新取得焦點後移除遮罩；仍呼叫 Capacitor 原有生命週期方法，沒有改動登入或網站權限。
- API 33 以上呼叫公開的 `setRecentsScreenshotEnabled(false)`，讓系統不要使用活動截圖作為最近使用 App 畫面；舊版本只依賴生命週期遮罩。
- **沒有使用全域 `FLAG_SECURE`**、沒有阻擋正常前景截圖，亦沒有新增權限、雲端連線、日誌或個資讀取。

## 必須補做的驗收

SDK 已安裝，Debug APK 與 unsigned Release AAB 的 Gradle 編譯通過；兩種 merged manifest 都已核對禁止備份／明文傳輸、FCM 自動初始化關閉，並移除相機依賴的 requestLegacyExternalStorage。接著須在模擬器／真機實測最近使用 App、Home 切出／切回、鎖定與解鎖、通知列、系統權限對話框、照片選取／拍攝／編輯及取消、鍵盤、大字與 TalkBack。也要測 API 33 前後及 Android 分割畫面／旋轉，確認遮罩不露會員資料、不會留住覆蓋層或攔住恢復操作。

原生遮罩與 Recents 設定不能撤銷已存在的截圖，也不能保證所有 OEM 的快照時機；未以靜態檢查取代裝置驗收。APK 僅有開發測試簽章，尚未完成發行簽章、部署或發布本候選。

官方依據：[Activity.setRecentsScreenshotEnabled](https://developer.android.com/reference/android/app/Activity#setRecentsScreenshotEnabled(boolean))（API 33 起，僅限 Recents 的截圖用途）；[FileProvider 分享範圍建議](https://developer.android.com/privacy-and-security/risks/file-providers)。
