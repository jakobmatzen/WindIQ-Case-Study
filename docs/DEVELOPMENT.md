# Development

Next.js 16 · React 19 · shadcn/ui · Tailwind 4 · bun · Supabase (Postgres) · Drizzle ORM

## Local development

```bash
cp .env.example .env.local   # fill in your Supabase DEV project values
bun install
bun dev                      # web app on http://localhost:3000
bun run worker               # background worker (second terminal)
bun test                     # unit tests
bun run format               # Prettier (CI runs format:check)
```

## Database (code-first with Drizzle)

The schema lives in `src/db/schema.ts`. Migrations are generated into `drizzle/` and committed.

| Command | What it does |
| --- | --- |
| `bun run db:generate --name <change>` | Diff the schema against the last migration and write a new SQL file |
| `bun run db:migrate` | Apply pending migrations to `DATABASE_URL` (CI does this on deploy) |
| `bun run db:studio` | Open Drizzle Studio to browse data |
| `bun run db:check` | Sanity-check the migration files |

Workflow: edit `schema.ts` → `db:generate` → **read the generated SQL** → commit → open PR.
Never use `drizzle-kit push` against dev/prod: it bypasses migration history.

All DB access goes through `getDb()` from `@/db` (Drizzle, server-side only). There is no login, and Supabase is used purely as hosted Postgres.

## Layout

```
src/core/            Pure domain logic (parse, validate, calculate)
src/sources/         Data source adapters (WindIQ API)
src/db/              Drizzle schema + client
src/server/          Data access layer for the web app (server-only)
src/worker/          Background worker (scheduled jobs, records runs in sync_runs)
src/app/api/health/  Health checks: /live (process up) and / (DB + sync freshness)
drizzle/             Generated SQL migrations (commit these)
deploy/              docker-compose, Caddyfile, one-time server setup script
.github/workflows/   ci.yml (PRs), deploy.yml (dev/main)
.claude/skills/      Project skills: /ship, /release, commit
```

Layer rules: [ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment

`dev` → dev environment, `main` → production, via GitHub Actions on a Hetzner server.
Full setup guide: [DEPLOYMENT.md](DEPLOYMENT.md). Branching and versioning: [WORKFLOW.md](WORKFLOW.md).
