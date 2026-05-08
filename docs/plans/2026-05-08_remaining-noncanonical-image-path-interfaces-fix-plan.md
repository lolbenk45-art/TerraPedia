# Remaining Non-Canonical Image Path Interfaces Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for execution. Split read-only discovery in parallel, but keep shared image policy, sync, and audit files serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and eliminate the remaining API surfaces that still expose non-canonical managed image paths, so public/admin consumers only return the domain-correct managed prefixes.

**Architecture:** Treat this as two different defects, not one blanket string-rewrite problem. `bosses` already has a canonical relation/projection chain, but its local business table and boss-facing APIs still read stale `items/...` URLs. `buffs` still use `items/...` as the effective managed-image contract across local, relation, projection, and consumer APIs, so Buffs requires a contract-and-data migration instead of a controller-only patch.

**Tech Stack:** Java Spring Boot backend, Node.js relation/audit scripts, MySQL local/relation schemas, MinIO managed image storage, existing report evidence under `reports/`.

---

## Audit Verdict

Current audit result on 2026-05-08: remaining non-canonical managed-image exposure is real, but it is narrow.

Confirmed clean domains:

- `npcs`: local, relation, and projection no longer expose `terrapedia-images/items/...`
- `projectiles`: local, relation, and projection no longer expose `terrapedia-images/items/...`

Confirmed remaining problem domains:

- `bosses`: local business table still exposes `items/...` while relation/projection are already canonical
- `buffs`: local, relation, projection, and multiple consumer APIs still expose `items/...`

This is not a repo-wide image-path failure anymore. It is a `bosses + buffs + indirect buff consumers` closeout pass.

## Confirmed Remaining Surfaces

### Surface A: Boss APIs Still Read Stale Local URLs

DB evidence from `terria_v1_local`:

- `boss_groups.image_url` bad rows: `33`
- sample values: `KING_SLIME`, `EYE_OF_CTHULHU`, `EATER_OF_WORLDS` all point to `http://localhost:9000/terrapedia-images/items/...`

DB evidence from `terria_v1_relation`:

- `relation_bosses.image_url` bad rows: `0`
- `projection_bosses.image_url` bad rows: `0`

Affected interfaces:

- `GET /public/bosses`
- `GET /public/bosses/{id}`
- `GET /admin/bosses`
- `GET /admin/bosses/{id}`

Direct code consumers:

- `back/src/main/java/com/terraria/skills/service/impl/PublicBossServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`

Root-cause class:

- relation/projection are already correct
- local table `boss_groups` is not being brought back to canonical image values
- boss-facing APIs read `boss_groups.image_url` directly and accept it as managed

### Surface B: Buff APIs Still Use `items/...` As Their Effective Contract

DB evidence from `terria_v1_local`:

- `buffs.image_cached_url` bad rows: `388`
- sample values: `ObsidianSkin`, `Regeneration`, `Swiftness`, `Gills`, `Ironskin` all point to `http://localhost:9000/terrapedia-images/items/wiki/buffs/...`

DB evidence from `terria_v1_relation`:

- `relation_buff_images.cached_url` with `items/...`: `388`
- `relation_buff_images.cached_url` with `buffs/...`: `0`
- `projection_buffs.image` with `items/...`: `388`
- `projection_buffs.image` with `buffs/...`: `0`

Affected interfaces:

- `GET /public/buffs`
- `GET /admin/buffs`
- `GET /admin/buffs/{id}`

Direct code consumers:

- `back/src/main/java/com/terraria/skills/service/impl/PublicBuffServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`

Root-cause class:

- this is not just stale local data
- the current Buff image chain still treats `items/...` as a valid managed result
- producer, policy, relation/projection, local sync, and consumers are aligned to the old contract

### Surface C: Indirect Buff Consumers Also Leak The Old Path

Affected interfaces:

- `GET /public/npcs/{id}/aggregate?include=buffs`
- `GET /admin/npcs/{id}/buff-relations`
- admin NPC detail payloads that embed buff relations

Direct code consumers:

- `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`

Leak source:

- all three paths resolve `buffImage` from `COALESCE(NULLIF(TRIM(b.image_cached_url), ''), b.image)`
- they then pass the result through generic managed-image validation
- as long as Buff local rows remain `items/...`, these indirect APIs will keep returning `items/...`

## Root Cause Summary

### Root Cause 1: Boss local back-sync gap

The repo already has canonical Boss relation/projection support:

- `scripts/data/relation/sync-boss-projection.mjs`
- `projection_bosses`
- `relation_bosses`

But Bosses are absent from the local-core replacement/sync path:

- `scripts/data/relation/replacement-readiness-audit.mjs` `DOMAIN_CONFIG` has no `bosses`
- `scripts/data/relation/sync-projection-to-local-core-tables.mjs` therefore never writes back to `boss_groups`

Result:

- canonical data exists in relation/projection
- stale `boss_groups.image_url` remains in place
- boss controllers/services keep reading the stale local column

### Root Cause 2: Buff contract is still generic-managed, not domain-canonical

Current shared policy:

- `scripts/data/relation/managed-image-url-policy.mjs` default managed prefixes include `items`, `npcs`, `projectiles`
- `buffs` is not part of the default canonical-prefix set
- Java runtime managed-image admission is enforced separately by `back/src/main/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicy.java`
- Java runtime trusted object prefixes currently come from `back/src/main/java/com/terraria/skills/config/MinioStorageProperties.java`, where defaults are still `objectPrefix=items` and `managedImageObjectPrefixes=items,npcs,projectiles`

Current producer behavior:

- `back/src/main/java/com/terraria/skills/service/impl/WikiImageSyncServiceImpl.java` uploads Buff assets under `wiki/buffs/...`
- with the current global object-prefix contract, that still lands under `terrapedia-images/items/wiki/buffs/...`

Current downstream behavior:

- `scripts/data/relation/image-processor.mjs` accepts Buff local cached URLs as managed if they are valid under the generic policy
- `projection_buffs.image` and `relation_buff_images.cached_url` preserve the old `items/...` contract
- public/admin consumers only check `managed`, not `managed under the correct Buff prefix`
- local/core sync currently matches shared column names only, so `projection_buffs.image` does not automatically flow into `buffs.image_cached_url`

Result:

- Buffs are internally consistent under the old contract
- that old contract is now the defect

### Root Cause 3: Current audits are not strict enough for domain-canonical prefixes

Evidence mismatch already visible:

- `reports/audit/image-source-lineage-2026-05-08.json` marks `buffs.contractReady=true`
- live DB evidence still shows `388` Buff rows under `items/...`

Interpretation:

- current audit proves `managed image exists`
- current audit does not prove `managed image uses the domain-correct canonical prefix`

## Non-Goals

- Do not `fix` this by adding more generic prefixes until every legacy path becomes accepted.
- Do not patch controllers to rewrite `/items/` to `/bosses/` or `/buffs/` at response time without repairing the data chain.
- Do not use wiki URLs or crawler output as runtime fallback for these interfaces.
- Do not mass-delete old MinIO objects during the same pass as interface repair.
- Do not broaden this plan to all domains; audit evidence says the remaining problem is concentrated in Bosses and Buffs.

## Hard Boundaries

- Bosses and Buffs must be handled as separate chains with separate acceptance criteria.
- Boss fix must preserve `projection_bosses` as the canonical Boss image source; do not introduce a second boss image truth.
- Buff fix is a contract migration. Producer, policy, relation, projection, local sync, and consumers must move together.
- Buff canonical-prefix rollout must update both Node script policy and Java runtime policy in the same phase; one side moving alone is not acceptable.
- Indirect Buff consumers are in scope. Buff list APIs passing is not sufficient.
- Audit/gate tightening is required; otherwise the same drift can re-enter without detection.
- No Flyway migration is planned by default. If execution discovers schema absence rather than path drift, stop and write a new schema-specific plan.
- Buff local sync must not use a blind `replace` strategy that nulls local-only columns. The plan must preserve or explicitly rehydrate local-only Buff fields.
- Buff local sync must resolve the column-name mismatch between `projection_buffs.image` and local `buffs.image_cached_url`; canonical Buff data cannot rely on shared-name matching alone.

## Parallelism Model

Allowed parallel work:

- read-only DB and API evidence collection
- consumer surface inventory
- test design per domain
- draft SQL/report expectations

Serial-only edit zones:

- `scripts/data/relation/managed-image-url-policy.mjs`
- `scripts/data/relation/image-processor.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/replacement-readiness-audit.mjs`
- `scripts/data/audit/image-source-lineage-report.mjs`
- `back/src/main/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicy.java`
- `back/src/main/java/com/terraria/skills/config/MinioStorageProperties.java`
- shared backend consumers that embed Buff image resolution semantics

Recommended lane split:

| Lane | Scope | Parallel status |
| --- | --- | --- |
| Lane 1 | Boss local sync and Boss API proof | parallel until shared sync/audit edits |
| Lane 2 | Buff producer/policy canonical-prefix migration | parallel until shared policy edits |
| Lane 3 | Indirect Buff consumer cleanup | parallel analysis, serial implementation after Lane 2 contract settles |
| Lane 4 | Audit and gate tightening | parallel analysis, serial implementation after canonical prefixes are final |

## Phase Plan

### Phase 0: Freeze A Narrow Baseline

Purpose:

- prove the exact remaining scope before code edits
- prevent this work from re-expanding to already-fixed domains

Files:

- Create: `docs/audits/2026-05-08_remaining-noncanonical-image-path-interfaces-baseline.md`
- Read: `reports/audit/image-source-lineage-2026-05-08.json`
- Read: `scripts/dev/config/local-stack.config.json`

- [ ] Record local DB counts for:
  - `boss_groups.image_url LIKE terrapedia-images/items/%`
  - `buffs.image_cached_url LIKE terrapedia-images/items/%`
- [ ] Record relation DB counts for:
  - `projection_bosses.image_url LIKE terrapedia-images/items/%`
  - `relation_bosses.image_url LIKE terrapedia-images/items/%`
  - `projection_buffs.image LIKE terrapedia-images/items/%`
  - `relation_buff_images.cached_url LIKE terrapedia-images/items/%`
- [ ] Capture one sample response per affected interface family:
  - Boss public
  - Boss admin
  - Buff public/admin
  - NPC aggregate/admin buff-relations
- [ ] Record both trusted-prefix baselines before edits:
  - Node script trusted prefixes from `scripts/data/relation/managed-image-url-policy.mjs`
  - Java runtime trusted prefixes from `ManagedImageUrlPolicy.trustedManagedImageUrlPrefixes()`

Exit gate:

- baseline proves only Bosses, Buffs, and indirect Buff consumers remain in scope
- no new clean domain is added to the execution scope without fresh evidence

### Phase 1: Repair Boss Local-To-API Drift

Purpose:

- make Boss local business data consistent with already-canonical relation/projection data
- remove `items/...` from every boss-facing API without introducing response-time string hacks

Files:

- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicBossServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- Modify or create: Boss API tests under `back/src/test/java/com/terraria/skills/`

- [ ] Extend the local-core sync plan so `bosses` becomes a first-class local sync domain.
- [ ] Use an upsert/preserve-local-field strategy for `boss_groups`; do not replace the whole table blindly.
- [ ] Ensure the synced Boss image source is `projection_bosses.image_url`, not legacy `boss_groups.image_url`.
- [ ] Add tests proving Boss sync can clear stale image paths without deleting boss-only local fields.
- [ ] Add API tests proving Boss public/admin payloads no longer return `terrapedia-images/items/...`.

Expected state after Phase 1:

- `boss_groups.image_url` bad row count: `33 -> 0`
- `GET /public/bosses*` returns only canonical Boss managed paths or `null`
- `GET /admin/bosses*` returns only canonical Boss managed paths or `null`

Stop condition:

- if Boss local sync cannot preserve required Boss local-only columns, stop and split a dedicated Boss local read-model plan instead of forcing full-table replacement

### Phase 2: Settle The Buff Canonical Contract

Purpose:

- make `buffs/...` the explicit canonical managed prefix for Buff images
- stop producing new Buff managed URLs under `items/...`

Files:

- Modify: `scripts/data/relation/managed-image-url-policy.mjs`
- Modify: `scripts/data/relation/managed-image-url-policy.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicy.java`
- Modify: `back/src/main/java/com/terraria/skills/config/MinioStorageProperties.java`
- Modify: `back/src/main/resources/application.yml` if default managed object prefixes or default object prefix must change
- Modify: `back/src/main/java/com/terraria/skills/service/impl/WikiImageSyncServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicyTest.java`
- Modify: producer tests for Buff image sync if present

- [ ] Declare `terrapedia-images/buffs/...` as the canonical Buff managed prefix.
- [ ] Update shared managed-image policy so Buff canonical paths are valid without making legacy `items/...` the desired contract.
- [ ] Align Java runtime managed-image policy with the same Buff canonical-prefix rules used by the Node scripts.
- [ ] Decide and document the default MinIO prefix configuration for Buffs:
  - whether `objectPrefix` remains `items`
  - whether Buff writes use an explicit object prefix override
  - whether `managedImageObjectPrefixes` must add `buffs`
- [ ] Update the Buff image upload/write path so future writes stop landing under `items/wiki/buffs/...`.
- [ ] Add tests proving newly written Buff managed URLs resolve to `buffs/...`.

Expected state after Phase 2:

- no new Buff write path can generate `items/...`
- canonical Buff prefix is explicit in code and tests
- Node script policy and Java runtime policy accept the same Buff canonical prefixes

Stop condition:

- if execution cannot produce a stable canonical Buff object path without breaking existing MinIO resolution, stop and write a storage-contract follow-up before any DB rewrite
- if Node and Java runtime prefix policies cannot be aligned without collateral regressions for Items/NPCs/Projectiles, stop and split a dedicated managed-image-policy plan

### Phase 3: Migrate Buff Data Chain End To End

Purpose:

- move Buff image data from the legacy `items/...` contract to the canonical `buffs/...` contract across local, relation, projection, and local consumer read paths

Files:

- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/image-processor.mjs`
- Modify: `scripts/data/relation/image-processor.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.test.mjs`
- Modify: any Buff data-refresh entrypoint that owns local/relation/projection regeneration

- [ ] Treat `scripts/data/relation/sync-maint-to-relation.mjs` as the authoritative Buff relation/projection write path unless execution proves another existing wrapper is the actual production entrypoint.
- [ ] If another wrapper is used, the execution audit must name it explicitly and prove it still flows through `sync-maint-to-relation.mjs` semantics.
- [ ] Regenerate Buff relation/projection values from canonical Buff managed URLs, not legacy `items/...` values.
- [ ] Change Buff local sync away from blind `replace`.
- [ ] Use either:
  - `upsert_preserve_local` for `buffs`, with an explicit preserve list for local-only fields
  - or a dedicated Buff local backfill path that updates only canonical image fields and leaves local-only fields intact
- [ ] Resolve the Buff column-name mismatch explicitly. Execution must choose one of:
  - field-level column mapping in local core sync, for example `projection_buffs.image -> buffs.image_cached_url`
  - a dedicated Buff local write path that maps canonical projection/relation image values into `buffs.image_cached_url`
- [ ] Do not rely on shared-column-name intersection for Buff canonical image write-back; `image` and `image_cached_url` are not the same column.
- [ ] Preserve or explicitly rehydrate these Buff local-only fields during local sync:
  - `image_original_url`
  - `image_cached_url`
  - `image_content_type`
  - `image_last_verified_at`
  - `source_items_json`
  - `immune_npc_sample_json`
  - timestamps and any other local-only columns not present in `projection_buffs`
- [ ] Sync canonical projection values back into the local `buffs` table without nulling local-only columns.
- [ ] Keep backups for every DB-writing step and record pre/post row counts.
- [ ] Add tests proving relation and projection no longer preserve legacy `items/...` Buff URLs once canonical Buff URLs are available.
- [ ] Add tests proving Buff local sync does not erase local-only fields while clearing legacy `items/...` image paths.
- [ ] Add tests proving canonical `projection_buffs.image` values are actually written back into local `buffs.image_cached_url` despite the column-name mismatch.

Expected state after Phase 3:

- `buffs.image_cached_url` bad row count: `388 -> 0`
- `relation_buff_images.cached_url` bad row count: `388 -> 0`
- `projection_buffs.image` bad row count: `388 -> 0`
- canonical `buffs.image_cached_url` row count is greater than `0` and matches the migrated Buff image population expected for the selected write path

Stop condition:

- if canonical Buff objects do not yet exist in storage and cannot be derived safely from existing managed assets, stop before DB apply and create a separate object-copy/migration plan
- if the only available Buff local write path still requires table-wide `replace`, stop and split a dedicated Buff local-sync safety plan before applying any DB writes
- if execution cannot provide an explicit column map or dedicated write path for `projection_buffs.image -> buffs.image_cached_url`, stop and split a dedicated Buff column-mapping plan before any apply

### Phase 4: Clean All Direct And Indirect Buff Consumers

Purpose:

- ensure every API that embeds Buff image data now returns canonical Buff paths only

Files:

- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicBuffServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify or create: tests for the interfaces above

- [ ] Update Buff-facing consumers so they accept canonical Buff paths and stop depending on legacy-path permissiveness.
- [ ] Update indirect NPC Buff consumers after Phase 3 data migration, not before.
- [ ] Add interface tests proving Buff images in direct and indirect payloads never contain `/terrapedia-images/items/`.

Expected state after Phase 4:

- `GET /public/buffs` returns canonical Buff paths or `null`
- `GET /admin/buffs*` returns canonical Buff paths or `null`
- `GET /public/npcs/{id}/aggregate?include=buffs` returns canonical Buff paths or `null`
- `GET /admin/npcs/{id}/buff-relations` returns canonical Buff paths or `null`

### Phase 5: Tighten Audits And Prevent Regression

Purpose:

- make future drift visible in reports and gates

Files:

- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.mjs` if execution proves domain-readiness should enforce canonical-prefix semantics
- Modify: related docs under `docs/contracts/` if the Buff canonical prefix becomes part of a formal contract

- [ ] Extend image-lineage evidence so it can distinguish:
  - managed-and-canonical
  - managed-but-wrong-prefix
  - missing-managed-image
- [ ] For Bosses, fail readiness when local `boss_groups.image_url` drifts back to `items/...`.
- [ ] For Buffs, fail readiness when local/relation/projection use legacy `items/...` after the migration cutoff.
- [ ] Record the accepted canonical prefixes per domain in contract docs.

Expected state after Phase 5:

- the next audit cannot report `buffs.contractReady=true` while `projection_buffs.image` still sits under `items/...`
- Boss local drift and Buff contract drift both become machine-detectable

## Validation Commands

Baseline and post-fix SQL checks:

```powershell
@'
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveManagedImageUrlPrefixes } from './scripts/data/relation/managed-image-url-policy.mjs';

const require = createRequire(pathToFileURL(path.resolve('data-query-app/package.json')));
const mysql = require('mysql2/promise');
const cfg = JSON.parse(fs.readFileSync('scripts/dev/config/local-stack.config.json', 'utf8'));
const db = cfg.database;
const allPrefixes = resolveManagedImageUrlPrefixes({ repoRoot: process.cwd() });
const itemPrefixes = allPrefixes.filter((prefix) => /\/terrapedia-images\/items\/$/i.test(prefix));

function esc(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[%_]/g, (m) => `\\${m}`);
}

function likeAny(column, prefixes) {
  if (!prefixes.length) {
    throw new Error('No configured managed item prefixes found; validation cannot proceed safely.');
  }
  return prefixes
    .map((prefix) => `BINARY TRIM(${column}) LIKE BINARY '${esc(prefix)}%' ESCAPE '\\\\'`)
    .join(' OR ');
}

(async () => {
  const local = await mysql.createConnection({ host: db.host, port: db.port, user: db.username, password: db.password, database: 'terria_v1_local' });
  const relation = await mysql.createConnection({ host: db.host, port: db.port, user: db.username, password: db.password, database: 'terria_v1_relation' });
const checks = {
    boss_groups_bad: `SELECT COUNT(*) c FROM boss_groups WHERE image_url IS NOT NULL AND (${likeAny('image_url', itemPrefixes)})`,
    buffs_bad: `SELECT COUNT(*) c FROM buffs WHERE image_cached_url IS NOT NULL AND (${likeAny('image_cached_url', itemPrefixes)})`,
    projection_bosses_bad: `SELECT COUNT(*) c FROM projection_bosses WHERE image_url IS NOT NULL AND (${likeAny('image_url', itemPrefixes)})`,
    projection_buffs_bad: `SELECT COUNT(*) c FROM projection_buffs WHERE image IS NOT NULL AND (${likeAny('image', itemPrefixes)})`,
    relation_bosses_bad: `SELECT COUNT(*) c FROM relation_bosses WHERE image_url IS NOT NULL AND (${likeAny('image_url', itemPrefixes)})`,
    relation_buff_images_bad: `SELECT COUNT(*) c FROM relation_buff_images WHERE cached_url IS NOT NULL AND (${likeAny('cached_url', itemPrefixes)})`,
    boss_groups_canonical: "SELECT COUNT(*) c FROM boss_groups WHERE image_url IS NOT NULL AND (TRIM(image_url) LIKE '%/terrapedia-images/bosses/%')",
    buffs_canonical: "SELECT COUNT(*) c FROM buffs WHERE image_cached_url IS NOT NULL AND (TRIM(image_cached_url) LIKE '%/terrapedia-images/buffs/%')",
    projection_buffs_canonical: "SELECT COUNT(*) c FROM projection_buffs WHERE image IS NOT NULL AND (TRIM(image) LIKE '%/terrapedia-images/buffs/%')",
    relation_buff_images_canonical: "SELECT COUNT(*) c FROM relation_buff_images WHERE cached_url IS NOT NULL AND (TRIM(cached_url) LIKE '%/terrapedia-images/buffs/%')"
  };
  for (const [name, sql] of Object.entries(checks)) {
    const conn = name.startsWith('boss_groups') || name.startsWith('buffs_') ? local : relation;
    const [rows] = await conn.query(sql);
    console.log(name, rows[0].c);
  }
  await local.end();
  await relation.end();
})();
'@ | node --input-type=module -
```

Targeted script tests:

```powershell
node --test scripts/data/relation/managed-image-url-policy.test.mjs
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
node --test scripts/data/relation/image-processor.test.mjs
node --test scripts/data/relation/projection-sync.test.mjs
node --test scripts/data/relation/sync-projection-to-local-core-tables.test.mjs
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

Recommended DB dry-run chain before any apply:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/replacement-readiness-audit.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Post-implementation domain-specific dry-runs:

```powershell
# After Phase 1 adds Boss local-core sync support
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=bosses

# After Phase 3 finalizes Buff local sync strategy
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=buffs
```

Dry-run rule:

- do not run any apply command until the relation dry-run chain and the relevant post-implementation domain dry-run prove the selected write path, backup behavior, and local sync strategy

Targeted backend tests:

```powershell
mvn -pl back test -Dtest=MinioManagedImageUrlPolicyTest,PublicBossControllerTest,AdminBossControllerTest,PublicBuffControllerTest,AdminBuffControllerTest,PublicNpcAggregateControllerTest,AdminNpcRelationControllerTest,AdminNpcControllerTest,PublicNpcServiceImplImageTest
```

API smoke checks after data apply:

```powershell
curl "http://localhost:18088/public/bosses?page=1&limit=5"
curl "http://localhost:18088/public/buffs?page=1&limit=5"
curl "http://localhost:18088/public/npcs/1/aggregate?include=buffs"
curl "http://localhost:18088/admin/bosses?page=1&limit=5"
curl "http://localhost:18088/admin/buffs?page=1&limit=5"
curl "http://localhost:18088/admin/npcs/1/buff-relations"
```

Success rule for every response:

- no returned image field contains `/terrapedia-images/items/` for Boss or Buff image payloads
- post-fix SQL must show both negative and positive evidence:
  - legacy `items/...` counts drop to `0`
  - canonical `bosses/...` and `buffs/...` counts are materially greater than `0` for the migrated datasets

## Rollback And Safety Rules

- Boss local sync must create a local backup before any apply step touching `boss_groups`.
- Buff DB rewrites must record pre-count, post-count, and backup table/report names in an execution audit.
- MinIO object migration, if needed, should be additive first. Do not delete old objects in the same step as path cutover.
- If any direct interface is fixed but indirect Buff consumers still leak old paths, do not close the task; the chain is not done.

## Completion Criteria

This plan is complete only when all of the following are true:

- `boss_groups.image_url` has `0` legacy `items/...` rows
- `buffs.image_cached_url` has `0` legacy `items/...` rows
- `relation_bosses.image_url` and `projection_bosses.image_url` remain canonical
- `relation_buff_images.cached_url` and `projection_buffs.image` no longer use legacy `items/...`
- Boss public/admin interfaces return only canonical Boss paths or `null`
- Buff direct and indirect interfaces return only canonical Buff paths or `null`
- audits can distinguish wrong-prefix managed URLs from truly canonical managed URLs

## Recommended Execution Order

1. Phase 0 baseline
2. Phase 1 Boss fix
3. Phase 2 Buff canonical-prefix contract
4. Phase 3 Buff data-chain migration
5. Phase 4 Buff consumer cleanup
6. Phase 5 audit/gate tightening

Do not start Buff consumer cleanup before the Buff canonical contract and data path are settled. That only creates temporary controller logic that hides the actual chain defect.
