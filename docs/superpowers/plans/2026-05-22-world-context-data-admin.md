# World Context Data Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a traceable world context refresh lane and improve `/entities/world-contexts` admin maintenance.

**Architecture:** Add source metadata to `world_contexts`, expose it through the existing admin API, add bounded wiki fetch/transform/import scripts, and enhance the generic entity page only for the `world-contexts` route. The crawler writes generated evidence and progress only; database writes happen only through an explicit `--apply` import command.

**Tech Stack:** Spring Boot, MyBatis Plus, Flyway SQL migrations, Nuxt admin app, Node ESM scripts, built-in `node:test`, MySQL local database `terria_v1_local`.

---

### Task 1: Schema And Backend API

**Files:**
- Create: `back/src/main/resources/db/migration/V43__add_world_context_traceability_fields.sql`
- Modify: `back/src/main/java/com/terraria/skills/entity/WorldContext.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminWorldContextController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminWorldContextControllerTest.java`

- [ ] **Step 1: Write controller tests first**

Add tests that insert/select `WorldContext` rows with `sourceProvider`, `sourcePage`, `sourceRevisionTimestamp`, `lastSyncedAt`, and `rawJson`, and verify list filtering by `contextType`.

- [ ] **Step 2: Run the targeted backend test and confirm the new tests fail**

Run: `cd back && mvn -Dtest=AdminWorldContextControllerTest test`

Expected before implementation: compilation or assertion failure because the new fields are not mapped yet.

- [ ] **Step 3: Add Flyway migration and entity fields**

Add nullable traceability columns using guarded `information_schema` checks, matching established migration style.

- [ ] **Step 4: Update create/update field handling**

Allow admin create/update payloads to set source metadata and raw JSON while preserving existing behavior for core fields.

- [ ] **Step 5: Re-run backend test**

Run: `cd back && mvn -Dtest=AdminWorldContextControllerTest test`

Expected after implementation: build success and test pass.

### Task 2: Fetch And Transform World Context Evidence

**Files:**
- Create: `scripts/data/fetch/fetch-wiki-world-contexts.mjs`
- Create: `scripts/data/fetch/fetch-wiki-world-contexts.test.mjs`
- Create: `scripts/data/transform/transform-wiki-world-contexts-to-importable.mjs`
- Create: `scripts/data/transform/transform-wiki-world-contexts-to-importable.test.mjs`

- [ ] **Step 1: Write failing tests for source target list and progress payload**

Assert that the fetch script exposes the bounded source page list and writes progress-shaped payloads with `actionId`, `status`, `phase`, `current`, `total`, and `lastHeartbeatAt`.

- [ ] **Step 2: Write failing transform tests**

Use a fixture payload containing `Day and night cycle`, `Moon phase`, `Events`, `Weather`, `Graveyard`, and `Shimmer`; assert the transform emits stable codes such as `DAY`, `NIGHT`, `FULL_MOON`, `BLOOD_MOON`, `WINDY_DAY`, `ECTO_MIST`, and `SHIMMER`.

- [ ] **Step 3: Run node tests and confirm failure**

Run: `node --test scripts/data/fetch/fetch-wiki-world-contexts.test.mjs scripts/data/transform/transform-wiki-world-contexts-to-importable.test.mjs`

Expected before implementation: missing module/export failures.

- [ ] **Step 4: Implement bounded fetch**

Use existing wiki request helpers where available. Write:
- `data/generated/wiki-world-contexts.latest.json`
- `data/generated/wiki-world-contexts-progress.latest.json`
- `reports/wiki-world-contexts-summary-<timestamp>.md`

- [ ] **Step 5: Implement transform**

Map source evidence into importable records with traceability fields and `rawJson`. Keep codes stable and deterministic.

- [ ] **Step 6: Re-run node tests**

Run: `node --test scripts/data/fetch/fetch-wiki-world-contexts.test.mjs scripts/data/transform/transform-wiki-world-contexts-to-importable.test.mjs`

Expected after implementation: all listed tests pass.

### Task 3: Dry-Run-First Import

**Files:**
- Create: `scripts/data/import/import-world-contexts-to-db.mjs`
- Create: `scripts/data/import/import-world-contexts-to-db.test.mjs`

- [ ] **Step 1: Write import planning tests first**

Assert dry-run returns planned creates/updates without calling mutating SQL. Assert apply mode upserts only `world_contexts` and records source fields.

- [ ] **Step 2: Run import test and confirm failure**

Run: `node --test scripts/data/import/import-world-contexts-to-db.test.mjs`

Expected before implementation: missing module/export failure.

- [ ] **Step 3: Implement import script**

Default mode is dry-run. `--apply` is required for writes. Inputs default to `data/generated/wiki-world-contexts.importable.latest.json`. Reports go to `reports/wiki-world-contexts-import-<timestamp>.json`.

- [ ] **Step 4: Re-run import test**

Run: `node --test scripts/data/import/import-world-contexts-to-db.test.mjs`

Expected after implementation: pass.

### Task 4: Admin Page Improvements

**Files:**
- Modify: `data-query-app/pages/entities/[type].vue`
- Test: `data-query-app` typecheck

- [ ] **Step 1: Add world-context type filter state and derived counts**

Add filter chips for `TIME`, `ENVIRONMENT`, `EVENT`, `MOON_PHASE`, `WEATHER`, and `PROGRESSION`. Pass `contextType` to `/admin/world-contexts` when selected.

- [ ] **Step 2: Add source and quality fields to config**

Show `sourceProvider`, `sourcePage`, `sourceRevisionTimestamp`, `lastSyncedAt`, and `rawJson` in advanced/detail sections. Add quality hints for missing source/sync/description.

- [ ] **Step 3: Run admin typecheck**

Run: `cd data-query-app && pnpm run check`

Expected after implementation: Nuxt typecheck passes.

### Task 5: Runtime Data Refresh And Verification

**Files:**
- Runtime artifacts only:
  - `data/generated/wiki-world-contexts.latest.json`
  - `data/generated/wiki-world-contexts.importable.latest.json`
  - `reports/wiki-world-contexts-*`

- [ ] **Step 1: Run crawler with progress**

Run: `node scripts/data/fetch/fetch-wiki-world-contexts.mjs`

Expected: generated source JSON and progress JSON exist; progress ends with `completed`.

- [ ] **Step 2: Run transform**

Run: `node scripts/data/transform/transform-wiki-world-contexts-to-importable.mjs`

Expected: importable JSON includes the stable world-context codes and source metadata.

- [ ] **Step 3: Run dry-run import**

Run: `node scripts/data/import/import-world-contexts-to-db.mjs --dry-run`

Expected: report lists planned creates/updates and no database mutation is performed.

- [ ] **Step 4: Run apply import**

Run only after reviewing dry-run output: `node scripts/data/import/import-world-contexts-to-db.mjs --apply`

Expected: report lists applied creates/updates in `terria_v1_local.world_contexts`.

- [ ] **Step 5: Verify DB and API**

Run MySQL count/type/source queries and authenticated API checks when token is available. At minimum, query `world_contexts` directly for source metadata populated on imported records.

- [ ] **Step 6: Run final checks**

Run:
- `node --test scripts/data/fetch/fetch-wiki-world-contexts.test.mjs scripts/data/transform/transform-wiki-world-contexts-to-importable.test.mjs scripts/data/import/import-world-contexts-to-db.test.mjs`
- `cd back && mvn -Dtest=AdminWorldContextControllerTest test`
- `cd data-query-app && pnpm run check`
- `git status --short`

Expected: tests/typecheck pass and only intended source files plus local generated artifacts are present. Do not commit generated artifacts unless explicitly requested.
