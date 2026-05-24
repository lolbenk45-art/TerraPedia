# Domain A-Grade Remaining Blocker Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close or truthfully reclassify the 6 remaining Domain A-grade blocked panels after the 2026-05-23 blocker burn-down.

**Architecture:** Repair prerequisites before producing evidence. Source snapshot fetches must become monitor-visible before any network run; DB evidence lanes must use a complete readable three-database environment before closing Boss image lineage or projectile relation blockers. Gate-consumed artifacts must be durable across machines.

**Tech Stack:** Node.js ESM scripts under `scripts/data/**`, Python Town NPC fetch lane, TerraPedia crawler progress contract, MySQL read-only evidence scripts, Domain Acceptance reports under `reports/domain/**`, tracked audit docs under `docs/audits/**`.

---

## Current Baseline

Source: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md`.

Current result:

- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade: `overallStatus=blocked`, `generatedBlockedCount=6`, `generatedWarningCount=15`.
- Public V0.1 remains preview-only.

Remaining blocked panels:

| Group | Panel | Current blocker | Required repair lane |
| --- | --- | --- | --- |
| B | `bosses/sourceReadiness` | Missing `data/generated/wiki-bosses.latest.json` | Source snapshot progress contract, then bounded Boss fetch |
| B | `armor_sets/sourceReadiness` | Missing `data/generated/wiki-armor-sets.latest.json` | Source snapshot progress contract, then bounded Armor fetch |
| B | `support.shimmer/sourceReadiness` | Missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json` | Source snapshot progress contract, then bounded Shimmer fetch + transform |
| B | `support.town_npc_maintenance/sourceReadiness` | Missing `data/generated/wiki-town-npc-maintenance.latest.json` | Source snapshot progress contract + Python `bs4`, then bounded Town NPC fetch |
| C | `bosses/imageReadiness` | Missing `reports/audit/image-source-lineage*.json` | Complete DB read environment, then image lineage report |
| E | `projectiles/relationReadiness` | Old baseline reports `projectiles.nameZh.gap=1006` | Complete DB read environment, then fresh entity coverage baseline and data repair if gap persists |

## Scope Boundaries

In scope:

- Add monitor-visible progress contract support and tests for bounded source snapshot fetch scripts.
- Add Crawler Monitor registered tasks for the four Domain source snapshot lanes before live network fetch.
- Install or document Python dependency requirements for the Town NPC fetch lane without committing local virtualenvs.
- Generate tracked source snapshot and audit evidence only after progress contract is in place.
- Run read-only DB evidence scripts only against a complete readable local/maint/relation DB environment.
- Regenerate `reports/domain/**` after each evidence lane.
- Keep V0.1 preview-only unless A-grade exits `0`.

Out of scope:

- Full item-page crawl, `item-pages-refresh`, backend refresh apply, import, backfill, DB writes, production mutation.
- Weakening Domain Acceptance gate logic to hide blockers.
- Force-adding ignored artifacts without `.gitignore` policy.
- Remote push.

Evidence retention rule:

- A blocker closes only when the exact path consumed by `domain-readiness-audit.mjs` is committed or the gate is changed to consume a deterministic tracked summary.
- Local-only generated files and stdout summaries support classification only.

Progress visibility rule:

- A source snapshot lane is not monitor-visible merely because it writes a JSON file under `data/generated`.
- Before any live network fetch, each lane must appear in Crawler Monitor registered tasks with a stable task id, canonical progress path, readable progress payload, and `childStatusPath`.
- Do not reuse `data/generated/wiki-sync-progress.latest.json` for these lanes; that path is already the item/wiki sync progress path and would make the monitor display the wrong task.

`.gitignore` ownership rule:

- `.gitignore` edits are serialized through Task 2 only. Task 2 owns all exact allowlist entries needed by Task 2, Task 4, Task 5, and Task 6.
- Task 4 and Task 5 may verify `git check-ignore -v`, but they must not edit `.gitignore`. If a required evidence path is still ignored, stop and repair Task 2's allowlist checkpoint before continuing.
- Parallel workers may produce read-only notes listing required allowlist paths; only the Task 2 checkpoint stages `.gitignore`.

Already-passing test policy:

- Before adding or editing tests in any checkpoint, run the current focused test command once and record the result.
- If the focused test already passes, inspect the test assertions and target code before changing anything. If the exact requirement is already covered, skip implementation and write the audit note instead of rebuilding working code.
- If a test passes for the wrong reason, tighten the assertion first and prove the old behavior fails before implementation.
- Do not spend a checkpoint rewriting code only to satisfy a test state that already proves the requirement.

DB write and backup barrier:

- This plan is DB-read-only. Allowed DB operations are `SHOW`, `SELECT`, and documented read-only report scripts.
- Forbidden in this plan: `--apply`, import, backfill, mutating sync, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `ALTER`, production mutation, and any script mode that writes DB rows.
- If Task 5 or any follow-up discovers a real data gap requiring mutation, stop this plan and open a separate DB-write repair plan. That plan must include a dry-run report, target DB/table list, pre-write row counts, verified backup path, restore command, post-write counts, and rollback owner before any write command is allowed.
- Minimum backup gate for any future DB-write plan:

```bash
mkdir -p backups/db
backup_path="backups/db/domain-a-grade-$(date -u +%Y%m%dT%H%M%SZ).sql"
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --databases terria_v1_local terria_v1_maint terria_v1_relation \
  > "$backup_path"
test -s "$backup_path"
sha256sum "$backup_path"
printf 'Restore command: mysql < %s\n' "$backup_path"
```

- A dry-run or read-only audit is not a substitute for a backup when a later plan performs writes.

## Git And Execution Boundary

- Observed state during this plan repair on 2026-05-24: `/home/lolben/TerraPedia` had local `main=f4afcf9`, `origin/main=bd7065d`, and local `main` was ahead by 9 commits. Treat these as recorded facts only; execution must re-run the commands below and use the current real hashes.
- Do not hardcode an old worktree path as authoritative. If a named worktree is missing, dirty, or not on the expected branch, stop and create a fresh checkpoint worktree from the verified base.
- New repair branches must branch from verified clean local `main`, or from the previous checkpoint branch only when the dependency is explicit in the execution order.
- Never make plan, code, evidence, or audit edits directly on `main`. Every checkpoint, including Task 4 and Task 5, must start by creating or switching to its own non-main branch.
- Do not push, force-push, reset, clean, delete branches, or remove worktrees in this plan.
- Use explicit `git add <path...>` only. Never use `git add .`, directory-wide `git add reports/domain`, or forced adds unless the plan names the exact allowlist entry and the file exists.
- Keep `.gitignore` edits serialized in Task 2. Parallel workers may generate read-only review notes, but only Task 2 may edit `.gitignore`.
- Each task is allowed to stop with a classification audit instead of closure when a prerequisite is missing. Classification is not release closure unless the gate-consuming evidence is durable and the A-grade gate result improves.
- This plan is intentionally split into commit checkpoints. If Task 1 changes become large or if Task 2 network evidence is deferred, close and merge the completed checkpoint before opening the next branch.
- No `git push origin main` is allowed in this plan. Pushing any task branch requires a separate ancestry review because local `main` may be ahead of `origin/main`.

## Time Budget And Stop-Loss

- Task 0 baseline: 30 minutes. Stop if the A-grade gate does not reproduce the expected six blockers.
- Task 1 progress contract checkpoint: 4 hours initial budget, 6 hours hard stop. If monitor registration, Node fetch progress, and Python progress cannot all land cleanly inside the hard stop, split the unfinished lane into a follow-up branch and commit only passing completed lanes.
- Task 2 source snapshot evidence: 120 minutes maximum window after Task 1 passes. Stop before any full source fetch if small-sample smoke fails or monitor progress is not visible. If the run reaches 90 minutes before all lanes finish, commit only completed independent lanes with evidence and defer the remaining lanes to a follow-up branch.
- Task 3 DB environment classification: 30 minutes. Stop if a complete readable DB inventory is unavailable.
- Task 4 and Task 5 evidence lanes: 60 minutes each after DB inventory is confirmed.
- Task 6 final closeout: 45 minutes. Stop if final gates cannot be reproduced from committed evidence.

## Checkpoint Branch Template

Every checkpoint task starts with an explicit non-main branch. Use a new branch for Task 4 and Task 5 even if they are read-only evidence tasks.

```bash
create_checkpoint_worktree() {
  base_ref="$1"
  checkpoint_branch="$2"
  checkpoint_dir_name="$(printf '%s' "$checkpoint_branch" | tr '/' '-')"
  checkpoint_path="${3:-/home/lolben/.config/superpowers/worktrees/TerraPedia/$checkpoint_dir_name}"

  git status --short --branch
  test -z "$(git status --porcelain --untracked-files=no)"
  git worktree add "$checkpoint_path" -b "$checkpoint_branch" "$base_ref"
  cd "$checkpoint_path"
  test "$(git branch --show-current)" = "$checkpoint_branch"
  test -z "$(git status --porcelain --untracked-files=no)"
  git rev-parse HEAD "$base_ref" origin/main
  git rev-list --left-right --count origin/main..."$base_ref"
}
```

Each task below provides concrete `base_ref` and `checkpoint_branch` values. Example invocation shape:

```bash
git status --short --branch -uall
create_checkpoint_worktree main fix/domain-a-grade-example-2026-05-24
```

If an operator or agent copies a task command block into a fresh shell, define or source `create_checkpoint_worktree` from this template before invoking it. If the function is not available in that shell, inline the equivalent `git worktree add`, `cd`, branch verification, and tracked-file cleanliness checks instead of calling an undefined function.

If a checkpoint intentionally depends on an unmerged previous checkpoint, set `base_ref` to that checkpoint branch and record the dependency in the audit doc. Do not silently branch from `main` and then cherry-pick ad hoc.

Untracked local files do not block checkpoint worktree creation. Modified or staged tracked files do block it.

## Merge And Failure Matrix

Use this matrix after every checkpoint commit:

| Checkpoint result | Merge decision | Next action |
| --- | --- | --- |
| Validation passes, staged scope is exact, and the checkpoint either closes a blocker or records durable classification evidence | Eligible for local `main` merge | Merge with `git merge --no-ff "$checkpoint_branch"` after pre-merge checks, then rerun the checkpoint smoke from `main`. |
| Validation passes but the checkpoint is only a prerequisite for the next task and does not stand alone | Do not merge by default | Start the next branch from this checkpoint branch and record the dependency. Merge the chain only after the dependent checkpoint passes. |
| Validation fails because of a missing local prerequisite, with no code changes needed | Do not merge code | Commit only the classification audit if useful, or leave the branch open with a blocker note. Open the named follow-up branch or plan. |
| Validation fails after code or evidence changes | Do not merge | Keep branch open, write the failure audit, and repair on the same checkpoint branch or split by file ownership. |
| Checkpoint partially completes one independent lane and another lane fails | Merge only the passing committed lane if its validation is complete and independent | Split the failed lane to a new branch; do not include failed-lane files in the merge. |
| Merge to local `main` succeeds but post-merge smoke fails | Revert the merge commit locally | Run `git revert -m 1 <merge-commit>`, keep the checkpoint branch for repair, and record the failing smoke output. |

Pre-merge checks:

```bash
git status --short --branch -uall
git diff --cached --stat
git log --oneline --decorate -n 12
: "${checkpoint_branch:?set checkpoint_branch to the validated checkpoint branch name before merging}"
git switch main
git status --short --branch -uall
git merge --no-ff "$checkpoint_branch"
```

Post-merge smoke must rerun the same checkpoint validation from `main`. If it fails, do not continue to the next checkpoint from `main`; follow the revert row above.

## Task 0: Branch, Baseline, And Safety Lock

**Files:**
- Read: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md`
- Create: `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-baseline.md`

- [ ] **Step 1: Create isolated implementation worktree**

Run from the repository root or any clean worktree:

```bash
git status --short --branch -uall
git branch --show-current
git rev-parse HEAD main origin/main
git rev-list --left-right --count origin/main...main
git log --oneline origin/main..main | sed -n '1,45p'

base_branch=main
checkpoint_branch=fix/domain-a-grade-remaining-blockers-2026-05-24
checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-remaining-blockers-2026-05-24

test -z "$(git status --porcelain --untracked-files=no)"
test "$(git rev-parse --abbrev-ref main)" = "main"
git worktree list
git worktree add "$checkpoint_path" -b "$checkpoint_branch" "$base_branch"
cd "$checkpoint_path"
git status --short --branch -uall
test "$(git branch --show-current)" = "$checkpoint_branch"
test -z "$(git status --porcelain --untracked-files=no)"
```

Expected:

- source worktree is clean before creating the checkpoint branch;
- current `main`, `origin/main`, and ahead/behind counts are recorded in the audit doc;
- new worktree is on `fix/domain-a-grade-remaining-blockers-2026-05-24`;
- new worktree is clean and based on the verified local `main` HEAD;
- no edit is made directly on `main`;
- if local `main` is not approved as the integration base, stop and rewrite this plan to branch from `origin/main` plus explicit cherry-picks.

Do not use the older hardcoded command below; it is retained here only as an anti-pattern this repair superseded:

```bash
git worktree add \
  /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-remaining-blockers-2026-05-24 \
  -b fix/domain-a-grade-remaining-blockers-2026-05-24 \
  main
```

- [ ] **Step 1.5: Preflight Node and admin dependencies**

Run before any script that resolves Node dependencies through `data-query-app/package.json`. Use `grep -E` in this plan instead of `rg` so execution does not depend on the `rg` binary being available in the worker environment.

```bash
node --version
pnpm --version
grep --version | sed -n '1p'
test -f data-query-app/package.json
test -f data-query-app/pnpm-lock.yaml
test -d data-query-app/node_modules || (cd data-query-app && pnpm install --frozen-lockfile)
node - <<'NODE'
const { createRequire } = require('module');
const path = require('path');
const requireFromAdmin = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
requireFromAdmin('mysql2/promise');
console.log('data-query-app mysql2 dependency ok');
NODE
```

Expected:

- `data-query-app/package.json` and lockfile exist;
- `data-query-app/node_modules` exists or is restored with `pnpm install --frozen-lockfile`;
- `mysql2/promise` resolves through `data-query-app/package.json`;
- `grep -E` is available for text searches used by this plan;
- if dependency install fails, stop and classify the checkpoint as blocked by local dependency setup instead of continuing to DB or lineage steps.

- [ ] **Step 2: Reproduce current gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-remaining-baseline.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-remaining-baseline.json || test "$?" -eq 1
```

Expected:

- Freshness exits `0`.
- A-grade exits `1`.
- A-grade JSON has `generatedBlockedCount=6`.
- `/tmp` files are transient execution scratch. Step 3 must copy the command output values and exit codes into the audit doc; do not cite `/tmp` paths as durable evidence.

- [ ] **Step 3: Write baseline audit**

Create `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-baseline.md` with:

- Commands and exit codes.
- Local and remote base hashes: `HEAD`, `main`, `origin/main`, and ahead/behind counts.
- Six blocked panels.
- Statement that this task does not run crawler, DB writes, import, backfill, apply, or long item crawl.

- [ ] **Step 4: Commit baseline**

Run:

```bash
git add docs/audits/2026-05-24_domain-a-grade-remaining-blocker-baseline.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record remaining domain blocker baseline"
```

## Task 1: Source Snapshot Progress Contract

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify if monitor API contract changes: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-bosses.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`
- Likely read/reuse: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Create: `scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
- Create: `docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md`

- [ ] **Step 0: Confirm checkpoint branch and no network run in this task**

Task 1 normally continues on the Task 0 branch `fix/domain-a-grade-remaining-blockers-2026-05-24` because Task 0 created the baseline audit and this task extends the same progress-contract checkpoint. If Task 0 has already been merged into local `main`, create a new checkpoint branch before editing:

```bash
if test "$(git branch --show-current)" != "fix/domain-a-grade-remaining-blockers-2026-05-24"; then
  base_ref=main
  checkpoint_branch=fix/domain-a-grade-source-progress-contract-2026-05-24
  checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-source-progress-contract-2026-05-24
  create_checkpoint_worktree "$base_ref" "$checkpoint_branch" "$checkpoint_path"
fi
test "$(git branch --show-current)" != "main"
```

This task may edit scripts and run mocked/local progress tests only. Do not run Boss, Armor Set, Shimmer, or Town NPC live fetch commands in Task 1.

- [ ] **Step 1: Add monitor registration tests**

Add failing tests proving Crawler Monitor exposes these registered tasks even when no latest backend-refresh run exists:

| Task id | Label | Canonical progress path | Output path |
| --- | --- | --- | --- |
| `domain-source-bosses` | Domain source: Bosses | `data/generated/domain-source-bosses-progress.latest.json` | `data/generated/wiki-bosses.latest.json` |
| `domain-source-armor-sets` | Domain source: Armor sets | `data/generated/domain-source-armor-sets-progress.latest.json` | `data/generated/wiki-armor-sets.latest.json` |
| `domain-source-shimmer` | Domain source: Shimmer | `data/generated/domain-source-shimmer-progress.latest.json` | `data/generated/shimmer/wiki-shimmer-manifest.latest.json` |
| `domain-source-town-npc-maintenance` | Domain source: Town NPC maintenance | `data/generated/domain-source-town-npc-maintenance-progress.latest.json` | `data/generated/wiki-town-npc-maintenance.latest.json` |

Run:

```bash
node --input-type=module - <<'NODE'
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadLocalStackConfig } from './scripts/lib/local-runtime-config.mjs';
const require = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');
const config = loadLocalStackConfig(process.cwd());
const options = {
  host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
  user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  database: process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local',
};
try {
  const conn = await mysql.createConnection(options);
  await conn.query('SELECT 1');
  await conn.end();
  console.log(JSON.stringify({ mysqlReachable: true, options: { ...options, password: '<redacted>' } }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ mysqlReachable: false, options: { ...options, password: '<redacted>' }, error: error.message }, null, 2));
  process.exit(2);
}
NODE
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd ../data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check
cd ..
```

Expected: the MySQL preflight uses `loadLocalStackConfig` plus `TERRAPEDIA_DB_*` overrides and succeeds before Java tests run. If it exits `2`, classify Task 1 Java validation as environment-blocked instead of assuming `root/root` or continuing to interpret Maven output. If the DB preflight succeeds, the focused tests should fail before implementation because the new registered tasks do not exist.

If these tests already pass before implementation, inspect the registered task assertions and existing monitor code. If the four task IDs, progress paths, and admin page contract are already covered, record the existing state in `docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md` and skip to Step 6. Do not rewrite working monitor code just to force a red test.

- [ ] **Step 2: Implement monitor-visible registered tasks**

Implement the four registered tasks in `CrawlerMonitorServiceImpl` using the same pattern as `buildBuffFetchRefreshTask` and `buildWorldContextFetchRefreshTask`:

- `progressPath` and `progressSource` must point to the canonical path above.
- A readable progress payload must populate status, phase, message, current, total, percent, outputPath, reportPath, and nextStep.
- `childStatusPath` in the payload must be copied into the task action/progress display when present.
- Progress stale handling must use the existing stale threshold logic.
- Page contract must include the four task ids in registered task rendering fixtures so the admin monitor page does not hide them.

- [ ] **Step 3: Inspect existing progress helpers**

Run:

```bash
grep -RInE "buildActionProgressPayload|writeJsonFile|lastHeartbeatAt|progress-path|TERRAPEDIA_CRAWLER_PROGRESS_PATH|renameSync|\\.tmp" scripts/data scripts/dev back data-query-app
```

Expected: identify existing atomic JSON writer, payload shape, and whether the current writer uses `<progressPath>.tmp` plus rename semantics. If the existing Node writer does not use temp-file-plus-rename, repair the shared Node writer first and cover it with Task 1 progress tests before adding the Python wrapper.

- [ ] **Step 4: Add failing script progress tests for each lane**

Add one focused progress contract test per fetch lane proving each script supports:

- default canonical progress path, `--progress-path=<tmp path>`, and `TERRAPEDIA_CRAWLER_PROGRESS_PATH`.
- Writes progress before the first network request by mocking/stubbing the request layer or using a no-network test hook.
- Emits required fields: `actionId`, `status`, `generatedAt`, `lastHeartbeatAt`, `childStatusPath`, `phase`, `message`, `current`, `total`, `outputPath`, `reportPath`.
- Final status is `completed` or `failed`.
- Writes atomically with temp-file-plus-rename semantics, including the Python lane.
- Does not touch real `data/generated/**`, `reports/**`, or live wiki URLs during the test.
- Boss fetch has a discovery/preflight cap such as `--max-records`; exceeding the cap fails before hydrating all boss pages.
- Town NPC fetch supports small-sample smoke through `--limit=1` or `--limit=2`.

Run:

```bash
node --test \
  scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
```

Expected: fail because current scripts lack progress support.

If a progress test already passes before implementation, inspect the test and target script. If it proves the required canonical path, explicit path, env path, heartbeat, and final status fields, record it as existing coverage and continue with Step 6.

- [ ] **Step 5: Implement minimal script progress contract**

For each source snapshot fetch:

- Add stable action IDs:
  - `domain-source-bosses`
  - `domain-source-armor-sets`
  - `domain-source-shimmer`
  - `domain-source-town-npc-maintenance`
- Honor explicit `--progress-path` or env `TERRAPEDIA_CRAWLER_PROGRESS_PATH`.
- Default to the canonical registered progress path for the lane.
- Write `running` before first request.
- Update heartbeat between network steps or row/page loops.
- Write `completed` with output/report paths after success.
- Write `failed` with error message on failure.
- Do not write DB rows.
- Preserve existing default output paths and CLI compatibility for existing pipeline callers.
- Use one atomic write contract for all progress lanes: write JSON to `${progressPath}.tmp`, then rename the temp file to `progressPath` after the write succeeds.
- For the Python Town NPC lane, use a Node wrapper around `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py` to write the shared progress payload before and after invoking Python. Do not duplicate the progress payload implementation in Python unless the wrapper cannot preserve existing CLI compatibility.
- The Node wrapper must write progress via the same temp-file-plus-rename helper as the other Node fetch lanes and must be covered by the Task 1 tests.

- [ ] **Step 6: Run monitor and progress tests**

Run:

```bash
node --test \
  scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd ../data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check
cd ..
```

Expected: pass.

- [ ] **Step 7: Write progress contract audit**

Create `docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md` with:

- touched scripts,
- action IDs and registered monitor task ids,
- canonical/default/explicit/env progress path support,
- monitor registration tests run and exit codes,
- tests run and exit codes,
- confirmation that no network fetch was run in this task unless a test mocked it.

- [ ] **Step 8: Commit progress contract**

Run:

```bash
git add \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java \
  data-query-app/types/crawlerMonitor.typecheck.ts \
  data-query-app/tests/crawler-monitor-page-contract.test.mjs \
  scripts/data/fetch/fetch-wiki-bosses.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance.py \
  scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs \
  docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(data): add source snapshot progress contracts"
```

## Task 2: Bounded Source Snapshot Evidence

**Files:**
- Generated and potentially trackable:
  - `data/generated/wiki-bosses.latest.json`
  - `data/generated/wiki-armor-sets.latest.json`
  - `data/generated/wiki-shimmer.latest.json`
  - `data/generated/shimmer/wiki-shimmer-manifest.latest.json`
  - `data/generated/shimmer/wiki-shimmer-context.importable.latest.json`
  - `data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json`
  - `data/generated/wiki-town-npc-maintenance.latest.json`
- Reports:
  - `reports/wiki-bosses-fetch-2026-05-24.json`
  - Shimmer and Town NPC report paths from commands
- Modify: `.gitignore` for all exact durable evidence allowlists required by Task 2, Task 4, Task 5, and final closeout
- Regenerate: affected `reports/domain/**/source-readiness-2026-05-24.json` or current-date files per generator output
- Create: `docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md`

- [ ] **Step 0: Create source evidence checkpoint branch**

Use the Checkpoint Branch Template with:

```bash
base_ref=fix/domain-a-grade-remaining-blockers-2026-05-24
checkpoint_branch=fix/domain-a-grade-source-snapshot-evidence-2026-05-24
checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-source-snapshot-evidence-2026-05-24
create_checkpoint_worktree "$base_ref" "$checkpoint_branch" "$checkpoint_path"
```

If Task 1 has already been merged into local `main`, set `base_ref=main`. Record the base branch and hash in the Task 2 audit.

- [ ] **Step 0.5: Record Town NPC seed count**

Run:

```bash
node - <<'NODE' | tee /tmp/terrapedia-town-npc-seed-count.json
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync('data/generated/npc-standardized-map.json', 'utf8'));
const records = payload.records || {};
const seeds = Object.entries(records)
  .filter(([, record]) => {
    if (!record || typeof record !== 'object') return false;
    let raw = {};
    try {
      raw = JSON.parse(record.rawJson || '{}');
    } catch {
      raw = {};
    }
    return raw.extras && String(raw.extras.townNPC).toLowerCase() === 'true';
  })
  .map(([id]) => id);
console.log(JSON.stringify({ townNpcSeedCount: seeds.length, sampleIds: seeds.slice(0, 5) }, null, 2));
NODE
```

Expected: writes the full Town NPC seed count to `/tmp/terrapedia-town-npc-seed-count.json` and the Task 2 audit doc. `/tmp` remains scratch only; Step 3 must re-extract the value from `data/generated/npc-standardized-map.json` if the scratch file is missing in a later shell session.

- [ ] **Step 1: Verify Python dependency**

Run:

```bash
python3 --version
python3 - <<'PY'
from bs4 import BeautifulSoup, Tag
print('bs4 ok')
PY
```

Expected: `bs4 ok`. If not, stop and repair Python dependency in a separate environment commit or document blocker; do not run Town NPC fetch.

- [ ] **Step 1.5: Confirm live fetch window and execution gate**

This is the first task that may perform network requests to `terraria.wiki.gg`. Before running Step 2:

- confirm Task 1 is committed and its tests passed;
- confirm the four source snapshot registered tasks are visible through Crawler Monitor tests or `/api/admin/crawler-monitor/overview`;
- check no other crawler/fetch/backend-refresh writer is active:

```bash
ps -eo pid,ppid,stat,command | grep -E "[r]un-backend-data-refresh|[r]un-wiki-sync|[f]etch-wiki|[i]tem-page|[c]rawler" || true
test ! -f reports/backend-refresh/backend-refresh.lock.json || cat reports/backend-refresh/backend-refresh.lock.json
```

- confirm no item-page crawl, backend refresh apply, import, backfill, DB write, or production mutation is part of the command list;
- record the live-fetch start time and expected maximum duration in the audit doc;
- require an explicit environment gate before live network fetches:

```bash
test "${TERRAPEDIA_ALLOW_LIVE_FETCH:-}" = "1" || {
  echo "TERRAPEDIA_ALLOW_LIVE_FETCH=1 is required for live source fetches; classifying Group B as pending source fetch."
  exit 2
}
```

- if `TERRAPEDIA_ALLOW_LIVE_FETCH` is not set to `1`, skip Step 2 and classify Group B as still blocked by pending source fetch.
- if any command list includes `--apply`, import, backfill, backend refresh apply, item-page crawl, or DB write, stop and repair this plan before running network fetches.

- [ ] **Step 2: Run small-sample network smoke first**

Use temporary outputs that are not committed:

```bash
python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py \
  --progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json \
  --source=data/generated/npc-standardized-map.json \
  --output=/tmp/terrapedia-town-npc-maintenance-smoke.json \
  --snapshot-output=/tmp/terrapedia-town-npc-maintenance-smoke-report.json \
  --limit=2
```

Expected:

- final progress has `status=completed`;
- `lastHeartbeatAt` updates during the run;
- monitor can read the canonical progress path for `domain-source-town-npc-maintenance`;
- no durable evidence is staged from `/tmp`.

- [ ] **Step 3: Run one bounded source fetch at a time**

Run each command with a progress path:

```bash
if test ! -f /tmp/terrapedia-town-npc-seed-count.json; then
  echo "Town NPC seed count scratch file missing; re-extracting from data/generated/npc-standardized-map.json"
  node - <<'NODE' | tee /tmp/terrapedia-town-npc-seed-count.json
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync('data/generated/npc-standardized-map.json', 'utf8'));
const records = payload.records || {};
const seeds = Object.entries(records)
  .filter(([, record]) => {
    if (!record || typeof record !== 'object') return false;
    let raw = {};
    try {
      raw = JSON.parse(record.rawJson || '{}');
    } catch {
      raw = {};
    }
    return raw.extras && String(raw.extras.townNPC).toLowerCase() === 'true';
  })
  .map(([id]) => id);
console.log(JSON.stringify({ townNpcSeedCount: seeds.length, sampleIds: seeds.slice(0, 5) }, null, 2));
NODE
fi
town_npc_seed_count="$(node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('/tmp/terrapedia-town-npc-seed-count.json','utf8')); process.stdout.write(String(j.townNpcSeedCount || ''));")"
test -n "$town_npc_seed_count"
test "$town_npc_seed_count" -gt 0

node scripts/data/fetch/fetch-wiki-bosses.mjs \
  --progress-path=data/generated/domain-source-bosses-progress.latest.json \
  --output-json=data/generated/wiki-bosses.latest.json \
  --report-json=reports/wiki-bosses-fetch-2026-05-24.json \
  --max-records=40

node scripts/data/fetch/fetch-wiki-armor-sets.mjs \
  --progress-path=data/generated/domain-source-armor-sets-progress.latest.json \
  --output-dir=data/generated \
  --keep-snapshot=false

node scripts/data/fetch/fetch-wiki-shimmer-page.mjs \
  --progress-path=data/generated/domain-source-shimmer-progress.latest.json \
  --output=data/generated/wiki-shimmer.latest.json \
  --report-output=reports/wiki-shimmer-summary-2026-05-24.md

node scripts/data/transform/transform-wiki-shimmer-to-importable.mjs \
  --input=data/generated/wiki-shimmer.latest.json \
  --output=data/generated/shimmer \
  --report-output=reports/wiki-shimmer-importable-summary-2026-05-24.md \
  --use-db-lookup=false

python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py \
  --progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json \
  --source=data/generated/npc-standardized-map.json \
  --output=data/generated/wiki-town-npc-maintenance.latest.json \
  --snapshot-output=reports/wiki-town-npc-maintenance-2026-05-24.json \
  --limit="$town_npc_seed_count"
```

Expected:

- These commands rely on CLI flags implemented or verified in Task 1 Step 5. If any fetch script rejects `--progress-path`, `--max-records`, or `--keep-snapshot=false`, skip this step and return to Task 1 to add the missing compatibility before running live fetches.
- Each fetch completes within 20 minutes. If Armor sets exceeds 20 minutes or produces more than 120 records, stop and add a `--max-records` or equivalent bounded-fetch option to Task 1 before rerunning Task 2.
- Each final progress JSON has `status=completed`.
- Monitor overview shows the corresponding registered task as completed or recently updated.
- No DB writes.
- No long item crawl.
- Shimmer transform intentionally uses `--use-db-lookup=false` in this source-only checkpoint to keep Task 2 free of DB reads. Record in `docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md` that Shimmer importable output may lack DB-enriched item/NPC resolution, and schedule a later DB-read rerun with `--use-db-lookup=true` after Task 3 confirms the three-database environment.

After each command, run and record:

```bash
node -e "const fs=require('fs'); for (const p of ['data/generated/domain-source-bosses-progress.latest.json','data/generated/domain-source-armor-sets-progress.latest.json','data/generated/domain-source-shimmer-progress.latest.json','data/generated/domain-source-town-npc-maintenance-progress.latest.json']) if (fs.existsSync(p)) console.log(p, JSON.parse(fs.readFileSync(p,'utf8')).status)"
git status --short -- data/generated reports
```

If a lane fails after generating partial durable output, do not stage that lane. Either delete only the generated partial files for that lane while they are unstaged, or leave them untracked and document the failure. Do not merge partial source evidence for a failed lane.

- [ ] **Step 4: Make gate-consumed evidence durable**

Add exact negative `.gitignore` allowlists for only gate-consumed outputs and compact reports. Existing ignore rules include broad `reports/*`, `data/generated/*.latest.json`, `data/generated/**/*.latest.json`, and `data/generated/wiki-*.json`, so a plain `git add` will fail until exact `!path` entries are present after those broad rules.

Task 2 is the only task allowed to edit `.gitignore`. Include the future Task 4 lineage report path and Task 5 coverage report paths here so Task 4 and Task 5 do not need separate `.gitignore` edits. Only the `.gitignore` allowlist entries are part of this checkpoint; the future Task 4/5 generated files must be staged by their own checkpoints after they exist.

Add or verify exact `.gitignore` entries:

```gitignore
!data/generated/wiki-bosses.latest.json
!data/generated/wiki-armor-sets.latest.json
!data/generated/wiki-town-npc-maintenance.latest.json
!data/generated/shimmer/
!data/generated/shimmer/wiki-shimmer-manifest.latest.json
!data/generated/shimmer/wiki-shimmer-context.importable.latest.json
!data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json
!reports/wiki-bosses-fetch-2026-05-24.json
!reports/wiki-shimmer-summary-2026-05-24.md
!reports/wiki-shimmer-importable-summary-2026-05-24.md
!reports/wiki-town-npc-maintenance-2026-05-24.json
!reports/audit/
!reports/audit/image-source-lineage-2026-05-24.json
!reports/relation/entity-coverage-baseline-2026-05-24.json
!reports/relation/entity-coverage-baseline-2026-05-24.md
```

Do not stage files in this step. Staging happens in Step 6 after domain reports are regenerated and the source evidence audit exists. Do not commit progress JSON files unless the acceptance gate starts consuming them.

- [ ] **Step 5: Regenerate domain reports and gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-source-snapshots.json || test "$?" -eq 1
```

Expected: the four Group B source-readiness blockers are cleared or converted into real source-quality blockers.

- [ ] **Step 6: Write and commit source evidence audit**

Create `docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md`, then stage exact affected domain reports, durable evidence paths, `.gitignore`, and the audit doc. Before committing, run:

```bash
git check-ignore -v data/generated/wiki-bosses.latest.json || true
git check-ignore -v data/generated/wiki-armor-sets.latest.json || true
git check-ignore -v data/generated/wiki-town-npc-maintenance.latest.json || true
git check-ignore -v data/generated/shimmer/wiki-shimmer-manifest.latest.json || true
git status --short --ignored -- data/generated reports/wiki-bosses-fetch-2026-05-24.json reports/wiki-town-npc-maintenance-2026-05-24.json reports/domain
```

Expected: exact durable evidence paths are addable or already tracked; temporary progress paths remain ignored/untracked unless intentionally consumed by the gate.

```bash
for path in \
  .gitignore \
  data/generated/wiki-bosses.latest.json \
  data/generated/wiki-armor-sets.latest.json \
  data/generated/wiki-town-npc-maintenance.latest.json \
  data/generated/shimmer/wiki-shimmer-manifest.latest.json \
  data/generated/shimmer/wiki-shimmer-context.importable.latest.json \
  data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json \
  reports/wiki-bosses-fetch-2026-05-24.json \
  reports/wiki-shimmer-summary-2026-05-24.md \
  reports/wiki-shimmer-importable-summary-2026-05-24.md \
  reports/wiki-town-npc-maintenance-2026-05-24.json \
  reports/domain/bosses/source-readiness-2026-05-24.json \
  reports/domain/armor_sets/source-readiness-2026-05-24.json \
  reports/domain/support.shimmer/source-readiness-2026-05-24.json \
  reports/domain/support.town_npc_maintenance/source-readiness-2026-05-24.json \
  docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md
do
  if test -e "$path"; then
    git add "$path"
  else
    echo "skip missing optional Task 2 path: $path"
  fi
done
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record source snapshot evidence"
```

Do not stage `reports/audit/image-source-lineage-2026-05-24.json` or `reports/relation/entity-coverage-baseline-2026-05-24.*` in Task 2. Those paths are only allowlisted here; Task 4 and Task 5 stage them after their own generators run.

## Task 3: DB Read Environment Repair

**Files:**
- Create: `docs/audits/2026-05-24_domain-a-grade-db-read-environment.md`
- Possibly modify local dev docs or scripts only if the DB environment setup is codified

- [ ] **Step 0: Create DB-read checkpoint branch**

Use the Checkpoint Branch Template with:

```bash
base_ref=main
checkpoint_branch=fix/domain-a-grade-db-read-environment-2026-05-24
checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-db-read-environment-2026-05-24
create_checkpoint_worktree "$base_ref" "$checkpoint_branch" "$checkpoint_path"
```

If Task 3 depends on unmerged source evidence from Task 2, set `base_ref` to the completed Task 2 branch and record that dependency in the audit.

- [ ] **Step 1: Verify DB inventory**

Run:

```bash
node --input-type=module - <<'NODE'
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadLocalStackConfig } from './scripts/lib/local-runtime-config.mjs';
const require = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');
const config = loadLocalStackConfig(process.cwd());
const options = {
  host: config.database?.host ?? '127.0.0.1',
  port: Number(config.database?.port ?? 3306),
  user: config.database?.username ?? 'root',
  password: config.database?.password ?? 'root',
};
const conn = await mysql.createConnection(options);
const [rows] = await conn.query("SHOW DATABASES LIKE 'terria_v1_%'");
console.log(JSON.stringify({ options: { ...options, password: '<redacted>' }, databases: rows }, null, 2));
await conn.end();
NODE
```

Expected: `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` all exist.

- [ ] **Step 2: If `terria_v1_maint` is missing, stop**

Do not synthesize, restore, import, or write a maint database in this plan. Write the audit doc classifying DB environment as blocked and open a separate DB restore plan. Task 4 and Task 5 must remain pending until a complete readable DB environment exists.

- [ ] **Step 3: Commit DB environment audit**

Run:

```bash
git add docs/audits/2026-05-24_domain-a-grade-db-read-environment.md
git commit -m "docs: record domain blocker db read environment"
```

## Task 4: Boss Image Lineage Evidence

**Prerequisite:** Task 3 confirms complete DB read environment.

**Files:**
- Generate: `reports/audit/image-source-lineage-2026-05-24.json`
- Read: `.gitignore` exact allowlist from Task 2; do not edit `.gitignore` in Task 4
- Regenerate: `reports/domain/bosses/image-readiness-*.json`
- Create: `docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md`

- [ ] **Step 0: Create Boss lineage checkpoint branch**

Use the Checkpoint Branch Template with:

```bash
base_ref=main
checkpoint_branch=fix/domain-a-grade-boss-image-lineage-2026-05-24
checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-boss-image-lineage-2026-05-24
create_checkpoint_worktree "$base_ref" "$checkpoint_branch" "$checkpoint_path"
```

If Task 3 is not merged into `main`, set `base_ref=fix/domain-a-grade-db-read-environment-2026-05-24` and record the dependency. Do not run Task 4 from `main` or any shared worktree.

- [ ] **Step 0.5: Confirm DB environment audit prerequisite**

```bash
test -f docs/audits/2026-05-24_domain-a-grade-db-read-environment.md
! grep -nE "blocked|missing terria_v1_maint|missing.*terria_v1_relation|missing.*terria_v1_local" docs/audits/2026-05-24_domain-a-grade-db-read-environment.md
```

Expected: the DB environment audit exists and does not classify the three-database read environment as blocked. If it is missing or blocked, stop Task 4 and leave Boss image lineage pending.

- [ ] **Step 1: Run read-only lineage report**

```bash
git status --short --branch -uall
test -z "$(git status --porcelain --untracked-files=no)"
node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-24T00:00:00.000Z
```

Expected: writes `reports/audit/image-source-lineage-2026-05-24.json`.

- [ ] **Step 2: Inspect Boss contract**

```bash
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('reports/audit/image-source-lineage-2026-05-24.json', 'utf8'));
const bosses = report.entities?.bosses;
console.log(JSON.stringify({ topLevelKeys: Object.keys(report), bossKeys: bosses ? Object.keys(bosses) : [] }, null, 2));
if (!bosses) {
  throw new Error('missing entities.bosses in image source lineage report');
}
console.log(JSON.stringify(bosses, null, 2));
NODE
```

Expected: the report shape is discovered first, `entities.bosses` exists, and the Boss section contains either a `contractReady`-equivalent readiness field or concrete gap reason fields. If the key names differ from `contractReady`/`gapReasons`, record the actual keys in the audit doc and use those keys for classification instead of assuming a fixed schema.

- [ ] **Step 3: Regenerate domain reports and commit evidence**

Regenerate gate reports, allowlist the exact lineage report with:

```gitignore
!reports/audit/
!reports/audit/image-source-lineage-2026-05-24.json
```

This allowlist must already have been added by Task 2. Write audit and commit. Stage only files regenerated in this run. If Boss lineage is not contract-ready, keep blocker open and open a separate Boss image repair branch.

Before committing:

```bash
git check-ignore -v reports/audit/image-source-lineage-2026-05-24.json || true
test -z "$(git check-ignore reports/audit/image-source-lineage-2026-05-24.json || true)"
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-boss-lineage.json || test "$?" -eq 1
git status --short --branch -uall
git add \
  reports/audit/image-source-lineage-2026-05-24.json \
  reports/domain/bosses/image-readiness-2026-05-24.json \
  docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record boss image lineage evidence"
```

If no domain report changed and the Boss lineage report is not contract-ready, commit only the audit doc and report if they are useful for classification; otherwise leave the branch open and do not merge.

## Task 5: Projectile Relation Coverage Evidence

**Prerequisite:** Task 3 confirms complete DB read environment.

**Files:**
- Generate: `reports/relation/entity-coverage-baseline-2026-05-24.json`
- Generate: `reports/relation/entity-coverage-baseline-2026-05-24.md`
- Read: `.gitignore` exact allowlist from Task 2; do not edit `.gitignore` in Task 5
- Regenerate: `reports/domain/projectiles/relation-readiness-*.json`
- Create: `docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md`

- [ ] **Step 0: Create projectile coverage checkpoint branch**

Use the Checkpoint Branch Template with:

```bash
base_ref=main
checkpoint_branch=fix/domain-a-grade-projectile-relation-coverage-2026-05-24
checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-projectile-relation-coverage-2026-05-24
create_checkpoint_worktree "$base_ref" "$checkpoint_branch" "$checkpoint_path"
```

If Task 3 is not merged into `main`, set `base_ref=fix/domain-a-grade-db-read-environment-2026-05-24` and record the dependency. Do not run Task 5 from `main` or any shared worktree.

- [ ] **Step 0.5: Confirm DB environment audit prerequisite**

```bash
test -f docs/audits/2026-05-24_domain-a-grade-db-read-environment.md
! grep -nE "blocked|missing terria_v1_maint|missing.*terria_v1_relation|missing.*terria_v1_local" docs/audits/2026-05-24_domain-a-grade-db-read-environment.md
```

Expected: the DB environment audit exists and does not classify the three-database read environment as blocked. If it is missing or blocked, stop Task 5 and leave projectile relation coverage pending.

- [ ] **Step 1: Run fresh read-only baseline**

```bash
git status --short --branch -uall
test -z "$(git status --porcelain --untracked-files=no)"
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
```

Expected: writes JSON and Markdown under `reports/relation/`.

- [ ] **Step 2: Classify projectile gap**

```bash
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('reports/relation/entity-coverage-baseline-2026-05-24.json','utf8')); console.log(JSON.stringify(j.fieldAudit?.domains?.projectiles,null,2));"
```

Expected:

- If `nameZh.gap=0`, regenerate domain reports and clear blocker.
- If `nameZh.gap>0`, open a dedicated projectile zh relation repair branch; do not weaken gate and do not write DB rows inside this plan.

- [ ] **Step 2.5: Stop before any write repair**

If Step 2 reports a nonzero gap, do not run an apply/import/backfill command. Create a follow-up DB-write repair plan with:

- exact rows or keys from the dry-run/read-only baseline;
- target databases and tables;
- dry-run command and expected report path;
- backup command and restore command from the DB write and backup barrier;
- post-apply validation commands;
- rollback decision owner.

If the gap persists, this plan must classify `projectiles/relationReadiness` as still blocked in `docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md` and in Task 6 closeout. The dedicated repair branch is a follow-up artifact, not a partial closure of the blocker.

- [ ] **Step 3: Commit classification**

Commit fresh baseline and audit doc. Include `reports/domain/projectiles/relation-readiness-*.json` only if regenerated.

Before committing:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-projectile-coverage.json || test "$?" -eq 1
git status --short --branch -uall
git check-ignore -v reports/relation/entity-coverage-baseline-2026-05-24.json || true
test -z "$(git check-ignore reports/relation/entity-coverage-baseline-2026-05-24.json || true)"
git add \
  reports/relation/entity-coverage-baseline-2026-05-24.json \
  reports/relation/entity-coverage-baseline-2026-05-24.md \
  reports/domain/projectiles/relation-readiness-2026-05-24.json \
  docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record projectile relation coverage evidence"
```

## Task 6: Final A-Grade Rebuild And Release Decision

**Files:**
- Regenerate: `reports/domain/**`
- Create: `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-closeout.md`
- Update: `docs/project-management/current-status.md`
- Update: `docs/project-management/risk-register.md`
- Update: `docs/project-management/decision-log.md`

- [ ] **Step 0: Create final closeout checkpoint branch**

Use the Checkpoint Branch Template with:

```bash
base_ref=main
checkpoint_branch=fix/domain-a-grade-remaining-blocker-closeout-2026-05-24
checkpoint_path=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-remaining-blocker-closeout-2026-05-24
create_checkpoint_worktree "$base_ref" "$checkpoint_branch" "$checkpoint_path"
```

If Task 4 or Task 5 is intentionally left unmerged because it classified a blocker as still blocked, record that branch name and blocker status in the closeout audit instead of depending on its unmerged files.

- [ ] **Step 1: Rebuild final reports**

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-remaining-closeout.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-remaining-closeout.json || test "$?" -eq 1
```

- [ ] **Step 2: Run frontend checks**

```bash
cd front-nuxt && pnpm run check:public-pages && pnpm run check
```

Expected: route check and typecheck exit `0`; Node `DEP0205` warning may appear.

- [ ] **Step 3: Write closeout**

Record:

- starting blocker count `6`,
- ending blocker count,
- closed blockers,
- remaining blockers and exact follow-up branches,
- any skipped branch and the reason it was not merged,
- whether V0.1 remains preview-only or can proceed to staging smoke.

- [ ] **Step 4: Commit closeout**

Stage exact regenerated reports and management docs. Omit files that were not regenerated in this run. Do not use directory-level `git add reports/domain`; stage only files shown by `git status --short` that belong to this run. Commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: close remaining domain blockers"
```

Only stage `docs/project-management/risk-register.md` or `docs/project-management/decision-log.md` if `git status --short` shows they changed in this checkpoint.

## Execution Order

1. Branch/checkpoint A: Task 0 baseline.
2. Branch/checkpoint B: Task 1 progress contract and monitor registration.
3. Branch/checkpoint C: Task 2 source snapshot evidence, only after Task 1 is merged locally or deliberately used as base.
4. Branch/checkpoint D: Task 3 DB environment repair/classification.
5. Branch/checkpoint E: Task 4 Boss image lineage.
6. Branch/checkpoint F: Task 5 Projectile relation coverage.
7. Branch/checkpoint G: Task 6 final closeout.

## Closeout And Integration Policy

After each checkpoint:

1. Run `git status --short --branch -uall`.
2. Run the checkpoint validation commands.
3. Stage only explicit paths from that checkpoint.
4. Commit the checkpoint.
5. Decide one of:
   - merge checkpoint into local `main`;
   - keep checkpoint branch open because a prerequisite failed;
   - start the next checkpoint branch from the completed checkpoint branch when it intentionally depends on unmerged work.

Before merging any checkpoint into local `main`:

```bash
git status --short --branch -uall
git rev-list --left-right --count origin/main...main
git log --oneline origin/main..main | sed -n '1,45p'
: "${checkpoint_branch:?set checkpoint_branch to the validated checkpoint branch name before merging}"
git switch main
git merge --no-ff "$checkpoint_branch"
git status --short --branch -uall
```

Do not delete the checkpoint branch or worktree unless the worktree is clean and the branch is merged. Do not push local `main` in this plan.

After a checkpoint branch is merged into local `main` and the post-merge smoke passes, clean up only that checkpoint's clean worktree:

```bash
git worktree list
git status --short --branch
test -z "$(git status --porcelain --untracked-files=no)"
cd "$(git rev-parse --show-toplevel)"
git switch main
git worktree remove <merged-checkpoint-worktree-path>
```

Do not remove worktrees for blocked, unmerged, dirty, or follow-up branches.

User retest rule:

- If the checkpoint is not merged into local `main`, validate and run services from the checkpoint worktree path.
- If the checkpoint is merged into local `main`, validate and run services from whichever worktree `git worktree list` currently shows as `main`.
- Do not validate from `/home/lolben/TerraPedia` unless that worktree is intentionally on the expected branch, clean, and updated to the merge commit.

## Stop Conditions

Stop and repair the plan if:

- the work is happening in `/home/lolben/TerraPedia` or directly on `main` instead of the dedicated fix worktree;
- any task requires DB writes, import, backfill, apply, or production mutation;
- a source fetch still lacks monitor-visible progress;
- a source fetch expands into long item crawling;
- evidence is generated but remains ignored without an explicit allowlist or tracked summary contract;
- A-grade passes only because gate checks were weakened.

## Success Criteria

Minimum success:

- Every remaining blocker is either cleared with durable gate-consumed evidence or classified with a concrete follow-up repair branch.
- Freshness remains `pass`.
- Public V0.1 remains preview-only unless A-grade exits `0`.

Full success:

- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` exits `0`.
- `generatedBlockedCount=0`.
- Remaining warnings are documented as non-release-blocking or assigned to warning burn-down.
