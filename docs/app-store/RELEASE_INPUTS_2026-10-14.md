# 原生發行輸入清單與完成定義

日期：2026-10-14。供 Hao、Jerry、Tom 與商店帳號所有人填寫；未知項目保持未定，不捏造法律實體、客服、Bundle ID、Team ID 或驗收狀態。這不是商店提交紀錄，網站部署與正式 migration 由主線另行驗證。

本輪決策：目前無可用正式 AWS 存取，AWS／正式 migration 與相容 API 部署交 Jerry 執行並回報；本機準備與 GitHub 留存不代表正式環境已更新。原生工作可以並行準備，但目前沒有原生專案、完整工具鏈或可發布產物，也尚未送審。

## 1. 請產品／帳號所有人先提供

| 資料 | 目前值 | 要確認什麼 |
| --- | --- | --- |
| 正式 App 名稱 | 未定；草稿「獅子會 App」 | 中文、必要英文名稱及使用權 |
| 發行法律實體 | 未提供 | 正式全名、個人／組織發行、品牌與資料控制者關係 |
| 客服 Email／公開聯絡 | 未提供 | 真正可收信、由誰回應；不填範例或假客服 |
| 隱私聯絡 Email | 未提供 | 資料權利、刪除及檢舉接件責任人 |
| Apple 所有人／Team ID | 使用者確認已有 Apple 帳號 | Developer 會員是否有效、個人／組織、Team ID、協議與建 App 權限仍未核實 |
| Google Play 所有人 | 使用者確認尚未建立 | 不擋先開發測試 APK；會阻擋 Play 發行。建立時確認個人／組織、驗證與測試要求 |
| iOS Bundle ID | 未提供 | 所屬 Team 下可用的正式 reverse-DNS 識別碼；核定後才建立 |
| Android applicationId | 未提供 | 正確 Play 帳號下的永久套件識別；網站 URL 不能代替 |
| 發行地區／語言 | 未定 | 是否先台灣／繁體中文；其他地區另有揭露與營運工作 |
| 定價／付費功能 | 未定 | 首版是否免費；目前未實作訂閱／數位付費，不先承諾商品 |
| 版本／支援裝置 | 未定 | version／build、iPhone／iPad、Android 手機／平板範圍 |
| 審查／內容管理聯絡人 | 未提供 | 可接審查電話與信件、停權／申訴／內容處理責任人 |

Apple 組織註冊通常涉及法律實體及 D-U-N-S 核驗，不可用尚未授權的名稱取代發行者。[Apple enrollment](https://developer.apple.com/programs/enroll/)

請由後台角色邀請提供最小必要權限。不要把 Apple ID 密碼、一次性驗證碼、p8／p12、私鑰、keystore 密碼或 Play service-account JSON 放進聊天／Git；本文件只需非秘密識別及狀態，簽章由所有人安全管理。

## 2. 素材與文案交付

| 素材 | 可以先準備 | 完成條件 |
| --- | --- | --- |
| 品牌母檔／App icon | 建議可編輯來源及 1024×1024 高解析母檔 | 確認名稱、獅子會徽章等權利，再產平台 icon；favicon 不等於完成品 |
| Google Play icon | 512×512 PNG | 按官方 icon 規範檢查；與 launcher icon 不同 |
| Google feature graphic | 1024×500 JPEG／無 alpha PNG | 不含未完成功能或誤導排名文案 |
| iPhone／Android 截圖 | 先定會員證、好友、活動、資歷、日夜故事 | 使用實際原生包及合成資料；無真會員個資或邀請秘密 |
| iPad／平板截圖 | 等支援範圍確認 | 若支援，按當時商店規格與真實版面準備 |
| 名稱／描述／關鍵字 | 既有 METADATA.zh-Hant.json 草稿 | 更新成中央 QR 註冊、站內通知等實際事實；不宣稱未完成功能 |
| 審查材料 | 流程、兩名合成會員、活動、樣本 QR | 帳號與後端持續可用，憑證只交商店私有審查欄位 |

Google 尺寸依官方素材文件；iOS 1024 母檔是本案準備建議，最終以選定 Xcode 資產／Icon Composer 及提交檢查為準。[Google 素材](https://support.google.com/googleplay/android-developer/answer/9866151)

## 3. 本機環境實測

執行 node scripts/check-native-environment.mjs；本次以 Codex bundled Node 盤點：

| 項目 | 2026-10-14 實測 | 判定 |
| --- | --- | --- |
| 主機 | macOS 26.3／arm64 | 有 macOS 主機，不代表原生工具已備妥 |
| Node | v24.19.0；一般終端 PATH 未找到 node | 符合 Node 22+；可用 bundled 執行檔跑盤點 |
| Xcode 選定目錄 | /Library/Developer/CommandLineTools | 不是完整 Xcode |
| Xcode／iOS SDK | xcodebuild -version 失敗，標準位置無 Xcode.app | 不能 Archive／建置 TestFlight |
| Android Studio | 標準 Applications 目錄未找到 | 自訂位置及遠端 CI 未驗證 |
| JDK | java_home 找不到 runtime；/usr/bin/java 只是啟動器 | 不能以路徑存在當可建置 |
| Android SDK／API 36／build-tools | 指定環境／標準位置未找到 | 目前不能產出 APK／AAB |
| 原生工程／套件 | 主專案未見 Capacitor／標準原生工程 | 需要獨立 mobile 工作區及鎖定依賴 |
| 帳號／簽章 | 已有 Apple 帳號，尚無 Google Play；簽章刻意不探測 | Apple Developer 有效會員／Team ID 仍待確認，不能推定可簽章 |

工具只跑版本／工具路徑讀取，不執行 sdkmanager、Gradle、裝置列舉、npx 安裝、Keychain 查詢或 Xcode 設定變更。預設退出 0；加 --strict，缺項退出 1；--json 可輸出結構化結果。

待使用者授權安裝／設定後，使用 Xcode 26+／iOS 26 SDK、Android Studio 2025.2.1+／SDK 36 與相容 JBR。Capacitor 8 的 iOS 15、Android API 24 是最低裝置基線；SDK 26／target 36 是不同概念。[Apple](https://developer.apple.com/news/upcoming-requirements/)、[Capacitor 環境](https://capacitorjs.com/docs/getting-started/environment-setup)、[Capacitor 8](https://capacitorjs.com/docs/updating/8-0)

## 4. migration 可以後補嗎：準備可並行，上線必須 DB-first

可以等 Jerry 處理正式 migration 的同時，先做商店文案、素材規格、原生登入／導航設計、合成資料與 mock 驗收；這些工作不需碰正式資料庫，也不等於原生實機端到端已通過。

不能先部署會讀寫新欄位／資料表的後端到舊 schema，再把 migration 當作稍後補件。新版 Session、Email Token、刪帳清理與報到歷史等功能依賴此次 schema；未更新會造成登入或操作失敗，並可能讓安全防護未生效。

依賴順序：

1. Jerry 核對部署目標、備份／還原安排、migration 狀態及待部署版本，先在隔離環境驗證，再於正式環境完成同版 migration；不以 reset 或 seed 代替。
2. 部署相容的同版 API，核對 schema／程式版本一致；驗證 Session、重設／驗證信、QR、刪帳、報到與授權，回報可供 App 使用的版本及結果。新 migration 會使舊登入失效、舊未用驗證／重設連結需重寄，須一併告知夥伴。
3. Hao 的原生客戶端接已確認相容的 API，再完成 iPhone／Android 實機端到端驗收。之前的 mock／合成測試只能證明本機情境，不證明 AWS、SES、S3 或正式環境通過。
4. 工具、簽章、隱私／刪帳／內容管理、商店資料及審查帳號全部驗收後才送審；不可只因網站有網址就宣稱 App 已完成或可發布。

若 Jerry 要採零停機或分階段部署，需另確認舊／新程式的 schema 相容窗口；這份文件沒有宣稱現有版本已具備可任意倒序部署的相容性。

## 5. 第一個原生里程碑：登入與 QR 垂直試作

目前是動態 Next.js 網站，不是可原樣放進手機的靜態資產。建議獨立 mobile React／Capacitor 客戶端，共用適合的 UI／型別，Prisma／AWS 留在 API。不要用 production server.url 遠端殼，也不為封裝停用 Web Origin／CSRF 防護。[Capacitor config](https://capacitorjs.com/docs/config)、[Next.js 限制](https://nextjs.org/docs/app/guides/static-exports)

Jerry／Hao 先選一種版本化 native auth 契約：

1. 原生 HTTP 與不暴露 JavaScript 的 Cookie store，驗證 HttpOnly、持久化及每條請求共用同一儲存；或短效 access／輪替 refresh，更新憑證存 Keychain／Keystore。
2. Web SameSite=Lax 與原生本機來源的跨源限制、CORS、CSRF 分別處理。不能聲稱加 Cookies plugin 就自動解決 iOS 限制或 HttpOnly。
3. 密碼重設、sessionVersion、其他裝置登出、刪帳／停權對 native 同樣有效；手機包不含 DB／AWS 秘密或硬編碼 client secret。

驗收：登入、/api/me、關閉重開、會員 QR／好友檔案、相機拒絕／替代路徑、上傳、登出、另一裝置撤銷、重設密碼、刪帳失效、斷線重試。至少各一部實體 iPhone／Android；另測大字、讀屏、安全區、鍵盤、返回及日夜。[Capacitor Cookies](https://capacitorjs.com/docs/apis/cookies)

Camera 外掛不等於 QR 解碼器，掃碼外掛／實作另評估並盤點 SDK 權限與隱私。站內通知不是 APNs／FCM，首版未做就不索取或宣傳推播。[Capacitor Camera](https://capacitorjs.com/docs/apis/camera)

## 6. 隱私與刪帳需定案的阻擋項目

現有功能不是「完全沒有 API」，但仍不能直接勾上架已驗收：

- 缺真實法律實體、客服／隱私聯絡、公開政策與外部刪帳網頁。政策需公開且非 PDF；外部刪除不能要求重裝 App。
- 有效／預定角色、未來主辦活動者如何在 App 內完成交接／刪除？現況 409 要找管理者，沒有完成路徑／期限前不算整體完成。
- 區分必要組織／法定紀錄與作者個人內容。現況保留匿名 Member、共享 Event、受限 audit reason 等；活動介紹／圖片和自由文字不一定已去個資。Apple 對本人共享 UGC 也有刪除要求，依法保留例外需告知；不能只因「大家的歷史」永久保留所有文字。
- 頭像清理等待舊 presigned upload URL 過期才執行，仍需可信排程、重試、監控、備份到期；DB 匿名化不代表 S3／備份全清。
- 已有會員檢舉／封鎖，仍需篩選、活動等內容處理、營運接件及回應，不能只靠管理頁存在。
- App Privacy／Data safety 按實際蒐集填寫：姓名、Email、電話、頭像、資歷、好友、活動、登入／風險記錄、AWS、新 SDK。未知不填「不蒐集」。

依據：[Apple 刪帳與 UGC](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)、[Apple 內容與審查](https://developer.apple.com/app-store/review/guidelines/)、[Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311)、[Google 外部刪帳](https://support.google.com/googleplay/android-developer/answer/13327111)。這是工程／政策盤點，不替法律實體判斷保留義務。

## 7. 從測試到商店的完成定義

1. 收齊名稱／帳號／App ID／素材，核准首版、發行範圍及資料規則。
2. 工具鏈及原生專案可用，native auth／QR 本機試作通過；可先交標明 mock／測試環境的安裝包。沒有 Google Play 帳號不擋 APK 本機開發，但目前工具與工程缺口仍需補齊，不能承諾已產包。
3. Jerry 完成 DB-first migration、同版 API 部署並回報；全功能、政策／客服／外部刪帳／UGC 完整，原生接真 API 有實機驗收紀錄，再交正式測試 APK／TestFlight。瀏覽器截圖不能冒充原生 App。
4. Play 準備 signed AAB；iOS 由正確 Team Archive／上傳。版本與簽章所有權可追溯，密鑰不進 Git，審查樣本 QR 持續可用。
5. 若為 2023-11-13 後新個人 Play 帳號，至少 12 人連續 14 天 closed testing 再申請 production；APK／internal testing 不抵免。
6. 所有人確認 App Privacy／Data safety、年齡問卷、地區、定價及協議才提交。商店核准後才稱正式上架，不保證審查時間。

格式與測試依據：[AAB](https://developer.android.com/guide/app-bundle)、[Play API 36](https://support.google.com/googleplay/android-developer/answer/11926878)、[新個人帳號測試](https://support.google.com/googleplay/android-developer/answer/14151465)。

本次未產生 IPA／APK／AAB、建立商店 App、安裝大型工具、讀取憑證或提交商店。既有 metadata 的 null／false 不因這份文件而自動變成已驗收。
