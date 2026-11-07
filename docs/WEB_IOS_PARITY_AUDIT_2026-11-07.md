# 網頁與 iOS 原生功能對照稽核

整理日期：2026-11-07，台灣時間。範圍為會員、幹部、全域管理者、設定、登入與通知的程式流程。**目前不能宣稱網頁與 iOS 已完整一致。**

## 比對基線與證據讀法

- `W`：GitHub `origin/main` 的固定提交 `844e82defbe459700a29dcb56adc1e7238907de8`，檢查 `src/app` 與相關元件。
- `N`：本機原生候選固定提交 `ccf9826e098ea286bfdfb5db3fb63cfab417759d`，檢查 `mobile-app/src` 與 `/api/mobile/*`。
- 下列 `W 路徑:行號`、`N 路徑:行號` 均指上述提交，避免與本輪同時進行的修正混淆。可用 `git show <提交>:<路徑>` 重現；路徑以 repo 根目錄為起點。
- 「已有」只代表原始碼入口、呼叫及對應路由存在，不等於已上架二進位、正式 API、真機或權限驗收通過。沒有操作正式資料庫、發送通知、修改產品程式、讀取機密、操作 GUI 或跑裝置測試。
- 本報告不把路由數當功能完成率。Web Cookie 與原生 Bearer 是不同登入契約，不能把 Web API 直接接到原生，亦不能要求 OAuth callback 路徑逐字相同才算功能一致。

## 優先處理的具體落差

| ID | 優先度 | 差異、觸發與使用者影響 | 固定提交證據 |
| --- | --- | --- | --- |
| F01 | P1 | App 沒有忘記密碼、新會員註冊或對應網站入口；只要沒有可用密碼就無法從登入頁完成復原。Email／密碼登入本身已有。Google／Apple 的 iOS 原始碼按鈕則存在，不能把使用者看不到按鈕直接判定為尚未寫 UI。 | `W src/app/login/page.tsx:103,106,123`；`N mobile-app/src/App.tsx:176-224`；原生 `contract.ts:14` 只停用 Android provider |
| F02 | P1 | 未同意目前條款的會員在 App 發布活動時被後端擋下；App 只顯示「請先到網站」文字，沒有條款檢視／同意流程，也沒有 mobile terms-consent 路由。這是可完成操作的斷點。 | `W src/components/TermsConsentPrompt.tsx:16,38,43`；`N src/app/api/mobile/events/route.ts:70`；`N mobile-app/src/contract.ts:395` |
| F03 | P1（待裝置重現） | 現有活動封面使用 WebView `fetch` PUT 至 S3 presigned URL，但宿主 CSP 的 connect-src 只允許產品主網域；預期 S3 上傳會遭 CSP 阻擋。補頭像上傳前須一起核對，不能只增加選圖 UI。 | `N mobile-app/index.html:6`；`N mobile-app/src/contract.ts:143-145`；`N mobile-app/src/EventsScreen.tsx:86-88` |
| F04 | P1 | 資歷表單沒有複合區／區資料，儲存時一律 `organizationIsUnlisted=true` 並省略既有地區碼；後端會將省略碼寫成 null。空白會籍組織還會被代成「中央獅子會」。清空已填月份則送 undefined，後端保留舊月份。這些會改變或誤導資料，不能只算外觀差異。 | `N mobile-app/src/ExperienceScreen.tsx:35-60`；`N src/lib/member-experience.ts:65-83`；`W src/app/profile/experience/page.tsx:415-435` |
| F05 | P1 | 角色管理只顯示預設組織、只授予第一個角色，沒有組織／角色／期限選擇。區級授權必須填期限，因此現有 App 無法完成；另過濾掉不符合「新授權資格」但仍有舊授權的會員，讓本來應可撤銷的持有人消失。 | `N mobile-app/src/AdminScreen.tsx:171,178,195-210`；`N src/app/api/mobile/admin/roles/route.ts:17,23-28,56`；`W src/app/admin/roles/page.tsx:135-178,188-200` |
| F06 | P1 | SUPER 例外資歷核實需要具體理由，App 卻在核實時不送理由，按鈕會被後端拒絕；退回只送固定泛用文字，使用者無法輸入實際原因。審核畫面也未展示資歷組織、職務、任期、備註等完整核對資料。 | `N mobile-app/src/AdminScreen.tsx:138,149-156`；`N src/lib/experience-review.ts:84,129`；`W src/app/admin/pending-experiences/page.tsx:134-150` |
| F07 | P1／P2 | 活動主辦人無法在 App 編輯或刪除既有活動。這同時缺原生入口、client 方法與 mobile PATCH／DELETE；不能只加按鈕。 | `W src/app/events/[id]/page.tsx:446,479-531`；`W src/app/api/events/[id]/route.ts:86,126`；`N src/app/api/mobile/events/[id]/route.ts:7-53` 僅 GET；`N mobile-app/src/EventDetailScreen.tsx:185-304` |
| F08 | P2 | 官方活動建立表單讓人選主辦單位，但送出的 scope 固定為 CLUB。對區／專區／分區等授權選項可能形成 host 與 scope 不一致，無法完成對應層級發布。活動分類／標籤篩選與標籤編輯亦未移植。 | `N mobile-app/src/EventsScreen.tsx:98-99,155-162,261-281`；`W src/app/events/page.tsx:118,276,375-385`；mobile API 已回 scopes／hosts／tags：`N src/app/api/mobile/events/route.ts:26-42` |
| F09 | P2 | 會員分會分派、分派歷史、CSV 批次預覽／確認完全沒有原生管理介面，雖已有相應 mobile API。新會員正式分會核對仍得另用 Web。 | `W src/app/admin/member-assignment/page.tsx:118,150,187,242,301`；`N mobile-app/src/AdminScreen.tsx:11-17,292-296`；存在 `N src/app/api/mobile/admin/member-assignments/*` 路由 |
| F10 | P2 | 個人資料原生 UI 未提供 Email 變更與頭像選取；mobile API 已支援。若只補 UI，仍需處理驗證信重設、失敗及 F03 上傳契約。 | `W src/app/profile/page.tsx:139-161,475-484`；`N mobile-app/src/ProfileScreen.tsx:15-21,45,81-125`；`N src/app/api/mobile/me/route.ts:47,51,66-68`；`N src/app/api/mobile/me/avatar-upload/route.ts:14-30` |
| F11 | P2 | App 活動通知只有文字卡片，沒有「查看活動」或單筆已讀入口；載入時自動將全部 inbox 標已讀。Web 則由本人按「查看活動／標為已讀」，兩端語義不同。這與「整頁黑畫面」應分開驗證。 | `W src/app/notifications/page.tsx:115-118`；`N mobile-app/src/NotificationsScreen.tsx:132-133,211-218` |
| F12 | P2 | 原生缺少月曆、300A1 官方行事曆、組織架構、外觀切換、隱私／客服／條款入口；其中組織樹 mobile API 已有，官方行事曆尚無 mobile API。 | 對照下方完整矩陣；`N mobile-app/src/Shell.tsx:11-17`、`MyScreen.tsx:86-167`、`styles.css:1-11` |

F04 的日期問題需精確區分：前端雖固定送 `datePrecision="lions-year"`，共享後端會依會籍月份重新正規化；因此不能宣稱每次儲存都必然把月份精度錯寫成獅子年度。已確認的問題是清空月份無效、組織預設／地區碼及 unlisted 語義被覆蓋。非會籍的 position 選項只依 kind 篩選、未依 level 篩選（`N ExperienceScreen.tsx:33`），也應在表單補齊時檢查。

## 完整頁面與操作矩陣

狀態：「已有」=程式具備基本流程；「部分」=欄位／操作仍不齊；「缺 UI」=API 可用但無原生入口；「缺 API」=對應 mobile 動作尚未實作；「外開」=刻意交給 Web；「需驗收」=不能只靠原始碼定案。

### 公開頁、登入與帳號

| Web 頁面／動作 | 原生對應與狀態 | API 與主要證據 |
| --- | --- | --- |
| `/` 導向登入 | 已有；App 自行判定登入與離線狀態，無須相同路由 | `W src/app/page.tsx:4`；`N App.tsx:51-58,134-151` |
| `/login` Email／密碼 | 已有；安全儲存及 refresh 為原生專用契約 | `W login/page.tsx:39`；`N App.tsx:69-83`、`contract.ts:129,262` |
| `/login` Google／Apple | **iOS 原始碼已有按鈕；已上架二進位狀態未知**。Android 是刻意停用，不能套用到 iOS 解釋 | `N App.tsx:215-223`、`contract.ts:10-14,176`；供應商與交換安全另案驗收 |
| `/register` 密碼／邀請 QR 註冊 | 缺 UI 與原生註冊流程；沒有登入頁導向 Web 註冊的入口 | `W register/page.tsx:132` 使用 onboarding，後續驗證邀請；`N App.tsx:176-224` 無註冊；無 mobile register／invites verify／onboarding 路由 |
| `/auth/complete` 第三方補件 | Web 轉註冊表單；原生另有 bootstrap/complete 契約但此登入畫面沒有補件表單 | `W auth/complete/page.tsx:4`；`N contract.ts:176-223`，需由 OAuth 稽核追查實際新會員路徑 |
| `/forgot-password` 寄重設信 | 缺 UI、mobile API 及網站入口 | `W forgot-password/page.tsx:17,35`；F01 |
| `/reset-password` Token 重設 | 缺原生接收／表單；Email 網頁連結仍屬 Web 流程 | `W reset-password/page.tsx:22,33-39`；原生無 mobile reset-password 路由 |
| `/verify-email` 驗證 Email | 原生可重寄，驗證本身在 Web；回 App 後需重新確認本人與狀態 | `W verify-email/page.tsx:19,44`；`N MyScreen.tsx:40-47,95-103` |
| `/privacy` | 缺原生可見入口 | `W components/ProfileSecurityTools.tsx:77`；原生 MyScreen 僅 profile/delete 兩個 Browser.open |
| `/support` | 缺原生可見入口 | `W login/page.tsx:131`、`components/ProfileSecurityTools.tsx:77`；`N MyScreen.tsx:126-148` |
| `/terms` 檢視與接受 | 缺 UI＋缺 mobile 接受 API；發布流程被 F02 擋住 | `W components/TermsConsentPrompt.tsx:16,38`；`N contract.ts:395` |
| `/account/delete` | 外開；已有網址按鈕，但需要 Web Cookie 登入／重新驗證，不能把 App Bearer 當作已登入網站 | `N MyScreen.tsx:138-146`；`W components/AccountDeletionPanel.tsx:111-128`；無 mobile account-deletion 路由 |
| 連結登入方式、第三方重新驗證 | 外開至網站 profile；不屬於原生已完成的綁定／reauth | `N MyScreen.tsx:126-135`；`W components/LinkedIdentitySettings.tsx:26-27`、`ProfileSecurityTools.tsx:75` |
| 登出本人／撤銷其他裝置 | 本人登出已有；其他裝置密碼確認已有，無密碼會員只顯示去網站的說明 | `N App.tsx:104-121`；`SecurityScreen.tsx:41-68`；Web 另有 provider reauth：`W components/ProfileSecurityTools.tsx:87-96` |

### 會員、首頁、好友、資歷與設定

| Web 頁面／動作 | 原生對應與狀態 | API 與主要證據 |
| --- | --- | --- |
| `/home` 會員證、QR、好友／邀請／活動統計 | 已有基本呈現；需真資料權限驗收 | `N HomeScreen.tsx:105-165`，相同 friend QR helper；`W home/page.tsx:110-190` |
| `/home` 活動卡「查看詳情」 | 導航部分：原生只換至活動列表，沒有帶入所點活動 ID | `W home/page.tsx:195`；`N HomeScreen.tsx:178-196`；`App.tsx:163` |
| `/home` 點特定好友頭像 | 導航部分：原生只換至好友列表，不直接開該會員 | `W home/page.tsx:229`；`N HomeScreen.tsx:209-211` |
| `/friends` 好友、邀請、搜尋、送出／接受／拒絕 | 已有基本流程；原生 API 與畫面皆有 | `N FriendsScreen.tsx:72-118,163-205`；`contract.ts:332-356` |
| `/friends` QR 顯示／掃描加好友 | 已有，但 Web 是連續相機掃描，App 是拍一張照片再解碼；相機允許／拒絕／取消及畫質仍需實機驗收 | `W friends/page.tsx:291-293`；`N FriendsScreen.tsx:9-32,121-158` |
| `/members/[id]` 會員檔案、可見資歷 | 已有；僅好友列表 Card 提供 onOpen，不能以建有 detail screen 就保證所有來源能進入 | `N FriendsScreen.tsx:138-139,172`；`MemberDetailScreen.tsx:90-149` |
| 會員檢舉／封鎖 | 已有；候選檢舉長度已使用共享限制，不再沿用早前 1000／200 不一致的舊狀態 | `N MemberDetailScreen.tsx:61-66,103-118`；對應 mobile member report/block API |
| `/profile` 基本姓名、暱稱、電話、生日、簡介、標籤 | 已有；固定選項與 Web 共用資料仍應再核對 | `N ProfileScreen.tsx:15-45,81-125`；mobile me PATCH |
| `/profile` Email 變更、重新驗證 | 缺 UI，API 已有；F10 | `W profile/page.tsx:475-484`；`N src/app/api/mobile/me/route.ts:47,66-68` |
| `/profile` 頭像選取／上傳 | 缺 UI／client helper，mobile 簽上傳 API 已有；另受 F03 影響 | `W profile/page.tsx:139-161`；`N src/app/api/mobile/me/avatar-upload/route.ts:14-30` |
| `/profile` 正式分會待核對提示 | 部分；原生 Member 型別／serialize 未帶 organizationAssignmentStatus、declaredOrganizationName，只顯示組織名稱 | `W profile/page.tsx:30-31,272`；`N contract.ts:16-34`、`src/app/api/mobile/me/route.ts:15-34` |
| `/profile/experience` 手填新增／編輯／刪除 | 基本 API／UI 已有，已核實者禁止直接修改兩端一致；表單內容仍有 F04 語義問題 | `N ExperienceScreen.tsx:191-247`；`N src/app/api/mobile/me/experiences/[experienceId]/route.ts:21-28,49-54` |
| 資歷的複合區／區／名錄組織選擇 | 缺 UI；payload 不保留既有碼，F04 | `W profile/experience/page.tsx:361-401,612-695`；`N ExperienceScreen.tsx:48-60,118-120` |
| 本人名冊比對同意／撤回、候選任期核對／帶入 | 缺原生 UI＋mobile API；Web 本身仍受政策／來源／授權旗標限制，不得為追求一致而略過同意 | `W components/RosterConsentPanel.tsx:17,32,50-53`；`W profile/experience/page.tsx:832-869` |
| `/organizations` 組織架構與核定幹部名單 | 缺 UI／client 呼叫，mobile tree API 已有；名冊姓名揭露仍為刻意的政策範圍 gate | `W organizations/page.tsx:33,91,107`；`N src/app/api/mobile/organizations/tree/route.ts:23-27,51-63` |
| 淺色／深色／跟隨系統 | 缺 UI／狀態；原生 CSS 目前固定 dark | `W components/ThemeSelector.tsx:5-8,29-33`；`W profile/page.tsx:351`；`N styles.css:1-11` |
| 封鎖名單／解除 | 已有；需確認空結果／連線錯誤不混淆 | `W components/ProfileSecurityTools.tsx:35,48,81-82`；`N SecurityScreen.tsx:16-35,71-85` |

### 活動、通知與幹部管理

| Web 頁面／動作 | 原生對應與狀態 | API 與主要證據 |
| --- | --- | --- |
| `/events` 即將／過往列表與報名切換 | 已有；Web 每 30 秒重算時間邊界，原生列表僅在 render 時計算，需確認跨開始時間的即時性 | `W events/page.tsx:117-118`；`N EventsScreen.tsx:206-217,234-279` |
| 活動分類／主題標籤篩選 | 缺 UI；API 有 category/tags，但原生 EventCard 型別沒有 tags | `W events/page.tsx:118,276-292`；`N contract.ts:51-55`；`N src/app/api/mobile/events/route.ts:40-42` |
| 建立個人活動 | 已有，但條款同意及上傳存在 F02／F03 | `N EventsScreen.tsx:75-107`；`W events/page.tsx:140` |
| 建立分會以上官方活動 | 部分；授權資訊已有，scope hardcode 與主辦單位選擇不一致，F08 | `N EventsScreen.tsx:98-99,149-162`；`W events/page.tsx:375-385` |
| `/events/calendar` 月曆／選日／前後月 | 缺 UI；一般 mobile events 已提供資料，未必需新增 API | `W events/calendar/page.tsx:56,116-174`；`N EventsScreen.tsx:261-281` |
| `/events/official-calendar` 300A1 外部官方行事曆 | 缺 UI＋mobile API；原生沒有官方日曆入口 | `W events/official-calendar/page.tsx:51,72-85`；`W events/page.tsx:264-265` |
| `/events/[id]` 說明、報名、取消、已報到鎖定 | 已有基本功能 | `N EventDetailScreen.tsx:96-108,195-226`；`contract.ts:407-427` |
| 活動編輯、變更主辦範圍、刪除 | 缺 UI＋mobile PATCH／DELETE；F07 | `W events/[id]/page.tsx:446,479-531`；`N src/app/api/mobile/events/[id]/route.ts:7-53` |
| 主辦人報名名單、QR 報到、人工補登 | 已有基本 UI／API；原生拍照解碼與 Web 連續掃碼體驗不同 | `N EventDetailScreen.tsx:79-145,229-279`；`W events/[id]/page.tsx:573,619,667-670` |
| 報名名單聯絡資料與報到稽核 | 部分；原生型別有 Email／電話但畫面只顯示姓名／分會／職稱／是否報到，未呈現 Web 的聯絡連結與補登稽核資料 | `W events/[id]/page.tsx:621-622`；`N contract.ts:57-60`、`EventDetailScreen.tsx:251-259`；mobile registrations API 仍須方法／欄位驗收 |
| 活動檢舉 | 已有，依 canManage 顯示與否 | `N EventDetailScreen.tsx:287-299`；`contract.ts:430-433` |
| `/notifications` 活動 inbox／好友邀請／已發送 | 已有基本 UI／API；入口存在不能取代黑畫面重現與修復驗收 | `N NotificationsScreen.tsx:111-242`；`contract.ts:435-450` |
| 通知中的查看活動／本人決定已讀 | 缺導航與語義一致性；F11 | `W notifications/page.tsx:115-118`；`N NotificationsScreen.tsx:132-133,211-218` |
| 發送給指定好友／整個分會 | 已有；未根據選中活動預先辨識「整個分會」資格，API 仍須拒絕越權。送出按鈕在未選好友時仍可按但 handler 直接返回，缺明確提示 | `N NotificationsScreen.tsx:40-45,72-95,105`；`W notifications/page.tsx:125,127` |
| 審核結果 inbox、手機推播偏好 | 候選新增功能，非 Web 缺陷；API 404／503 時原生明確降級。是否部署、APNs 真正送達仍未知 | `N ReviewNotifications.tsx:12-35`、`NotificationSettings.tsx:47-60`、`contract.ts:296-323` |
| `/admin/invites` 建立／歷史 QR | 部分；原生只有固定 3 天的新 QR，歷史列無重新顯示／下載／複製或完整生效狀態。API 已支援 validDays、usageLimit | `N AdminScreen.tsx:32-73`；`N src/app/api/mobile/admin/invites/route.ts:47-59`；`W admin/invites/page.tsx:173-177,188-206` |
| `/admin/pending-members` 核准／拒絕 | 已有基本動作；缺入會年月輸入，原生 action-only 讓 API 改用目前年月。Web 可填歷史入會年月 | `N AdminScreen.tsx:89-119`、`contract.ts:491-493`；`N src/app/api/mobile/admin/pending-members/[memberId]/route.ts:10,34`；`W admin/pending-members/page.tsx:145-164` |
| `/admin/pending-experiences` 核實／退回 | 不完整且 SUPER 例外核實受阻；F06 | `N AdminScreen.tsx:124-160`；`W admin/pending-experiences/page.tsx:134-150` |
| `/admin/member-assignment` 個別／批次／歷史 | 缺 UI；完整 mobile assignment、detail、bulk preview/commit 路由已有 | F09；`N contract.ts:534-537` 只包了一個搜尋方法，未用於分派 UI |
| `/admin/roles` 精確組織／角色／期限／撤銷 | 不完整且區級授權與特定既有授權撤銷受阻；F05 | `N AdminScreen.tsx:164-219`；`W admin/roles/page.tsx:135-200` |
| `/admin/reports` 會員／活動檢舉處置 | 部分；原生僅駁回／停權／移除，無「標記已處理」，也未顯示 details、檢舉人、時間及活動內容供查證，API 已支援 review | `N AdminScreen.tsx:234-268`；`N contract.ts:529-531`；`W admin/reports/page.tsx:131-177` |
| 不同幹部角色的入口可見性 | 不一致；Web 按能力顯示連結，App 只判斷有任一角色就展示全部五個管理 tab，有限審核角色會看到無權操作入口並遇 403。這不代表後端越權 | `W src/lib/profile-capabilities.ts:3-17`；`N MyScreen.tsx:36,150-156`、`AdminScreen.tsx:11-17` |

## 刻意 gate、不能誤稱已完成的項目

1. **Android provider gate 不等於 iOS 按鈕消失的原因。** `N contract.ts:14` 對 iOS 應為 true，`App.tsx:215-221` 應繪出兩個按鈕。要核對使用者的 App 版本／build、實際載入 bundle 與平台回報、帳號狀態及螢幕位置；本報告沒有驗證該二進位。
2. **通知黑畫面尚無源碼單一因果結論。** 候選有資料形狀讀取防護（`contract.ts:438-439`）與頁面 ErrorBoundary（`Shell.tsx:70-71`）；但 parser、元件、宿主、生命週期及舊 bundle 仍可能不同。不能因候選加防護就宣稱已上架 App 修好。
3. 名冊候選、姓名目錄、管理角色與官方活動範圍有明確政策／資料／有效期 gate。補原生 UI 時應保留，不能直接放寬 API 來讓畫面可用。
4. 第三方登入方式管理及刪帳外開網站是現有明確設計，不是原生 API 已完成；Web Cookie 與 App Bearer 不共用登入，須驗收重新登入／取消／返回 App。
5. 原生審核 receipt 與 APNs 偏好是候選新增功能；源碼存在、金鑰建立或 API 回 200 都不能證明鎖屏通知送達。Android `native-push.ts:13` 刻意不支援登記，與 iOS 應分開記錄。

## 下一輪驗收與修正順序

1. 由主流程對實際 iOS 版本重現通知黑畫面與登入入口，記錄 build、平台、登入／角色狀態及最小步驟；測 loading、空資料、舊版缺欄位、錯誤與重試，確保底部分頁仍可操作。
2. 先修會失敗或寫錯資料的 F02-F06，再補會籍分派、活動管理與登入復原。不要把高風險管理功能的空殼入口算完成。
3. 用合成專用帳號各驗一般會員、分會幹部、僅資歷審核者、跨組織管理者、GLOBAL SUPER；確認同一動作 Web 與 App 會產生相同結果、限制與錯誤訊息，不使用正式會員冒測。
4. 頭像／活動封面驗成功、取消、超限、服務未設定、CSP/CORS、網路中斷；資歷驗既有地區碼保留、已列冊旗標、空白組織拒絕、月份清空及已核實唯讀。
5. 管理驗已有但不符合新授權資格者仍可撤銷、區級期限必填、SUPER 具體理由、過期版本衝突、入會年月及跨範圍拒絕；不得以讓後端接受泛用理由取代使用者核對。
6. 明確決定每項功能要原生移植、可用的安全外開流程，或本版產品範圍排除；未決定前不宣稱「所有 Web 功能在 iOS 都有」。

這份稽核只新增本文件，未改 App、OAuth 契約、通知元件、共享 metadata 或正式資料。後續修正須以新的 commit 與裝置驗收紀錄另行更新，不回寫成這份固定基線已經通過。
