# Domain Warning Contract Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Domain A-grade warning count by closing stale optional evidence warnings that are already covered by current durable TerraPedia evidence, without hiding real source, DB, crawler, image-lineage, or backfill debt.

**Architecture:** Keep required evidence strict. Add a narrow "optional legacy evidence may be absent" contract only for historical producer reports whose current replacement evidence is already tracked and validated. Existing legacy reports must still be read and semantically checked when present.

**Tech Stack:** Node.js ESM audit scripts under `scripts/data/audit`, Domain Acceptance workflow scripts under `scripts/data/workflow`, tracked reports under `reports/domain`, and focused `node --test` validation.

---

## Baseline

Current branch baseline after the Domain A-grade blocker closeout:

- `main` at `d013085`, clean, synced with `origin/main`.
- Domain A-grade has `generatedBlockedCount=0`, `generatedWarningCount=18`.
- Release decision evidence is already tracked in:
  - `docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md`
  - `docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md`
  - `docs/audits/2026-05-24_preview-release-decision.md`

Read-only multi-agent audit classified the warning debt:

- Safe first cleanup:
  - `armor_sets/imageReadiness`: current parsed armor image evidence is durable under `data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json`; the missing `reports/fetch/fetch-armor-set-images*.json` report is a historical optional fetch producer artifact.
  - `npcs/sourceReadiness`: current durable evidence is `data/standardized/npcs.standardized.json` plus `reports/wiki-town-npc-maintenance-2026-05-24.json`; the missing `reports/wiki-town-npc-import*.json` report is a legacy optional producer artifact.
  - `support.town_npc_maintenance/sourceReadiness`: current durable evidence is `data/generated/wiki-town-npc-maintenance.latest.json` plus `reports/wiki-town-npc-maintenance-2026-05-24.json`; the missing legacy import report should not be required.
- Keep warning or defer:
  - Boss image readiness is a real relation/projection contract gap and needs a separate DB repair plan.
  - Recipe source pages require crawler/network fetch approval.
  - Projectile zh/image backfill requires a separate backfill/API plan.
  - Reresolve trend warnings are DB-read/report-write candidates, not part of this stale optional cleanup.
  - Shimmer import dry-run and recipe provider reports require separate script safety gates.

## Scope

In scope:

- Modify `scripts/data/audit/domain-readiness-audit.mjs`.
- Modify `scripts/data/audit/domain-readiness-audit.test.mjs`.
- Create this plan document.
- Optionally refresh only the affected tracked reports under:
  - `reports/domain/armor_sets/image-readiness-2026-05-24.json`
  - `reports/domain/npcs/source-readiness-2026-05-24.json`
  - `reports/domain/support.town_npc_maintenance/source-readiness-2026-05-24.json`

Out of scope:

- Crawler, live fetch, import, backfill, `--apply`, MinIO upload, DB write, DB repair, production mutation.
- Boss image lineage contract repair.
- Recipe page source refresh.
- Projectile zh/image backfill.
- Reresolve report generation.
- Broad report regeneration unless explicitly needed after focused tests pass.

## Safety Contract

- Optional legacy evidence with `warnWhenMissing=false` must be neutral only when absent.
- If the legacy file exists and is unreadable or semantically failing, it must still produce warning or blocked status.
- Town NPC legacy import reports must not use the generic present-evidence pass. When present, they must be checked for known error/blocking counters.
- Required evidence behavior must not change.
- Missing optional evidence remains warning by default unless the specific evidence declaration opts out.
- No two agents may edit the same file at the same time. Implementation is serialized; cross-review agents are read-only.

## Task 1: Plan Cross-Review

**Files:**
- Read: `docs/plans/2026-05-25_domain-warning-contract-cleanup-plan.md`
- Read: `scripts/data/audit/domain-readiness-audit.mjs`
- Read: `scripts/data/audit/domain-readiness-audit.test.mjs`

- [ ] **Step 1: Review the plan for safety defects**

Confirm that the plan does not close boss, recipe, projectile, reresolve, or shimmer warnings by manifest weakening.

- [ ] **Step 2: Review expected implementation points**

Confirm that only these evidence declarations need behavior changes:

```js
optionalLatestJson('reports/fetch/fetch-armor-set-images*.json', { warnWhenMissing: false })
optionalLatestJson('reports/wiki-town-npc-import*.json', { warnWhenMissing: false })
optionalLatestJson('reports/wiki-town-npc-maintenance*.json')
```

Expected: reviewers either approve the narrow scope or return concrete blocking defects before implementation starts.

## Task 2: Add Regression Tests First

**Files:**
- Modify: `scripts/data/audit/domain-readiness-audit.test.mjs`

- [ ] **Step 1: Add failing armor image test**

Add a test that creates only `shared-data/raw/wiki/armor_set_images.parsed.latest.json`, then builds `armor_sets/image`. Expected after implementation: `status === 'pass'`, no warning for `reports/fetch/fetch-armor-set-images*.json`.

- [ ] **Step 2: Add failing NPC source test**

Add a test that creates `data/standardized/npcs.standardized.json` and `reports/wiki-town-npc-maintenance-2026-05-24.json`, then builds `npcs/source`. Expected after implementation: `status === 'pass'`, no warning for `reports/wiki-town-npc-import*.json`.

- [ ] **Step 3: Add failing Town NPC maintenance source test**

Add a test that creates `data/generated/wiki-town-npc-maintenance.latest.json` and `reports/wiki-town-npc-maintenance-2026-05-24.json`, then builds `support.town_npc_maintenance/source`. Expected after implementation: `status === 'pass'`, no warning for `reports/wiki-town-npc-import*.json`.

- [ ] **Step 4: Add legacy report guard tests**

Add tests that create current required evidence plus a present `reports/wiki-town-npc-import-2026-05-24.json` report with known bad counters. Expected after implementation:

- invalid JSON remains `status === 'warning'` with `Unreadable optional evidence`;
- readable JSON with `summary.errorCount > 0` remains `status === 'warning'` and does not fall through to the generic present-evidence pass.

- [ ] **Step 5: Verify RED**

Run:

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs
```

Expected before implementation: the new missing-opt-out tests fail because legacy optional evidence still emits missing warnings. The bad-counter guard also fails before the Town NPC legacy import semantics are added.

## Task 3: Implement Narrow Legacy-Optional Semantics

**Files:**
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`

- [ ] **Step 1: Extend evidence options**

Allow `evidence()` and `optionalLatestJson()` to carry `warnWhenMissing`. Default remains `true`.

- [ ] **Step 2: Change missing optional behavior only when opted out**

When evidence is absent:

```js
const missingOptionalStatus = evidence.warnWhenMissing === false ? 'pass' : 'warning';
```

Required evidence must still return `blocked`.

- [ ] **Step 3: Mark only stale legacy producer reports**

Update only:

```js
optionalLatestJson('reports/fetch/fetch-armor-set-images*.json', { warnWhenMissing: false })
optionalLatestJson('reports/wiki-town-npc-import*.json', { warnWhenMissing: false })
```

Apply the Town NPC import change to both `npcs/sourceReadiness` and `support.town_npc_maintenance/sourceReadiness`.

For `support.town_npc_maintenance/sourceReadiness`, add the current maintenance report evidence:

```js
optionalLatestJson('reports/wiki-town-npc-maintenance*.json')
```

Do not change `support.town_npc_maintenance/blockingGate`.

- [ ] **Step 4: Add Town NPC legacy import semantics**

When `reports/wiki-town-npc-import*.json` is present, check known summary counters such as `errorCount`, `blockedCount`, `unresolvedCount`, `driftCount`, `duplicateCount`, and `failedCount`. Any positive counter should return warning for source panels.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs
```

Expected: all tests pass.

## Task 4: Focused Report And Gate Validation

**Files:**
- Read: affected scripts and reports.
- Optionally modify: three affected `reports/domain/**/source-readiness-2026-05-24.json` or `image-readiness-2026-05-24.json` files only if the evidence refresh is intentionally staged.

- [ ] **Step 1: Run focused panels**

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=armor_sets --panel=image
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=npcs --panel=source
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=support.town_npc_maintenance --panel=source
```

Expected: all three focused panels return `status="pass"`.

- [ ] **Step 2: Run workflow tests**

```bash
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
```

Expected: tests pass.

- [ ] **Step 3: Run dry-run A-grade gate**

```bash
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected: exit `0`, `generatedBlockedCount=0`, and warning count is lower than the baseline `18` for dry-run generation.

- [ ] **Step 4: Decide report refresh**

If code tests and dry-run gate pass, refresh only the affected reports with:

```bash
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=armor_sets --panel=image --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/armor_sets/image-readiness-2026-05-24.json
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=npcs --panel=source --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/npcs/source-readiness-2026-05-24.json
node scripts/data/audit/domain-readiness-audit.mjs --repo-root="$(pwd)" --domain=support.town_npc_maintenance --panel=source --generated-at=2026-05-24T16:16:05.002Z --output=reports/domain/support.town_npc_maintenance/source-readiness-2026-05-24.json
```

Expected: exactly the three affected domain report JSON files change.

## Task 5: Cross-Review And Commit

**Files:**
- Review the full diff.

- [ ] **Step 1: Request read-only code review**

Reviewer checks:

- no DB/network/write commands were added;
- default optional missing behavior is unchanged;
- legacy evidence still validates when present;
- affected reports, if refreshed, match the focused panel output.

- [ ] **Step 2: Run final validation**

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

- [ ] **Step 3: Commit exact scope**

```bash
git status --short --branch -uall
git diff --cached --stat
git add docs/plans/2026-05-25_domain-warning-contract-cleanup-plan.md scripts/data/audit/domain-readiness-audit.mjs scripts/data/audit/domain-readiness-audit.test.mjs
git add reports/domain/armor_sets/image-readiness-2026-05-24.json reports/domain/npcs/source-readiness-2026-05-24.json reports/domain/support.town_npc_maintenance/source-readiness-2026-05-24.json
git diff --cached --stat
git commit -m "fix(data): ignore stale optional domain evidence gaps"
```

If reports were not refreshed, omit the three `reports/domain/...` paths from `git add`.
