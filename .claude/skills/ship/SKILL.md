---
name: ship
description: Finish the current ticket. Run CI checks, bump the version, update CHANGELOG and guide, then plan the push and PR.
disable-model-invocation: true
---

# Ship

Turns a finished feature or hotfix branch into an open PR. Background: `docs/WORKFLOW.md`.

## 1. Orient

1. `git fetch origin`. Confirm the current branch is a ticket branch (not `dev`, `main` or `release/*`) and the tree is clean; commit leftovers with the `commit` skill first.
2. Find the ticket: the `jak-<n>` in the branch name → Linear issue `JAK-<n>`. Read its title, description and milestone.
3. Pick the **mode** from the branch's base:
   - **feature**: `origin/dev` is an ancestor of `HEAD` → PR targets `dev`.
   - **hotfix**: `origin/main` is an ancestor, `origin/dev` is not → PR targets `main`.
   - Both or neither: ask the user.

Done when you can name ticket, mode and target branch.

## 2. Check

Run every step of `.github/workflows/ci.yml` locally, in its order, including the migration drift check and both builds. Afterwards remove any migration the drift check generated.

- Mechanical failures (lint, formatting, type errors with an obvious fix): fix, commit with `commit`, rerun all checks.
- Anything touching behaviour, or unclear: stop and ask.

Done when every CI step passes in one uninterrupted run.

## 3. Version

Current version: `package.json` `version`.

- **feature**: target = the ticket's milestone without `v` (e.g. `1.0.0`). Current is `<target>-beta.N` → `<target>-beta.<N+1>`; otherwise → `<target>-beta.1`. No milestone: ask.
- **hotfix**: take `main`'s version (`git show origin/main:package.json`) and bump the patch (`1.0.0` → `1.0.1`). Never a beta.

Write the new version to `package.json`.

## 4. Document

1. `CHANGELOG.md`: new section at the top, `## v<version> – <today YYYY-MM-DD>`, two to five short bullets about what this ticket delivered.
2. Guide (`README.md` and the Linear project description of P-JAK-1, kept identical apart from "Lokal starten"): add what this ticket changed that matters for explaining the project: a decision and why, a new building block, a new open question with its working assumption. Skip if nothing qualifies. German, short.
3. Commit with `commit`: title `Prepare v<version>`.

## 5. Plan

Show the user, then wait for "go":

- push command: `git push -u origin <branch>`
- PR: base (`dev` or `main`), title `v<version>`
- PR body, in this shape:

````markdown
## Summary
<2-4 sentences: what and why>

## Changes
- <bullets>

Linear: JAK-<n>

## Squash commit
Title: `v<version>`
```
- <bullets from Changes>

#<PR number>
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

## 6. Open

On "go":

1. Push, then `gh pr create --base <target> --title "v<version>" --body-file <file>`.
2. Fill the real PR number into the squash commit footer (`gh pr edit <n> --body-file <file>`).
3. Linear: ticket → "In Review", attach the PR link.
4. Give the user the PR URL. Leave the PR open: the user reviews and merges by hand, using the squash commit block.
5. **hotfix** only: remind the user that after merging, `/release` does the forward integration `main → dev` (its "Forward integration" section).
