# Android 建置續作與驗收狀態

2026-11-06，台灣時間。Google Play 作業由使用者這邊接手；本文件記錄今天重新建置的候選，未發行或上傳。11/05 的產物與交接文件保留原日期及當時證據。

## 本輪程式修正

會員檢舉欄位由 1000 字改為與既有 mobile API 相同的 200 字上限，顯示字數及輔助閱讀提示。按鈕及送出函式都拒絕超限，涵蓋輸入法或程式繞過 HTML maxlength 的情境，保留原本 trim 後的 request payload。未修改後端、正式資料庫或正式會員。

TypeScript `--noEmit --incremental false` 通過。這是小幅輸入限制修正，沒有新增鏡像測試；未宣稱重跑 11/05 的全部單元、整合與預覽測試。

## 今天的建置與產物

沿用 Java 21、SDK 36、Gradle 8.14.3、AGP 8.13.0 與 Capacitor 8.5.3。重新建置 mobile-app 並同步 Android，`assembleDebug bundleRelease` 成功：13 秒，543 個 task，其中 65 個執行、478 個沿用。

| 產物 | 位元組 | SHA-256 |
| --- | --- | --- |
| output/android/LionClubs_Android_Debug_2026-11-06.apk | 11667584 | cb4c0fb4a78f48076f7e252eb57e98b227f222187f2ad285eaf7b10941fca755 |
| output/android/LionClubs_Android_Unsigned_2026-11-06.aab | 8280480 | 2c21e639686a2beb9472e72eeace6869af069a94241581de1306a6bf051b4426 |

APK 開發簽章驗證與 16 KB ZIP 對齊通過；AAB ZIP 完整、沒有簽章。兩個產物內的 app.js 都與目前 mobile-app/dist 相符。未建立 Play upload key 或發行簽章，unsigned AAB 不能上傳商店。

## 16 KB 檢查範圍

六個 64 位元原生函式庫的 PT_LOAD 對齊及位址／檔案偏移同餘符合 16 KB。另由兩次獨立靜態檢閱核對 RELRO 頁面：未發現被保護頁面與 RELRO 範圍外的可寫資料交疊。

部分 RELRO header 包含填補空間，結尾大於其所屬 LOAD；單純要求兩者結尾相等會誤報。依 [AOSP Android 16 linker](https://android.googlesource.com/platform/bionic/+/android16-release/linker/linker_phdr.cpp#1326) 與 [LLVM lld](https://github.com/llvm/llvm-project/blob/release/14.x/lld/ELF/Writer.cpp#L2640) 重新檢視後，紀錄為「載入對齊與 RELRO 可寫資料交疊靜態檢查通過」。這不是官方工具完整認證，也不等於裝置執行驗收。

使用者已於今天明確同意 `android-sdk-arm-dbt-license`，官方 API 36 ARM64 16 KB 系統映像正在下載。完成安裝後，仍須建立獨立測試 AVD、確認系統實際 PAGE_SIZE 為 16384，再測 App 啟動、重啟與功能；目前不將 `pageSize16KbVerified` 或 `physicalDeviceVerified` 改為 true。[Google 16 KB 測試指引](https://developer.android.com/guide/practices/page-sizes)

## 接續範圍

公司帳號註冊與驗證、公開聯絡資料、發行簽章、專用審查帳號、Android 真機及 16 KB 執行、登入安全、隱私／Data safety、兒少安全營運安排與正式素材均仍依實證驗收。FCM 尚未配置或啟用；公開政策草案沒有發布，正式 migration、日誌留存及雲端資源沒有改動。
