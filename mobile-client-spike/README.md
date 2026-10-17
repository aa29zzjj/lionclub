# LionClubs 合成 client contract spike

這是可本地 bundle 的 React 工程試作，**不是 Capacitor／iOS／Android 工程，不是原生包或正式登入**。只驗證固定合成會員的登入 → `me` → 登出、QR 提示及離線狀態契約。

沒有帳密輸入、真相機／相簿、Cookie／JWT、安全儲存、正式 API、資料庫、AWS、永久 App ID、簽章或商店設定。`me` 是記憶體合成方法，不是呼叫 `/api/me`。QR 只有狀態預演，不生成正式 QR，也不加好友／報到。重開頁面會重設；這不代表原生 Session 持久化已通過。

## 使用現有工具

已確認此工作區原有 React 18.3.1、ReactDOM 18.3.1、tsx 4.23.15、esbuild 0.28.2 可解析。未新增依賴或 lockfile。esbuild 為既有依賴樹內工具，不保證其他 checkout 永遠存在；不可用時停止並交付 contract/tests，不自動下載或執行 npx。

在倉庫根目錄，以可用的 Node 22+ 執行：

```sh
node --import tsx --test tests/mobile-client-spike.test.ts
node mobile-client-spike/build.mjs
node mobile-client-spike/serve.mjs
```

預設預覽 `http://127.0.0.1:3137/`，Ctrl+C 關閉。可用 `node mobile-client-spike/serve.mjs 3138` 換 loopback port。此服務只有三個靜態資產，不代理 API、不接受寫入、不對區網開放；找不到 dist 時會提示先 build。

若終端沒有一般 `node`，先選定本機已安裝且符合版本的 Node 執行檔，執行上述相同命令及 `node node_modules/typescript/bin/tsc --noEmit`。本次使用工作區既有 Node 24.19.0，沒有載入 `.env` 或使用任何正式設定。

## 實際流程與安全邊界

1. 按「使用合成會員進入」：controller 先合成 login、再合成 me，核對完成才顯示固定合成人物；沒有真密碼欄位。
2. 可重新核對 me、登出、切換日夜，預演相機拒絕、無效圖片、合成辨識及離線提示。離線開關只改合成 transport，不是網路偵測。
3. `createTransport()`／精確 `synthetic` 使用記憶體資料；`real`、其他未認可 mode 的所有方法都丟 `UNCONFIGURED_TRANSPORT`。沒有「連不上就偷偷改正式 API」或假成功 fallback。
4. 登出會先清畫面並使較晚完成的登入／me 結果失效；模擬離線登出也清本機合成 identity，不宣稱伺服器全域撤銷。
5. bundle 的 HTML CSP 設 `connect-src 'none'`，不使用 CDN、Service Worker 或外部素材；本地 server 另拒絕相機、麥克風與位置權限。不要為了接 API 放寬 CSP，必須另行選定／審核原生 transport 契約。

`build.mjs` 只把現有 React／ReactDOM、這個目錄的 TSX/CSS 打成 `dist/index.html`、`dist/app.js`、`dist/app.css`；dist 由本目錄 `.gitignore` 排除。資產不依賴網際網路，可由本機靜態服務供應；這不代表關閉本機 server 仍可開頁，也不是已驗證的原生冷啟動離線能力。

## 未完成，不能宣稱通過

- 未建立 Capacitor config／平台工程，未選正式 identifier、簽章與 mobile auth；沒有真實 remote transport。
- 未驗證真機 Cookie jar／安全儲存／重開持久化、相機或圖片選取、原生返回／鍵盤／生命週期、安裝包、TestFlight／Play。
- 未搬正式頁面、好友／活動／幹部 mutation、推播或離線資料庫。沒有把 Native HTTP 插件視為現有 Web Cookie／Origin 的捷徑。
- [24 項原生真機矩陣](../docs/app-store/NATIVE_SPIKE_ACCEPTANCE_2026-10-17.md)仍全部未執行；本合成 unit tests、bundle 與 localhost HTTP 檢查不取代它們。

接真實服務前，先由 Jerry／Hao 核定 transport、認證與 staging 契約；不得把 Web JWT／Cookie 放到 JS 儲存或關閉既有 Web Origin 防護。此目錄不含任何永久 App ID，後續生成平台工程須另行確認工具與測試 namespace。

## 2026-10-17 本機驗證

7 項隔離 unit tests、既有 esbuild bundle、根 `tsc --noEmit` 均通過。Loopback HTTP 檢查確認三個資產皆 200、GET `/api/me` 為 404、POST `/api/auth/login` 為 405，且不能取得 `src/contract.ts`；已核對 CSP 與相機拒絕標頭。受限 sandbox 的 listen／connect 原先回 EPERM，經核准的本地 loopback 權限後檢查通過；不是外部 API 連線。

另以本機瀏覽器實測合成 login→me、離線隱藏身份、QR 離線不假報成功、相機拒絕提示、未配置 real transport 拒絕、夜間、離線登出與重新整理清空狀態；通過。1280 寬的瀏覽器未見水平溢出，沒有密碼輸入欄。畫面證據在 `output/acceptance/2026-10-17/lionclubs-synthetic-spike-dark.png`；不是原生真機或商店素材。

本機預覽服務已停止。24 項原生真機測例仍全部未執行，不能以這份合成結果取代。
