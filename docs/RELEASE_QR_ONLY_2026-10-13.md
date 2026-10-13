# 進版紀錄：QR-only 晚宴加入與正式分會分派

日期：2026-10-13｜目標 main，Hao 已授權進版。

Hao 已告知 main 自動部署目前暫停，migration 尚未完成；本次只推送 GitHub，不恢復 AWS 部署或執行正式資料庫遷移。Jerry 完成前置條件後再恢復部署。

程式包含 `cc3d2eb` 與 `6eb0f17`，接續原 main `ab36c86`；另包含本次交接及文件狀態修正。GitHub 進版與 Amplify／RDS 部署是不同狀態，正式環境尚待 Jerry 確認。

- 中央 AI 暫存、有效 QR 即時 ACTIVE＋一般會員＋待分派，無 PIN 註冊授權。
- 新 QR 預設 3 天，1／3／7／30 天選項及複製連結；到期不會停用既有帳號。
- 分會分派的雙邊 scope、原因、版本核對、歷史及原會角色／邀請停用。
- 新增 additive migration `20261013042000_central_onboarding_assignment`，不搬動舊會員、不重設帳密或自動啟用 PENDING。
- 獨立合成會長／會員測試入口、模擬操作及 13 項測試；正式站的登入未被繞過。
- 後端 56 項測試、TypeScript 與 production build 已通過；正式 DB／AWS／原生商店尚未驗收。

部署最優先：先備份、套 migration、確認中央分會與 SSR runtime，再部署同版前後端。倉庫不會自動執行 migrate deploy；main 自動部署若已啟用，Jerry 須先完成前置條件或安排維護切換。

[Jerry 交接](JERRY_HANDOFF_QR_ONLY_2026-10-13.md)、[中央技術交接](CENTRAL_ONBOARDING_2026-10-13.md)、[會長與會員手冊](CLUB_LEADER_AND_MEMBER_GUIDE_2026-10-13.md)、[合成測試指南](DEMO_TEST_GUIDE_2026-10-13.md)。
