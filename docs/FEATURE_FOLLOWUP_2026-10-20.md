# 10/20 GitHub／交接進度與需求對照

本輪以 GitHub `f066703` 為基線，已核對 10/20 交接 PDF。以下區分「程式／隔離測試」與「正式環境／外部核准」，不把附件中的操作待辦視為執行授權。未登入或修改 AWS，未連正式 DB，未授權任何正式帳號；私人名冊、電話、照片、邀請 QR 與憑證均不隨此文件發布。

## 九項需求

| 需求 | 本輪程式交付 | 正式待辦／限制 |
| --- | --- | --- |
| Apple／Google 登入 | Google Web OIDC、PKCE；Apple hybrid／nonce／c_hash 與撤銷路徑；登入、邀請後補資料、帳號連結與本人再驗證介面；不提供電話登入 | 預設 OFF。Google 待真 client／callback／再驗證驗收；Apple 整個 provider 待可證明的 fresh-auth 與撤銷驗收，不可僅填旗標就上線；Meta 尚未實作 |
| 名冊自動帶入 | 登入本人精確姓名＋已確認分會比對；獨立可撤回同意；來源紀錄確認後建私有待核實草稿 | 本批來源無電話／Email，不假稱電話已核對。待分派僅顯示候選，不認領；歧義不猜測。不建立他人帳號、合併身分或授權 |
| 職稱／歷任 | 創會長、創會會員、分會榮譽會長、榮譽副總監等穩定代碼；第一副／第二副簡稱；任職年度、現任自述與本年度已核實提示分開 | 歷任／榮譽列載年度不是實際任期；本人另填實際年，後續由有權者核實。創會人／創會會員、導師／導獅不擅自合併 |
| 組織與當年度幹部 | 接續現有複合區→區→專區→分區→分會組織樹；幹部欄位限必要姓名、職稱及來源年度 | 具名目錄預設 OFF，須先取得營運者對來源／受眾／揭露依據的核准；啟用也限已確認本人分會及直屬祖先，不回聯絡資料 |
| 活動發布層級 | 接續 main 已修復的有效、精確 scope 授權；補測低階不能向上、失效授權即停止；新 GMT 資歷角色不是活動發布權 | 當年度自述／名冊／已核實職務皆不直接產生 AdminRole；由已授權管理者手動設定有期限 grant。發布不等於限制觀看／報名 |
| 活動分類／Filter | 已有獅子會／個人活動與篩選，不重做；一般會員可發個人活動 | 無須新增所有活動逐筆事前審核；既有條款、檢舉、停權與活動管理仍適用 |
| 年度官方行事曆 | 接續區官網公開 JSON API，新增完整會籍年度選擇、查詢時間、重試；十分快取、日期／範圍／回應大小／逾時限制 | 唯讀、無自動報名、不寫 Event，不是背景推播或即時 WebSocket。來源異動最多受十分鐘快取影響，詳情以官網為準；持續使用與服務安排待區辦確認 |
| 直接任職審核階層 | 總監→秘書長→區內閣；精確 GMT review grant→直屬專區主席；專區→分區→分會長。共用 CABINET／GLT／GST 不再借 GMT 權力 | 不自審、普通角色不跳級，缺上級／scope 不明拒絕。保留須理由與稽核的 GLOBAL SUPER 例外，不新增或自授 SUPER |
| 個資／第三方同意 | 註冊隱私＋條款；OAuth 資料用途同意；名冊選用目的／版本／時間獨立，未預勾與可撤回；公開政策已更新 | 同意並不等於會籍核實、名冊向他人揭露或管理授權；正式保留期限、隱私責任及商店隱私標示尚須持有人核定 |

300A 為複合區，300A-1 為區；專區、分區、分會不可混用。年度自 7 月 1 日起算至翌年 6 月 30 日。

## 與交接 PDF 的差異

- PDF 已描述名冊建置、組織樹、隱私／條款、檢舉及唯讀日曆；本輪沿用並補界線，不重複匯入或改正式資料。
- PDF 所述正式 migration／部署／授權狀態只是交接回報；本輪沒有取得 RDS 或 Amplify 同版實證，不將其記為已直接驗收。
- 共用區內閣審專區主席已收斂為專用 GMT grant；既有正式授權需由持有人安排，不自動轉換。
- 目錄的被列者揭露授權與查看者的本人比對同意不同，新增獨立 owner gate，尚未核准前不顯示私人名冊姓名。
- 第三方登入屬新增 Web 工程，原生 App、商店後台、真機與審查未因此完成。

## 部署順序（Jerry／正式環境持有人）

1. 保留 `FEDERATED_AUTH_ENABLED=false`、不設定目錄披露 gate；先核對目標、備份及正式 migration 歷史。
2. DB-first 套新增 `20261020020000_add_roster_data_consent`、`20261020030000_add_federated_auth`。均為新 migration，不改既有已套用 migration，不 reset／seed。新增內容不回填假同意、帳號或角色。
3. 部署同版 API，先驗收舊 Email／密碼登入、註冊、Session、個資、手填資歷。缺新表時選用功能封鎖／降級，不讓核心流程依賴它。
4. staging 驗收 Google 成功／取消／碰撞／連結／state 重播／再驗證／刪帳，再決定正式啟用。Apple 保留關閉，直到供應商支援與真機／撤銷條件成立；不要用 `iat` 充當重新登入時間。
5. 核准名冊揭露範圍後才設定 `ROSTER_DIRECTORY_DISCLOSURE_VERSION`；授權幹部由另一位有效 GLOBAL SUPER 手動配置精確 scope 與有效期間，另行驗收。
6. 最後處理原生包、簽章、商店隱私／Data Safety、政策與真機驗收。無發布包，不提交商店。

可安全先發布此相容程式，不代表可先啟用依賴新表的功能。不要將 OAuth client secret、p8 或 token encryption key 放進 `NEXT_PUBLIC_*`、前端 bundle、Git、聊天或填寫表。

## 驗證與交接文件

使用合成 `example.test` 會員、受控 provider／Cookie／寄信 adapter、真 Prisma 與可拋棄 PGlite SQL；沒有正式連線或寄信。驗證含缺表降級、拒絕同信箱自動連結、邀請／同意、跨級權限、來源任期、唯讀日曆與錯誤處理。PGlite 單連線不是正式 PostgreSQL 多連線競態、真 provider callback 或真機驗收。

本輪最終結果：TypeScript 單元／子案例 207／207、JavaScript／隔離 SQL／模擬／維護 parser 99／99；`prisma validate`、`tsc --noEmit`、`git diff --check` 與 production build（71 個頁面）通過。另以同版 build＋隔離 API proxy 目視確認登入 provider 未設定時 disabled、原有登入、安全設定、名冊同意未預勾、創會長／第一副第二副選項、年度行事曆錯誤重試與目錄 gate 文案；未使用真 OAuth 帳號，也未透過 UI 新增或刪除正式資料。商店唯讀盤點為 25／63 項存在／已填，38 項仍缺；這不是合規分數或送審通過率。

- `docs/FEDERATED_AUTH_2026-10-20.md`：登入 API、安全、外部設定、短期狀態清理與官方參考。
- `docs/ROSTER_CONSENT_AND_MATCH_2026-10-20.md`：本人比對、任期與內部目錄範圍。
- `docs/DIRECT_REVIEW_POLICY_2026-10-20.md`：職位→審核者→scope 矩陣與手動配置。
- `docs/JERRY_REQUIRED_INPUTS_2026-10-20.md`：請 Jerry 回填的簡表。

## Meta 討論（未定案，不實作）

先請指定要支援 Facebook、Instagram 或其他具體帳號與使用情境，再確認當期官方 API、適用帳號類型、權限、App Review、個資／撤銷及商店要求，不能將「Meta 系列」視為一組可互換識別。不能把未驗證 email 當帳號合併證據，也不需要讀取好友／貼文／郵件。

本輪嘗試查閱 Meta 官方 Facebook Login／Limited Login／Instagram Login 文件時收到 429，未能完整確認當期條件，故僅列待研究，不宣稱已支援，介面也不顯示可用 Meta 登入。研究入口：https://developers.facebook.com/docs/facebook-login/ 。

官方日曆來源：https://www.300a1.org.tw/Activity/Calendar 。本輪僅對公開 API 做格式查核；沒有登入官網、散布私人名冊或寫入任何來源資料。
