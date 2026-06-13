# Item Source Family Full Processing Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the remaining 266 `family_policy_pending` item source rows for full closure by assigning every row to a concrete parser/treatment phase with read-only evidence gates and dry-run/apply acceptance rules.

**Architecture:** Keep crawler/import/backfill/Flyway out of this preparation step. Build a read-only readiness report from the refreshed remaining work-items report, then use that report as the execution map for later parser batches. Each later parser batch must produce focused candidate plans, run local compat dry-run, apply only through the guarded local script when safe, and refresh closure reports.

**Tech Stack:** Node.js ESM audit scripts, `node:test`, JSON/Markdown reports under `data/reports`, guarded local MySQL apply script for later execution only.

---

## Current Baseline

Source reports:

- `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
- `data/reports/item-source-family-full-processing-readiness-2026-06-13.json`
- `data/reports/item-source-family-full-processing-readiness-summary-zh-2026-06-13.md`

Verified current state:

- `familyPolicyPendingClosureRows = 266`
- `blockedSourceRows = 0`
- `dryRunReadySourceRows = 0`
- `allRowsAssignedToFamilyPlan = true`

Remaining family groups:

- Dragonflies: 6
- Vases: 4
- Moss: 4
- Altars: 4
- Banners: 1
- Planter Boxes: 1
- Shimmer Tools: 1
- Unsafe Walls: 1
- Paintings: 97
- Music Boxes: 95
- Statues: 52

## Hard Boundaries

- Do not run crawler/fetch/import/backfill/sync/pipeline/Flyway from this preparation plan.
- Do not hand-write SQL data changes.
- Do not write production or non-local DB.
- Do not page-level allow mixed family pages.
- Later DB writes, if any, must use only `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` against local `terria_v1_local`.
- Later apply is allowed only after dry-run reports `blockedRows=0`, `validationErrors=0`, and `toInsert > 0`.
- After every later apply, rerun dry-run until `toInsert=0`, then refresh evidence/work/treatment/final reports.
- Preserve existing dirty files not owned by the current task, especially `data/reports/item-source-remaining-closure-2026-06-11-current.json`.

## Source Chain

`remaining work-items report -> family full-processing readiness report -> parser batch plan -> focused candidate plan -> local compat dry-run -> guarded local apply -> refreshed closure reports`

## Multi-Agent Split For Later Execution

- Agent A: Dragonflies capture/critter contract. Owns tests and parser rules for `Dragonflies` only.
- Agent B: Phase 2 small worldgen/shop/mechanism families. Owns `Vases`, `Moss`, `Altars`, `Banners`, `Planter Boxes`, `Shimmer Tools`, `Unsafe Walls`.
- Agent C: Paintings matrix parser. Owns `Paintings` only.
- Agent D: Music Boxes and Statues matrix parsers. Owns `Music Boxes` and `Statues`.
- Reviewer agents must be read-only unless explicitly assigned a disjoint file set.
- No two agents may edit the same parser file, report generator, test file, DB table field, or runtime service lifecycle in parallel.

## Execution Phases

### Phase 0: Readiness Report

Scope:

- Create a read-only report that maps all 266 remaining family rows to exact phases.

Acceptance:

- `totalFamilyPolicyPendingRows = 266`
- `totalFamilies = 11`
- `allRowsAssignedToFamilyPlan = true`
- Report lists parser strategy, unmet conditions, forbidden actions, and acceptance gates per family.

### Phase 1: Dragonflies

Scope:

- `Dragonflies` 6 rows

Required conditions:

- Confirm whether capture/critter evidence should be ordinary item source or dedicated projection.
- Resolve dragonfly item identity to capture evidence without NPC loot pollution.

Acceptance:

- Tests cover one positive dragonfly row and one non-dragonfly negative row.
- Candidate dry-run has `blockedRows=0` and `validationErrors=0`, or rows move to projection treatment.

### Phase 2: Small Families

Scope:

- `Vases` 4
- `Moss` 4
- `Altars` 4
- `Banners` 1
- `Planter Boxes` 1
- `Shimmer Tools` 1
- `Unsafe Walls` 1

Required conditions:

- Build item-specific parser rules per family.
- Split worldgen, mining, shop, mechanism, boss/event, and explicit exemption evidence.
- Do not infer source from name-only similarity.

Acceptance:

- Every row becomes importable source, projection treatment, explicit exemption, or missing raw evidence.
- No family page is globally allowed.
- Dry-run validates all source refs.

### Phase 3: Large Mixed Matrix Pages

Scope:

- `Paintings` 97
- `Music Boxes` 95
- `Statues` 52

Required conditions:

- Build item-level matrix parsers.
- Match each item to table row or section-specific evidence.
- Split mixed source categories.
- Do not apply generic page evidence to every item.

Acceptance:

- Paintings tests cover worldgen, shop/event, and excluded non-matching row.
- Music Boxes tests cover recorded, shimmer, event/drop, and excluded aggregate row.
- Statues tests cover worldgen, functional-only, and mixed-source statue.
- All rows leave `family_policy_pending` only through importable source, projection treatment, explicit exemption, or missing raw evidence.

## Task List

### Task 1: Readiness Report

**Files:**

- Create: `scripts/data/audit/build-item-source-family-full-processing-readiness-report.mjs`
- Create: `scripts/data/audit/build-item-source-family-full-processing-readiness-report.test.mjs`
- Create: `data/reports/item-source-family-full-processing-readiness-2026-06-13.json`
- Create: `data/reports/item-source-family-full-processing-readiness-summary-zh-2026-06-13.md`

- [x] Write a failing test for mutation flag rejection.
- [x] Write a failing test proving remaining rows are grouped into executable phases.
- [x] Implement the read-only readiness report.
- [x] Generate JSON and Chinese summary reports.
- [x] Run `node --test scripts/data/audit/build-item-source-family-full-processing-readiness-report.test.mjs`.

### Task 2: Plan Audit

**Files:**

- Create: `docs/superpowers/plans/2026-06-13-item-source-family-full-processing-readiness.md`

- [x] Lock current baseline and hard boundaries.
- [x] Map every remaining family to a parser phase.
- [x] Define dry-run/apply/report gates.
- [x] Define multi-agent ownership boundaries for later execution.

### Task 3: Final Verification

Run:

```bash
node --test scripts/data/audit/build-item-source-family-full-processing-readiness-report.test.mjs scripts/data/audit/build-item-source-remaining-work-items-report.test.mjs
node scripts/data/audit/build-item-source-family-full-processing-readiness-report.mjs --output=data/reports/item-source-family-full-processing-readiness-2026-06-13.json --summary-output=data/reports/item-source-family-full-processing-readiness-summary-zh-2026-06-13.md
git diff --check
```

Expected:

- Tests pass.
- Report summary shows `totalFamilyPolicyPendingRows=266`, `totalFamilies=11`, `allRowsAssignedToFamilyPlan=true`.
- `git diff --check` exits 0.

## Plan Audit

## Verdict

- Status: Execution-ready as a preparation plan.
- Main goal: Prepare the remaining 266 family pending rows for full closure without unsafe data refresh or broad family page allow.
- Closure definition: Every current family pending row is assigned to a concrete parser/treatment phase with source-chain gates and dry-run/apply/report acceptance.

## Blocking Plan Defects

- Critical: None for preparation.
- Important: Later execution still requires parser-specific implementation plans before any DB apply.

## Plan Repairs

- Change: Large mixed pages are explicitly isolated into Phase 3 item-level matrix parsers.
- Reason: Page-level allow would create false sources for Paintings, Music Boxes, and Statues.
- Validation added: Readiness report test, report generation, summary gates.

## Execution-Ready Plan

- Scope: Preparation only; no crawler, no DB write, no broad family allow.
- Agent split: Disjoint family ownership for later execution.
- Smoke test: Readiness report assigns all 266 rows to 11 family plans.
- Final validation: Node tests and `git diff --check`.

## Residual Risk

- Risk: Some Phase 3 rows may need missing raw evidence classification instead of importable source.
- Follow-up trigger: If matrix parser cannot match an item row with source evidence, move that item to missing raw evidence or explicit non-import treatment instead of guessing.
