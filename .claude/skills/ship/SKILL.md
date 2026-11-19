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
   - Both (`dev` and `main` on the same commit): **feature**, unless the branch was cut from `main` for a hotfix.
   - Neither: ask the user.

Done when you can name ticket, mode and target branch.

## 2. Review

1. Invoke the `code-review` skill at `medium` on this branch against its target (`origin/<target>...HEAD`). Fix every confirmed finding; list the ones you leave, with the reason, for the PR's "Review notes".
2. Commit the fixes with `commit`.

Cleanups (`simplify`) run once per release in `/release`, not per ticket: they cost a lot of tokens and mostly find cosmetics.

Done when no confirmed finding is left unfixed or unexplained.

## 3. Check

Run every step of `.github/workflows/ci.yml` locally, in its order, including the migration drift check and both builds. Afterwards remove any migration the drift check generated.

- Mechanical failures (lint, formatting, type errors with an obvious fix): fix, commit with `commit`, rerun all checks.
- Anything touching behaviour, or unclear: stop and ask.

Done when every CI step passes in one uninterrupted run.

## 4. Version

Current version: `package.json` `version`.

- **feature**: target = the ticket's milestone, with its `v` (e.g. `v1.0.0`). Current is `<target>-beta.N` → `<target>-beta.<N+1>`; otherwise → `<target>-beta.1`. No milestone: ask.
- **hotfix**: take `main`'s version (`git show origin/main:package.json`) and bump the patch (`v1.0.0` → `v1.0.1`). Never a beta.

Write the new version to `package.json`, with the `v` prefix (`v1.0.0-beta.3`).

## 5. Document

1. `CHANGELOG.md`: new section at the top, `## v<version> – <today YYYY-MM-DD>`, two to five short bullets about what this ticket delivered.
2. Guide (`README.md` and the Linear project description of P-JAK-1, kept identical apart from "Lokal starten"): add what this ticket changed that matters for explaining the project: a decision and why, a new building block, a new assumption (open question and working answer). Skip if nothing qualifies. German, short.
3. **UI changed** (anything under `src/app` or `src/components` that renders): screenshot every affected screen in the running app, light mode, desktop width plus one phone width. Use Playwright (`bunx playwright screenshot`); if no browser is installed yet, ask before installing Chromium. Save them as `docs/screenshots/jak-<n>/<screen>.png`.
4. Commit with `commit`: title `Prepare v<version>`.

## 6. Plan

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

## Review notes
<only when findings were left open: finding and reason>

## Screenshots
<only when UI changed: one image per screen, taken in step 5, embedded in step 7>

## Squash commit
Title: `v<version>`
```
- <bullets from Changes>

#<PR number>
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

## 7. Open

On "go":

1. Push, then `gh pr create --base <target> --title "v<version>" --body-file <file>`.
2. Fill the real PR number into the squash commit footer (`gh pr edit <n> --body-file <file>`). With screenshots, embed each one in the same edit as `![<screen>](https://raw.githubusercontent.com/<owner>/<repo>/<commit sha>/docs/screenshots/jak-<n>/<screen>.png)`. The commit SHA keeps the link valid after the squash merge.
3. Linear: ticket → "In Review", attach the PR link. With screenshots, upload each one (`prepare_file_upload`) and add them to the ticket description under "Screenshots".
4. Wait for CI: right after creation `gh pr checks` reports no checks yet, so first wait until the `check` job appears (`until gh pr checks <n> 2>/dev/null | grep -qP '^check\t'; do sleep 5; done`), then `gh pr checks <n> --watch`. Give the user the PR URL and the CI result. The user reviews.

## 8. Merge

On "merge #<n>":

1. `gh pr merge <n> --squash --subject "v<version>" --body-file <file>`, where the file holds exactly the code block under "Squash commit" (bullets and `#<n>` footer).
2. `git switch dev && git pull --ff-only` (**hotfix**: `main`), then `git branch -D <branch>`. GitHub deletes the remote branch.
3. Show the user the landed commit (`git log -1`). Linear moves the ticket to "Done" via the GitHub integration; set it if it did not.
4. **hotfix** only: continue with `/release` → "Forward integration".
