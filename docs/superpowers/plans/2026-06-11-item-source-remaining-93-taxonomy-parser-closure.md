# Item Source Remaining 93 Taxonomy And Parser Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the current 93 item-source hard blocks by formally supporting safe `fishing` and `capture` acquisition sources, then converting only raw-backed target-specific parser rows.

**Architecture:** Treat `data/reports/item-source-raw-page-candidates-2026-06-11-current.json` as the current read-only closure baseline. Extend source taxonomy and local compat dry-run validation first, then add target-aware raw-page parsers that emit candidates only with source evidence tied to the target item. Rows without local raw identity or without target-specific acquisition evidence remain hard-blocked with concrete reasons.

**Tech Stack:** Node.js ESM scripts/tests, local wiki raw JSON cache, TerraPedia item acquisition contract Markdown, read-only report generation.

---

## Current Baseline

- Report: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Total rows: `827`
- Current candidates: `734`
- Current hard blocks: `93`
- Hard-block lanes:
  - `requires_page_specific_parser`: `36`
  - `requires_source_taxonomy_extension`: `24`
  - `requires_family_table_parser`: `20`
  - `missing_raw_page`: `13`

## Safety Boundaries

- Do not run crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, production refresh, or any command with `--apply=true`.
- Do not write DB.
- Do not write raw cache.
- Allowed writes: this plan MD, contract Markdown, JS helper/test files, regenerated report JSON under `data/reports`.
- Raw cache before/after snapshots must diff clean.
- Final validation must use current baseline `93`, not the previous `295`.

## Multi-Agent Cross Review

- [x] Safety review: Poincare confirmed next baseline must be `93`, taxonomy/missing-raw rows must not be parser-forced, and final checks must include raw cache diff, mutation-surface scan, report invariants, and concrete blocker reasons.
- [x] Parser review: inspected `requires_page_specific_parser` and `requires_family_table_parser` rows for target-specific raw evidence only.
- [x] Taxonomy review: confirmed `fishing` and `capture` are acquisition mechanisms, normally `sourceRefType=world`, and must not generate NPC loot/shop relations.
- [x] Acceptance review: hard blocks decreased from `93` to `17`; remaining rows are non-closable under current local raw + contract boundaries.

## Task 1: Extend Taxonomy Contract And Local Compat Dry-Run Support

**Files:**
- Modify: `docs/contracts/item-acquisition-source-taxonomy-contract.md`
- Modify: `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`
- Modify: `scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs`

- [x] Write a failing test proving `fishing` and `capture` world sources are currently blocked by local compat row building.
- [x] Add `fishing` and `capture` to required source types.
- [x] Add local compat support for `fishing`, `capture`, `unknown`, `npc_group`, `boss_group`, and `unknown` ref types without requiring a DB ref id for world/unknown/group refs.
- [x] Re-run `node --test scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs`.

## Task 2: Convert Taxonomy-Extension Rows With Exact Raw Evidence

**Files:**
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [x] Add tests for fishing sources:
  - `Zephyr Fish`: `fishing/world/Fishing`, chance and any-water condition.
  - `Obsidifish`: `fishing/world/Lava fishing`, lava condition.
  - `Hellstone Crate`: `fishing/world/Lava fishing`, crate source condition.
  - `Bottomless Lava Bucket`: `fishing/world/Lava fishing`, exact `auto=4820` row.
- [x] Add tests for capture sources:
  - Forest butterflies: `capture/world/Bug Net capture`.
  - Hell Butterfly, Lavafly, Magma Snail: `capture/world/Lavaproof or Golden Bug Net capture`, preserving Underworld/Ash-grass conditions when available.
- [x] Implement reviewed fishing and capture extraction.
- [x] Remove these rows from `requires_source_taxonomy_extension` only when a raw sentence or exact `auto=<itemId>` source cell exists.

## Task 3: Convert Raw-Backed One-Off Page-Specific Rows

**Files:**
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [x] Add tests for:
  - `Bone Block`: current item unobtainable / legacy mining source must be represented as `unknown/world/unobtainable` unless a version-specific mining item source is explicitly target-safe.
  - `Cooked Marshmallow`: `unknown/world/Campfire cooking`, preserving held-over-campfire condition.
  - `The Dirtiest Block`: `worldgen/world/Dirt Block world generation`.
  - `Lucky Clover`: `drop/world/tall grass`, preserving tall-grass condition.
  - `Chillet` and `Chillet Ignis`: `drop/item/Huge Dragon Egg`, 50% chance.
  - `The Imploder`: `unknown/world/unimplemented`.
- [x] Implement exact page-specific rules using raw sentences, not page title alone.
- [x] Keep `Fish` disambiguation, `Darkness` debuff, Jellyfish enemy pages, and other non-acquisition pages blocked unless raw evidence clearly targets the item.

## Task 4: Convert Family Table Rows With Exact Target Rows

**Files:**
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [x] Add tests for exact-row family pages:
  - `Dressers` plunder rows via exact `auto=<itemId>` + plunder/found source.
  - `Fairies` capture/interaction rows only if target row exists.
  - `Shellphone` variants and inactive toggle variants only if raw page proves they are alternate forms, not separate acquisition.
  - `Fin Wings` / `Chippy's Cloak (Inactive)` via exact Wings row or explicit alternate form.
- [x] Implement conservative family parser helpers.
- [x] If a family row lacks target row/source cell, keep a hard block with specific reason.

## Task 5: Regenerate Report And Iterate

**Files:**
- Update: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`

- [x] Run:

```bash
node scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs --output=data/reports/item-source-raw-page-candidates-2026-06-11-current.json
```

- [x] Verify report invariants:
  - `summary.totalRows === 827`
  - `summary.unresolvedTotal === 0`
  - `candidates.length + hardBlockedRows.length === 827`
  - `summary.hardBlockedRows === hardBlockedRows.length`
  - `summary.hardBlockedRows < 93`; final value is `17`.
  - every candidate has `extractedSources.length > 0`.
  - every hard-block row has `hardBlockLane`, `blockerReason`, `pageTitle`, and `specificBlockerReason`.

## Task 6: Final Validation

- [x] Run focused tests:

```bash
node --test scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs
```

- [x] Run broader related tests:

```bash
node --test scripts/data/lib/wiki-page-utils.test.mjs scripts/data/audit/build-item-source-remaining-closure-report.test.mjs scripts/data/audit/audit-item-source-gap-candidates.test.mjs
```

- [x] Run `git diff --check`.
- [x] Snapshot raw cache after and diff with `/tmp/terrapedia-item-raw-before-next.tsv`.
- [x] Static scan modified scripts for mutation surfaces and confirm only read-only/report-write behavior is present.
- [x] Report final count delta from `93`, remaining lane split, and exact files changed.

## Final Result

- Final report: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Baseline hard blocks: `93`
- Final hard blocks: `17`
- Delta: `76` additional rows closed in this plan, including all remaining raw-backed family parser rows.
- Remaining lanes:
  - `requires_page_specific_parser`: `4`
  - `missing_raw_page`: `13`
- Remaining non-closable rows:
  - `Darkness`: raw page is a debuff page, not item acquisition evidence.
  - `Blue Jellyfish`, `Green Jellyfish`, `Pink Jellyfish`: raw pages are enemy pages, not bait/item acquisition pages.
  - `Fake_newchest1`, `Fake_newchest2`, `OgreMask`, `GoblinMask`, `GoblinBomberCap`, `EtherianJavelin`, `KoboldDynamiteBackpack`, `BoringBow`, `ColorOnlyDye`, `ManaCloakStar`: no exact safe local raw page.
  - `Pink Jellyfish (bait)`, `Green Jellyfish (bait)`, `Blue Jellyfish (bait)`: available alias raw page is enemy `Jellyfish` and does not prove bait identity.
- Final verification:
  - `node --test scripts/data/lib/wiki-page-utils.test.mjs scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs scripts/data/audit/build-item-source-remaining-closure-report.test.mjs scripts/data/audit/audit-item-source-gap-candidates.test.mjs scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs` -> `48/48` passed.
  - `git diff --check` -> passed.
  - Raw cache metadata diff against `/tmp/terrapedia-item-raw-before-next.tsv` -> no changes.
  - Report invariants -> passed (`827 = 810 candidates + 17 hard blocks`, `unresolvedTotal=0`).
