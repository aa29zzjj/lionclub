# Android 本機建置與驗收紀錄

2026-11-05；候選分支 `codex/android-play-prep-20261105`。這是本機工程證據，尚未完成發行簽章、真機驗收或 Play Console 上傳。

## 工具鏈

- 官方 Android Studio Rabbit 2 2026.2.2 Apple Silicon，下載 SHA-256、macOS 簽章與 Gatekeeper 核對通過；初次設定已完成，歡迎畫面確認版本為 Rabbit 2 | 2026.2.2。
- Android SDK Platform 36、Platform Tools、Build Tools 36.0.0；AGP 按需另安裝 35.0.0。
- Emulator 37.2.13 程式安裝完成，尚未下載 Android 系統映像或建立 AVD，未啟動 Android App。
- Temurin JDK 21.0.13+9；Gradle 8.14.3、Android Gradle Plugin 8.13.0、Capacitor 8.5.3。Gradle daemon criteria 鎖定 Java 21，不使用 IDE 內附的 JBR 25 執行本工程 Gradle。
- `scripts/check-native-environment.mjs --strict --json` 通過，0 個缺少的工具前提。這項盤點不驗證帳號、簽章或 App 功能。
- SDK 協議及安裝已由持有人明確授權。Google Play 擁有人、註冊與驗證交 Jerry；尚未建立或核實帳號。

## 產物

| 檔案 | 位元組 | SHA-256 |
| --- | --- | --- |
| output/android/LionClubs_Android_Debug_2026-11-05.apk | 11667458 | 813a9af5ecfa2c506a615a09e1c5db536ee35658fb0f4a4c4e770fac7573527a |
| output/android/LionClubs_Android_Unsigned_2026-11-05.aab | 8280345 | a8d5b2d4d6c0d915feba1f9629105ee545ed02b3ab1a5a464e138ee88929058b |

APK 為自動產生的 Android 開發簽章，只供受控裝置測試。AAB 未簽章，不能作為 Play 上傳檔。兩者均未配送，未內嵌審查帳密、APNs 私鑰或 Firebase 配置；程式封包不含這兩個產物。

套件候選 `com.lionclubsmembership.app`，versionName `1.0`、versionCode `1`、minSdk 24、targetSdk 36；尚未向 Play Console 核對套件及版本歷史。

## 已通過

1. `assembleDebug bundleRelease` 首次編譯成功；圖示與儲存設定修正後，增量編譯再次成功（14 秒，543 個 task）。
2. APK `apksigner verify` 開發簽章有效；`zipalign -c -P 16 -v 4` 通過。AAB ZIP 完整且無簽章。
3. AAB 六個 64 位元原生函式庫的 ELF PT_LOAD 載入段對齊均為 16384；這是二進位檢查，不等於 16 KB 系統執行驗收。
4. Debug 與 release 合併 manifest 都保留 `allowBackup=false`、`usesCleartextTraffic=false`、FCM/Analytics 自動初始化關閉；相機依賴帶入的 `requestLegacyExternalStorage` 已移除。Release 沒有啟用 debuggable。
5. 合併權限共七項：網路、相機、網路狀態、通知、喚醒鎖、FCM RECEIVE 及 App 自有 signature 權限。沒有聯絡人、位置、麥克風、媒體或廣泛儲存權限。
6. APK/AAB 內的 `app.js` 與目前 `mobile-app/dist/app.js` 一致，包含 Android 第三方登入 gate。最新單元測試 289/289 及 TypeScript 通過；先前整合/demo 198/198、隔離預覽 5/5，未宣稱本次重跑。

本機紀錄位於 `/tmp/lionclubs-android-final-build-20261105.log`、`/tmp/lionclubs-android-apk-signature-20261105.log`、`/tmp/lionclubs-android-apk-zipalign-20261105.log`；`/tmp` 可被系統清除，因此以此文件與重新建置結果作為接手依據。

## 重建

先依 package-lock.json 安裝依賴並產生 Prisma client，使用 JDK 21 與 SDK 36。

```sh
npm run android:sync
cd android
./gradlew --no-daemon --console=plain assembleDebug bundleRelease
```

`android/local.properties` 的 SDK 位置、IDE Java 路徑、SDK、node_modules 與建置輸出均不進 Git；接手電腦須自行設定。不要將 `.p8`、Firebase 管理私鑰、upload key 或密碼放入 repo。

## 發布前仍須完成

- 專用審查帳號及真實 API 登入、重開、離線、換帳號、撤銷、刪帳與角色驗收；本輪沒有登入正式會員帳號。
- API 24-25 圖示、API 33 前後背景遮罩、Home/Recents/鎖定、旋轉、分割畫面、相機與取消、鍵盤、大字及 TalkBack。
- Android 真機與 16 KB 系統執行測試。尚未建立 AVD 或下載系統映像；不能用已安裝模擬器工具取代 App 執行測試。
- Android Google/Apple 原生登入先暫停；僅第三方登入的會員尚無此候選登入路徑。共同 OAuth 一次性交換、PKCE/state 與 callback 驗證仍是發行關卡。
- Android FCM 專案、平台與 Token 契約、發送及撤銷尚未配置或啟用；App 內三類通知與背景推播應分別驗收。
- Play 帳號/套件、發行簽章、商店圖像及真實截圖、Data safety、公開隱私政策、刪帳入口與測試資格。

CloudWatch 日誌保留仍交 Jerry 決定。本輪未調整留存、刪除日誌、建立付費 AWS 資源或修改正式資料庫。
