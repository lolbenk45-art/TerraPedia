# Biome Wikitext Policy Relation Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only policy-plan layer over the existing unresolved biome wikitext reports so the next relation-model decision is explicit, auditable, and free of guessed mappings.

**Architecture:** Add one Node.js ESM audit script that consumes the local-domain report plus the missing-local-evidence report and emits a policy report. The script performs no DB access and no writes except the JSON output report. Tests define the report contract and category mapping first.

**Tech Stack:** Node.js ESM, `node:test`, JSON reports, existing TerraPedia audit report conventions.

---

## Boundaries

- No DB writes.
- No DB connection.
- No migration execution.
- No crawler, fetch, import, backfill, load, or apply command.
- No alias mapping.
- No expansion from a collection row into single `item_biomes` or `npc_biomes`.
- No reuse of `biome_relations` for non-biome targets.

## Files

- Create: `scripts/data/audit/biome-wikitext-policy-relation-plan.mjs`
- Create: `scripts/data/audit/biome-wikitext-policy-relation-plan.test.mjs`
- Create local ignored report: `reports/biome-wikitext-policy-relation-plan-2026-06-02.json`
- Reference only: `docs/superpowers/specs/2026-06-02-biome-wikitext-policy-relation-design.md`

## Policy Categories

- `boss_treasure_bag_projection_only`: boss detail loot already exposes treasure-bag drops; no `item_biomes` write.
- `armor_set_relation_schema_needed`: armor-set candidate exists but needs a typed relation surface.
- `item_set_component_collection_schema_needed`: component items exist for a set-like row, but this is a collection relation.
- `item_family_collection_schema_needed`: local item family exists for a collection-like row.
- `ambiguous_npc_variant_policy_needed`: multiple NPC variants match; user must choose a variant policy.
- `normalized_npc_candidate_policy_needed`: normalized NPC candidate exists, but still user-gated because family variants exist.
- `weak_npc_family_backfill_clue_only`: weak family evidence only; use as search/backfill clue.
- `still_missing_entity_evidence_needed`: no useful local evidence.

## Tasks

### Task 1: Add Policy Report Contract Tests

**Files:**
- Create: `scripts/data/audit/biome-wikitext-policy-relation-plan.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests that construct small local-domain and missing-evidence fixtures and assert:

- one output row per local-domain input row
- local-domain and missing-evidence inputs join by `inputIndex` plus `original.rowKey`
- duplicate local-domain rows, duplicate missing-evidence rows, extra missing-evidence rows, and row-key mismatches are rejected
- every output row is evidence-only and user-gated
- every output row has `dbWriteAction: "none"`
- every output row has `resolvedMapping: null`
- output rows reject resolved IDs, alias maps, import plans, apply flags, SQL statements, target table writes, or single `item_biomes`/`npc_biomes` mapping payloads
- boss treasure bags are projection-only
- armor sets and component sets are schema-needed collection rows
- ambiguous, normalized, weak-family, and missing rows remain unresolved
- unknown options and `--apply=true` are rejected
- the source has no DB/network/process/import/backfill/apply path

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/data/audit/biome-wikitext-policy-relation-plan.test.mjs
```

Expected: FAIL because the script module does not exist.

### Task 2: Add Policy Report Script

**Files:**
- Create: `scripts/data/audit/biome-wikitext-policy-relation-plan.mjs`

- [ ] **Step 1: Implement minimal script**

Implement these exported functions:

- `parseArgs(argv)`
- `buildBiomeWikitextPolicyRelationPlan({ localDomainReport, missingEvidenceReport, generatedAt, sourceReportPaths })`
- `classifyPolicyAction({ localDomainRow, missingEvidenceRow })`
- `validatePolicyRelationPlanReport(report)`
- `writePolicyRelationPlanReport({ localDomainPath, missingEvidencePath, outputPath, generatedAt })`

The script should read JSON files, classify rows, validate the output, and write the JSON report only.

- [ ] **Step 2: Run focused test**

Run:

```bash
node --test scripts/data/audit/biome-wikitext-policy-relation-plan.test.mjs
```

Expected: PASS.

### Task 3: Generate Runtime Policy Report

**Files:**
- Local output only: `reports/biome-wikitext-policy-relation-plan-2026-06-02.json`

- [ ] **Step 1: Run the dry-run policy report**

Run:

```bash
node scripts/data/audit/biome-wikitext-policy-relation-plan.mjs \
  --local-domain=reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json \
  --missing-evidence=reports/biome-wikitext-missing-local-evidence-audit-2026-06-02.json \
  --output=reports/biome-wikitext-policy-relation-plan-2026-06-02.json
```

Expected: JSON summary printed with 42 total rows and no DB-write action.

- [ ] **Step 2: Validate current report category counts**

Run:

```bash
node -e "const fs=require('fs'); const report=JSON.parse(fs.readFileSync('reports/biome-wikitext-policy-relation-plan-2026-06-02.json','utf8')); const expected={boss_treasure_bag_projection_only:2,armor_set_relation_schema_needed:2,item_set_component_collection_schema_needed:2,item_family_collection_schema_needed:1,ambiguous_npc_variant_policy_needed:14,normalized_npc_candidate_policy_needed:3,weak_npc_family_backfill_clue_only:16,still_missing_entity_evidence_needed:2}; for (const [key,value] of Object.entries(expected)) { if (report.summary.byPolicyAction[key] !== value) throw new Error(`${key} expected ${value} got ${report.summary.byPolicyAction[key]}`); } if (report.summary.total !== 42) throw new Error(`total expected 42 got ${report.summary.total}`); if (report.summary.dbWriteActions.none !== 42) throw new Error('expected all dbWriteAction values to be none'); console.log(JSON.stringify({total: report.summary.total, byPolicyAction: report.summary.byPolicyAction, dbWriteActions: report.summary.dbWriteActions}, null, 2));"
```

Expected counts:

- `boss_treasure_bag_projection_only`: 2
- `armor_set_relation_schema_needed`: 2
- `item_set_component_collection_schema_needed`: 2
- `item_family_collection_schema_needed`: 1
- `ambiguous_npc_variant_policy_needed`: 14
- `normalized_npc_candidate_policy_needed`: 3
- `weak_npc_family_backfill_clue_only`: 16
- `still_missing_entity_evidence_needed`: 2
- total: 42
- `dbWriteActions.none`: 42

### Task 4: Run Full Audit Validation

**Files:**
- Test all touched audit files.

- [ ] **Step 1: Run tests**

Run:

```bash
node --test \
  scripts/data/audit/biome-wikitext-policy-relation-plan.test.mjs \
  scripts/data/audit/biome-wikitext-missing-local-evidence-audit.test.mjs \
  scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs \
  scripts/data/audit/biome-wikitext-unresolved-report.test.mjs \
  scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs
```

Expected: all tests pass.

## Acceptance

- The generated policy report accounts for all 42 unresolved rows.
- The report contains no resolved alias/import mapping.
- Every row is evidence-only, user-gated, and `dbWriteAction: "none"`.
- Tests pass.
- Final handoff lists exactly which categories need user decisions before schema/import work.
