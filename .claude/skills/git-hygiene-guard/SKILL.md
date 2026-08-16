---
name: git-hygiene-guard
description: Use when starting feature work, preparing a commit or push, or cleaning up branches and worktrees in a git repo and you need to stop dirty worktrees, direct development on main or master, mixed-scope commits, or unclear remote credentials and permissions.
---

# Git Hygiene Guard

## Overview

Guard normal Git development flow. Unsafe state stops the workflow.

Default behavior:

- auto-run safe checks
- auto-run low-risk setup
- auto-clean local task branches/worktrees after merge and push when remote recovery is verified, no local-only commits exist, and the worktree is clean
- stop before risky mutation

This skill is not for force-push, history rewrite, remote branch deletion, destructive cleanup of dirty worktrees, or silent credential changes.

## When to Use

- Before starting a feature or bugfix
- Before branch or worktree creation
- Before commit, push, PR, or cleanup
- When `git status` is dirty
- When current branch is `main` or `master`
- When ahead/behind, credential, or permission state is unclear

## Guard Flow

### 1. Pre-Start

Always run `git status --short`, `git branch -vv`, and `git worktree list`.

Hard stop when:

- new code is about to be written on `main` or `master`
- the worktree is dirty and the user is starting a different task
- remote sync state has not been checked

Safe auto-actions: `git fetch`, `git switch -c <branch>`, `git worktree add <path> -b <branch> <base>`.

### 2. During Development

Hard stop when:

- one branch is drifting into multiple unrelated goals
- uncommitted changes are growing without a clear checkpoint
- the user is switching tasks without an intentional commit or stash decision

Safe response: show diff and branch state, then recommend split, checkpoint commit, or intentional stash.

### 3. Pre-Commit

Always run `git status --short` and `git diff --cached --stat`.

For TerraPedia repos, read `docs/devlog/current.md` when it exists and parse `docs/devlog/entries/*.md` status sections for `active`, `blocked`, `ready-for-commit`, and `closed` with pending SHA before commit. Use `terrapedia-devlog-guard` / `terrapedia-task-commit` for devlog-required work.

Hard stop when:

- a commit is requested but nothing is staged
- staged files include unrelated scope
- staged content has not been reviewed
- the commit message does not summarize the staged behavior with `type(scope): action`; allowed types are `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, and `data`
- TerraPedia devlog-required work has stale, missing, pending-SHA, or unresolved devlog state

Safe auto-actions: `git add <explicit-file-list>`, `git diff --cached --name-status`.

Never auto-use `git add .`.

### 4. Pre-Push

Always verify:

- clean worktree
- local commits exist
- ahead/behind state is known
- minimum validation is done
- remote identity and permission source are clear
- TerraPedia devlog state is not stale after scanning `docs/devlog/current.md` when present and parsing `docs/devlog/entries/*.md`

Safe auto-actions: `git fetch`, `git push --dry-run`, `git ls-remote --heads origin <branch>`.

On Windows HTTPS with Git Credential Manager, inspect credential source with `cmdkey /list | Select-String -Pattern 'github|git:https' -Context 0,2`.

Hard stop when:

- credential identity is unclear
- remote permission is missing
- required verification has not run
- TerraPedia devlog-required work has unresolved `active`, `blocked`, `ready-for-commit`, pending-SHA `closed`, recorded unresolved review findings, `needs-coordinator-decision`, or unrecorded material review findings on the relevant branch/worktree or shared scope

### 5. Finish

Force an explicit closeout path:

- merge locally
- push and open PR
- keep branch for later
- clean up local finished branch or worktree

For TerraPedia repos, parse `docs/devlog/entries/*.md` and do not clean a branch or worktree while `docs/devlog/current.md` or an open entry still points to unresolved, `ready-for-commit`, or pending-SHA work on that branch or shared scope. Preserve unrelated open entries from other branches.

Safe auto-actions: list merged branches, list worktrees, show cleanup candidates, remove clean local task worktrees, delete clean local task branches after merge and push when the exact local `HEAD` is recoverable from the remote.

Local cleanup policy:

- Remote existence is not enough. Clean local task branches and worktrees by default only after the task branch has been merged into the target branch and the target branch is pushed.
- If the task branch is pushed but the PR is still open or unmerged, keep the local branch/worktree by default. Clean it only when the user explicitly asks for local cleanup or local slimming.
- Remote recovery verification means the exact local `HEAD` is contained by a remote branch or target branch, or `git ls-remote --heads origin <branch>` matches the local `HEAD`.
- Also verify `git status --short --branch -uall` is clean and `git log @{upstream}..HEAD` is empty when an upstream exists.
- Use `git branch -d <branch>` for merged branches.
- Use local `git branch -D <branch>` only after clean-worktree, no-local-only-commit, and remote-recovery checks when the branch is pushed but not merged.
- Delete in this order: leave the task worktree, remove the clean task worktree from the main worktree, then delete the local task branch.
- Never clean `main`, `master`, detached HEAD, dirty worktrees, or unrelated branches/worktrees.
- Never delete remote branches unless the user explicitly asks.

## Never Auto-Do

- `git push --force`
- `git reset --hard`
- `git checkout -- <path>`
- `git clean -fd`
- credential deletion or replacement
- remote branch deletion
- dirty worktree deletion
- local branch/worktree deletion without clean-worktree, no-local-only-commit, and remote-recovery checks

## Output Format

Always answer with:

- `Current state`
- `Blocking issues`
- `Safe next actions I can run now`
- `Actions requiring explicit user confirmation`
