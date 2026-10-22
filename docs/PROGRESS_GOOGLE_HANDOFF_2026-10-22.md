# GitHub 差異與 Google 登入交接（2026-10-22）

本文件可放公開倉庫。不含具名會員名冊、電話、有效邀請 QR、帳密、OAuth client secret 或 AWS 存取金鑰。

## GitHub 對照

我們上一輪提交基線是 `b671ec572cc06287606da72e55ea3a10852867ec`。本輪開始與推送前唯讀核對，遠端 main 都是 `2882b8660abcf4f89e9dc512cb51eb0f2ef13a5d`；相較上次檢查的 `2882b86` 沒有新提交。

`b671ec5 → 2882b86` 共七個提交，最後淨差異九個檔案、增加 223 行：

| 內容 | 差異／影響 |
| --- | --- |
| OAuth providers | 加上 force-dynamic，避免建置時快取未配置狀態 |
| Amplify 設定排查 | 曾加診斷及 `.env.production` workaround，後續已撤回；不能當成 Google 正式登入完成證據 |
| EC2 備援 | 新增 Docker／Compose／nginx／SSH workflow 與部署文件，Next 改 standalone |
| 核心會員資料 | 此區間沒有 schema／migration、名冊、資歷審核或活動權限異動 |

## 本輪程式交付

- 所有 Google OAuth API 使用同一套 async runtime 設定；環境變數優先，明確 opt-in 才讀核准 Secrets Manager。Amplify 只帶非秘密白名單，不把 client secret／DB URL／AUTH key 寫進部署 artifact。
- 保留 state、nonce、PKCE、真實 JWT 簽章／claims 驗證、單次使用、session version、有效 QR、三項明確同意，以及禁止同 Email 自動合併／憑姓名授權。
- 登入設定失敗可手動重試；離頁後的延遲回覆不能把人強制導回 Google。註冊確認第三方狀態後才可送出；可取消未完成驗證、清除暫存能力並換帳號，不會刪會員。
- Google 普通登入與安全操作再驗證分開；後者預設關閉，不能用新 token 發出時間假裝近期本人驗證。Apple 維持未開放。
- 移除「刪除我的帳號」操作／客戶端。舊頁僅退役說明，舊 POST API 固定 410、零 DB／Session 依賴、不建立申請或清理工作；沒有刪除任何正式帳號。歷史已提交維護工作保留。
- 修復 Docker 必要 metadata 建置相依與私密檔排除；EC2 只綁 loopback，部署需兩個明確旗標、SSH 主機指紋、乾淨 main 與限定快轉。推 main 不等於已部署；本輪不設定旗標、不 SSH、不 migrate。

## 正式環境：仍待 Jerry／持有人

本輪唯讀 GET 正式 `/api/auth/providers`，Google／Apple 都 disabled。AWS 窄讀確認身分帳號正確，但讀指定 app secret 遭 AccessDeniedException、Amplify API 為 403；瀏覽器也沒有可沿用的 Console 分頁。這些結果不能證明憑證不存在，只能證明本輪未獲准讀取。未取得可讀的 EC2 設定或 SSH 連線，未檢查伺服器 `.env.docker`。

| Jerry 只需回覆的資料 | 請填 |
| --- | --- |
| 目前實際服務是 Amplify 還是 EC2？正式部署 SHA？ | 待填 |
| Google Web OAuth client 已建立、正式 callback 完全一致嗎？ | 完成／未完成（不填 secret） |
| Google 設定放 runtime env 還是核准 app secret？欄位已齊嗎？ | 位置與完成狀態（不填值） |
| 正確 SSR compute role 能讀該單一 secret，必要 KMS 權限已確認嗎？ | 完成／未完成；不用貼 access key |
| 既有 OAuth／consent migration 與程式版一致、備份已確認嗎？ | 完成／未完成與核對時間 |
| 部署後 providers、真人 Google 登入／QR 新註冊／舊帳號連結通過嗎？ | 通過／失敗項目（不貼 token、Cookie 或會員資料） |

精確設定、固定 callback、來源衝突與排障請見 [Google runtime 文件](GOOGLE_OAUTH_RUNTIME_2026-10-22.md)。部署保護請見 [EC2 部署文件](../EC2_DEPLOY.md)。

## 上架界線

依產品要求移除刪帳後，目前不符合建立帳號 App 的 Apple／Google Play 刪帳要求；metadata 與 checker 如實標記 blocked，沒有送審，不會擅自恢復功能。參見 [退役與政策交接](app-store/ACCOUNT_DELETION_REMOVED_2026-10-22.md)。

## 本輪驗證紀錄

- TypeScript 單元測試：223/223；MJS／隔離 SQL／合成 UI 時序測試：124/124，合計 347 項通過。
- `next build`（含型別／lint）：通過；`git diff --check`：通過。
- Google 新流程使用本機測試 RSA key 與真實 production jose 驗證，外部 token exchange／key 來源為合成 adapter；沒有真人 Google 帳號授權。
- 本機瀏覽器確認設定重查、失效 pending 提示、取消後回登入、一般會員個人頁無刪帳入口、舊頁純退役說明。
- 取消與 provider 回應競態已覆蓋：cancel 之後較晚的 callback 不能回寫已清除的 PII、完成登入或重播。
- `app-store:check --strict` 預期 exit 1：22/61 項存在／已填，39 項待補；刪帳移除為明確政策阻斷，不能把此結果說成上架驗收通過。
- Docker／workflow 靜態及受控命令測試通過；本機無 Docker，未執行容器建置或 SSH 部署。

隔離測試與本機畫面不等於正式 RDS、真實 Google 授權、Google JWKS 輪換、跨瀏覽器 Cookie、Docker／EC2 部署或原生真機驗收。正式 DB、IAM、Google console、會員名冊與對外邀請未被本輪更動。
