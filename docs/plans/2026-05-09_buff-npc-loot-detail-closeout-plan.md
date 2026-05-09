# Buff / NPC Detail Data Closeout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for execution. Read-only discovery can run in parallel, but DB writes and shared backend controller edits must be serialized.

**Goal:** Fix the admin detail regressions where Buff immune NPC cards render unresolved placeholders and Mimic variant NPCs show missing loot, while keeping local DB and relation/projection data as the source of truth.

**Architecture:** Treat this as two chains. Buff detail is an API enrichment problem: `immune_npc_sample_json` contains alias names that can be resolved from local `npcs`, but `AdminBuffController` only resolves exact `internalName/game_id`. Mimic variant loot is a data-chain gap: local, relation, and projection tables have no drop rows for Present/Corrupt/Crimson/Hallowed/Jungle Mimic, so UI must not fabricate rows from wiki or crawler output.

**Tech Stack:** Java Spring Boot admin APIs, MySQL local/relation schemas, Node.js data audit/backfill scripts, Nuxt admin UI, existing TerraPedia reports under `reports/` and `data/wiki-crawler/report/`.

---

## Confirmed Facts

Current branch baseline was checked from `main` at `c3b947d`.

Local runtime:

- Admin: `http://localhost:3001`
- Front: `http://localhost:5174`
- Back: `http://localhost:18088`
- DB: `terria_v1_local`

### Buff Detail Facts

- `buffs.immune_npc_sample_json` has `240` effective sample entries across affected Buffs.
- `131` entries resolve by current exact `internalName/game_id` rules.
- `109` entries resolve by local NPC display-name alias but not by exact `internalName/game_id`.
- The `109` alias-resolvable entries affect `24` Buffs.
- `0` sampled unresolved entries matched only Item or Projectile tables in the latest broad check.
- `npc_buff_relations` `inflicts` rows have `112` rows and no broad image fallback gap.

Representative aliases:

- `AncientVision` -> local NPC `AncientCultistSquidhead`, display name `Ancient Vision`
- `PirateSCurse` -> local NPC `PirateGhost`, display name `Pirate's Curse`
- `PhantasmDragon` -> multiple local NPC segments with display name `Phantasm Dragon`
- `CorruptMimic` -> local NPC `BigMimicCorruption`, display name `Corrupt Mimic`

### NPC Loot Facts

Mimic variants in local DB:

| NPC | Local row | Relation/projection state |
| --- | --- | --- |
| `Mimic` | `lootCount=7`, `derived=7`, `lootItemsJsonCount=7` | present |
| `IceMimic` | `lootCount=9`, `derived=9`, `lootItemsJsonCount=9` | present |
| `WaterBoltMimic` | `lootCount=1`, `derived=1`, `lootItemsJsonCount=1` | present |
| `PresentMimic` | `lootCount=0`, `derived=0`, `lootItemsJsonCount=0` | missing |
| `BigMimicCorruption` | `lootCount=0`, `derived=0`, `lootItemsJsonCount=0` | missing |
| `BigMimicCrimson` | `lootCount=0`, `derived=0`, `lootItemsJsonCount=0` | missing |
| `BigMimicHallow` | `lootCount=0`, `derived=0`, `lootItemsJsonCount=0` | missing |
| `BigMimicJungle` | `lootCount=0`, `derived=0`, `lootItemsJsonCount=0` | missing |

Relation DB evidence:

- `item_source_facts`, `item_source_details`, `item_npc_loot_relations`, and `projection_npcs` only contain Mimic loot for `Mimic`, `Ice Mimic`, and `Water Bolt Mimic`.
- `Present/Corrupt/Crimson/Hallowed/Jungle Mimic` have no relation/projection loot rows.
- Broad relation check found `674` NPC drop fact rows with `674` relation fact keys; no general source-fact-to-relation drift was found.

### Image Coverage Facts

- `npc_loot_entries` item image gap: `0`
- `item_acquisition_sources` NPC drop item image gap: `0`
- `npc_buff_relations` Buff image gap: `0`
- `buff_source_items` item image gap: `0`
- Base entity image edge gaps remain: `npcs=4`, `items=23`, `projectiles=1` (`None`)

These image edge gaps are real, but they are not the primary cause of the two reported screenshots.

---

## Non-Goals

- Do not use live wiki pages or crawler output directly in runtime API payloads.
- Do not fabricate Mimic drop rows in frontend code.
- Do not treat `immune_npc_sample_json` raw entries as resolved NPC cards unless they resolve to a local NPC row.
- Do not mass-write unrelated NPC or Item image fields in this pass.
- Do not broaden this plan into a full crawler rewrite.
- Do not run DB apply/backfill commands before dry-run evidence and pre-counts are recorded.

---

## Hard Boundaries

- Local DB, relation DB, and projection tables are the data source of truth for runtime APIs.
- Buff alias resolution must enrich from local `npcs`; if a sample cannot resolve, it must be classified instead of rendered as a fake NPC card.
- Multi-match alias rows must use deterministic selection rules and expose ambiguity metadata when needed.
- Mimic variant loot requires upstream data materialization into relation/projection/local tables. The admin UI must not pretend the rows exist before the data chain is populated.
- `sync-maint-to-relation.mjs` remains the single writer for relation/projection snapshots. A focused Mimic script may prepare upstream inputs, but it must not compete with the snapshot writer for the same tables.
- `npcs.loot_items_json` is refreshed by `sync-projection-to-local-core-tables.mjs --domains=npcs`, not by relation-to-local compatibility sync.
- DB writes touching `item_source_facts`, `item_source_details`, `item_npc_loot_relations`, `projection_npcs`, `item_acquisition_sources`, `npc_loot_entries`, or `npcs.loot_items_json` must run serially.
- Shared backend files must be edited serially:
  - `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
  - `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
  - `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`

---

## Parallelism Model

Allowed parallel lanes:

| Lane | Scope | Write targets |
| --- | --- | --- |
| Lane A | Buff alias inventory and backend test design | read-only first; later `AdminBuffControllerTest` |
| Lane B | Mimic loot source inventory and import/backfill design | read-only first; later new script/tests |
| Lane C | Runtime/API/UI verification inventory | read-only first; later focused UI copy/state only if needed |
| Lane D | Edge image gap TODO/monitor follow-up | docs/monitor only, no shared DB writes |

Serial-only steps:

- Any edit to `AdminBuffController.java`
- Any edit to shared NPC loot lookup code
- Any DB apply/backfill
- Any relation/projection sync apply
- Final audit and commit

---

## Phase 0: Freeze Baseline

Purpose:

- preserve current facts before repair
- prove whether the defect is API enrichment, missing data, or image resolution

Files:

- Create: `docs/audits/2026-05-09_buff-npc-loot-detail-baseline.md`
- Read: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Read: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Read: `scripts/dev/config/local-stack.config.json` without printing secrets

Steps:

- [ ] Record the current branch, commit, and clean/dirty state.
- [ ] Record current counts for Buff immune samples:
  - total raw entries
  - exact-resolved entries
  - alias-resolved entries
  - unknown/non-local entries
  - affected Buff count
- [ ] Record current counts for Mimic variants:
  - local `id`
  - `game_id`
  - `npcs.loot_items_json`
  - `npc_loot_entries`
  - `item_acquisition_sources`
  - `terria_v1_relation.item_source_facts`
  - `terria_v1_relation.item_npc_loot_relations`
  - `terria_v1_relation.projection_npcs`
  - if `id !== game_id`, record which identifier each runtime-derived loot endpoint uses
- [ ] Record current image gaps for the affected card types.
- [ ] Capture API payloads through authenticated admin context if available; otherwise record DB-level evidence and mark API smoke blocked by auth.

Exit gate:

- Baseline document exists.
- It distinguishes Buff alias-resolution defects from Mimic data-chain defects.
- It records that Mimic variant loot is absent from relation/projection/local, not merely hidden by the UI.

Stop condition:

- If baseline shows live DB facts changed materially from the counts above, stop and update the plan before implementation.

---

## Phase 1: Fix Buff Immune NPC Resolution

Purpose:

- make `immuneNpcSamples` contain resolved local NPC cards when local data exists
- prevent unresolved raw samples from rendering as fake cards with `npcId=null`

Files:

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`
- Optional frontend-only if backend contract keeps unresolved rows: `data-query-app/pages/entities/[type].vue`

Implementation requirements:

- [ ] Add backend tests for alias resolution:
  - raw sample `{"internalName":"PirateSCurse","name":"Pirate's Curse"}` resolves to local NPC `PirateGhost`
  - raw sample `{"internalName":"CorruptMimic","name":"Corrupt Mimic"}` resolves to local NPC `BigMimicCorruption`
  - alias-resolved samples include `npcDbId`, `npcId`, `internalName`, `name`, `nameZh`, `image`, and `imageUrl`
- [ ] Add backend tests for multi-match aliases:
  - `Phantasm Dragon` may match multiple local rows
  - exact `internalName/game_id` resolution still wins first
  - otherwise resolve by exact normalized display name first, then lowest positive `game_id`, then lowest DB `id`
  - expose an ambiguity marker such as `matchCount`, `matchedNpcIds`, or `resolutionStatus` when more than one local row matches
  - do not duplicate the same NPC row twice because both English and Chinese name keys matched
- [ ] Add backend tests for truly unresolved entries:
  - they are not returned in `immuneNpcSamples`
  - if surfaced for audit, they belong in a separate `unresolvedImmuneNpcSamples` array with raw metadata and `resolutionStatus`
  - they must not appear as normal card rows with `npcId=null`
- [ ] Update or replace any existing tests that still expect unresolved raw samples to remain inside `immuneNpcSamples`.
- [ ] Implement alias lookup from local `npcs` using normalized display names:
  - `name`
  - `name_zh`
  - optional `raw_json.localized.en.name`
  - optional `raw_json.localized.zh.name`
- [ ] Keep exact `internalName/game_id` resolution as the first priority.
- [ ] For alias multi-match, use this deterministic order:
  - prefer exact normalized English name over loose normalized name
  - prefer lowest positive `game_id`
  - then lowest DB `id`
- [ ] Expose unresolved raw samples only for audit/debug, not for normal NPC card rendering.

Expected state:

- Buff `39 CursedInferno` no longer shows `npcId=null` sample cards.
- Buff `20 Poisoned`, `24 OnFire`, `31 Confused`, and the other affected Buffs resolve alias samples from local NPC rows when available.
- `immuneNpcCount` remains the source count, while `immuneNpcSamples.length` reflects displayable resolved samples unless an explicit unresolved list is added.

Validation:

```powershell
cd back
mvn "-Dtest=AdminBuffControllerTest" test
```

API spot checks after restart or hot reload:

- `GET /admin/buffs/39`
- `GET /admin/buffs/20`
- `GET /admin/buffs/31`

Acceptance:

- `immuneNpcSamples[*].npcId` is never `null`.
- `immuneNpcSamples[*].imageUrl` is managed when the local NPC has a managed image.
- raw unresolved entries, if any remain, are only visible in `unresolvedImmuneNpcSamples` or raw JSON sections.

---

## Phase 2: Build Mimic Variant Loot Source Audit

Purpose:

- determine whether missing Mimic variant loot can be imported from existing local artifacts without hitting wiki at runtime
- produce an auditable candidate set before any DB write

Files:

- Create: `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- Create: `scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs`
- Create: `reports/audit/missing-mimic-variant-loot-YYYY-MM-DD.json`

Candidate sources to inspect, read-only:

- `data/wiki-crawler/report/npc/coverage-audit.latest.json`
- `data/wiki-crawler/output/**` or equivalent crawler output directories if present
- `data/standardized/npcs.standardized.json`
- `data/generated/npc-standardized-map.json`
- existing `reports/normal-npc-loot-*.json`
- `terria_v1_relation.item_source_facts`
- `terria_v1_relation.item_source_details`
- `terria_v1_relation.item_npc_loot_relations`
- `terria_v1_relation.projection_npcs`
- Missing candidate directories must be recorded as `artifact_not_found` or equivalent evidence, not treated as proof that the source never existed.

Audit output schema:

```json
{
  "generatedAt": "ISO timestamp",
  "database": {
    "local": "terria_v1_local",
    "relation": "terria_v1_relation"
  },
  "targets": [
    {
      "internalName": "BigMimicCorruption",
      "gameId": 473,
      "name": "Corrupt Mimic",
      "candidateStatus": "missing_source|source_found|already_materialized|not_expected",
      "artifactStatus": "present|missing|not_applicable",
      "sourceArtifacts": [],
      "candidateDropCount": 0,
      "resolvedItemCount": 0,
      "unresolvedItemCount": 0,
      "gapReason": "no_existing_local_artifact"
    }
  ],
  "summary": {
    "targets": 5,
    "sourceFound": 0,
    "materializable": 0,
    "blocked": 5
  }
}
```

Steps:

- [ ] Audit all Mimic variants, not only screenshot rows:
  - `PresentMimic`
  - `BigMimicCorruption`
  - `BigMimicCrimson`
  - `BigMimicHallow`
  - `BigMimicJungle`
- [ ] Also include known-good controls:
  - `Mimic`
  - `IceMimic`
  - `WaterBoltMimic`
- [ ] For each target, check local/relation/projection materialization counts.
- [ ] Search existing local artifacts for source rows.
- [ ] Resolve candidate item names/internal names against local `items`.
- [ ] Mark targets without local source artifacts as blocked instead of generating rows.

Exit gate:

- Audit report proves whether the missing variants are materializable from existing local data.
- No DB write has occurred.

Stop condition:

- If the only source is a live wiki page, stop and write a crawler/import plan. Do not runtime-fetch wiki in the admin API.

---

## Phase 3: Materialize Mimic Variant Loot If Source Exists

Purpose:

- when Phase 2 finds local source evidence, write missing Mimic variant loot through the same source-fact/relation/projection/local chain used by other NPC drops

Files:

- Create or modify a focused data script under `scripts/data/relation/` or `scripts/data/import/`
- Create or modify corresponding Node tests
- Create: `reports/mimic-variant-loot-backfill-dry-run-YYYY-MM-DD.json`
- Create: `reports/mimic-variant-loot-backfill-apply-YYYY-MM-DD.json`
- Modify only if needed: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`

Upstream input contract:

- Preferred durable input is `terria_v1_maint.maint_item_sources`, sourced from an existing local artifact or a traceable maint import.
- Each Mimic drop row must have a deterministic `record_key`, `item_internal_name`, `item_name`, `source_type='drop'`, `source_ref_type='npc'`, `source_ref_name`, `source_provider`, `source_page`, and complete `landing_*` trace fields.
- `raw_json` must preserve the original candidate evidence and include `sourceRefName`, `sourceRefInternalName`, `sourceRefResolution`, `quantityMin/quantityMax/quantityText`, `chanceValue/chanceText`, and optional `conditions/notes` when available.
- `sourceRefInternalName` must match the target local/maint NPC internal name (`PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, or `BigMimicJungle`) whenever display-name resolution is ambiguous.
- If the local artifact cannot provide traceable source fields, create a blocked audit/TODO entry instead of inventing `landing_*` metadata.

Required write path:

1. Update or generate the upstream maint/source inputs for the missing Mimic variants. Do not direct-write relation snapshots in the same script if `sync-maint-to-relation.mjs` will also run.
2. Rebuild `item_source_facts`, `item_source_details`, `item_npc_loot_relations`, and `projection_npcs` with `sync-maint-to-relation.mjs`.
3. Run `sync-projection-to-local-core-tables.mjs --apply=true --domains=npcs` to refresh `npcs.loot_items_json`.
4. Run `sync-relation-to-local-compat-tables.mjs --apply=true` to refresh `item_acquisition_sources` and `npc_loot_entries`.

Command boundary:

- Current code treats `sync-maint-to-relation.mjs --scopes=npc` as run metadata, not a proven write filter. Do not rely on it for NPC-only writes unless scope filtering is implemented and covered by tests first.
- If scope filtering is not implemented, run the full dry-run/apply path and record the wider snapshot impact instead of claiming NPC-only writes.
- Never apply a focused direct relation-row patch and then run `sync-maint-to-relation.mjs` unless the focused patch has first been converted into upstream inputs; the snapshot rebuild can overwrite direct relation rows.

Steps:

- [ ] Write failing tests for the chosen source-to-relation materializer.
- [ ] Dry-run backfill for all materializable missing Mimic variants.
- [ ] Dry-run must report:
  - rows to insert/update per target
  - resolved item count
  - unresolved item count
  - exact target DB tables
  - backup table/report names
  - maint `record_key` values for every planned source row
  - source artifact path and hash or content-derived evidence key for every planned row
- [ ] Apply only if dry-run has `unresolvedItemCount=0` or explicitly accepted unresolved rows are excluded.
- [ ] Rebuild relation/projection first, then run the local syncs in this order:
  - `sync-projection-to-local-core-tables.mjs --apply=true --domains=npcs`
  - `sync-relation-to-local-compat-tables.mjs --apply=true`
- [ ] Re-run NPC detail counts.

Expected state if source exists:

- `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, and `BigMimicJungle` have non-zero relation/projection/local loot counts matching source evidence.
- `AdminNpcController` detail payloads show actual local DB rows, not UI-generated rows.
- `AdminNpcRelationController` and `PublicNpcAggregateController` read the same materialized loot truth.

Expected state if source does not exist:

- No DB rows are fabricated.
- A blocker is documented in the audit:
  - missing local crawler artifact
  - missing item resolution
  - unsupported source structure
- Admin UI may show a truthful empty state such as `No structured local loot data`, but not invented drops.

Validation SQL after apply:

```sql
SELECT n.internal_name, n.id AS local_id, n.game_id,
       JSON_LENGTH(n.loot_items_json) AS loot_json_count,
       (SELECT COUNT(*) FROM npc_loot_entries x WHERE x.npc_id = n.id AND x.deleted = 0) AS loot_rows,
       (SELECT COUNT(*) FROM item_acquisition_sources s
        WHERE s.deleted = 0 AND s.status = 1
          AND s.source_type = 'drop'
          AND s.source_ref_type = 'npc'
          AND s.source_ref_id = n.id) AS acquisition_rows_by_local_id,
       (SELECT COUNT(*) FROM item_acquisition_sources s
        WHERE s.deleted = 0 AND s.status = 1
          AND s.source_type = 'drop'
          AND s.source_ref_type = 'npc'
          AND s.source_ref_id = n.game_id) AS acquisition_rows_by_game_id
FROM npcs n
WHERE n.internal_name IN (
  'PresentMimic',
  'BigMimicCorruption',
  'BigMimicCrimson',
  'BigMimicHallow',
  'BigMimicJungle',
  'Mimic',
  'IceMimic',
  'WaterBoltMimic'
)
ORDER BY n.game_id;
```

```sql
SELECT r.npc_internal_name, COUNT(*) AS relation_loot_rows
FROM terria_v1_relation.item_npc_loot_relations r
WHERE r.deleted = 0
  AND r.status = 1
  AND r.npc_internal_name IN (
    'PresentMimic',
    'BigMimicCorruption',
    'BigMimicCrimson',
    'BigMimicHallow',
    'BigMimicJungle',
    'Mimic',
    'IceMimic',
    'WaterBoltMimic'
  )
GROUP BY r.npc_internal_name
ORDER BY r.npc_internal_name;

SELECT p.internal_name,
       JSON_LENGTH(p.loot_items_json) AS projection_loot_json_count
FROM terria_v1_relation.projection_npcs p
WHERE p.internal_name IN (
  'PresentMimic',
  'BigMimicCorruption',
  'BigMimicCrimson',
  'BigMimicHallow',
  'BigMimicJungle',
  'Mimic',
  'IceMimic',
  'WaterBoltMimic'
)
ORDER BY p.internal_name;
```

Stop condition:

- If source artifacts are incomplete for some variants, apply only complete variants if the report clearly lists the skipped variants and no shared table gets partial ambiguous rows.
- If item resolution is ambiguous, stop before apply and add item resolution review.
- If the only available candidate is an ad-hoc relation row that would be overwritten by `sync-maint-to-relation.mjs`, stop and convert that evidence into upstream maint/source inputs first.

---

## Phase 4: Runtime/API/UI Closeout

Purpose:

- ensure backend payloads and admin UI display truthful data states

Files:

- Modify only if needed: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify only if needed: `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- Modify only if needed: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify only if needed: `data-query-app/pages/entities/[type].vue`
- Modify tests accordingly, including `AdminNpcRelationControllerTest` if the derived-loot endpoint contract changes

Requirements:

- [ ] NPC detail must prefer structured local rows.
- [ ] If structured rows are empty but `inheritedLootEntries` exists, show inherited/prototype source clearly.
- [ ] If all loot sources are empty, show a clear empty state and do not show stale raw JSON as if it were structured loot.
- [ ] Buff detail must show resolved immune NPC cards only.
- [ ] If unresolved Buff samples are exposed, they must render as an audit/debug list, not as normal NPC cards.
- [ ] `/admin/npcs/{id}/loot`, `/admin/npcs/{id}/derived-loot`, and `/public/npcs/{id}/aggregate?include=loot` must all agree with the same local DB truth source.
- [ ] If local compatibility rows store `item_acquisition_sources.source_ref_id = npcs.id` but a runtime endpoint queries by `game_id`, either align the endpoint/query or record a blocking contract fix before claiming derived loot works.

Validation:

```powershell
cd back
mvn "-Dtest=AdminBuffControllerTest,AdminNpcControllerTest,AdminNpcRelationControllerTest,PublicNpcServiceImplImageTest,PublicNpcAggregateControllerTest" test
cd ..\data-query-app
pnpm run check
```

Manual acceptance pages:

- `http://localhost:3001/entities/buffs`
- `http://localhost:3001/entities/npcs`
- Buff detail examples:
  - `CursedInferno`
  - `Poisoned`
  - `Confused`
- Admin NPC relation APIs:
  - `GET /admin/npcs/85/loot`
  - `GET /admin/npcs/85/derived-loot`
- Public aggregate example:
  - `GET /public/npcs/85/aggregate?include=loot`
- NPC detail examples:
  - `Mimic`
  - `IceMimic`
  - `PresentMimic`
  - `BigMimicCorruption`
  - `BigMimicCrimson`

Acceptance:

- No Buff immune NPC card renders `ID --` or `NP` because of unresolved backend rows.
- Mimic variants with real local data show real local rows.
- Mimic variants without source data show a truthful local-data-empty state.

---

## Phase 5: Monitoring And TODO Closeout

Purpose:

- make these classes of defects visible before the user finds them by screenshot

Files:

- Modify: `docs/todo/backlog.md`
- Modify only if already supported by current monitor model: crawler monitor service/page files
- Create: `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`

Tasks:

- [ ] Add a TODO for general NPC drop coverage gaps beyond Mimics:
  - audit all local NPCs where relation/projection has zero loot but wiki crawler coverage says the page is resolved
  - classify as expected-empty vs missing-source vs missing-materialization
- [ ] Add a TODO for Buff immune sample alias coverage:
  - track exact-resolved, alias-resolved, unresolved counts
  - fail future checks if normal card payload returns `npcId=null`
- [ ] Add edge image gap TODO if not already tracked:
  - NPC base images missing: `4`
  - Item base images missing: `23`
  - Projectile base image missing: `1`
- [ ] If monitor already has suitable surface, add read-only metrics:
  - `buffImmuneSampleAliasResolvedCount`
  - `buffImmuneSampleUnresolvedCount`
  - `npcLootMissingMaterializationCount`
  - `mimicVariantLootMissingCount`

Completion evidence:

- Closeout audit lists:
  - files changed
  - tests run
  - DB reports generated
  - remaining blocked items
  - exact manual pages for user acceptance

---

## Multi-Agent Execution Recommendation

Recommended first dispatch:

- Agent A: read-only Buff alias contract and tests. Output exact expected backend payload shape and test names. No DB writes.
- Agent B: read-only Mimic loot source audit. Output source artifact candidates and whether materialization is possible. No DB writes.
- Agent C: read-only UI/API display audit. Output which sections need frontend changes after backend contract settles. No code writes unless assigned later.

Serial integration after dispatch:

1. Main agent implements `AdminBuffController` and tests.
2. Main agent reviews Agent B's report and decides whether Phase 3 has enough local evidence to write a backfill.
3. DB-writing backfill runs only after dry-run report is reviewed.
4. UI edits happen last and only if API contract changes require them.

Do not let multiple agents edit `AdminBuffController.java`, `AdminNpcController.java`, or the same DB write script concurrently.

---

## Final Completion Criteria

This work is complete only when all are true:

- Buff detail payloads no longer return normal `immuneNpcSamples` rows with `npcId=null`; unresolved rows, if any, are isolated in an audit/debug field.
- Alias-resolvable Buff samples resolve from local `npcs` and display managed local images when available.
- Mimic variant loot is either materialized through maint/relation/projection/local DB with evidence, or explicitly documented as blocked by missing local source artifacts.
- Admin UI and admin/public NPC detail APIs no longer present missing local Mimic loot as if it were a display bug.
- Tests cover Buff alias resolution, unresolved sample handling, and NPC loot truthfulness.
- A closeout audit records the exact DB counts before and after.
