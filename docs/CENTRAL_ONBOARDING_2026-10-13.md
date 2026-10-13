# 中央註冊與正式分會分派交接（2026-10-13）

狀態：本機已實作；本文件不表示正式資料庫已遷移或網站已部署。本次以 `ab36c86` 為基底，新註冊共同進 AI臺科大獅子會，保留共同邀請 QR／PIN，之後依正式名單由授權管理者分派。沒有 30 天試用／自動停權機制，沒有改動 demo 或其他帳號密碼。

## 已實作

- 伺服器固定中央分會；邀請來源或任意 client organizationId 都不能指定實際加入的分會。
- 有效共同邀請完成註冊即 `ACTIVE`，核發 HttpOnly Session，可直接開始使用。
- 平台啟用狀態與正式會籍確認分開：只有新註冊明確標 `NEEDS_ASSIGNMENT`；會員可選填原分會作為名單核對參考，不能用來取得權限。
- 後台 `/admin/member-assignment` 有搜尋、分頁、待分派／已確認篩選、分派依據與確認勾選、異動歷史；可原地確認 AI臺科大，也可改至其他有權管理的啟用分會。
- 改派同交易更新分會、版本與稽核紀錄。跨會停用來源分會未到期或未開始的 club scope 幹部角色，以及其從來源分會發出的邀請；不自動授予新分會權限。
- 保留 memberId、會員編號、入會年月、好友、資歷、已建立活動與既有報名。活動本身不會因主辦者改派而變更主辦分會。
- 舊 QR token 仍須合法、未過期、未停用、未超配額，來源組織須啟用；新帳號仍進中央會。手動 PIN 預設核對中央會，不讓使用者挑目的分會。
- 配額條件更新、會員編號查詢與建帳都在 Serializable transaction；衝突會有限重試，失敗 rollback 不消耗配額。
- 普通會員不能讀取 `/api/invites` 的 PIN／token；角色授予與邀請建立也以 Serializable transaction 重驗會籍，避免改派完成後建立舊分會權限／邀請。
- 登入及忘記密碼支援新帳號大小寫 Email，保留 legacy exact 帳號優先；不明確的大小寫重複帳號不任意挑選。註冊／重設密碼拒絕超過 bcrypt 72-byte 的密碼，不更動既有密碼。
- `getCurrentMember` 現在檢查 `ACTIVE`、User 綁定與有效角色時間；JWT 伺服器撤銷／改密碼後全裝置失效仍是 App Store 接續待辦。

## 改派權限

分會會長、分區／區／複合區管理者須同時涵蓋來源與目標；只有 `SUPER_ADMIN` 可全域分派。非 SUPER 的空 scope 不被本次分派功能視為全域授權。財務、一般幹部、會員的審核資格不等於改派資格；職稱文字不等於系統角色。禁止自行改派本人、禁止把 PENDING／SUSPENDED 帳號當成已啟用會員分派。

demo 的正式資料庫角色未於本輪查讀或修改。如果 demo 只有 AI臺科大的會長 scope，就不能任意跨區；請 Jerry 確認由具全域／雙邊範圍權限的管理者執行，不要用 Email 硬編碼超級管理者，也不要重新 seed。

既有部分管理 API 的舊 helper 仍支援非 SUPER 空 scope 作全域，與本次較嚴格分派規則不同；請 Jerry 盤點現有角色配置，另行收斂，不能把這份文件解讀為所有舊 API 權限都已統一。

## 資料庫／部署順序（Jerry）

1. 先確認 RDS 備份、唯一啟用的中央分會與實際 ID。不要搬動既有分會會員或重設帳號。
2. 用含本次 migration 的 checkout 執行 `npx prisma migrate deploy`。新增 migration：`20261013042000_central_onboarding_assignment`；只加欄位／索引／異動表。既有會員 default `ASSIGNED` 是沿用舊資料，不代表重新核驗正式獅子會身分；既有 PENDING 不自動開通。
3. 若中央分會名稱唯一為 AI臺科大獅子會，不必追加設定。多筆同名／不符名稱時，配置服務執行期 `ONBOARDING_ORGANIZATION_ID` 為正確 ID；缺少或歧義時回 503，不自行建立新會。
4. 保持 `ONBOARDING_REQUIRE_INVITE=true` 或不設定。Hao 已確定保留共同邀請，本輪不啟用免邀請註冊。此變數需在 SSR 執行期有效，不是只寫在建置環境；Amplify 的 runtime 配置由 Jerry 驗證。
5. 資料庫遷移成功後再部署程式；更新 Prisma Client 由安裝流程處理。未先遷移可能讓原有 Member 查詢因新欄位不存在而失敗。本輪沒有對正式 RDS 執行任何命令。
6. 確認 `NEXT_PUBLIC_APP_URL` 正式 Origin；新註冊與分派 POST 檢查 Origin。以 browser 同源 API 操作；未來原生登入須另外設計，不能用缺 Origin 的 curl 測試判定功能故障。
7. 以受控測試帳號驗收有效 QR／PIN、過期／滿額拒絕、立即使用、一般會員 403、雙邊範圍／跨區權限、同分會核對、不同分會改派、其他裝置的最新分會與舊角色撤銷。手冊於此後才可作正式操作版。

Migration 為 additive：可先遷移後保留舊程式暫用。不應刪除 migration 表或重跑 seed；需要回復程式時正常 revert，保留新增稽核表與資料，再由 Jerry 決定後續處置。

## API 摘要

| API | 契約 |
| --- | --- |
| GET /api/onboarding | 中央 organization、requiresInvite、mode=central；失配 503 |
| POST /api/auth/register | 姓名、Email、密碼；token 或中央 PIN；可選生日／電話／原分會／簡介；成功即登入並回 NEEDS_ASSIGNMENT |
| GET /api/admin/member-assignments | status、q、page；每頁 30 筆、範圍內 ACTIVE 會員、不列操作者本人；回可管理啟用分會及分頁 |
| GET /api/admin/member-assignments/[memberId] | 範圍內會員、有效角色、最近 100 筆異動歷史 |
| POST /api/admin/member-assignments/[memberId] | organizationId、expectedOrganizationId、expectedAssignmentVersion、必填 reason；版本衝突 409，不盲目重送 |
| GET/PATCH /api/me | 回核對狀態與自填原分會；PATCH 不開放本人修改組織、狀態或 assignment version |

所有會員聯絡資料及分派歷史僅透過授權後台；公開 onboarding 只含中央組織資訊。一般好友／活動資料 API 沒有加入私有分派歷史。

中央暫存不是純顯示標籤：新註冊者在資料庫的所屬組織確實是 AI臺科大，所以整會通知收件群會包含這些中央會員。現有活動列表本來就對啟用會員提供跨分會活動；好友個人頁仍要求已加好友。請營運方按實際範圍發布內容，不把中央會通知當成正式單一分會私密通知。

## 驗證範圍

Prisma validate／generate、migration schema diff、TypeScript、production build、Node 自動測試與合成資料手機畫面流程已檢查。`npm run test:onboarding` 使用真實服務程式＋可 rollback 的 fake Prisma，不連正式 DB；不能取代 PostgreSQL 真實併發、RDS migration 與 AWS／SES 驗收。預覽 `tmp/ui-preview.mjs` 被忽略且不部署，不可當正式測試資料。

## 使用與上架接續

操作教學見 [分會長與會員手冊](CLUB_LEADER_AND_MEMBER_GUIDE_2026-10-13.md)。公開政策、帳號刪除、封鎖／檢舉、原生封裝與開發者資料仍待接續，本機尚未製作 IPA 或提交 App Store。中央註冊不等於這些送審要求已完成。
