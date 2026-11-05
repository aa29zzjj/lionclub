# Google Play 公司帳號準備

2026-11-05，台灣時間。使用者回覆「尚未建立或不確定」，其後明確指定帳號選擇與註冊「交 Jerry」。目前沒有已核實的 Google Play 發行帳號；Safari 已到 Google 帳號選擇頁，未替使用者登入、建立帳號、接受發行協議或付款。Android 工程準備與帳號註冊分別進行。

## 請先確認的資料

| 資料 | 目前掌握與待確認內容 |
| --- | --- |
| 發行擁有人 Google 帳號 | 由公司持續管理的帳號，持有人直接在 Safari 登入；不傳送密碼或驗證碼 |
| 帳號類型 | 建議依公司實際營運採 Organization，尚未在 Google 選定或提交 |
| 公司法定名稱 | Apple 團隊顯示 Prepmate AI inc.；需與 D-U-N-S 及 Google Payments 的法律資料核對，不能只用顯示名稱代填 |
| D-U-N-S | 尚未提供或核實；透過正式公司資料確認，不編造號碼 |
| 註冊國家與公司地址 | 尚未提供，不從個人帳號或產品網站推定 |
| 公司電話與網站 | 須能驗證，與公司資料一致；產品網站是 lionclubsmembership.com，是否用作公司驗證網站仍需確認 |
| 對 Google 的聯絡資料 | 真正負責的聯絡人、可收 OTP 的電話與信箱，由持有人確認 |
| 對外開發者聯絡資料 | 顯示名稱、公開 Email 與電話依實際 Play 表單填寫；不能拿私人資料直接公開 |

Google 要求組織帳號提供公司與 D-U-N-S 資料，部分開發者聯絡資訊會對外顯示。[Google 帳號資料說明](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en)

## 註冊順序

1. 先以預定的公司 Google 帳號查看 Play Console，確認是否已有可用發行帳號。
2. 如確實未有，依真實法律資料選擇帳號類型，核對公司與 Payments 資料、網站及驗證安排。
3. 最終接受 Developer Distribution Agreement 前，展示該協議及發行者資訊，取得操作時確認。
4. Google Play 目前一次性註冊費為 US$25；到實際付款頁才確認金額與付款授權，尚未付費或輸入支付資料。
5. 完成 Google 要求的身分、公司、網站、電話與 Email 驗證後，再建立 LionClubs App 與確認 package name。

新個人帳號可能適用 12 位測試者連續加入 14 天的 production access 條件；實際門檻依帳號類型及 Console 顯示，不能為避開驗證而錯選類型。[註冊步驟及費用](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)、[個人帳號測試規則](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

## 這邊可繼續的工程工作

工具授權已取得，可安裝官方 Android Studio 與 SDK、使用相容 JDK 編譯 Debug APK，核對 Android manifest、介面、登入與資料處理。發行 upload key、Play App Signing、Firebase 專案或服務權限不因安裝建置工具而自動建立。Android 候選與問卷草案位於 `docs/app-store/GOOGLE_PLAY_PREPARATION.zh-Hant.json`，驗收旗標維持實證才更新。
