# LionClubs EC2 Deployment (Docker)

This is the fallback deployment path for when AWS Amplify Hosting won't deliver new
environment variables to the SSR runtime (see `docs/AWS_SUPPORT_CASE_2026-10-21.md`).
It mirrors the FoodServAI deployment pattern: Docker container + host nginx + Let's
Encrypt, with GitHub Actions auto-deploying on every push to `main`.

## 1. Launch the EC2 instance

- Instance type: `t3.small`, region `us-east-2` (same region as the RDS database,
  avoids cross-region data transfer charges and latency)
- AMI: Ubuntu 22.04 LTS
- Security group: allow inbound `22` (SSH, restrict to your IP if possible), `80`,
  `443`
- Allocate and associate an Elastic IP so the address never changes.

## 2. Install Docker, nginx, certbot

SSH into the instance, then:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
sudo usermod -aG docker $USER
# log out and back in so the docker group membership takes effect
```

## 3. Clone the repo and configure environment variables

```bash
git clone https://github.com/aa29zzjj/lionclub.git ~/lionclub
cd ~/lionclub
cp .env.example .env.docker
# edit .env.docker and fill in every value: DATABASE_URL, AUTH_SECRET,
# AVATAR_BUCKET_NAME, AVATAR_PUBLIC_BASE_URL, PASSWORD_RESET_FROM_EMAIL,
# FEDERATED_AUTH_ENABLED=true, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
# OAUTH_TOKEN_ENCRYPTION_KEY, and the Apple vars once Apple is ready to enable.
# This file is gitignored — it only ever lives on this server.
nano .env.docker
```

## 4. First manual deploy

```bash
docker compose -f docker-compose.ec2.yml up -d --build
curl http://localhost:3000/api/auth/providers
```

You should get back JSON with `"enabled": true` for Google once `.env.docker` is
filled in — this is the proof that, unlike Amplify, this path actually delivers the
new environment variables to the running app.

## 5. nginx + HTTPS

Before requesting a certificate, point a **test subdomain** (e.g.
`ec2-test.lionclubsmembership.com`) at this instance's Elastic IP in Route 53/your
DNS provider, so you can verify everything end-to-end without touching the live
`lionclubsmembership.com` domain yet.

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/lionclub
# edit /etc/nginx/sites-available/lionclub: change server_name to your test subdomain for now
sudo ln -s /etc/nginx/sites-available/lionclub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ec2-test.lionclubsmembership.com
```

Certbot sets up auto-renewal via a systemd timer automatically; confirm it with
`sudo systemctl list-timers | grep certbot`.

## 6. Auto-deploy on push (GitHub Actions)

Add these repository secrets (GitHub → Settings → Secrets and variables → Actions):

- `EC2_HOST` — the Elastic IP or hostname
- `EC2_USER` — e.g. `ubuntu`
- `EC2_SSH_KEY` — the private key (PEM) that matches the key pair the instance was
  launched with; paste its full contents

`.github/workflows/deploy-ec2.yml` then SSHs in and runs
`docker compose -f docker-compose.ec2.yml up -d --build` on every push to `main`.

## 7. Cutting over the real domain

Once the test subdomain is verified working end-to-end (login, Google OAuth,
existing features), you decide when to point the production
`lionclubsmembership.com` DNS record at this instance's Elastic IP, then re-run
`sudo certbot --nginx -d lionclubsmembership.com` and update
`deploy/nginx.conf` + `/etc/nginx/sites-available/lionclub`'s `server_name`
accordingly. Keep the Amplify app running until this cutover is confirmed stable,
then decommission it.
