# Changelog

All versions of the WindIQ case study. Newest first. Process: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## v1.0.0-beta.1 – 2026-11-17

- Workflow rules for branches, merges and versioning (`docs/WORKFLOW.md`)
- Project skills `/ship`, `/release` and `commit`; UI PRs carry screenshots
- This changelog, starting with the 0.1.0 foundation
- German README as the project guide, mirrored in Linear
- Branch protection for `dev`, ESLint ignores the worker bundle

## 0.1.0 – 2026-11-16

- Next.js 16 app with React 19, shadcn/ui, Tailwind 4 and bun
- Drizzle schema and migrations on Supabase Postgres, with a `sync_runs` table
- Background worker with a sync loop, JSON logs and a heartbeat for Docker
- Health checks `/api/health/live` and `/api/health`
- Docker image, Hetzner server with Caddy, GitHub Actions for CI and deploy
