# Armor Sets Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an offline, isolated T1 baseline for Armor Sets using the available local source facts, with independent database/API readback and explicit partial-image coverage.

**Architecture:** Use only hash-bound repository-local source files and record `sourceMode=local-offline-authorized`, `wikiUnchanged=false`. Do not call Wiki or image URLs. Run the maintained landing-to-maint transform for the 64 standardized Armor facts, then an Armor-only relation/projection apply, run-owned API readback, and cleanup. Keep missing image coverage visible and keep all formal schemas read-only. V2 and production admission are separate outcomes.

**Source inventory correction (2026-10-22):** `data/standardized/armor_sets.standardized.json` contains 64 records, including `ArmorSetBonus.Shroomite`, and binds Module:ArmorSetBonuses revision `964993` (`2026-01-31T20:21:00Z`). The 88-record Wiki page bundle and 151-row definition map are available locally. The local image artifact contains 290 rows; exact `textKey` matching yields 175 rows over 33/64 standardized keys. Shroomite is present in the set source and Wiki page bundle but absent from the cached-image artifact. The exact positive referenced Item ID closure is 243 IDs. Bind these actual files by SHA-256 at execution; do not reuse the prior 63/64 audit claim or its image hash.

The image artifact's `cachedUrl` values are outside this run's object-store allocation. Set them to `null` in the private T1 payload, do not upload/download binaries, and report `imageBinaryStatus=not-run` plus the 31/64 missing stable image keys. This is expected partial coverage, not a reason to skip the core T1 run and not evidence of production image readiness.

**Tech Stack:** local Armor JSON inputs, `pipelines/maint/sync-landing-to-maint.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`, isolated T1/API runner, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: hash-bound local source manifest; 64 `maint_armor_sets` rows; exact read-only Item dependency seeding; Armor-owned relation/projection rows; metadata-only image rows; isolated public/admin API readback; independent row-hash verification and cleanup.
- Out of scope: live Wiki probing/fetching, image downloads/uploads or managed-image receipts, canonical Armor operations, broad `maint_items` writes, V2 attempts, scheduler activation, formal writes, and production readiness.
- Missing Item identities and missing image identities must remain explicit in the report. Do not guess by display name, synthesize missing facts, or count seeded dependencies as Armor-owned writes.
- The relation writer must clear/write only Armor-owned tables. The API must resolve `TERRAPEDIA_DB_RELATION` for projection reads so the isolated API cannot fall through to `terria_v1_relation`.

## Tasks

### Task 1: Bind the local source and dependencies

**Files:** source-manifest builder/test under `pipelines/armor/`; `pipelines/maint/sync-landing-to-maint.mjs`; existing Armor source files

- [x] Bind the standardized Armor, standardized-view metadata, Wiki page bundle, definition map, and parsed image artifact by current SHA-256; confirm 64 set records, 88 page records, 151 map rows, 243 unique positive Item IDs, and 175 exact image rows over 33 set keys.
- [x] Build a private run source manifest with the exact source revisions/hashes, all 64 set identities, all 243 dependency IDs, the 175 matched image metadata rows, and the 31 unmatched image keys. Record the Shroomite set as present and its cached-image fact as absent.
- [x] Sanitize every selected image's `cachedUrl` to `null`; preserve source-file title/original URL metadata only. The T1 runner performs no Wiki/image fetch and creates no production object URL.
- [x] Freshly preflight MySQL UUID and formal-schema fingerprints; verify all run-derived schemas/accounts are absent, Redis DB1-8 are empty (including allocation DB6), API port 18280 is free, the Armor MinIO prefix is empty, and no competing Armor writer exists.
- [x] Seed and hash/read back exactly 243 local Item and 243 maint Item dependencies by stable ID; no missing IDs or name fallback.
- [x] No crawler/fetch script or canonical `data/generated/wiki-source-manifest.latest.json` or source progress file was used.

```bash
node --test pipelines/armor/armor-canonical-t1-acceptance.test.mjs
```

### Task 2: Execute the maintained isolated chain

**Files:** create `pipelines/armor/armor-canonical-t1-acceptance.mjs` and test; update `pipelines/relation/sync-maint-to-relation.mjs` with an Armor-only apply plan; create `pipelines/armor/run-armor-full-recrawl-canonical-isolated.mjs` and test

- [x] Run the existing `runMaintSync` transform for only `armor_sets` and `armor_set_images`, supplying the immutable local source manifest as landing rows.
- [x] Use an Armor-only `runSync` apply plan whose clear/write allowlist contains only Armor set, Armor set item, Armor set image, Armor attribute, equipment-effect, and Armor projection tables. Focused tests pass; the T1 run wrote no unrelated relation/projection rows.
- [x] Bind the exact dependency-manifest hash and source-manifest hash into `isolated-real-ingestion.json`. Record transaction status, table counts, stable identity checks, and independent row hashes for every written/seeded Armor or dependency table.
- [x] Preserve exact missing image identities in the artifact and read back all 64 sets/494 members/175 image rows with no silent source drops. Attribute/effect rows remain zero because no source facts were bound; this T1 run clears no source/effect ownership blocker.
- [x] Do not call the formal canonical Armor packet, production permit, crawler, or source acknowledgement path.

### Task 3: Isolated API readback and cleanup

- [x] Make Armor public/admin projection readers resolve `terraria.crawler.cross-db.relation-database` (bound from `TERRAPEDIA_DB_RELATION`), defaulting to `terria_v1_relation`; focused tests prove both readers bind this property.
- [x] Start the run-owned catalog API in `consumer-readback` mode; public list, Shroomite detail, and authenticated admin list returned HTTP 200. List totals are 64 and every returned list identity is in the exact source key set.
- [x] Stop the run-owned API and independently verify its port is free. Run schemas/accounts, Redis DB1-8, and Armor MinIO prefix are all empty/absent after cleanup.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/armor_sets/e8p_c53071f9272a09c4/isolated-real-ingestion.json` with `sourceMode=local-offline-authorized`, `wikiUnchanged=false`, `imageBinaryStatus=not-run`, exact source revisions/hashes and formal fingerprints.

### Task 4: Validate and record the partial baseline

- [x] Run Armor T1 source/API tests (`4/4` across the three Armor-specific test files), relation sync tests (`52/52`), focused Armor API Java tests, syntax checks, and `git diff --check`.
- [x] Report maintained T1 `passed` separately from 31 missing image keys, `imageBinaryStatus=not-run`, `v2AutomaticIngestionStatus=not-run-by-request`, and `productionReadinessStatus=blocked`.
- [x] Preserve formal blockers: source freshness/parity, partial image metadata/binary coverage, ownership/source-evidence admission. The 243 exact Item IDs all resolved; this T1 result does not clear production blockers.
