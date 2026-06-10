# Item Source Candidate Import Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the remaining item source gap candidates into a safe, reviewable import rollout without blindly writing all 1488 candidates into the database.

**Architecture:** Keep the default path read-only: raw wiki snapshots are audited, candidates are split into eligible and blocked buckets, and an import plan JSON is emitted for MagicMirror and high-confidence batches. Real DB writes remain behind a separate authorization gate with backup, dry-run, rollback, and API/UI smoke requirements.

**Tech Stack:** Node data scripts under `scripts/data`, Spring Boot item source API under `back`, Nuxt public item pages under `front-nuxt`, local MySQL schemas `terria_v1_maint`, `terria_v1_relation`, and `terria_v1_local`.

---

## Multi-Agent Review Summary

- Data safety review: do not import 1488 at once. Only `high_confidence` candidates may enter an auto-import candidate pool, and each source row must pass domain gates.
- Plan audit review: default execution stops at read-only reports and tests. `--apply=true`, import, sync, materialize, DB refresh, and Flyway apply require separate authorization.
- Relation/local strategy review target: additive batch import only, stable fingerprints, duplicate skip, and batch-id rollback.
- API/frontend review target: frontend must consume `/api/public/items/{id}/sources`; no public UI fallback may invent sources when the API returns empty.

## Current Evidence

- Read-only audit summary from the minimal MagicMirror closure:
  - `parsedRawItemPages=6131`
  - `rawPagesWithExtractedSources=2614`
  - `totalCandidates=1488`
  - `candidateSourceRows=2606`
  - `classificationCounts={ family_page_candidate:1129, high_confidence:271, polluted_candidate:88 }`
- MagicMirror canary:
  - item id `50`
  - raw page `/home/lolben/data/terraPedia/raw/wiki/item-pages/magicmirror.latest.json`
  - expected raw source rows: `Gold Chest`, `Mimics`, `Mimic`, `Frozen Chest`, `Magic Mirrors worldgen`
- Family-page examples already seen in read-only samples:
  - `AetheriumBookcase -> Bookcases`
  - `AHorribleNightforAlchemy -> Paintings`
  - `AlphabetStatue0 -> Statues`

## Non-Negotiable Boundaries

- Do not run crawler, import, backfill, fetch, pipeline, sync, materialize, DB refresh, rollback, or Flyway apply in the default phases.
- Do not execute any command with `--apply=true`.
- Do not manually execute `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, or `ALTER` against a real database.
- Do not hand-edit generated data under `data/standardized-view/item_relations/itemSources/*.json`.
- Do not treat `family_page_candidate` or `polluted_candidate` as importable.
- Do not map Chest, Crate, Treasure Bag, Lock Box, Present, or similar item/container sources to NPC.
- Do not add frontend fallback logic that guesses acquisition sources.

## Candidate Policy

### Eligible For First Auto-Import Planning

`high_confidence` candidates may enter the import plan only when all row-level gates pass:

- candidate item resolves to a unique standardized item;
- `sourceType` and `sourceRefType` are contract values;
- `sourceRefType` is not `unknown`;
- item-backed refs (`item`, `container`, `crate`, `treasure_bag`) resolve to a standardized item when a strong entity id is required;
- NPC-backed refs (`npc`, `boss`) resolve to a known NPC identity;
- `world` refs preserve text, page, revision, conditions, and notes without forcing `source_ref_id`;
- no forbidden mapping such as `Gold Chest -> npc`;
- planned action is additive only.

### Blocked By Default

- `family_page_candidate`: needs a family split contract before any import.
- `polluted_candidate`: needs extractor or taxonomy cleanup before reconsideration.
- Any candidate containing unknown source/ref type.
- Any candidate with unresolved item or NPC identity, except `world` refs.
- Any candidate that would create update/delete behavior in the default rollout.

## Agent Split

- Agent A, data/audit: owns read-only candidate import plan script and tests.
- Agent B, relation/local review: owns SQL/apply gate review only; no DB writes in default phases.
- Agent C, API/frontend review: owns runtime smoke checklist and no-fallback UI rule.
- Agent D, plan auditor: owns final checklist and forbidden command review.

## Phase 0: Baseline And Evidence Lock

- [ ] Record branch and dirty files.

Run:

```bash
git status --short --branch
```

Expected: branch is the active item-source repair branch and dirty files are all item-source scope.

- [ ] Generate MagicMirror read-only evidence.

Run:

```bash
node scripts/data/audit/audit-item-source-gap-candidates.mjs --sample MagicMirror
```

Expected: one high-confidence candidate with five extracted source rows.

- [ ] Generate current full candidate summary.

Run:

```bash
node scripts/data/audit/audit-item-source-gap-candidates.mjs --limit 0
```

Expected: no DB writes, report includes the 1488 candidate classification counts when all raw pages are inspected.

## Phase 1: Read-Only Import Plan JSON

**Files:**
- Create: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Create: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`

- [ ] Add tests proving mutation flags are rejected.
- [ ] Add tests proving MagicMirror becomes one eligible candidate with container, NPC, and world rows.
- [ ] Add tests proving family-page candidates are blocked.
- [ ] Add tests proving Chest/Crate/Treasure Bag/Lock Box cannot pass as `sourceRefType=npc`.
- [ ] Implement the script as read-only JSON output.

Required output shape:

```json
{
  "readOnly": true,
  "mode": "candidate_import_plan",
  "summary": {
    "totalCandidates": 0,
    "eligibleCandidates": 0,
    "blockedCandidates": 0,
    "plannedSourceRows": 0,
    "blockedSourceRows": 0,
    "classificationCounts": {}
  },
  "eligibleCandidates": [],
  "blockedCandidates": []
}
```

## Phase 2: Canary Dry-Run Package

- [ ] Run the import-plan script for MagicMirror.

Run:

```bash
node scripts/data/audit/build-item-source-candidate-import-plan.mjs --sample MagicMirror
```

Expected:

- `eligibleCandidates=1`
- `blockedCandidates=0`
- `plannedSourceRows=5`
- source rows include `Gold Chest`, `Mimics`, `Mimic`, `Frozen Chest`, and `Magic Mirrors worldgen`
- no SQL, DB connection, import, sync, materialize, or apply command is executed

## Phase 3: Full Read-Only Candidate Report

- [ ] Run the import-plan script for all candidates and write a report file.

Run:

```bash
node scripts/data/audit/build-item-source-candidate-import-plan.mjs --output data/reports/item-source-candidate-import-plan.latest.json
```

Expected:

- `family_page_candidate` and `polluted_candidate` appear only in blocked output.
- `eligibleCandidates` is at most the high-confidence subset after row-level gates.
- report remains a local generated artifact and is not required to be committed.

## Phase 4: Apply Authorization Gate

This phase is not part of the default execution. It can only run after explicit confirmation.

Required before any DB write:

- target DB host/user/schema printed and verified;
- backup or snapshot recorded;
- no concurrent writer for maint/relation/local item source tables;
- canary report reviewed;
- exact command list reviewed;
- rollback by batch id defined;
- API and UI smoke ports available.

Authorized apply order:

1. MagicMirror canary only.
2. High-confidence batches capped at 25 items or 100 source rows.
3. Family-page split contracts by page family.
4. Polluted-candidate taxonomy fixes.

## Phase 5: Runtime Acceptance After Authorized Apply

Run only after the data refresh/apply gate is approved and executed:

```bash
curl -s "http://localhost:18088/api/public/items/50/sources"
```

Expected: non-empty MagicMirror sources.

Open:

```text
http://localhost:5174/items/50
```

Expected: source cards are rendered from API data, not frontend guesses.

## Default Validation

Run:

```bash
node --test \
  scripts/data/audit/audit-item-source-gap-candidates.test.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.test.mjs \
  scripts/data/lib/wiki-page-utils.test.mjs \
  scripts/data/fetch/build-item-relations-bundle.test.mjs
```

Run:

```bash
node --test \
  scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/item-source-relation-processor.test.mjs \
  scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs \
  scripts/data/lib/npc-loot-source-taxonomy.test.mjs
```

Run:

```bash
cd back && mvn test -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest
```

Run:

```bash
git diff --check
git status --short
```
