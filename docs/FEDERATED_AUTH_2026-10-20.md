# Apple／Google Web 登入與註冊交接

日期：2026-10-20。此版是 Web 端工程與隔離回歸，不是已設定正式供應商、已通過真帳號驗收或原生 App 上架。電話不作登入方式；Meta 不實作，另行研究／討論。沒有讀取或變更 AWS、正式資料庫、舊 Downloads 憑證、Apple／Google 後台。

## 1. 目前可以交付與仍關閉的能力

- Google Web OIDC：authorization code、S256 PKCE、state、nonce、簽章與 issuer／audience／有效期／verified email／subject 驗證；待持有人提供合法 Web OAuth client、callback 與正式驗收後啟用。
- Apple Web：已準備官方 hybrid `code id_token`、`form_post`、signed `c_hash` 與 nonce 驗證，以及 server-side token exchange／ES256 client secret／AES-256-GCM refresh token 儲存／撤銷路徑。
- **Apple 整個 provider 預設關閉**：Apple 官方 discovery 未宣告 PKCE、`auth_time` 或強制最近登入能力。不能把新簽的 `iat` 當作最近本人驗證。未取得供應商可保證的 fresh-auth 契約與實證前，不開放 Apple-only 註冊，避免產生無法安全自行刪帳的帳號。`APPLE_OAUTH_FRESH_REAUTH_ENABLED` 只是營運核准 gate，不會創造供應商能力；即使打開，敏感流程仍須通過 signed `auth_time` 檢查。
- 缺設定時 `/api/auth/providers` 顯示 disabled，start 回 503，不假成功、不建立會員。原有 Email／密碼登入與註冊保持可用。

正式 Apple 與 Google callback 都尚未以持有人真實 client／Apple relay 帳號端到端驗收；本機合成結果不能取代這一步。

## 2. 資料模型與分階段部署

1. 先套 `20261020020000_add_roster_data_consent`，新增 `MemberDataConsent` 表。
2. 再套 `20261020030000_add_federated_auth`：原 `User.passwordHash` 改 nullable（沒有新增 User scalar）；新增 `FederatedIdentity`、`OAuthTransaction` 表。
3. 部署同版程式但保留 `FEDERATED_AUTH_ENABLED=false`，驗證原本密碼登入／註冊／個人檔案。
4. 持有人／Jerry 在 approved server-only secret/runtime 設定 Google client 與固定網站 origin；檢查 Web OAuth consent screen、測試／正式受眾與 callback 完全一致；隔離 staging 先驗收。
5. 測完成功／取消／拒絕／帳號碰撞／撤銷／刪帳，再開 Google。Apple 仍維持關閉直到上一節的供應商與 fresh-auth／撤銷完成條件都通過。

新的 relation 不會讓既有 User／Member 預設查詢選取不存在的新 scalar；舊密碼註冊不讀新 OAuth／consent 表。`auth-methods` 於 gate 關閉或新表缺失時，回相容的 `hasPassword`、空 `identities`、`available:false`。這不是可以任意倒序正式部署的保證；OAuth 開啟仍必須 DB-first，不使用 reset／seed。

`FederatedIdentity` 同時有 `(provider,subject)` 與 `(userId,provider)` unique。Email 僅為驗證後快照，不是帳號合併或授權識別。OAuth-only 的 passwordHash 真正為 null，不塞隨機假密碼。忘記密碼／舊 reset token 不可替 OAuth-only 帳號建立本機密碼。

## 3. 前端與 API 契約

| API | 契約 |
| --- | --- |
| GET `/api/auth/providers` | 無 DB 查詢，回 `{providers:[{id,name,enabled,reason?}]}`，不回 secret |
| POST `/api/auth/oauth/{provider}/start` | `{purpose:login/link/reauth/delete,password?,token?,oauthConsent?}`，回 `{authorizationUrl}`；需要可信同源 Origin |
| callback | 固定 `/api/auth/oauth/google/callback` GET；Apple 固定同形 `/apple/callback` form POST；不接受自訂 callback 或外部 returnTo |
| GET `/api/auth/oauth/complete` | 先完成 same-site Cookie／session 確認，再固定導向 `/home`、`/auth/complete`、`/profile` 或 `/account/delete` |
| GET `/api/auth/oauth/pending` | `{pending:true,provider,email,name?,hasInvite}` 或 pending false；不回原始 token／驗證碼／ID token |
| POST `/api/auth/oauth/register` | `{name,token?,organizationId?,privacyConsent:true,termsConsent:true,oauthConsent:true,...原選填}`；email 只取已驗證供應商資料，忽略客戶端 password／role；成功同原註冊 shape |
| GET `/api/me/auth-methods` | `{hasPassword,identities:[{provider,email,reauthAvailable,reauthReason?}],reauthenticated,reauthActions,available}` |
| POST `/api/me/sessions/revoke` | 本機密碼帳號仍 `{password}`；OAuth-only 用已完成的 5 分鐘 HttpOnly 一次性 proof，body 可 `{}`；成功盡量保留本裝置 |
| POST `/api/me/account-deletion` | 同上再驗證規則；角色／未來主辦活動仍可能 409，絕不假稱已提交；Apple 撤銷不可用／失敗回 503，不刪 User |

`link` start 必須已登入、`oauthConsent:true` 並以目前本機密碼或已連結的 fresh OAuth 重新驗證，不能只比對信箱。已被他人連結的 provider subject 409；同一帳號已連結另一同服務身分也不能自動取代。此版沒有 unlink／換綁 UI，不會在刪除最後登入方式後鎖死帳號。

新第三方身分若與既有 Email／會員資料相撞，固定提示先用原方式登入並到安全設定連結；不自動搬動會員或升權。新用戶仍須有效共同邀請 QR、隱私／條款及 OAuth 資料同意，於同一交易消耗邀請、建立中央 ACTIVE／NEEDS_ASSIGNMENT 的 MEMBER、登入帳號／provider link 與同意記錄。職稱／組織來源不授予角色。

invite 可在 start 傳入；server 當下確認、只存短期 DB state，不發給 Apple／Google 或 sessionStorage。註冊最後仍在原交易重新驗證有效期與額度。無 invite 的新登入可先完成 provider，再開有效邀請連結補註冊；pending 僅 10 分鐘，逾時重新開始。

10 分鐘是邏輯有效期，不是承諾資料已物理清除。完成 signup／login 後，transaction 連到該 User 以便刪帳 cascade，並清除 email／subject／姓名／refresh ciphertext／invite／verifier／nonce／browser hash；link／reauth 完成亦 scrub，只保留短期用途與 proof 所需欄位。每次開始 OAuth bounded 清除最多 25 筆「state 與 proof 都已過期」資料，不能取代無人使用時的日常清理。

## 4. 安全、再驗證與錯誤

- state 256-bit 隨機且 DB 只存 SHA-256；額外 HttpOnly browser secret 綁定。nonce 唯一、授權碼兌換前 CAS claim，callback 重播失敗。錯誤不帶 email、token、供應商原始 response 或 exception。
- Apple `form_post` 用 Secure／SameSite=None 的專用 browser cookie；轉回固定同站 GET 後，才用原 Lax application session 確認 link／reauth 的相同 user 與 sessionVersion。Cookie 被瀏覽器阻擋時 fail closed，不繞過綁定。
- Google PKCE 使用 S256；Apple 官方未宣告 PKCE，所以採 hybrid 的簽章 front ID token `c_hash` 比對授權碼，exchange 後 ID token 再驗證 nonce、subject、email 一致。不得把 unsigned Apple `user.email` 當證明；一次姓名只作可編輯顯示提示。
- 敏感再驗證需要新的 user-mediated OAuth 流程及 signed `auth_time`：必須距現在不超過 5 分鐘、不得早於流程開始 60 秒以上。Google 要求 max_age=0 與 essential auth_time；缺少／過舊一律失敗，不以 iat 替代，也不宣稱每個供應商必然要求再次輸密碼。
- proof 綁 user、sessionVersion、用途、5 分鐘期限與一次性 CAS；`delete` proof 不能拿去 link／sessions。UI 需按 `reauthActions`，不可只看 reauthenticated=true。
- 關閉／重設密碼、停權、刪帳、session version 變化仍阻擋使用。登出清除 pending／browser／reauth cookies。
- 既有密碼流程的錯誤格式與刪帳 actor 限流保留；OAuth start 的共享 IP 上限 1000／10 分鐘、每 browser 或 actor 10 次；註冊仍按 email 與 invite 限流。429 有 Retry-After，不自動重試破壞性操作。

固定錯誤 code 包括 PROVIDER_DISABLED、OAUTH_CANCELLED、OAUTH_EXPIRED、PROVIDER_TOKEN_INVALID、CODE_BINDING_INVALID、ACCOUNT_LINK_REQUIRED、IDENTITY_ALREADY_LINKED、PROVIDER_ALREADY_LINKED、ACCOUNT_UNAVAILABLE、PROVIDER_FRESH_AUTH_REQUIRED、PROVIDER_REAUTH_UNAVAILABLE、OAUTH_NOT_DEPLOYED、OAUTH_CONFLICT、OAUTH_FAILED。callback 只將 code 放固定登入頁 query。

## 5. Apple token、刪帳與營運限制

Apple refresh token 僅 server-side AES-256-GCM 加密保存，使用獨立 32-byte key；不存 access token、不回前端、不放 log。JWT client secret 由正確 Team／Key ID／p8 在 server 短效產生。Provider 與 token endpoint／JWKS URL 都固定，不接受客戶端提供的 URL。

刪帳先再驗證與角色／活動預檢；Apple revocation 回成功後才進原本刪帳交易。交易重查 user／passwordHash／sessionVersion 與 provider link 的 id／updatedAt，避免撤銷期間換綁漏掉。User 刪除 cascade 清除 provider links 與 OAuth states；既有共享紀錄／匿名 Member 的保留範圍不因本功能擴大刪除。

外部 Apple 撤銷與 DB 不能共用分散式原子交易：若撤銷後遇到 DB 衝突，可能需重新 Apple 授權再試，不能顯示完成。第三方撤銷失敗、金鑰遺失／輪替錯誤或服務缺設定一律 gate，不默默略過 Apple 撤銷。**真 Apple revoke 尚未驗收，不可勾已完成上架。**

Jerry／持有人仍需完成：正式 OAuth consent／domain／return URL；Apple private relay 寄件網域（如需寄信）；加密 key 安全備份與可恢復輪替方案；expired OAuthTransaction 的可信定期清理及保留期限；供應商撤銷／停用事件通知策略；原生 SDK／native auth 另立契約。此版不讀或要求把 p8、client secret、私鑰、帳密貼到 Git／聊天。

提供 `scripts/cleanup-oauth-transactions.mjs`：無參數／--help 不連線；已核准環境明確注入專用 OAUTH_CLEANUP_DATABASE_URL（不退回 ambient DATABASE_URL），指定 --environment 及完全相符的 --confirm-host／--confirm-database 後才連線。remote 只接受 sslmode=require 或 verify-full，拒絕 query host override；test 僅限本機可拋棄資料庫。--dry-run 只查每批最多 1000；真正刪除還需 --apply 與 --confirm-expired-oauth-state-cleanup 雙旗標。不印目標／帳密／原始錯誤、不自動設定正式排程。本次只驗證 help／純 parser 與隔離 service，沒有連正式 DB 執行。`MemberDataConsent` 為受限同意稽核，匿名 Member 保留時仍保留該記錄；公開政策須說明目的／保留範圍／期限，不能聲稱刪帳即清空所有同意歷史。

若 Amplify SSR runtime 無法取得主控台環境變數，目前會保持 disabled；須由 Jerry 設定 approved runtime secret 注入／擴充 secret loader，再部署驗收，不把 secret 編進 client bundle。既有 AUTH_SECRET 與 OAuth token encryption key 不混用。

## 6. 驗收範圍與官方來源

隔離測試使用 example.test、真 RSA/JWT/AES、真 Prisma＋記憶體 PGlite；provider exchange、Cookie、Email、儲存以受控 adapter，不連外部帳號、AWS／RDS。涵蓋 issuer／audience／nonce／簽章／驗證 email／c_hash／auth_time、state／callback／proof 重播、同信箱不綁定、invite／consent、ACTIVE 中央註冊、null password guards、停權、Apple gate／撤銷錯誤及缺表的舊登入／註冊相容。

1. [Google OpenID Connect：state、nonce、token claims 與 sub 識別](https://developers.google.com/identity/openid-connect/openid-connect)
2. [Google PKCE S256 說明](https://developers.google.com/identity/protocols/oauth2/native-app)
3. [Apple authorization：code／id_token、scope、form_post、state、nonce](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server.)
4. [Apple 公開 OIDC discovery：issuer／endpoints／支援 claims](https://appleid.apple.com/.well-known/openid-configuration)
5. [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)
6. [Apple 帳號刪除說明](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
7. [jose jwtVerify：簽章與 claims 驗證](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)

以上為 2026-10-20 查核的 primary sources；不是商店核准保證。Apple 文件部分完整技術內文需要 JavaScript，本次可讀官方 authorize／discovery 不足以保證 forced fresh authentication，故保持 gate，而非推測支援。
