# 2026-10-17 發行準備與接手清單

本文件是工作準備，不是已建置、已簽章或已提交商店。原始兩頁週排程已逐頁閱讀；附件只作工作背景，不當成正式 DB 操作、擴權或接受商店協議的授權。

程式盤點基準：main 5d704d1（已納入 Jerry 後續密碼顯示切換），包含 286b130 的權限／名冊工具及 19917f7 的交接文件。本輪不推斷正式 Amplify 正在執行的 SHA。

## 本輪完成及不做的事

| 工作 | 狀態 | 交付／邊界 |
| --- | --- | --- |
| 閱讀週排程 | 完成 | Jerry 先做名冊映射／host／正式角色；我們先交資料並準備手機發行。 |
| 核定 JSON | 已備妥私人下載 | 131 組織、305 具名任職、18 排除欄位。原檔不重存、不補 Email、不建帳號或授權。 |
| 映射範本及完整性 | 已備妥私人下載 | 131 列明確未填寫範本、manifest、README、SHA256SUMS。沒有假造正式 ID、DB 快照或 planDigest。 |
| AWS Console | 已登入並留給使用者接手 | 未改 IAM、RDS、Amplify、安全群組或正式 DB；Access Key CSV 未用於 CLI，也未納入任何交付包。 |
| 商店準備 | 文件／素材腳本／驗收矩陣／合成 client | 初盤為 17/63；更新核定名稱及客服後為 19/63、44 缺項；native 14 缺項。存在數不是功能完成率。 |
| 原生包與送審 | 尚未執行 | 無完整 Xcode／Android SDK、正式 App ID、簽章與真機證據；沒有 IPA／APK／AAB、商店建立或提交。 |

私人 JSON 包只供使用者下載轉交 Jerry；未代寄。名字、附件登入檔、金鑰、照片、QR 和 Console 截圖不進公開倉庫。

## 必須修正原週排程的假設

1. 若 Google Play 是 2023-11-13 後建立的個人帳號，至少 12 名測試者需在 closed testing 連續 opted-in 14 天，之後才可申請 production access；還要等審查，不是第 14 天自動正式上架。原排程的 11 位幹部與 internal testing 不足以取代此要求。[Google 官方](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
2. 目前能確認的是三個公開頁有程式，不是營運隱私已就緒；正式法律實體／客服與完整刪除路徑仍有阻擋。Google／Apple 社群登入首版延後，不以 OAuth 取代核心流程與合規。
3. 原始排程另有正式網路隔離的風險回報，細節只在私人移交中處理。本輪未讀取安全群組來獨立證實，也未關閉／擴張規則；應由正式責任人優先確認、規劃受控路徑及回復安排，不把延期視為風險消失。
4. 不依固定 Day 7 送審；以帳號、原生 auth、簽章、正式 API、真機與政策 gate 全部通過才提交。測試用 APK 不需先有 Play 發行帳號，但仍需要工程與工具鏈。

## 實際可並行的順序

| Gate | 我們／使用者 | Jerry／正式維運 | 通過證據 |
| --- | --- | --- | --- |
| A - 資料交付 | 下載私人核定包，安全轉交 | 確認 SHA，匯出唯讀組織快照，填 mapping，核准 reparent | 核定原檔 SHA、mapping 與預覽差異；不只是 131 筆相符 |
| B - 帳號／工具 | 確認 Developer／Play 類型、永久 App ID、品牌及營運資料；安裝官方工具鏈 | 確認可供 native 用的版本化 auth／API 契約 | Xcode／SDK、Android build tools／JDK、明確 App ID；不可猜測 |
| C - 原生垂直試作 | 本機打包 React／Capacitor 登入＋QR，拒絕相機與離線也可用 | 精確原生登入、續期／撤銷與 Origin 邊界 | 至少各一部實體 iPhone／Android，登入→me→重開→登出及撤銷成功 |
| D - 正式後端 | 使用者接手 Console 後與 Jerry 明確分工 | 備份、DB-first migration、相容 API、名冊及舊 host、角色正反驗收 | 正式 SHA／migration status／備份／測試回報，不提供密碼 |
| E - 政策／素材 | 本文件配套文案、真機素材、App Privacy／Data safety／年齡問卷 | 完整刪帳與 UGC 處置／清理／保留營運 | 全流程、真實接件人及產物證據，不只 metadata 勾選 |
| F - 內測／送審 | 簽章 Archive／AAB，TestFlight／Play 測試軌道，所有人核准送審 | 合成審查資料與穩定可用 API | 真機缺陷結案；若適用新個人 Play 要 12 人／14 天及 production access |

本輪不下載多 GB 的 Xcode／SDK、不改 xcode-select、不接受 SDK／商店法律協議、不建立永久 Store ID，也不讀取 Keychain／p8／p12／keystore。須由持有人在正確帳號完成驗證、付費、協議與簽章管理；安裝與原生工程可在帳號／識別資訊確認後續作。

## 現在需要持有人補的非秘密資訊

使用者已於 2026-10-17 核定 LionClubs、客服 jerry@prepmateai.com；並回報 Apple Developer 已付費啟用、Google Play 尚未建立。metadata 的名稱與客服已更新，後台及簽章驗收沒有自動轉為完成。Apple 登入信箱不放公開 metadata，也不能當 Team ID。

- Apple Developer 個人／組織、10 碼英數 Team ID。依 [Apple 官方說明](https://developer.apple.com/help/glossary/team-id/)，登入 Developer Account 的 Membership details 取得；不傳密碼或驗證碼。
- Google Play 的個人／組織發行選擇及後續驗證；不為規避測試而填不實帳號類型。
- 發行法律實體、品牌授權、隱私／內容管理聯絡；客服信箱不自動兼任隱私責任人。
- 正式 iOS Bundle ID、Android applicationId、發行地區、定價、iPhone／iPad／Android 裝置範圍與版本。
- 合法 icon 母檔、實體測試手機。審查帳號與強密碼只進商店私有審查欄位；不要貼商店／AWS 密碼、OTP 或簽章私鑰。

已在對話提出兩組必要輸入問題；未知資料維持 null／false，不讓使用者沒回覆時自動成為「已核准」。

## 送審前的實質政策阻擋

### 刪帳不是只有入口

現有 App 內／外部入口、密碼再驗證與 API 已有；但有效／未來角色或未來主辦活動者仍回 409，沒有可追蹤刪除申請及完成閉環；PENDING／停權者的本人替代通道未完成。本人活動自由文字、圖片等 UGC 與共享紀錄的處理要逐項確認，不能一律稱歷史永久保留。頭像清理排程、重試監控、S3 版本與備份期限須正式驗收。

Apple 允許合理時間人工處理並告知時間／完成，但一般非受高度監管 App 不應強制打電話或走客服才能刪除；本人共享 UGC 原則也要刪除，法律保留例外須說明。[Apple 刪帳](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)。Google 也要求 App 內與網站提出刪除的途徑及保留揭露。[Google 刪帳](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

這是工程送審缺口盤點，不代替法律保留義務判斷；需定案後再實作，不能為通過清單而直接刪除共享正式資料。

### UGC 與分類

會員封鎖／檢舉 API 已有，不等於內容治理閉環。仍需發布 UGC 前接受使用條款、活動等內容的檢舉／實際處置、營運接件與適當回應。封閉會員制也不是全面豁免。[Apple 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)、[Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)

分類目前是 Social Networking 草稿，並未核准。若 Play 最終選 Social，需核對 Child Safety Standards，不能僅以年長會員或成人定位免除；公開 CSAE 禁止標準與處置聯絡需由營運所有人確認。[Google Child Safety](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en-en)

### 隱私與技術

App Privacy／Data safety 需盤點姓名、Email、電話、頭像、資歷、好友、活動、登入風險記錄、AWS 服務及實際 native SDK，不能填「不蒐集」或把 WebView 當豁免。三個正式政策 URL 本輪透過公開讀取工具未取得可核對內容，因此只列候選，不勾正式上線驗收。

Apple 上傳基線為 Xcode 26+／iOS 26 SDK+；Google 一般手機新 App／更新 target API 36+。建置 SDK 與使用者最低支援版本是不同概念。[Apple SDK](https://developer.apple.com/news/upcoming-requirements/)、[Google target API](https://support.google.com/googleplay/android-developer/answer/11926878)

## 下一個可驗收工程里程碑

本輪已建立不綁永久 App ID 的 [合成 client contract spike](../../mobile-client-spike/README.md)，以工作區既有工具 bundle，沒有安裝依賴、正式 transport、真密碼或相機呼叫。已通過 7 項合成測試及本機瀏覽器登入／離線／拒絕／登出／重開檢查；不是原生登入驗收。

真正產生 Capacitor／iOS／Android 平台工程前，仍須確認永久 App ID、工具鏈及 auth 契約。不得把含 Prisma／Cookie／動態 Route Handler 的 Next.js 全站改為 static export，也不做 production server.url 指向正式網站的捷徑殼。合成 harness 不能稱正式登入已完成。

原生試作驗收見 [測試矩陣](NATIVE_SPIKE_ACCEPTANCE_2026-10-17.md)，素材與文案見 [準備稿](STORE_CONTENT_2026-10-17.md)。所有 ready、簽章、真機、政策與正式 DB 旗標維持未完成，直到實際取得證據。

## 本輪驗證紀錄

- TypeScript 測試 181/181、JavaScript／隔離 SQL 與路由測試 70/70，共 251 項通過；合成 spike 的 7 項已包含在此總數內。
- 根 TypeScript 型別檢查、Next.js production build、diff 空白檢查通過；build 使用合成環境值，不連正式資料庫或 AWS。
- 本機既有 esbuild 成功產出合成資產；loopback preview 的登入／QR／離線／安全拒絕／登出／重開與夜間外觀已由瀏覽器檢查。預覽服務已停止，24 項真機測例仍全部未執行。
- 核定 JSON 原檔 SHA 不變，5 檔私人交付包的校驗通過；未填 mapping 範本已實測會被匯入預覽拒絕，不會誤用為正式資料。
- 私人 JSON、原始 PDF、AWS 憑證／Console 截圖未加入 Git；原生包、商店登入／建立、簽章、真機與送審未執行。
