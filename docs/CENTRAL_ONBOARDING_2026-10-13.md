# 中央註冊與正式分會分派交接（2026-10-13）

狀態：本機中央註冊版接續調整為 **僅透過有效邀請 QR 註冊**，尚未推送 `main`；本文件不表示正式資料庫已遷移或網站已部署。本次以 `ab36c86` 為基底，新註冊共同進 AI臺科大獅子會，之後依正式名單由授權管理者分派。沒有 30 天試用／自動停權機制，沒有改動 demo 或其他帳號密碼。

## 已實作

- 伺服器固定中央分會；邀請來源或任意 client organizationId 都不能指定實際加入的分會。
- 有效邀請 QR 帶入 token，完成註冊即 `ACTIVE`，核發 HttpOnly Session，可直接開始使用；一般 `/register` 沒有有效邀請時，不應直接建立帳號。
- QR 邀請只是平台註冊入口，不證明本人是正式獅子會會員，也不驗證其正式分會、入會年月或幹部資格。現場來賓可先使用平台，後續仍須正式名單核對。
- 平台啟用狀態與正式會籍確認分開：只有新註冊明確標 `NEEDS_ASSIGNMENT`；會員可選填原分會作為名單核對參考，不能用來取得權限。
- 後台 `/admin/member-assignment` 有搜尋、分頁、待分派／已確認篩選、分派依據與確認勾選、異動歷史；可原地確認 AI臺科大，也可改至其他有權管理的啟用分會。
- 改派同交易更新分會、版本與稽核紀錄。跨會停用來源分會未到期或未開始的 club scope 幹部角色，以及其從來源分會發出的邀請；不自動授予新分會權限。
- 保留 memberId、會員編號、入會年月、好友、資歷、已建立活動與既有報名。活動本身不會因主辦者改派而變更主辦分會。
- 舊 QR token 仍須合法、未過期、未停用、未超配額，來源組織須啟用；新帳號仍進中央會。註冊不提供手動邀請碼或讓使用者挑目的分會。
- 邀請頁提供 1／3／7／30 天效期，預設 3 天，建議活動前或當日產生。QR 到期只影響用它建立新帳號，不會停用已完成註冊的帳號；30 天邀請效期不是 30 天試用。
- 配額條件更新、會員編號查詢與建帳都在 Serializable transaction；衝突會有限重試，失敗 rollback 不消耗配額。
- 普通會員不能讀取 `/api/invites` 的邀請 token；角色授予與邀請建立也以 Serializable transaction 重驗會籍，避免改派完成後建立舊分會權限／邀請。
- 登入及忘記密碼支援新帳號大小寫 Email，保留 legacy exact 帳號優先；不明確的大小寫重複帳號不任意挑選。註冊／重設密碼拒絕超過 bcrypt 72-byte 的密碼，不更動既有密碼。
- `getCurrentMember` 現在檢查 `ACTIVE`、User 綁定與有效角色時間；JWT 伺服器撤銷／改密碼後全裝置失效仍是 App Store 接續待辦。

## 改派權限

分會會長、分區／區／複合區管理者須同時涵蓋來源與目標；只有 `SUPER_ADMIN` 可全域分派。非 SUPER 的空 scope 不被本次分派功能視為全域授權。財務、一般幹部、會員的審核資格不等於改派資格；職稱文字不等於系統角色。禁止自行改派本人、禁止把 PENDING／SUSPENDED 帳號當成已啟用會員分派。

demo 的正式資料庫角色未於本輪查讀或修改。如果 demo 只有 AI臺科大的會長 scope，就不能任意跨區；請 Jerry 確認由具全域／雙邊範圍權限的管理者執行，不要用 Email 硬編碼超級管理者，也不要重新 seed。

正式分會變更應走授權後台，保留版本核對、撤銷及異動紀錄；不要以直接 SQL 或整批搬動資料庫會員取代此流程。未來若有批次名單核對需求，先設計預覽差異、重複／不明身分處理、授權範圍與每筆稽核，再另外實作，不把自填分會當成自動分派依據。

既有部分管理 API 的舊 helper 仍支援非 SUPER 空 scope 作全域，與本次較嚴格分派規則不同；請 Jerry 盤點現有角色配置，另行收斂，不能把這份文件解讀為所有舊 API 權限都已統一。

## 資料庫／部署順序（Jerry）

1. 先確認 RDS 備份、唯一啟用的中央分會與實際 ID。不要搬動既有分會會員或重設帳號。
2. 用含本次 migration 的 checkout 執行 `npx prisma migrate deploy`。新增 migration：`20261013042000_central_onboarding_assignment`；只加欄位／索引／異動表。既有會員 default `ASSIGNED` 是沿用舊資料，不代表重新核驗正式獅子會身分；既有 PENDING 不自動開通。
3. 若中央分會名稱唯一為 AI臺科大獅子會，不必追加設定。多筆同名／不符名稱時，配置服務執行期 `ONBOARDING_ORGANIZATION_ID` 為正確 ID；缺少或歧義時回 503，不自行建立新會。
4. 確認執行期採有效 QR token 作註冊資格，不開放免邀請建帳或其他手動邀請方式。若沿用 `ONBOARDING_REQUIRE_INVITE` 設定，保持 `true` 或不設定；Amplify 的 SSR runtime 配置由 Jerry 驗證，不能只核對建置環境。
5. 資料庫遷移成功後再部署程式；更新 Prisma Client 由安裝流程處理。未先遷移可能讓原有 Member 查詢因新欄位不存在而失敗。本輪沒有對正式 RDS 執行任何命令。
6. 確認 `NEXT_PUBLIC_APP_URL` 正式 Origin；新註冊與分派 POST 檢查 Origin。以 browser 同源 API 操作；未來原生登入須另外設計，不能用缺 Origin 的 curl 測試判定功能故障。
7. 以受控測試帳號驗收有效 QR、無 token／過期／滿額拒絕、1／3／7／30 天效期與預設 3 天、立即使用、一般會員 403、雙邊範圍／跨區權限、同分會核對、不同分會改派、其他裝置的最新分會與舊角色撤銷。確認 QR 到期後既有帳號仍可使用；手冊於此後才可作正式操作版。

Migration 為 additive：可先遷移後保留舊程式暫用。不應刪除 migration 表或重跑 seed；需要回復程式時正常 revert，保留新增稽核表與資料，再由 Jerry 決定後續處置。

## API 摘要

| API | 契約 |
| --- | --- |
| GET /api/onboarding | 中央 organization、requiresInvite、mode=central；失配 503 |
| POST /api/auth/register | 姓名、Email、密碼與有效 QR token；可選生日／電話／原分會／簡介；成功即登入並回 NEEDS_ASSIGNMENT |
| POST /api/invites | 授權幹部產生註冊 QR；validDays 可選 1／3／7／30 天、預設 3 天；效期限制新註冊，不限制已建帳者使用期限 |
| GET /api/admin/member-assignments | status、q、page；每頁 30 筆、範圍內 ACTIVE 會員、不列操作者本人；回可管理啟用分會及分頁 |
| GET /api/admin/member-assignments/[memberId] | 範圍內會員、有效角色、最近 100 筆異動歷史 |
| POST /api/admin/member-assignments/[memberId] | organizationId、expectedOrganizationId、expectedAssignmentVersion、必填 reason；版本衝突 409，不盲目重送 |
| GET/PATCH /api/me | 回核對狀態與自填原分會；PATCH 不開放本人修改組織、狀態或 assignment version |

所有會員聯絡資料及分派歷史僅透過授權後台；公開 onboarding 只含中央組織資訊。一般好友／活動資料 API 沒有加入私有分派歷史。

中央暫存不是純顯示標籤：新註冊者在資料庫的所屬組織確實是 AI臺科大，所以整會通知收件群會包含這些中央會員。現有活動列表本來就對啟用會員提供跨分會活動；好友個人頁仍要求已加好友。請營運方按實際範圍發布內容，不把中央會通知當成正式單一分會私密通知。

## 晚宴／大量來賓的建議流程

活動前或當日由一位授權幹部產生短效邀請 QR，投影或提供給現場受邀者；來賓自行掃描、填最少必要資料即可使用，不需要每位會長逐一現場核准。入口開通後維持 `NEEDS_ASSIGNMENT`，活動後由具有來源與目標管理權的負責人依正式名單核對，再從後台分派。

人力不足時可先安排一名邀請／操作協助者、一名會後名單核對負責人。這是營運建議，不是新增的批次匯入或自動會籍驗證功能。有效 QR 可被轉傳，短效只能縮短新註冊入口開放期間，不能當成身分證明；不要提供只有正式會籍才可享有的權限或私密資料給未核對者。

## 驗證範圍

中央註冊原有流程已檢查 Prisma validate／generate、migration schema diff。此次 QR-only／短效邀請調整已通過後端 56 項、合成體驗／代理 13 項 Node 測試，以及 TypeScript／production build。公開合成頁面已驗證無邀請時不提供註冊表單、有效 QR 直接進表單並立即開通；先前也已驗證分派同步與資歷核實。

邀請頁另修正初始列表與生成 QR 的並行顯示風險：生成中的 QR 使用自己的效期資料，列表未載入不能產生；讀取失敗有明確錯誤與重試。新 QR 預設 3 天，不會追溯縮短舊有效 QR 的期限；既有邀請仍依各自期限／停用／額度驗證。

`npm run test:onboarding` 使用真實服務程式＋可 rollback 的 fake Prisma，不連正式 DB；不能取代 PostgreSQL 真實併發、RDS migration 與 AWS／SES 驗收。免登入合成體驗入口只測試模擬狀態，不能當正式測試資料。

## 使用與上架接續

操作教學見 [分會長與會員手冊](CLUB_LEADER_AND_MEMBER_GUIDE_2026-10-13.md)。公開政策、帳號刪除、封鎖／檢舉、原生封裝與開發者資料仍待接續，本機尚未製作 IPA 或提交 App Store。中央註冊不等於這些送審要求已完成。
