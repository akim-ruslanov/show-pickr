# Deployment setup

This project deploys with two GitHub Actions workflows:

| Workflow | What it deploys | Where |
| --- | --- | --- |
| `deploy-frontend.yml` | Vite build (`frontend/dist`) | GitHub Pages |
| `deploy-backend.yml` | Node + Express + Socket.io (Docker) | single EC2 instance + Caddy (HTTPS) |

The backend uses an IAM-role-based setup (GitHub OIDC) instead of SSH:

- GitHub Actions assumes `showpickr-github-deploy-role` via OIDC (no static AWS keys, no SSH private key).
- The EC2 instance is created by a CloudFormation stack (no manual console launch).
- Deploys run over **SSM** — the security group has **no SSH port**.
- The host is resolved automatically by the instance tag `Name=showpickr-backend` (no `EC2_HOST` secret).

> **Why one EC2 instance (not Fargate)?** The backend uses a single SQLite file. A
> single instance with a Docker volume is the simplest way to keep that file persistent
> for an MVP, and `t3.micro` is free-tier eligible (Fargate is not). Caddy sits in front
> of the app to provide HTTPS, which is required because the GitHub Pages site is served
> over HTTPS and browsers block mixed-content requests to a plain-HTTP backend.

---

## 0. Prerequisites

- An AWS account (Free Tier).
- The AWS CLI installed locally with credentials that can create IAM roles, EC2, and
  CloudFormation stacks (admin is easiest). Used **once** for the bootstrap.
- A domain (e.g. `example.com`) with DNS you control, for the backend's HTTPS
  certificate (`api.example.com`).

---

## 1. One-time bootstrap (creates everything)

This single command creates the OIDC provider, IAM roles, the EC2 instance, an Elastic
IP, and an S3 output bucket. It is the only step that needs local AWS credentials —
it can't be automated by GitHub Actions because the workflow needs the IAM role to
exist *before* it can assume it (chicken-and-egg).

```bash
cd path/to/show-pickr

aws cloudformation deploy \
  --stack-name showpickr-backend \
  --template-file deploy/aws/backend-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

- To use Route 53 for an automatic `A` record, add
  `--parameter-overrides HostedZoneId=Z0123456789ABCDEF DomainName=api.example.com`.
  Otherwise create the `api.example.com` A record manually, pointing at the Elastic IP.
- The AMI defaults to `ami-0d53cc9bd365ad65b` (Amazon Linux 2023, us-west-2) — update it
  in the template when AWS rotates it.

Get the Elastic IP (if you aren't using Route 53):

```bash
aws cloudformation describe-stacks \
  --stack-name showpickr-backend \
  --query 'Stacks[0].Outputs[?OutputKey==`BackendPublicIp`].OutputValue' \
  --output text
```

Point `api.example.com` (A record) at that IP.

The instance bootstraps itself via user-data: installs Docker + Compose + git, adds swap,
and clones this repo to `/home/ec2-user/app`. The first `docker compose up` happens on the
first deploy below.

---

## 2. GitHub variables and secrets

Repo **Settings → Secrets and variables → Actions**:

### Variables

| Variable | Value |
| --- | --- |
| `AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/showpickr-github-deploy-role` |
| `AWS_REGION` | `us-west-2` (optional; defaults to this) |

`AWS_ROLE_ARN` is the `DeployRoleArn` output of the bootstrap. Get it with:

```bash
aws cloudformation describe-stacks \
  --stack-name showpickr-backend \
  --query 'Stacks[0].Outputs[?OutputKey==`DeployRoleArn`].OutputValue' \
  --output text
```

### Repository secrets

| Secret | Value |
| --- | --- |
| `MOTN_API_KEY` | your MovieOfTheNight API key |
| `SITE_ADDRESS` | `api.example.com` |
| `FRONTEND_ORIGIN` | your GitHub Pages origin, e.g. `https://USERNAME.github.io` (no path; used for CORS) |

> The old SSH-based secrets (`EC2_HOST`, `EC2_SSH_USER`, `EC2_SSH_KEY`, `EC2_SSH_PORT`)
> are no longer used and can be deleted.

---

## 3. Deploy

Push to `main` (or run the workflow manually). `deploy-backend.yml` will:

1. Assume `showpickr-github-deploy-role` via OIDC.
2. Resolve the instance id by the `Name=showpickr-backend` tag.
3. Wait for the SSM agent to come online.
4. Run `git pull` + `deploy/backend/deploy.sh` over SSM (which writes `backend/.env`
   from the secrets and runs `docker compose up -d --build`).
5. Stream the full command output from S3.

---

## 4. Verify

- **Backend**: `curl https://api.example.com/api/health` → `{"ok":true}`.
- **Frontend**: open `https://USERNAME.github.io/show-pickr/`; create a session and
  confirm the socket connects (browser devtools → Network → WS). Requests should go to
  `https://api.example.com`.

---

## 5. Emergency / admin access (no SSH)

There is no SSH port. To get a shell on the instance, use SSM Session Manager:

```bash
aws ssm start-session --target i-INSTANCE_ID
```

(Requires the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).)
You can also open **Systems Manager → Session Manager** in the AWS console.

---

## 6. Changing infrastructure

Edit `deploy/aws/backend-stack.yaml`, then re-run the bootstrap `aws cloudformation
deploy` command above. It is idempotent — it updates the stack in place. The app
containers survive instance-stack updates that don't recreate the instance (SQLite lives
in the `db-data` Docker volume).

---

## 7. Notes

- The SQLite database persists in the `db-data` Docker volume on the EC2 instance. Back
  it up with, e.g. a cron `docker run --rm -v showpickr_db-data:/data ...` copy of
  `prod.db`, or switch to RDS Postgres later for multi-instance scaling.
- Socket.io uses long-lived WebSockets; Caddy passes them through without extra config.
- If GitHub Pages is enabled but `VITE_BASE` is wrong, assets 404 — adjust it to `/` for
  a user/org site or `/<repo-name>/` for a project site (see `deploy-frontend.yml`).
- The deploy role's OIDC trust allows `repo:akim-ruslanov/show-pickr:*`. Tighten it to
  `repo:akim-ruslanov/show-pickr:ref:refs/heads/main` in `backend-stack.yaml` if you
  deploy only from `main`.
- The instance is launched into your account's **default VPC/subnet**. If you use a
  custom VPC, add a `SubnetId` parameter and pass it to the `Instance` resource in
  `backend-stack.yaml` (and, for private subnets, add VPC endpoints for SSM/EC2Messages
  and an internet gateway/NAT for Docker + Let's Encrypt).
