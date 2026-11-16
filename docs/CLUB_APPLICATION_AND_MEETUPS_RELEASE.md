# LionClubs 發版步驟

1. 在正式 RDS 核對實際目標及可還原的備份，再依 migration journal 套用 `20261112100000_meetups_business_cards` 與 `20261112110000_meetup_and_cooperation_notices`。升級會替已報名的未開始揪團補排提醒。先在隔離環境完成同版遷移與驗收。
2. 核對三位管理者各自的正式登入 Email 與對應的有效 Member/User。以既有受授權的正式管理流程授予 `AdminRole`：`role=SUPER_ADMIN`、`scopeType=GLOBAL`、`scopeId=NULL`。保留授權者與時間紀錄。以三個獨立帳號確認「我的 → 審核新會員」顯示全站清單與分會篩選。
3. 在 Amplify 的目標分支設定 `REGISTRATION_CLUB_APPLICATION_ENABLED=true` 與 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`，完成資料庫遷移後部署同版程式。用正式邀請連結核對分會選擇、待審、核准與登入。既有已開通、待分派的會員繼續由「會員分會分派」處理。
4. iOS 建置時也設 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`，重新產生 App 資產並簽署。先以隔離環境核對揪團、名片上傳與裝置內中文辨識，再完成正式後端配套、App Store 隱私資訊與審查驗證。
5. 站內通知隨後端開放。鎖定畫面推播需由既有 APNs worker 以同版程式定時執行，並在 worker 環境設定 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`。驗收用獲授權的測試裝置接收異動、提醒與邀請通知。

## 公開隔離審查環境

在審查站設定 `ISOLATED_APP_REVIEW_ENABLED=true`，並在伺服器執行環境設定與初始化相同的 `LIONCLUBS_REVIEW_DB_CONFIRM`。容器使用成對注入的 `DATABASE_URL` 與 `AUTH_SECRET`。Amplify 則指定獨立的 `APP_SECRETS_NAME`，由該分支的 SSR 角色讀取。審查模式會拒絕預設正式機密、拒絕與確認目標不符的資料庫，並停用第三方登入、對外寄信與 APNs 推播。站內通知仍可驗收。

使用俄亥俄區 RDS 時，審查後端會載入隨伺服器打包的 AWS 公開根憑證，並要求驗證 TLS。部署後從 Amplify 實際執行環境確認可連線。

使用獨立 PostgreSQL 資料庫與 HTTPS 網址，設定專用的 `AUTH_SECRET`，並將 `NEXT_PUBLIC_APP_URL` 指向審查環境。審查站只載入合成資料。名片照片存於審查資料庫，頭像與活動封面的 S3 上傳在審查站停用。Amplify 審查分支的執行角色僅讀取審查機密，無需授予正式 S3、寄信或推播權限。

在已遷移的審查資料庫執行 `node scripts/seed-isolated-review.mjs`。外部注入 `LIONCLUBS_REVIEW_DATABASE_URL` 和 `LIONCLUBS_REVIEW_PASSWORD`，並以 `LIONCLUBS_REVIEW_DB_CONFIRM` 指定該連線的主機、埠（如有）與資料庫路徑。初次執行會建立一個合成分會、審查帳號、無登入帳號的示範主揪，以及可報名的揪團、可回應的資源需求和一筆站內合作邀請。送審前可重跑以展延已過期的示範資料，保留既有帳密及審查員的操作紀錄。將審查密碼交由受控管道提供。

容器建置傳入 `--build-arg NEXT_PUBLIC_NEXT_PHASE_ENABLED=true` 以包含新功能和名片辨識資產。部署後從外部設備確認 HTTPS、App 登入、揪團與名片。送審建置保留正式 `MOBILE_APP_API_BASE_URL`，另外設定 `MOBILE_APP_REVIEW_API_ORIGIN` 為獨立審查站的 HTTPS origin。只有初始化腳本建立的 `reviewer@lionclubs-review.example.test` 及該帳號的憑證會連到審查站。請以同一個實際送審建置驗證審查帳號和一般會員、重開 App、更新登入及登出。Build 14 早於這項分流，須在審查網址確定後重新建置、簽署並核對可用的建置編號。

## App Store Connect 填寫草稿

**此版本新增功能**

- 新會員可在邀請註冊時選擇分會，核准後即可登入。
- 新增分會揪團，支援報名、聊天室、異動通知及行前提醒。
- 新增名片辨識與專長標籤。開啟分享後，可參與資源媒合並收到合作邀請。
- 分會幹部可審核入會申請，全站管理員可協助跨分會審核。

**供審查人員操作**

使用送審資料中提供的已啟用測試帳號登入。底部選「揪團」查看示範邀約，進入詳情可查看報名和聊天室。「我的 → 名片與專長」可選取名片照片，在裝置上辨識標籤並預覽，儲存後可移除名片。在「通知」點「收到合作邀請」，可開啟相連的公益講座保險需求。首次發言或回應需求時，在 App 內閱讀條款，由審查者自行決定是否同意，之後再送出草稿。正式送審前以實際送審建置逐項操作，並依測試資料補上可重現的步驟、可用帳密與有效邀請 QR。

**隱私權資料待審核**

依新版程式資料流，App Store Connect 應核對以下既有類別的涵蓋範圍。三類資料都用於 App 功能、與使用者身分連結。就這些新功能的實作，未發現廣告追蹤用途。發佈前仍須核對實際送審建置、服務設定與第三方 SDK 的完整資料用途。[Apple App 隱私權詳細資訊](https://developer.apple.com/app-store/app-privacy-details/)

| App Store Connect 類別 | 新增或擴充的資料用途 |
| --- | --- |
| 照片或影片 | 名片選取後在裝置上辨識。會員按儲存後，圖片連同會員識別寫入資料庫，會員介面僅本人可讀取圖片。 |
| 電子郵件或訊息 | 揪團聊天及定向合作邀請的訊息內容與發送、接收或群組識別，用於提供對話與通知。 |
| 其他使用者內容 | 揪團主題、說明、手動填寫地點、檢舉理由，以及使用者確認的名片標籤與分享設定。開啟分享後，相符結果會顯示姓名、分會及符合的標籤。 |

在正式站確認公開隱私政策已包含「揪團、名片與合作邀請」段落及刪除說明。將對照結果與 App Store Connect 的現有項目核對後再保存或發佈。Apple 審查人員應能從公開網址存取後端並使用有效測試帳戶。[Apple 審查指南](https://developer.apple.com/app-store/review/guidelines/)

從外部網路執行 `node scripts/check-isolated-review.mjs`，並透過環境傳入 `MOBILE_APP_REVIEW_API_ORIGIN` 與 `LIONCLUBS_REVIEW_PASSWORD`。此檢查使用實際的 App API 驗證匿名存取遭拒、審查帳號能登入及更新憑證，以及揪團、名片和通知可讀取。工具會拒絕正式站網址和重新導向，也不會輸出密碼或憑證。通過後，仍要在送審建置上操作上傳名片與聊天室，並確認正式會員登入與 App Store Connect 驗證。
