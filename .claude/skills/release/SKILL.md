---
name: release
description: Release dev to main (production), then forward-integrate main back into dev. Also does the forward integration after a hotfix.
disable-model-invocation: true
---

# Release

Takes `dev` to production. Background: `docs/WORKFLOW.md`. After a hotfix merge, skip to **Forward integration**.

## 1. Orient

1. `git fetch origin`. Local `dev` must equal `origin/dev` and the tree must be clean.
2. Release version = `package.json` on `dev` without the beta suffix (`1.0.0-beta.7` → `1.0.0`). Already without suffix: ask.
3. Collect the release contents: `git log origin/main..origin/dev --first-parent`, skipping forward-integration merges. Each remaining commit is one `v…-beta.N` squash; keep its title, bullets and `#PR` footer.

Done when you can list every beta going out, with its PR number.

## 2. Plan the release branch

Show the user, then wait for "go":

- new branch `release/v<version>` from `dev`
- the check run, version bump and docs below
- the push and the PR `release/v<version>` → `main`, title `v<version>`, with the body below

## 3. Prepare

On "go":

1. Create and switch to `release/v<version>`.
2. Run every step of `.github/workflows/ci.yml` locally, as in `/ship` step 2.
3. Set `package.json` `version` to `<version>`.
4. `CHANGELOG.md`: new top section `## v<version> – <today>`, bullets summarising the betas (one per beta is fine).
5. Guide (README and Linear P-JAK-1): add a line under "Releases": version, date, one sentence on what went live.
6. Commit with `commit`: title `Prepare v<version>`.
7. Push and open the PR. Body:

````markdown
## Release v<version>
<one sentence>

- v<version>-beta.1: <summary> (#<PR>)
- v<version>-beta.2: <summary> (#<PR>)

## Squash commit
Title: `v<version>`
```
- v<version>-beta.1: <summary> (#<PR>)
- …

#<this PR number>
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

Fill in the real PR number afterwards with `gh pr edit`. Wait for CI, then give the user the URL and wait for "merge #<n>".

## 4. Merge and verify the deploy

On "merge #<n>":

1. `gh pr merge <n> --squash --subject "v<version>" --body-file <file>` with exactly the "Squash commit" block. `git switch dev`, `git branch -D release/v<version>`.
2. `gh run list --branch main --workflow Deploy --limit 1`, then `gh run watch <id>` until it finishes.
3. Red: report the failing job and its log, and stop.
4. Green: ask for go to tag the squash commit `v<version>` on `main` and push the tag.

## Forward integration

After a green deploy on `main` (release or hotfix):

1. Plan for the user, then wait for "go": PR `main` → `dev`, title `v<version>` (the version now on `main`), body:

```markdown
Forward integration of `main` into `dev` after v<version>.

Lands as a merge commit, not a squash, so the branches share history again.

#<release or hotfix PR number>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

2. On "go": `gh pr create --base dev --head main …`, wait for CI, give the user the URL.
3. On "merge #<n>": `gh pr merge <n> --merge --subject "v<version>" --body "#<release or hotfix PR number>"`, then `git switch dev && git pull --ff-only`.
4. Linear: set the tickets in this release to "Done" if they are not already.
