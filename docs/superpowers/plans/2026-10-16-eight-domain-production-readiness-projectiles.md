# Projectiles Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the current Projectile source can write the maintained Projectile chain in isolated schemas and preserve exact Item/NPC source relations.

**Architecture:** Capture Projectileinfo, resolve source relations only from explicit `projectileId`/`shoot` fields, call the existing Projectile T1 importer and maint/relation sync, and read back Projectile rows and relation/API consumers. Consume the Projectile resource and API entries from the master allocation manifest.

**Tech Stack:** `fetch-wiki-projectileinfo.mjs`, `projectile-canonical-t1-acceptance.mjs`, `sync-landing-to-maint.mjs`, `sync-maint-to-relation.mjs`, `projectile-source-relations-milestones.md`, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Projectile base rows, maint/relation rows, Item/NPC source relations, and consumer readback.
- Out of scope: formal schemas, production scheduler, inferred relations, or broad NPC table writes.
- `aiStyle`, display name, URL text, and generic fallback are forbidden as relation evidence.
- A no-op historical scheduler result is not this child’s acceptance. The isolated run must write real rows into empty run-derived schemas and read them back.

## Tasks

### Task 1: Freeze and validate source

**Files:** `pipelines/fetch/fetch-wiki-projectileinfo.mjs`, `pipelines/lib/projectile-name-resolver.mjs`, `docs/plans/projectile-source-relations-milestones.md`

- [ ] Consume the Projectile allocation manifest entry and verify endpoint/DB/API-port emptiness and no active Item/NPC writer conflict.
- [ ] Bind Projectileinfo/local source evidence with stable source IDs, revision/hash, and terminal progress.
- [ ] Default to `repository-frozen` `data/standardized/projectiles.standardized.json` and `data/standardized-view/projectiles/`; bind their hashes and explicit source-relation fields before import.
- [ ] Build an explicit source-relation manifest from Item `shoot`/`projectileId` and NPC `raw_json.wikiCrawler.combat.projectileId` or `raw_json.combat.projectileId` only.
- [ ] Fail closed with sampled unresolved rows when an explicit relation field is missing; do not infer from `aiStyle`.
- [ ] Create the Projectile dependency manifest for exact Item/NPC rows used by explicit source relations and call the common exact-key dependency seeder before the first business DML.

```bash
node --test pipelines/fetch/fetch-wiki-projectileinfo.test.mjs \
  pipelines/lib/projectile-name-resolver.test.mjs \
  pipelines/projectile/projectile-canonical-t1-acceptance.test.mjs
```

### Task 2: Run maintained Projectile ingestion

**Files:** `pipelines/projectile/projectile-canonical-t1-acceptance.mjs`, `pipelines/maint/sync-landing-to-maint.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`

- [ ] Create `pipelines/projectile/run-full-recrawl-canonical-isolated.mjs` and its test using a run-derived three-schema set.
- [ ] Seed the exact Item/NPC dependency manifest through the formal snapshot account and common dependency seeder; call `runProjectileCanonicalT1Acceptance`, `runMaintSync`, and `runSync` with the real frozen bundle.
- [ ] Verify the declared owned-table set before transaction and reject any mutation outside it.
- [ ] Execute rollback, commit, and independent row-hash readback.

### Task 3: Read back consumers and clean resources

- [ ] Verify every accepted Item/NPC relation has a stable source identity and the exact source field that created it.
- [ ] Read representative Projectile API/admin responses through the run-owned API and compare relation counts/source IDs with the isolated relation database; stop the API and verify its exact port/process.
- [ ] Verify derived schemas/accounts, manifest endpoint/DB, processes, and temporary ports are zero after cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261016/projectiles/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run the Projectile T1 suite, source relation tests, focused maint/relation tests, `node --check`, and `git diff --check`.
- [ ] Mark the child blocked when any relation relies on a display-name or `aiStyle` fallback, even if row counts look complete.
