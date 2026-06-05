# Domain Reresolve Trend Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the six Domain A-grade `unresolvedAuditTrend` warnings by adding current reresolve candidate evidence that compares against the existing 2026-05-23 baseline.

**Architecture:** Use the existing DB-read-only reresolve candidate generator to write one relation evidence report, then refresh only the six domain trend panels that consume `reports/relation/reresolve-candidates*.json`. Do not weaken domain readiness semantics or touch crawler/import/backfill paths.

**Tech Stack:** Node.js ESM scripts under `scripts/data/relation`, Domain Readiness audit scripts under `scripts/data/audit`, tracked JSON reports under `reports/relation` and `reports/domain`, and focused `node --test` validation.

---

## Baseline

Current checkpoint:

- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-warning-contract-cleanup-2026-05-25`
- Branch: `fix/domain-warning-contract-cleanup-2026-05-25`
- Existing commit: `c2eb10e fix(data): ignore stale optional domain evidence gaps`
- Domain A-grade dry-run status after that commit:
  - `generatedBlockedCount=0`
  - `generatedWarningCount=15`

Remaining `unresolvedAuditTrend` warnings:

- `items/unresolvedAuditTrend`
- `npcs/unresolvedAuditTrend`
- `bosses/unresolvedAuditTrend`
- `buffs/unresolvedAuditTrend`
- `projectiles/unresolvedAuditTrend`
- `armor_sets/unresolvedAuditTrend`

The current tracked 2026-05-24 domain trend reports still point at `reports/relation/reresolve-candidates-2026-05-23.json`, whose `trend.previousUnresolvedAuditCount` is unavailable. The next report should be `reports/relation/reresolve-candidates-2026-05-24.json`; `readPreviousReport()` should use the 2026-05-23 report as baseline.

## Scope

In scope:

- Create or update:
  - `docs/plans/2026-05-25_domain-reresolve-trend-evidence-plan.md`
  - `reports/relation/reresolve-candidates-2026-05-24.json`
  - `reports/domain/items/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/npcs/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/bosses/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/buffs/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/projectiles/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/armor_sets/unresolved-audit-trend-2026-05-24.json`

Out of scope:

- Crawler, live fetch, import, backfill, `--apply`, MinIO upload, DB write, DB repair, production mutation.
- Boss image relation/projection repair.
- Recipe source refresh.
- Projectile zh/image backfill.
- Shimmer DB import.
- Items `workflow-image-sync` decision.
- Broad report regeneration with `domain-acceptance-generate-reports.mjs --write=true`.

## Safety Contract

- `scripts/data/relation/generate-reresolve-candidates.mjs` may connect to the local relation DB and run `SELECT` queries only.
- The generator may write only under `reports/relation`.
- Domain report refresh must use exact `domain-readiness-audit.mjs --output=...` commands for the six trend outputs.
- If the reresolve report trend is `direction="up"` with positive `delta`, stop and report the blocker instead of weakening the audit.
- If MySQL dependency resolution fails in this worktree, use `NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules` as a dependency lookup fallback only; do not install dependencies into the task worktree.

## Task 1: Cross-Review The Batch

**Files:**
- Read: `scripts/data/relation/generate-reresolve-candidates.mjs`
- Read: `scripts/data/relation/generate-reresolve-candidates.test.mjs`
- Read: `scripts/data/audit/domain-readiness-audit.mjs`
- Read: `scripts/data/workflow/domain-acceptance-registry.json`

- [ ] **Step 1: Verify DB-read boundary**

Confirm the generator SQL contains only `SELECT` statements against:

- `item_npc_relation_audits`
- `relation_npcs`

Expected: no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, DDL, import, backfill, crawler, or apply path.

- [ ] **Step 2: Verify report write boundary**

Confirm `writeReportFile()` refuses paths outside `reports/relation`.

Expected: default output is `reports/relation/reresolve-candidates-YYYY-MM-DD.json`.

- [ ] **Step 3: Verify domain consumer semantics**

Confirm `unresolvedAuditTrendSemantics()`:

- blocks rising unresolved trends;
- warns only when baseline is missing or direction is unknown;
- passes stable or down trends.

Expected: adding a 2026-05-24 report with a 2026-05-23 baseline can legitimately close the six trend warnings without manifest or audit weakening.

## Task 2: Generate Relation Evidence

**Files:**
- Create or update: `reports/relation/reresolve-candidates-2026-05-24.json`

- [ ] **Step 1: Verify generator tests**

Run:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node --test scripts/data/relation/generate-reresolve-candidates.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Generate the report**

Run:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node scripts/data/relation/generate-reresolve-candidates.mjs --generated-at=2026-05-24T00:00:00.000Z
```

Expected:

- writes `reports/relation/reresolve-candidates-2026-05-24.json`;
- no DB writes;
- stdout summary has `trend.previousUnresolvedAuditCount` populated from the 2026-05-23 report;
- `trend.direction` is `flat` or `down`.

- [ ] **Step 3: Inspect the report summary**

Run:

```bash
node -e 'const r=require("./reports/relation/reresolve-candidates-2026-05-24.json"); console.log(JSON.stringify({summary:r.summary, trend:r.trend}, null, 2));'
```

Expected: `trend.previousUnresolvedAuditCount` is a number and `trend.delta <= 0`.

If `trend.delta > 0`, stop and report the trend blocker.

## Task 3: Refresh Exactly Six Domain Trend Reports

**Files:**
- Modify:
  - `reports/domain/items/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/npcs/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/bosses/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/buffs/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/projectiles/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/armor_sets/unresolved-audit-trend-2026-05-24.json`

- [ ] **Step 1: Refresh items**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=items --panel=unresolved-audit-trend --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/items/unresolved-audit-trend-2026-05-24.json
```

Expected: status `pass`.

- [ ] **Step 2: Refresh npcs**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=npcs --panel=unresolved-audit-trend --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/npcs/unresolved-audit-trend-2026-05-24.json
```

Expected: status `pass`.

- [ ] **Step 3: Refresh bosses**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=bosses --panel=unresolved-audit-trend --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/bosses/unresolved-audit-trend-2026-05-24.json
```

Expected: status `pass`.

- [ ] **Step 4: Refresh buffs**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=buffs --panel=unresolved-audit-trend --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/buffs/unresolved-audit-trend-2026-05-24.json
```

Expected: status `pass`.

- [ ] **Step 5: Refresh projectiles**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=projectiles --panel=unresolved-audit-trend --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/projectiles/unresolved-audit-trend-2026-05-24.json
```

Expected: status `pass`.

- [ ] **Step 6: Refresh armor sets**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=armor_sets --panel=unresolved-audit-trend --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/armor_sets/unresolved-audit-trend-2026-05-24.json
```

Expected: status `pass`.

## Task 4: Validate And Cross-Review

**Files:**
- Read: full diff.

- [ ] **Step 1: Run focused validation**

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node --test scripts/data/relation/generate-reresolve-candidates.test.mjs
node --test scripts/data/audit/domain-readiness-audit.test.mjs
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected:

- tests pass;
- freshness audit passes;
- A-grade gate exits 0;
- `generatedBlockedCount=0`;
- warning count is lower than 15, expected 9 if only the six trend warnings close.

- [ ] **Step 2: Request read-only cross-review**

Reviewer checks:

- no crawler/import/backfill/apply/DB-write paths were touched;
- only the plan and seven JSON evidence/report files changed;
- six refreshed domain reports all reference `reports/relation/reresolve-candidates-2026-05-24.json`;
- remaining warnings are outside this batch.

## Task 5: Commit Exact Scope

**Files:**
- Stage only:
  - `docs/plans/2026-05-25_domain-reresolve-trend-evidence-plan.md`
  - `reports/relation/reresolve-candidates-2026-05-24.json`
  - `reports/domain/items/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/npcs/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/bosses/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/buffs/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/projectiles/unresolved-audit-trend-2026-05-24.json`
  - `reports/domain/armor_sets/unresolved-audit-trend-2026-05-24.json`

- [ ] **Step 1: Check unstaged scope**

```bash
git status --short --branch -uall
```

Expected: only the eight files above are modified or untracked.

- [ ] **Step 2: Stage exact files**

```bash
git add docs/plans/2026-05-25_domain-reresolve-trend-evidence-plan.md
git add reports/relation/reresolve-candidates-2026-05-24.json
git add reports/domain/items/unresolved-audit-trend-2026-05-24.json reports/domain/npcs/unresolved-audit-trend-2026-05-24.json reports/domain/bosses/unresolved-audit-trend-2026-05-24.json reports/domain/buffs/unresolved-audit-trend-2026-05-24.json reports/domain/projectiles/unresolved-audit-trend-2026-05-24.json reports/domain/armor_sets/unresolved-audit-trend-2026-05-24.json
git diff --cached --stat
```

Expected: staged diff contains only the planned files.

- [ ] **Step 3: Commit**

```bash
git commit -m "data: refresh reresolve trend evidence"
```

Expected: branch has a second focused commit on top of `c2eb10e`.
