# Projectiles Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the current Projectile source can write the maintained Projectile chain in isolated schemas and preserve exact Item/NPC source relations.

**Architecture:** The normal hybrid rule probes `Module:Projectileinfo/data` first. For the current baseline, the user has directed continued offline testing while the shared Wiki API remains unavailable; use the fixed local 1,111-record standardized source and view metadata with `sourceMode=local-offline-authorized` and `wikiUnchanged=false`, retaining the prior shared-outage evidence. Resolve relations only from explicit `projectileId`/`shoot` fields in exact read-only maintained Item/NPC dependencies, call the maintained importer and maint/relation sync, and read back consumers. Existing maintained Item facts contain 726 explicit projectile references: 720 resolve to this pinned corpus and 6 target IDs are absent (`1112/1113/1117/1118/1119/1122`). Preserve those six as unresolved audits and report relation coverage as partial; never infer a replacement. The current maintained NPC source has zero explicit Projectile fields, so NPC Projectile relation coverage is `0` and no broad NPC rows are copied. The baseline can establish the full Projectile write chain but not complete relation closure. V2 remains deferred.

**Tech Stack:** `projectile-offline-source.mjs`, `run-full-recrawl-canonical-isolated.mjs`, `importProjectiles`, `runLandingImport`, `runMaintSync`, `sync-maint-to-relation.mjs`, `sync-projection-to-local-core-tables.mjs`, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Projectile base rows, maint/relation rows, Item/NPC source relations, and consumer readback.
- Out of scope: formal schemas, production scheduler, inferred relations, or broad NPC table writes.
- `aiStyle`, display name, URL text, and generic fallback are forbidden as relation evidence.
- A no-op historical scheduler result is not this child’s acceptance. The isolated run must write real rows into empty run-derived schemas and read them back.

## Current Authorized Execution

- The registered NPC source probe received two Wiki HTTP 502 maintenance responses, and the user directed the remaining domain baselines to continue on local sources while Wiki is unavailable. This Projectile run uses that explicit offline direction; it does not claim a fresh Projectile Wiki fingerprint.
- Bind the local standardized Projectile source and view metadata against the fixed execution-manifest SHA values and the prior `wiki.module.projectileinfo` manifest record. Evidence must say `sourceMode=local-offline-authorized` and `wikiUnchanged=false`.
- Relation inputs are read only from the formal `terria_v1_maint.maint_items` and `maint_npcs` rows through the exact snapshot account. The preflight inventory found 726 Item rows with `raw_json.shoot`, six absent target IDs, and no NPC rows with an explicit Projectile field. The six missing target IDs remain audit rows; no `aiStyle`, display-name, or URL inference is permitted.
- Formal schemas remain read-only. T1 source acknowledgement, V2, release gates, and other domains are outside this baseline.

## Tasks

### Task 1: Freeze and validate source

**Files:** `pipelines/fetch/fetch-wiki-projectileinfo.mjs`, `pipelines/lib/projectile-name-resolver.mjs`, `docs/plans/projectile-source-relations-milestones.md`

- [x] Consume the Projectile allocation manifest entry and verify endpoint/DB/API-port emptiness and no active Item/NPC writer conflict.
- [x] Bind `repository-frozen` `data/standardized/projectiles.standardized.json` (1,111 records) and `data/standardized-view/projectiles/_meta.json` by SHA-256, upstream timestamp, and exact source-manifest identity before import. Do not start a source crawler.
- [x] Bind the user-authorized offline source decision to the local inputs and prior `wiki.module.projectileinfo` source identity; record `wikiUnchanged=false`.
- [x] Build an explicit source-relation manifest from exact formal `maint_items.raw_json.shoot` and `maint_npcs.raw_json` fields only. Record 726 Item references, 720 in-corpus matches, six missing target IDs, and zero NPC Projectile fields.
- [x] Preserve unresolved relation targets as audit rows; do not infer from `aiStyle`, display names, or URLs. Relation coverage remains partial while any explicit target ID is absent from the 1,111-record source.
- [x] Create the Projectile dependency manifest for only the exact maintained Item rows with explicit `shoot` references and call the common exact-key dependency seeder before the first business DML. Do not seed broad NPC rows when no explicit NPC Projectile source field exists.

```bash
node --test pipelines/fetch/fetch-wiki-projectileinfo.test.mjs \
  pipelines/lib/projectile-name-resolver.test.mjs \
  pipelines/automation/eight-domain-dependency-seeder.test.mjs \
  pipelines/projectile/projectile-canonical-t1-acceptance.test.mjs \
  pipelines/projectile/projectile-offline-source.test.mjs \
  pipelines/projectile/run-full-recrawl-canonical-isolated.test.mjs
```

### Task 2: Run maintained Projectile ingestion

**Files:** `pipelines/projectile/projectile-canonical-t1-acceptance.mjs`, `pipelines/maint/sync-landing-to-maint.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`

- [x] Create `pipelines/projectile/run-full-recrawl-canonical-isolated.mjs` and its test using a run-derived three-schema set.
- [x] Seed the exact maintained Item dependency manifest through the formal snapshot account and common dependency seeder; call `runLandingImport`, `importProjectiles`, `runMaintSync`, and `runSync` with the real 1,111-record bundle. The existing `runProjectileCanonicalT1Acceptance` remains the two-record fixture lane and does not satisfy this full-source run.
- [x] Declare the owned-table allowlist before writes, snapshot run schemas, and reject any changed table outside the allowlist after the chain. The observed write set is recorded in the report.
- [x] Pass the T1 rollback/commit/restore probes and independently read back row hashes.

### Task 3: Read back consumers and clean resources

- [x] Verify every accepted Item/NPC relation has a stable source identity and the exact source field that created it.
- [x] Read representative public/admin Projectile API responses through the run-owned API and verify their stable entity identities. Independently compare relation counts and source IDs in the isolated relation schema against the exact source-relation manifest. The current API exposes no relation-backed Projectile route, so do not claim API relation parity; keep that follow-up open.
- [x] Do not run V2 in this T1 baseline. Keep V2 authorization, exact source/attempt acknowledgement, and scheduler acceptance deferred.
- [x] Verify derived schemas/accounts, manifest endpoint/DB, processes, and temporary ports are zero after cleanup.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/projectiles/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [x] Run the Projectile T1 suite, source relation tests, focused maint/relation tests, `node --check`, and `git diff --check`.
- [x] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered Projectile automatic runner, commits nonzero Projectile-owned rows and explicit relations, independently reads them back, and acknowledges the same source/attempt identity.
- [x] Confirm no relation relies on a display-name or `aiStyle` fallback. The six missing Projectile IDs remain explicit unresolved audits and relation coverage remains partial.
