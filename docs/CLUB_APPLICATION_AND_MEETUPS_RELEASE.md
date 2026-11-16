# LionClubs 發版步驟

1. 在正式 RDS 核對實際目標及可還原的備份，再依 migration journal 套用 `20261112100000_meetups_business_cards` 與 `20261112110000_meetup_and_cooperation_notices`。升級會替已報名的未開始揪團補排提醒。先在隔離環境完成同版遷移與驗收。
2. 核對三位管理者各自的正式登入 Email 與對應的有效 Member/User。以既有受授權的正式管理流程授予 `AdminRole`：`role=SUPER_ADMIN`、`scopeType=GLOBAL`、`scopeId=NULL`。保留授權者與時間紀錄。以三個獨立帳號確認「我的 → 審核新會員」顯示全站清單與分會篩選。
3. 在 Amplify 的目標分支設定 `REGISTRATION_CLUB_APPLICATION_ENABLED=true` 與 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`，完成資料庫遷移後部署同版程式。用正式邀請連結核對分會選擇、待審、核准與登入。既有已開通、待分派的會員繼續由「會員分會分派」處理。
4. iOS 建置時也設 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`，重新產生 App 資產並簽署。先以隔離環境核對揪團、名片上傳與裝置內中文辨識，再完成正式後端配套、App Store 隱私資訊與審查驗證。
5. 站內通知隨後端開放。鎖定畫面推播需由既有 APNs worker 以同版程式定時執行，並在 worker 環境設定 `NEXT_PUBLIC_NEXT_PHASE_ENABLED=true`。驗收用獲授權的測試裝置接收異動、提醒與邀請通知。

## 公開隔離審查環境

使用獨立 PostgreSQL 資料庫與 HTTPS 網址，設定專用的 `AUTH_SECRET`，並將 `NEXT_PUBLIC_APP_URL` 指向審查環境。此環境只載入合成審查資料；使用自己的資料庫連線與媒體設定。維持 OAuth、對外郵件和手機推播關閉，直到擬測的功能及使用的服務確認可用。

在已遷移的審查資料庫執行 `node scripts/seed-isolated-review.mjs`。外部注入 `LIONCLUBS_REVIEW_DATABASE_URL` 和 `LIONCLUBS_REVIEW_PASSWORD`，並以 `LIONCLUBS_REVIEW_DB_CONFIRM` 指定該連線的主機、埠（如有）與資料庫路徑。初次執行會建立一個合成分會、普通會員和示範揪團。重跑保留既有帳密。將審查密碼交由受控管道提供。

容器建置傳入 `--build-arg NEXT_PUBLIC_NEXT_PHASE_ENABLED=true` 以包含新功能和名片辨識資產。部署後從外部設備確認 HTTPS、App 登入、揪團與名片。隔離驗收用的 iOS 建置將 `MOBILE_APP_API_BASE_URL` 設為該 HTTPS 網址，正式商店候選則指向正式網址。若審查人員要用正式商店候選連到隔離審查環境，須先建立該候選可用的隔離路由並核對審查帳號完整體驗。
