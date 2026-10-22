# 隱私揭露、帳號刪除與內容管理契約草案

2026-10-22 現況覆蓋：使用者要求移除自助刪帳；以下為歷史提案，不能當現行操作契約。舊 API 固定 410、舊頁只顯示退役說明，不受理或排隊。商店送審維持 blocked，見 [最新決策](ACCOUNT_DELETION_REMOVED_2026-10-22.md)。

版本：2026-10-13。這份文件是 Jerry／Hao 的實作契約草稿，以下路由尚不存在；不是已公告的隱私政策，也沒有承諾刪除天數。公開前需由服務法律實體確認資料用途、保留規則與聯絡方式。

## 隱私政策與商店宣告盤點

| 現有資料 | 程式證據／目前用途 | 上架前要確認 |
| --- | --- | --- |
| 姓名、Email、電話 | `Member`／`User`，會員識別、登入、聯絡及報名名單 | 誰可查看、Email 提供者及保留期 |
| 生日、會員編號、入會年月、分會與角色 | `Member`、`Organization`、`AdminRole` | 是否必要、可見範圍與歷史紀錄保留依據 |
| 頭像、個人介紹、專長／興趣、資歷 | S3 圖片、`Member`、`Tag`、`MemberExperience` | 使用者內容可見性、媒體刪除、審核及備份到期 |
| 好友關係、QR 中的會員 ID | `Friendship`，`qr-add` 建立關係；QR 圖片辨識在前端執行 | QR 不是私密憑證；封鎖尊重與識別碼用途 |
| 活動內容／封面、報名、站內通知 | `Event`、`EventRegistration`、通知模型 | 主辦者／授權幹部聯絡資料存取、保留及匿名化 |
| 帳號密碼雜湊、Session、重設 Token 雜湊 | `User`、`PasswordResetToken`、HttpOnly Cookie | 撤銷機制、稽核／服務日誌及備份的實際保留規則 |
| 相機與相簿 | 相機掃 QR；頭像／活動封面上傳 | 明確用途說明；不要宣告讀取整個相簿或通訊錄，除非實際加入這些功能 |

目前 package.json 未見廣告／分析追蹤 SDK；這不證明整個 AWS 服務沒有紀錄或第三方資料處理。Jerry 需核對 Amplify、RDS、S3、SES 的實際區域、存取權、CloudWatch／備份期限及後續 SDK，才能填正式 App Privacy／Data safety。不要將「未確認」寫成「不蒐集」。

公開 HTML `/privacy` 應載明：App 名稱、法律實體、隱私聯絡、資料與用途、提供／分享對象、權限使用、安全措施、資料保存與刪除、如何行使權利、版本日期。`/support` 需有真實客服聯絡；沒有信箱前勿造假。Google 要求公開可存取且非 PDF 的政策。[Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311)

## 帳號刪除：後端提案

Apple 要 App 內可發起整個帳號刪除，不能只停權或要求一般使用者先找客服；Google 要另有 App 外網頁可提出申請。可以安全重新驗證與明確確認。[Apple deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)、[Google deletion](https://support.google.com/googleplay/android-developer/answer/13327111)

提案入口：App「我的檔案 → 帳號設定 → 刪除帳號」與公開 `/account/delete`。登入／重新驗證留在 App 內，外部網頁也能完成申請，不要求重新安裝 App。

| 提案路由 | Request／Response | 權限與行為 |
| --- | --- | --- |
| `POST /api/me/account-deletion` | `{ confirmation: "DELETE_ACCOUNT", password: string }`；成功 `202 { requestId, status: "pending", requestedAt, estimatedCompletionAt: string \| null }` | 以目前 Session 確認本人、驗證密碼、CSRF／Origin 保護、限流與冪等；不接收任意 memberId；密碼不寫日誌 |
| `GET /api/me/account-deletion` | `200 { requestId, status, requestedAt, estimatedCompletionAt, completedAt }` 或 `404` | 本人查詢；只回所需狀態，不揭露其他帳號 |
| 外部忘記登入者驗證流程 | 專用用途、短效、一次性且雜湊保存的 Email 驗證碼／連結 | 防帳號枚舉、限流；不可直接複用重設密碼 Token 當刪除授權 |

Session 撤銷與受限狀態需有具體實作；若申請後立即登出，後續狀態透過驗證 Email／安全連結告知，不能靠已失效的 Session 查詢。完成後寄通知；日期由實際 worker／營運能力決定，未知時不顯示假期限。正式 API 回覆契約應在實作前統一。

現有 `session.ts` 是 30 天 JWT，沒有伺服器 Session 撤銷／版本欄位；`destroySession` 只清目前瀏覽器 Cookie，重設密碼也不撤銷其他裝置 Session。中央註冊接續版本已讓 `getCurrentMember` 檢查 User 綁定與 Member.status=ACTIVE，刪 User／停權後下一次會員 API 存取會被擋，但 Token 本身仍未被撤銷。Jerry 仍需加入 Session version／撤銷機制，並驗證改密碼及帳號刪除後另一台已登入裝置也失去存取權。

### Jerry 必須先決定的資料策略

- `User.member` 是 `onDelete: SetNull`；單刪 Member 會留下登入帳號。刪除工作需包含 User、Reset Token 與有效 Session 撤銷。
- `Event.createdBy` 是 `onDelete: Cascade`；直接刪 Member 可能連刪主辦活動、所有報名與通知。先確認依法／營運需保留的組織紀錄，必要時修改 schema 為可匿名化來源，避免損及其他會員。
- 好友、資歷、私有聯絡資料與個人內容應清除；保留紀錄需有明確理由、範圍與期限，不可只稱「永久停權」。
- S3 頭像／個人上傳媒體須按所有權刪除，含舊版本／衍生圖；共享活動圖片先定義處置。資料庫刪除不等於 S3 已刪除。
- Job 必須可重試、冪等；DB／S3 資料刪除未完成不能報 completed。資料已刪但 SES 通知失敗時，另記 `notification_pending` 並重試通知，不把完成刪除誤記為資料仍待刪。必要稽核紀錄不保存多餘個資；備份依既定週期到期並防止還原後再次出現已刪資料。

## 使用者內容、檢舉與封鎖：後端提案

會員照片／介紹與活動描述由使用者提供，需設計篩選、檢舉、封鎖及可聯絡的營運方。[Apple UGC](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)

| 提案路由 | 契約草案 | 需求 |
| --- | --- | --- |
| `POST /api/reports` | `{ targetType: "member" \| "event" \| "experience", targetId, reasonCode, details? }` → `201 { reportId, status: "received" }` | 本人能看到該內容才可檢舉；限流、去重、文字限制、避免讀取其他檢舉人的資訊 |
| `POST /api/members/[id]/block` | → `200 { blocked: true }` | 專用 Block 模型／狀態；雙向阻擋搜尋、加好友、QR、通知與受保護檔案接點，不以好友邀請拒絕取代封鎖 |
| `DELETE /api/members/[id]/block` | → `200 { blocked: false }` | 本人解除；不得自動恢復好友關係 |
| `GET /api/admin/reports` | 分頁、狀態與受權限範圍限制的列表 | 管理角色不可讀到範圍外的個資；營運方接件與處理 |
| `PATCH /api/admin/reports/[id]` | `{ status, action, note? }` | 稽核處理、遮蔽／下架／停權的具體措施與回應管道 |

現有 `Friendship.status=BLOCKED` 在邀請拒絕時使用，尚無既有好友的封鎖入口；`qr-add` 會把既有 BLOCKED 改成 ACCEPTED。正式封鎖實作需修正這點，且 request／search／member-detail／notifications 全部尊重同一規則。

Hao 介面需提供：會員／活動詳情的「檢舉」、會員的「封鎖／解除」、封鎖列表、成功狀態，以及有權限的處理工具。Jerry 提供狀態與權限 API；營運方確認內容規範、處理負責人與實際回應時限。

## 共同驗收

- 一般會員不能刪他人帳號、查他人的刪除／檢舉內容或越權審核。
- 封鎖後掃 QR／反方向邀請不會重新建立好友，好友資料與通知同步套用規則。
- 刪除不連帶毀損其他會員的活動／報名紀錄；資料庫、S3、Session 與申請狀態一致。
- 未登入的外部刪除入口可找到、可完成本人驗證；App 內可直接發起申請。
- 政策揭露、實際程式及商店 App Privacy／Data safety 三者一致。
