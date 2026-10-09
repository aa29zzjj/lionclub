# 會員／幹部資歷功能交接

更新日期：2026-10-09
前端負責：角色 B
狀態：前端展示版已完成，等待 Jerry 後端 API

## 本次更新內容

- 新增 `/profile/experience` 會員／幹部資歷頁。
- 個人檔案與首頁新增所屬複合區、區、專區、分區及獅齡資訊。
- 可新增、編輯、刪除以下資歷：
  - 加入會籍
  - 擔任職務
  - 榮譽身分
  - 顧問委任
  - 其他職務
- 支援國際總會、複合區、區、專區、分區、分會及基金會／特殊組織等層級。
- 本人新增或修改的資歷會顯示為「待審核」。
- 幹部職稱只代表資歷，不會自動取得後台管理權限。
- 任職組織可依區別選擇正式分會，也保留「官方名單找不到時手動輸入」功能。
- 官方分會名單已於 2026-10-09 核對並匯入：
  - 300A-1：96 間，來源：https://www.300a1.org.tw/branches/links
  - 300A-2：114 間，來源：https://www.lions300a2.org/index/branch/index.html
  - 300A-3：62 間，來源：https://lions300a3.org.tw/sites/765f2581-ae3f-4ab4-b35b-d6104109a171/organization-presidents
  - 300A-5：81 間，來源：https://300a-5.org.tw/index.php/2627chapter-president-side

公開測試站：
https://lionclub-member-demo-20261009.cerbeurs.chatgpt.site

## 目前資料狀態

- 所有會員、好友、活動與資歷仍是前端 mock data。
- 新增、修改、刪除只存在 React 記憶體；重新整理頁面後會回復預設資料。
- 分會資料目前以正式名稱比對，尚未有後端穩定 ID。
- 300A 四個區已具備分會名單，但專區／分區與分會的完整隸屬關係尚未建檔。
- 300B、300C、300D、300E 的分會名單尚未匯入。

## Jerry 串接前需要確認

### 1. 驗證方式

建議 Next.js 與 API 使用同網域 HttpOnly Cookie Session。若後端決定使用 JWT，請確認 token 儲存位置、更新方式與過期處理；前端不建議把長效 token 存在 localStorage。

### 2. 組織資料需使用穩定 ID

API 回傳時請同時提供 `organizationId` 與顯示名稱。不要只以中文名稱作為唯一鍵，因為分會可能改名、停會或重啟。

建議組織資料至少包含：

```ts
type Organization = {
  id: string;
  level: "international" | "md" | "district" | "region" | "zone" | "club" | "foundation";
  code?: string;
  name: string;
  parentId?: string;
  districtCode?: string;
  isActive: boolean;
  validFrom?: string;
  validTo?: string;
};
```

### 3. 資歷資料契約

目前前端欄位位於 `src/lib/experience-data.ts`。後端建議使用下列結構：

```ts
type MemberExperiencePayload = {
  kind: "membership" | "position" | "honorary" | "advisor" | "other";
  level: "international" | "md" | "district" | "region" | "zone" | "club" | "foundation";
  positionCode: string;
  organizationId?: string;
  organizationName: string;
  organizationIsUnlisted?: boolean;
  multipleDistrictCode?: string;
  districtCode?: string;
  startYear: number;
  endYear?: number;
  datePrecision: "month" | "lions-year" | "approximate";
  isCurrent: boolean;
  visibility: "public" | "members" | "only-me";
  note?: string;
};
```

`verificationStatus`、審核人、審核時間及退回原因應由後端控制，前端提交時不能自行指定為 `verified`。

### 4. 建議 API

實際命名可由 Jerry 調整，但希望能涵蓋以下能力：

```text
GET    /api/me
GET    /api/me/experiences
POST   /api/me/experiences
PATCH  /api/me/experiences/:experienceId
DELETE /api/me/experiences/:experienceId

GET    /api/organizations?level=club&districtCode=300A-1
GET    /api/positions?level=club&kind=position
```

後台審核另建管理端 API，會員端只能檢視自己的審核結果。

### 5. 權限規則

- 「會長」、「秘書」、「資訊／網站管理」等職稱不等於系統角色。
- 管理權限應由獨立的 role／permission 資料控制。
- 會員只能修改自己的待審核或被退回資料；已核實資料是否可修改，需要產品端與 Jerry 共同確認。
- 刪除已核實資歷建議改為提出刪除申請或保留稽核紀錄，不要直接實體刪除。

## 待補事項

- [ ] Jerry 確認 API 網址、路由與 Cookie Session／JWT 方案。
- [ ] 建立會員、組織、職位、資歷、審核及權限資料表。
- [ ] 用後端 `organizationId` 取代目前以名稱比對的方式。
- [ ] 補齊 300A 專區／分區與分會隸屬關係。
- [ ] 補齊 300B、300C、300D、300E 分會名單。
- [ ] 建立幹部審核、退回、修改與稽核紀錄流程。
- [ ] 串接照片／證明文件上傳（若產品決定需要）。
- [ ] 串接正式登入、會員資料及好友／活動／通知 API。
- [ ] 補 API loading、空資料、401、403、404、409、422、500 等狀態處理。
- [ ] 補單元測試、API 整合測試與行動裝置驗收。
- [ ] 確認獅齡計算基準；目前前端以「當年－入會年」計算。
- [ ] 建立官方名單定期更新與資料來源紀錄機制。

## 驗證紀錄

- `next build` 已通過。
- 已測試 A1 下拉選單共 96 間分會。
- 已測試切換 A1／A2／A3／A5 後名單會跟著更新。
- 已測試從官方清單選擇分會並儲存，不會誤標為「組織待核」。
- 已測試手動輸入未收錄組織，會標示「組織待核」。
