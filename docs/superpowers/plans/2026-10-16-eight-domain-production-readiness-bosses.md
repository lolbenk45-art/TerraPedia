# Bosses Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Boss source records can traverse the maintained Boss import and projection chain in isolated schemas without overlapping NPC ownership.

**Architecture:** Capture the Boss bundle and stable NPC mapping, serialize the isolated `npcs` fence with the NPC child, run `runBossCanonicalT1Acceptance` or its maintained importer in caller-owned transaction mode, and independently read back Boss groups, members, images, and API output. Consume the Boss Redis/API resources from the master allocation manifest.

**Tech Stack:** `fetch-wiki-bosses.mjs`, `boss-canonical-t1-acceptance.mjs`, `import-wiki-bosses-to-db.mjs`, Boss owner/image helpers, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Boss source records, Boss groups/members, declared image/reference fields, NPC stable identity mapping, and public/admin consumer readback.
- Out of scope: formal `npcs` writes, production MinIO writes, Boss loot rows unless explicitly owned by the Boss bundle, and scheduler activation.
- Boss and NPC runs cannot execute concurrently because both can touch `npcs`; the master order runs NPCs before Bosses and records the fence handoff.
- `runBossImport` must not write the formal database. Its primary-DB guard must be extended with an explicit isolated-target contract rather than an unconstrained `allowNonPrimaryDb` flag.

## Tasks

### Task 1: Capture Boss source and ownership

**Files:** `pipelines/fetch/fetch-wiki-bosses.mjs`, `pipelines/boss/boss-canonical-t1-acceptance.mjs`, `pipelines/import/import-wiki-bosses-to-db.mjs`, `pipelines/import/boss-import-strict-mode.mjs`

- [ ] Consume the Boss allocation manifest entry and confirm no NPC writer or shared fence is active.
- [ ] Bind Boss records with page/revision/hash, stable Boss code, member NPC IDs, and image-source evidence.
- [ ] Default to `repository-frozen` `data/generated/wiki-bosses.latest.json` and the tracked NPC identity map; a bounded live capture is optional and must produce a new source submanifest.
- [ ] Reject display-name-only member mapping, generic NPC fallback, duplicate Boss codes, and unresolved member IDs.
- [ ] Freeze a read-only NPC dependency snapshot and a run-owned image policy.
- [ ] Create the Boss dependency manifest for exact NPC/member/image rows and call the common exact-key dependency seeder before the first business DML.
- [ ] Consume the Boss entry from `object-store-allocation-manifest.json`; allocate a run-owned MinIO bucket/prefix or an explicitly read-only image policy, and record object-store identity/before-object hash. Formal bucket/prefix and production endpoint are forbidden.

```bash
node --test pipelines/fetch/fetch-wiki-bosses.test.mjs \
  pipelines/fetch/fetch-wiki-bosses-progress.test.mjs \
  pipelines/boss/boss-canonical-t1-acceptance.test.mjs \
  pipelines/import/boss-import-strict-mode.test.mjs
```

### Task 2: Run maintained Boss ingestion

**Files:** create `pipelines/boss/run-full-recrawl-canonical-isolated.mjs`, create its test, modify `pipelines/import/import-wiki-bosses-to-db.mjs`

- [ ] Provision run-derived schemas and invoke the maintained Boss importer with an injected connection and isolated image uploader/read-only fixture.
- [ ] Acquire the shared `npcs` fence, run the transaction, verify receipts, commit, and release only after readback.
- [ ] Run rollback and concurrent-NPC admission probes; confirm no cross-owner deletion or overwrite.
- [ ] Reject any attempt to create a production MinIO object or formal table row.
- [ ] Read back Boss image receipts/object-list hashes from the run-owned object store and remove only the run-owned objects after API readback.

### Task 3: Read back consumers and clean resources

- [ ] Compare Boss group/member/image row hashes and stable NPC IDs across local/maint/relation/projection layers.
- [ ] Start the run-owned catalog API, read representative Boss API/admin DTOs and verify member IDs/names/image policy, then stop and verify its exact process/port.
- [ ] Verify schemas/accounts, manifest Redis endpoint/DB, fence, processes, ports, and object-storage artifacts are zero after cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261016/bosses/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run Boss focused tests, ownership matrix tests, image contract tests, `node --check`, and `git diff --check`.
- [ ] Keep Boss blocked if the NPC shared-table predicate or member identity cannot be independently proven.
