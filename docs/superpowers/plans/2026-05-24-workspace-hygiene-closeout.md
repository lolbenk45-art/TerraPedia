# Workspace Hygiene Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TerraPedia local workspace boring again: one clear development entrypoint, no stale runtime rooted in old task worktrees, and no finished task worktrees/branches left around after their commits are already in pushed `main`.

**Architecture:** Treat cleanup as an evidence-driven Git operation, not a broad deletion pass. The worker creates a dedicated cleanup branch/worktree from synced `main`, snapshots the current worktree/branch/runtime state, then removes only clean worktrees whose branch tip is contained by `origin/main`, and only deletes local branches after their worktree has been removed. Unmerged branches are classified and preserved unless the operator explicitly approves a separate archival/delete pass.

**Tech Stack:** Git worktrees, Bash, TerraPedia local stack scripts, Markdown evidence under `docs/audits/`.

---

## Current Evidence Baseline

Captured on 2026-05-24 from:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22
git status --short --branch
git worktree list
git branch --merged main --format='%(refname:short)'
git branch --no-merged main --format='%(refname:short)'
```

Known baseline:

- Main worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22`
- Main branch: `main`
- Main status: clean and synced with `origin/main`
- Main commit: `d127331`
- Primary checkout: `/home/lolben/TerraPedia`
- Primary checkout branch: `chore/local-stack-front-nuxt-2026-05-23`
- Worktree count: 66
- Local branches merged into `main`: 80
- Local branches not merged into `main`: 5
- Current known open/unmerged branches:
  - `chore/local-stack-front-nuxt-2026-05-23`
  - `feat/home-hero-density-options-2026-05-21`
  - `feat/public-item-detail-data-layer-2026-05-20`
  - `fix/catalog-pagination-density-2026-05-20`
  - `plan/basic-public-site-v0.1-2026-05-23`

Known recent finished worktrees whose branch tips are already contained by pushed `main`:

- `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-front-nuxt-preview-final-smoke-2026-05-24`
- `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24`
- `/home/lolben/.config/superpowers/worktrees/TerraPedia/docs-project-preview-release-decision-2026-05-24`

Known runtime caveat:

- The local stack may still be running on backend `18088`, front `5174`, admin `3001`, Redis `6380`, and MinIO `9000`.
- The latest closeout evidence recorded stack processes rooted in a task worktree. Runtime must be stopped or restarted from the final main worktree before removing that task worktree.

## Non-Goals

- Do not delete remote branches.
- Do not use `git reset --hard`, `git clean -fd`, or `git checkout --`.
- Do not remove dirty worktrees.
- Do not delete unmerged branches without explicit operator approval.
- Do not change application code, data, database content, crawler state, or generated reports unrelated to this cleanup.
- Do not stop non-TerraPedia processes by raw port kill unless `scripts/dev/stop-local-stack.sh --force-ports` verifies ownership.

## Closure Definition

This plan is complete when all of these are true:

1. `main` remains clean and synced with `origin/main`.
2. The primary checkout `/home/lolben/TerraPedia` is no longer a misleading active development entrypoint on an old feature branch, or it is explicitly documented as preserved.
3. No local stack process is rooted in a worktree that was removed.
4. Finished task worktrees whose branch tips are contained by `origin/main` are removed.
5. Their local task branches are deleted with `git branch -d`, not `-D`.
6. Unmerged branches are listed in a preservation report with a recommended next action.
7. A cleanup audit record is committed and merged into `main`.

## Safety Rules

- Do not commit directly on `main`. Create and use this dedicated execution branch/worktree:

```bash
MAIN_WT=/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22
CLEANUP_WT=/home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24
CLEANUP_BRANCH=chore/workspace-hygiene-closeout-2026-05-24
```

- Use explicit paths and explicit branch names only.
- Never remove the main worktree or the cleanup execution worktree.
- Before removing any worktree, verify:
  - `git -C <path> status --short --branch` has no changed files.
  - `git branch --contains <branch-tip>` includes `main`.
  - `git branch -r --contains <branch-tip>` includes `origin/main`.
  - No listening local stack process has a cwd inside `<path>`.
- Delete in this order:
  1. Stop or migrate runtime.
  2. Remove clean worktree.
  3. Delete local branch using `git branch -d <branch>`.
  4. Recheck `git worktree list` and `git branch --list <branch>`.

## Candidate Classification

### Auto-Clean Candidates

These are safe only after the verification steps in Task 2:

```text
fix/front-nuxt-preview-final-smoke-2026-05-24
fix/local-stack-preview-closeout-smoke-2026-05-24
docs/project-preview-release-decision-2026-05-24
fix/domain-a-grade-closeout-2026-05-24
fix/domain-a-grade-boss-image-lineage-2026-05-24
fix/domain-a-grade-db-read-environment-2026-05-24
fix/domain-a-grade-projectile-relation-coverage-2026-05-24
plan/domain-a-grade-blocker-burn-down-2026-05-23
plan/domain-a-grade-remaining-review-2026-05-24
```

The worker may expand this list only by generating a fresh report of clean worktrees whose branch tip is contained by both `main` and `origin/main`.

### Preserve Until Operator Review

These are not merged into `main` at baseline and must not be deleted in this plan:

```text
chore/local-stack-front-nuxt-2026-05-23
feat/home-hero-density-options-2026-05-21
feat/public-item-detail-data-layer-2026-05-20
fix/catalog-pagination-density-2026-05-20
plan/basic-public-site-v0.1-2026-05-23
```

The primary checkout uses `chore/local-stack-front-nuxt-2026-05-23`; handle it in Task 4.

---

### Task 0: Create The Cleanup Execution Worktree

**Files:**
- No file changes.

- [ ] **Step 1: Confirm synced main baseline**

Run:

```bash
MAIN_WT=/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22
cd "$MAIN_WT"
git fetch origin
git status --short --branch
git rev-parse --short HEAD
git rev-parse --short refs/remotes/origin/main
```

Expected:

```text
## main...origin/main
d127331
d127331
```

If `HEAD` and `origin/main` differ, stop and resync `main` before continuing.

- [ ] **Step 2: Create a dedicated cleanup branch/worktree**

Run:

```bash
MAIN_WT=/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22
CLEANUP_WT=/home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24
CLEANUP_BRANCH=chore/workspace-hygiene-closeout-2026-05-24
cd "$MAIN_WT"
test ! -e "$CLEANUP_WT"
test -z "$(git branch --list "$CLEANUP_BRANCH")"
git worktree add "$CLEANUP_WT" -b "$CLEANUP_BRANCH" main
```

Expected:

- The cleanup worktree is created at `$CLEANUP_WT`.
- The cleanup branch is based on `main`.
- No work is performed directly on `main`.

- [ ] **Step 3: Verify cleanup worktree baseline**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24
git status --short --branch
git branch --show-current
git rev-parse --short HEAD
```

Expected:

```text
## chore/workspace-hygiene-closeout-2026-05-24
chore/workspace-hygiene-closeout-2026-05-24
d127331
```

---

### Task 1: Snapshot The Workspace State

**Files:**
- Create: `docs/audits/2026-05-24_workspace-hygiene-baseline.md`

- [ ] **Step 1: Confirm target worktree**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24
git status --short --branch
git rev-parse --short HEAD
git rev-parse --short refs/remotes/origin/main
```

Expected:

```text
## chore/workspace-hygiene-closeout-2026-05-24
d127331
d127331
```

- [ ] **Step 2: Capture worktree and branch inventory**

Run:

```bash
git worktree list > /tmp/terrapedia-worktrees-before.txt
git branch --merged main --format='%(refname:short)' > /tmp/terrapedia-branches-merged-main-before.txt
git branch --no-merged main --format='%(refname:short)' > /tmp/terrapedia-branches-unmerged-main-before.txt
```

Expected:

- `/tmp/terrapedia-worktrees-before.txt` exists.
- `/tmp/terrapedia-branches-merged-main-before.txt` exists.
- `/tmp/terrapedia-branches-unmerged-main-before.txt` exists.

- [ ] **Step 3: Capture dirty worktrees**

Run:

```bash
rm -f /tmp/terrapedia-dirty-worktrees-before.txt
while IFS= read -r path; do
  status="$(git -C "$path" status --short)"
  if [ -n "$status" ]; then
    {
      printf '## %s\n' "$path"
      git -C "$path" status --short --branch
      printf '\n'
    } >> /tmp/terrapedia-dirty-worktrees-before.txt
  fi
done < <(git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')
touch /tmp/terrapedia-dirty-worktrees-before.txt
```

Expected:

- The command exits `0`.
- Empty file means no dirty worktrees.
- Non-empty file blocks cleanup for those listed worktrees only.

- [ ] **Step 4: Capture TerraPedia runtime roots**

Run:

```bash
{
  printf '# Listening local stack ports\n\n'
  ss -ltnp | grep -E ':(18088|5174|3001|6380|9000)\b' || true
  printf '\n# Process cwd roots\n\n'
  for pid in $(ss -ltnp | grep -E ':(18088|5174|3001|6380|9000)\b' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u); do
    printf 'pid=%s cwd=%s\n' "$pid" "$(readlink "/proc/$pid/cwd" 2>/dev/null || printf '<unavailable>')"
  done
} > /tmp/terrapedia-runtime-before.txt
```

Expected:

- The command exits `0`.
- The report records whether runtime processes exist and which worktree each process is rooted in.

- [ ] **Step 5: Write baseline audit**

Create `docs/audits/2026-05-24_workspace-hygiene-baseline.md` with this shape:

```md
# Workspace Hygiene Baseline - 2026-05-24

## Main State
- Main worktree:
- Main commit:
- Origin main commit:
- Status command:
- Result:

## Inventory
- Worktree count:
- Merged local branch count:
- Unmerged local branch count:

## Dirty Worktrees
- Result:
- Evidence file: `/tmp/terrapedia-dirty-worktrees-before.txt`

## Runtime Roots
- Ports checked: `18088`, `5174`, `3001`, `6380`, `9000`
- Result:
- Evidence file: `/tmp/terrapedia-runtime-before.txt`

## Cleanup Policy
- Remove only clean worktrees whose branch tip is contained by both `main` and `origin/main`.
- Preserve unmerged branches.
- Do not delete remote branches.
```

- [ ] **Step 6: Commit baseline audit**

Run:

```bash
git add docs/audits/2026-05-24_workspace-hygiene-baseline.md
git diff --cached --stat
git commit -m "docs: record workspace hygiene baseline"
```

Expected:

- Commit succeeds.
- Only the baseline audit file is committed.

---

### Task 2: Stop Or Migrate Local Stack Runtime

**Files:**
- Modify: `docs/audits/2026-05-24_workspace-hygiene-baseline.md`

- [ ] **Step 1: Decide whether stack should remain running**

Default decision: stop the stack before removing task worktrees.

Reason: the latest closeout stack may be rooted in a task worktree. Removing that worktree while processes are still rooted there leaves confusing runtime state.

- [ ] **Step 2: Stop recorded local stack processes from the worktree that owns the running stack**

If `/tmp/terrapedia-runtime-before.txt` shows runtime cwd under a task worktree, run `stop-local-stack.sh` from that same worktree path first.

Example for the latest known Task 6 root:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24
bash scripts/dev/stop-local-stack.sh
```

Expected:

- Command exits `0`.
- Recorded TerraPedia local stack processes stop.

- [ ] **Step 3: Verify no stale process is rooted in cleanup candidates**

Run from main worktree:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24
{
  ss -ltnp | grep -E ':(18088|5174|3001|6380|9000)\b' || true
  for pid in $(ss -ltnp | grep -E ':(18088|5174|3001|6380|9000)\b' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u); do
    printf 'pid=%s cwd=%s\n' "$pid" "$(readlink "/proc/$pid/cwd" 2>/dev/null || printf '<unavailable>')"
  done
} > /tmp/terrapedia-runtime-after-stop.txt
```

Expected:

- No process cwd points into an auto-clean candidate.
- If Redis or MinIO remain but are shared services with unavailable cwd, do not force-kill them in this plan unless they block restart.

- [ ] **Step 4: Optionally restart from main**

If the operator wants the app left running after cleanup, restart from the main worktree:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22
bash scripts/dev/start-local-stack.sh
bash scripts/dev/smoke-local-stack.sh
```

Expected:

- Startup exits `0`.
- Smoke exits `0`.
- New runtime cwd roots point at the main worktree, not a removed task worktree.

- [ ] **Step 5: Update baseline audit runtime section**

Append a `Runtime Cleanup` section to `docs/audits/2026-05-24_workspace-hygiene-baseline.md`:

```md
## Runtime Cleanup
- Stop command:
- Stop result:
- Restart command, if used:
- Restart result, if used:
- Runtime after stop evidence: `/tmp/terrapedia-runtime-after-stop.txt`
```

- [ ] **Step 6: Commit runtime cleanup note**

Run:

```bash
git add docs/audits/2026-05-24_workspace-hygiene-baseline.md
git diff --cached --stat
git commit -m "docs: record workspace runtime cleanup"
```

Expected:

- Commit succeeds.
- Only the baseline audit file is committed.

---

### Task 3: Remove Finished Worktrees And Merged Local Branches

**Files:**
- Create: `docs/audits/2026-05-24_workspace-hygiene-cleanup.md`

- [ ] **Step 1: Generate verified auto-clean list**

Run from main:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24
cat > /tmp/terrapedia-cleanup-candidates.txt <<'EOF'
fix/front-nuxt-preview-final-smoke-2026-05-24
fix/local-stack-preview-closeout-smoke-2026-05-24
docs/project-preview-release-decision-2026-05-24
fix/domain-a-grade-closeout-2026-05-24
fix/domain-a-grade-boss-image-lineage-2026-05-24
fix/domain-a-grade-db-read-environment-2026-05-24
fix/domain-a-grade-projectile-relation-coverage-2026-05-24
plan/domain-a-grade-blocker-burn-down-2026-05-23
plan/domain-a-grade-remaining-review-2026-05-24
EOF
```

Expected:

- Candidate file exists.

- [ ] **Step 2: Verify each candidate before removal**

Run:

```bash
rm -f /tmp/terrapedia-cleanup-approved.txt /tmp/terrapedia-cleanup-rejected.txt
touch /tmp/terrapedia-cleanup-approved.txt /tmp/terrapedia-cleanup-rejected.txt

while IFS= read -r branch; do
  path="$(git worktree list --porcelain | awk -v branch="refs/heads/$branch" '
    /^worktree /{worktree=substr($0,10)}
    /^branch / && $2 == branch {print worktree}
  ')"

  if [ -z "$path" ]; then
    printf '%s\tmissing-worktree\n' "$branch" >> /tmp/terrapedia-cleanup-rejected.txt
    continue
  fi

  if [ -n "$(git -C "$path" status --short)" ]; then
    printf '%s\tdirty-worktree\t%s\n' "$branch" "$path" >> /tmp/terrapedia-cleanup-rejected.txt
    continue
  fi

  tip="$(git rev-parse "$branch")"
  if ! git branch --contains "$tip" | sed 's/^[*+ ]*//' | grep -qx 'main'; then
    printf '%s\tnot-contained-by-main\t%s\n' "$branch" "$path" >> /tmp/terrapedia-cleanup-rejected.txt
    continue
  fi

  if ! git branch -r --contains "$tip" | sed 's/^[*+ ]*//' | grep -qx 'origin/main'; then
    printf '%s\tnot-contained-by-origin-main\t%s\n' "$branch" "$path" >> /tmp/terrapedia-cleanup-rejected.txt
    continue
  fi

  if grep -F "$path" /tmp/terrapedia-runtime-after-stop.txt >/dev/null 2>&1; then
    printf '%s\truntime-still-rooted\t%s\n' "$branch" "$path" >> /tmp/terrapedia-cleanup-rejected.txt
    continue
  fi

  printf '%s\t%s\n' "$branch" "$path" >> /tmp/terrapedia-cleanup-approved.txt
done < /tmp/terrapedia-cleanup-candidates.txt
```

Expected:

- Approved candidates are safe to remove.
- Rejected candidates are preserved and explained.

- [ ] **Step 3: Remove approved worktrees**

Run:

```bash
while IFS=$'\t' read -r branch path; do
  [ -n "$branch" ] || continue
  git worktree remove "$path"
done < /tmp/terrapedia-cleanup-approved.txt
```

Expected:

- Each approved worktree is removed.
- No dirty worktree is removed.

- [ ] **Step 4: Delete approved local branches**

Run:

```bash
while IFS=$'\t' read -r branch path; do
  [ -n "$branch" ] || continue
  git branch -d "$branch"
done < /tmp/terrapedia-cleanup-approved.txt
```

Expected:

- Each approved branch is deleted with `git branch -d`.
- If `git branch -d` refuses, do not use `-D`; move the branch to rejected and preserve it.

- [ ] **Step 5: Verify cleanup**

Run:

```bash
git worktree list > /tmp/terrapedia-worktrees-after-cleanup.txt
git branch --merged main --format='%(refname:short)' > /tmp/terrapedia-branches-merged-main-after-cleanup.txt
git status --short --branch > /tmp/terrapedia-main-status-after-cleanup.txt
```

Expected:

- `git status` shows the cleanup branch and no unstaged changes except the audit file being prepared.
- Removed worktree paths are absent from `/tmp/terrapedia-worktrees-after-cleanup.txt`.
- Deleted branches are absent from branch list.

- [ ] **Step 6: Write cleanup audit**

Create `docs/audits/2026-05-24_workspace-hygiene-cleanup.md`:

```md
# Workspace Hygiene Cleanup - 2026-05-24

## Policy
- Removed only clean worktrees whose branch tips were contained by both `main` and `origin/main`.
- Deleted only local branches with `git branch -d`.
- Preserved dirty, unmerged, missing, or runtime-rooted candidates.
- Did not delete remote branches.

## Removed Worktrees And Branches
Paste the content of `/tmp/terrapedia-cleanup-approved.txt`.

## Preserved Candidates
Paste the content of `/tmp/terrapedia-cleanup-rejected.txt`.

## Verification
- Worktree inventory after cleanup: `/tmp/terrapedia-worktrees-after-cleanup.txt`
- Merged branch inventory after cleanup: `/tmp/terrapedia-branches-merged-main-after-cleanup.txt`
- Main status after cleanup: `/tmp/terrapedia-main-status-after-cleanup.txt`
```

- [ ] **Step 7: Commit cleanup audit**

Run:

```bash
git add docs/audits/2026-05-24_workspace-hygiene-cleanup.md
git diff --cached --stat
git commit -m "docs: record workspace hygiene cleanup"
```

Expected:

- Commit succeeds.
- Only cleanup audit is committed.

---

### Task 4: Normalize The Primary Checkout

**Files:**
- Modify: `docs/audits/2026-05-24_workspace-hygiene-cleanup.md`

- [ ] **Step 1: Inspect primary checkout state**

Run:

```bash
git -C /home/lolben/TerraPedia status --short --branch
git -C /home/lolben/TerraPedia rev-parse --short HEAD
git -C /home/lolben/TerraPedia branch --show-current
```

Expected baseline:

```text
## chore/local-stack-front-nuxt-2026-05-23
7aedf91
chore/local-stack-front-nuxt-2026-05-23
```

- [ ] **Step 2: Choose primary checkout policy**

Default policy for this plan:

- Preserve `/home/lolben/TerraPedia` as-is because its branch is not merged into `main`.
- Do not switch, reset, or delete it.
- Mark it as an old active checkout that must not be used for new work until the operator decides whether to merge, archive, or abandon `chore/local-stack-front-nuxt-2026-05-23`.

Alternative policy, only with explicit operator approval:

- Move the primary checkout back to `main` after preserving or resolving the unmerged branch.

- [ ] **Step 3: Record primary checkout decision**

Append to `docs/audits/2026-05-24_workspace-hygiene-cleanup.md`:

```md
## Primary Checkout
- Path: `/home/lolben/TerraPedia`
- Branch:
- Commit:
- Dirty status:
- Decision:
- Reason:
- Follow-up:
```

Expected decision:

```text
Preserved because the branch is not merged into main. New work should use the synced main worktree or a new main-derived worktree until this branch is reviewed.
```

- [ ] **Step 4: Commit primary checkout note**

Run:

```bash
git add docs/audits/2026-05-24_workspace-hygiene-cleanup.md
git diff --cached --stat
git commit -m "docs: record primary checkout workspace decision"
```

Expected:

- Commit succeeds.

---

### Task 5: Merge Cleanup Records Into Main And Verify

**Files:**
- No new files beyond Task 1-4 audit records.

- [ ] **Step 1: Verify plan branch status**

Run from the plan branch worktree:

```bash
git status --short --branch
git log --oneline -5
```

Expected:

- Clean plan branch worktree.
- Latest commits are the audit records from this plan.

- [ ] **Step 2: Merge plan branch into main**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22
git fetch origin
git status --short --branch
git merge --no-ff plan/workspace-hygiene-closeout-2026-05-24 -m "Merge branch 'plan/workspace-hygiene-closeout-2026-05-24'"
```

Expected:

- Merge succeeds without conflicts.
- Main remains clean after merge.

- [ ] **Step 3: Push main**

Run:

```bash
git push --dry-run origin main
git push origin main
git fetch origin
git status --short --branch
git rev-parse --short HEAD
git rev-parse --short refs/remotes/origin/main
```

Expected:

- Dry run succeeds.
- Push succeeds.
- Local `main` and `origin/main` point to the same commit.

- [ ] **Step 4: Final workspace verification**

Run:

```bash
git worktree list > /tmp/terrapedia-worktrees-final.txt
git branch --merged main --format='%(refname:short)' > /tmp/terrapedia-branches-merged-main-final.txt
git branch --no-merged main --format='%(refname:short)' > /tmp/terrapedia-branches-unmerged-main-final.txt
```

Expected:

- Cleaned finished worktrees are absent.
- Preserved unmerged branches are still listed.
- No removed worktree path is used by a running local stack process.

---

## Self-Review

- Goal lock: This plan closes workspace confusion, not application feature debt.
- Boundary lock: The plan only changes audit docs plus local Git/worktree state. It does not delete remote branches or touch database/runtime data.
- Runtime lock: It stops or migrates local stack processes before removing any worktree that may own them.
- Git safety: Every deletion requires clean status and branch-tip containment in both `main` and `origin/main`.
- Residual risk: Some unmerged branches may be obsolete, but this plan preserves them because their work has not been proven recoverable from pushed `main`.
