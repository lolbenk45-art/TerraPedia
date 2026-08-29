# Remaining Image Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining local image-chain gaps with exact, independently authorized scopes while preserving every quarantined identity and avoiding guessed URLs, external fetches, image transfers, and unbounded schema or database writes.

**Architecture:** The canonical chain is `local evidence -> maint/relation lineage -> relation projection -> local/API`. The first phase is read-only and binds the latest evidence reports to `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/read-only-freeze.json`. Each later write lane gets its own fresh database-backed scope hash, packet, permit, transaction, and readback; a consumed Item or Buff permit is never reused.

**Tech Stack:** Node.js ESM, `node:test`, existing image readiness/lineage audits, MySQL 8 read-only transactions, canonical operation manifests, and the maintained Spring/Nuxt read paths.

---

## Scope And Boundaries

- In scope: Item projection evidence for existing `projection_items.image` rows; managed-prefix projection evidence for NPC, Projectile, and Armor; a Biome image ownership contract; local classification of the 23 Item asset gaps, four NPC missing-asset rows, and two provenance quarantine rows; final read-only API/data-chain verification.
- Out of scope for this plan run: Wiki/Steam/forum requests, crawler or image downloads, MinIO transfers, direct SQL, table rebuilds, local compatibility backup cleanup, production targets, L2 promotion, staging, commits, and replay of the consumed `canonical-item-image-provenance-patch` or `canonical-buff-image-projection-patch` permits.
- The freeze is evidence, not authorization. Any write, new authorization, schema migration, or external request must first produce a new exact scope hash after a fresh read-only database snapshot.
- Ownership is serialized by one coordinator. Read-only audits may be run independently, but no two write lanes may share a table, column, permit, or service lifecycle.

## Closure Definition

The plan is closed only when the final reports prove all of the following, or explicitly record a user-approved quarantine with an owner and follow-up:

1. Item projection evidence is current, hash-valid, managed-prefix compliant, and covers every eligible existing projection row; the 15 legacy-unowned rows, eight `ZH_RECIPE_*` rows, and the two provenance quarantine rows are excluded by identity and counted.
2. NPC, Projectile, and Armor projection image values either pass their managed-prefix contracts or have an explicit per-identity missing-asset quarantine; no image is copied from another entity type.
3. Biome icons have an owned source/cache/projection contract, or the exact schema/contract blocker is recorded without mutating the current local table.
4. Image readiness and lineage reports, local-core compatibility checks, backend read-only API smoke, and the affected focused suites agree on the same frozen identities and counts.
5. No new permit, packet, database mutation, external request, crawler, image transfer, or commit is performed without a fresh scope hash and explicit owner authorization.

## Read-Only Freeze (Completed Before Implementation)

**Evidence:** `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/read-only-freeze.json`

- [x] Bind the current branch/HEAD and dirty-state counts without touching unrelated paths.
- [x] Bind the latest read-only Item asset, Item projection-lineage, Item gap classification, Biome icon, and provenance reconciliation report hashes.
- [x] Freeze target tables/columns and counts: Item projection `6131/6146`, NPC `758/762`, Projectile `1110/1111`, Armor `88/88`, and Biome `47` rows with `40` managed and `7` fallback icons.
- [x] Keep `FallenStar` and `SeveredHandBanner` outside every future identity list.
- [ ] Refresh the freeze from a live loopback `START TRANSACTION READ ONLY` snapshot before any proposal. The current environment had no reachable MySQL/application ports, so this is a required pre-write gate.

## Task 1: Fresh Database-Backed Freeze And Asset Inventory

**Files / reports:**
- Modify only by generated report output: `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/`
- Read: `pipelines/audit/image-asset-readiness-audit.mjs`
- Read: `pipelines/audit/image-source-lineage-report.mjs`
- Read: `pipelines/audit/audit-biome-icon-readiness.mjs`
- Read: `pipelines/relation/local-core-compat-smoke-check.mjs`

- [ ] Verify loopback MySQL and the maintained stack; if unavailable, stop with a blocked freeze report and do not infer current rows from memory.
- [ ] Run the three SELECT-only audits and the local-core compatibility smoke into a new timestamped subdirectory. Preserve `readOnly=true`, `databaseWrites=false`, `externalRequests=false`, and the actual managed-prefix source hash.
- [ ] Produce exact identity inventories for the four missing NPC assets, the one missing Projectile core asset, all Item gap classifications, and every projection row whose source/projection key does not match.
- [ ] Compute `scopeHash = sha256(canonical JSON of identity keys, target columns, before-row hashes, managed-prefix policy hash, and evidence file hashes)`. Any changed row invalidates the hash and requires a new freeze.
- [ ] Validate JSON schemas, `git diff --check`, and the no-write command log. Do not create an authorization request or permit in this task.

Run from the repository root after loopback preflight:

```bash
  RUN_DATE="$(date +%Y%m%d)"
  RUN_ROOT="reports/runtime/local-data-chain-closure/$RUN_DATE/remaining-image-repair/$(date +%H%M%S)"
mkdir -p "$RUN_ROOT"
node pipelines/audit/image-source-lineage-report.mjs --source=db --output="$RUN_ROOT/image-source-lineage.json"
node pipelines/audit/image-asset-readiness-audit.mjs --source=db --output="$RUN_ROOT/image-asset-readiness.json"
node pipelines/audit/audit-biome-icon-readiness.mjs --output="$RUN_ROOT/biome-icon-readiness.json"
node pipelines/relation/local-core-compat-smoke-check.mjs --throw-on-failure=false
```

Expected: all commands either write only dated JSON reports with read-only flags, or stop with a loopback connection error and leave a blocked freeze; no `INSERT`, `UPDATE`, `DELETE`, permit, or packet is produced.

## Task 2: Repair Item Projection Evidence (Existing Rows Only)

**Files:**
- Read/modify as required: `pipelines/relation/build-item-image-projection-proposal.mjs`, `pipelines/relation/item-image-projection-contract.mjs`, `pipelines/relation/apply-item-image-projection.mjs`
- Tests: `pipelines/relation/build-item-image-projection-proposal.test.mjs`, `pipelines/relation/apply-item-image-projection.test.mjs`, `pipelines/audit/image-source-lineage-report.test.mjs`

- [ ] Generate a fresh read-only proposal from the Task 1 snapshot. Bind `relation_item_images.cached_url` to `projection_items.image` by stable `internal_name` and `relation_record_key`; reject missing rows, duplicate keys, stale before hashes, wrong managed prefixes, and any `FallenStar`/`SeveredHandBanner` key.
- [ ] Require `ownedDatabase=terria_v1_relation`, `ownedTable=projection_items`, `ownedColumn=image`, and an existing-row-only mutation plan. The plan must not insert, delete, rebuild, or modify source/landing/cached fields.
- [ ] Add or repair focused contract tests for key-set drift, projection-after-row drift, managed-prefix rejection, stale evidence, and empty/missing authorization artifacts. Run the focused suites and require all tests to pass before a packet is considered.
- [ ] Stop at the new proposal hash. A separate owner authorization is required before `apply=true`; after approval, update only the image column in one transaction, verify every affected row, and rerun the lineage/readiness reports.

## Task 3: Close NPC, Projectile, And Armor Projection Prefixes

**Files:**
- Read/modify as required: `pipelines/audit/image-source-lineage-report.mjs`, `pipelines/relation/managed-image-url-policy.mjs`, the existing relation/projection sync contracts
- Tests: matching image-lineage, projection-schema, relation-image, and domain readiness suites

- [ ] NPC lane: freeze the exact 758 relation image keys and 762 projection keys, target only `projection_npcs.image_url`, and quarantine the four missing local asset identities. Require `maint_npc_images -> relation_npc_images -> projection_npcs -> API` lineage before any apply.
- [ ] Projectile lane: freeze the exact 1110 relation image keys, keep the one missing core asset blocked, target only `projection_projectiles.image_url`, and reject item/NPC image substitutions.
- [ ] Armor lane: validate the 88 existing `projection_armor_sets` rows and their `male_images`, `female_images`, and `special_images` arrays against the configured managed prefixes and related local item evidence. Do not invent maint/relation image tables; if the current adapter cannot prove ownership, emit a contract blocker and keep the projection unchanged.
- [ ] Build one proposal and one scope hash per entity lane. No shared permit may cover NPC, Projectile, and Armor because their image fields and evidence owners differ.
- [ ] After independent authorization, apply only existing projection image fields, read back the exact key set, and rerun image lineage, asset readiness, local-core compatibility, and API smoke. Any missing asset remains an explicit quarantine rather than a guessed URL.

## Task 4: Define And Gate The Biome Image Contract

**Files:**
- Read/modify as required: `pipelines/relation/projection-schema.mjs`, `pipelines/relation/relation-table-catalog.mjs`, `pipelines/audit/image-source-lineage-report.mjs`, `pipelines/audit/audit-biome-icon-readiness.mjs`, and the maintained Biome mapper/API tests
- Tests: Biome schema/catalog, icon-readiness, lineage, and API contract suites

- [ ] Freeze the 47 local Biome identities and the current 40 managed / 7 Wiki-fallback split from the read-only audit. Keep all seven fallback URLs as evidence only; do not fetch or rewrite them in this task.
- [ ] Specify the exact ownership chain as `terria_v1_maint.maint_biome_images -> terria_v1_relation.relation_biome_images -> terria_v1_relation.projection_biomes.icon_url -> terria_v1_local.biomes.icon_url/API`. Use stable `biome.code`/relation record keys and the same managed URL policy as the other domains.
- [ ] Add schema/catalog and lineage-contract tests that fail closed while the required maint image table, relation image table, or projection image field is absent. The tests must prove that the existing `biomes.icon_url` field is not silently promoted to canonical lineage.
- [ ] If a future approved migration adds those surfaces, generate a separate schema scope hash and migration packet. Until then, the Biome lane remains blocked with `missing_maint_image_table`, `missing_relation_image_table`, and `missing_projection_image_field` and no database mutation.

## Task 5: Preserve And Classify Asset / Provenance Quarantine

**Files / reports:**
- Read: `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.json`
- Read: `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-table-details.json`
- Read/modify as required: `pipelines/audit/item-image-gap-detail-snapshot.mjs`, the image candidate audit contracts
- Tests: `pipelines/audit/item-image-gap-detail-snapshot.test.mjs`, candidate-audit tests, local-core compatibility tests

- [ ] Preserve the 15 `legacy_unowned_image_contract` identities and eight accepted `ZH_RECIPE_*` identities as separate local classifications; never create an image row for either category from a similarly named or component entity.
- [ ] Keep `FallenStar` (`ambiguous_requires_external_verification`) and `SeveredHandBanner` (`recoverable_from_local_file_title_only`) outside all Item provenance and projection scopes. A future external-evidence task must create its own exact identity list and scope hash; this plan does not authorize it.
- [ ] Verify the four missing NPC and one missing Projectile asset identities from Task 1 against local source/cache/fallback rows. Record identity-level reasons and owners; never collapse them into a count-only warning.
- [ ] Treat five stale Item verification timestamps and 388 stale Buff timestamps as non-blocking freshness warnings. A timestamp refresh is a separate write scope and must not be bundled into image projection or provenance repair.

## Task 6: Final Read-Only Chain Verification And Closeout

**Files / reports:**
- Generated reports under `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/`
- Active entry: `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`
- Current index: `docs/devlog/current.md`

- [ ] Rerun image asset readiness, image source lineage, Biome icon readiness, local-core compatibility, backend read-only Item/NPC/Biome API smoke, and all focused suites for touched contracts.
- [ ] Compare every final count and key set with the latest scope hash. Report resolved, warning, quarantined, and blocked categories separately; do not call the overall image chain green while Item projection, Biome ownership, or any approved quarantine remains unresolved.
- [ ] Record command results, residual risks, and the next owner in the active devlog. Keep status `active` when any lane is blocked or awaiting authorization.
- [ ] Before any future commit, run `git status --short`, `git diff --cached --stat`, `git diff --check`, and the targeted docs/term consistency scan. This plan itself does not authorize staging or committing.

Final read-only command set:

```bash
  node pipelines/audit/image-source-lineage-report.mjs --source=db --output="$RUN_ROOT/final-image-source-lineage.json"
node pipelines/audit/image-asset-readiness-audit.mjs --source=db --output="$RUN_ROOT/final-image-asset-readiness.json"
node pipelines/audit/audit-biome-icon-readiness.mjs --output="$RUN_ROOT/final-biome-icon-readiness.json"
cd services/catalog-api && mvn -Dtest=PublicNpcAggregateControllerTest,PublicNpcServiceImplImageTest test
```

Expected: the reports parse, focused Spring tests exit `0`, and any unresolved lane is listed as `warning`, `quarantined`, or `blocked` with the current scope hash; a non-zero command is a validation gap, not a closure claim.

## Plan Audit

- Goal lock: closure is defined by exact image contracts and identity-level quarantine, not by reducing warning counts.
- Source-chain lock: every lane names its source table/field, relation/projection target, managed-prefix policy, and API/readiness consumer.
- Boundary lock: the current freeze is report-only; each future write lane requires a new scope hash and explicit owner authorization.
- Evidence lock: fresh SELECT-only reports, contract tests, key-set hashes, transaction readback, and API smoke are required.
- Continuity: any row drift creates a new freeze and proposal; it never widens an existing scope.
- Multi-agent safety: one coordinator owns all shared reports, permits, migrations, and devlog updates; no concurrent writes share a target.
- Commit readiness: no commit is part of this read-only phase; future commits must contain only the approved lane and its evidence.
