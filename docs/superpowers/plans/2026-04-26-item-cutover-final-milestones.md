# Item Final Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `projection_items` from “field-complete but row-misaligned” into a cutover-ready replacement for `local.items` under an explicit acceptance mode.

**Architecture:** Keep `maint` as the canonical fact source for durable item facts, keep the current temporary `local.items.image` fallback narrow and reversible, and focus the remaining work on row-set adjudication rather than reopening solved field coverage work. The plan splits strict cutover work from temporary compatibility work so progress remains measurable even if the 13 exceptional rows need staged handling.

**Tech Stack:** Node.js scripts, MySQL (`terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`), Markdown/JSON readiness reports, PowerShell entrypoints

---

## File Structure

### Existing Files To Reuse

- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- Modify: `reports/relation/replacement-readiness-2026-04-26.json`
- Modify: `reports/relation/replacement-readiness-2026-04-26.md`

### Existing Files To Reuse Without Behavioral Change

- Reuse: `docs/superpowers/plans/2026-04-26-item-cutover-open-issues.md`
- Reuse: `scripts/data/maint/sync-item-page-images-to-maint.mjs`
- Reuse: `scripts/data/maint/refresh-item-pages-from-wiki.mjs`

### New Files To Create

- Create: `reports/relation/item-row-set-audit-2026-04-26.json`
- Create: `reports/relation/item-row-set-audit-2026-04-26.md`
- Create: `reports/relation/item-image-fallback-audit-2026-04-26.json`

### Responsibility Split

- `maint/*`: only for future source-chain hardening, not for reopening solved item numeric/text fields
- `relation/*`: final row-set filtering, temporary compatibility overlays, and cutover-ready projections
- `reports/relation/*`: prove exact row deltas and image fallback scope
- `project-plan/*issue_log*`: preserve unresolved upstream facts and policy decisions

---

## Milestone Overview

### M1: Freeze And Audit Remaining Row-Set Exceptions

- Goal: produce a definitive audit for the 3 missing and 10 extra item rows
- Target blockers: item row parity only
- Acceptance:
  - every exceptional row is classified as `exclude`, `restore`, or `promote`
  - each classification is backed by local/maint/standardized evidence
  - the issue log names which rows are upstream gaps versus weak-source residues

### M2: Make Cutover Mode Explicit

- Goal: separate “effective replacement” from “strict replacement” in readiness artifacts
- Target blockers: ambiguous acceptance criteria
- Acceptance:
  - readiness output explicitly states field-complete status separately from row-parity status
  - image fallback scope is quantified, not implicit
  - the team can tell whether a failure is due to field coverage, row mismatch, or temporary local fallback usage

### M3: Resolve The 10 Extra Projection Rows

- Goal: stop weak-source residue rows from blocking strict local replacement
- Target blockers: `Fake_newchest*`, event-side masks, Etherian rows, and boss bag rows that exist in maint but not local
- Acceptance:
  - the 10 extra rows are either filtered from projection or promoted with a stronger approved source chain
  - no extra row remains unexplained in readiness reports

### M4: Resolve The 3 Missing Local Rows

- Goal: decide how the three jellyfish-bait local rows are handled during cutover
- Target blockers: local-only recipe-derived aliases with no maint source chain
- Acceptance:
  - each of the 3 rows is either restored through an explicit compatibility overlay or removed from strict acceptance scope by documented policy
  - readiness no longer reports them as unexplained missing rows

### M5: Re-Measure Image Dependence And Finalize Cutover Status

- Goal: keep current cutover moving while preserving a path back to maint-only image sourcing
- Target blockers: temporary local image fallback remains active
- Acceptance:
  - current fallback coverage is measured exactly
  - maint image refresh progress is compared against fallback dependency
  - final report states whether `items` is switchable under strict mode, effective mode, or both

---

## Milestone Details

### M1: Freeze And Audit Remaining Row-Set Exceptions

**Files:**
- Create: `reports/relation/item-row-set-audit-2026-04-26.json`
- Create: `reports/relation/item-row-set-audit-2026-04-26.md`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

**Inputs to inspect:**
- `reports/relation/replacement-readiness-2026-04-26.json`
- `docs/superpowers/plans/2026-04-26-item-cutover-open-issues.md`
- `terria_v1_local.items`
- `terria_v1_maint.maint_items`
- `terria_v1_maint.maint_item_page_recipes`
- `terria_v1_maint.maint_recipe_page_recipes`
- `data/standardized/items.standardized.json`

**Deliverables:**
- one table for the 3 missing rows with source-chain verdicts
- one table for the 10 extra rows with weak-source verdicts
- one explicit `recommendedAction` per row

**Exit Criteria:**
- no row remains in an “unknown” bucket
- issue log updated with exact evidence and next action

### M2: Make Cutover Mode Explicit

**Files:**
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `reports/relation/replacement-readiness-2026-04-26.md`
- Create: `reports/relation/item-image-fallback-audit-2026-04-26.json`

**Inputs to inspect:**
- `terria_v1_local.items`
- `terria_v1_relation.projection_items`
- current `replacement-readiness` report

**Deliverables:**
- readiness report sections for:
  - field completeness
  - row parity
  - temporary local fallback usage
- fallback audit showing:
  - shared rows covered by maint image
  - shared rows covered only by local image fallback
  - rows still image-null after both paths

**Exit Criteria:**
- future cutover status can be read without manual SQL interpretation
- “effective replacement” and “strict replacement” are not conflated

### M3: Resolve The 10 Extra Projection Rows

**Files:**
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

**Rows in scope:**
- `Fake_newchest1`
- `Fake_newchest2`
- `OgreMask`
- `GoblinMask`
- `GoblinBomberCap`
- `EtherianJavelin`
- `KoboldDynamiteBackpack`
- `BoringBow`
- `BossBagOgre`
- `BossBagDarkMage`

**Recommended implementation direction:**
- build an explicit relation-side filter list keyed by `internal_name`
- only apply the filter in the local-compatibility projection layer, not in maint fact storage
- keep the list documented and justified in the issue log

**Exit Criteria:**
- readiness `extraInProjection` becomes empty or fully policy-exempt
- no filtered row is removed silently; each one has a documented reason

### M4: Resolve The 3 Missing Local Rows

**Files:**
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

**Rows in scope:**
- `ZH_RECIPE_BLUE_JELLYFISH_BAIT`
- `ZH_RECIPE_GREEN_JELLYFISH_BAIT`
- `ZH_RECIPE_PINK_JELLYFISH_BAIT`

**Recommended implementation direction:**
- if strict cutover must match current local behavior immediately, create a narrow compatibility overlay sourced from local and scoped only to these 3 rows
- if strict cutover may redefine the target row set, classify them as local legacy aliases and remove them from the strict acceptance set explicitly

**Exit Criteria:**
- readiness `missingInProjection` becomes empty or fully policy-exempt
- no hidden fallback is introduced without explicit audit trace

### M5: Re-Measure Image Dependence And Finalize Cutover Status

**Files:**
- Reuse: `scripts/data/maint/refresh-item-pages-from-wiki.mjs`
- Reuse: `scripts/data/maint/sync-item-page-images-to-maint.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs` only if image fallback policy changes
- Modify: `reports/relation/replacement-readiness-2026-04-26.md`

**Inputs to inspect:**
- background image refresh log
- `terria_v1_maint.maint_item_images`
- `terria_v1_relation.projection_items`
- `terria_v1_local.items`

**Deliverables:**
- exact count of rows still depending on local image fallback
- exact count of rows newly covered by maint images after background refresh
- final cutover status statement for `items`

**Exit Criteria:**
- one final answer exists for each mode:
  - strict replacement status
  - effective replacement status
  - maint-only image status

---

## Success Criteria For This Plan

This milestone plan is complete when:

1. the 13 row-set exceptions are fully adjudicated
2. `replacement-readiness` can distinguish strict vs effective replacement
3. `projection_items` is either:
   - fully switchable under strict mode, or
   - explicitly switchable under effective mode with a documented exception list
4. temporary local image fallback scope is measurable and reversible

---

## Out Of Scope

- reopening solved numeric/text/rarity/stack item coverage work
- changing NPC, projectile, or buff cutover logic
- redesigning standardized item extraction upstream unless one of the 13 row-set exceptions is explicitly promoted to a new upstream workstream
