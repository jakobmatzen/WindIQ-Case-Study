# Changelog

All versions of the WindIQ case study. Newest first. Process: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## v1.0.0-beta.9 – 2026-11-18

- Dashboard shows the trend of P50 and P90, energy per month with each month's data coverage, rejected readings per reason and the latest worker runs with a link to the status page
- Each result stores its months and rejections (migration 0005); months are scaled up to their full hours and add up to gross AEP (test-first in core)
- Chart tooltips open instantly on hover and on tap
- The public page shows no raw error text; a run left open past the sync limit shows as aborted

## v1.0.0-beta.8 – 2026-11-18

- Dashboard in WindIQ's style: navy rail with site, data status, app version, P90 (bank) and P50 (project developers), data coverage with the 70 % / 90 % thresholds
- Key figures: gross and net AEP, full-load hours, capacity factor
- Derivation for consultants: mean wind at mast → height factor → hub, then a waterfall from gross over each loss to net and P90, each step with its turbine or site version
- Each result now stores the mean wind at the mast (migration 0004); `deriveYield` in core re-traces the stored result, tested against the reference values

## v1.0.0-beta.7 – 2026-11-18

- Every WindIQ request has a 30 s timeout; 5xx, 429, network errors and timeouts are retried up to 4 times with growing waits, honouring `Retry-After`
- An expired token (401) is renewed once and the request repeated
- Measurement pages and the token response are shape-checked; a reading without a valid hour or version is skipped and logged instead of failing the page
- Worker logs every retry and skipped reading
- Start page shows an outage notice once the last successful sync is older than 2 h; the last result stays visible

## v1.0.0-beta.6 – 2026-11-18

- Worker fetches corrections via `updated_since` from its own per-mast cursor, saved after every page
- A reading replaces the stored one only with a higher version (test-first in core)
- `sync_runs` counts corrections per run, also for failed runs
- New hours are fetched before corrections, so a correction problem cannot hold them back
- Recalculation check moved into core and tested: corrections and new turbine or site versions create a new result

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
