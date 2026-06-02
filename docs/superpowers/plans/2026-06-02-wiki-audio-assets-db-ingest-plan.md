# Wiki Audio Assets DB Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the already downloaded wiki.gg audio corpus metadata into `terria_v1_local` as traceable audio asset records and conservative entity links, without changing the crawler, uploading to MinIO, or wiring playback UI.

**Architecture:** Keep crawler and database write paths separate. The crawler owns wiki discovery/download and produces `/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json`; a new importer owns dry-run validation and explicit `--apply=true` DB upsert into audio metadata tables. Public/admin API playback and object-storage upload remain follow-up work after DB metadata is audited.

**Tech Stack:** MySQL 8 / Flyway SQL migrations, Node ESM data import scripts, existing TerraPedia DB config conventions, Java Spring Boot DTO/service tests for optional read API, Node test runner, Maven/JUnit.

---

## Current Evidence

- Branch: `survey/audio-assets-api-2026-06-02`
- Full crawl has already completed and is not part of this plan.
- Latest source metadata: `/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json`
- Full report: `reports/workflow-audio-fetch-full-2026-06-02.json`
- Manifest: `/home/lolben/data/terraPedia/generated/wiki-audio-assets-manifests/wiki-audio-assets-manifest-2026-06-02.json`
- Audio file root: `/home/lolben/data/terraPedia/media/audio/wiki/`
- Latest verified corpus:
  - `428` audio assets.
  - `0` failed.
  - `0` missing local files.
  - `0` size mismatches.
  - `0` missing `sha256`.
  - shard counts: `bgm=104`, `items=198`, `npc_hit=58`, `npc_death=68`.
- Existing backend DB convention:
  - primary application schema: `terria_v1_local`
  - maint schema: `terria_v1_maint`
  - relation/projection schema: `terria_v1_relation`
- Existing asset-like table pattern:
  - `item_images` stores provider, source file title, original URL, cached URL, content type, verification status, timestamps.

## Scope

In scope:

- Add DB schema for audio asset metadata.
- Add a dry-run importer that reads `wiki-audio-assets.latest.json` and reports what would be inserted/updated.
- Add an explicit apply importer that writes only when `--apply=true`.
- Add an audit script that verifies DB rows against the latest metadata and local files.
- Add tests for schema, importer parsing, dry-run safety, apply guard, idempotent upsert, and audit counts.
- Optionally add a minimal backend read-only admin/service surface after DB import is stable.

Out of scope:

- Running a crawler or changing crawler behavior.
- Uploading audio files to MinIO or CDN.
- Public/admin playback UI.
- Public API playback endpoints.
- Writing audio binary files into git.
- Writing to `terria_v1_maint` or `terria_v1_relation`.
- Deleting audio assets from DB during first import.

## Source Chain

```text
wiki.gg crawler output
  -> /home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json
  -> scripts/data/import/import-wiki-audio-assets-to-db.mjs --dry-run
  -> reports/audio-db-import-dry-run-<date>.json
  -> scripts/data/import/import-wiki-audio-assets-to-db.mjs --apply=true
  -> terria_v1_local.audio_assets
  -> terria_v1_local.audio_asset_links
  -> scripts/data/audit/audio-asset-db-readiness-audit.mjs
  -> reports/audit/audio-asset-db-readiness-<date>.json
```

## Safety Rules

- The importer defaults to dry-run and must refuse DB writes unless `--apply=true`.
- The importer writes only to `terria_v1_local`.
- If `--database` is not `terria_v1_local`, fail unless `--allow-non-primary-db=true` is explicitly passed for isolated test databases.
- The importer must not run crawler commands.
- The importer must not upload to MinIO.
- The importer must not create, overwrite, or delete audio files.
- The importer must not delete DB rows during the first DB ingest milestone.
- The importer must produce a report for dry-run and apply runs.
- Apply must be idempotent by `audio_assets.asset_id`.
- Links must be idempotent by `(audio_asset_id, entity_type, source_key, relation_type)`.
- Ambiguous or unmatched entity links must be recorded as `match_status='unmatched'` or `match_status='ambiguous'`; do not guess.

## Proposed Tables

### `audio_assets`

```sql
CREATE TABLE IF NOT EXISTS `audio_assets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `asset_id` VARCHAR(255) NOT NULL,
  `shard` VARCHAR(32) NOT NULL,
  `kind` VARCHAR(64) NOT NULL,
  `source_key` VARCHAR(255) DEFAULT NULL,
  `file_title` VARCHAR(255) DEFAULT NULL,
  `wiki_file_url` VARCHAR(500) DEFAULT NULL,
  `source_url` VARCHAR(500) DEFAULT NULL,
  `local_path` VARCHAR(500) DEFAULT NULL,
  `absolute_local_path` VARCHAR(700) DEFAULT NULL,
  `mime` VARCHAR(128) DEFAULT NULL,
  `size_bytes` BIGINT DEFAULT NULL,
  `sha256` CHAR(64) DEFAULT NULL,
  `provider` VARCHAR(64) NOT NULL DEFAULT 'wiki_gg',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `last_verified_at` DATETIME DEFAULT NULL,
  `crawl_report_path` VARCHAR(500) DEFAULT NULL,
  `raw_json` LONGTEXT DEFAULT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_audio_assets_asset_id` (`asset_id`),
  INDEX `idx_audio_assets_shard` (`shard`),
  INDEX `idx_audio_assets_kind` (`kind`),
  INDEX `idx_audio_assets_sha256` (`sha256`),
  INDEX `idx_audio_assets_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `audio_asset_links`

```sql
CREATE TABLE IF NOT EXISTS `audio_asset_links` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `audio_asset_id` BIGINT NOT NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` BIGINT DEFAULT NULL,
  `source_key` VARCHAR(255) DEFAULT NULL,
  `relation_type` VARCHAR(64) NOT NULL,
  `match_status` VARCHAR(32) NOT NULL DEFAULT 'unmatched',
  `match_reason` VARCHAR(500) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_audio_asset_links_identity` (`audio_asset_id`, `entity_type`, `source_key`, `relation_type`),
  INDEX `idx_audio_asset_links_asset` (`audio_asset_id`),
  INDEX `idx_audio_asset_links_entity` (`entity_type`, `entity_id`),
  INDEX `idx_audio_asset_links_match` (`match_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Matching Contract

Use conservative matching only.

| Shard | Relation type | Entity strategy |
|---|---|---|
| `items` | `item_use_sound` | Attempt item match only when a stable `source_id` or `internal_name` can be derived and exactly one `items` row matches. |
| `npc_hit` | `npc_hit_sound` | Record as sound-family link with `entity_type='npc_sound_family'`, `entity_id=NULL`, `match_status='unmatched'` unless a verified NPC sound map exists. |
| `npc_death` | `npc_death_sound` | Same as `npc_hit`; do not infer individual NPC ownership from filename alone. |
| `bgm` | `bgm_track` | Record as `entity_type='bgm_track'`, `entity_id=NULL`, `match_status='unmatched'`; biome/boss/event mapping is a later milestone. |

Match status meanings:

- `matched`: exactly one DB entity was matched by stable key.
- `unmatched`: no safe DB entity was found.
- `ambiguous`: more than one possible DB entity was found.

## Files To Create Or Modify

Create:

- `back/src/main/resources/db/migration/V47__create_audio_asset_tables.sql`
- `scripts/data/import/import-wiki-audio-assets-to-db.mjs`
- `scripts/data/import/import-wiki-audio-assets-to-db.test.mjs`
- `scripts/data/audit/audio-asset-db-readiness-audit.mjs`
- `scripts/data/audit/audio-asset-db-readiness-audit.test.mjs`
- `reports/audio-db-import-dry-run-2026-06-02.json` only when running dry-run; do not commit unless explicitly requested.
- `reports/audio-db-import-apply-2026-06-02.json` only when running apply; do not commit unless explicitly requested.
- `reports/audit/audio-asset-db-readiness-2026-06-02.json` only when running audit; do not commit unless explicitly requested.

Modify only if the optional read API milestone is approved:

- `back/src/main/java/com/terraria/skills/dto/AudioAssetDTO.java`
- `back/src/main/java/com/terraria/skills/service/AudioAssetService.java`
- `back/src/main/java/com/terraria/skills/service/impl/AudioAssetServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java`
- `back/src/test/java/com/terraria/skills/service/impl/AudioAssetServiceImplTest.java`
- `back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java`

Do not modify in this plan:

- `scripts/data/fetch/fetch-wiki-audio-assets.mjs`
- `scripts/data/workflow/backend-data-refresh-plan.mjs`
- public frontend playback components
- MinIO/object-storage code

---

## Task 1: Add Audio Asset Schema

**Files:**
- Create: `back/src/main/resources/db/migration/V47__create_audio_asset_tables.sql`
- Test: `back/src/main/resources/db/migration/V47__create_audio_asset_tables.sql` via Flyway-backed backend tests or isolated SQL inspection test.

- [ ] **Step 1: Create the migration**

  Add the two tables exactly as listed in the "Proposed Tables" section:

  - `audio_assets`
  - `audio_asset_links`

- [ ] **Step 2: Verify migration naming**

  Run:

  ```bash
  ls back/src/main/resources/db/migration | sort | tail -10
  ```

  Expected:

  ```text
  V47__create_audio_asset_tables.sql
  ```

- [ ] **Step 3: Run backend migration-sensitive tests**

  Run:

  ```bash
  cd back && mvn "-Dtest=SkillsBackApplicationTests" test
  ```

  Expected:

  ```text
  BUILD SUCCESS
  ```

- [ ] **Step 4: Commit checkpoint**

  Commit message:

  ```bash
  git add back/src/main/resources/db/migration/V47__create_audio_asset_tables.sql
  git commit -m "feat: add audio asset metadata tables"
  ```

## Task 2: Implement Importer Parsing And Dry-Run Report

**Files:**
- Create: `scripts/data/import/import-wiki-audio-assets-to-db.mjs`
- Create: `scripts/data/import/import-wiki-audio-assets-to-db.test.mjs`

- [ ] **Step 1: Write tests for source metadata validation**

  Test cases:

  - Valid metadata with one asset returns `summary.total=1`.
  - Missing `assets` array fails.
  - Duplicate `assetId` fails.
  - Missing `sha256` fails.
  - Missing local file fails.
  - Size mismatch fails.

- [ ] **Step 2: Write tests for default dry-run safety**

  Test cases:

  - Running without `--apply=true` does not open a DB connection.
  - Running without `--apply=true` writes a report with `mode='dry-run'`.
  - Running with `--apply=true` requires DB config.

- [ ] **Step 3: Implement CLI contract**

  Required options:

  ```bash
  --input-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json
  --report-json=reports/audio-db-import-dry-run-2026-06-02.json
  --database=terria_v1_local
  --apply=true
  --allow-non-primary-db=true
  ```

  Defaults:

  - `input-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json`
  - `database=process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local'`
  - `apply=false`
  - `allowNonPrimaryDb=false`

- [ ] **Step 4: Implement dry-run report shape**

  Report JSON must include:

  ```json
  {
    "mode": "dry-run",
    "inputJson": "/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json",
    "database": "terria_v1_local",
    "summary": {
      "total": 428,
      "valid": 428,
      "invalid": 0,
      "wouldInsertAssets": 428,
      "wouldUpdateAssets": 0,
      "wouldInsertLinks": 428,
      "matched": 0,
      "unmatched": 428,
      "ambiguous": 0
    },
    "failures": [],
    "samples": []
  }
  ```

- [ ] **Step 5: Run importer tests**

  Run:

  ```bash
  node --test scripts/data/import/import-wiki-audio-assets-to-db.test.mjs
  ```

  Expected:

  ```text
  fail 0
  ```

## Task 3: Implement Conservative Link Builder

**Files:**
- Modify: `scripts/data/import/import-wiki-audio-assets-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-audio-assets-to-db.test.mjs`

- [ ] **Step 1: Add tests for each shard**

  Required expected relation rows:

  - `bgm` -> `entity_type='bgm_track'`, `relation_type='bgm_track'`, `match_status='unmatched'`
  - `items` unmatched -> `entity_type='item'`, `relation_type='item_use_sound'`, `match_status='unmatched'`
  - `npc_hit` -> `entity_type='npc_sound_family'`, `relation_type='npc_hit_sound'`, `match_status='unmatched'`
  - `npc_death` -> `entity_type='npc_sound_family'`, `relation_type='npc_death_sound'`, `match_status='unmatched'`

- [ ] **Step 2: Add item exact-match test**

  Mock DB item rows:

  ```json
  [
    { "id": 1001, "source_id": 1, "internal_name": "Item_1" }
  ]
  ```

  For asset `items:item-1`, expected link:

  ```json
  {
    "entityType": "item",
    "entityId": 1001,
    "sourceKey": "Item_1",
    "relationType": "item_use_sound",
    "matchStatus": "matched",
    "matchReason": "matched items.source_id from Item_1"
  }
  ```

- [ ] **Step 3: Add item ambiguous-match test**

  Mock DB item rows with two possible matches must produce:

  ```json
  {
    "matchStatus": "ambiguous",
    "entityId": null
  }
  ```

- [ ] **Step 4: Run importer tests**

  Run:

  ```bash
  node --test scripts/data/import/import-wiki-audio-assets-to-db.test.mjs
  ```

  Expected:

  ```text
  fail 0
  ```

## Task 4: Implement Explicit Apply Upsert

**Files:**
- Modify: `scripts/data/import/import-wiki-audio-assets-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-audio-assets-to-db.test.mjs`

- [ ] **Step 1: Add tests for apply guard**

  Required cases:

  - `--apply=true --database=terria_v1_local` permits DB writer setup.
  - `--apply=true --database=terria_v1_maint` fails.
  - `--apply=true --database=terria_v1_maint --allow-non-primary-db=true` permits only in tests.

- [ ] **Step 2: Add idempotent upsert tests**

  First apply result:

  ```json
  {
    "insertedAssets": 1,
    "updatedAssets": 0,
    "insertedLinks": 1,
    "updatedLinks": 0
  }
  ```

  Second apply result with same input:

  ```json
  {
    "insertedAssets": 0,
    "updatedAssets": 1,
    "insertedLinks": 0,
    "updatedLinks": 1
  }
  ```

- [ ] **Step 3: Implement `audio_assets` upsert**

  Upsert key:

  ```text
  audio_assets.asset_id
  ```

  Update on duplicate:

  - `shard`
  - `kind`
  - `source_key`
  - `file_title`
  - `wiki_file_url`
  - `source_url`
  - `local_path`
  - `absolute_local_path`
  - `mime`
  - `size_bytes`
  - `sha256`
  - `status='active'`
  - `last_verified_at`
  - `crawl_report_path`
  - `raw_json`
  - `deleted=0`

- [ ] **Step 4: Implement `audio_asset_links` upsert**

  Upsert key:

  ```text
  audio_asset_id + entity_type + source_key + relation_type
  ```

  Update on duplicate:

  - `entity_id`
  - `match_status`
  - `match_reason`
  - `sort_order`
  - `deleted=0`

- [ ] **Step 5: Run importer tests**

  Run:

  ```bash
  node --test scripts/data/import/import-wiki-audio-assets-to-db.test.mjs
  ```

  Expected:

  ```text
  fail 0
  ```

## Task 5: Run Real Dry-Run Against Full Corpus

**Files:**
- Runtime report only: `reports/audio-db-import-dry-run-2026-06-02.json`

- [ ] **Step 1: Run dry-run**

  Run:

  ```bash
  node scripts/data/import/import-wiki-audio-assets-to-db.mjs \
    --input-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json \
    --report-json=reports/audio-db-import-dry-run-2026-06-02.json
  ```

  Expected:

  - Exit code `0`.
  - `mode='dry-run'`.
  - `summary.total=428`.
  - `summary.valid=428`.
  - `summary.invalid=0`.
  - `failures.length=0`.

- [ ] **Step 2: Review dry-run report**

  Run:

  ```bash
  node - <<'NODE'
  const fs = require('fs');
  const report = JSON.parse(fs.readFileSync('reports/audio-db-import-dry-run-2026-06-02.json', 'utf8'));
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.mode !== 'dry-run') process.exit(1);
  if (report.summary.total !== 428) process.exit(2);
  if (report.summary.invalid !== 0) process.exit(3);
  if ((report.failures || []).length !== 0) process.exit(4);
  NODE
  ```

  Expected:

  ```json
  {
    "total": 428,
    "valid": 428,
    "invalid": 0
  }
  ```

## Task 6: Apply To Local Primary DB

**Files:**
- Runtime report only: `reports/audio-db-import-apply-2026-06-02.json`

- [ ] **Step 1: Confirm DB target**

  Run:

  ```bash
  printenv TERRAPEDIA_DB_NAME || true
  printenv TERRAPEDIA_DB_URL || true
  ```

  Expected:

  - DB target resolves to `terria_v1_local`.
  - If DB target is not clear, stop and ask for confirmation.

- [ ] **Step 2: Run apply**

  Run:

  ```bash
  node scripts/data/import/import-wiki-audio-assets-to-db.mjs \
    --input-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json \
    --report-json=reports/audio-db-import-apply-2026-06-02.json \
    --database=terria_v1_local \
    --apply=true
  ```

  Expected:

  - Exit code `0`.
  - `summary.total=428`.
  - `summary.valid=428`.
  - `summary.invalid=0`.
  - `summary.applied=true`.

- [ ] **Step 3: Run apply a second time to prove idempotency**

  Run the same command again.

  Expected:

  - Exit code `0`.
  - No duplicate rows.
  - `audio_assets` count remains `428`.

## Task 7: Implement DB Readiness Audit

**Files:**
- Create: `scripts/data/audit/audio-asset-db-readiness-audit.mjs`
- Create: `scripts/data/audit/audio-asset-db-readiness-audit.test.mjs`

- [ ] **Step 1: Add audit tests**

  Required cases:

  - DB count equals metadata count -> `status='pass'`.
  - Missing DB asset -> `status='fail'`.
  - Hash mismatch -> `status='fail'`.
  - Size mismatch -> `status='fail'`.
  - Missing local file -> `status='fail'`.
  - Unmatched links are warnings, not failures, during first milestone.

- [ ] **Step 2: Implement audit summary**

  Report JSON must include:

  ```json
  {
    "status": "pass",
    "sourceMetadata": "/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json",
    "database": "terria_v1_local",
    "summary": {
      "metadataAssets": 428,
      "dbAssets": 428,
      "dbLinks": 428,
      "missingDbAssets": 0,
      "missingLocalFiles": 0,
      "sizeMismatch": 0,
      "hashMismatch": 0,
      "matchedLinks": 0,
      "unmatchedLinks": 428,
      "ambiguousLinks": 0
    },
    "failures": [],
    "warnings": []
  }
  ```

- [ ] **Step 3: Run audit tests**

  Run:

  ```bash
  node --test scripts/data/audit/audio-asset-db-readiness-audit.test.mjs
  ```

  Expected:

  ```text
  fail 0
  ```

## Task 8: Run Real DB Audit

**Files:**
- Runtime report only: `reports/audit/audio-asset-db-readiness-2026-06-02.json`

- [ ] **Step 1: Run audit**

  Run:

  ```bash
  node scripts/data/audit/audio-asset-db-readiness-audit.mjs \
    --input-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json \
    --report-json=reports/audit/audio-asset-db-readiness-2026-06-02.json \
    --database=terria_v1_local
  ```

  Expected:

  - Exit code `0`.
  - `status='pass'`.
  - `metadataAssets=428`.
  - `dbAssets=428`.
  - `missingDbAssets=0`.
  - `missingLocalFiles=0`.
  - `sizeMismatch=0`.
  - `hashMismatch=0`.

- [ ] **Step 2: Print compact audit summary**

  Run:

  ```bash
  node - <<'NODE'
  const fs = require('fs');
  const audit = JSON.parse(fs.readFileSync('reports/audit/audio-asset-db-readiness-2026-06-02.json', 'utf8'));
  console.log(JSON.stringify({ status: audit.status, summary: audit.summary }, null, 2));
  if (audit.status !== 'pass') process.exit(1);
  if (audit.summary.metadataAssets !== 428) process.exit(2);
  if (audit.summary.dbAssets !== 428) process.exit(3);
  if (audit.summary.missingLocalFiles !== 0) process.exit(4);
  if (audit.summary.sizeMismatch !== 0) process.exit(5);
  if (audit.summary.hashMismatch !== 0) process.exit(6);
  NODE
  ```

  Expected:

  ```json
  {
    "status": "pass"
  }
  ```

## Task 9: Optional Read-Only Admin API

Only execute this task after Tasks 1-8 pass and the user explicitly approves API exposure.

**Files:**
- Create: `back/src/main/java/com/terraria/skills/dto/AudioAssetDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/AudioAssetService.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/AudioAssetServiceImpl.java`
- Create: `back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/AudioAssetServiceImplTest.java`
- Create: `back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java`

- [ ] **Step 1: Add read DTO**

  DTO fields:

  - `id`
  - `assetId`
  - `shard`
  - `kind`
  - `sourceKey`
  - `fileTitle`
  - `wikiFileUrl`
  - `sourceUrl`
  - `localPath`
  - `mime`
  - `sizeBytes`
  - `sha256`
  - `status`
  - `linkCount`

- [ ] **Step 2: Add service query**

  Supported filters:

  - `shard`
  - `kind`
  - `status`
  - `matchStatus`
  - `q`
  - `page`
  - `size`

- [ ] **Step 3: Add admin endpoint**

  Endpoint:

  ```text
  GET /api/admin/audio-assets
  ```

  This endpoint is read-only and must not return `absolute_local_path`.

- [ ] **Step 4: Run Java tests**

  Run:

  ```bash
  cd back && mvn "-Dtest=AudioAssetServiceImplTest,AdminAudioAssetControllerTest" test
  ```

  Expected:

  ```text
  BUILD SUCCESS
  ```

## Final Validation

Run after Tasks 1-8:

```bash
node --test scripts/data/import/import-wiki-audio-assets-to-db.test.mjs
node --test scripts/data/audit/audio-asset-db-readiness-audit.test.mjs
cd back && mvn test
git diff --check
git ls-files | rg "(media/audio/wiki|\\.(mp3|wav|ogg|flac|m4a)$)" || true
```

Expected:

- Node importer tests pass.
- Node audit tests pass.
- Maven tests pass.
- `git diff --check` has no output.
- `git ls-files ...` has no output.
- No generated reports or audio binaries are staged unless the user explicitly requests a specific artifact.

## Multi-Agent Execution Split

Recommended split if using subagent-driven execution:

- Agent A owns schema migration and Flyway/backend migration validation.
- Agent B owns importer parsing, dry-run report, apply guard, and upsert tests.
- Agent C owns link builder and matching policy tests.
- Agent D owns DB readiness audit and real audit report checks.
- Agent E performs final code review and boundary review.

Do not let two agents edit the same file at the same time. The importer owner and link-builder owner must sequence their edits or use disjoint helper files.

## Completion Definition

This plan is complete when:

- `audio_assets` has exactly `428` active rows in `terria_v1_local`.
- `audio_asset_links` has at least `428` rows, one per imported asset.
- DB audit passes with `metadataAssets=428`, `dbAssets=428`, `missingLocalFiles=0`, `sizeMismatch=0`, `hashMismatch=0`.
- Crawler remains no-DB-write.
- No MinIO upload has occurred.
- No UI playback surface has been added.
- No audio binary files are tracked by git.

## Residual Risks And Follow-Up Triggers

- Many `npc_hit`, `npc_death`, and `bgm` links will remain `unmatched` by design. This is acceptable for metadata ingest; it triggers a later mapping project, not a failure.
- If item audio matching is lower than expected, do not guess by display name. Add a separate source-id mapping audit.
- If MinIO/CDN playback is requested later, create a separate plan for object-storage upload and public URL policy.
- If public playback UI is requested later, create a separate API/UI plan after DB audit passes.
