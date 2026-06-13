# Item Source Family Policy Parser Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining item source `family_policy_pending` queue by moving reviewed family/shared-page evidence into precise candidate plans, guarded dry-runs, and local DB writes only when the dry-run proves safe.

**Architecture:** Keep crawler/import/backfill untouched. Extend the read-only focused candidate planner so selected `family_policy_pending` rows can be rebuilt from existing raw page files, then extend the candidate import planner with narrow family-specific rules. Large mixed pages stay pending until item-specific parsers are proven.

**Tech Stack:** Node.js ESM audit scripts, `node:test`, local MySQL `terria_v1_local`, guarded `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`.

---

## Current Baseline

- Source of truth reports:
  - `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
  - `data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json`
  - `data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json`
- Verified current state:
  - `dryRunReadySourceRows = 0`
  - `familyPolicyBlockedCandidates = 0`
  - `familyPolicyPendingClosureRows = 278`
  - `blockedSourceRows = 0`
- Remaining family groups:
  - Paintings 97
  - Music Boxes 95
  - Statues 52
  - Dragonflies 6
  - Logic Gates 6
  - Team Blocks 6
  - Altars 4
  - Moss 4
  - Vases 4
  - Banners 1
  - Planter Boxes 1
  - Shimmer Tools 1
  - Unsafe Walls 1

## Hard Boundaries

- Do not run crawler/fetch/import/backfill/sync/pipeline/Flyway.
- Do not hand-write SQL data changes.
- Do not write production or non-local DB.
- Only DB write path allowed: `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` targeting `terria_v1_local`.
- Always run dry-run first. Apply only when `validationErrors=0`, `blockedRows=0`, and `toInsert > 0`.
- Do not stage with `git add .`.
- Preserve existing dirty user file `data/reports/item-source-remaining-closure-2026-06-11-current.json`.

## Source Chain

`raw wiki item page JSON -> audit candidate extraction -> focused candidate plan -> candidate import plan -> local compat dry-run -> guarded local apply -> remaining work/treatment/final reports`

## Execution Phases

### Phase 1: Small Explicit Families

Scope:
- `Logic Gates` 6 rows
- `Team Blocks` 6 rows

Rules:
- Logic Gates: shop source from `Steampunker`.
- Team Blocks:
  - Dull variants: Shimmer transformation from matching normal Team Block item.
  - Do not infer normal variants unless they are in the current pending set and dry-run validates them.

Acceptance:
- Focused candidate plan includes the selected family pending rows.
- Candidate import plan has no `family_page_candidate` blocked rows for these selected rows.
- Dry-run has `validationErrors=0` and `blockedRows=0`.

### Phase 2: Critter Family

Scope:
- `Dragonflies` 6 rows

Rules:
- Treat as capture/critter evidence only if source can resolve to an owned NPC/critter identity or a reviewed capture/world contract.
- Do not write ordinary source if the item/source model cannot distinguish NPC critter from item source correctly.

Acceptance:
- Either importable capture rows dry-run cleanly, or rows move to explicit projection-required treatment with evidence.

### Phase 3: Worldgen/Container Families

Scope:
- `Vases` 4
- `Moss` 4
- `Unsafe Walls` 1
- `Planter Boxes` 1
- `Shimmer Tools` 1
- `Banners` 1
- `Altars` 4

Rules:
- Build item-specific parser rules. Do not globally allow the family page.
- If evidence is mechanism/projection-only, keep out of ordinary item sources.

Acceptance:
- Each row either has clean dry-run candidate rows or a documented non-import treatment.

### Phase 4: Large Mixed Pages

Scope:
- `Paintings` 97
- `Music Boxes` 95
- `Statues` 52

Rules:
- No page-level allow.
- Require item-specific matrix parsing or table row matching.
- Mixed source categories must stay split: shop, worldgen, fishing, drop, quest reward, shimmer/recording, and mechanism/projection.

Acceptance:
- No row remains in `family_policy_pending` without either importable evidence, projection treatment, missing raw evidence, or explicit exemption.

## Task List

### Task 1: Focused Candidate Planner From Family Pending

**Files:**
- Modify: `scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.mjs`
- Modify: `scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.test.mjs`

- [ ] Write a failing test proving `LogicGate_AND` and `TeamBlockRedVariant` are loaded from `family_policy_pending` by rescanning local raw pages or injected family candidates.
- [ ] Implement a reviewed-family selector for `Logic Gates` and `Team Blocks`.
- [ ] Ensure non-reviewed families like `Paintings` stay out of this first batch.
- [ ] Run `node --test scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.test.mjs`.

### Task 2: Candidate Import Rules For Logic Gates And Team Blocks

**Files:**
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`

- [ ] Write a failing test for `LogicGate_AND -> shop/npc/Steampunker`.
- [ ] Write a failing test for `TeamBlockRedVariant -> shimmer/item/Red Team Block`.
- [ ] Implement minimal reviewed family rules.
- [ ] Run `node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`.

### Task 3: Reports And Dry-Run

**Files:**
- Refresh generated reports under `data/reports/`.

- [ ] Run focused candidate plan refresh.
- [ ] Run local compat dry-run.
- [ ] If `toInsert > 0`, run guarded local apply with `--confirm-local-compat=true --apply=true`.
- [ ] Re-run dry-run to confirm `toInsert=0`.
- [ ] Refresh evidence, work-items, treatment, and final closure status reports.

### Task 4: Verification

Run:

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.test.mjs scripts/data/audit/build-item-source-remaining-work-items-report.test.mjs scripts/data/audit/build-item-source-remaining-treatment-report.test.mjs scripts/data/audit/build-item-source-final-closure-status-report.test.mjs scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs
git diff --check
```

Expected:
- Node tests pass.
- `git diff --check` exits 0.
- Final reports show no ordinary source insert queue left after apply.

## Plan Audit

## Verdict
- Status: Execution-ready for Phase 1.
- Main goal: Reduce the remaining 278 `family_policy_pending` rows through precise family parser handling.
- Closure definition: Rows leave `family_policy_pending` only when they have verified importable dry-run rows or a documented non-import treatment.

## Blocking Plan Defects
- Critical: None for Phase 1.
- Important: Large mixed pages are intentionally not handled by Phase 1 because page-level allow would create false sources.

## Plan Repairs
- Change: Phase 1 is limited to Logic Gates and Team Blocks.
- Reason: Both have explicit, narrow raw evidence and small row counts.
- Validation added: focused planner tests, candidate import tests, dry-run, refreshed closure reports.

## Execution-Ready Plan
- Scope: Logic Gates and Team Blocks first; later phases handle Dragonflies and mixed large pages.
- Agent split: Main agent owns code changes. Optional reviewers may do read-only evidence checks only.
- Smoke test: `LogicGate_AND` and `TeamBlockRedVariant` move from family pending into a focused candidate plan.
- Final validation: dry-run reports `validationErrors=0`, `blockedRows=0`; reports refresh cleanly.

## Residual Risk
- Risk: Team Block normal/dull variants may require distinguishing shop source from shimmer transformation.
- Follow-up trigger: If dry-run produces unresolved item refs or duplicate-only rows, keep affected rows pending and add item-specific mapping tests.
