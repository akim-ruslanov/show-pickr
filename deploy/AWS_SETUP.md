# Deployment setup

This project deploys with two GitHub Actions workflows:

| Workflow | What it deploys | Where |
| --- | --- | --- |
| `deploy-frontend.yml` | Vite build (`frontend/dist`) | GitHub Pages |
| `deploy-backend.yml` | Node + Express + Socket.io (Docker) | single EC2 instance + Caddy (HTTPS) |

The only paid AWS resource is a `t3.micro` EC2 instance (Free Tier). GitHub Pages is
free.

> **Why one EC2 instance (not Fargate)?** The backend uses a single SQLite file. A
> single instance with a Docker volume is the simplest way to keep that file persistent
> for an MVP, and `t3.micro` is free-tier eligible (Fargate is not). Caddy sits in front
> of the app to provide HTTPS, which is required because the GitHub Pages site is served
> over HTTPS and browsers block mixed-content requests to a plain-HTTP backend.

---

## 0. Prerequisites

- An AWS account (Free Tier).
- A domain (e.g. `example.com`) with DNS you control. Needed for the backend's HTTPS
  certificate. You'll point `api.example.com` at the EC2 instance.
- The GitHub repo already has the files in this `deploy/` folder and both workflow files.

---

## 1. Backend — EC2 + Docker + Caddy

### 1.1 Launch the instance

1. EC2 → **Launch instance**:
   - Name: `showpickr-backend`
   - AMI: **Amazon Linux 2023**
   - Instance type: **t3.micro** (free tier)
   - Key pair: create/download one (you'll need the private key for GitHub).
   - Network settings: create a security group with inbound rules:
     - SSH (22) — from **your IP** only
     - HTTP (80) — `0.0.0.0/0`
     - HTTPS (443) — `0.0.0.0/0`
   - Storage: 8 GB gp3 is plenty.
2. **Actions → Allocate Elastic IP** and associate it with the instance so the public
   IP doesn't change on stop/start.
3. In **Advanced details → User data**, paste the bootstrap script below (installs
   Docker, Compose, git, and 1 GB of swap for the small instance):

```bash
#!/bin/bash
set -e
dnf update -y
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

# Docker Compose v2 plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 1 GB swap so `npm install`/`tsc` don't OOM the 1 GB instance
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 1.2 Point DNS at the instance

Create an **A record**: `api.example.com` → the Elastic IP you allocated. Caddy will use
this name to obtain a Let's Encrypt certificate.

### 1.3 Clone the repo on the instance

SSH in (`ssh -i your-key.pem ec2-user@api.example.com`) and clone:

```bash
# Public repo:
git clone https://github.com/OWNER/show-pickr.git ~/app

# Private repo — add a read-only deploy key first (Settings → Deploy keys on GitHub),
# then on the instance:
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# paste the deploy key's private key into ~/.ssh/id_ed25519, then:
chmod 600 ~/.ssh/id_ed25519
git clone git@github.com:OWNER/show-pickr.git ~/app
```

The workflow expects the clone at **`/home/ec2-user/app`** (edit `APP_DIR` in
`deploy-backend.yml` if you clone elsewhere).

### 1.4 Add GitHub secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `EC2_HOST` | `api.example.com` (or the instance's public IP/DNS) |
| `EC2_SSH_USER` | `ec2-user` |
| `EC2_SSH_KEY` | the **private** key (`-----BEGIN ... PRIVATE KEY-----`) |
| `EC2_SSH_PORT` | `22` (optional) |
| `SITE_ADDRESS` | `api.example.com` |
| `FRONTEND_ORIGIN` | your GitHub Pages origin, e.g. `https://USERNAME.github.io` (used for CORS) |
| `MOTN_API_KEY` | your MovieOfTheNight API key |

Push to `main` (or run the workflow manually). `deploy-backend.yml` will `git pull`,
write `backend/.env`, and run `docker compose up -d --build`.

---

## 2. Frontend — GitHub Pages

1. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Add a repository secret **`VITE_API_URL`** set to your backend URL, e.g.
   `https://api.example.com`.
3. Push to `main`. `deploy-frontend.yml` builds `frontend/dist` and publishes it.

> The workflow assumes a **project site** (`https://USERNAME.github.io/show-pickr/`) and
> sets `VITE_BASE` to `/${{ github.event.repository.name }}/`. If this repo is a
> user/org site (`https://USERNAME.github.io`), change `VITE_BASE` to `/` in
> `deploy-frontend.yml`.

> **CORS**: make sure the backend's `FRONTEND_ORIGIN` secret matches the Pages origin
> (`https://USERNAME.github.io`) — scheme + host only, no path.

---

## 3. Verify

- **Backend**: `curl https://api.example.com/api/health` → `{"ok":true}`.
- **Frontend**: open `https://USERNAME.github.io/show-pickr/`; create a session and
  confirm the socket connects (browser devtools → Network → WS). Requests should go to
  `https://api.example.com`.

---

## 4. Notes

- The SQLite database persists in the `db-data` Docker volume on the EC2 instance. Back
  it up with, e.g. a cron `docker run --rm -v showpickr_db-data:/data ...` copy of
  `prod.db`, or switch to RDS Postgres later for multi-instance scaling.
- Socket.io uses long-lived WebSockets; Caddy passes them through without extra config.
- If GitHub Pages is enabled but `VITE_BASE` is wrong, assets 404 — adjust it to `/` for
  a user/org site or `/<repo-name>/` for a project site.
