# Google Play 審查存取準備

2026-11-06，台灣時間。**僅為填寫草案，未提交 Play Console。** Google Play 發行作業由使用者這邊負責。此文件沒有帳密、QR、正式會員資料或已可用帳號的承諾。

## 建立帳號前的核對

- 確認精確後端環境、App 連線位置與候選 commit，避免把測試帳號建到錯誤資料庫。審查候選必須能讀取相同環境。
- 使用可重複登入、審查期間持續可用的專用信箱密碼帳號；Android 第三方登入目前暫停，不能提供只能用 Google／Apple 登入的帳號。
- 帳號需完成實際會籍流程，不可留下待核准、首次改密碼、邀請過期、地區限制或要求審查者提供手機 OTP 的障礙。不修改正式會員的驗證或安全設定來取得審查存取。
- 以合成會員、活動與好友資料提供完整可查閱內容；測試者要清楚辨識這是測試資料。不能用純介面預覽取代真正帳號與 API 驗收。
- 如果第一版包含幹部功能，另外配置權限範圍受限的測試幹部與指定測試組織；一般會員與幹部情境分別驗收，不把正式全域管理員交給審查者。
- 必要 QR 需固定、審查可讀並指向受控測試對象；若需在 Console 提供靜態 URL，先確認公開範圍與最少資料，不能公開真實會員的 QR 或名冊。
- 帳密只放入 Google Play Console 的 App access 欄位及核定的私有保管位置；不進此文件、repo、截圖或交接 PDF。

## English instructions draft

The following describes the intended review flow. Validate every step against the actual Android candidate before copying it into Play Console. Enter the verified dedicated username and password in the Console fields separately.

### Sign in

1. Open LionClubs. Enter the dedicated review email address and password provided in the App access fields.
2. Tap **登入** (Sign in). Use the email/password fields; third-party sign-in is not available in this Android candidate.
3. The account must already be activated and its membership approved before review. The reviewer should not need to register, obtain an invitation, contact an administrator or provide a one-time verification code.

### Review the member features

- **首頁** (Home): view the member overview and the available actions.
- **好友** (Friends): view the dedicated account's test friends and open a test member profile. The profile provides **檢舉** (Report) and **封鎖此會員** (Block this member).
- **活動** (Events): open a prepared test event and review its details and available participation actions. Only describe registration or check-in steps after the review account and event have been tested for those actions.
- **通知** (Notifications): view in-app activity announcements, friend invitations and readable review results prepared for this account. Android background push delivery is not enabled in this candidate.
- **我的** (My profile): view and edit the dedicated account's test profile and membership experience, review the available settings and sign out. Explain account deletion restrictions and any required role handover accurately; do not state deletion succeeds until tested.

### Restricted officer features

If officer tools are included in the submitted version, provide a separate approved test account and explain the exact navigation, organization scope and prepared test cases. Do not include this section as a claim that officer access has already been configured.

## 提交前驗收清單

| 情境 | 目前狀態 |
| --- | --- |
| Android 候選能對指定 API 登入與重開 | 尚未完成專用帳號驗收 |
| 信箱密碼跨地區、可重複使用，無一次性障礙 | 尚未確認 |
| 一般會員與幹部權限分開，資料為受控測試內容 | 尚未確認 |
| 檢舉到達指定管理端、封鎖後資料篩選與提示正確 | 尚未完成 Android 端到端驗收 |
| QR 與相機允許／拒絕、沒有相機時的步驟 | 尚未確認 |
| 英文指引與畫面標籤、版本及帳號權限一致 | 待裝置驗收後校訂 |
| 刪帳、受阻角色交接與支援方式可依指引執行 | 尚未確認 |
| 帳密與必要存取資源只填 Console，未外洩 | 提交時核對 |

Google 要求審查存取持續可用、可重複且不受所在地限制，並以英文提供必要指引；需要 QR 等資源時也要讓審查者能存取。[官方登入資料要求](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en)
