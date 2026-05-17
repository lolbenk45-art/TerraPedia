---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests -> Present options -> Execute choice -> Clean up local task state.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3: Present Options

Present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally, then delete local task branch/worktree
2. Push and create a Pull Request, keep local branch/worktree for review follow-up
3. Keep the local branch/worktree as-is
4. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 4: Execute Choice

#### Option 1: Merge Locally

```bash
# Switch to the base branch from the main worktree, not from the task worktree
cd <main-worktree>
git checkout <base-branch>

# Pull latest
git pull

# Merge feature branch
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

Then: Cleanup worktree (Step 5)

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Verify the exact local `HEAD` is recoverable from the remote:

```bash
git ls-remote --heads origin <feature-branch>
git rev-parse HEAD
git branch -r --contains HEAD
```

Then: Report that the remote branch/PR exists and the local branch/worktree is intentionally preserved until merge, unless the user explicitly asked for local cleanup.

#### Option 3: Keep As-Is

Report: "Keeping local branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
cd <main-worktree>
```

Then: Cleanup worktree (Step 5)

### Step 5: Cleanup Worktree

**For Options 1 and 4. For Option 2, use this cleanup only when the user explicitly asked to clean local state after PR creation.**

Remote existence alone is not enough to delete local state. Before deleting anything, verify the task worktree, local commits, and task branch:

```bash
git -C <worktree-path> status --short --branch -uall
git -C <worktree-path> rev-parse --abbrev-ref --symbolic-full-name @{upstream}
git -C <worktree-path> log --oneline @{upstream}..HEAD
git -C <worktree-path> branch -r --contains HEAD
git worktree list --porcelain
```

If no upstream exists, skip the upstream ahead check only when `git branch -r --contains HEAD` proves the exact local `HEAD` is already reachable from a remote branch, or the remote branch tip from `git ls-remote --heads origin <feature-branch>` matches `git rev-parse HEAD`.

Hard stop if the task worktree is dirty, local-only commits exist, `<feature-branch>` is `main`/`master`, or Option 2 cannot recover the exact local `HEAD` from a remote branch or target branch.

Check the worktree path for the task branch:
```bash
git worktree list --porcelain
```

If a clean task worktree exists:
```bash
cd <main-worktree>
git worktree remove <worktree-path>
```

Then delete the local task branch if it still exists and is not checked out elsewhere. Use `-d` for merged branches:

```bash
git branch -d <feature-branch>
```

For Option 2 only, if the branch is pushed but not merged and the user explicitly asked to clean up local state, local force deletion is allowed after remote recovery verification:

```bash
git branch -D <feature-branch>
```

Delete only the local branch/worktree; do not delete the remote branch.

**For Option 3:** Keep worktree.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | ✓ | - | - | ✓ |
| 2. Create PR | - | ✓ | ✓ | - |
| 3. Keep as-is | - | - | ✓ | - |
| 4. Discard | - | - | - | ✓ (force) |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 4 structured options

**Treating remote existence as enough**
- **Problem:** The remote branch exists, but the exact local `HEAD` or latest local commits may not be recoverable
- **Fix:** Clean local branch/worktree only after clean-state, no-local-only-commit, and remote-recovery checks

**Deleting PR worktrees too early**
- **Problem:** PR review follow-up needs the same branch, but local state was cleaned immediately after PR creation
- **Fix:** Keep local branch/worktree for pushed but unmerged PRs unless the user explicitly asks for local cleanup

**Deleting remote task branches by accident**
- **Problem:** Local cleanup turns into remote branch deletion
- **Fix:** Never delete remote branches unless the user explicitly asks

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request
- Delete remote branches without explicit request

**Always:**
- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Clean up local branch/worktree for Options 1 and 4 after clean-state checks
- Preserve local branch/worktree for Option 2 unless the user explicitly asks for local cleanup

## Integration

**Called by:**
- **subagent-driven-development** (Step 7) - After all tasks complete
- **executing-plans** (Step 5) - After all batches complete

**Pairs with:**
- **using-git-worktrees** - Cleans up worktree created by that skill
