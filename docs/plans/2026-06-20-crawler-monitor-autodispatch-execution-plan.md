# Crawler Monitor Auto Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a safe crawler monitor auto-dispatch path that compares upstream wiki/API fingerprints against the latest proven local ingestion fingerprint, dispatches only changed covered domains, and does not hide failed crawls behind a refreshed detection snapshot.

**Architecture:** Keep the current `CrawlerMonitorServiceImpl` dispatch engine as the only task launcher. Change source-update detection so wiki `changed` means `upstream fingerprint != ingested fingerprint`, add a scheduled sweep that runs detection with progress, then dispatches de-duplicated actions through the existing engine. Persist admin settings and last sweep state in separate files to avoid scheduler/admin write races.

**Tech Stack:** Spring Boot scheduling + existing Java service/controller/DTO tests, Node ESM scripts with `node:test`, Nuxt/Vue admin page contract tests.

---

## 0. Review Repairs Locked Into This Plan

This plan replaces the previous draft's unsafe assumptions.

- V1 supports **changed-only mode only**. The user's requirement is "有变化才爬"; `always` is removed to avoid semantic drift.
- Auto eligibility is not "all `wikiDomain()==true`". It is **only domains whose `sourceKey` is covered by source-update detection and whose action has a monitor-visible progress path**.
- Dispatch is grouped by `actionId`, not by domain. `items` / `npcs` / `projectiles` all map to `wiki-core-refresh`, so one sweep may report multiple changed domains but must launch that action once.
- `wiki-source-manifest.latest.json` is not blindly accepted as "真实入库数据". Task 1 verifies the manifest advancement point. If it advances before the user-visible data chain succeeds, Task 1 must repair the source chain before auto dispatch is enabled.
- `buildManifestRecordMap()` is not used as `sourceKey -> record`. It currently maps composite `record.key -> record`; this plan adds an explicit `sourceKey` index.
- **Page identity (review C1):** one `sourceKey` can hold records for different pages. `wiki.page.biomes_anchor` holds both `"Biomes"` and `"Forest"` records; detection fetches `"Forest"`. Ingested-record lookup must match by page identity (`locator` ↔ `pageTitle`/`requestedPageTitle`), not by newest-for-sourceKey, or biomes reports perpetual change.
- **Compare-field by record shape (review C2):** `wiki.page.template_getbuffinfo` (buffs) is detection-categorized `wiki_page` but seeded as a module record with a real `contentHash`. The comparator picks its field from the manifest record's actual fields (contentHash > revisionId > revisionTimestamp), never from the detection `category`.
- Running `check-source-updates.mjs` from scheduler is crawler/fetch work. It must write monitor-visible progress before the first network request, heartbeat during work, and final `completed` / `failed` status.
- Settings and last sweep state are split:
  - `reports/crawler-monitor/auto-dispatch.config.json`: admin-owned settings.
  - `reports/crawler-monitor/auto-dispatch.last-sweep.json`: scheduler-owned decision record.

---

## 1. Source Of Truth And Scope

### In Scope

- A2 comparison: upstream wiki/API fingerprint vs proven local ingestion fingerprint.
- Covered v1 source keys:
  - `wiki.module.iteminfo` -> `items` -> `wiki-core-refresh`
  - `wiki.module.npcinfo` -> `npcs` -> `wiki-core-refresh`
  - `wiki.module.projectileinfo` -> `projectiles` -> `wiki-core-refresh`
  - `wiki.module.armorsetbonuses` -> `armor_sets` -> `domain-source-armor-sets`
  - `wiki.page.template_getbuffinfo` -> `buffs` -> `buff-page-immunity-refresh`
  - `wiki.page.biomes_anchor` -> `biomes` -> `biome-sync`
- Admin setting:
  - `enabled: boolean`
  - `mode: "changed-only"` only
  - `sweepIntervalMinutes: positive integer`, default `60`
- Frontend switch and last sweep display on `data-query-app/pages/operations/crawler-monitor.vue`.

### Out Of Scope

- Per-domain auto-dispatch config.
- `always` mode.
- Auto-dispatching `recipes`, `bosses`, `town_npc_maintenance`, `shimmer`, `npc_loot`, or `boss_loot` until each has a covered source-update detector and progress-safe action path.
- Replacing the existing dispatch lock, cooldown, child process launch, or watchdog engine.

### Closure Definition

The work is complete only when these are all true:

- With config missing or disabled, scheduler never dispatches and overview remains equivalent to current manual behavior.
- With config enabled and all covered source fingerprints matching local ingestion fingerprints, scheduler dispatches nothing.
- With one or more covered sources changed, scheduler runs detection, groups changed domains by `actionId`, and launches each action at most once through `dispatchWikiMonitorTask`.
- If a dispatch fails before the ingestion fingerprint advances, the next detection still reports the source as changed.
- Detection progress is visible at `data/generated/source-update-monitor-progress.latest.json`.
- `source-update-monitor-check` appears in `overview.registeredTasks` with parsed progress state, even when its progress file is missing.
- Backend tests, Node tests, frontend contract tests, and a local manual smoke all pass.

---

## 2. File Map

### Node Detection And Manifest Chain

- Modify `scripts/data/lib/wiki-sync-manifest.mjs`
  - Add explicit `buildManifestRecordsBySourceKey(manifest)` and page-identity-aware `resolveIngestedRecord(manifest, { sourceKey, locator })`.
  - Add shared manifest advancement helper for covered sources so all owners write the same record shape.
- Modify `scripts/data/lib/wiki-item-utils.mjs`
  - Add `fetchWikiPageRevisionMetadata({ pageTitle, apiUrl, fetchWikiApiJsonImpl })` returning `revisionId` and `revisionTimestamp`.
  - Reuse existing `fetchWikiModuleContent` (`:83`) for module/buffs content hashing (no new fetch needed).
- Create `scripts/data/monitor/source-update-comparison.mjs`
  - Pure comparison helpers for tests and `check-source-updates.mjs`.
- Modify `scripts/data/monitor/check-source-updates.mjs`
  - Use ingestion manifest comparison for covered wiki sources.
  - Add progress writes.
  - Keep official feed comparison snapshot-based and non-dispatching.
- Create `scripts/data/monitor/check-source-updates.test.mjs`
  - Node tests for A2 comparison, sourceKey indexing, no-leak regression, and progress payload.
- Inspect `scripts/data/workflow/run-wiki-sync.mjs`
  - Remove or gate covered-source manifest saves from raw child-fetch completion.
- Modify the owner files named in Task 1
  - Advance `wiki-source-manifest.latest.json` only after each covered action's local ingestion boundary succeeds.

### Backend

- Modify `back/src/main/java/com/terraria/skills/SkillsBackApplication.java`
  - Add `@EnableScheduling`.
- Modify `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
  - Add auto-dispatch settings methods.
- Modify `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  - Config read/write.
  - Last sweep read/write.
  - Overview fields.
  - Scheduled sweep.
  - Action-level dispatch grouping.
  - Registered task for `source-update-monitor-check`.
  - Test-visible pure decision helpers.
- Modify `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
  - Add `lastSweep` to `WikiMonitorDTO`.
  - Add `autoDispatchReason` to `WikiMonitorDomainDTO`.
- Create `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorAutoDispatchDTO.java`
  - API DTO for GET/PUT settings.
- Modify `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
  - Add GET/PUT `/admin/crawler-monitor/auto-dispatch`.
- Modify `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
  - Service, sweep, grouping, and overview tests.
- Modify `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
  - API and permission tests.

### Frontend

- Modify `data-query-app/types/crawlerMonitor.ts`
  - Add auto-dispatch settings and last sweep types.
- Modify `data-query-app/pages/operations/crawler-monitor.vue`
  - Replace read-only pill with an operational card.
- Modify `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
  - Contract checks for fields, controls, save call, last sweep display.
- Modify `data-query-app/types/crawlerMonitor.typecheck.ts`
  - Add sample payload fields for `lastSweep`, `autoDispatchReason`, and auto-dispatch settings.

---

## 3. Execution Tasks

### Task 1: Define And Implement The Ingestion Fingerprint Owner

**Purpose:** Ensure the comparison basis really means "真实入库数据", not merely "latest raw fetch".

**Review finding (pre-confirmed):** `run-wiki-sync.mjs:496-499` advances the manifest (`updateManifestForEntity` + `saveWikiSourceManifest`) immediately after the action subprocess exits 0 (the raw fetch), before the parent action proves local ingestion success. That defeats A2: a raw fetch can succeed, downstream ingestion can fail, and future detection would incorrectly report "unchanged".

**Rule:** `data/generated/wiki-source-manifest.latest.json` is the sole authoritative ingested fingerprint store for covered auto-dispatch sources. Only the covered action owner may advance records, and only after that action's local user-visible ingestion boundary succeeds.

**Owner table:**

| Source keys | Owner | Manifest advancement boundary |
| --- | --- | --- |
| `wiki.module.iteminfo`, `wiki.module.npcinfo`, `wiki.module.projectileinfo` | `run-backend-data-refresh.mjs` action `wiki-core-refresh`, or a post-action manifest-finalize step called only after `wiki-core-refresh` exits 0 | Parent backend action completed; not child `run-wiki-sync` raw fetch completion |
| `wiki.module.armorsetbonuses` | `domain-source-armor-sets` direct action via shared manifest-finalize helper | `fetch-wiki-armor-sets.mjs` completed and wrote its local output/report |
| `wiki.page.template_getbuffinfo` | `buff-page-immunity-refresh` direct action via shared manifest-finalize helper | `fetch-wiki-buffs.mjs` completed and wrote evidence/progress output |
| `wiki.page.biomes_anchor` with locator `Forest` | `biome-sync` backend action/pipeline | `run-biome-sync-pipeline.mjs` completed successfully with fetch, transform, and DB import for apply mode |

**Files:**
- Modify: `scripts/data/lib/wiki-sync-manifest.mjs`
- Modify: `scripts/data/workflow/run-wiki-sync.mjs` (advancement currently at ~`:483-499`)
- Inspect: `scripts/data/workflow/run-backend-data-refresh.mjs`
- Modify: `scripts/data/workflow/run-backend-data-refresh.mjs` and the concrete action scripts it invokes for `wiki-core-refresh` and `biome-sync`
- Modify: direct fetch scripts for `domain-source-armor-sets` and `buff-page-immunity-refresh`
- Test: `scripts/data/workflow/run-wiki-sync.test.mjs`
- Test: `scripts/data/fetch/fetch-wiki-armor-sets.test.mjs` or a new adjacent armor manifest-finalize test
- Test: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- Test: biome pipeline manifest-finalize test adjacent to the biome pipeline script

- [ ] Step 1: Add shared helper `advanceWikiIngestionManifestForSource({ sourceKey, locator, entityFamily, sourceKind, outputPath, manifestPath })` in `wiki-sync-manifest.mjs`.
- [ ] Step 2: The helper reads the source output, computes the same `contentHash` rule used by seed/sync (`moduleContent ?? JSON.stringify(payload)`), preserves `revisionId`/`revisionTimestamp`, and writes a normalized manifest record with page identity fields.
- [ ] Step 3: Remove or gate covered-source manifest saves from `run-wiki-sync.mjs` raw child-fetch completion. `run-wiki-sync.mjs` may compute candidate fingerprints, but it must not save covered auto-dispatch records unless invoked as a manifest-finalize phase after the owning action succeeds.
- [ ] Step 4: Wire `wiki-core-refresh` owner so `iteminfo`/`npcinfo`/`projectileinfo` records advance only after the parent backend refresh action succeeds.
- [ ] Step 5: Wire `domain-source-armor-sets` so `wiki.module.armorsetbonuses` advances only after `fetch-wiki-armor-sets.mjs` succeeds and output/report are written.
- [ ] Step 6: Wire `buff-page-immunity-refresh` so `wiki.page.template_getbuffinfo` advances only after `fetch-wiki-buffs.mjs` succeeds and output/evidence are written.
- [ ] Step 7: Wire `biome-sync` so the `Forest` `wiki.page.biomes_anchor` record advances only after `run-biome-sync-pipeline.mjs` succeeds through fetch, transform, and DB import in apply mode.
- [ ] Step 8: Add regression tests:
  - `wiki-core-refresh`: child fetch succeeds but parent/backend action fails -> manifest unchanged.
  - `domain-source-armor-sets`: fetch fails -> manifest unchanged; fetch succeeds -> armor record advances.
  - `buff-page-immunity-refresh`: fetch succeeds -> `template_getbuffinfo` advances by `contentHash`.
  - `biome-sync`: fetch/transform succeeds but import fails -> `Forest` manifest record unchanged.
- [ ] Step 9: Run:

```bash
node --test scripts/data/workflow/run-wiki-sync.test.mjs
```

Expected: PASS, including manifest-not-advanced-on-failure cases.

**Do not continue to Task 2 until this task proves and implements the owner/boundary table.**

---

### Task 2: Add A Real SourceKey Manifest Index

**Purpose:** Fix the previous plan's incorrect assumption that `buildManifestRecordMap()` can be used as `sourceKey -> record`.

**Files:**
- Modify: `scripts/data/lib/wiki-sync-manifest.mjs`
- Test: `scripts/data/monitor/check-source-updates.test.mjs`

**CRITICAL — page-identity matching (review finding C1):** A single `sourceKey` can hold multiple manifest records for DIFFERENT pages. Verified: `wiki.page.biomes_anchor` holds both a `"Biomes"` record AND a `"Forest"` record (`seed-wiki-source-manifest.mjs` page-family seeding; manifest sample confirmed). Detection fetches the `"Forest"` page (`check-source-updates.mjs:107-112`, locator `"Forest"`). If lookup blindly "picks newest for the sourceKey" it may select the `"Biomes"` record and compare a Forest fingerprint against a Biomes fingerprint → perpetual `changed=true` → biome-sync dispatched every sweep. Lookup MUST resolve by page identity (the detection source's `locator` ↔ record `pageTitle`/`requestedPageTitle`), not by sourceKey alone.

- [ ] Step 1: Add `buildManifestRecordsBySourceKey(manifest)` that returns `Map<string, object[]>` keyed by `record.sourceKey`.
- [ ] Step 2: Add `resolveIngestedRecord(manifest, { sourceKey, locator })` that:
  - filters records by `sourceKey`,
  - **if a `locator` is given, first narrows to records whose `pageTitle` or `requestedPageTitle` equals the locator** (page-identity match — fixes biomes Forest/Biomes mix-up),
  - then among the remaining records picks the newest available timestamp: prefer `lastParsedAt`, then `lastFetchedAt`, then `revisionTimestamp`, then stable original order.
- [ ] Step 3: Keep a thin `latestManifestRecordForSourceKey(manifest, sourceKey)` only for sources with no page-identity concern (modules); covered page sources MUST go through `resolveIngestedRecord` with a locator.
- [ ] Step 4: Write tests with a fixture containing:
  - one module record with composite `key`
  - **two `wiki.page.biomes_anchor` records, `pageTitle:"Biomes"` and `pageTitle:"Forest"`; assert locator `"Forest"` resolves the Forest record, NOT the newer Biomes record**
  - one missing sourceKey lookup → null/undefined
- [ ] Step 5: Run the narrow test:

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs
```

Expected: PASS for sourceKey lookup, page-identity resolution, and duplicate selection.

---

### Task 3: Extract Pure A2 Comparison Helpers

**Purpose:** Make the no-leak behavior testable without network or filesystem.

**Files:**
- Create: `scripts/data/monitor/source-update-comparison.mjs`
- Test: `scripts/data/monitor/check-source-updates.test.mjs`

**CRITICAL — branch on the manifest RECORD shape, not the detection `category` (review finding C2):** `wiki.page.template_getbuffinfo` (buffs) is categorized `wiki_page` in `buildWikiSources()` but is seeded via the MODULE seed list, so its manifest record carries a real `contentHash` (not a revision). If the comparator picks its field by detection `category` it will try a revision compare against a hash-only record and mishandle buffs. The comparator MUST choose the compare field from what the resolved ingested record actually contains.

- [ ] Step 1: Create pure helper `compareWikiSourceFingerprint({ source, apiFingerprint, ingestedRecord })`. `apiFingerprint` carries both `{ contentHash?, revisionId?, revisionTimestamp? }` so the helper can pick the field that matches the record.
- [ ] Step 2: Return a normalized object with these fields:
  - `changed`
  - `status`
  - `currentValue`
  - `ingestedValue`
  - `previousValue`
  - `meta.compareBasis = "ingestion-manifest"`
  - `meta.compareField`
  - `meta.apiRevisionId`
  - `meta.ingestedRevisionId`
- [ ] Step 3: Implement rules — **select compare field by what `ingestedRecord` has, in this priority**:
  - missing/unresolved manifest record -> `changed=true`, `status="missing_ingestion_manifest"`
  - **record has non-null `contentHash`** -> compare `apiFingerprint.contentHash` vs `ingestedRecord.contentHash` (covers all modules AND buffs/template_getbuffinfo); equal -> `changed=false`, else `changed=true`, `meta.compareField="contentHash"`
  - **else record has `revisionId`** -> compare `revisionId`; `meta.compareField="revisionId"`
  - **else** -> compare `revisionTimestamp`; `meta.compareField="revisionTimestamp"`
  - if the matching API field is missing (couldn't fetch that fingerprint) -> caller sets `changed=false`, `status="error"` (never dispatch on an unknown)
- [ ] Step 4: Add tests:
  - equal module hash skips; different module hash changes
  - **buffs/template_getbuffinfo resolves via `contentHash` even though category is `wiki_page`**
  - missing manifest changes
  - unchanged manifest across two detections stays changed until manifest input changes
  - page (biomes/Forest) revisionId/revisionTimestamp fallback works
- [ ] Step 5: Run:

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs
```

Expected: PASS.

---

### Task 4: Convert `check-source-updates.mjs` To A2 And Add Progress

**Purpose:** Make source detection produce the semantics consumed by backend overview and auto-dispatch.

**Files:**
- Modify: `scripts/data/monitor/check-source-updates.mjs`
- Modify: `scripts/data/lib/wiki-item-utils.mjs`
- Test: `scripts/data/monitor/check-source-updates.test.mjs`

- [ ] Step 1: Import from `wiki-sync-manifest.mjs`: `loadWikiSourceManifest`, `resolveIngestedRecord` (Task 2), `latestManifestRecordForSourceKey`, `createContentHash`. Import from `wiki-item-utils.mjs`: `fetchWikiModuleContent` (already exists, `wiki-item-utils.mjs:83`) and the new `fetchWikiPageRevisionMetadata` (Task 4 Step 10 / wiki-item-utils change). Import the pure helper `compareWikiSourceFingerprint` from `source-update-comparison.mjs` (Task 3).
- [ ] Step 2: Import `buildActionProgressPayload` and `writeJsonFile` from `scripts/data/workflow/backend-refresh-runtime-state.mjs` (both exports confirmed present).
- [ ] Step 3: Add default progress path:

```text
data/generated/source-update-monitor-progress.latest.json
```

- [ ] Step 4: Add action id:

```text
source-update-monitor-check
```

- [ ] Step 5: Honor `--progress-path`. Default to `data/generated/source-update-monitor-progress.latest.json`. If an explicit non-default path is provided, write to it and mirror to the canonical monitor path unless the test uses an isolated temp `WORKTREE_ROOT`.
- [ ] Step 6: Every progress write must include the full contract payload:
  - `actionId`
  - `status`
  - `generatedAt`
  - `lastHeartbeatAt`
  - `childStatusPath`
  - `phase`
  - `message`
  - `current`
  - `total`
- [ ] Step 7: Write progress before the first network request:
  - `actionId: "source-update-monitor-check"`
  - `status: "running"`
  - `phase: "start"`
  - `message: "starting source update monitor check"`
  - `current: 0`
  - `total: sources.length`
  - `childStatusPath: progressPath`
- [ ] Step 8: After each source, update progress with incremented `current`, `phase: "fetch"`, a non-empty `message`, and refreshed `lastHeartbeatAt`.
- [ ] Step 9: On normal completion, write `status: "completed"`, `phase: "complete"`, final counts, and a non-empty `message`.
- [ ] Step 10: On uncaught failure, write `status: "failed"`, `phase: "failed"`, `message` with compact error, then rethrow or exit non-zero.
- [ ] Step 11: Build `apiFingerprint` per source as `{ contentHash?, revisionId?, revisionTimestamp? }` so Task 3's helper can pick the field matching the manifest record. For module sources (and buffs/`template_getbuffinfo`, which is a module-shaped record), fetch raw module content via `fetchWikiModuleContent(...)` and set `contentHash = createContentHash(moduleContent)`; also carry revision metadata when available.
- [ ] Step 12: For page sources, fetch revision metadata with the new `fetchWikiPageRevisionMetadata(...)` helper (add to `wiki-item-utils.mjs`, returning `{ revisionId, revisionTimestamp }`); set `revisionId`/`revisionTimestamp` on `apiFingerprint`.
- [ ] Step 13: Resolve the ingested record with `resolveIngestedRecord(manifest, { sourceKey: source.key, locator: source.locator })` (page-identity aware — Task 2), then call `compareWikiSourceFingerprint({ source, apiFingerprint, ingestedRecord })` to build each wiki source result. The compare FIELD is chosen by the record shape (contentHash > revisionId > revisionTimestamp), NOT by `source.category`.
- [ ] Step 14: Keep official source behavior snapshot-based and mark those sources non-dispatching.
- [ ] Step 15: Ensure output still writes `data/generated/source-update-monitor.latest.json` and a timestamped report under `reports/fetch`.
- [ ] Step 16: Add tests for:
  - default progress path
  - explicit `--progress-path`
  - canonical mirror behavior
  - required payload shape
  - final `completed` and `failed` status writes
- [ ] Step 17: Run:

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs
```

Expected: PASS, including progress path, progress shape, and no-leak tests.

---

### Task 5: Backend DTOs And Persistent Settings

**Purpose:** Add admin-owned settings without racing the scheduler's last-sweep writes.

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorAutoDispatchDTO.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Step 1: Add constants:

```java
private static final Path WIKI_MONITOR_AUTODISPATCH_CONFIG_FILE =
    Path.of("reports", "crawler-monitor", "auto-dispatch.config.json");
private static final Path WIKI_MONITOR_AUTODISPATCH_LAST_SWEEP_FILE =
    Path.of("reports", "crawler-monitor", "auto-dispatch.last-sweep.json");
```

- [ ] Step 2: Add `CrawlerMonitorAutoDispatchDTO` fields:
  - `enabled`
  - `mode`
  - `sweepIntervalMinutes`
  - `configFound`
  - `updatedAt`
  - `updatedBy`
  - `lastSweep`
- [ ] Step 3: Add exact last sweep DTO schema:
  - `at: string | null`
  - `trigger: string | null`
  - `message: string | null`
  - `detected: [{ domain, sourceKey, actionId, changed }]`
  - `dispatched: [{ actionId, domains, accepted, dispatchId, status, message }]`
  - `skipped: [{ domain, actionId, reason, message }]`
- [ ] Step 4: Add `WikiMonitorDTO.autoDispatchSettings` with the same settings DTO. Overview is the frontend source of truth for `enabled`, `mode`, `sweepIntervalMinutes`, `configFound`, and `lastSweep`.
- [ ] Step 5: Implement `getAutoDispatchSettings()`.
  - Missing config returns `enabled=false`, `mode="changed-only"`, `sweepIntervalMinutes=60`, `configFound=false`.
  - Read last sweep from the separate last-sweep file.
- [ ] Step 6: Implement `writeAutoDispatchSettings(Map<String,Object> payload)`.
  - Accept `enabled` boolean.
  - Accept `mode` only if absent or `"changed-only"`.
  - Accept `sweepIntervalMinutes` as integer from 5 to 1440.
  - Preserve scheduler-owned last sweep by not writing it into the config file.
- [ ] Step 7: Add tests:
  - missing config default
  - write then read
  - invalid mode rejected
  - invalid interval rejected
  - writing config does not delete existing last-sweep file
  - overview includes `wikiMonitor.autoDispatchSettings.sweepIntervalMinutes`
  - last sweep nested DTO serializes `detected`, `dispatched`, and `skipped` object fields exactly
- [ ] Step 8: Run:

```bash
cd back && mvn -q test -Dtest=CrawlerMonitorServiceImplTest
```

Expected: PASS.

---

### Task 6: Overview Auto Eligibility And UI Contract Data

**Purpose:** Ensure overview exposes safe auto-dispatch status and source-update monitor progress without marking unsupported domains eligible.

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Step 1: Add constants:

```java
private static final Path SOURCE_UPDATE_MONITOR_PROGRESS_FILE =
    Path.of("data", "generated", "source-update-monitor-progress.latest.json");
```

- [ ] Step 2: Add a backend helper for covered source keys:

```text
wiki.module.iteminfo
wiki.module.npcinfo
wiki.module.projectileinfo
wiki.module.armorsetbonuses
wiki.page.template_getbuffinfo
wiki.page.biomes_anchor
```

- [ ] Step 3: In `buildWikiMonitor`, read settings and last sweep once and pass them to domain builders.
- [ ] Step 4: Set monitor-level fields:
  - enabled config -> `autoDispatchEnabled=true`, `dispatchMode="changed-only"`
  - missing/off config -> current manual defaults
  - set `autoDispatchSettings`
  - include `lastSweep`
- [ ] Step 5: In each domain:
  - supported source key + config enabled -> `autoEligible=true`
  - unsupported source key -> `autoEligible=false`, reason like `unsupported source detector`
  - config disabled -> current manual defaults
- [ ] Step 6: Keep `requiresApproval=true` for manual UI, but add text/state making clear auto mode can dispatch without manual approval only for covered eligible domains.
- [ ] Step 7: Set `autoDispatchReason` for each domain:
  - enabled + covered + changed -> `eligible changed source`
  - enabled + covered + unchanged -> `no upstream change`
  - enabled + unsupported -> `unsupported source detector`
  - disabled -> `auto dispatch disabled`
- [ ] Step 8: Register source-update monitor progress:
  - read `SOURCE_UPDATE_MONITOR_PROGRESS_FILE` in `buildRegisteredTasks(...)`
  - add `buildSourceUpdateMonitorCheckTask(repoRoot, sourceUpdateMonitorProgress)`
  - task id `source-update-monitor-check`
  - label `Source update monitor check`
  - lane `fetch`
  - priority `p0`
  - progressPath `data/generated/source-update-monitor-progress.latest.json`
  - outputPath `data/generated/source-update-monitor.latest.json`
  - reportPath pattern `reports/fetch/source-update-check-*.json`
  - dataStage `wiki/API fingerprints -> source update monitor snapshot`
  - nextStep `Auto-dispatch eligible changed wiki domains after detection completes`
- [ ] Step 9: Reuse existing task progress helpers (`copyTaskProgressFromPayload`, `applyReadableProgressState`, and existing progress metadata helpers) so payload fields map to `status`, `current`, `total`, `progressHeartbeatAt`, `progressKind`, and stale state.
- [ ] Step 10: Add tests:
  - enabled config marks only covered domains eligible
  - `bosses`, `shimmer`, `town_npc_maintenance`, `recipes` stay ineligible
  - missing config preserves old hard-coded OFF behavior
  - lastSweep appears in overview
  - `source-update-monitor-check` appears in `registeredTasks` when progress exists
  - missing progress still shows `source-update-monitor-check` as `missing`, not absent
  - progress payload fields map to task status/current/total/heartbeat/stale state
- [ ] Step 11: Run:

```bash
cd back && mvn -q test -Dtest=CrawlerMonitorServiceImplTest
```

Expected: PASS.

---

### Task 7: Scheduled Sweep And Action-Level Dispatch Grouping

**Purpose:** Add automatic dispatch without bypassing locks, cooldowns, progress, or action de-duplication.

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/SkillsBackApplication.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Step 1: Add `@EnableScheduling` to `SkillsBackApplication`.
- [ ] Step 2: Add `runAutoDispatchSweep()` with `@Scheduled(fixedDelay = 60000)`.
- [ ] Step 3: Add a guard that returns early if:
  - config missing
  - config disabled
  - not enough minutes elapsed since last sweep
  - another sweep is already running
- [ ] Step 4: Launch detection with `processLauncher.launch(...)`:

```text
node scripts/data/monitor/check-source-updates.mjs --progress-path=data/generated/source-update-monitor-progress.latest.json
```

- [ ] Step 5: Wait for detection process exit before dispatching.
- [ ] Step 6: If detection exits non-zero, write lastSweep with `message="detection failed"` and dispatch nothing.
- [ ] Step 7: Read `data/generated/source-update-monitor.latest.json`.
- [ ] Step 8: Build candidates from covered eligible domains. Do not include unsupported source keys.
- [ ] Step 9: In changed-only mode, only candidates with `changed=true` can dispatch.
- [ ] Step 10: Group candidates by `actionId`.
  - If several domains share one action, one dispatch is launched.
  - `lastSweep.detected` writes objects `{ domain, sourceKey, actionId, changed }`.
  - `lastSweep.dispatched` writes objects `{ actionId, domains, accepted, dispatchId, status, message }`.
  - `lastSweep.skipped` writes objects `{ domain, actionId, reason, message }`.
- [ ] Step 11: Call existing `dispatchWikiMonitorTask(repoRoot, representativeRule, Map.of("trigger","auto", ...))`.
- [ ] Step 12: Record rejected dispatch results as skipped with engine reason:
  - cooldown
  - locked
  - already running
- [ ] Step 13: Write scheduler-owned `auto-dispatch.last-sweep.json` atomically.
- [ ] Step 14: Add tests with a fake `ProcessLauncher`:
  - disabled config launches nothing
  - detection failure launches no dispatch
  - unchanged sources launch no dispatch
  - changed `items+npcs+projectiles` launches one `wiki-core-refresh`
  - cooldown rejection appears in skipped
  - unsupported changed source is skipped as unsupported
- [ ] Step 15: Run:

```bash
cd back && mvn -q test -Dtest=CrawlerMonitorServiceImplTest
```

Expected: PASS.

---

### Task 8: Admin API

**Purpose:** Allow the UI to read and persist the global auto-dispatch switch safely.

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] Step 1: Add:

```text
GET /admin/crawler-monitor/auto-dispatch
PUT /admin/crawler-monitor/auto-dispatch
```

- [ ] Step 2: GET returns `crawlerMonitorService.getAutoDispatchSettings()`.
- [ ] Step 3: PUT requires `requireAdminRole(httpRequest)` and calls `writeAutoDispatchSettings(payload)`.
- [ ] Step 4: Add controller tests:
  - GET returns current settings
  - PUT as admin returns updated settings
  - PUT as non-admin returns 403
  - service validation error returns existing bad-request shape
- [ ] Step 5: Run:

```bash
cd back && mvn -q test -Dtest=AdminCrawlerMonitorControllerTest
```

Expected: PASS.

---

### Task 9: Frontend Types And Auto-Dispatch Card

**Purpose:** Replace the read-only pill with a safe operational control and visible last sweep state. This task owns all frontend type, page, typecheck, and contract-test edits; do not run a parallel frontend writer.

**Files:**
- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] Step 1: Add TypeScript types:
  - `CrawlerMonitorAutoDispatch`
  - `CrawlerMonitorAutoDispatchSweep`
  - `CrawlerMonitorAutoDispatchDetected`
  - `CrawlerMonitorAutoDispatchDispatched`
  - `CrawlerMonitorAutoDispatchSkipped`
- [ ] Step 2: Add `lastSweep?: CrawlerMonitorAutoDispatchSweep | null` to `CrawlerMonitorWikiMonitor`.
- [ ] Step 3: Add `autoDispatchSettings?: CrawlerMonitorAutoDispatch | null` to `CrawlerMonitorWikiMonitor`; this is the page's source of truth for `enabled`, `mode`, `sweepIntervalMinutes`, `configFound`, `updatedAt`, `updatedBy`, and `lastSweep`.
- [ ] Step 4: Lock exact TS schema:
  - `detected: CrawlerMonitorAutoDispatchDetected[]` where each entry has `domain`, `sourceKey`, `actionId`, `changed`
  - `dispatched: CrawlerMonitorAutoDispatchDispatched[]` where each entry has `actionId`, `domains`, `accepted`, `dispatchId`, `status`, `message`
  - `skipped: CrawlerMonitorAutoDispatchSkipped[]` where each entry has `domain`, `actionId`, `reason`, `message`
- [ ] Step 5: Import `put` from `~/composables/useApi`.
- [ ] Step 6: Add reactive state:
  - `autoDispatchSaving`
  - computed settings from `wikiMonitor.value?.autoDispatchSettings`
  - computed current enabled state from settings first, then `wikiMonitor.value?.autoDispatchEnabled`
  - computed interval from settings `sweepIntervalMinutes`, defaulting to `60`
  - computed last sweep labels from settings `lastSweep`
- [ ] Step 7: Implement `saveAutoDispatch(enabled: boolean)`:
  - set loading
  - `PUT /admin/crawler-monitor/auto-dispatch` with `{ enabled, mode: "changed-only", sweepIntervalMinutes: currentSettings.sweepIntervalMinutes ?? 60 }`
  - show success/failure toast
  - reload overview
  - clear loading
- [ ] Step 8: Replace the read-only pill in `monitor-observability` with a compact card:
  - ON/OFF button
  - fixed mode label `仅变化时`
  - interval display
  - last sweep time
  - detected/dispatched/skipped summaries
- [ ] Step 9: Keep controls accessible:
  - visible text labels
  - `aria-label`
  - disabled/loading state
  - no color-only meaning
- [ ] Step 10: Add typecheck sample payload with `autoDispatchSettings`, exact `lastSweep.detected/dispatched/skipped` object arrays, and `autoDispatchReason`.
- [ ] Step 11: Add contract-test assertions:
  - `CrawlerMonitorWikiMonitor` includes `autoDispatchSettings` and `lastSweep`
  - page imports `put`
  - page calls `/admin/crawler-monitor/auto-dispatch`
  - page displays ON/OFF and `仅变化时`
  - page displays interval from overview settings
  - page displays last sweep detected/dispatched/skipped fields
- [ ] Step 12: Run:

```bash
cd data-query-app && npm run test
cd data-query-app && npm run build
```

Expected: both PASS.

---

### Task 10: End-To-End Local Smoke

**Purpose:** Prove the actual runtime path, not only helper functions.

**Files:**
- No code changes unless smoke exposes a defect.
- Runtime artifacts:
  - `reports/crawler-monitor/auto-dispatch.config.json`
  - `reports/crawler-monitor/auto-dispatch.last-sweep.json`
  - `data/generated/source-update-monitor.latest.json`
  - `data/generated/source-update-monitor-progress.latest.json`

- [ ] Step 1: Start local stack:

```bash
bash ./scripts/dev/start-local-stack.sh
```

- [ ] Step 2: Open crawler monitor page and turn auto-dispatch ON.
- [ ] Step 3: Confirm config file contains `enabled=true`, `mode="changed-only"`, and no credentials.
- [ ] Step 4: Run or wait for sweep with matching fingerprints.
- [ ] Step 5: Confirm:
  - progress file reaches `completed`
  - lastSweep has no dispatches
  - no child dispatch process starts
- [ ] Step 6: Simulate a lagging manifest fingerprint for one covered source in a disposable local copy or controlled fixture.
- [ ] Step 7: Run or wait for sweep.
- [ ] Step 8: Confirm:
  - source-update state reports `changed=true`
  - lastSweep detected the domain
  - exactly one action dispatch starts for shared `wiki-core-refresh` if the changed source is items/npcs/projectiles
- [ ] Step 9: Simulate failed dispatch where manifest does not advance.
- [ ] Step 10: After cooldown is cleared or elapsed, run another sweep and confirm source remains changed.
- [ ] Step 11: Turn auto-dispatch OFF and confirm later sweeps do not dispatch.
- [ ] Step 12: Stop stack when done:

```bash
bash ./scripts/dev/stop-local-stack.sh
```

---

## 4. Validation Matrix

Run these before claiming completion:

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs
node --test scripts/data/workflow/run-wiki-sync.test.mjs
cd back && mvn -q test -Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest
cd data-query-app && npm run test
cd data-query-app && npm run build
```

If a command is skipped, record why and what risk remains.

---

## 5. Commit Scope

Expected focused commit:

```text
feat: add safe crawler monitor auto dispatch
```

Before committing:

```bash
git status --short
git diff --cached --stat
```

Only include files touched by this plan and generated test fixtures that are intentionally part of the change. Do not commit runtime config, last sweep files, progress files, local reports, logs, or credentials.

---

## 6. Safety Constraints

- Never store DB/Redis/admin passwords, bearer tokens, MinIO keys, SMTP codes, or other credentials in config, reports, or docs.
- Auto dispatch must never call a crawler/fetch script that lacks monitor-visible progress.
- Auto dispatch must never mark unsupported source keys eligible just because they are `wikiDomain()==true`.
- Failed detection must dispatch nothing.
- Failed crawl must not advance the ingestion fingerprint.
- Config missing must be equivalent to disabled.

---

## 7. Execution Handoff For Goal Runner

Recommended execution order:

1. Task 1 alone. Stop if the owner/boundary table is not implemented.
2. Tasks 2-4 as the Node detection/A2 block.
3. Tasks 5-8 as the backend block.
4. Task 9 as the frontend block.
5. Task 10 as the final runtime smoke.

Parallelization boundaries:

- Tasks 2-4 share Node files and should run serially.
- Tasks 5-8 share backend DTO/service/controller files and should run serially.
- Frontend Task 9 starts only after Task 5 locks DTO shapes. Do not split Task 9 across multiple agents because it owns `crawler-monitor.vue`, `crawlerMonitor.ts`, `crawlerMonitor.typecheck.ts`, and `crawler-monitor-page-contract.test.mjs`.
- No two workers should write `CrawlerMonitorServiceImpl.java` at the same time.
