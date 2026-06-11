# Item Source Terminal Closure Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify the remaining 17 item-source hard blocks from generic parser/missing-raw failures into explicit terminal closure statuses with concrete next actions.

**Architecture:** Keep the read-only raw-page candidate audit as the source of truth for this closure layer. Do not convert terminal rows into source candidates. Add terminal status metadata to hard-block rows and summary counts so downstream reports can distinguish “parser work remaining” from “needs raw acquisition,” “identity review,” and “not an item acquisition source.”

**Tech Stack:** Node.js ESM audit scripts/tests, local wiki raw JSON cache, generated JSON reports under `data/reports`.

---

## Current Baseline

- Branch: `feature/item-source-terminal-closure-status-2026-06-11`
- Input report: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Current total rows: `827`
- Current candidates: `810`
- Current hard blocks: `17`
- Current hard-block lanes:
  - `requires_page_specific_parser`: `4`
  - `missing_raw_page`: `13`

## Safety Boundaries

- Do not run crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, production refresh, or any command with `--apply=true`.
- Do not write DB.
- Do not write raw cache.
- Allowed writes: this plan MD, audit JS/test files, regenerated report JSON under `data/reports`.
- Do not create source candidates for terminal rows unless exact local raw evidence is discovered later in a separate plan.

## Terminal Status Contract

Hard-block rows may include:

- `terminalClosureStatus`: machine-readable final status.
- `terminalClosureReason`: human-readable reason.
- `recommendedNextAction`: concrete next step.
- `terminalClosureEvidence`: short raw/cache evidence summary.

Allowed terminal statuses:

- `non_item_effect`: row is not an item acquisition source target.
- `enemy_page_identity_mismatch`: available raw page is an enemy/NPC page, not an item or bait acquisition page.
- `missing_bait_raw`: target is bait-like, but only unsafe enemy-page aliases exist.
- `missing_exact_raw`: no exact safe local raw page exists.
- `internal_or_unobtainable_identity_review`: row appears internal, duplicate, or unobtainable and needs identity review before any source import.

## Task 1: Add Terminal Classification Tests

**Files:**
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [x] Add a focused test with four rows:
  - `Darkness` raw page with `{{buff infobox}}` and debuff prose -> `non_item_effect`.
  - `Blue Jellyfish` raw page with Jellyfish enemy prose -> `enemy_page_identity_mismatch`.
  - `Pink Jellyfish (bait)` with alias raw page rejected -> `missing_bait_raw`.
  - `Fake_newchest1` without raw page -> `internal_or_unobtainable_identity_review`.
- [x] Assert each terminal row still has `extractedSources: []`.
- [x] Assert `summary.terminalHardBlockedRows === 4`.
- [x] Assert `summary.terminalClosureStatusCounts` contains the four statuses.

## Task 2: Implement Terminal Classification

**Files:**
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`

- [x] Add `terminalClosureForMissingRaw(row, rawResolution)`.
- [x] Add `terminalClosureForRawPage(entry, row, payload)`.
- [x] Attach terminal closure fields to both missing raw hard blocks and raw-page hard blocks.
- [x] Add `terminalHardBlockedRows` and `terminalClosureStatusCounts` to the summary.
- [x] Keep existing `hardBlockLane` values for backward compatibility.

## Task 3: Regenerate Current Report

**Files:**
- Update: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`

- [x] Run:

```bash
node scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs --output=data/reports/item-source-raw-page-candidates-2026-06-11-current.json
```

- [x] Verify report invariants:
  - `summary.totalRows === 827`
  - `candidates.length + hardBlockedRows.length === 827`
  - `summary.hardBlockedRows === 17`
  - `summary.terminalHardBlockedRows === 17`
  - `summary.unresolvedTotal === 0`
  - every hard-block row has `terminalClosureStatus`, `terminalClosureReason`, and `recommendedNextAction`.

## Task 4: Final Validation

- [x] Run focused test:

```bash
node --test scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs
```

- [x] Run related tests:

```bash
node --test scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs scripts/data/audit/build-item-source-remaining-closure-report.test.mjs scripts/data/audit/audit-items-without-active-sources.test.mjs scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs
```

- [x] Run `git diff --check`.
- [x] Confirm raw cache unchanged by not writing under `/home/lolben/data/terraPedia/raw/wiki/item-pages`.
- [x] Report exact remaining status counts and files changed.

## Final Result

- Final report: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Candidate rows remained stable: `810`
- Hard blocks remained stable: `17`
- Actionable parser hard blocks: `0`
- Terminal hard blocks: `17`
- Terminal closure status counts:
  - `non_item_effect`: `1`
  - `enemy_page_identity_mismatch`: `3`
  - `missing_bait_raw`: `3`
  - `internal_or_unobtainable_identity_review`: `10`
- Verification:
  - `node --test scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs scripts/data/audit/build-item-source-remaining-closure-report.test.mjs scripts/data/audit/audit-items-without-active-sources.test.mjs scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs` -> `30/30` passed.
  - Report invariant script -> passed (`827 = 810 candidates + 17 hard blocks`, `terminalHardBlockedRows=17`, `actionableParserHardBlockedRows=0`).
  - `git diff --check` -> passed.
