# Architecture

How the code is organised and why. ESLint enforces the layer boundaries (`eslint.config.mjs`); this file explains them.

## Goal

"Scalable" here means: more measurement masts and data sources without a rebuild, and logic that a wind consultant can follow step by step. It does not mean microservices or queues: one week of operation on one server does not need them.

## Layers

```
            ┌──────────────── worker process ────────────────┐
WindIQ API ─► sources ─► core (parse, validate, calculate) ─► db
            └────────────────────────────────────────────────┘
                                                               │
            ┌──────────────── web process ───────────────────┐ │
  browser ◄─ app (pages, route handlers) ◄─ server (DAL) ◄─────┘
            └────────────────────────────────────────────────┘
```

| Folder | Role | May import |
| --- | --- | --- |
| `src/core` | Domain logic as **pure functions**: parsing and validating measurements, height correction, power curve, AEP, P50/P90, data coverage. No I/O, no framework. | `lib`, npm libraries without I/O |
| `src/sources` | One adapter per data source, behind a shared interface. Talks HTTP, handles auth, retries and paging, and maps responses into `core` types. | `core`, `lib` |
| `src/db` | Drizzle schema, client and **repositories** (e.g. `sync-runs.ts`). All SQL lives here. Other layers import only `@/db` (its `index.ts`). Shared by worker and web. | `core`, `lib` |
| `src/worker` | Orchestration: fetch from `sources`, run `core`, write to `db`, log every run in `sync_runs`. | `sources`, `core`, `db`, `lib` |
| `src/server` | **Data Access Layer** for the web app: `import "server-only"`, returns small DTOs for pages. The only way the web app reaches the database. | `db`, `core`, `lib` |
| `src/app` | Routes: pages (Server Components) and route handlers. Read data only through `server`. | `server`, `components`, `core`, `lib` |
| `src/components` | UI. `ui/` holds shadcn components. Receives data as props. | `components`, `core`, `lib` |
| `src/lib` | Small helpers (`cn`, health evaluation), pure like `core`. Importable from every layer. | nothing internal |

Imports across layers use the `@/` alias; relative imports stay inside a layer. ESLint checks both forms, and also bans packages a layer has no business with (e.g. `drizzle-orm` in `app`). `core` and `lib` additionally reject every Node built-in and Bun's runtime API.

## Rules

- **Core decides, edges do I/O.** Every rule about data quality or energy yield lives in `core` and is unit-tested. Adapters, repositories and pages stay thin.
- **Invalid data is data, not an error.** Validation returns a status per value (`valid`, `missing`, `sentinel`, …) instead of throwing, so coverage and rejections stay visible. Exceptions are for broken infrastructure (API down, DB unreachable).
- **Validate at the boundary.** Everything from the API is untrusted. `sources` checks the response shape before anything reaches `core`.
- **Exchangeable data sources.** The worker depends on the source interface, not on WindIQ's API. A second mast or a LiDAR is a new adapter in `sources`, nothing else changes.
- **Traceable results.** Each stored result records the turbine, site and mast versions and the data window it was calculated from.
- **The web app never calls the API.** If WindIQ's API is down, the dashboard keeps showing the last stored result.
- **Configuration from env only**, read at the edges (`db`, `sources`, `worker`), never in `core` or components.

## Next.js 16 conventions

| Topic | Decision | Why |
| --- | --- | --- |
| Rendering | Pages are **Server Components** and read through `server`. `"use client"` only for interactive parts (charts, toggles), as small leaves. | Data and secrets stay on the server, little JS in the browser |
| Caching | `cacheComponents` is on. Dashboard data is read **at request time inside `<Suspense>`**, no `"use cache"`. | The worker runs in its own process and cannot invalidate Next's cache. The queries are small, so fresh reads cost little. Revisit only if load requires it. |
| Route handlers | Only for machine endpoints (`/api/health`). | Pages read data directly on the server, so no internal REST API is needed |
| `server-only` | Every `src/server` module imports it. | Build fails if one ends up in a client bundle |

`server-only` throws outside Next's server bundles, so the worker and `bun test` must not import `src/server`. Shared logic for both belongs in `core` or `db`.

## Next.js for Nuxt developers

| Next.js | Nuxt equivalent |
| --- | --- |
| `src/app/page.tsx`, `layout.tsx` | `pages/index.vue`, `layouts/default.vue` |
| Server Component (default) | a component whose data comes from `useAsyncData` on the server, except it ships no JS to the browser at all |
| Client Component (`"use client"`) | a normal hydrated Vue component |
| Route handler `src/app/api/x/route.ts` | `server/api/x.ts` |
| `import "server-only"` | code under `server/`, never bundled for the client |
| `"use cache"` + `cacheLife` | Nitro `cachedFunction` / route rules with `swr` |
| separate worker container | a Nitro scheduled task, but in its own process |

## Testing

- **`core` is written test-first** (`mattpocock-skills:tdd`): every rule gets a failing test before the code. Fixtures come from real API data (`-999`, km/h, `+02:00`, strings, `null`), and the calculation is checked against the reference values in `CONTEXT.md` (height factor ≈ 1.07, net ≈ 90.3 % of gross, P90 ≈ 87.2 % of P50).
- **`sources`** is tested against a stubbed `fetch`: 401 → new token, 503 → retry, paging until `next_cursor` is `null`.
- Tests sit next to the code as `*.test.ts` and run with `bun test`.
