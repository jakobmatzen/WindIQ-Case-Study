# Changelog

All versions of the WindIQ case study. Newest first. Process: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## v1.0.0-beta.5 – 2026-11-18

- Yield calculated test-first: height correction, power curve, gross and net AEP, P50, P90, extrapolated to a full year, with coverage warnings below 90 % and 70 %
- Turbine and site fetched from the API, shape-checked and stored once per version
- Worker recalculates after every sync and stores a result with its window and versions whenever an input changed
- Start page shows P50, P90 and data coverage from the latest result; `/api/health` also watches the yield job
- Applying database migrations now needs the user's go

## v1.0.0-beta.4 – 2026-11-17

- Wind readings are checked test-first: UTC hour, m/s value and a status per reading (`missing`, `sentinel`, `out_of_range`, …)
- Worker imports the full year from the WindIQ API, then syncs new hours every 15 minutes; 5xx answers are retried
- Readings stored per mast and hour with raw value and version; newest version wins
- Start page shows the data coverage of the last 12 months
- `/ship` and `/release` wait for CI checks to appear

## v1.0.0-beta.3 – 2026-11-17

- Architecture with fixed layers in `docs/ARCHITECTURE.md`, enforced by ESLint
- `sync_runs` access moved into a db repository; data access layer `src/server` for the web app
- Prettier with Tailwind class sorting and `noUncheckedIndexedAccess`, both checked in CI
- `/ship` reviews every branch with `code-review` and `simplify` before the PR

## v1.0.0-beta.2 – 2026-11-17

- PRs are merged by Claude on the user's "merge #N", with the exact squash commit message
- Forward integration lands as a real merge commit
- GitHub deletes merged branches automatically

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
