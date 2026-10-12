# Hao → Tom／Jerry 進版交接（2026-10-12）

整合來源：`codex/friend-profile-and-handoff`
進版分支：`main`
狀態：Hao 已完成檢閱並同意進版；本文件與本次功能一併推送 GitHub。

## 測試帳號

以下三組帳號提供 Tom 與 Jerry 進行好友、個人頁、活動及通知流程測試：

| 測試身分 | 帳號 | 密碼 |
| --- | --- | --- |
| Tom | `Tom@Lion.com` | `0204` |
| Hao | `Hao@Lion.com` | `0204` |
| Jerry | `Jerry@Lion.com` | `0204` |

三組帳號皆為測試用途；正式驗收結束後應更換密碼或停用，請勿使用於正式會員帳號。

## 已完成程式

- 好友個人頁：`/members/[id]`，只有本人或已接受好友可查看；好友清單與首頁頭像可進入。
- 會員資歷 CRUD：`GET/POST /api/me/experiences`、`PATCH/DELETE /api/me/experiences/[experienceId]`。
- 資歷可見性：好友頁不回傳 `only_me`；已核實資歷禁止會員直接修改或刪除。
- 活動通知：可選指定好友或整個分會；後端驗證好友關係與整會通知權限。
- 活動管理：活動建立者／授權幹部可編輯與刪除；報名達 capacity 後阻擋新報名。
- 幹部權限：`/admin/roles` 可授予／撤銷 `CLUB_OFFICER`、`CLUB_FINANCE`；職稱與系統權限仍分離。
- 大頭貼：完成 5 MB JPG／PNG／WebP 驗證、S3 presigned PUT 與資料庫 `photoUrl` 更新流程。
- 忘記密碼：完成申請頁、重設頁、一次性 30 分鐘 token、bcrypt 更新與 SES 寄信流程。

## Jerry 必須先做（部署前）

1. 執行 Prisma migration：`prisma/migrations/20261012150000_add_password_reset_token/migration.sql`。
2. 建立 S3 大頭貼 bucket，設定瀏覽器 PUT CORS、CloudFront 或公開讀取網址，並授予 Amplify compute role `s3:PutObject`（限 `avatars/*`）。
3. 設定環境變數：`AWS_REGION`、`AVATAR_BUCKET_NAME`、`AVATAR_PUBLIC_BASE_URL`。
4. 在 SES 驗證 `PASSWORD_RESET_FROM_EMAIL`；若帳號仍在 sandbox，需申請 production access 或驗證測試收件人。
5. 授予 Amplify compute role `ses:SendEmail`，並設定 `PASSWORD_RESET_FROM_EMAIL`、正確的 `NEXT_PUBLIC_APP_URL`。
6. 部署後由具 `CLUB_PRESIDENT`／區級角色帳號開啟 `/admin/roles`，指派實際幹部權限。

## 共同驗收

- Tom、Hao、Jerry 三帳號建立／接受好友後，確認好友清單可進入對方個人頁，非好友 API 應回 403。
- 新增、修改、刪除一筆待審核資歷，重新整理後資料仍存在；好友看不到 `only_me`。
- 建立有限名額活動，報滿後下一位應收到 409；建立者可調整名額但不得低於已報名人數。
- 通知指定好友時不得混入非好友；整個分會通知只有活動建立者或授權幹部可送。
- 上傳三種允許圖片格式；超過 5 MB 或其他格式必須被拒絕。
- 忘記密碼不得透露信箱是否存在；連結 30 分鐘到期、使用一次後失效，新密碼可登入。

## 尚未完成／Jerry 後續

- 好友推薦與搜尋排序：交接原項目 4，仍由 Jerry 負責。
- 自動化 unit／API／e2e 測試：交接原項目 9，仍由 Jerry 負責。
- 資歷審核／退回後台、稽核紀錄及正式 `organizationId` 對應仍待後續迭代。
- RDS 5432 不應長期開放 `0.0.0.0/0`；建議完成 VPC／Security Group 收斂並建立獨立測試資料庫。

## 本機驗證

- Prisma Client 6.19.3 已重新產生。
- `tsc --noEmit` 通過。
- `next build` 通過，共 34 個頁面／API 路由完成編譯。
- 未對正式 RDS 執行 migration，亦未呼叫正式 S3／SES；部署後仍須由 Jerry 依前述清單完成環境設定與共同驗收。
