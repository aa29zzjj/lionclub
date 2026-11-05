# LionClubs 原生 App：已發佈基線與下一版工作

核對日期：2026-11-05（台灣時間）。本紀錄將「已上架的版本」、「GitHub 最新原始碼」與「本輪 UI／推播候選」分開；不沿用 10 月舊候選的阻擋清單或測試成果，也不把文件中的 SOP 視為部署、建憑證或刪資料的授權。

## 一、已發佈基線：已核實與持有人回報

| 項目 | 本次依據 | 結論與範圍 |
| --- | --- | --- |
| 台灣 App Store 上架 | [Apple 官方公開查詢](https://itunes.apple.com/lookup?id=6826321953&country=tw)、[App Store 頁](https://apps.apple.com/tw/app/lionclubs/id6826321953) | LionClubs 1.0 已公開，Bundle ID 為 com.lionclubsmembership.app；currentVersionReleaseDate 為 2026-11-03T01:25:46Z，即台灣 2026-11-03。 |
| Build 4 | 持有人 2026-11-05 第二版交接；844e82d 的 ios/App/App.xcodeproj/project.pbxproj | 工程 CURRENT_PROJECT_VERSION=4、MARKETING_VERSION=1.0。公開 lookup 不提供 Build Number，不能說已由公開查詢證明商店 binary 一定為 Build 4。 |
| Ready for Distribution、手動發佈、38 個地區 | 持有人交接回報 | 本輪未登入 App Store Connect 重新核實該狀態、發佈方式或完整地區清單；台灣上架已由公開資料核實。 |
| 公開分類、定價、分級 | Apple 官方 lookup | Social Networking、TWD 0、**4+**。Repo 舊 metadata 的 12+ 不應繼續當作目前商店分級；下一版問卷仍須依實際功能核對。 |
| 公開截圖 | Apple 官方 lookup | iPhone 3 張、iPad 1 張；數量不等於所有 iPad 畫面或下一版 UI 已完成驗收。 |

帳號、密碼、PIN、Token 與私人審查聯絡資料不轉錄到本文件或 repo。持有人直接在 App Store Connect 保管／核對審查登入資訊；PDF 中出現帳密本身不構成代理登入正式會員或操作正式資料的授權。

## 二、GitHub 最新版與正式 API

最新 main 為 [844e82defbe459700a29dcb56adc1e7238907de8](https://github.com/aa29zzjj/lionclub/commit/844e82defbe459700a29dcb56adc1e7238907de8)，commit 時間 2026-11-04T16:00:01Z（台灣 2026-11-05），標題為「Port native app feature parity: profile, friends, events, notifications, experiences」，共 29 個變更檔案。

這一筆包含活動建立／名單／報告／封面、會員資歷 CRUD、通知發送與已發送清單、重寄驗證信等 mobile API 與原生畫面。它是原始碼／部署核對基線，不是新商店 binary 的證據。

以下對正式網域只做 GET，帶明確無效的 Bearer 值，沒有使用帳密、存取會員資料或送出變更：

| 公開端點 | 結果 | 可證明的事 |
| --- | --- | --- |
| /api/mobile/me/experiences | 401 JSON | 路由存在並拒絕無效身分 |
| /api/mobile/notifications | 401 JSON | 同上 |
| /api/mobile/events | 401 JSON | 同上 |
| /api/mobile/me | 401 JSON | 同上 |
| /api/mobile/friends | 401 JSON | 同上 |

**401 不是授權後的功能 E2E 驗收**，也不單靠這五個結果保證全部同版部署、DB 欄位、寄信、上傳或幹部權限均正常。附件所列新增功能仍應以專用測試資料逐項走過。

`/api/mobile/config` 仍為 404，但那是 10 月舊候選的契約；目前已發佈的 Bearer 工程沒有依賴它，**不能再將這個 404 當成本版阻擋**。

## 三、唯一的原生續作基線

| 邊界 | 目前工程／契約 | 不應混用的舊候選 |
| --- | --- | --- |
| 原生 UI | mobile-app/src/* | 舊 mobile/client/* 的介面及測試 |
| 本地打包 | capacitor.config.ts，webDir=mobile-app/dist | 舊 mobile/capacitor.config.json |
| iOS 工程 | root ios/App/App.xcodeproj | 舊 mobile/ios/* |
| API／登入 | /api/mobile/*，src/lib/mobile-auth.ts、mobile-request-auth.ts；短期 access／refresh Bearer token；Keychain 儲存 | 舊私有 Cookie jar／舊 /api/mobile/config 流程 |
| 刪帳／連結登入方式 | 原生按鈕用系統 Browser 前往官方網站對應頁，網站自行登入及重新驗證 | 不能假定舊候選的 App 內 Cookie 再驗證仍存在 |

依據：[capacitor.config.ts](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/capacitor.config.ts)、[mobile auth](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/src/lib/mobile-auth.ts)、[client contract](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/mobile-app/src/contract.ts)。舊分支保留作歷史參考，不應直接整批合併回已發佈架構。

## 四、下一版必須保留的安全與品質關卡

以下為 844e82d 基線的讀碼結果，不是正式帳號攻擊測試；本輪新增實作與測試由主工作流另外記錄。

1. **通知空陣列防呆要隨下一個 App build 發佈。** NotificationsScreen.tsx 的 load 已在 844e82d 使用 `data.inbox ?? []`、`data.friendInvitations ?? []`、`data.notifications ?? []`。依持有人交接，已上架 Build 4 尚未包含這段修正；後端部署不會更新 binary 內的 JS。仍需加入欄位缺漏／錯型別與畫面錯誤隔離回歸，不能只依賴後端目前恰好回傳完整資料。
2. **OAuth handoff 的一次性與 PKCE 尚待補強。** mobile-auth.ts 註解稱 one-time，但目前 handoff 為 60 秒 stateless JWT；exchange route 驗章與核對目前 User，未見一次性消耗紀錄或 PKCE／裝置端 verifier 綁定。需先確定相容已上架客戶端的升級方案，再完成重放、錯 verifier、取消／過期及權限邊界測試；不將舊候選的 PKCE 測試搬作本架構驗收。
3. **背景隱私與前景重新確認需重新驗收。** 基線 SceneDelegate.swift 僅代理生命週期，未見舊候選的背景不透明遮罩；基線 App.tsx 也未見同等的前景 session 重新核對。以真機切換器、鎖定／回前景、離線及撤銷帳號情境驗證，不能因 10 月另一個工程曾通過就標為已解決。
4. **原生 UI 與推播正在製作下一版候選。** 本輪不把網頁 `/profile?preview=large-text`、mock 資料預覽或單一 iPad 首頁截圖當作原生功能驗收。應核對 iPhone／iPad、安全區、鍵盤、大字、VoiceOver、暗色與降低動態效果，以及通知點擊後的授權導覽。
5. **相機／相片及管理員覆蓋仍需真機走查。** 包含允許、拒絕、重試、QR／頭像上傳，以及不同幹部組織範圍；不使用正式會員資料做可破壞測試。

參考基線：[通知頁](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/mobile-app/src/NotificationsScreen.tsx)、[handoff exchange](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/src/app/api/mobile/auth/oauth/exchange/route.ts)、[SceneDelegate](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/ios/App/App/SceneDelegate.swift)、[App](https://github.com/aa29zzjj/lionclub/blob/844e82defbe459700a29dcb56adc1e7238907de8/mobile-app/src/App.tsx)。

## 五、部署、留存與作業邊界

- 最新 [EC2 workflow](https://github.com/aa29zzjj/lionclub/actions/runs/41863460420) 的 gate 成功，真正的 Deploy job 為 **skipped**，不是長期 Queued，也不是 EC2 已部署。它仍是明確 opt-in 的舊替代路徑，**不可因本次工作啟用**。
- [頭像清理](https://github.com/aa29zzjj/lionclub/actions/runs/41937559016)與 [rate-limit 清理](https://github.com/aa29zzjj/lionclub/actions/runs/41935971097)有成功紀錄；這不等於 S3 歷史版本、CDN、備份、名冊及所有留存承諾都已驗收。
- **2026-10-27 使用者已決定「日誌留存暫不變更，交 Jerry 確認」。本次沒有把它解讀成允許設為 90 天或刪除舊日誌。** 未重新查 AWS 留存設定，不聲稱現在已是 90 天。政策承諾與實際設定仍須核對後再關閉待辦。
- 基線盤點沒有因交接 SOP 自動 push main、跑正式 migration、修改 AWS／IAM／備份、變更商店聲明或上傳新 build。後續使用者於操作時明確確認後，已開啟 LionClubs App ID 的推播能力，並建立／下載僅限該 App 的 Production APNs key；私鑰僅存本機私有位置，詳見 [APNs 設定紀錄](APNS_SETUP_2026-11-05.md)。沒有向 APNs 發送測試或啟用正式推播。正式部署仍需以精確候選、環境和操作範圍安排驗收，不能用 mock 測試取代。

## 六、推播與下一次發佈需要的外部輸入

使用者已在本輪選定首批範圍：**活動公告、好友邀請、審核結果**。實作僅在原交易成功建立來源後寫最小 receipt／outbox，旗標關閉不查新表，鎖定畫面不放姓名、訊息全文或審核理由。入會拒絕的既有流程會刪除 User／Member，收件人因此無法登入核對結果；這一類先安全地不建推播 receipt，不能承諾所有拒絕結果都能收到手機推播。資歷核准／退回只有仍可登入、來源關聯有效的收件人才列入候選，發送時仍要再核對。

| 需要持有人／Jerry 配合的項目 | 需要核對什麼 | 交付界線 |
| --- | --- | --- |
| Apple 發行 Team／APNs 能力 | 既有 Team 2TWCSJNDWG、Bundle topic、Push Notifications capability、適當 provisioning；開發／正式 APNs 環境 | 任何新增 key／權限在實際操作時確認；不撤銷既有憑證，不把私鑰貼聊天或 repo |
| APNs 發送憑證／金鑰託管 | 選定既有或核准新建的 APNs 認證；Key ID／Team ID／topic，私鑰只進核定的 secret store | 文件只記非秘密識別資訊與是否可用，不複製 .p8、token、AWS key 或完整環境檔 |
| 後端推播執行位置與資料結構 | 精確部署環境、裝置 token 綁定／登出解除／失效清理、重試與去重；需要 migration 時先核定目標與備份 | 不因新增推播而擅建付費雲端資源、公開服務或改正式 DB |
| 通知產品規則與隱私 | 已定活動公告／好友邀請／審核結果；仍需核對使用者同意與偏好、關閉方式、鎖定畫面最小內容、訊息保存／日誌及時區安排 | 不把站內通知自動等同遠端推播，不廣播給真實會員測試；刪除登入的會員拒絕結果暫不推播 |
| 指定真機與專用測試收件人 | 本人解鎖／授權、APNs token 註冊、前景／背景／被關閉、拒絕／重新啟用、點擊授權、登出及換帳號 | 僅向已核准的測試裝置／收件人發送；模擬器或 mock 的成功不代表 APNs E2E |
| 下一版發行資訊 | 新的 version／build、TestFlight 群組、最終原生截圖、年齡及隱私問卷、仍有效的審查帳號 | 更新到 next candidate 的實測證據齊備後才 Archive／上傳／提交；本文件不宣稱已發新 build 或部署 |

`METADATA.zh-Hant.json` 已分開保存公開已發佈基線與下一版待驗收狀態。`ready=false` 與 `submissionReady=false` 指本輪候選，**不再代表 LionClubs 從未上架**。

## 七、本輪事件接線的本機證據

已接上 web／mobile 好友邀請與會員核准，以及兩平台共用的資歷審核 service。好友邀請來源與 receipt 放在同一 Serializable 交易；會員核准使用狀態 CAS 成功後重新讀取的 updatedAt revision；資歷審核使用本次新建 audit.id。QR 直接成為好友不額外發「邀請」，會員拒絕刪除登入的分支不建立無法讀取的推播紀錄。

`tests/mobile-push-events-integration.test.mjs` **25／25 通過**：真實 route／共享 service、Prisma、一次性 PGlite migration SQL；Cookie 與 Bearer 兩個平台皆涵蓋。包含：旗標關閉時直接移除三張新表，原好友／審核功能仍可成功；邀請重複／封鎖／自己／無效對象／跨來源拒絕不建立 receipt；核准／退回只對成功狀態變更建立一筆來源紀錄；receipt 寫入失敗會一併 rollback 原好友、會員狀態或資歷狀態與 audit。

此測試沒有 APNs、AWS、真機、正式帳號或正式資料，也不證明 RDS 多連線競態、作業排程或手機實際顯示通知。APNs 裝置註冊、worker、App UI 與真機端到端驗收仍由本輪其他工作流記錄，不能因事件接線通過就標記下一版可上架。測試 log 位於本機 `/tmp/lionclubs-mobile-push-events-20261105.log`，不納入 repo。

另重跑既有 `uat-fixes-integration`、`experience-review-integration`、`simulation` 三個檔案，**29／29 通過**，涵蓋原好友邀請／封鎖、審核權限／CAS／稽核失敗 rollback 與整體隔離情境。其 log 為 `/tmp/lionclubs-push-event-existing-regressions-20261105.log`；此處只記本次實跑範圍，不冒稱全 repository、真機或正式環境驗收。
