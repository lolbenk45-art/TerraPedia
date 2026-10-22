# Buffs Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the 388-record frozen Buff source can traverse landing, maint, relation, projection, Item-Buff, NPC-Buff, and consumer readback in isolated schemas, then verify one real V2 automatic attempt without hiding unresolved identities.

**Architecture:** Probe `Template:GetBuffInfo` and the source-page revisions represented by the 388-record map first. If every bound fingerprint matches, use the local 388-record standardized source and map; if changed, privately capture the affected source bundle and recompute all Item/NPC identity lineage. Probe failure, missing local identity, or mixed revisions stops before DML. Run the maintained chain after the hybrid decision, preserve unresolved identities, and defer V2. Keep formal MySQL schemas and production Redis read-only.

**Tech Stack:** `fetch-wiki-buffs.mjs`, `buff-canonical-t1-acceptance.mjs`, new Buff isolated runner, `import-buffs-to-db.mjs`, Buff maint/relation sync, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: all captured Buff identities, landing/maint/relation/projection rows, Item-Buff and NPC-Buff relations, consumer readback, and cleanup.
- Out of scope: formal `terria_v1_*` writes, production scheduler changes, production Redis `6380/DB15`, replay of consumed decisions, and direct repair of unresolved Item/NPC identities.
- Historical 13 unresolved source-item identities are not an allowlist for this source. Recompute unresolved identities from the selected 388-record input; resolve by stable Item ID or retain as blockers. Silent name fallback is not acceptable.
- The existing `maint_buffs` versus relation/projection mismatch for Item `1340` must be repaired or proven harmless before formal admission; the consumed correction decision cannot be reused.

## Current Baseline Authorization - 2026-10-22

- The user authorized the local-source Buff baseline after Wiki API unavailability and directed that this turn perform isolated Buff ingestion only. This execution therefore used `sourceMode=local-offline-authorized`, records `wikiUnchanged=false`, and makes no Wiki freshness/parity claim. No Wiki request or V2 sweep was made.
- The maintained relation apply for this baseline is scoped to Buff-owned relation/projection tables. NPC `inflicts` and `immune` rows are generated from stable-ID-bound Buff source facts; unresolved or duplicate stable identities remain unresolved and are excluded from relations.
- Report: `reports/runtime/eight-domain-production-readiness/20261017/buffs/e8p_e38103255d8d4633/isolated-real-ingestion.json`.

## Tasks

### Task 1: Refresh source and strict identity evidence

**Files:** `pipelines/fetch/fetch-wiki-buffs.mjs`, `pipelines/fetch/capture-buff-page-evidence.mjs`, `pipelines/relation/buff-secondary-identity-lineage.mjs`, `pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs`

- [x] Consume the Buff allocation manifest entry and verify MySQL UUID/schema/account state, Redis DB1-8, and isolated API port; formal Buff runtime DB15 remains untouched.
- [x] Bind `data/standardized/buffs.standardized.json` (388 records), `data/standardized-view/buffs/_meta.json`, `data/generated/buff-standardized-map.json`, and `data/generated/npc-standardized-map.json` by SHA-256 and exact identity/count closure. Do not claim Iteminfo/page raw evidence that is absent.
- [ ] Probe and bind the complete Buff source fingerprint set. Select `local-unchanged` only on exact match; otherwise create a private changed-source capture and validate it. The absent historical Iteminfo/page bundle cannot be treated as a baseline. `probe_unavailable`/`source_ambiguous` stops before provisioning.
- [x] Apply the user's explicit local-offline authorization for this baseline instead of making a live Wiki request; bind the frozen source and record `wikiUnchanged=false`.
- [x] Build strict Item and NPC identity lineage from the selected standardized source; derive and retain current unresolved samples rather than copying the historical count of 13.
- [x] Reject ambiguous NPC crosswalks and quarantine duplicate stable NPC facts; retain missing Item/NPC identities as unresolved and prevent display-name fallback.
- [x] Create the Buff dependency manifest for exact Item/NPC rows and call the common exact-key dependency seeder before the first business DML; unresolved facts never become a permanent allowlist.

```bash
node --test pipelines/fetch/fetch-wiki-buffs.test.mjs \
  pipelines/buff/buff-canonical-t1-acceptance.test.mjs \
  pipelines/relation/buff-secondary-identity-lineage.test.mjs \
  pipelines/relation/buff-npc-variant-empty-scope-candidate.test.mjs
```

### Task 2: Run the maintained Buff chain

**Files:** create `pipelines/buff/run-full-recrawl-canonical-isolated.mjs` and its test; use `pipelines/buff/buff-canonical-t1-acceptance.mjs`, `pipelines/import/import-buffs-to-db.mjs`, and `pipelines/relation/sync-maint-to-relation.mjs`

- [x] Bind the exact 388-record local source and run-derived T1 schemas through `runLiveAutomationAcceptance`.
- [x] Call the maintained Buff importer and Buff-only relation sync path; do not use old `recrawl_*` tables or direct pseudo-adapters.
- [x] Independently read back 388 local/maint/relation/projection Buffs, 380 Item-Buff relations, 91 inflicting and 841 immune NPC-Buff relations, and 388 Buff image relations. Eight Buff table row hashes and unresolved identity samples are in the report; any missing/extra resolved identity fails.
- [x] Exercise the maintained T1 rollback/commit/restore probe, exact dependency seeding, and cleanup; keep `formalDatabaseWrites=false`. V2 source acknowledgement is deferred with V2.

### Task 3: Record production blockers and close the isolated child

- [x] Record unresolved source counts and samples against the exact source file hashes. The local source has 27 Item facts without stable Item IDs and 586 unresolved NPC facts, including 16 duplicate stable-ID facts; no repair or allowlist was applied.
- [x] Start the run-owned catalog API, read public Buff list/detail and admin list responses, then stop and verify its process/port.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Buffs; require the registered Buff runner, a non-fixture attempt, nonzero Buff-owned rows, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/buffs/<runKey>/isolated-real-ingestion.json`.
- [x] Run focused Buff/import/API/source, relation-sync, and secondary-relation tests, `node --check`, and `git diff --check`.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered Buff runner, commits nonzero Buff-owned rows, independently reads them back, and acknowledges the exact source/attempt identities. Isolated success does not resolve historical production source/maint drift.
