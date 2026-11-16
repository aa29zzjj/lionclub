# LionClubs 發版步驟

1. 在正式 RDS 核對實際目標及可還原的備份，再依 migration journal 套用 `20261112100000_meetups_business_cards` 與 `20261112110000_meetup_and_cooperation_notices`。升級會替已報名的未開始揪團補排提醒。先在隔離環境完成同版遷移與驗收。
2. 核對三位管理者各自的正式登入 Email 與對應的有效 Member/User。以既有受授權的正式管理流程授予 `AdminRole`：`role=SUPER_ADMIN`、`scopeType=GLOBAL`、`scopeId=NULL`。保留授權者與時間紀錄。以三個獨立帳號確認「我的 → 審核新會員」顯示全站清單與分會篩選。
3. 在 Amplify 的目標分支設定 `REGISTRATION_CLUB_APPLICATION_ENABLED=true` 與 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`，完成資料庫遷移後部署同版程式。用正式邀請連結核對分會選擇、待審、核准與登入。既有已開通、待分派的會員繼續由「會員分會分派」處理。
4. iOS 建置時也設 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`，重新產生 App 資產並簽署。先以隔離環境核對揪團、名片上傳與裝置內中文辨識，再完成正式後端配套、App Store 隱私資訊與審查驗證。
5. 站內通知隨後端開放。鎖定畫面推播需由既有 APNs worker 以同版程式定時執行，並在 worker 環境設定 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`。驗收用獲授權的測試裝置接收異動、提醒與邀請通知。

## 公開隔離審查環境

使用獨立 PostgreSQL 資料庫與 HTTPS 網址，設定專用的 `AUTH_SECRET`，並將 `NEXT_PUBLIC_APP_URL` 指向審查環境。此環境只載入合成審查資料；使用自己的資料庫連線與媒體設定。維持 OAuth、對外郵件和手機推播關閉，直到擬測的功能及使用的服務確認可用。

在已遷移的審查資料庫執行 `node scripts/seed-isolated-review.mjs`。外部注入 `LIONCLUBS_REVIEW_DATABASE_URL` 和 `LIONCLUBS_REVIEW_PASSWORD`，並以 `LIONCLUBS_REVIEW_DB_CONFIRM` 指定該連線的主機、埠（如有）與資料庫路徑。初次執行會建立一個合成分會、普通會員和示範揪團。重跑保留既有帳密。將審查密碼交由受控管道提供。

容器建置傳入 `--build-arg NEXT_PUBLIC_NEXT_PHASE_ENABLED=true` 以包含新功能和名片辨識資產。部署後從外部設備確認 HTTPS、App 登入、揪團與名片。送審建置保留正式 `MOBILE_APP_API_BASE_URL`，另外設定 `MOBILE_APP_REVIEW_API_ORIGIN` 為獨立審查站的 HTTPS origin。只有初始化腳本建立的 `reviewer@lionclubs-review.example.test` 及該帳號的憑證會連到審查站。請以同一個實際送審建置驗證審查帳號和一般會員、重開 App、更新登入及登出。Build 14 早於這項分流，須在審查網址確定後重新建置、簽署並核對可用的建置編號。

## App Store Connect 填寫草稿

**此版本新增功能**

- 新會員可在邀請註冊時選擇分會，核准後即可登入。
- 新增分會揪團，支援報名、聊天室、異動通知及行前提醒。
- 新增名片辨識與專長標籤。開啟分享後，可參與資源媒合並收到合作邀請。
- 分會幹部可審核入會申請，全站管理員可協助跨分會審核。

**供審查人員操作**

使用送審資料中提供的已啟用測試帳號登入。底部選「揪團」查看示範邀約，進入詳情可查看報名和聊天室。「我的 → 名片與專長」可選取名片照片，在裝置上辨識標籤並預覽，儲存後可移除名片。合作需求與合作邀請可從「獅友服務中心」及「通知」查看。正式送審前以實際送審建置逐項操作，並依測試資料補上可重現的步驟、可用帳密與有效邀請 QR。

**隱私權資料待審核**

名片照片會在本人確認儲存時上傳；揪團訊息、邀請留言及分享的專長標籤也會儲存並與帳號連結。請依正式版本的實際行為核對 App Store Connect 中的「照片或影片」「其他使用者內容」「電子郵件或訊息」及對應用途，再保存或發佈。iOS 審查人員應能從公開網址存取後端並使用可用測試帳戶。[Apple 審查指南](https://developer.apple.com/app-store/review/guidelines/)

從外部網路執行 `node scripts/check-isolated-review.mjs`，並透過環境傳入 `MOBILE_APP_REVIEW_API_ORIGIN` 與 `LIONCLUBS_REVIEW_PASSWORD`。此檢查使用實際的 App API 驗證匿名存取遭拒、審查帳號能登入及更新憑證，以及揪團、名片和通知可讀取。工具會拒絕正式站網址和重新導向，也不會輸出密碼或憑證。通過後，仍要在送審建置上操作上傳名片與聊天室，並確認正式會員登入與 App Store Connect 驗證。
