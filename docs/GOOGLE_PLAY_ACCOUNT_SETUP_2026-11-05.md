# Google Play 公司帳號準備

2026-11-06 更新，台灣時間。使用者最新指示「繼續 google 商店，由我這邊全權處理」，Google Play 帳號與後續商店準備改由使用者這邊負責，取代 11/05 的「交 Jerry」分工。已由使用者完成公司 Google 帳號登入及開啟兩步驟驗證，並明確確認以這個公司帳號建立「機構／公司或企業」帳號；Google 提示建立後不能更換所屬 Google 帳號。

公開開發者名稱暫填 `Prepmate AI`，網站為 `https://prepmateai.com/`，機構規模因尚未取得人數，使用表單提供的「不知道」。D-U-N-S 已查核返回公司資料，並由使用者親自確認 Google 付款資料中的公司資訊。公開電話／Email 由使用者改填並完成該步驟，Google 私人聯絡資料亦由使用者直接填寫及驗證，不將私人資料或驗證碼抄入本文件。

個人經驗欄位僅陳述本次 LionClubs 已有的開發及建置事實。發布計畫依目前工作範圍填 1 款 App，營利計畫使用「還不知道」，屬 Google 可後續修改的規畫資訊。目前已到最終條款頁：要求由公司代表接受兩份協議、確認成年與代表權，並支付一次性 US$25；Google 提示身分驗證失敗時不退註冊費。已交使用者親自確認及處理付款，尚未核實付款或開發者帳號註冊完成。

11/05 的已交付交接文件保留當時狀態；本文件與 Google Play 專用 metadata 記錄後續分工更新。分工改變不代表發行帳號、公司法律資料或付款已確認。

## 請先確認的資料

| 資料 | 目前掌握與待確認內容 |
| --- | --- |
| 發行擁有人 Google 帳號 | 由公司持續管理的帳號，持有人直接在 Safari 登入；不傳送密碼或驗證碼 |
| 帳號類型 | 使用者已明確選擇 Organization／公司或企業；帳號註冊尚未完成 |
| 公司法定名稱 | Google D-U-N-S 查核返回 `PrepMate AI Inc.`；使用者已確認資料正確，證明文件仍待提交及 Google 核驗 |
| D-U-N-S | `149887529`，先從 Apple 公開發行者資料查得，再於 Google 成功取得匹配公司；不是最終開發者驗證通過 |
| 註冊國家與公司地址 | Google 返回美國加州 Chino Hills；使用者已親自確認付款資料中的法定名稱及地址 |
| 公司電話與網站 | 機構欄位依公開公司資料填入公司電話及 prepmateai.com；發布前仍須驗證網站擁有權 |
| 對 Google 的聯絡資料 | 已由使用者直接填寫及完成該步驟；不將私人聯絡資料抄入 repo |
| 對外開發者聯絡資料 | 使用者已自行改填新的公開電話／Email 並完成公開設定檔步驟；不從 Google 安全設定抄私人電話公開 |

Google 要求組織帳號提供公司與 D-U-N-S 資料，部分開發者聯絡資訊會對外顯示。[Google 帳號資料說明](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en)

本次查得編碼的公開來源：[Apple 上的公司發行者資料](https://apps.apple.com/cz/app/foodservai-rewards/id6809349847)。Google 查核結果與使用者確認才是本次繼續註冊的依據；不把網路搜尋片段當成公司證明文件。

## 註冊順序

1. 先以預定的公司 Google 帳號查看 Play Console，確認是否已有可用發行帳號。
2. 如確實未有，依真實法律資料選擇帳號類型，核對公司與 Payments 資料、網站及驗證安排。
3. 最終接受 Developer Distribution Agreement 前，展示該協議及發行者資訊，取得操作時確認。
4. Google Play 目前一次性註冊費為 US$25；到實際付款頁才確認金額與付款授權，尚未付費或輸入支付資料。
5. 完成 Google 要求的身分、公司、網站、電話與 Email 驗證後，再建立 LionClubs App 與確認 package name。

新個人帳號可能適用 12 位測試者連續加入 14 天的 production access 條件；實際門檻依帳號類型及 Console 顯示，不能為避開驗證而錯選類型。[註冊步驟及費用](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)、[個人帳號測試規則](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

## 這邊可繼續的工程工作

工具授權已取得，可安裝官方 Android Studio 與 SDK、使用相容 JDK 編譯 Debug APK，核對 Android manifest、介面、登入與資料處理。發行 upload key、Play App Signing、Firebase 專案或服務權限不因安裝建置工具而自動建立。Android 候選與問卷草案位於 `docs/app-store/GOOGLE_PLAY_PREPARATION.zh-Hant.json`，驗收旗標維持實證才更新。
