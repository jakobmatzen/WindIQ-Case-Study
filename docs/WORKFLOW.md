# Workflow

How work moves from a Linear ticket to production. Skills carry the step-by-step recipes; this file holds the model they implement.

## Guardrails

Each of these needs the user's explicit go, every time:

- `git push` (branches and tags)
- creating or switching branches
- changing GitHub or Linear settings (rulesets, repo settings)
- merging a PR: the user reviews it, then says "merge #N"
- applying database migrations (`bun run db:migrate`, `drizzle-kit migrate` or `push`) to any database, including a local throwaway one

Committing on a feature branch needs no go: commit at logical checkpoints with the `commit` skill and tell the user. Editing `src/db/schema.ts` and generating a migration with `bun run db:generate` need no go either.

## Branches and merges

```
Linear ticket ──► feature branch (from dev) ──/ship──► PR → dev        (squash)
                                                          │
dev ──/release──► release/vX.Y.Z ──► PR → main           (squash)
                                          │ deploy green
main ──────────────────────────────► PR → dev            (merge commit = forward integration)

hotfix branch (from main) ──/ship──► PR → main           (squash), then forward integration
```

- **Feature branch**: named exactly as Linear's `gitBranchName` for the ticket. Stays local until `/ship`.
- **Squash** for every PR into `dev` or `main`, so each lands as one commit.
- **Forward integration** `main → dev` is always a real merge commit: a squash would leave the merge base behind and the branches would drift.
- **Merging** happens on the user's "merge #N", via `gh pr merge`: `--squash` with the exact title and body of the PR's "Squash commit" block for PRs into `dev` or `main`, `--merge` for forward integration. GitHub then deletes the head branch; delete the local one too and `git switch dev && git pull`.

## Commit titles on `dev` and `main`

The squash commit that lands on `dev` or `main`:

```
v1.0.0-beta.3

- Short bullet about what changed
- Another one

#12
```

Title is the version, body is bullets, footer is the PR number with `#`. Each PR description carries this message in its "Squash commit" block, so the user sees before merging exactly what will land.

## Versioning

- One ticket = one branch = one PR = one version bump.
- The target version is the ticket's Linear milestone (e.g. `v1.0.0`). On `dev` it counts up as `v1.0.0-beta.1`, `-beta.2`, …
- `main` never carries a beta: `/release` strips the suffix (`v1.0.0`). After a release, only hotfixes reach `main`, as patch bumps (`v1.0.1`), never a beta.
- New development after a release starts from a new milestone (e.g. `v2.0.0` → `v2.0.0-beta.1`).
- `package.json` `version` and the newest `CHANGELOG.md` heading always match, `v` prefix included (`v1.0.0`). Git tags only for releases on `main`.

## Code quality

- Code follows `docs/ARCHITECTURE.md`; ESLint enforces its layer boundaries.
- `src/core` is written test-first with the `mattpocock-skills:tdd` skill.
- `/ship` runs an automatic `code-review` before the PR; the user reviews after. `simplify` runs once per release in `/release`, where it sees the whole release diff for the token cost of one run.

## Documentation

- **`CHANGELOG.md`**: newest first, `## vX.Y.Z-beta.N – YYYY-MM-DD`, plain short bullets.
- **The guide** is `README.md` (German, for Vidia Equity and the user's interview). The Linear project description (P-JAK-1) mirrors it without the "Lokal starten" section. `/ship` and `/release` update both together. Keep the guide high-level: structure, workflow, decisions and why. Implementation detail belongs in code and `docs/`.
- **Assumptions**: when the task or the API docs leave a question open, pick a working assumption, keep going, and record both in the guide's "Annahmen" table. Questions actually sent to Vidia Equity (the company behind the case study; WindIQ is the project) are marked there.

## Language

Code, commits, PRs, CHANGELOG, skills and `docs/` in English. The guide (README, Linear) and Linear tickets in German.

All documentation is gender-neutral. In German, use neutral forms without a gender star: *Gutachtende*, *Projektierende*, *Nutzende*, *Projektentwicklungsfirmen*; institutions (*Bank*) stay as they are. In English, use *they* or the role (*the user*).

## UI work

Before building UI, show the user reviewable samples, made with the `better-ui`, `emil-design-eng` and `mattpocock-skills:prototype` skills. Match WindIQ's visual style from their website and documents, in light mode.

Every PR that adds or changes UI shows screenshots of each affected screen, in the PR description and on the Linear ticket. `/ship` takes them.
