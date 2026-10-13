# Hao → Jerry：QR-only 晚宴加入與分會分派交接

日期：2026-10-13｜發布目標：main（Hao 已授權）

程式來源：`cc3d2eb`（中央註冊、migration、分派）＋`6eb0f17`（QR-only、短效邀請、雙角色合成體驗）。GitHub 進版不等於正式站部署成功；本輪未連線正式 RDS、執行 migration、變更 AWS 或修改正式帳號。正式環境狀態須由 Jerry 確認。

Hao 已確認：migration 尚未完成、main 自動部署已暫停。這是使用者提供的環境狀態，本輪未登入 AWS 查證；推送不會由本任務恢復部署。Jerry 接手時請再核對，完成 migration 後才恢復部署。

## 1. 本次決策與已完成功能

晚宴人多、人手不足，因此先讓來賓掃共同邀請 QR、自行註冊、立即使用。新帳號統一暫存 AI臺科大，正式分會於會後依名單或各分會長確認結果，由授權管理者分派。

- 註冊只接受有效 QR token；沒有 token、只填 PIN、失效／過期／滿額邀請均不能建帳。PIN 欄位保留於舊資料結構，不再回傳或作為註冊授權。
- 新帳號為 `ACTIVE`＋`MEMBER`＋`NEEDS_ASSIGNMENT`，建立 HttpOnly Session。QR 是平台邀請，不代表正式獅子會會籍、入會年月或幹部資格已核實。
- 新邀請效期預設 3 天，介面可選 1／3／7／30 天；一張 QR 可供多人註冊。效期只擋新註冊，既有帳號不會因此停用，沒有 30 天試用／自動停權。舊有效 QR 保留原效期，不追溯縮短。
- 邀請頁可複製 QR 連結；斷線有重試，生成 QR 的效期不會誤取舊列表資料。
- 分派頁支援搜尋、分頁、狀態篩選、原因、明確確認、版本衝突 409 與異動歷史。本人不能自行改派；一般會員／財務／普通幹部不能因職稱取得分派資格。
- 來源與目標都須在管理範圍內；只有 `SUPER_ADMIN` 全域。跨會會停用本人原會的 club 幹部授權及本人原會邀請，不自動授予新會角色。
- 會員 ID、會員編號、入會年月、資歷、好友、活動與報名保留；既有會員不整批搬會，舊 `PENDING` 不自動開通。

「各分會長提供核對結果」目前是協作分工，不是新增的正式分會申請／會長批准 API。一般會長沒有中央與目標雙邊 scope 時，仍須由上層／全域管理者操作分派，不得直接 SQL 搬會員。

## 2. Jerry 部署前先做：最高優先

倉庫沒有可查驗的 Amplify／GitHub migration 流程；`postinstall` 只有 `prisma generate`，`build` 只有 `next build`。不要假設 main 推送會自動遷移 RDS。若 Amplify 自動部署 main，必須先完成 migration，或由 Jerry 安排暫停自動部署／維護切換，避免新版 Member 查詢讀不到新欄位。

1. 確認 RDS 備份及正確環境；保留現有帳號與密碼，不重跑 seed、不重建 DB。
2. 在含本次 migration 的 checkout，使用 Jerry 的安全環境設定執行：

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

3. 必須看到 `20261013042000_central_onboarding_assignment` 已套用：新增 Member 的核對狀態、版本、自填原分會及異動表／索引。舊資料 default `ASSIGNED` 是相容值，不代表重新核驗正式會籍；舊 `PENDING` 維持待審。
4. 確認唯一啟用的 AI臺科大分會。歧義時設定 SSR runtime `ONBOARDING_ORGANIZATION_ID` 為正確 ID；這個設定不會從目前只載入 DB／Session 的 Secrets Manager AppSecrets 自動取得。中央分會未設定／歧義會 503，不自行建立新分會。
5. 前後端同版部署：`GET /api/onboarding` 必須回 `requiresInvite: true`、`inviteMethod: "qr"`、`mode: "central"`。兩個舊邀請旗標已退役，設定 false 也不能開放無 QR 註冊。
6. 確認 `NEXT_PUBLIC_APP_URL` 是正式網站 Origin。註冊及分派 POST 檢查 Origin；不能以缺 Origin 的 curl 判斷註冊故障。驗收瀏覽器 Cookie 與跨裝置最新資料。
7. migration 成功後再部署、確認 Amplify 成功、執行下一頁驗收；不要僅憑 build 成功就宣告正式站可用。

回復時採正常 commit revert／重新部署，不覆寫 Git 歷史；保留 additive schema 與異動紀錄。回復舊版可能重新開啟舊註冊行為，需先評估維護窗口與邀請政策，不能刪表或以 migrate reset 處理。

## 3. 驗收清單與證據邊界

本機已通過後端 56 項、合成體驗／代理 13 項測試及 TypeScript／production build。公開合成 UI 已驗證 QR-only 註冊立即開通、缺邀請不提供表單、會員管理頁拒絕、分派同步及資歷核實。真實 PostgreSQL 併發、AWS／RDS／SES／S3 尚未驗收。

```bash
npm run test:onboarding
npm run test:demo
npm run build
```

| 正式環境驗收 | 預期結果 |
| --- | --- |
| 有效中央／其他分會 QR | 都加入中央 AI、立即 ACTIVE、一般會員權限、待分派 |
| 缺 token／只有 PIN／失效或滿額 QR | 不建帳、不消耗配額；舊開放旗標 false 無法繞過 |
| 新 1／3／7／30 天邀請及預設值 | 正確效期、QR 連結正式網域；過期只擋新註冊 |
| 舊會員／舊 PENDING／舊有效 QR | 原資料不搬會、不改密碼、不自動開通；有效 QR 原期限相容 |
| 一般會員讀後台與邀請清單 | 403，不回 PIN、token、管理聯絡名單或分派歷史 |
| 分派來源與目標權限 | 兩邊均須授權；本人／非 ACTIVE／越權不得改派 |
| 同會確認、跨會變更、過期版本 | 狀態與歷史一致；衝突 409，重載後重新確認 |
| 原會角色／本人原會邀請 | 跨會後停用；新會不自動授權，獨立區級角色另核對 |
| 資料與其他裝置 | 重新載入反映新會；ID、好友、資歷、活動與報名不被改寫 |

雙角色免登入連結僅供合成體驗，不是可用於晚宴收真資料的正式入口。共用記憶體資料可重設；任何人註冊或重設會影響其他測試者。臨時隧道、Mac 與前端須持續運行，網址無永久／上線保證；詳見 GitHub 的測試指南。

## 4. Jerry／Hao 接續事項與文件索引

Jerry 優先確認 migration、中央分會、實際角色與部署驗收。舊管理 helper 仍有非 SUPER 的空 scope 視為全域的相容行為；角色管理 GET 也尚缺完整 validFrom 過濾，未生效角色可能提前取得名單。新分派 helper 已較嚴格，不能把本次當成所有舊管理 API 已統一收斂。

晚宴前指定一名「QR／操作協助者」及一名「會後名單核對負責人」。活動前／當日產生短效 QR，現場只協助註冊；會後透過授權後台逐筆核對。中央暫存是真實組織歸屬，整會通知會包含這些新來賓，不得當作正式單一分會私密通知。

後續共同待辦：Email 驗證／速率限制、真正名單批次匯入（須差異預覽、授權與每筆紀錄）、完整會長確認流程、舊角色 scope 盤點、伺服器 Session 全裝置撤銷、完整帳號刪除、檢舉／封鎖。新註冊狀態檢查與 User 綁定已補，但不等於 JWT 伺服器撤銷已完成。

App Store／Android 仍是準備階段；正式開發者資料、原生架構、簽章／實機驗收、隱私與支援頁、審查專用帳號續做。本輪沒有 IPA、TestFlight 或商店提交。正式測試帳密請由 Jerry 核對並透過安全管道提供，本文件不複製帳密或附真正註冊 QR。

- [中央註冊技術契約與部署細節](CENTRAL_ONBOARDING_2026-10-13.md)
- [會長／會員操作手冊](CLUB_LEADER_AND_MEMBER_GUIDE_2026-10-13.md)
- [合成雙角色測試指南](DEMO_TEST_GUIDE_2026-10-13.md)
- [本次進版紀錄](RELEASE_QR_ONLY_2026-10-13.md)
- [App Store 接續資料](app-store/README.md)

舊 `RELEASE_2026-10-13.md` 及舊 Hao → Jerry 交接記錄是 `ab36c86` 的歷史版，其中「沒有新增 migration」不適用本次。
