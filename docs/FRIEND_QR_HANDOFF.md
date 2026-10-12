# 好友 QR 功能交接

更新日期：2026-10-12  
前端負責：Hao  
狀態：前端掃描與既有 API 串接完成，待兩支手機實機驗收

## 本次完成

- 將原本不可掃描的示意方格改為標準 QR Code。
- 首頁會員證及好友頁「我的 QR」共用同一份好友 QR payload。
- 新增手機相機掃描介面，預設使用後鏡頭。
- 相機不可用或使用者不授權時，可改從相簿選擇 QR 圖片。
- 掃描成功後解析會員 ID，呼叫 `POST /api/friends/qr-add`。
- API 成功後顯示對方姓名並重新載入好友清單；錯誤時顯示後端訊息。
- 管理員邀請 QR 改為編入完整註冊網址，並補上網址 query string 編碼與 request origin fallback。

## QR payload

新版本格式：

```text
lionclub:member:<URL encoded memberId>
```

解析器另向下相容：

- 舊版純 `memberId`
- `{ "type": "lionclub-member", "memberId": "..." }`
- 含 `memberId` query parameter 的 URL

QR 只包含會員 ID，不包含姓名、電話、Email 或 session。加好友 API 仍要求使用者已登入，並由後端檢查不可加自己、目標會員存在及既有好友關係。

## Jerry 需要知道

- 後端端點維持 `POST /api/friends/qr-add`，request body 為 `{ "memberId": string }`，不需改版。
- 當面掃描視同雙方同意，既有 API 會直接建立 `ACCEPTED` 關係，來源為 `QR_SCAN`。
- `NEXT_PUBLIC_APP_URL` 建議在 Amplify 設為 `https://lionclubsmembership.com`；未設定時邀請 API 會使用目前 request origin。
- 新增 production dependencies：`html5-qrcode@2.3.8`、`qrcode.react@4.2.0`。

## 驗證紀錄

- `next build`：通過。
- `tsc --noEmit`：通過。
- payload parser：新格式、舊格式、JSON、URL、無效內容均已測試。
- 瀏覽器：標準 QR SVG 正常渲染。
- 無相機裝置情境：顯示錯誤提示、相簿替代入口及取消按鈕。

## 待辦／實機驗收

- [ ] 兩個不同會員帳號，以兩支手機互掃並確認雙方好友清單更新。
- [ ] iPhone Safari 與 Android Chrome 各測一次相機權限、後鏡頭及相簿辨識。
- [ ] 確認掃到自己、已是好友、無效碼及不存在會員時的提示文字。
- [ ] 視產品決策加入可撤銷或有期限的簽章 QR，避免會員 ID 長期固定。
