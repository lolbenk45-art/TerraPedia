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
6. After commit, run:

```powershell
git status --short --branch
git branch -vv
git worktree list --porcelain
```

7. Report the commit SHA, branch state, and any remaining local worktrees or branches related to this task.
8. If the user asked to push, run the `git-hygiene-guard` pre-push checks, push the current branch, then run the post-push closeout below.

## Post-Push Closeout

When the user asks to submit, push, finish, clean up, or leave no loose changes, do not stop after `git push`.

Remote existence alone is not enough to delete local state. Default cleanup is appropriate after the task is merged into the target branch and pushed. If the branch is only pushed and the PR is still open, keep the local branch/worktree unless the user explicitly asks for local cleanup.

1. Verify the task worktree is clean with `git -C <worktree-path> status --short --branch -uall` before leaving it.
2. Verify the task branch to delete is not `main` or `master`.
3. Verify there are no local-only commits:
   - with upstream: `git -C <worktree-path> log --oneline @{upstream}..HEAD`
   - without upstream: `git -C <worktree-path> branch -r --contains HEAD`
4. Verify remote recovery:
   - preferred: `git -C <worktree-path> branch -r --contains HEAD` includes the pushed remote branch or target branch
   - branch tip check: `git ls-remote --heads origin <branch>` matches local `HEAD`
   - merged check: target branch contains `HEAD`
5. If the branch has been merged into the target branch and the target branch is pushed, prefer `git branch -d <branch>` after leaving and removing its worktree.
6. If the branch is pushed but not merged, preserve local state by default because review follow-up may need the same worktree. Local cleanup is allowed only when the user explicitly asks to clean local state and remote recovery checks pass. Use local `git branch -D <branch>` only after clean-worktree, no-local-only-commit, and remote-recovery checks. Delete only the local branch/worktree; never delete the remote branch unless explicitly requested.
7. Remove the task worktree when it is clean and no longer needed:

```powershell
cd <main-worktree>
git worktree remove <worktree-path>
```

8. Delete the local task branch after the worktree is removed:
   - merged branch: `git branch -d <branch>`
   - pushed but unmerged branch with remote recovery: `git branch -D <branch>`
9. After cleanup, run `git branch -vv` and `git worktree list --porcelain` again and report the remaining state.

If any check fails, stop and report the blocker instead of deleting anything.

## Rules

- Do not push unless the user asks.
- Do not use `--amend`, `reset --hard`, or history rewrites.
- Do not commit unverified work.
- After merge into the target branch and push, local task branch/worktree cleanup is expected when remote recovery is verified, no local-only commits exist, and the worktree is clean.
- After push or PR creation without merge, preserve the local task branch/worktree unless the user explicitly asks for local cleanup.
- Never delete remote branches unless the user explicitly asks.
- Leave unrelated local changes unstaged and mention them.
