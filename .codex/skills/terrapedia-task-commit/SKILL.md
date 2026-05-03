---
name: terrapedia-task-commit
description: Use when a TerraPedia feature, fix, refactor, data change, or skill update is finished and validated and needs to be checkpointed as a focused git commit before handoff, including requests to submit, commit, checkpoint, or leave no loose changes.
---

# Terrapedia Task Commit

## Overview

Turn a finished TerraPedia task into one clean git commit. This is a close-out skill, not an in-progress development workflow.

## Workflow

1. Confirm the task is complete and validation has passed.
2. Run:

```powershell
git status --short
git diff --cached --stat
```

3. Stage only files from the current task. Never use `git add .`.
4. If scope is mixed, unstage unrelated files and keep the commit focused.
5. Commit with a short conventional message:
   - `feat: ...`
   - `fix: ...`
   - `docs: ...`
   - `chore: ...`
6. Report the commit SHA and a brief summary.

## Rules

- Do not push unless the user asks.
- Do not use `--amend`, `reset --hard`, or history rewrites.
- Do not commit unverified work.
- Leave unrelated local changes unstaged and mention them.
