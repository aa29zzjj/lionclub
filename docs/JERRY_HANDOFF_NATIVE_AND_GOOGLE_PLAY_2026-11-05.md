# LionClubs 今日完整交接文件

收件人 Jerry　今日合併定稿　2026 年 11 月 5 日　台灣時間

本文件整合今天的初版與更新版交接，涵蓋 iOS、原生 UI、手機推播及 Google Play 準備。重複項目已合併，完成與待辦均以本文件的最新狀態為準；可直接以這一份交接。

Jerry，iOS 1.0 已於 11 月 3 日在台灣 App Store 公開。本次交接涵蓋下一版原生 UI、三類手機通知及 Android 新工程；下一版尚未部署或提交商店。請先確認發行簽章、後端執行位置與資料保留安排，再進入專用帳號及真機驗收。Android 已開始準備，不能將 iOS 上架或模擬器結果當作 Google Play 已通過。

## 今天完成的項目

| 項目 | 完成內容 | 實際狀態 |
| --- | --- | --- |
| GitHub 基線 | main 844e82defbe459700a29dcb56adc1e7238907de8，已重新 fetch 核對 | 續作使用 mobile-app 與根目錄 ios，不混入舊 mobile 工程 |
| 原生介面 | 五分頁圖示、較大操作區、字級與換行、頁面錯誤隔離、通知格式防護 | 已在隔離 iOS 宿主啟動五分頁，使用合成資料 |
| 登入安全 | 共用登入儲存、序列化更新、舊回覆不跨帳號覆寫；離線隱藏會員資料 | 已有本機回歸；仍需真機撤銷與離線驗收 |
| 背景隱私 | iOS 不透明遮罩與回前景身分重查 | 原生編譯通過，實機切換器驗收待做 |
| 三類通知 | 活動公告、好友邀請、審核結果的 App 設定及後端 outbox | 預設關閉，尚未部署或正式發送 |
| Apple 設定 | LionClubs 推播能力開啟；APNs 正式專用金鑰建立及下載 | 已經使用者逐項確認，金鑰僅存本機私有位置 |
| Android 起步 | Capacitor 8.5.3、API 36、備份及背景保護，Debug APK 與 unsigned AAB | 編譯通過；發行簽章、裝置及商店驗收待做 |

## 已取得的驗證證據

最新單元測試 289 項通過，包含 Android 第三方登入的零副作用檢查；先前完整整合與 demo 198 項、隔離預覽 5 項通過。TypeScript、Prisma schema、Next production build、iOS Simulator 及 unsigned iPhone SDK Release 已通過。未使用正式會員、正式 DB 或 APNs 發送。

並行整合重跑曾在既有 OAuth 測試結束時出現 PGlite 非同步清理錯誤；最後完整改為逐檔執行，198 項通過。未忽略錯誤或修改斷言。Android 的 XML、設定與登入 gate 已檢查；APK 與 AAB 的最新編譯結果見 Android 章節。

<!-- page -->

## APNs 金鑰與保管交接

| 欄位 | 已核對資料 |
| --- | --- |
| Apple Team | Prepmate AI inc.　2TWCSJNDWG |
| App ID 與 topic | com.lionclubsmembership.app |
| 金鑰名稱與 Key ID | LionClubs APNs Production　789Y26C8HL |
| 服務與限制 | 僅 APNs，Production，Topic Specific，只有 LionClubs 一個 topic |
| 保管 | 本機使用者專屬資料夾，目錄 0700，檔案 0600 |
| 驗證 | Apple 顯示已下載；本機 P-256 私鑰格式與簽章驗章通過 |

本機檔案位置如下。這是位置提示，文件及程式封包均不包含私鑰內容。

`~/Library/Application Support/LionClubs/APNs/production/AuthKey_789Y26C8HL.p8`

Downloads 的暫存副本已移除；尚未建立第二份受控備份，也未上傳 AWS 或其他服務。請與持有人決定伺服器秘密託管及受控備份位置後再移交，不能把 .p8 放入 GitHub、聊天、前端環境變數或公開目錄。APNs 私鑰與資料庫裝置 Token 的加密金鑰用途不同，不能共用。此 key 僅供正式 APNs，沒有為 sandbox 預建另一把。

## 後端推播已完成與未完成的界線

裝置註冊、加密 Token、本人 receipt 與 durable outbox 已實作。活動公告、好友邀請、資歷核准或退回及會籍核准，都在原本成功交易中接線；旗標關閉時不碰新表。worker 發送前再核對身分、權限、來源及封鎖，鎖屏只放通用提示，點入 App 後重新讀取本人內容。

尚未執行正式 migration，尚未指定常駐 worker 或排程，沒有新建付費 AWS 資源或改 IAM。手動 worker 的 --plan 可檢視需求而不連線；不能把它當成已部署服務。APNs 回 200 只代表 Apple 接受請求，不代表手機顯示。

入會拒絕的既有流程會刪除 User 與 Member，該情境暫不產生推播。候選裝置租約為 24 小時，receipt 可讀期限 7 天，delivery 配送期限 24 小時；這些不是永久清除 DB、備份或日誌的承諾。正式啟用前請確認租約是否符合會員使用頻率，以及清理與監控安排。

<!-- page -->

## 下一版 iOS 與推播的剩餘待辦

以下為建議接手順序。程式實作可共同處理；涉及正式環境、權限或費用時，以當下核定範圍執行。

| 順序 | 請完成的工作 | 完成證據 |
| --- | --- | --- |
| 1 | 補齊這台 Mac 的有效發行簽章，更新含推播能力的 provisioning | 可簽章 Archive；匯出 binary 的 aps-environment 為 production |
| 2 | 決定既有可信執行位置、秘密託管、備份與推播工作安排 | 明確環境、權限、費用、監控與責任人；不是新增未核准資源 |
| 3 | 核對備份後套用 additive migration，再部署相容 mobile API | 精確 DB 與 commit；舊版 App 及 Web 回歸通過 |
| 4 | 補強 OAuth handoff 一次性與 PKCE，安排已上架客戶端相容升級 | 重放、錯 verifier、取消、過期及跨帳號測試 |
| 5 | 核對政策、商店資料、Token 與內容保留及刪除 | 公開說明與實際配置一致；保留必要紀錄有明確目的 |
| 6 | 專用帳號與指定手機驗收，再出新 build 及 TestFlight | 三類通知、角色、背景、拒絕、重啟、點擊、換帳號、撤銷與刪帳 |

Apple 開啟推播能力時提示，相關舊 provisioning profiles 需要為後續使用更新。目前本機仍為 0 個有效 code-signing identity；Safari 登入成功不等於本機已有簽章私鑰。沒有自行建立或撤銷發行憑證。

隱私政策仍有「站內通知不是背景推播」、將 App 稱為未來功能等舊敘述；已有修訂草案，尚未發布。公開說明中的 90 天日誌保留承諾與實際 enforcement 仍須核對。持有人 10 月 27 日明確決定暫不變更、交 Jerry 確認；本次未改留存或刪除日誌。

## 原生畫面驗收重點

請以真正 App 檢查 iPhone 與 iPad、安全區、鍵盤、返回、大字、VoiceOver、降低動態效果、相機允許與拒絕、QR 及上傳。自動工具未能完整捲動長頁，因此頁尾偏好與所有表單不能標成已通過。合成預覽畫面不能充作正式商店截圖，也不能拿來證明真實資料授權。

<!-- page -->

## Android 與 Google Play 已開始的準備

已新增根目錄 android 工程，沿用 mobile-app 的 React 原生宿主介面及 Bearer API。套件與 iOS 保持同一 Capacitor 8.5.3 系列。

| 項目 | 本機候選設定 |
| --- | --- |
| applicationId | com.lionclubsmembership.app，尚未在 Play Console 確認或註冊 |
| 版本 | versionName 1.0，versionCode 1；上傳前再核對既有套件歷史 |
| 系統與工具 | minSdk 24，compileSdk 36，targetSdk 36，Java 21 |
| 工程 | Gradle 8.14.3，Android Gradle Plugin 8.13.0 |
| 登入 | 候選先使用信箱密碼；原生第三方入口及 API client 皆暫停，待一次性 PKCE 流程驗收後開放 |
| 傳輸與備份 | 禁止 cleartext，關閉備份並排除雲端及裝置移轉資料 |
| 權限 | 合併後含網路、相機、網路狀態、通知、喚醒、FCM 接收及 App signature 權限；無聯絡人、定位、麥克風或廣泛儲存權限 |
| 品牌 | Launcher 引用既有 iOS 品牌 PNG，以 Android 資源排版；仍需實機目視 |
| 背景隱私 | 失焦及背景不透明遮罩，API 33 以上停用 Recents 快照；裝置驗收待做 |
| 手機通知 | FCM 依賴隨官方 plugin 引入，但未設 Firebase 專案，未啟用 Android 登記或發送；關閉自動初始化與分析收集 |

Android 不能使用 APNs 金鑰，現有伺服器推播契約也是 APNs 專用。若要 Android 同時支援三類手機通知，需另接 FCM 的平台識別、Token 驗證、身分綁定、發送及撤銷；不能只把 native supported 改為 true，也不能把 FCM Token 送到 APNs。第一版可先驗收 App 內通知，但不得宣傳尚未完成的背景推播。

工程仍保留 com.lionclubsmembership.app 自訂 scheme 與 oauth-callback host，但 Android 第三方登入入口已停用；這項設定不代表登入回流已驗收。

<!-- page -->

## Android 建置環境與驗證

持有人已明確同意 Android SDK 協議及安裝。官方 Android Studio Rabbit 2 已完成初次設定並顯示歡迎畫面；SDK Platform 36、Build Tools 36.0.0、Platform Tools 及 Emulator 37.2.13 已安裝；AGP 另按需安裝 Build Tools 35.0.0。尚未建立虛擬手機或下載系統映像。

Android Studio 內附 JBR 25，這個 Gradle 8.14.3 工程另外使用已驗證的 Temurin Java 21；daemon criteria 已鎖定 Java 21，未改系統全域 Java 設定。

Debug APK 與 unsigned Release AAB 已編譯成功，修正後增量編譯再次通過。APK 開發簽章與 16 KB ZIP 對齊通過；AAB ZIP 完整、沒有發行簽章，六個 64 位元原生函式庫的 ELF 載入段均符合 16 KB 對齊。這些是產物檢查，不是 16 KB 裝置、功能或 Play 審核驗收。

| 檢查 | 結果與界線 |
| --- | --- |
| 工具盤點 | Android Studio、SDK 36、Build Tools 及 JDK 21；0 個缺少的工具前提 |
| Gradle | assembleDebug 與 bundleRelease 成功，修正後再次通過 |
| APK | 開發簽章、16 KB ZIP 對齊、App 介面檔案一致性通過；不作商店上傳 |
| Release AAB | ZIP 完整、未簽章；六個 64 位元原生函式庫 ELF 對齊通過 |
| 合併設定 | 禁止備份及明文傳輸、FCM 自動初始化關閉、release 非 debuggable |
| 仍待驗收 | 真機、16 KB 執行環境、背景遮罩、相機、專用帳號與商店審核 |

FileProvider 已縮到 App Pictures 目錄，移除依賴帶入的舊儲存 opt-out，修正 API 24-25 圖示資源。相機快取仍需裝置測試。Android 第三方入口暫停，只有第三方登入的既有會員暫無 Android 原生登入路徑；既有 iOS OAuth 問題仍待修復。發布前須確認功能範圍。

測試 APK 與 unsigned AAB 另存於這台 Mac 的 output/android；不放進程式封包。檔案大小、SHA-256 與重建方式見 docs/ANDROID_BUILD_ACCEPTANCE_2026-11-05.md。APK 只能用於受控測試，不含審查帳密。

新 App 目前須 target API 36；16 KB 相容性也列入產物與裝置檢查，不因使用 Java 或 Capacitor 就自動勾選通過。[Google target API 要求](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)與 [16 KB 說明](https://developer.android.com/guide/practices/page-sizes)。

<!-- page -->

## Google Play 需要的外部資料與商店素材

| 項目 | 需要持有人與 Jerry 確認 |
| --- | --- |
| 發行帳號 | 持有人回覆尚未建立或不確定，並指定交 Jerry 決定擁有人與辦理註冊；未登入或代付費 |
| 公司驗證 | 如採組織帳號，核對法定名稱、D-U-N-S、網站與可驗證的聯絡資料，不以 Apple 團隊顯示名稱代替驗證 |
| 註冊與條款 | 如需新帳號，Google Play 有一次性註冊費與協議；尚未代付款或建立帳號 |
| App 身分 | 最終 package name、免費或付費、發行地區、目標年齡、內容分級與廣告聲明 |
| 簽章 | Play App Signing 與 upload key 的建立、保管及指紋；需要時再取得操作時確認，不把密碼寫入 repo |
| 審查存取 | 可用的專用審查帳號、必要 QR 與操作步驟；帳密直接保管在 Play Console App access |
| 圖像 | 512 × 512 商店圖示、1024 × 500 feature graphic，至少兩張真實 Android 截圖及需要的裝置類別素材 |
| 審查前測試 | 先 internal testing；若適用新個人帳號規則，至少 12 位測試者持續加入 14 天，再申請 production access |

帳號類型尚未確認，須以實際 Play Console 的驗證與測試要求為準。公司帳號的資料清單及交接步驟另見 docs/GOOGLE_PLAY_ACCOUNT_SETUP_2026-11-05.md。詳見 [個人帳號測試規則](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)、[開發者帳號資料](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en)及 [商店素材要求](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)。

## Data safety 核對草案

| 實際資料 | 待核對的 Google 類別與用途 |
| --- | --- |
| 姓名、Email、電話、生日與會員 ID | 個人資訊及使用者 ID；帳號與 App 功能；是否必填依實際流程 |
| 好友關係與通知訊息 | 聯絡人或社交關係、訊息；不是裝置通訊錄讀取權限的證據 |
| 照片、個人介紹與資歷 | 照片及其他使用者內容或其他個人資訊，依實際欄位分類 |
| 已讀、報名、報到與操作紀錄 | App 活動及互動；是否收集、保存、分析或分享逐項核對 |
| 安裝識別、推播 Token 與維運紀錄 | 裝置或其他 ID、診斷等；FCM 啟用後需再核對 SDK 及 Google 處理 |

此草案尚未提交，須核對 SDK、日誌、收集與分享、刪除及保留。備妥公開政策與 App 內外的刪帳入口，並以專用可拋棄帳號測試。[Data safety 指引](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)、[刪帳要求](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)。

<!-- page -->

## 程式接手方式

本輪原生候選先前位於 codex/native-ui-push-20261105；Android 準備延續為 codex/android-play-prep-20261105。交付時兩者尚未 push GitHub，main 未變更。附件程式封包提供以 844e82d 為基線的 Git bundle，讓你不必存取這台 Mac 即可檢視本輪提交；私鑰、帳密、node_modules、SDK 與建置輸出均不包含。

三筆已完成的原生提交為 e32d4a9、70b5ae8、c3b8a51。Android 及本輪修正的程式候選為 2e7ef3a1fd03821484f04c983c6e4282c26294e5，與先前交付的 v2 程式封包 manifest 一致；本次僅整合交接文件。請先取回 GitHub main，再把 bundle 匯入新的 review branch，核對差異及相容性；不要整批併入 10 月的舊 mobile/cookie 候選。

```text
git fetch origin main
git bundle verify LionClubs_native_android_2026-11-05.bundle
git fetch ./LionClubs_native_android_2026-11-05.bundle \
  codex/android-play-prep-20261105:codex/jerry-native-play-20261105
git switch codex/jerry-native-play-20261105
```

## 工程與檢查入口

| 路徑或指令 | 用途 |
| --- | --- |
| mobile-app/src 與 root ios | 本次原生 UI 與 iOS 工程 |
| android | 新 Android 宿主，尚未送審 |
| docs/APNS_SETUP_2026-11-05.md | Apple 設定、Key ID、私有保管及後續接線 |
| docs/NATIVE_UI_AND_PUSH_IMPLEMENTATION_2026-11-05.md | 推播架構、API、worker、測試及限制 |
| docs/PUSH_PRIVACY_RECONCILIATION_2026-11-05.md | 資料流、政策修訂與保留核對 |
| docs/app-store/GOOGLE_PLAY_PREPARATION.zh-Hant.json | Android 商店資料草案與未驗收旗標 |
| docs/ANDROID_BUILD_ACCEPTANCE_2026-11-05.md | 工具鏈、產物指紋、已通過檢查與裝置待辦 |
| npm run android:sync | 建置既有 App 介面並同步 Android；不簽章或上傳 |
| npm run google-play:check | 唯讀盤點；--strict 未完成時應回非零 |
| node --import tsx scripts/mobile-push-worker.mjs --plan | 零 DB、零私鑰讀取、零發送的工作需求預覽 |

請用 package-lock.json 鎖定依賴，先安裝與產生 Prisma client。使用 JDK 21 與 SDK 36，進 android 執行 ./gradlew assembleDebug；本機 sdk.dir 與 Java 路徑設定均不進 Git。發行簽章、upload key、Google Play 上傳及任何正式 migration 需另行安排，不能只改 ready 旗標。

本文件可直接交 Jerry；未替使用者發訊息或寄信。機密資料由持有人與 Jerry 透過核定管道另行交接。建議先由 Jerry 確認帳號、簽章、後端執行位置及留存四項，這邊可持續處理工程、測試與素材。
