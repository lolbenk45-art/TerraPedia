# Buffs Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete current Buff capture can traverse landing, maint, relation, projection, Item-Buff, NPC-Buff, and consumer readback in isolated schemas without hiding unresolved identities.

**Architecture:** Create a new isolated runner around the maintained `runBuffCanonicalT1Acceptance` chain. Bind the exact full capture and consume the Buff Redis/API resources from the master allocation manifest, preserve unresolved source-item identities as explicit records, and keep formal Buff DB15 read-only.

**Tech Stack:** `fetch-wiki-buffs.mjs`, `buff-canonical-t1-acceptance.mjs`, new Buff isolated runner, `import-buffs-to-db.mjs`, Buff maint/relation sync, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: all captured Buff identities, landing/maint/relation/projection rows, Item-Buff and NPC-Buff relations, consumer readback, and cleanup.
- Out of scope: formal DB15 writes, production scheduler, replay of consumed decisions, and direct repair of unresolved Item/NPC identities.
- The current 13 unresolved source-item identities must be resolved with stable Iteminfo evidence or explicitly excluded by an approved source disposition. Silent name fallback is not acceptable.
- The existing `maint_buffs` versus relation/projection mismatch for Item `1340` must be repaired or proven harmless before formal admission; the consumed correction decision cannot be reused.

## Tasks

### Task 1: Refresh source and strict identity evidence

**Files:** `pipelines/fetch/fetch-wiki-buffs.mjs`, `pipelines/fetch/capture-buff-page-evidence.mjs`, `pipelines/relation/buff-secondary-identity-lineage.mjs`, `pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs`

- [ ] Consume the Buff allocation manifest entry and verify endpoint/DB/API-port emptiness; formal Buff runtime DB15 remains untouched.
- [ ] Bind Template:GetBuffInfo, Iteminfo, and revision-bound Buff/NPC page artifacts with 400 identity coverage, raw hashes, and terminal progress.
- [ ] Default to the existing repository-frozen full Buff/Iteminfo/page-evidence capture for the 400-record isolated run; a current-source replay is optional and must be labeled `bounded-live-capture`.
- [ ] Build strict Item and NPC identity lineage; retain the 13 unresolved source-item samples and any display-only NPC facts.
- [ ] Reject duplicate resolved facts, ambiguous shared-name NPCs, missing baselines, and source/maint reintroduction risks.
- [ ] Create the Buff dependency manifest for exact Item/NPC rows and call the common exact-key dependency seeder before the first business DML; the 13 unresolved sample is a current diagnostic, not a permanent allowlist.

```bash
node --test pipelines/fetch/fetch-wiki-buffs.test.mjs \
  pipelines/buff/buff-canonical-t1-acceptance.test.mjs \
  pipelines/relation/buff-secondary-identity-lineage.test.mjs \
  pipelines/relation/buff-npc-variant-empty-scope-candidate.test.mjs
```

### Task 2: Run the maintained Buff chain

**Files:** create `pipelines/buff/run-full-recrawl-canonical-isolated.mjs` and its test; use `pipelines/buff/buff-canonical-t1-acceptance.mjs`, `pipelines/import/import-buffs-to-db.mjs`, and `pipelines/relation/sync-maint-to-relation.mjs`

- [ ] Bind the exact full capture and run-derived T1 schemas through `runLiveAutomationAcceptance`.
- [ ] Call the maintained Buff importer and sync path; do not use old `recrawl_*` tables or direct pseudo-adapters.
- [ ] Read back landing `400`, maint/relation/projection parents, Item-Buff, NPC-Buff, and consumer rows with hashes and unresolved samples.
- [ ] Exercise rollback, commit, source acknowledgement ordering, and cleanup; keep `formalDatabaseWrites=false`.

### Task 3: Resolve data blockers and close the child

- [ ] Resolve or owner-dispose all 13 Item identities and the remaining shared-name NPC facts with fresh evidence.
- [ ] Create a new source/maint-bound correction plan for the `1340` mismatch and duplicate inflicts; do not reuse consumed decisions.
- [ ] Start the run-owned catalog API, read representative public/admin Buff responses and compare source item/NPC counts with isolated relation/projection rows, then stop and verify its process/port.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261016/buffs/<runKey>/isolated-real-ingestion.json`.
- [ ] Run focused Buff/live/authorization tests, `node --check`, and `git diff --check`; production remains blocked until the unresolved set is zero or explicitly approved under the current contract.
