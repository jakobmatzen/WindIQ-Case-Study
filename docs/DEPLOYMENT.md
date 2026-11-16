# Deployment guide: Hetzner + GitHub Actions + Supabase

## How it fits together

```
 feature branch ──PR──▶ dev ──PR──▶ main
                          │               │
                    GitHub Actions   GitHub Actions
                          │               │
   lint+typecheck+tests → build Docker image → push to GHCR
                     → run Drizzle migrations on Supabase (dev / prod project)
                     → SSH to server → pull image → restart app + worker
                     → smoke test: GET <APP_URL>/api/health must return 200
                          │               │
                          ▼               ▼
   Hetzner VPS:  Caddy (HTTPS) ─┬─ dev.<domain>  → app-development    worker-development
                                └─ <domain>      → app-production     worker-production
```

- **app-\*** is the Next.js web app. **worker-\*** runs from the same image (`bun worker.js`) and does the scheduled jobs, e.g. fetching measurements. There is exactly one worker per environment.
- Health endpoints: `/api/health/live` only checks that the process is up (Docker uses it). `/api/health` checks the DB and the age of the last successful sync and returns **503** when something is wrong. Point your uptime monitor at it.

- **Supabase** hosts both databases (your two projects). The server only runs the app.
- **GHCR** (GitHub Container Registry) stores the Docker images. It's free and private by default.
- **Caddy** is the web server in front of the app. It gets HTTPS certificates automatically.
- No domain yet? The setup script uses `<ip>.sslip.io` and `dev.<ip>.sslip.io`. These are free hostnames that resolve to your IP and still get real HTTPS.

Steps 1–5 are one-time setup. After that you only push code.

---

## 1. Collect your Supabase values (do this for BOTH projects)

In the Supabase dashboard for each project:

| What | Where | Used as |
| --- | --- | --- |
| **Transaction pooler** URI (port **6543**) | Connect → ORMs / Connection string → Transaction pooler | `DATABASE_URL` (the running app) |
| **Session pooler** URI (port **5432**) | Connect → Connection string → Session pooler | `MIGRATION_DATABASE_URL` (CI migrations) |

Notes:
- Replace `[YOUR-PASSWORD]` with the database password. If the password contains special characters (`@ : / ? #`), URL-encode them or reset the password to an alphanumeric one.
- Don't use the "Direct connection" (`db.<ref>.supabase.co`). It's IPv6-only, and GitHub runners have no IPv6.
- Recommended: Project Settings → **Data API** → disable it. The app only talks to Postgres via Drizzle, so the public REST API isn't needed. (All tables have RLS enabled anyway, which blocks it as a second line of defense.)

For local development, put the **dev** project values into `.env.local` (see `.env.example`).

## 2. Create SSH keys (on your machine)

```bash
# Your personal key for logging into the server (skip if ~/.ssh/id_ed25519 exists)
ssh-keygen -t ed25519 -C "you@laptop"

# A separate key that ONLY GitHub Actions uses (no passphrase)
ssh-keygen -t ed25519 -f ~/.ssh/windiq_deploy -N "" -C "github-actions-deploy"
```

## 3. Create the Hetzner server

1. Sign up at https://console.hetzner.cloud, then create a project (e.g. "WindIQ").
2. **Add Server**:
   - Location: Falkenstein / Nuremberg (Germany) or Helsinki
   - Image: **Ubuntu 24.04**
   - Type: the cheapest **shared x86 (Intel/AMD)** plan with ≥ 4 GB RAM. Avoid the **ARM (Ampere)** plans: the CI builds x86 (amd64) images, which won't run on ARM.
   - Networking: keep Public IPv4 enabled
   - SSH keys: **Add SSH key** → paste `~/.ssh/id_ed25519.pub` (your personal key)
   - Create. Note the IPv4 address.
3. Copy the setup script to the server and run it:

```bash
scp deploy/setup-server.sh root@<SERVER_IP>:
ssh root@<SERVER_IP> bash setup-server.sh
```

When prompted:
- **GitHub repo**: `<your-github-user>/WindIQ-Case-Study`
- **Domains**: press Enter twice to use sslip.io for now
- **Deploy public key**: paste the output of `cat ~/.ssh/windiq_deploy.pub`

The script installs Docker, a firewall (only ports 22/80/443), fail2ban and automatic security updates. It disables SSH password login and creates a `deploy` user for GitHub Actions. At the end it prints the URLs and a **host-key line**; keep that line for step 4.

Check that the deploy key works: `ssh -i ~/.ssh/windiq_deploy deploy@<SERVER_IP> docker ps`

## 4. Create the GitHub repo and configure it

Create the repo as **public**. On GitHub Free, environment secrets/variables, deployment branch rules and required reviewers only work in public repos (private repos need GitHub Pro/Team). No secrets live in the repo: `.env*`, the case study PDF and the research notes are gitignored. Double-check with `git status` before every first push.

```bash
git add -A && git commit -m "Initial setup"
git branch -M main
git remote add origin git@github.com:<you>/WindIQ-Case-Study.git
git push -u origin main          # → first PRODUCTION deploy (will fail until secrets exist; that's OK)
git switch -c dev && git push -u origin dev
```

On GitHub, open **Settings**:

### 4a. Repository secrets (Settings → Secrets and variables → Actions → *Secrets* → New repository secret)

| Name | Value |
| --- | --- |
| `SSH_HOST` | the server IP |
| `SSH_PRIVATE_KEY` | full contents of `~/.ssh/windiq_deploy` (the file **without** `.pub`) |
| `SSH_KNOWN_HOSTS` | the host-key line printed by the setup script (`<ip> ssh-ed25519 AAAA…`) |
| `WINDIQ_CLIENT_ID` | from the case study PDF |
| `WINDIQ_CLIENT_SECRET` | from the case study PDF |

### 4b. Environments (Settings → Environments → New environment)

Create **`development`** and **`production`**. In each one:

- **Deployment branches and tags** → "Selected branches": `dev` for development, `main` for production.
- (production only, optional) **Required reviewers**: add yourself so prod deploys wait for a click.
- **Environment secrets**:
  - `DATABASE_URL`: transaction pooler URI (6543) of that Supabase project
  - `MIGRATION_DATABASE_URL`: session pooler URI (5432) of that Supabase project
- **Environment variables**:
  - `APP_URL`: e.g. `https://dev.<ip>.sslip.io` / `https://<ip>.sslip.io`, without a trailing slash. The smoke test calls it, and it's shown as a link on the deploy run.

### 4c. Protect `main` (Settings → Rules → Rulesets → New branch ruleset)

Target `main` (and optionally `dev`): require a pull request, and require the **CI / check** status check to pass.

## 5. First deploy

Actions tab → **Deploy** → *Run workflow*: run it once on `dev`, then once on `main`. Then open the URLs.
If something fails, click into the failed step; the log tells you which secret or variable is wrong.

---

## Day-to-day workflow

1. `git switch dev && git pull && git switch -c feature/my-thing`
2. Code. For DB changes, edit `src/db/schema.ts` → `bun run db:generate --name my_thing` → review the SQL in `drizzle/`.
3. Push, open a PR into `dev`. CI runs lint, typecheck, tests and build, and fails if you forgot to generate a migration.
4. Merge. The pipeline migrates the **dev** DB and deploys to `dev.<domain>`.
5. When dev looks good, open a PR `dev` → `main` and merge. The pipeline migrates **prod** and deploys.

### Migration rules of thumb

- Migrations run **before** the new container starts, so the old code briefly runs against the new schema. Make changes **backwards compatible**:
  - Adding tables/nullable columns: fine.
  - Renaming or dropping a column: do it in two releases (1. add the new column and update the code; 2. drop the old one).
- Drizzle has no automatic "down" migrations. To undo something, write a new migration.
- Keep RLS enabled on every `public` table (see the comment in `schema.ts`).

### Useful server commands

```bash
ssh root@<SERVER_IP>
cd /opt/windiq
docker compose ps                         # what's running
docker compose logs -f app-production     # app logs (Ctrl+C to exit)
docker compose logs -f worker-production  # worker logs (JSON lines)
docker compose logs -f caddy              # HTTPS / proxy logs
docker compose restart app-development
```

### Rolling back the app

Every deploy also pushes an image tagged `<env>-<commit-sha>`. The simplest rollback is to revert the commit on `main` and let the pipeline run. For an emergency rollback on the server:

```bash
cd /opt/windiq && source .env
docker login ghcr.io -u <github-user>     # password: a GitHub token with read:packages
docker pull $IMAGE_REPO:production-<old-sha>
docker tag  $IMAGE_REPO:production-<old-sha> $IMAGE_REPO:production
docker compose up -d app-production worker-production
```

### Switching to a real domain later

1. At your DNS provider, create **A records** pointing `example.com` and `dev.example.com` to the server IP.
2. On the server, edit `/opt/windiq/.env` (`PROD_DOMAIN`, `DEV_DOMAIN`), then run `cd /opt/windiq && docker compose up -d caddy`.
3. Update `APP_URL` in the GitHub environments.
