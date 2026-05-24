# Local Preview Quality Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue local preview stabilization without pushing, staging, or releasing by burning down the highest-value warning debt and keeping the already-closed Front Nuxt visual pass in maintenance mode.

**Architecture:** Treat the current local `main` as the integration base while remote sync is intentionally deferred. Split follow-up work into three independent lanes: Boss image relation/projection warning debt, NPC Chinese-name coverage gate, and Front Nuxt incremental visual maintenance. Use multi-agent review for no-DB-write analysis, but serialize any DB writes, Domain Acceptance gate changes, and shared frontend gate edits.

**Tech Stack:** Node.js ESM data scripts under `scripts/data/**`, MySQL local/maint/relation databases, Domain Acceptance reports under `reports/domain/**`, Java backend tests under `back`, Nuxt 4/Vue 3 public frontend under `front-nuxt`, project-management records under `docs/project-management/**`.

---

## Current Baseline

This plan starts from local `main` only:

- local `main`: `b5e3efa`
- `origin/main`: `bd7065d`
- ahead/behind: `origin/main...main = 0 7`
- remote sync: intentionally deferred
- release/staging: intentionally deferred

Current project state from committed records:

- Domain A-grade has no generated blockers: `generatedBlockedCount=0`.
- Domain A-grade still has warning debt: `generatedWarningCount=18`.
- V0.1 remains a local public preview, not a release.
- Front Nuxt visual closeout already passed with `check:public-pages`, `check`, and `check:visual` exit `0`.
- The older Front Nuxt visual plan must not be re-run as a full Task 0-7 implementation; it is now a completed closeout plus maintenance baseline.

Current warning and gap evidence:

- `reports/domain/bosses/image-readiness-2026-05-24.json`: status `warning`, no blockers.
- `docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md`: Boss image lineage warning is real contract debt: `relation_bosses=0`, `projection_bosses=0`.
- `reports/relation/entity-coverage-baseline-2026-05-24.json`: `npcs.nameZh.gap=613`, `npcs.subNameZh.gap=206`.
- `reports/domain/npcs/relation-readiness-2026-05-24.json`: status `pass`, so NPC zh coverage is not yet enforced as an automatic gate.
- `reports/domain/projectiles/relation-readiness-2026-05-24.json`: status `warning` only because optional `reports/projectile-zh-image-backfill*.json` is missing.

## Non-Goals

- No `git push`, remote branch publication, PR, staging, or release decision.
- No full item crawl, `item-pages-refresh`, crawler run, backend refresh apply, import, backfill, or DB write unless a task explicitly reaches the manual approval gate.
- No Boss-only DB apply is allowed until tests prove the command really limits clear/upsert operations to Boss-owned tables.
- No weakening Domain Acceptance, public page checks, or visual checks to pass.
- No re-running the completed Front Nuxt visual quality plan as if it were unfinished.
- No broad frontend redesign or marketing-style landing page work.

## Git And Worktree Strategy

Planning branch:

```bash
plan/local-preview-quality-continuation-2026-05-24
```

Implementation branches, created only from current local `main`:

```bash
fix/boss-image-relation-projection-readiness-2026-05-24
fix/npc-zh-coverage-gate-2026-05-24
fix/front-nuxt-visual-maintenance-2026-05-24
```

Rules:

- Use the explicit worktree paths and branch names listed in each task.
- Before each branch: `git status --short --branch`, `git rev-parse --short main`, `git rev-parse --short origin/main`, and `git rev-list --left-right --count origin/main...main`.
- Keep each branch focused. Do not combine Boss data writes, NPC gate logic, and Front Nuxt page fixes in one branch.
- Use explicit `git add <file...>` only. Never use `git add .`.
- Do not push any branch or `main`.
- Merge back to local `main` only after the branch's validation and closeout audit pass.

## Agent Split

Read-only agents can run in parallel:

- Agent A: Boss relation/projection chain audit.
- Agent B: NPC zh coverage gate audit.
- Agent C: Front Nuxt visual maintenance audit.
- Agent D: Final plan/code review and boundary review.

Write agents must not edit the same file, same table, same report path, or same service lifecycle:

- Boss branch owns Boss relation/projection scripts, Boss evidence docs, and Boss-specific reports.
- NPC branch owns relation coverage/gate semantics and NPC zh evidence docs.
- Front branch owns Front Nuxt visual gate or page fixes only.
- Project-management docs should be edited by one integration owner after task closeout.

## Time Budget And Stop-Loss

- Task 0 plan/baseline: 30 minutes.
- Task 1 Boss no-DB-write classification: 45 minutes.
- Task 2 Boss repair plan execution, dry-run first: 2 hours; stop before DB writes unless the manual approval gate is satisfied.
- Task 3 NPC gate implementation: 2 hours.
- Task 4 Front Nuxt maintenance verification: 60 minutes; only fix real regressions.
- Task 5 closeout and local main merge: 45 minutes.

If any task exceeds the upper bound by more than 50%, write a blocker note in `docs/audits/`, repair this plan, and continue only after review.

## Task 0: Baseline And Plan State

**Files:**
- Create: `docs/audits/2026-05-24_local-preview-quality-continuation-baseline.md`
- Modify: `docs/project-management/current-status.md`

- [ ] **Step 1: Create implementation baseline branch**

Run from local `main`:

```bash
git status --short --branch
test "$(git branch --show-current)" = "main"
test -z "$(git status --short)"
git rev-parse --short HEAD
git rev-parse --short main
git rev-parse --short origin/main
git rev-list --left-right --count origin/main...main
```

Expected:

- current branch is `main`;
- worktree is clean;
- local `main` remains ahead of `origin/main`;
- no push or release command is run.

- [ ] **Step 2: Reproduce current report-level baseline**

Run no-DB-write checks. Some commands read DB and may refresh filesystem reports under `reports/**`; they must not write database rows:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
node -e "const fs=require('fs'); for (const f of ['reports/domain/bosses/image-readiness-2026-05-24.json','reports/domain/npcs/relation-readiness-2026-05-24.json','reports/domain/projectiles/relation-readiness-2026-05-24.json','reports/relation/entity-coverage-baseline-2026-05-24.json']) { console.log('\\n## '+f); console.log(fs.existsSync(f) ? fs.readFileSync(f,'utf8').slice(0,1200) : 'missing'); }"
```

Expected:

- freshness exits `0`;
- A-grade exits `0` with warning status, not blocked;
- Boss image readiness is warning;
- NPC relation readiness still passes despite `npcs.nameZh.gap=613`.

- [ ] **Step 3: Write baseline audit**

Create `docs/audits/2026-05-24_local-preview-quality-continuation-baseline.md` with:

- local and remote hashes;
- exact commands, exit codes, and report files refreshed;
- statement that remote sync and release are deferred;
- current P0/P1/P2 order: Boss, NPC gate, Front Nuxt maintenance, Projectile later.

- [ ] **Step 4: Commit baseline**

```bash
git add docs/audits/2026-05-24_local-preview-quality-continuation-baseline.md docs/project-management/current-status.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record local preview continuation baseline"
```

## Task 1: Boss Image Relation And Projection Readiness

**Goal:** Turn the Boss image warning from a known contract gap into either durable closure or a precise blocked classification before any stronger release language.

**Files:**
- Read/modify if needed: `scripts/data/relation/boss-series-processor.mjs`
- Read/modify if needed: `scripts/data/relation/sync-maint-to-relation.mjs`
- Read/modify if needed: `scripts/data/relation/sync-boss-projection.mjs`
- Read/modify if needed: `scripts/data/relation/projection-sync.mjs`
- Read/modify if needed: `scripts/data/audit/image-source-lineage-report.mjs`
- Test: `scripts/data/relation/boss-series-processor.test.mjs`
- Test: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Test: `scripts/data/relation/sync-boss-projection.test.mjs`
- Test: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Create: `docs/audits/2026-05-24_boss-image-relation-projection-readiness.md`

- [ ] **Step 1: Create branch and run DB preflight**

```bash
git worktree add /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-boss-image-relation-projection-readiness-2026-05-24 -b fix/boss-image-relation-projection-readiness-2026-05-24 main
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-boss-image-relation-projection-readiness-2026-05-24
git status --short --branch
node scripts/data/relation/entity-coverage-baseline.mjs --local-database=terria_v1_local --maint-database=terria_v1_maint --relation-database=terria_v1_relation
```

Expected:

- branch is clean;
- readable `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` are available;
- if `terria_v1_maint` is not readable, stop and write a classification audit instead of repairing Boss.

- [ ] **Step 2: Prove whether Boss scope is currently safe**

Run:

```bash
node --test scripts/data/relation/boss-series-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-boss-projection.test.mjs
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=category,recipe,npc,buff,biome,projectile --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=boss --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected:

- tests pass or expose the exact Boss path failure;
- dry-run output confirms whether `scopes` affects generated summaries;
- dry-run output alone is not accepted as scope isolation proof because current code may parse `scopes` without limiting generated or applied domains.

- [ ] **Step 3: Add a focused failing test for DB write isolation**

Add tests proving the current unsafe behavior before any DB write is considered:

- `parseArgs` can accept `--scopes=boss`;
- dry-run with Boss maint rows produces `relationBosses` and `projectionBosses`;
- `runSync({ apply: true, scopes: ['boss'] })` does not clear or upsert unrelated tables such as `relation_items`, `relation_npcs`, `relation_projectiles`, `relation_buffs`, `projection_items`, `projection_npcs`, `projection_projectiles`, or `projection_buffs`;
- if current implementation clears or upserts unrelated tables, the test must fail and the branch must classify Boss DB apply as unsafe.

Run:

```bash
node --test scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/boss-series-processor.test.mjs
```

Expected before implementation: fail if `--scopes=boss` is not a real Boss-only DB apply boundary.

- [ ] **Step 4: Implement minimal Boss scope repair or stop with unsafe classification**

Implementation must preserve existing category, recipe, npc, buff, biome, projectile behavior.

Rules:

- Do not clear or write DB tables in tests.
- Keep `--apply=false` as the default.
- If Boss-only scope isolation cannot be implemented safely in this branch, do not provide a DB write command. Write `docs/audits/2026-05-24_boss-image-relation-projection-readiness.md` with status `blocked: full relation rebuild approval required`.
- If Boss-only scope isolation is implemented, tests must prove unrelated tables are not cleared or upserted before any manual DB write gate is allowed.

- [ ] **Step 5: Dry-run and lineage verification**

Run:

```bash
node --test scripts/data/relation/boss-series-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-boss-projection.test.mjs scripts/data/audit/image-source-lineage-report.test.mjs
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=boss --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
node scripts/data/relation/sync-boss-projection.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-24T00:00:00.000Z
```

Expected:

- dry-run report proves expected Boss relation and projection counts;
- image lineage remains warning until DB write is approved and executed;
- no DB write occurs unless Boss-only scope isolation tests pass and the manual approval gate is explicitly satisfied.

- [ ] **Step 6: Manual DB write gate**

Stop and ask for approval before any DB write. The Boss-only command below is allowed only if Step 3 tests prove `--scopes=boss` does not clear or upsert unrelated tables:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --scopes=boss --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
node scripts/data/relation/sync-boss-projection.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation
```

If Step 3 tests prove the command is not Boss-only, classify this as a full relation rebuild and stop for a separate full-rebuild approval plan. Do not run the command.

Do not run `sync-projection-to-local-core-tables.mjs --apply=true` in this task. Current script arguments do not support a Boss-only table selector, so running it would risk broader local core writes. If Boss projection rows need to be materialized into `boss_groups`, open a separate local-core materialization plan after relation/projection readiness is proven.

- [ ] **Step 7: Closeout evidence**

After approved writes, regenerate gate evidence. These commands write filesystem reports, not DB rows:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-24T00:00:00.000Z
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Create `docs/audits/2026-05-24_boss-image-relation-projection-readiness.md` with command results and before/after counts.

Acceptable closeout statuses:

- `closed`: Boss relation and projection rows exist, regenerated image lineage has no Boss contract gap, and A-grade remains unblocked.
- `reduced`: Boss relation/projection rows exist but local-core materialization remains a separate warning.
- `blocked`: Boss DB write requires full relation rebuild approval or local-core materialization approval.

- [ ] **Step 8: Commit Boss branch**

```bash
git add scripts/data/relation/boss-series-processor.mjs scripts/data/relation/boss-series-processor.test.mjs scripts/data/relation/sync-maint-to-relation.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-boss-projection.mjs scripts/data/relation/sync-boss-projection.test.mjs scripts/data/audit/image-source-lineage-report.mjs scripts/data/audit/image-source-lineage-report.test.mjs docs/audits/2026-05-24_boss-image-relation-projection-readiness.md reports/audit/image-source-lineage-2026-05-24.json reports/domain/bosses/image-readiness-2026-05-24.json
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(data): repair boss image relation projection readiness"
```

Omit report files that were not regenerated in this run. If any required evidence file is ignored, run `git check-ignore -v <path>` and either add a narrow `.gitignore` exception or force-add only the exact gate-consumed evidence path with the reason documented in the audit.

## Task 2: NPC Chinese Name Coverage Gate

**Goal:** Make NPC zh coverage regressions fail before UI review instead of allowing `npcs/relation-readiness` to pass while `nameZh` and `subNameZh` have large gaps.

**Files:**
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.test.mjs`
- Modify if needed: `scripts/data/relation/entity-coverage-baseline.mjs`
- Modify if needed: `scripts/data/relation/entity-coverage-baseline.test.mjs`
- Create: `docs/audits/2026-05-24_npc-zh-coverage-gate.md`

- [ ] **Step 1: Create branch**

```bash
git worktree add /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-npc-zh-coverage-gate-2026-05-24 -b fix/npc-zh-coverage-gate-2026-05-24 main
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-npc-zh-coverage-gate-2026-05-24
git status --short --branch
```

- [ ] **Step 2: Add failing semantic gate test**

Add or update tests so an NPC relation coverage report like this blocks:

```json
{
  "domains": {
    "npcs": { "localTotal": 762, "maintTotal": 762, "relationTotal": 762 }
  },
  "fieldAudit": {
    "domains": {
      "npcs": {
        "fields": {
          "nameZh": { "localCoverage": 758, "relationCoverage": 145, "gap": 613 },
          "subNameZh": { "localCoverage": 206, "relationCoverage": 0, "gap": 206 },
          "image": { "localCoverage": 0, "relationCoverage": 0, "gap": 0 }
        }
      }
    }
  }
}
```

Expected result: `npcs relation field gaps: nameZh.gap=613, subNameZh.gap=206`.

Run:

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs
```

Expected before implementation: fail because `subNameZh` is not part of the NPC gate or the relation readiness fixture still expects pass.

- [ ] **Step 3: Implement NPC gate semantics**

Update `relationCoverageSemantics` so:

- `items`: keep current `nameZh,image`.
- `buffs`: keep current `nameZh,image,tooltipZh`.
- `projectiles`: keep current `nameZh,image`.
- `npcs`: require `nameZh` and `subNameZh`; keep `image` only if current semantics already require it without false positives.

Do not hide the gap by altering `entity-coverage-baseline` counts.

- [ ] **Step 4: Validate gate behavior**

Run:

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs scripts/data/relation/entity-coverage-baseline.test.mjs
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true || test "$?" -eq 1
```

Expected:

- tests pass;
- Domain A-grade now truthfully blocks or warns based on current NPC zh gaps;
- if the gate becomes blocked, that is acceptable because this task is about making the risk visible, not masking it.
- `domain-acceptance-generate-reports --write=true` refreshes filesystem reports under `reports/domain/**`; it must not perform DB writes.

- [ ] **Step 5: Closeout audit**

Create `docs/audits/2026-05-24_npc-zh-coverage-gate.md` with:

- before and after semantic result;
- gap counts from `reports/relation/entity-coverage-baseline-2026-05-24.json`;
- exact gate output;
- statement that no DB write/backfill was run.

- [ ] **Step 6: Commit NPC branch**

```bash
git add scripts/data/audit/domain-readiness-audit.mjs scripts/data/audit/domain-readiness-audit.test.mjs docs/audits/2026-05-24_npc-zh-coverage-gate.md reports/domain/npcs/relation-readiness-2026-05-24.json
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(data): gate npc zh relation coverage"
```

Omit report files that were not regenerated in this run.

## Task 3: Front Nuxt Visual Maintenance Only

**Goal:** Keep the completed public visual pass current without reopening the old full visual implementation plan.

**Files:**
- Modify only for real failures: `front-nuxt/scripts/check-visual-regression.mjs`
- Modify only for real failures: `front-nuxt/scripts/check-public-pages.mjs`
- Modify only for real failures: `front-nuxt/pages/**`
- Modify only for real failures: `front-nuxt/components/**`
- Create: `docs/audits/2026-05-24_front-nuxt-visual-maintenance.md`

- [ ] **Step 1: Create branch**

```bash
git worktree add /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-front-nuxt-visual-maintenance-2026-05-24 -b fix/front-nuxt-visual-maintenance-2026-05-24 main
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-front-nuxt-visual-maintenance-2026-05-24
git status --short --branch
```

- [ ] **Step 2: Start or reuse local stack**

```bash
TERRAPEDIA_FRONT_PROJECT_DIR=front-nuxt \
TERRAPEDIA_FRONT_PORT=5176 \
TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18088 \
bash scripts/dev/start-local-stack.sh --reuse-existing
export TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5176
```

If port `5176` is not the active Nuxt port, choose one URL and use it for every check in this branch.

- [ ] **Step 3: Re-run visual maintenance checks**

```bash
cd front-nuxt
node --check scripts/check-visual-regression.mjs
pnpm run check:public-pages
pnpm run check
TERRAPEDIA_FRONT_NUXT_URL="$TERRAPEDIA_FRONT_NUXT_URL" CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected:

- if all pass, write maintenance audit and commit docs only;
- if a real regression fails, fix only the failing route family;
- do not alter backend query contracts in this branch.

- [ ] **Step 4: If route/query behavior fails, split it**

If the failure is filter-before-pagination or backend query semantics, stop this branch and open a separate backend/API contract plan. Do not repair backend data logic in the visual maintenance branch.

- [ ] **Step 5: Commit maintenance audit**

```bash
git add docs/audits/2026-05-24_front-nuxt-visual-maintenance.md
git diff --name-only -- front-nuxt/scripts/check-visual-regression.mjs front-nuxt/scripts/check-public-pages.mjs front-nuxt/pages front-nuxt/components
git add front-nuxt/scripts/check-visual-regression.mjs front-nuxt/pages/items/index.vue
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record front nuxt visual maintenance check"
```

If no Front Nuxt files changed, run only the first `git add` line. If different Front Nuxt files changed, replace the example second `git add` line with the exact changed file list from `git diff --name-only`; do not stage `front-nuxt/pages`, `front-nuxt/components`, or the entire `front-nuxt` directory.

## Task 4: Projectile Optional Warning Deferral

**Goal:** Keep Projectile optional backfill warning visible without spending this cycle on lower-priority optional evidence.

**Files:**
- Create: `docs/audits/2026-05-24_projectile-optional-warning-deferral.md`
- Modify: `docs/project-management/current-status.md`

- [ ] **Step 1: Confirm warning classification**

Read:

```bash
node -e "const fs=require('fs'); const f='reports/domain/projectiles/relation-readiness-2026-05-24.json'; console.log(fs.readFileSync(f,'utf8'))"
```

Expected:

- `status=warning`;
- no blocker;
- missing evidence is optional `reports/projectile-zh-image-backfill*.json`.

- [ ] **Step 2: Record deferral**

Create `docs/audits/2026-05-24_projectile-optional-warning-deferral.md` stating:

- Projectile is not a P0/P1 task in this cycle.
- Do not promote optional projectile evidence to release blocker unless release policy changes.
- Follow-up branch name if needed: `fix/projectile-zh-image-backfill-evidence-2026-05-24`.

- [ ] **Step 3: Commit deferral**

```bash
git add docs/audits/2026-05-24_projectile-optional-warning-deferral.md docs/project-management/current-status.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: defer projectile optional warning debt"
```

## Task 5: Local Main Integration And Closeout

**Files:**
- Modify: `docs/project-management/current-status.md`
- Modify if risk status changes: `docs/project-management/risk-register.md`
- Modify if decision changes: `docs/project-management/decision-log.md`
- Create: `docs/audits/2026-05-24_local-preview-quality-continuation-closeout.md`

- [ ] **Step 1: Review branch outputs**

For each completed branch, replace the branch name with one of the completed branch names from this plan:

```bash
git status --short --branch
git log --oneline main..fix/boss-image-relation-projection-readiness-2026-05-24
git diff --stat main...fix/boss-image-relation-projection-readiness-2026-05-24
git log --oneline main..fix/npc-zh-coverage-gate-2026-05-24
git diff --stat main...fix/npc-zh-coverage-gate-2026-05-24
git log --oneline main..fix/front-nuxt-visual-maintenance-2026-05-24
git diff --stat main...fix/front-nuxt-visual-maintenance-2026-05-24
```

Expected:

- no dirty worktree;
- each branch has a focused diff;
- DB write branches contain explicit audit evidence.

- [ ] **Step 2: Merge only completed branches into local main**

From local `main`:

```bash
git status --short --branch
git merge --no-ff fix/boss-image-relation-projection-readiness-2026-05-24
git merge --no-ff fix/npc-zh-coverage-gate-2026-05-24
git merge --no-ff fix/front-nuxt-visual-maintenance-2026-05-24
```

Run only the merge commands for branches that actually completed and passed validation. Resolve conflicts by preserving the newest audit truth. Do not push.

- [ ] **Step 3: Final local validation**

Run the smallest relevant final checks based on completed branches:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true || test "$?" -eq 1
cd front-nuxt && pnpm run check:public-pages && pnpm run check
```

If the Front branch ran runtime visual checks, include:

```bash
cd front-nuxt && TERRAPEDIA_FRONT_NUXT_URL="$TERRAPEDIA_FRONT_NUXT_URL" CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

- [ ] **Step 4: Write closeout**

Create `docs/audits/2026-05-24_local-preview-quality-continuation-closeout.md` with:

- which branches merged;
- which branches were deferred;
- final gate status;
- whether Boss warning is closed, reduced, or still blocked by manual DB write approval;
- whether NPC zh gate now blocks as expected;
- confirmation that no push/release/staging happened.

- [ ] **Step 5: Commit closeout if not already included**

```bash
git add docs/audits/2026-05-24_local-preview-quality-continuation-closeout.md docs/project-management/current-status.md docs/project-management/risk-register.md docs/project-management/decision-log.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: close local preview continuation cycle"
```

## Final Success Criteria

The cycle is successful when:

- local `main` remains clean;
- remote is still untouched unless separately requested;
- no release/staging claim is made;
- Boss image warning has either durable closure evidence or a precise manual-approval blocker;
- NPC zh coverage can no longer silently pass with `nameZh`/`subNameZh` gaps;
- Front Nuxt visual pass is confirmed current or only real regressions are fixed;
- Projectile optional warning is explicitly deferred, not forgotten.

## Residual Risks

- Boss repair may require DB writes. This plan stops at an explicit manual approval gate before any write.
- NPC zh gate may intentionally turn a warning-free panel into a blocker. That is correct if the live evidence has gaps.
- Front Nuxt runtime checks depend on one consistent local port; mixed `5174/5176/5178` usage can produce false results.
- Since remote sync is deferred, new branches must continue to branch from local `main` until the operator changes that policy.
