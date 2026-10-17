# 原生垂直試作：測試計畫與驗收門檻

核對日期：2026-10-17；程式基線：`main` 的 `5d704d1`。這是測試規格與最小方案建議，**不是已完成原生工程、已通過真機或可送審的聲明**。

本文件第一階段為程式／官方文件核對；第二階段另建立 [mobile-client-spike](../../mobile-client-spike/README.md) 合成 React contract/UI 與本地 bundle，不是 iOS／Android 工程。未安裝套件、呼叫正式 API、修改驗證規則或讀取 AWS／簽章／私人名冊。以下矩陣全部尚未執行；合成 unit tests、本地 bundle、Web 或隔離後端測試均不能填成原生通過。

## 1. 目前能證明的邊界

| 程式證據 | 現行行為 | 原生試作必須補證明 |
| --- | --- | --- |
| [session.ts](../../src/lib/session.ts)、[auth-session.ts](../../src/lib/auth-session.ts) | `lionclub_session` 為 30 天 JWT Cookie；HttpOnly、production Secure、SameSite=Lax、path `/`，未設定 Domain；每次檢查 User 綁定與 sessionVersion | 所選原生通道如何接收、保存、送出與清除 Cookie；不能假定 WebView 與原生 HTTP 共用 Cookie jar |
| [browser-origin.ts](../../src/lib/browser-origin.ts) | mutation 必須提供 Origin，且完全等於設定的網站 origin；沒有 Origin 也拒絕 | 原生登入契約仍待 Jerry 設計；不能直接豁免此 Web 防護 |
| [登入](../../src/app/api/auth/login/route.ts)、[前端登入](../../src/app/login/page.tsx) | POST JSON 後設 Cookie，回覆 `ok/memberId`，未回覆可供客戶端保存的 JWT；前端使用相對 `/api/*` | bundled 客戶端需明確 API base 與單一 transport，不能照搬相對路徑 |
| [會員 API](../../src/app/api/me/route.ts)、[current-member.ts](../../src/lib/current-member.ts) | 未登入／已失效回 401；有效者回目前會員資料與有效管理角色 | 重開、恢復前景時重新確認，不將快取資料當有效登入或角色授權 |
| [登出](../../src/app/api/auth/logout/route.ts)、[其他裝置登出](../../src/app/api/me/sessions/revoke/route.ts) | 一般登出清目前 Cookie；撤銷其他裝置另有密碼確認與版本更新，且可能要求本機也重新登入 | 原生 Cookie／憑證須同步清除；不能宣稱普通登出已撤銷所有裝置 |
| [QR 掃描](../../src/components/FriendQrScanner.tsx)、[QR 格式](../../src/lib/friend-qr.ts) | `html5-qrcode` 開相機並解析圖片，已有拒絕／重試／選圖介面；會員 QR 是識別資料，不是登入憑證 | 真機權限、選圖、相機停止／恢復與 API 錯誤；邀請註冊 QR 不等於會員 QR |
| [next.config.js](../../next.config.js)、[package.json](../../package.json) | 仍為 Next.js 動態網站；沒有 Capacitor 依賴 | 尚無原生 client、transport、可安裝產物或簽章證據 |

舊 [API 草稿](PRIVACY_AND_ACCOUNT_API_DRAFT.md) 的 2026-10-13 提案不是現行契約；以本次程式證據為準。本文件補充 [原生架構](NATIVE_ARCHITECTURE.md)，不替代 [發行輸入](RELEASE_INPUTS_2026-10-14.md) 或商店政策驗收。

## 2. 為何不能只改網址或直接宣稱遠端殼已完成

須區分「同源」與「同站」，也須區分下列三種部署：

| 部署／通道 | 與現有驗證的關係 | 判定 |
| --- | --- | --- |
| WebView 載入與 API 完全同源的遠端 HTTPS 網站 | Cookie／Origin **不會只因為是 WebView 就必然失敗**；若實際請求 Origin 與設定吻合，可能沿用 Web Session | 仍需測持久化、導航、相機與離線；不能推論已適合正式發行 |
| bundled 本地頁面，以 WebView `fetch` 呼叫遠端 API | 本地頁面與 API 不同源；相對 `/api/*` 會指向本地服務，不會自動連正式後端。改絕對網址後仍有 Origin、CORS、Cookie 等不同關卡 | 目前沒有可直接沿用的完整跨來源登入契約 |
| bundled 本地頁面，透過原生 HTTP adapter 呼叫 API | 與瀏覽器 fetch 的行為不同；但伺服器端 Origin 檢查仍會執行，原生／WebView Cookie jar 也不保證一致 | 原生 transport 與後端安全契約須一起試作，不能只打開插件 |

Capacitor v8 的預設本地來源為 iOS `capacitor://localhost`、Android `https://localhost`；實際測試仍要記錄產物的設定。官方將 `server.url` 定位為 live reload，並標示不供 production 使用；`allowNavigation` 或 cleartext 也不是正式解法。因此推薦 bundled client，而不是把 production `server.url` 指向網站。這是工程建議，不是「WebView 必然被 Apple 拒審」的結論。[Capacitor config](https://capacitorjs.com/docs/config)、[Apple 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)

本地 WebView fetch 的 Cookie／來源問題不能靠單一設定解決：

- `credentials: 'include'` 不會推翻 SameSite。Lax 的跨站例外主要針對安全方法的頂層導覽；本地頁面對遠端 `/api/me` 的 fetch 不是這種導覽。[IETF 6265bis SameSite 草案](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.6.7.1)
- 跨源 JSON 請求還要核對預檢與 CORS；帶 credentials 時不能用 `Access-Control-Allow-Origin: *`。CORS 允許讀取回應也不代表伺服器 mutation 的 Origin 檢查已通過。[WHATWG Fetch](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials)
- 本 repo 未提供上述原生跨來源允許契約；實際可能先遇到 CORS／預檢而看不到回應，或請求抵達後被 Origin guard 回 403，不能把所有失敗混稱為「密碼錯誤」。原生層自行填入網站 Origin 也不是 App 身分驗證，不作為正式方案。
- Capacitor 的原生 HTTP patch 預設未啟用；Cookie 插件另有自己的設定與 iOS 限制。插件文件不是「HttpOnly Session 已能安全持久化」的證明，尤其不能經 `getCookies()`、JS bridge、日誌或 localStorage 暴露登入 Cookie。[Capacitor HTTP](https://capacitorjs.com/docs/apis/http)、[Capacitor Cookies](https://capacitorjs.com/docs/apis/cookies)

不能把整個倉庫設成 `output: 'export'`：現有 Request／Cookie 動態 Route Handler、未知會員／活動 ID 路由需要伺服器或另一套 client routing；靜態資產不會包含可執行的 Prisma／AWS 後端。[Next.js 靜態匯出限制](https://nextjs.org/docs/app/guides/static-exports#unsupported-features)

## 3. 建議的一條最小試作路徑

先做可本地啟動的 React client；保留現有 Next.js API 伺服器。只搬「登入 → 本人會員頁／QR → 掃 QR → 登出」，暫不搬幹部工具、不加推播或離線寫入。外觀可共用既有日夜 tokens、48px 操作尺寸與安全區設計，但 `next/navigation`、App Router 與 server-only modules 不能直接搬入獨立 client。

### Jerry／Hao 先選 transport 與認證

候選 A：後端維持 HttpOnly Session，由受保護的原生 HTTP／Cookie 整合管理登入；需實證 Cookie 不經 JS 可讀 bridge、冷啟動持久化、登出與撤銷均正確。

候選 B：另外設計 mobile auth，使用短效 access credential、可輪替／撤銷的更新憑證及平台安全儲存。這是新 API 契約，不是既有登入 API 現在就有的能力。

這輪不替團隊選定，也不修改 SameSite、CSRF 或 Origin。先記錄 A／B、威脅模型與 staging 接點，再開始原生連線驗收；若 A 無法證明保護屬性，就不能為了趕進度把 30 天 Web JWT 搬到 JS 儲存。A／B 不混用成「登入走原生、其他 API 走不共享憑證的 fetch」。

### 能否先做沒有永久 App ID 的 skeleton？

可以，限「獨立 Web client 骨架與合成 transport」，尚不是可安裝的 iOS／Android 工程。本輪已在獨立 `mobile-client-spike/` 目錄實作此最小界線，不改既有 Next.js API；原生 transport、Capacitor config 與平台工程尚未建立。

| 本輪位置／邊界 | 最小用途 |
| --- | --- |
| `src/App.tsx` | 單頁合成登入／本人／QR 狀態；不依賴 Next.js router |
| `src/contract.ts` 的合成 transport 與 controller | 固定合成會員；管理 `checking / signed-out / signed-in / offline-unverified` 與記憶體狀態，不保存 Web JWT／Cookie |
| 同檔 `createTransport('real')` | 未配置即明確拒絕；不連 production、不讀 `.env`、AWS／DB 設定 |
| `build.mjs`、`serve.mjs`、`index.html` | 既有 esbuild 產生本地資產、loopback 靜態預覽；CSP 禁止外部連線，沒有 native bridge |
| 根 `tests/mobile-client-spike.test.ts` | 隔離合成契約測試；不是下列真機結果，不收集真會員／QR／憑證 |

此階段不需要永久 Bundle ID／Application ID、Apple Team ID、簽章或 Play 紀錄。將來跑 Capacitor init／add 平台時才需要指定 package identifier，並另行核准套件、工具鏈及測試 namespace；不要自行冒用組織永久 ID 或註冊商店 App。Capacitor 要求已編譯的 web 資產及根 `index.html`；未加 build 工具與平台工程前，不能把骨架稱為已可 build／安裝。[Capacitor 安裝與初始化](https://capacitorjs.com/docs/getting-started)

## 4. 測試環境與證據規則

- 使用獨立 staging 與合成 ACTIVE 會員／有界測試幹部角色；不使用真實名冊、舊公開 demo 或短密碼帳號。帳密另外安全交付，不寫進 Git、PDF、截圖或測試日誌。
- iOS 與 Android 各自記錄 client commit、API 版號、OS／機型／WebView 版本、所選 transport、實際 local origin 與測試日期。瀏覽器、模擬器、真機結果不可互相替代。
- 回報只包含 endpoint、方法、狀態碼、去識別錯誤碼與請求是否完成；遮蔽 Authorization、Cookie、Set-Cookie 值、密碼、會員聯絡資料及完整 QR payload。Cookie 屬性可記錄，值不可記錄。
- 本次沒有執行工具鏈／簽章／裝置盤點；另見既有 `scripts/check-native-environment.mjs`。它的 PASS 只代表工具／檔案存在，不代表下面流程通過。
- 下表 `—` 一律表示「未執行／未有真機證據」。阻擋不改填 PASS；連線受認證契約阻擋時，記錄阻擋點與負責人。

## 5. 登入、會員、重開與登出矩陣

| ID | 操作／故障注入 | 通過條件 | iOS 真機 | Android 真機 |
| --- | --- | --- | --- | --- |
| A01 | 首次安裝，從未登入，線上啟動 | 本地 UI 可啟動；`/api/me` 401 顯示登入頁，不閃出其他帳號資料、不陷重導迴圈 | — | — |
| A02 | 合成有效帳號登入，立即讀 `/api/me` | 登入成功後必須再確認 `/api/me` 200 且是同一合成帳號；credentials 由同一 transport 處理，不能僅憑登入回 `ok` 就算完成 | — | — |
| A03 | 錯密碼、舊短密碼、重複點登入、429 | 顯示相符錯誤／忘記密碼入口；loading 解除、不重複送出；尊重 retry-after，不忙迴圈重試，不記錄密碼 | — | — |
| A04 | 未認可 Origin／沒有 Origin 的 Web mutation | 現有 Web guard 仍拒絕；mobile 契約不可讓任意網站取得帶權限 mutation，CORS 與伺服器授權分別記錄 | — | — |
| A05 | 成功登入，移到背景，再回前景 | 重新確認登入／會員狀態；未完成確認前不把舊角色當授權，不意外跳出外部瀏覽器或丟掉安全區 | — | — |
| A06 | 成功登入，終止 App 程序後重新開啟 | 在核定 Session 有效期內，同一安全儲存可恢復；先 `/api/me` 再顯示本人頁。不能用 Safari／Chrome 原本已登入來冒充本機持久化 | — | — |
| A07 | 已登入，另一裝置重設密碼／撤銷 Session，或 staging 停權 | 下一次受保護請求失敗時清本機登入與本人資料、返回登入／受限提示，不繼續使用舊會員 QR 或角色；不重新送出密碼偷偷登入 | — | — |
| A08 | 本機「登出其他裝置」的密碼錯誤；再測成功兩種 flag | 密碼驗證 401 不等於 `/api/me` 的 Session 401，不能一律誤判；成功按 `currentSessionRetained` 決定是否保留本機，false／409 要重新登入 | — | — |
| A09 | 線上正常登出，再讀 `/api/me`、返回上一頁及重開 | Cookie／原生儲存與記憶體均清除，`/api/me` 401，歷史頁不恢復個資；普通登出不宣稱所有其他裝置都撤銷 | — | — |
| A10 | 飛航模式下主動登出，再恢復網路及重新登入 | 提供清除此裝置登入的路徑；明示未能確認伺服器操作，不宣稱全域撤銷。舊 Cookie 不恢復，也不把排隊的舊登出送到新登入 Session | — | — |
| A11 | 登入送出後斷線／逾時；再恢復網路 | 顯示結果未確認且可恢復；先確認目前身份／明確重試，不出現無限 busy 或另一帳號狀態，不把網路錯誤說成密碼錯誤 | — | — |
| A12 | 登出 A、登入 B，並反覆切換／重開 | 會員資料、QR、好友與快取不串帳；原生／WebView／外部瀏覽器的儲存邊界清楚，不把同 host 的不同 jar 當自動同步 | — | — |

## 6. QR、相機與離線矩陣

iOS 要有真實相機用途說明；Android WebView 資源權限及照片選擇亦須驗證，不可一律 grant 所有 Web 內容或額外要求麥克風／整個相簿。現有 file input 並不能證明原生選圖已可用。[Apple 相機用途描述](https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription)、[Android WebView 權限與選檔回呼](https://developer.android.com/reference/android/webkit/WebChromeClient#onPermissionRequest(android.webkit.PermissionRequest))

| ID | 操作／故障注入 | 通過條件 | iOS 真機 | Android 真機 |
| --- | --- | --- | --- | --- |
| Q01 | 首次進 App，不點掃描；之後按掃 QR | 不在啟動／登入時索取相機權限；使用者啟動掃描後才提示，目的清楚 | — | — |
| Q02 | 相機允許，掃合成好友會員 QR | 正確辨識並確認 API 結果；會員 QR 不當登入憑證；關閉掃描後相機停止、裝置相機指示不殘留 | — | — |
| Q03 | 首次拒絕相機，再按重試 | 顯示拒絕原因及取消／圖片替代，不黑屏、不無限重彈權限；仍可正常使用其他功能 | — | — |
| Q04 | 已永久拒絕／受系統限制，從設定恢復權限 | 有適當設定指引；返回 App 可重新開啟，不需重裝、不偷偷擴權 | — | — |
| Q05 | 從系統選圖：成功、取消、無 QR、模糊圖 | 成功辨識合成圖片；取消不誤報失敗；無效圖有可讀提示且可再選；不額外保存／上傳原圖作日誌 | — | — |
| Q06 | 掃到無效字串、未知會員、自己、已是好友或被封鎖的合成帳號 | 區分辨識與業務拒絕；不任意開 QR 內 URL、不載入帶 native bridge 的不可信頁；錯誤不當成功 | — | — |
| Q07 | 掃描中進背景、鎖屏、旋轉、關閉彈窗再開 | 相機可靠停止／恢復；只有一個 scanner，沒有重複 API、殘留遮罩或焦點遺失 | — | — |
| Q08 | 連續掃活動報到與重掃同一會員；途中斷線 | 分辨已辨識／處理中／伺服器已完成；只有伺服器確認才顯示報到成功，未確認不排隊自動補送；重掃 idempotent 仍須核對 API 證據 | — | — |
| O01 | 第一次啟動就離線；或登入後終止 App 再離線重開 | bundled UI 可顯示離線／重試／清除此裝置登入；未重新驗證不展示持久化個資，不用遠端頁面白屏代替介面 | — | — |
| O02 | 已登入狀態讀 `/api/me` 時斷線／DNS／TLS 失敗／5xx | 顯示「目前無法確認登入」而非一律登出或密碼錯；不忽略 TLS 錯誤、不用不安全 HTTP 降級、不無限重試 | — | — |
| O03 | 離線解析會員 QR／圖片，再恢復網路 | 可以本機辨識但不宣稱好友／報到完成；恢復後由使用者明確操作並重新驗證，不自動送出過期身份的 mutation | — | — |
| O04 | 長者字體／200% 放大、日夜、鍵盤、Android 返回與 iOS 導覽 | 核心文字可讀、至少 48px 操作目標；安全區／鍵盤不蓋按鈕，錯誤有文字、焦點可回，返回不意外退出或遺失未儲存內容 | — | — |

本地掃碼與離線啟動畫面不代表已有離線會員資料庫；第一版試作不儲存個資做離線瀏覽、不排隊好友／報到 mutation。非相機模擬器只可補充測試，不能代替 Q01–Q07 的真機結果。

## 7. 何時可以開始擴頁或準備發行包

開始連 staging 前，由 Jerry 回覆認證／transport 契約、同版 API 與 migration 驗收狀態、合成資料接點；Hao 不需要 AWS／DB 憑證。開始生成平台工程前，另行核准測試 identifier、工具安裝與簽章範圍。

只有以下條件都具備，才能把「垂直試作」標為完成：

1. iOS／Android 各有可安裝的 bundled client；登入鏈的 A01、A02、A05–A12 有真機證據，Origin／儲存安全門檻亦通過。
2. QR 權限允許／拒絕／恢復、圖片替代、相機關閉、斷線不誤報成功及 O01–O04 有真機證據；第一階段未搬活動報到時，Q08 明確保持未驗收，不宣傳已有原生報到。
3. JS 儲存、bridge、日誌、產物與版本庫未出現 Cookie／JWT／密碼／AWS 或簽章憑證；未用 wildcard CORS、停用 Origin 或 production remote shell 取代認證工程。
4. 問題清單有可重現步驟、負責人與處理結果。工具盤點、Web 可用、main 已推送都不能取代上述紀錄。

這只允許繼續擴頁，**不代表商店可送審**。永久 App ID／Team／簽章、商店素材與帳號、隱私／刪帳／內容管理、審查操作帳號及平台發行要求，仍須另行驗收；詳見 [上架準備](README.md)。

### 每次實測的最小回報

```text
狀態：未執行／阻擋／失敗／通過（只勾一項）
測例 ID：
日期／測試人：
client commit／API 版本：
裝置／OS／WebView 版本：
bundled origin／transport 類別：
結果：endpoint + 方法 + 狀態碼（無 Cookie／Token／密碼）
證據：已去識別錄影／截圖／測試輸出位置
缺陷與下一步：
```
