# Google Web 登入執行期設定與交接

日期：2026-10-22。此文件說明本輪程式／隔離驗收，不是正式 Google 帳號登入或 AWS 部署成功證明。電話不作登入方式；Apple 維持未開放。舊文件中自助刪帳或 OAuth `delete` purpose 的說明已不適用；本輪沒有恢復該功能。

## 1. 現況與已修正原因

截至本輪 root 的唯讀檢查，正式 `/api/auth/providers` 仍回 Apple／Google disabled。窄範圍 AWS 檢查的身分帳號符合目標，但讀取既有 `lionclub/app-secrets` 被 AccessDeniedException 拒絕，Amplify list 亦為 403。本輪沒有讀到 secret 內容、沒有修改 AWS／Google 後台或正式資料庫，不能斷言其中已有哪些 OAuth 值，也不能聲稱正式 Google 已完成。

程式原本的 `providerConfig()` 只看 `process.env`；既有 `getAppSecrets()` 又只提供 DB／AUTH。即使 Jerry 在 approved secret 補了 Google 欄位，SSR OAuth 流程也無法取得。本輪加入所有 OAuth API 共用的 async runtime resolver，保留純解析器供隔離測試。

AWS 官方說明，Amplify 建置環境變數不會預設提供給 Next SSR；把 secret 寫入 `.env.production`／部署 artifact 也不是安全解法。此版只把白名單的**非秘密** flag、origin、secret reference 與既有公開資產／寄件地址寫入 runtime env，真正 secret 由 SSR compute role 在執行時讀取。[Amplify SSR env](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html)、[SSR compute IAM role](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html)

## 2. 設定來源與優先順序

| 項目 | 行為 |
| --- | --- |
| 完整 server runtime env | 優先使用；不為完整 Google 設定再讀 AWS |
| `FEDERATED_AUTH_ENABLED=false` | 明確關閉，優先於 secret 裏的 true；OAuth 不讀 AWS |
| `OAUTH_RUNTIME_SECRETS_ENABLED` 未設或 false | 不做 OAuth Secrets Manager 外呼；預設未配置就 disabled |
| `OAUTH_RUNTIME_SECRETS_ENABLED=true` | 僅於缺值時讀已核准 `APP_SECRETS_NAME`，預設仍為既有 `lionclub/app-secrets` |
| DB／AUTH | 保留原環境優先及既有 approved secret fallback，不要求密碼登入先設定 OAuth |
| Apple | 不在此版 OAuth runtime secret 白名單；舊 Apple env flag 不能讓此版 API 開放 Apple |

Google runtime 白名單：`FEDERATED_AUTH_ENABLED`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`GOOGLE_OAUTH_FRESH_REAUTH_ENABLED`、`OAUTH_APP_ORIGIN`、`NEXT_PUBLIC_APP_URL`。DB／AUTH 永不進 OAuth 設定投影或公開回應。未知欄位忽略；非字串設定不啟用 OAuth，也不連帶破壞原本有效 DB／AUTH 設定。

可逐欄補缺，但不把 client A 的 ID 與 client B 的 secret／origin 悄悄混合：環境組合不完整而需借用 stored 時，已有 credential 值也須與 stored 同一已知 client 一致；兩來源指定不同 origin 亦 fail closed。完整環境 override 由操作者負責成套提供。固定 origin 不含路徑、帳密、query、fragment；production 僅 HTTPS，開發 HTTP 僅 loopback。沒有信任 forwarded Host 或 production localhost fallback。

讀取快取上限五分鐘、併發共用同一讀取；失敗不永久卡死 pending promise。錯誤只回固定 code／訊息，不輸出 secret 值、原始 AWS exception 或 client ID。`secrets-aws.ts` 使用 `server-only` 邊界，SDK 僅於執行期載入；client module 不得 import runtime credential adapter。

## 3. Jerry／持有人需要完成，勿貼秘密到聊天

1. 確認部署版本與兩個既有 OAuth／consent migration 都完成；此輪不執行 migration、reset 或 seed。保持 DB-first，再部署相容程式。
2. 由正確操作者確認 Google Cloud 的 Web OAuth client、consent screen／測試受眾、正式名稱與核准網域。固定 authorized redirect URI 為 `OAUTH_APP_ORIGIN + /api/auth/oauth/google/callback`，scheme／host／port／path 必須完全一致。
3. approved app secret JSON 補白名單欄位，值都用字串。請在核准的 secret 管理介面私下操作，不提供 secret value、完整 JSON、client secret 或存取金鑰給聊天／Git。
4. 只對正確 SSR compute role 授予該**單一核准 secret** 的 `secretsmanager:GetSecretValue`；若使用 customer-managed KMS key，另確認該 key 的解密權限／policy。不要給整個 Secrets Manager 的 wildcard 管理權限，也不要改用長期 AWS access key。[AWS GetSecretValue 與必要權限](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html)
5. 非秘密的 Amplify runtime 引用開啟 `OAUTH_RUNTIME_SECRETS_ENABLED=true`、正確 `APP_SECRETS_NAME` 與 `OAUTH_APP_ORIGIN`。若 `FEDERATED_AUTH_ENABLED` 留 false，它仍會明確關閉，不會被 secret true 覆蓋。
6. 部署後先看公開 providers 狀態，再由持有人自己走真人 Google 授權；本輪沒有代為同意、登入真人帳號或發起正式 start。測完新用戶、既有 linked 用戶、同信箱撞號、取消、過期、重播及不同瀏覽器，再回報結果。

示意 JSON 僅列鍵名，不在本文件提供值：`FEDERATED_AUTH_ENABLED`、`OAUTH_APP_ORIGIN`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`GOOGLE_OAUTH_FRESH_REAUTH_ENABLED`。網站 origin 與 client secret 不應散落在 build logs；不可把整個 `env` 或 secret response 印出來。

## 4. Google 最近本人驗證不是普通登入

Google 普通登入／新用戶 QR 註冊，以及既有本機密碼再驗證後連結 Google，都不需要開 fresh-auth gate。安全操作 `reauth` 與 OAuth-only 其他裝置登出仍需要可證明的最近本人驗證。

Google 官方 Security bundle 明示不支援 Google Account reauth requests；`auth_time` 描述的是使用者與 Google 的既有登入，不是剛剛授權本 App。取得額外 session-age claims 還須 App 已發布、驗證並在 Google Auth Platform Advanced Settings 啟用。`select_account` 只是選帳號，不能證明剛重新登入；不能把新 `iat` 或宣告一個旗標當作供應商能力。[Google Security bundle](https://developers.google.com/identity/siwg/security-bundle)、[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect)

因此 `GOOGLE_OAUTH_FRESH_REAUTH_ENABLED` 預設 false；普通 Google 登入不受影響。若未來取得適用供應商契約及端到端實證，才可核准開啟；程式仍要求 signed `auth_time` 不超過五分鐘、不得早於這次流程起點的容許窗口，缺值／過舊一律拒絕，不改用 iat。此版移除未獲官方保證的 max_age 行為，不宣稱開旗標即可強制最近登入。

## 5. API 與取消流程

- `/api/auth/providers` 保持 force-dynamic，不讀 DB；公開只列 id／name／enabled／reasonCode，不回 client ID／secret／原始錯誤。
- start 僅 `login`、`link`、`reauth`；`delete` 回 400，舊 delete state／proof 亦無效。固定 callback、state／nonce／S256、簽章／issuer／audience／verified email／provider+subject 及重播防護保留。
- pending／register／complete／auth-methods 都用同一 async resolver。callback 與同一次服務操作使用同一份設定 snapshot；錯誤導向固定 `/login?oauth_error=CODE`，不含 email／token。新用戶仍需共同 QR、privacy／terms／OAuth 同意；不自動授權角色、不因相同 Email 自動合併。
- `POST /api/auth/oauth/cancel` body `{}`：可信同源才可操作；清目前 browser 的未完成 OAuth state、nonce／verifier／invite／provider PII／proof 及三個 HttpOnly cookie。回 `{ok:true}`；不刪會員、登入帳號或已連結 identity。非缺表 DB 失敗回 503，不宣稱 server scrub 完成；Cookie 已清除防止意外繼續。可重新開始，不自動重送註冊。
- auth-methods 的 proof actions 只有 `link`／`sessions`。未啟用的 fresh 能力回 `reauthAvailable:false` 與固定原因；不提供刪帳 proof。

## 6. 排障與驗收界線

| 狀態／code | 下一步 |
| --- | --- |
| Google disabled／PROVIDER_NOT_CONFIGURED | 查 opt-in、明確 false override、固定 origin、完整同 client credential、值型別；不要把秘密寫進 build artifact |
| OAUTH_RUNTIME_UNAVAILABLE／503 | 請核准操作者檢查 SSR role／secret／KMS、來源衝突及 runtime 注入；公開 API 不洩漏細節 |
| OAUTH_NOT_DEPLOYED | 查兩個新表 migration 與程式版一致；不自動 migrate |
| Google redirect_uri_mismatch | 私下核對 authorized URI 與固定 origin，勿依 request Host 自動換 callback |
| ACCOUNT_LINK_REQUIRED | 用原登入方式登入，再到安全設定連結；不自動 merge |
| PROVIDER_REAUTH_UNAVAILABLE | 普通 Google 登入仍可；fresh 能力尚未核准，不是強迫改成本機假密碼 |
| PROVIDER_FRESH_AUTH_REQUIRED | 缺 signed recent auth_time，拒絕安全操作；不可降低成只看新 iat |

本輪可證明的是：純設定／白名單／來源衝突／快取重試測試，真 RSA／JWT 與隔離 Prisma＋PGlite 的流程回歸，以及沒有 secret 進公開 env artifact 的檢查。AWS 權限、Google console、真人登入與正式部署另需持有人回報；沒有這些證據就不能標「正式 Google 登入完成」。
