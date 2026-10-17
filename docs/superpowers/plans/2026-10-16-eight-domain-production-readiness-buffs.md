# Buffs Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the 388-record frozen Buff source can traverse landing, maint, relation, projection, Item-Buff, NPC-Buff, and consumer readback in isolated schemas, then verify one real V2 automatic attempt without hiding unresolved identities.

**Architecture:** Use `data/standardized/buffs.standardized.json` and `data/generated/buff-standardized-map.json`; the claimed 400-record Iteminfo/page-evidence bundle is absent from this execution worktree. Run the maintained `runBuffCanonicalT1Acceptance` chain, preserve unresolved Item/NPC identities, then run one isolated non-fixture V2 attempt through the registered Buff runner. Keep formal MySQL schemas and production Redis `6380/DB15` read-only.

**Tech Stack:** `fetch-wiki-buffs.mjs`, `buff-canonical-t1-acceptance.mjs`, new Buff isolated runner, `import-buffs-to-db.mjs`, Buff maint/relation sync, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: all captured Buff identities, landing/maint/relation/projection rows, Item-Buff and NPC-Buff relations, consumer readback, and cleanup.
- Out of scope: formal `terria_v1_*` writes, production scheduler changes, production Redis `6380/DB15`, replay of consumed decisions, and direct repair of unresolved Item/NPC identities.
- Historical 13 unresolved source-item identities are not an allowlist for this source. Recompute unresolved identities from the selected 388-record input; resolve by stable Item ID or retain as blockers. Silent name fallback is not acceptable.
- The existing `maint_buffs` versus relation/projection mismatch for Item `1340` must be repaired or proven harmless before formal admission; the consumed correction decision cannot be reused.

## Tasks

### Task 1: Refresh source and strict identity evidence

**Files:** `pipelines/fetch/fetch-wiki-buffs.mjs`, `pipelines/fetch/capture-buff-page-evidence.mjs`, `pipelines/relation/buff-secondary-identity-lineage.mjs`, `pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs`

- [ ] Consume the Buff allocation manifest entry and verify endpoint/DB/API-port emptiness; formal Buff runtime DB15 remains untouched.
- [ ] Bind `data/standardized/buffs.standardized.json` (388 records), `data/standardized-view/buffs/_meta.json`, and `data/generated/buff-standardized-map.json` by SHA-256, source revision timestamp, and count. Do not claim Iteminfo/page raw evidence that is absent.
- [ ] Use `repository-frozen` mode for this run. A current-source Buff replay is a separate bounded action with its own progress/run identity and is not required for the isolated write.
- [ ] Build strict Item and NPC identity lineage from the selected standardized source; derive and retain current unresolved samples rather than copying the historical count of 13.
- [ ] Reject duplicate resolved facts, ambiguous shared-name NPCs, missing baselines, and source/maint reintroduction risks.
- [ ] Create the Buff dependency manifest for exact Item/NPC rows and call the common exact-key dependency seeder before the first business DML; unresolved facts never become a permanent allowlist.

```bash
node --test pipelines/fetch/fetch-wiki-buffs.test.mjs \
  pipelines/buff/buff-canonical-t1-acceptance.test.mjs \
  pipelines/relation/buff-secondary-identity-lineage.test.mjs \
  pipelines/relation/buff-npc-variant-empty-scope-candidate.test.mjs
```

### Task 2: Run the maintained Buff chain

**Files:** create `pipelines/buff/run-full-recrawl-canonical-isolated.mjs` and its test; use `pipelines/buff/buff-canonical-t1-acceptance.mjs`, `pipelines/import/import-buffs-to-db.mjs`, and `pipelines/relation/sync-maint-to-relation.mjs`

- [ ] Bind the exact 388-record frozen source and run-derived T1 schemas through `runLiveAutomationAcceptance`.
- [ ] Call the maintained Buff importer and sync path; do not use old `recrawl_*` tables or direct pseudo-adapters.
- [ ] Read back exactly 388 Buff identities at landing/maint and their declared relation/projection, Item-Buff, NPC-Buff, and consumer rows with hashes and unresolved samples. Any missing/extra identity fails.
- [ ] Exercise rollback, commit, source acknowledgement ordering, and cleanup; keep `formalDatabaseWrites=false`.

### Task 3: Record production blockers and close the isolated child

- [ ] Record every unresolved Item identity/shared-name NPC fact with exact source keys and hashes. Do not repair or silently allowlist these facts inside the isolated acceptance task; keep production readiness blocked until a separate scoped correction is approved and verified.
- [ ] Start the run-owned catalog API, read representative public/admin Buff responses and compare source item/NPC counts with isolated relation/projection rows, then stop and verify its process/port.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Buffs; require the registered Buff runner, a non-fixture attempt, nonzero Buff-owned rows, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261017/buffs/<runKey>/isolated-real-ingestion.json`.
- [ ] Run focused Buff/live/authorization tests, `node --check`, and `git diff --check`; production remains blocked until the unresolved set is zero or explicitly approved under the current contract.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered Buff runner, commits nonzero Buff-owned rows, independently reads them back, and acknowledges the exact source/attempt identities. Isolated success does not resolve historical production source/maint drift.
