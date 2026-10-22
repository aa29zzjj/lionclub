# LionClubs EC2／Docker 備援部署

更新：2026-10-22。這是可選方案，不代表已建立 EC2、切換正式站或通過真人 Google／資料庫驗收。本輪僅調整配置及隔離測試，未連正式 DB、AWS 或主機；本機沒有 Docker，未執行容器 build。

先完成並驗收現有 Amplify runtime 配置修復；是否另建 EC2、費用／區域／DNS／正式切換，由服務持有人決定。以下指令供獲授權的部署人員操作，GitHub push 本身不會預設部署 EC2。

## 安全邊界與 DB-first

- Docker 建置只收 source、public、Prisma schema、build config，以及 `PublicServicePage` 必要的 `docs/app-store/METADATA.zh-Hant.json`。不送 `.env.docker`、AWS 憑證、備份、名冊、私密交接或一般 docs 進 build context；不要在允許的 source/public 目錄放私密資料。metadata 是既有程式的 build-time 相依，亦不可填永久密碼／憑證。
- `.env.docker` 只在主機 runtime 載入，不是 Docker build argument，也不得複製到映像。不要輸出完整 `docker compose config`、`env`、`printenv` 或 secret 值到 CI/log/chat。
- workflow **不執行 migration、seed 或直接 SQL**。先依 [交接及 DB-first 說明](docs/HANDOFF_2026-10-20.md) 備份、確認目標與 migration 歷史、由授權人套用本次 release 必要 migrations，再驗收；不能用 app code 已部署代替 DB 已完成。
- `EC2_DATABASE_READY=true` 是管理者對這次 release 的人工確認，不是系統自動查 DB 的結果。有新 migration 或尚未確認相容性時，先改回 `false`；勿沿用舊 release 的確認。
- `/login` HTTP 200 僅是容器 liveness。`/api/auth/providers` 的 `enabled=true` 也只表示配置已載入，**不證明 client secret 正確、callback 已登記、DB 已 migration、真人 Google 可登入或敏感操作已驗收**。

## 1. 主機與網路前置

選擇仍支援的 Ubuntu LTS、足夠的記憶體／磁碟與持續更新的 Docker Engine。需要 Docker Compose plugin v2.20+（含 `up --wait`）；依 [Docker 官方 Ubuntu 安裝文件](https://docs.docker.com/engine/install/ubuntu/) 安裝及確認 `docker compose version`，勿假設 Ubuntu 預設套件來源一定含 plugin。

主機與 RDS 所在區域由持有人核對，不在此硬定區域。Security group 只放必要的 80／443 與受控 SSH 22；RDS 5432 只接受已核准主機／security group，勿對外開放。compose 將 3000 僅綁 `127.0.0.1`，由 host nginx 反向代理，不應公開開啟 3000。

執行 Docker 的帳號具有接近 root 的主機能力，請使用專用部署帳號／金鑰、最小可行主機權限並保管 SSH key。使用預先核對的 ED25519 host key fingerprint，不接受自動信任第一次見到的主機。

## 2. 專用、乾淨的 main checkout

workflow 固定使用部署帳號的 `$HOME/lionclub`。請先手動建立專用 checkout，配置該主機唯讀拉取 GitHub 私有 repo 的憑證；Actions 的 SSH key 只是登入 EC2，不會自動提供 EC2 拉取 GitHub 的權限。

```bash
git clone https://github.com/aa29zzjj/lionclub.git "$HOME/lionclub"
cd "$HOME/lionclub"
git switch main
git status --short
umask 077
cp .env.example .env.docker
chmod 600 .env.docker
```

由授權人編輯 `.env.docker`，核對 `DATABASE_URL`、`AUTH_SECRET`、region、圖片與寄信配置。沿用原 `AUTH_SECRET` 是否必要、輪換如何影響現有 session，須由持有人確認。不要在本文或 GitHub 中填真實連線字串或長期 AWS keys；若使用 instance role，依實際需要設定最小權限。

先保持 `FEDERATED_AUTH_ENABLED=false`。Google／Apple 只在必需 DB migrations、供應商設定及測試完成後個別啟用；Apple 不因 Google 可用就一起打開。`NEXT_PUBLIC_APP_URL` 應是本次測試主機實際的 HTTPS origin，Google Cloud Console 需登記完全一致的 `/api/auth/oauth/google/callback`。runtime 配置方式以 [Google/OIDC 說明](docs/FEDERATED_AUTH_2026-10-20.md) 及本次更新為準。

`.env.docker` 被 Git 及 Docker context 排除；其他未追蹤檔案仍會讓自動部署停止。不要把使用者工作目錄作為部署 checkout。

## 3. 先 DB-first，再做手動容器驗證

確認本次資料庫前置已由授權人完成後，才執行：

```bash
docker compose -f docker-compose.ec2.yml config --quiet
docker compose -f docker-compose.ec2.yml up -d --build --wait --wait-timeout 180
docker compose -f docker-compose.ec2.yml ps
curl --fail --silent --show-error http://127.0.0.1:3000/login >/dev/null
```

`config --quiet` 只驗配置，不把 runtime secrets 印出。容器採 Node 22 LTS、非 root 使用者、明確 build inputs；此處沒有 migration 指令。build 失敗時舊容器一般不會被替換；若 replacement 啟動後 health 失敗，workflow 會失敗，但不承諾自動 rollback。由持有人保存可用映像與 release 記錄，依 DB 相容性決定復原方式；不要直接刪資料或倒退 migration。

## 4. 測試網域、nginx 與 HTTPS

先用另行核定的測試子網域，不修改現有正式 DNS。依主機方案安裝 nginx／certbot，參照 `deploy/nginx.conf`，將 `server_name` 改成實際測試網域，proxy 保持 `http://127.0.0.1:3000`。確認 DNS、`nginx -t`、HTTPS 憑證及自動續期後，再測安全 Cookie、callback 和真實手機瀏覽器。

容器啟動或配置顯示成功後，仍須分別驗收：

1. 舊 Email／密碼登入、`/api/me`、登出、原有會員／好友／活動功能。
2. Google 已綁定帳號登入；新帳號從有效邀請 QR 建立；同 Email 舊帳號須先登入再明確連結，不能自動合併。
3. 取消／過期／錯誤 callback、邀請失效、網路中斷與重試；敏感操作再驗證另驗收，不假設選 Google 帳號等於重新輸入密碼。
4. 本次資料庫版本、scope／角色授權、前端日夜與手機流程。此清單不是已通過紀錄。

## 5. GitHub Actions：預設關閉、明確 opt-in

Repository → Settings → Secrets and variables → Actions，人工配置以下 **Variables**：

| Variable | 何時設為 `true` |
| --- | --- |
| `EC2_DEPLOY_ENABLED` | 持有人確認要讓 main push／手動觸發執行 EC2 部署時 |
| `EC2_DATABASE_READY` | 本次 release 的 DB-first 前置與相容性已確認時 |

兩者缺省或不是小寫 `true`，以及非 main 的手動執行，都只產生清楚的 `SKIPPED / NOT DEPLOYED` summary，不連主機；這不是部署成功。暫停新部署時將開關改為 `false`；已在執行的部署需另行協調，不保證立刻停止。

只有 opt-in 後才需要以下 **Secrets**（缺少任一項會 fail，不假裝成功）：

| Secret | 內容 |
| --- | --- |
| `EC2_HOST` | 單一 DNS 名稱或 IPv4；workflow 固定 SSH port 22 |
| `EC2_USER` | 專用部署帳號，例如 `ubuntu` |
| `EC2_SSH_KEY` | 該帳號的專用 OpenSSH 私鑰；本版非互動 SSH 不支援密碼保護私鑰，請另依組織金鑰規範評估 |
| `EC2_HOST_FINGERPRINT` | 經可信主機管理管道確認的 ED25519 host key `SHA256:...` fingerprint，不是登入公鑰 fingerprint |

先由可信 console／既有管理連線核對 fingerprint；不能把本次未驗證連線的 `ssh-keyscan` 輸出直接當可信值。CI 掃描取得的 key 只有與預存 fingerprint 完全一致才接受，並啟用 `StrictHostKeyChecking=yes`。

workflow 不使用第三方 SSH action，token 只有 `contents: read`，同一 concurrency group 不同時部署且不強行中斷正在運行的部署。遠端先確認專用 checkout、main、**tracked／untracked 全部乾淨**及 `.env.docker` 可讀；只 `fetch` + `merge --ff-only` 本次 event SHA，不跑 `reset --hard`、`clean` 或 image prune。若 main 已往前、分支分歧或 checkout 有修改，停止並由人處理，不覆蓋內容。亦不保證阻止所有外部手動部署，主機維運者仍需協調。

只有 `up --wait` 成功後才顯示「container deployment command completed」，並明示尚未做真人 Google／DB／功能驗收。SSH／build／healthcheck 失敗會保留 failure status，不靜默成功。

## 6. 正式切換仍需另行批准

測試子網域的實際登入、邀請、Google／錯誤路徑及 DB 驗收完成並記錄後，持有人才能決定正式 DNS、HTTPS origin、Google callback 與回復計畫。保留原 Amplify 服務，直到正式切換穩定且另行核准停用。本文件及 workflow 不會替您建立 EC2、設定 secrets、修改 Google Cloud、套 migration 或切換 DNS。

## 本地回歸

```bash
node --test tests/deployment-config.test.mjs
```

測試檢查配置契約，並以臨時檔與命令替身驗證開關、缺 secret、dirty checkout／分歧時停止；不連 SSH／Docker／AWS／DB。它不是 Docker engine build 或 EC2 實測。Docker 可用時，另在乾淨、無私密資料的環境建置並檢查 image／build context。

參考：[Docker build context](https://docs.docker.com/build/concepts/context/)、[Compose ports](https://docs.docker.com/reference/compose-file/services/#ports)、[GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[GitHub secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[Node 支援版本](https://nodejs.org/en/about/previous-releases)。
