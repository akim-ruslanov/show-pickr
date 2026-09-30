# ShowPickr

A Tinder-style "what should we watch" picker for small groups. Everyone in a session
swipes left (no) or right (yes) on movies/shows, and can **like several** at their own
pace. Once the group's fixed number of people have all finished picking, the server
tallies the likes: if everyone converged on the same title, that's the pick — with
links to where it's streaming.

Picking is **asynchronous**: members swipe and finish whenever they like; the result is
computed the moment the last person in the group finishes.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────────────┐
│  GitHub Pages (static)      │  HTTPS  │  AWS (ECS Fargate)                   │
│  Vite + React + TS          │ ──────► │  Node + Express + Socket.io          │
│  socket.io-client           │  REST   │  Prisma ORM                          │
│  framer-motion (swipe)      │  WS     │  proxies MovieOfTheNight API (key)   │
└─────────────────────────────┘         └──────────────┬───────────────────────┘
                                                       │
                                                  SQLite (file)
```

- **Frontend** is a static SPA, so it deploys to GitHub Pages (hash-based routing — no
  server redirects needed).
- **Backend** holds the MovieOfTheNight API key and exposes a small REST API + a
  Socket.io server. Deploy it anywhere that runs Node; AWS ECS Fargate (or any Node
  host) is the intended target.
- **Auth** is guest-only: the host creates a session (6-char code), shares the invite
  link, and members pick a display name.

## Repository layout

```
frontend/   Vite + React SPA (deploys to GitHub Pages)
backend/    Express + Socket.io + Prisma API (deploys to AWS)
.github/    GitHub Actions workflow for the frontend deploy
```

## Prerequisites

- Node.js 20+
- A MovieOfTheNight API key from <https://developers.movieofthenight.com/>

No database server is required — the backend uses a single SQLite file.

## Local development

### 1. Configure the backend

```bash
cp backend/.env.example backend/.env
# edit backend/.env and paste your key:
#   MOTN_API_KEY=your_key_here
```

### 2. Install and create the SQLite database

```bash
cd backend
npm install                   # also runs `prisma generate`
npm run db:push               # creates backend/prisma/dev.db
```

### 3. Configure the frontend

```bash
cp frontend/.env.example frontend/.env
# Leave VITE_API_URL empty — Vite proxies /api and /socket.io to :4000,
# so there is no CORS to configure (works on any port).
```

### 4. Run everything

From the repo root:

```bash
npm install
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:4000> (`/api/health`)

> **Caching:** in development, MovieOfTheNight responses are cached to disk
> (`backend/.cache/`) keyed by the exact request, so re-running the same filters or
> reloading won't re-spend your free-tier quota. Set `MOTN_CACHE=0` to disable, or
> delete `backend/.cache/` to force fresh data.

## Environment variables

### Backend (`backend/.env`)

| Variable       | Description                                             |
| -------------- | ------------------------------------------------------- |
| `DATABASE_URL` | SQLite file path, relative to `prisma/` (e.g. `file:./dev.db`) |
| `MOTN_API_KEY` | MovieOfTheNight API key (sent as `X-API-Key`)           |
| `PORT`         | Port the server listens on (default `4000`)             |
| `CORS_ORIGIN`  | Comma-separated allowed origins (use `*` for local dev) |
| `MOTN_CACHE`   | Disk-cache API responses (default: on in dev, off in prod) |
| `MOTN_CACHE_DIR` | Cache directory (default `.cache/`)                   |
| `MOTN_CACHE_TTL_SECONDS` | Cache lifetime (default `604800` = 7 days)    |

### Frontend (`frontend/.env`)

| Variable       | Description                                             |
| -------------- | ------------------------------------------------------- |
| `VITE_API_URL` | Backend base URL. Leave empty locally (Vite proxy avoids CORS); set to an HTTPS URL in production |
| `VITE_PROXY_TARGET` | Backend URL the Vite dev proxy forwards to (local dev only) |
| `VITE_BASE`    | Asset base path (`/` locally, `/repo-name/` on GH Pages)|

## Deploying

Deployment is driven by two GitHub Actions workflows:

- `.github/workflows/deploy-frontend.yml` — builds `frontend/dist` and publishes it to
  **GitHub Pages**.
- `.github/workflows/deploy-backend.yml` — pulls the latest code on a single **EC2**
  instance and rebuilds/restarts it with **Docker Compose + Caddy (HTTPS)**.

Full step-by-step setup (EC2 user-data, DNS, and the exact GitHub secrets to create) is
in **[`deploy/AWS_SETUP.md`](deploy/AWS_SETUP.md)**.

Quick summary:

1. **Frontend** — in **Settings → Pages** set the source to **GitHub Actions**, add a
   **`VITE_API_URL`** secret pointing at your backend (e.g. `https://api.example.com`),
   and push to `main`.
2. **Backend** — launch a free-tier `t3.micro` EC2 instance (Docker installed via
   user-data), point `api.example.com` at it, clone the repo to `/home/ec2-user/app`,
   and add the `EC2_*`, `SITE_ADDRESS`, `FRONTEND_ORIGIN`, and `MOTN_API_KEY` secrets.
   The SQLite database persists in a Docker volume on the instance. Set
   `FRONTEND_ORIGIN` to your GitHub Pages origin (e.g. `https://USERNAME.github.io`).

## How matching works

1. The host picks filters (country, streaming services, type, genres, keyword) and sets
   the **number of people** in the group (a fixed number, e.g. 3).
2. Starting the session fetches the first page of shows into a shared **deck**.
3. Each member independently swipes through the deck, liking/disliking multiple titles.
   A "no" just skips it for that member — it doesn't remove it for anyone else.
4. Each member clicks **Done** when they're finished. The first N-1 members finish and
   wait; the result is decided when the Nth person finishes.
5. A title wins (**consensus found**) only if it was liked by the whole group (the fixed
   number of people). Otherwise the session ends with **no agreement**.
6. Ties are broken by highest rating, then deck order. When the deck runs low, the
   server fetches the next page automatically.

## API (backend)

| Method | Path                        | Description                            |
| ------ | --------------------------- | -------------------------------------- |
| GET    | `/api/health`               | Health check                           |
| GET    | `/api/meta/countries`       | Countries + supported services         |
| GET    | `/api/meta/genres`          | Genre ids/names                        |
| POST   | `/api/sessions`             | Create a session (host)                |
| POST   | `/api/sessions/:code/join`  | Join a session                         |
| GET    | `/api/sessions/:code`       | Full session state                     |
| POST   | `/api/sessions/:code/start` | Host starts picking (fetches deck)     |
| POST   | `/api/sessions/:code/finish`| Member finishes picking                |
| POST   | `/api/sessions/:code/deck`  | Fetch the next page of the deck        |

Socket.io events: client emits `swipe`; server emits `session:state`, `session:started`,
`member:joined`, `swipe:recorded`, `member:finished`, `session:finished`, `deck:extended`.
