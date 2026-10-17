# NPCs Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the revision-bound NPC source can traverse the maintained NPC base chain in isolated schemas while preserving the shared `npcs` ownership boundary.

**Architecture:** Use the existing repository-frozen 762-record standardized NPC dataset and standardized identity map; do not crawl Npcinfo in this bounded run. Seed only exact read-only Item/category dependencies, call the maintained NPC importer/sync, and read back NPC tables and API responses. Then run one isolated non-fixture V2 attempt through the registered NPC runner. Never overlap a Boss run because both own the shared `npcs` surface.

**Tech Stack:** `fetch-wiki-npcinfo.mjs`, `npc-canonical-t1-acceptance.mjs`, `import-independent-entities-to-db.mjs`, `sync-maint-to-relation.mjs`, NPC readiness/loot audits, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: NPC base facts, NPC maint/relation/projection rows owned by the NPC action, stable source IDs, and consumer API readback.
- Out of scope: formal `npcs` writes, Boss writes, production scheduler, and unproven loot rows. Loot is accepted only if the source contract names an NPC-owned partition and the isolated runner writes it through its maintained importer.
- Display names are never accepted as identity. The child must use stable NPC ID and source-page/revision bindings.
- The known shared-table predicate gap is a blocker: a full-table `npcs` scope or missing structured predicate cannot pass production-readiness.

## Tasks

### Task 1: Freeze source and owner predicate

**Files:** `data/standardized/npcs.standardized.json`, `data/standardized-view/npcs/_meta.json`, `data/generated/npc-standardized-map.json`, `pipelines/npc-canonical/npc-canonical-readiness.mjs`, `pipelines/automation/l2-policy-ceiling-artifact.mjs`, `pipelines/automation/table-ownership-matrix.test.mjs`

- [ ] Consume the NPC allocation manifest entry and verify its endpoint/DB/API port are empty and no Boss child or `npcs` writer is active.
- [ ] Bind `repository-frozen` `data/standardized/npcs.standardized.json` (762 records), `data/standardized-view/npcs/_meta.json`, and `data/generated/npc-standardized-map.json` by SHA-256 and source timestamp. No `data/wiki-crawler/canonical/npc/*.latest.json` files exist in this execution worktree; do not reference them.
- [ ] Produce a structured owner predicate naming database role, columns, stable numeric NPC ID predicate, and excluded rows. No live crawl is needed for the isolated source lane, so this does not claim a fresh upstream revision.
- [ ] Reject a source bundle that contains duplicate stable IDs, display-name-only identity, or a predicate broader than the approved NPC scope.
- [ ] Create the NPC dependency manifest for exact Item/category/source rows and call the common exact-key dependency seeder before the first business DML.

```bash
node --test pipelines/npc-canonical/npc-canonical-t1-acceptance.test.mjs \
  pipelines/automation/table-ownership-matrix.test.mjs \
  pipelines/automation/l2-policy-ceiling-artifact.test.mjs
```

### Task 2: Run the maintained NPC chain in isolation

**Files:** `pipelines/npc-canonical/npc-canonical-t1-acceptance.mjs`, `pipelines/import/import-independent-entities-to-db.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`

- [ ] Create `pipelines/npc-canonical/run-full-recrawl-canonical-isolated.mjs` and its test using the shared three-schema provisioner and manifest entry.
- [ ] Seed only readonly Item/category dependencies; write NPC-owned landing/maint/relation/projection rows through the maintained entrypoints.
- [ ] Acquire an isolated `npcs` fence before apply and release it after independent readback; fail closed when the fence is occupied or ownership differs.
- [ ] Exercise transaction rollback and a simulated concurrent Boss admission; prove no overlap and no unrelated row deletion.

### Task 3: Read back API and cleanup

- [ ] Compare before/after row hashes for NPC IDs, source revisions, relation rows, and declared projections.
- [ ] Read representative public/admin NPC responses through the run-owned API and verify stable IDs, localized fields, and relation counts match the isolated database; stop the API and verify its exact port/process.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for NPCs; require the registered NPC automatic runner, a non-fixture attempt, nonzero NPC-owned rows, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup.
- [ ] Verify run-derived schemas, temporary accounts, manifest endpoint/DB, child processes, and fences are zero after cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261017/npcs/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run the NPC T1 suite, ownership matrix tests, focused relation tests, `node --check`, and `git diff --check`.
- [ ] Mark `passed` only with a structured NPC predicate and independent readback; keep the child blocked if shared-table ownership remains unproven.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered NPC runner, commits nonzero NPC-owned rows, independently reads them back, and acknowledges the same source/attempt identity. The following Boss run starts only after NPC API/process/fence/resource cleanup passes.
