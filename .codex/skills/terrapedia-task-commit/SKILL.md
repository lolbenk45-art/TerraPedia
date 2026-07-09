---
name: terrapedia-task-commit
description: Use when a TerraPedia feature, fix, refactor, data change, or skill update is finished and validated and needs to be checkpointed as a focused git commit before handoff, including requests to submit, commit, checkpoint, or leave no loose changes.
---

# Terrapedia Task Commit

## Overview

Turn a finished TerraPedia task into one clean git commit. This is a close-out skill, not an in-progress development workflow.

## Workflow

1. Confirm the task is complete and validation has passed.
2. REQUIRED SUB-SKILL: load `terrapedia-devlog-guard` before commit closeout. Read `docs/devlog/current.md` if it exists and parse `docs/devlog/entries/*.md` status sections for `active`, `blocked`, `ready-for-commit`, and `closed` with `commit SHA pending in final response`.
3. Re-evaluate devlog requirement using `terrapedia-devlog-guard` criteria. If the task is non-trivial or changes workflow, skills, data, crawler, API, UI, validation gates, or multi-agent state, stop unless a devlog entry exists. Do not use git-only for those categories.
4. If a tiny local change is git-only, record a durable exception before commit in the active entry or commit message body with scope, changed paths, validation, no-handoff reason, and why no devlog-required category applies. Final-response-only is not durable.
5. Stop if the current conversation contains unrecorded material read-only review findings, `COMMIT BLOCKED: required devlog update`, or recorded unresolved review findings / `needs-coordinator-decision` in the active entry.
6. Run:

```powershell
git status --short
git diff --cached --stat
```

7. Stage only files from the current task. Never use `git add .`.
8. If scope is mixed, unstage unrelated files and keep the commit focused.
9. If a devlog entry exists and this commit closes it, ensure review gates are clear and it records result, validation, residual risks, follow-up, and `commit SHA pending in final response`; set it to `closed` and remove it from `docs/devlog/current.md` Open Work before commit. If completed work will remain uncommitted, keep `ready-for-commit`.
10. Run `git status --short` and `git diff --cached --stat` again after closeout edits and staging. If a pending-SHA closed entry exists but the commit cannot proceed, stop and either complete the commit immediately or reopen/demote the entry to `active` before any other work.
11. Commit with `type(scope): action`:
   - Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `data`.
   - Scope: short module or workflow name, such as `article`, `auth`, `admin`, `api`, `crawler`, `devlog`, or `workflow`.
   - Action: imperative behavior summary.
   - Examples: `feat(article): support editing existing articles`, `test(auth): cover registration validation`, `fix(auth): handle null email validation`.
   - Do not use `[code]` as the primary convention. Review-driven fixes use the real type; put `Review finding: ...` in the commit body when the source matters.
12. Do not edit devlog solely to backfill the SHA after a one-commit closeout. Report the commit SHA in the final response. If the SHA must be written into the entry, make an explicit second devlog-closeout commit and say so.
13. After commit, run:

```powershell
git status --short --branch
git branch -vv
git worktree list --porcelain
```

14. Report the commit SHA, branch state, devlog closeout policy used, and any remaining local worktrees or branches related to this task.
15. If the user asked to push, run the `git-hygiene-guard` pre-push checks, push the current branch, then run the post-push closeout below.

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
- Do not leave a task devlog entry stale when committing work that used one.
- Do not use git-only for workflow, skill, data, crawler, API, UI, validation-gate, or multi-agent work.
- Do not create a post-commit dirty worktree only to backfill a SHA unless intentionally making a second devlog-closeout commit.
- After merge into the target branch and push, local task branch/worktree cleanup is expected when remote recovery is verified, no local-only commits exist, and the worktree is clean.
- After push or PR creation without merge, preserve the local task branch/worktree unless the user explicitly asks for local cleanup.
- Never delete remote branches unless the user explicitly asks.
- Leave unrelated local changes unstaged and mention them.
