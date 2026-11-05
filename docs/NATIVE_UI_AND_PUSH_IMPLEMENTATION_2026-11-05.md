# 原生介面與手機推播：2026-11-05 候選版

基於 GitHub main **844e82d**，新分支 `codex/native-ui-push-20261105`。本文件描述下一版候選，不是已上架 Build 4 的功能聲明。現有 App binary、正式 DB、AWS 與 main 未變更；Apple 的 LionClubs Push Notifications 已在使用者於操作時明確確認後儲存，APNs 專用 Production／Topic Specific 金鑰亦已經確認建立並於本機私有保管，詳見 APNs 設定紀錄。

## 這輪完成的程式

- 原生五分頁加入一致的向量圖示、目前頁語意、48px 操作區與焦點標示；保留深海軍藍／霧金品牌及會員卡。
- 改善次資訊字級、換行、登入頁捲動、內容容器及 768px 起可讀欄寬，尊重降低動態效果。這不是完成 Dynamic Type／VoiceOver／iPad 實機驗收的宣告。
- 每個分頁的畫面錯誤由獨立 Boundary 接住，導航保留；重新載入只重建畫面，不重送報名、發送、刪除等操作。
- 修正好友 QR 的用途文案；會員 ID QR 是掃描加好友，不是身分驗證或活動報到證明。
- 通知契約對缺漏的舊版列表維持相容，錯型別與不完整資料則明確回報讀取錯誤，不假造空清單或讓 `.map()` 損毀整頁。
- 真正共用的登入儲存 coordinator：跨所有 API client 的 session epoch、序列化 Keychain 寫入及單一 refresh。舊帳號的晚回覆不能覆寫／清除新帳號，舊操作也不能換成新帳號重送。網路及 5xx 不當成確定登出。
- Capacitor bridge logging 關閉，避免認證及 APNs 值進入開發記錄。
- 候選版補上 iOS 原生不透明背景遮罩及回前景重新核對登入；無法連線時隱藏會員資料，提供重試／明確登出，不把未知狀態當成確定登出。這是本輪新增實作，仍須以真機切換器、鎖定及撤銷身分驗收。

## 使用者選定的三類通知

1. 活動公告：沿既有 Web／App 通知發送的授權與收件規則。
2. 好友邀請：只在新 PENDING 邀請建立時產生；QR 直接加好友不重發邀請。
3. 審核結果：資歷核准／退回與會籍核准，限仍可登入且來源仍有效的本人。

**目前會員申請拒絕的舊流程會刪除 User／Member，該類不產生推播或 receipt。** 不放寬停權／刪帳等身分規則來硬送通知；不能承諾所有拒絕結果都能收到手機推播。若要改為保留可查詢的入會拒絕結果，需另定產品與資料保留規則。

鎖定畫面一律是「LionClubs／你有一則新的通知，開啟 App 查看」，沒有姓名、活動標題、訊息原文、審核理由或 Token。點擊僅接受版本 1 的已知種類，導到通知頁；資料重新由已登入 API 查詢，不接受 payload 裡的任意 URL 或權限。

## App 端

- 「我的」新增手機通知設定，說明三類用途、通用鎖屏內容及不發行銷訊息。
- 只有本人按開啟才可能詢問系統權限。冷啟動／回前景只讀目前權限，未選擇啟用的帳號不靜默開啟；拒絕後不反覆彈窗。
- listener 先安裝才 register；APNs Token 更新、會員切換及背景晚回覆均有 generation 防護。
- 登出先解除該安裝推播，再清登入。啟用／停用都帶 Keychain 持久遞增 revision，防止晚到的註冊反轉新的停用。
- 冷啟動離線、尚未載入會員時，也會用既有裝置綁定嘗試解除推播；解除未確認會如實提示。
- 離線或儲存失敗會顯示「尚未確認」，不假稱伺服器停用、其他裝置撤銷或刪除已完成。
- 審核結果另有本人可讀的通用 receipt 列表與已讀操作；前景收到通知時重新讀取。

## 後端與送達工作

- 新增加密裝置登記、receipt 與 durable outbox 的 additive migration。已用合成 PostgreSQL 測試，**未對正式 DB 執行**。
- 裝置綁定 User／Member／sessionVersion、安裝 ID、APNs 環境／topic、revision、bindingVersion 及租約；換帳號／相同 Token 重新綁定為原子操作，停用保留 revision tombstone 並清除 Token。
- 所有來源與 outbox 同一筆原交易；旗標關閉時不碰新表，舊版網站及 App 不需要先有新表。
- worker 發送前重核帳號、sessionVersion、租約、來源、封鎖及既有活動可見規則。現有活動 scope 是發佈層級，不是組織閱讀隔離；本輪沒有擅改該產品規則。
- APNs 網路在 SQL transaction 外，非 Amplify 回應後的 `void send()`。支援去重、bounded retry、失效裝置停用；未知傳輸結果不盲目重送，站內通知保留。
- APNs 200 只標記 ACCEPTED，不是裝置已收到。裝置已收到的通知不能因事後停權／撤銷而召回，因此鎖屏永遠通用內容。
- 本候選採 **24 小時裝置租約**，App 回前景可更新；超過租約未開 App 會停止配送，這是保守安全參數，正式啟用前需確認是否符合會員使用頻率。receipt 的 7 天及 delivery 的 24 小時是可顯示／配送的期限，**不是聲稱所有 DB、歷史版本、日誌或備份已自動永久清除**；物理清理與排程仍須配置及驗收。

## 設定與秘密資料邊界

預設 `MOBILE_PUSH_ENABLED` 與 `PUSH_DELIVERY_ENABLED` 都不啟用。App／API／worker 三者缺少必要條件就不發送。

API runtime 必須明確設定非秘密值：

- `MOBILE_PUSH_ENABLED=true`
- `APNS_ENVIRONMENT=sandbox` 或 `production`
- `APNS_TOPIC=com.lionclubsmembership.app`

裝置加密金鑰有兩條明確管道：受控伺服器 env 的 `PUSH_DEVICE_ENCRYPTION_KEY`（64 hex），或 `MOBILE_PUSH_RUNTIME_SECRETS_ENABLED=true` 加上明確的 `MOBILE_PUSH_SECRETS_NAME`，由 SSR compute role 讀取該 secret 的同名欄位。沒有預設 secret fallback，不會為未設定的服務探查 credential chain。設定在 SQL transaction 外解析及快取。

Amplify runtime writer 只保存旗標、topic／環境與 secret **名稱**。不把裝置加密金鑰、APNs 私鑰／Key ID、worker DB URL 或發送開關塞進 `.env.production` 或前端。沒有新增 IAM 權限或 secret。

APNs provider 使用 Apple 的固定 HTTP/2 主機及 ES256，TLS 驗證保持開啟；同一 provider factory 重用連線與最長 50 分鐘的 provider JWT。只接受固定 topic 與通用 payload，不回報 raw provider error 或 Token。

## 可檢查的 worker 入口

下列 plan 不讀金鑰、不連 DB、不發推播、不建雲端資源：

```sh
node --import tsx scripts/mobile-push-worker.mjs --plan
```

真正執行只允許一批最多 25 筆；需要受控環境提供 `PUSH_DATABASE_URL`（加密且拒絕 accept_invalid_certs）、`PUSH_DELIVERY_ENABLED=true`、上述推播設定與加密金鑰，以及 `APNS_TEAM_ID`、`APNS_KEY_ID`、`PUSH_APNS_KEY_PATH`。私鑰檔必須是不可被其他使用者讀取的普通檔案，不能是 symlink。私鑰必須是 APNs 用途，不借用 OAuth／App Store Connect key。

另須在操作時精確核對 `--confirm-host`、`--confirm-database`、`--confirm-topic`、`--confirm-environment` 才可加 `--execute`。沒有自動讀 `.env`、一般 `DATABASE_URL`、自動 migration、cron 或付費資源。長期排程需決定可信執行位置、重用 provider、監控及清理安排，不把這支手動單批入口當成已部署常駐服務。

## 原生 UI 預覽與驗收界線

`node mobile-app/preview/build.mjs` 會重用真正的五分頁元件，產生 `tmp/native-ui-preview`。所有 API／native adapter 被替換，metafile 拒絕真 contract、原生 plugin、Keychain 及伺服器私密來源；CSP 禁止外網，任何變更均拒絕或明示不儲存。

`node mobile-app/preview/prepare-ios.mjs` 另產生隔離 iOS 宿主，Bundle ID 為 `com.lionclubsmembership.uipreview`，不覆蓋正式 App，也不註冊正式 OAuth scheme。僅用 Simulator ad-hoc，不建立 Apple credential／profile，不開推播權限。

已在既有 LionClubs Review 模擬器真正啟動 WKWebView，目視並點選首頁、好友、活動、通知與我的；窄／寬折疊狀態均可呈現，底部導航保持。頁面有永久「介面預覽 · 合成資料」標示。**這不是網頁版預覽，也不是正式資料或商店素材。**

自動捲動／拖曳工具未成功帶動長頁，因此沒有把頁尾通知偏好、所有表單、完整大字／鍵盤／iPad／VoiceOver、Boundary 互動或相機流程標成原生 E2E 通過。不得以單元測試或預覽替代實機驗收。

## 本輪驗證

- 程式單元 285／285、整合／demo 198／198；隔離預覽 5／5。最後一次整合完整重跑採 `--test-concurrency=1`；前一輪並行執行雖各情境斷言通過，既有 federated-auth 測試在 PGlite teardown 後出現 `_IsTransactionBlock` 非同步錯誤，不能算該輪全綠。序列重跑完整通過；未忽略錯誤或修改既有測試斷言。
- 包含真 contract＋合成 HTTP／SecureStorage 的舊 A refresh 晚回覆不能覆寫／清掉 B、跨 API instance 單一 refresh、mutation 不跨帳號重試與未知網路保留 Token。
- API／outbox 使用 PGlite＋真 Prisma／路由；覆蓋 disabled 時新表不存在、CAS／角色／封鎖、加密／revision／租約、換帳號、來源回滾、worker 失效及重試。
- TypeScript、Prisma schema validate、Next production build 已通過；Next build 僅注入不可連線的 loopback 合成設定，未讀正式 DB／AWS secret。
- 原生 Simulator 工程、隔離 preview host 與包含新背景遮罩的 iPhone SDK unsigned Release 均 BUILD SUCCEEDED。沒有正式 Archive、TestFlight、新商店 build 或正式推播。
- worker `--plan` 的零 DB／零網路／零金鑰讀取已測。

## 真正啟用前仍需完成

1. App ID 推播能力與 APNs 專用 Production key 已完成；仍需有效發行簽章、更新後 profile、伺服器秘密託管及受控備份。現有 key 不貼聊天或 repo，不為 sandbox 或其他服務預建額外 key。
2. 指定部署、migration 目標與備份；配置 API secret reference、可信 worker／排程與物理清理，先用專用裝置／帳號驗收，不向正式會員廣播測試。
3. 補齊新版 OAuth handoff 的一次性／PKCE；背景隱私及前景核對已有本輪候選實作，仍須真機驗收，不繼承另一個舊工程的測試結果。
4. 真機驗證前景、背景、關閉 App、拒絕／重新啟用、Token 更新、登出／換帳號／刪帳、點擊及各角色收件規則。確認 24 小時租約、拒絕會員及來源更新後抑制通知的產品取捨。
5. 修訂公開隱私政策「站內通知不是背景推播」等說明、資料類型／Token 綁定及保留／第三方 Apple 處理，再核對商店問卷，最後出新 build／TestFlight／送審。

90 天日誌仍按使用者 10 月 27 日的決定交 Jerry 確認；本輪沒有改留存或刪日誌。Apple 審核已通過舊版，不代表下一版新能力已被審核或可以免測上傳。

官方依據：[Capacitor v8 Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)、[Apple APNs 註冊](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)、[Apple APNs 認證金鑰](https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens/)。

後續操作：[APNs 設定步驟](APNS_SETUP_2026-11-05.md)、[推播資料與隱私核對草案](PUSH_PRIVACY_RECONCILIATION_2026-11-05.md)。
