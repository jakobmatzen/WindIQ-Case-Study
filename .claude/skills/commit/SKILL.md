---
name: commit
description: Commit message format for this repo. Use for every git commit.
---

# Commit

Feature and hotfix branches only. Commits on `dev` and `main` arrive as squash merges, formatted by `/ship` and `/release` (see `docs/WORKFLOW.md`).

## When

At each logical checkpoint: one self-contained step that lints and builds. Tell the user what you committed. Pushing waits for `/ship`.

## Format

```
<Short imperative title, max ~60 chars>

- <what changed, one line each>
- <keep it to what a reviewer needs>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- Title: imperative, capitalised, no type prefix, no trailing period (`Add measurement parser`).
- Body: one to five bullets, English, describing what changed for the reader.
- Stage files by name; review `git status` first so `.env*` and scratch files stay out.

Pass the message through a heredoc so the bullets keep their line breaks:

```bash
git commit -F - <<'EOF'
Add measurement parser

- Parse wind_speed from number or string, reject null and -999
- Convert km/h to m/s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
