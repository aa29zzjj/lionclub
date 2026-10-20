# 直接審核階層與系統角色界線

日期：2026-10-20；基線 `f066703`。以下是本平台本輪核定規則，不宣稱為全球獅子會通用的法定審查制度。本輪不執行正式授權、不寫正式資料庫、不自動搬移或補授任何角色；部署、正式資料核對與授權配置仍需責任人執行。

## 1. 核心審核鏈

箭頭代表「左側的有效系統角色可核實右側職務」，不是資料職稱自動授權，也不是上層可一路越級核實所有下屬。

| 審核者的系統角色 | 可核實職務 | 必須符合的 scope |
| --- | --- | --- |
| `DISTRICT_GOVERNOR` 總監 | `dist_secretary` 秘書長 | 同一 district |
| `DISTRICT_SECRETARY` 秘書長 | 區內閣幕僚及 `dist_gmt_coordinator`／`dist_glt_coordinator`／`dist_gst_coordinator` | 同一 district |
| **`DISTRICT_GMT_COORDINATOR` GMT 專用審核角色** | `region_chair` 專區主席 | 專區在資料庫中的**直接父 district** |
| `REGION_ADMIN` 專區授權管理者 | `zone_chair` 分區主席 | 分區的**直接父 region** |
| `ZONE_ADMIN` 分區授權管理者 | `club_president` 會長、`club_founder_president` 創會長 | 分會的**直接父 zone** |

因此為「總監 → 秘書長 → 區內閣」及「GMT → 專區主席 → 分區主席 → 分會會長」。總監不能因為較高階就跳過秘書長核實一般區內閣；GMT 不能直接核實分區主席或分會會長；專區授權者不能跳過分區核實會長。

本輪明確取消 Jerry 前版將 `DISTRICT_CABINET`（GMT／GLT／GST 共用）及 `DISTRICT_GOVERNOR`／`DISTRICT_ADMIN` 疊加為專區主席審核者的做法。**只有新增且明確授予的 GMT 專用角色可走這條普通審核路徑**；舊 CABINET 不能視為 GMT，GLT／GST 也不能借用 GMT 角色。已有「GMT 協調長」自填職稱或已核實資歷，不會自動取得這個 AdminRole。

### 其餘職務的明確邊界

- 會籍、一般分會職務、分會榮譽資歷及導獅／導師，維持同會有效幹部核對，不因此授予官方發布或其他角色；自審仍一律拒絕。
- 一般分區幕僚／顧問維持直屬專區授權者核對；一般專區幕僚／顧問維持直屬區既有指定角色核對。本輪不把 GMT 的專區主席授權擴大至其他職務，也不推定未明定的新幕僚審核權。
- 總監／副總監及榮譽總監／榮譽副總監維持既有直接複合區規則。國際、複合區、基金會／特殊或未知職務若不在普通矩陣，不能猜測授權。
- 完整唯一矩陣在 [experience-review.ts](../src/lib/experience-review.ts)；GET 待審名單與 POST 最終審核共用相同判斷，不能只靠前端隱藏按鈕。

## 2. 一般審核與 SUPER 例外

一般審核必須同時符合：非本人、會員 ACTIVE／未刪除、職務 kind／code／level 一致、任職組織唯一可解析、組織與祖先有效、直接 scope 正確、AdminRole 有效期間包含現在。資料缺層、錯 scope、過期／未生效角色不能靠向上搜尋任意祖先來補通。

有效 `SUPER_ADMIN` 必須是 `scopeType=GLOBAL`、`scopeId=null`。其例外審核仍不得自審，必須提供至少 2 字、最多 1000 字的具體理由／佐證來源，與資歷更新一起寫入 `ExperienceReviewAudit`；稽核失敗整筆核實回滾。審核有 `expectedUpdatedAt`／條件更新，內容或授權同時更新回 409，不能盲目重送。

通過資歷審核只更新核實狀態、核實者／時間與稽核紀錄；**不建立 AdminRole，不變更正式會員分會，不建立登入帳號，也不把年度名冊當登入身分授權**。

安全設計依最小權限、預設拒絕、每次請求驗權及正反測試，而不是相信職稱文字。這些是技術原則，審核業務鏈本身以本平台核定為準。[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

## 3. 角色配置：只手動，不自動授權

`/admin/roles` 保留原分會四角色配置；新增的 district 資歷專用角色只有**有效 GLOBAL SUPER**可手動配置：

- `DISTRICT_GOVERNOR`
- `DISTRICT_SECRETARY`
- `DISTRICT_CABINET`
- `DISTRICT_GMT_COORDINATOR`

不提供授予 `SUPER_ADMIN`、`DISTRICT_ADMIN`、`REGION_ADMIN` 或 `ZONE_ADMIN` 的新入口。District review-only 角色不加入會員異動／邀請／角色管理／官方活動的行政角色名單；擁有其他獨立角色者，仍按該獨立角色判斷，不是 review-only 角色附帶授權。

配置條件：

1. 授權組織必須是有效且精確的 district，目標為其有效直接階層內的 ACTIVE 會員，非操作本人。
2. 有效至必填，必須在未來且最長 366 日，不猜任期、不自動續期；`validFrom` 為操作當下，保留 `grantedById`。
3. 同一角色／scope 已有效或待生效時回 409；前端列出到期日期並要求具名確認。
4. POST／DELETE 要求可信同源；交易內重新確認操作人、角色／scope、目標狀態。撤銷也重新驗權，不能從此撤銷自己或 GLOBAL SUPER。
5. 已移到其他範圍或停用、但仍留有此 scope 舊角色者，配置頁只保留供核對撤銷的紀錄，不讓其出現在新增授權選項；不額外回傳其跨範圍聯絡資料。

舊 CABINET 不批次轉成 GMT，也不依名冊／Email／姓名／已核實職務補授。Jerry 需核對現有人員、正式 scope ID 與任期，再由另一位已有效授權的管理人手動操作；若正式環境沒有有效 GLOBAL SUPER，本入口不會自行建立或引導繞過。

現有 `AdminRole` 已用字串角色、scope 與有效期保存，這一項**不需要新增 schema／migration**。本輪沒有執行任何正式角色配置。角色配置保留 `grantedById`／時間／期限；不把它宣稱成另外新增了不可變的角色授權稽核表。

## 4. 官方活動不得向上越級

資歷核實與官方活動發布是不同權限：

| 既有有效行政角色 | 可代表的官方主辦層級上限 |
| --- | --- |
| 分會行政角色 | CLUB；不能向上發 ZONE／REGION／DISTRICT |
| `ZONE_ADMIN` | 自己 scope 內的 ZONE／CLUB；不能發 REGION／DISTRICT |
| `REGION_ADMIN` | 自己 scope 內的 REGION／ZONE／CLUB；不能發 DISTRICT |
| `DISTRICT_ADMIN`／上層既有行政角色 | 依既有明確 scope 與實際主辦組織判斷，不以職稱文字判斷 |
| 總監／秘書長／CABINET／新 GMT review-only 角色 | 單憑此角色不能發布官方活動 |

主辦 organization.level 必須與活動 scope 對齊，建立／修改交易內每次重驗；沒有角色的官方原作者也不能以所有權繞過撤權。個人活動政策及全平台觀看／報名政策不變。[event-scope.ts](../src/lib/event-scope.ts)

## 5. 職稱與歷任顯示

保留資料庫既有 code，不以顯示詞相近合併歷史紀錄：

| 既有 code | 顯示 |
| --- | --- |
| `club_founder_president` | 創會長（首屆會長） |
| `club_charter_member` | 創會會員，與「創會人」分開 |
| `club_founder` | 創會人 |
| `club_honor_president` | 分會榮譽會長，保留榮譽性質，不當現任會長 |
| `dist_honor_vdg` | 榮譽副總監，不當現任副總監 |
| `club_vp1`／`club_vp2` | 第一副／第二副；不是模糊的「一副／二副」 |
| `club_mentor`／`club_guiding_lion` | 導師／導獅，各自保留，不互相改寫 |

Lions 官方將 Mentoring 與 Guiding Lion 分成不同資源／計畫，不能僅憑中文近義就合併代碼或名冊身分。[Mentoring Program](https://www.lionsclubs.org/en/resources-for-members/resource-center/mentoring-program)、[Guiding Lion Program](https://www.lionsclubs.org/en/resources-for-members/resource-center/guiding-lion-program)

已核實且年度確定為過去的職務，顯示「歷任職務（已核實）」並保留完整獅子年度；即使舊資料勾了 `isCurrent`，也不當本年度現任。顯示詞與縮寫共用 [experience-data.ts](../src/lib/experience-data.ts)，未知 code 仍保留原始 fallback，沒有偷偷改 DB 紀錄。

## 6. 本機隔離驗證與未完成

本輪測試使用合成資料、in-memory PGlite 及本機暫存 socket；不載入正式 `.env`、AWS 或舊憑證，不代表正式站／真人角色已驗收。

```sh
node --import tsx --test tests/direct-role-policy.test.ts tests/experience-review.test.ts tests/profile-capabilities.test.ts tests/event-scope.test.ts
node --test tests/experience-review-integration.test.mjs tests/role-configuration.test.mjs
```

實際正反測例涵蓋 GMT 與 CABINET／GLT／GST 分離、總監／秘書長直接鏈、錯 scope、過期／未生效、不得自審、SUPER 理由與稽核回滾、版本衝突、只授有限期 review-only 角色、撤權後拒絕、Origin guard、禁止自授／授 SUPER、移出範圍仍可核對撤銷，以及官方活動禁止向上發布。

待主代理整合確認：全專案 build／全測、前端真機與正式部署；Jerry 核實正式人員／組織階層／任期並手動授權。本文件與合成測試不能當正式授權已存在的證明。
