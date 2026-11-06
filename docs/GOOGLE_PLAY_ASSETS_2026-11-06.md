# Google Play 商店素材草稿

2026-11-06，台灣時間。**尚未核定、尚未上傳或發布。** 本輪新增一張 feature graphic 與一張商店圖示候選，不是 Android 裝置截圖，也不代表商店素材已驗收完成。

## 本輪橫幅

- `output/google-play/draft/LionClubs_feature_graphic_draft_1024x500.png`：1024 × 500、24-bit RGB、sRGB、無透明背景的 PNG。
- 同名 `.svg`：可編輯的向量排版，內嵌原始標誌。
- `output/google-play/draft/feature-graphic-draft-manifest.json`：尺寸、色彩、來源與輸出 SHA-256、未上傳狀態。

版面沿用 App 的深藍 `#0a0d18`、金色 `#c8a951` 及米白 `#f3f1ea`。文案僅使用「LionClubs」與「會員交流・服務活動」，沒有手機背景推播、評分、排名或商店徽章聲明。

標誌來源為 `mobile-app/src/lions-logo.png`。SVG 以原始 PNG 位元組直接內嵌並以原生 256 × 256 尺寸顯示，未重繪、裁切、去背或修飾；輸出前後核對來源 SHA-256 不變。背景與文字是新建的 SVG 向量排版。字型優先使用這台 Mac 的 PingFang TC／Heiti TC；在其他環境重建前須核對字型及排版。

## 本輪商店圖示

- `output/google-play/draft/LionClubs_app_icon_draft_512x512.png`：512 × 512、32-bit RGBA、sRGB 的 PNG；每個像素 alpha 都為 255，全圖不透明，檔案小於 1 MiB。
- 同名 `.svg`：白色完整方形畫布，在 x=64、y=64 放置 384 × 384 的既有圓形品牌標誌。
- `output/google-play/draft/app-icon-draft-manifest.json`：來源與輸出尺寸、SHA-256、未新增裁切或裝飾及未上傳狀態。

來源改用 `mobile-app/src/lions-logo.png`（256 × 256）；內嵌來源位元組及原檔 SHA-256 保持不變，沒有重繪、修飾、裁切、加徽章、加陰影或加圓角。圓形是標誌本身的品牌幾何，不是圖示外框遮罩。原 iOS 圖示與原生資源沒有更動。

Google 商店圖示由 Google 動態處理外框圓角與陰影，因此這張草稿採完整方形白底，不沿用已有圓角及投影的 iOS 外框。32-bit PNG、512 × 512、sRGB、檔案上限及外框處理依 [Google Play 圖示官方規格](https://developer.android.com/distribute/google-play/resources/icon-design-specifications)核對；上傳前仍需品牌與內容核定。

## 重建與使用

在已依 lockfile 安裝依賴、可使用 `sharp` 的專案環境執行：

```sh
node scripts/build-google-play-feature-graphic.mjs
```

這個腳本只讀既有品牌圖，產生本機草稿與 manifest；不讀取帳密、不改來源圖、不呼叫外部服務、不上傳。橫幅驗證 24-bit RGB、無 alpha；圖示驗證 32-bit RGBA、全像素 alpha=255、檔案小於 1 MiB。兩者均核對尺寸、sRGB 與內嵌標誌一致性，最終視覺仍須另行檢閱。

上傳前由發行持有人確認標誌與畫作使用權、品牌與文字內容，以及 Play Console 當時的素材規格；本機存在既有標誌不等於已取得商標或素材授權。真實 Android 截圖另行準備，不能以這張橫幅、圖示或合成預覽替代。
