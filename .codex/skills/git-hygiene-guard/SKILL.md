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
- stop before risky mutation

This skill is not for force-push, history rewrite, destructive cleanup, or silent credential changes.

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

Hard stop when:

- a commit is requested but nothing is staged
- staged files include unrelated scope
- staged content has not been reviewed

Safe auto-actions: `git add <explicit-file-list>`, `git diff --cached --name-status`.

Never auto-use `git add .`.

### 4. Pre-Push

Always verify:

- clean worktree
- local commits exist
- ahead/behind state is known
- minimum validation is done
- remote identity and permission source are clear

Safe auto-actions: `git fetch`, `git push --dry-run`, `git ls-remote --heads origin <branch>`.

On Windows HTTPS with Git Credential Manager, inspect credential source with `cmdkey /list | Select-String -Pattern 'github|git:https' -Context 0,2`.

Hard stop when:

- credential identity is unclear
- remote permission is missing
- required verification has not run

### 5. Finish

Force an explicit choice:

- merge locally
- push and open PR
- keep branch for later
- clean up finished branch or worktree

Safe auto-actions: list merged branches, list worktrees, show cleanup candidates.

Never auto-delete branches, worktrees, or credentials.

## Never Auto-Do

- `git push --force`
- `git reset --hard`
- `git checkout -- <path>`
- `git clean -fd`
- credential deletion or replacement
- branch deletion
- worktree deletion

## Output Format

Always answer with:

- `Current state`
- `Blocking issues`
- `Safe next actions I can run now`
- `Actions requiring explicit user confirmation`
