# Changelog

All versions of the WindIQ case study. Newest first. Process: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## 0.1.0 – 2026-11-16

- Next.js 16 app with React 19, shadcn/ui, Tailwind 4 and bun
- Drizzle schema and migrations on Supabase Postgres, with a `sync_runs` table
- Background worker with a sync loop, JSON logs and a heartbeat for Docker
- Health checks `/api/health/live` and `/api/health`
- Docker image, Hetzner server with Caddy, GitHub Actions for CI and deploy
