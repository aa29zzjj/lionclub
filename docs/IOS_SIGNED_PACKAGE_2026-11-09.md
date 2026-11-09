# LionClubs iOS 1.0.1（7）簽署產物

日期：2026-11-09（台灣）。**已完成本機發行簽章與 IPA 匯出；尚未上傳或送審。**

| 產物 | 位置／結果 |
| --- | --- |
| 已簽署 IPA | `output/releases/LionClubs-iOS-1.0.1-build7-2026-11-09.ipa` |
| Signed Archive | `tmp/LionClubs-1.0.1-b7-signed-20261109.xcarchive` |
| 版本 | 1.0.1，Build 7；App Store Connect 上傳清單最新為 1.0.1（5） |
| 團隊／App | Prepmate AI inc.／2TWCSJNDWG；`com.lionclubsmembership.app` |
| 簽章 | 既有 Apple Distribution；SHA-1 `96E2864BF4C6A5C1CA2C58404A46A6C66F81630B` |
| 描述檔 | LionClubs App Store 20261109；UUID `63cc0c31-642b-47fd-8dd4-1fb21a9a90be` |
| 最終權限 | `aps-environment=production`；`get-task-allow=false` |
| 檔案 | 5,053,636 bytes；SHA-256 `0f4870a19bad62325d2e4b45b16f248ed39477e0a5f62e1837323d70934f7d1c` |

Archive 與 IPA 都通過 strict／deep codesign 驗證、簽章憑證與描述檔配對、有效期、版本及權限檢查；三份前端資源與來源逐一 SHA-256 相同。這是 App Store distribution 產物，不是供直接側載的 Ad Hoc 安裝包。

本輪 native 程式為 `e2826de`，包含 `f556cbf` 的修正及「我的 → 說明與政策」直接開啟隱私、條款與支援的入口；開啟失敗會在相應區塊顯示可重試的訊息。版本與簽章設定僅放在本機獨立 iOS 建置副本 `tmp/lionclubs-signing-host-b7-yxogkprt` 的 App Release target，未把描述檔錯套到共用套件，也未將個人私鑰、密碼或固定機器簽章設定寫入主工作樹。

較早的 Build 6 與其驗證紀錄仍保留在 `output/releases/` 及 `output/acceptance/native-followup-20261109/`。新增的 Web 安全流程及政策文案不在原生 IPA 內，需另外完成配套後端部署；不能將本機簽章當成它們已在正式服務啟用。

## 驗收與證據

- `f556cbf` 基線的程式測試 523／523、隔離整合 226／226、介面安全 16／16、TypeScript、Next production build 通過。新增 App 入口的相關測試 45／45、隔離手機大字及錯誤畫面核對通過；後端安全流程的本輪全套驗收另行記錄，沒有沿用舊數字冒稱新後端已驗收。
- `output/acceptance/native-release-20261109-b7/SIGNED_PACKAGE_EVIDENCE.json`：產物、雜湊、建置記錄與部署界線。
- 同目錄 `SIGNED_IPA_VALIDATION.json`：實際 Archive／IPA 簽章與資源核對。
- 同目錄保留 validator、export options、Archive／export log，可重現本機驗收；都不含私鑰或密碼。
- 新增的唯一 Apple 後台資源，是持有人於 Generate 前明確核准的這份 LionClubs App Store 描述檔；未新增／撤銷發行憑證，未上傳 App。

## 送測／公開發行前的實質缺口

1. 先驗明正式 DB／API 部署 SHA 與 migration，再安排新原生 OAuth v2、條款、待審會員與圖片簽章的配套。不能直接把新後端蓋到舊版：新後端拒絕 legacy 原生 OAuth；關旗也不等於維持舊版登入。
2. Apple-only 的本人再驗證／安全操作與刪帳配套正在本機實作，預設保持關閉；不能只補環境值或沿用旗標，也不能將本機合成驗收當成真實 relay 寄信或撤銷已驗收。正式公開 providers 本輪仍為 Apple 未啟用。
3. 真實 Google／Apple 回跳、登入／重開／換帳號、通知與相機、圖片上傳及 APNs 的 iPhone／iPad 驗收。模擬器／合成操作不等於這些已完成。
4. 核對最終隱私政策、資料收集標示與實際日誌／備份保留。使用者仍保留 CloudWatch 保留變更給 Jerry 確認，本輪未更動或刪日誌。

完整修正及仍有的 Web／App 功能差異見 [續作進度](IOS_BUG_FOLLOWUP_2026-11-09.md)。
