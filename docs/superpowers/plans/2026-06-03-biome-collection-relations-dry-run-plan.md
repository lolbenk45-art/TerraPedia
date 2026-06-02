# Biome Collection Relations Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a dry-run candidate report for the 5 unresolved biome wikitext rows that are armor-set or item-collection concepts, without writing DB rows or modifying item-group override files.

**Architecture:** Add a Node.js ESM audit script that consumes the policy relation plan report, filters the three collection policy actions, and then enforces an explicit identity allowlist for the five approved candidate rows. The report describes future target surfaces and reviewed candidate members, but every row remains user-gated with `dbWriteAction: "none"`.

**Tech Stack:** Node.js ESM, `node:test`, JSON reports, existing TerraPedia audit script style.

---

## Source Chain

Input:

- `reports/biome-wikitext-policy-relation-plan-2026-06-02.json`

Input contract:

- file exists at the given path
- `entity === "biome_wikitext_policy_relation_plan"`
- `summary.total === 42`
- `summary.dbWriteActions.none === 42`
- expected source policy counts:
  - `boss_treasure_bag_projection_only`: 2
  - `armor_set_relation_schema_needed`: 2
  - `item_set_component_collection_schema_needed`: 2
  - `item_family_collection_schema_needed`: 1
  - `ambiguous_npc_variant_policy_needed`: 14
  - `normalized_npc_candidate_policy_needed`: 3
  - `weak_npc_family_backfill_clue_only`: 16
  - `still_missing_entity_evidence_needed`: 2
- every source row is `evidenceOnly: true`, `needsUserDecision: true`, `dbWriteAction: "none"`, and `resolvedMapping: null`

Expected input rows:

| Policy action | Count | Rows |
| --- | ---: | --- |
| `armor_set_relation_schema_needed` | 2 | `Ninja armor`, `Snow armor` |
| `item_set_component_collection_schema_needed` | 2 | `Mummy set`, `Pedguin's set` |
| `item_family_collection_schema_needed` | 1 | `Obsidian furniture` |

Stable row allowlist:

| Input index | Wiki name | Future category |
| ---: | --- | --- |
| 22 | `Ninja armor` | `armor_set_relation_candidate` |
| 25 | `Mummy set` | `item_set_collection_candidate` |
| 36 | `Obsidian furniture` | `item_family_collection_candidate` |
| 40 | `Snow armor` | `armor_set_relation_candidate` |
| 41 | `Pedguin's set` | `item_set_collection_candidate` |

The builder must fail if an input report contains any additional row with one of the three collection policy actions, or if one of these five identities is missing.

Output:

- `reports/biome-collection-relations-dry-run-2026-06-03.json`

## Boundaries

- No DB writes.
- No DB connection.
- No migration execution.
- No crawler, fetch, import, backfill, load, or apply command.
- No edits to `data/generated/item-group-overrides.json`.
- No expansion into `item_biomes`.
- No expansion into `npc_biomes`.
- No use of `biome_relations`.
- No Treasure Bag or NPC rows in this report.

## Candidate Categories

- `armor_set_relation_candidate`: future `biome_armor_sets` row candidate.
- `item_set_collection_candidate`: future item collection row candidate for component-based vanity sets.
- `item_family_collection_candidate`: future item collection row candidate for family collections such as furniture.

Each candidate must include:

- `inputIndex`
- `rowKey`
- `biomeCode`
- `biomeName`
- `wikiName`
- `source`
- `candidateCategory`
- `futureSurface`
- `candidateKey`
- `candidateLabel`
- candidate member evidence
- `schemaRequired: true`
- `dbWriteAction: "none"`
- `evidenceOnly: true`
- `needsUserDecision: true`
- `resolvedMapping: null`

Candidate evidence mapping:

- `armor_set_relation_candidate` must use non-empty `memberEvidence.armorSetCandidates` from `policyRow.evidence.armorSetCandidates`.
- `item_set_collection_candidate` must use non-empty `memberEvidence.componentItemCandidates` from `policyRow.evidence.componentItemCandidates`.
- `item_family_collection_candidate` must use non-empty `memberEvidence.familyItemCandidates` from `policyRow.evidence.familyItemCandidates`.
- Empty or wrong-source evidence fails validation.

## Tasks

### Task 1: Add Failing Tests

**Files:**

- Create: `scripts/data/audit/biome-collection-relations-dry-run.test.mjs`

- [ ] **Step 1: Write tests first**

Tests must assert:

- only the 5 collection/armor rows are emitted from a mixed policy-plan fixture
- only the explicit five row identities are accepted
- missing allowlisted rows and extra collection-action rows fail validation before output
- input policy report contract is validated: entity, total 42, expected policy counts, `dbWriteActions.none`, and source row no-write/unresolved flags
- each candidate category requires non-empty evidence from the correct policy evidence array
- category counts are exactly 2 armor-set, 2 item-set collection, 1 item-family collection
- Treasure Bag and NPC rows are excluded
- every row is evidence-only, user-gated, schema-required, no-write, and unresolved
- `candidateKey` is stable and namespaced
- validator rejects `item_biomes`, `npc_biomes`, `biome_relations`, SQL, import plans, apply flags, resolved mappings, and direct item/NPC relation payloads
- parser rejects unknown options including `--apply=true`
- script source has no DB client/connection, SQL write statement, `node:child_process`, `node:http`, `node:https`, `fetch(`, `--apply`, or `scripts/data/(crawler|fetch|import|backfill|load)` path

- [ ] **Step 2: Run red test**

Run:

```bash
node --test scripts/data/audit/biome-collection-relations-dry-run.test.mjs
```

Expected: FAIL because the implementation module does not exist.

### Task 2: Implement Dry-Run Builder

**Files:**

- Create: `scripts/data/audit/biome-collection-relations-dry-run.mjs`

- [ ] **Step 1: Implement minimal exports**

Implement:

- `parseArgs(argv)`
- `buildBiomeCollectionRelationsDryRun({ policyReport, generatedAt, sourceReportPath })`
- `classifyCollectionCandidate(policyRow)`
- `validateBiomeCollectionRelationsDryRun(report)`
- `writeBiomeCollectionRelationsDryRun({ inputPath, outputPath, generatedAt })`

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --test scripts/data/audit/biome-collection-relations-dry-run.test.mjs
```

Expected: PASS.

### Task 3: Generate Real Dry-Run Report

**Files:**

- Local ignored output: `reports/biome-collection-relations-dry-run-2026-06-03.json`

- [ ] **Step 1: Run against the policy report**

Use the prior local report path if this worktree does not have local ignored reports:

```bash
node scripts/data/audit/biome-collection-relations-dry-run.mjs \
  --input=/home/lolben/.config/superpowers/worktrees/TerraPedia/plan-biome-wikitext-unresolved-2026-06-02/reports/biome-wikitext-policy-relation-plan-2026-06-02.json \
  --output=reports/biome-collection-relations-dry-run-2026-06-03.json
```

Expected summary:

- total: 5
- `armor_set_relation_candidate`: 2
- `item_set_collection_candidate`: 2
- `item_family_collection_candidate`: 1
- `dbWriteActions.none`: 5

### Task 4: Validate All Related Tests

Run:

```bash
node --test \
  scripts/data/audit/biome-collection-relations-dry-run.test.mjs \
  scripts/data/audit/biome-wikitext-policy-relation-plan.test.mjs
```

Expected: all tests pass.

## Acceptance

- Generated report contains exactly 5 collection/armor candidate rows.
- No DB write or source data file modification occurs.
- No row creates a direct `item_biomes`, `npc_biomes`, or `biome_relations` payload.
- Tests pass.
- Final handoff asks before any schema, import, backend API, or UI work.
