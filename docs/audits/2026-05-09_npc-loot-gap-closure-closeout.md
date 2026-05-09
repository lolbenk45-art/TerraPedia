# NPC Loot Gap Closure Closeout

Date: 2026-05-09
Branch: `fix/npc-loot-gap-closure`

## Scope

Closed the safe NPC loot gap class where upstream rows carried `sourceRefInternalName` with `sourceRefResolution=positive_id_fallback`, but relation sync kept them ambiguous even when they were representative segmented NPC families.

Did not fabricate Mimic variant loot. `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, and `BigMimicJungle` remain blocked until upstream source evidence becomes variant-specific or a reviewed mapping contract is added.

## Code Changes

- Added `scripts/data/audit/npc-loot-gap-closure-audit.mjs`.
- Added classification tests for:
  - safe representative `positive_id_fallback`
  - unsafe biome/tier/form variants
  - generic bucket sources
  - non-NPC source rows
  - DB unavailable state
- Updated `scripts/data/relation/item-source-relation-processor.mjs` to promote only representative-safe positive ID fallback rows.
- Updated NPC item relation bundle generation to preserve `sourceRefInternalName` and `sourceRefResolution` for traceable variant-specific rows.
- Tightened relation sync tests so snapshot clearing accepts the implementation's primary `TRUNCATE TABLE` path and fallback `DELETE FROM` path.

## Reports

- Baseline: `docs/audits/2026-05-09_npc-loot-gap-closure-baseline.md`
- Dry-run: `docs/audits/2026-05-09_npc-loot-gap-closure-dry-run.md`
- Post-apply audit: `reports/audit/npc-loot-gap-closure-2026-05-09-post-apply.json`
- Relation apply report: `reports/relation/relation-audit-2026-05-09.json`
- Projection/local report: `reports/relation/projection-to-local-core-sync-2026-05-09.json`
- Local compat report: `reports/relation/relation-to-local-compat-sync-2026-05-09.json`

## Pre/Post Counts

| Check | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Relation `item_npc_loot_relations` | `674` | `697` | `+23` |
| Formal `positive_id_fallback` relation rows | `0` | `23` | `+23` |
| Ambiguous loot audits | `70` | `47` | `-23` |
| Projection NPCs with non-empty `loot_items_json` | `206` | `215` | `+9` |
| Local `npc_loot_entries` | `1020` | `1043` | `+23` |

Representative local/API samples after apply:

| Query | First NPC | `lootEntryCount` | `inheritedLootEntryCount` |
| --- | --- | ---: | ---: |
| `Blood Eel` | `BloodEelHead` | `4` | `0` |
| `Devourer` | `DevourerHead` | `4` | `0` |
| `Wyvern` | `WyvernHead` | `1` | `0` |
| `Corrupt Mimic` | `BigMimicCorruption` | `0` | `0` |

Mimic variant post-counts:

| NPC | Relation loot | Projection loot | Local loot |
| --- | ---: | ---: | ---: |
| `PresentMimic` | `0` | `0` | `0` |
| `BigMimicCorruption` | `0` | `0` | `0` |
| `BigMimicCrimson` | `0` | `0` | `0` |
| `BigMimicHallow` | `0` | `0` | `0` |
| `BigMimicJungle` | `0` | `0` | `0` |

## Commands Run

```powershell
node --test scripts/data/audit/npc-loot-gap-closure-audit.test.mjs
node --test scripts/data/relation/item-source-relation-processor.test.mjs
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
node --test scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
node --test scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs
node scripts/data/audit/npc-loot-gap-closure-audit.mjs --write-report=true --date-tag=2026-05-09
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\verify-local-stack.ps1
```

Runtime API samples were verified through:

- `POST http://localhost:18088/api/auth/login`
- `GET http://localhost:18088/api/admin/npcs?search=Blood%20Eel&limit=10`
- `GET http://localhost:18088/api/admin/npcs?search=Devourer&limit=10`
- `GET http://localhost:18088/api/admin/npcs?search=Wyvern&limit=10`
- `GET http://localhost:18088/api/admin/npcs?search=Corrupt%20Mimic&limit=10`

## Notes

- The first relation apply command exceeded the tool timeout, but the underlying process continued and completed. `terria_v1_relation.relation_runs` later showed the run as `succeeded` with `finished_at=2026-05-09T04:00:38Z`.
- No hand edits were made to relation/projection/local runtime tables.
- The remaining 1546 audit gaps are non-NPC source rows, generic buckets, true ambiguous variant/tier rows, or four source gaps. They are not safe to materialize in this cycle.
