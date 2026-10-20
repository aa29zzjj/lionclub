# 選用名冊比對與內部目錄（2026-10-20）

本次為程式與隔離測試完成紀錄，不表示正式資料已遷移、揭露授權已取得，或已具備商店送審條件。

## 三種不同的同意／授權

- 註冊隱私政策、使用條款不代替選用的名冊比對同意。
- 登入後到「我的資歷」自行勾選名冊比對，目的 `annual_roster_match`，版本 `2026-10-20`。沒有預先勾選，不同意仍能登入及手填資歷。
- 查看者願意比對本人資料，不等於名冊被列者同意向他人揭露。具名目錄另由營運者確認來源、揭露依據、受眾、最小欄位及保留／撤回安排後才可啟用；本版預設關閉，介面顯示「待營運者確認名冊揭露授權」。

## 比對及帶入的邊界

只使用登入會員的精確姓名與分會。來源沒有電話或 Email，不提供「三選二」，也不把電話當登入識別。不採暱稱、近似姓名、台／臺替換；只允許移除名稱尾端「獅子會」再做精確比對。

已分派會員一律使用實際 `organizationId` 的分會；自述名稱不覆寫既有歸屬。尚待分派會員只能以自述分會得到「待核對候選」，在分派完成前不能認領；沒有自述分會時不回退用中央收件分會替其比對。

分會必須唯一，直屬有效層級必須完整且無循環。同分會有其他同名有效會員、重複來源列、未知列載性質、跨直屬範圍資料或過量候選，均不猜測、不帶入。這不是本人身分驗證；同名帳號以外仍可能有未註冊同名者，須由本人及後續核實者查核。

帶入需再確認是本人紀錄。它只建立本人 `MemberExperience`：`under_review`、`only_me`，沒有 `verifiedAt`／核實者，不建立或連結 `User`，也不授予 `AdminRole`。

- 現任列載：以來源名冊年度作為該列的本年度任期，仍是待核實草稿。
- 歷任／榮譽列載：來源年度只是出版／列載年度，不能當作真實任期。表單不預填實際年份；本人必須另填並明確確認實際開始及最後任期起始年，不確定時請勿帶入，可另行手填已知資料。
- 原文職稱、列載性質、來源年度及頁次保留於草稿備註；只有與已知選項原文、層級唯一相符時才對應既有職務代碼，其餘保留原文。不冒充已核實或現有管理授權。
- 每任期年度仍為 7 月 1 日至隔年 6 月 30 日；多任期的結束值是最後一個任期起始年。

## API 契約

所有路徑只處理目前登入的 ACTIVE 本人，不接收目標會員 ID；回應 `Cache-Control: no-store`。寫入需可信同源 Origin，並於 Serializable transaction 重新確認本人狀態、同意與候選。

| 路徑 | 行為 |
| --- | --- |
| `GET /api/me/roster-consent` | 回覆 `available/purpose/version/accepted/acceptedAt` |
| `POST /api/me/roster-consent` | 同意必須 `{accepted:true,version:"2026-10-20"}`；撤回 `{accepted:false}`，移除本人此用途所有版本，不影響其他用途 |
| `GET /api/me/annual-appointment-suggestions` | 無同意不讀名冊，回覆 `consentRequired:true` 與空候選；已同意回覆 `matchStatus/candidatePending/canImport/sourceRosterYear/suggestions` |
| `POST /api/me/annual-appointment-suggestions` | 需 `appointmentId`、`confirmOwnRecord:true`；歷任另需 `actualStartYear/actualEndYear/confirmHistoricalYears:true` |

撤回立即停止後續新比對／帶入，不自動刪除先前已由本人確認的草稿；會員可各別編輯或刪除。重新同意後才能再取候選。衝突回 409，前端不自動重送；連線中斷先重新載入狀態。來源已認領不重複建立。

## 姓名目錄獨立 gate

`.env.example` 只提供註解，沒有啟用。`ROSTER_DIRECTORY_DISCLOSURE_VERSION` 必須由營運者在完成授權確認後，於 SSR runtime 明確設為 `2026-10-20`；其他值均視為關閉。

組織架構仍供有效會員瀏覽。姓名即使啟用，也只提供「已確認實際分會的會員」自己的分會及直屬祖先組織之本年度現任姓名／職稱／來源年度／列載性質。不擴及兄弟分會、其他區，待分派無姓名，沒有電話、Email、帳號 ID 或整冊下載端點；每節點與請求有數量上限。這是內部最小披露設計，不取代營運者取得合法揭露依據。

## 遷移及相容性

新增 `20261020020000_add_roster_data_consent`，只有獨立同意表、本人 FK 與複合唯一鍵，沒有替既有會員回填假同意，也沒有 Member scalar 欄位。與第三方登入另行新增的同意用途互不替代。

若新表未部署／欄位不存在，選用功能 503 `ROSTER_CONSENT_UNAVAILABLE`，不讀取或帶入名冊；部署恢復後可重試。此同意功能不使核心登入、個資與手填資歷依賴新表。缺名冊表時組織樹仍回純架構，具名部分顯示暫不可用。

本次不自動改寫舊版本已建立的資歷／可見性／任期。若先前帶入歷任列曾把出版年度當任期，需由本人或經核定資料修正流程另行確認，不在本 migration 猜測回填。重新同意不會替舊草稿補上核實。

## 驗證與尚待營運完成

- `node --import tsx --test tests/roster-policy.test.ts`：純 helper 的精確比對、同意先行、缺表／衝突、有效層級與披露 gate。
- `node --test tests/roster-consent-and-match.test.mjs`：真實 route＋Prisma＋隔離記憶體 PGlite SQL，測同意／撤回、待分派、歧義／跨範圍、來源年份、私有待核實草稿、不增帳號權限、缺表恢復及純架構降級。只用合成資料，不讀正式 DB／AWS。PGlite socket 的缺表錯誤會關閉連線，負向案例逐次重建測試連線。
- PGlite 單連線不能替代真 PostgreSQL 多連線的並行撤回／認領／重新分派測試；正式部署前仍需部署 migration 與受控整合驗收。
- 營運者尚須確認具名目錄揭露依據與保留／撤回流程；gate 預設 OFF，不宣稱完整名錄已上線。
