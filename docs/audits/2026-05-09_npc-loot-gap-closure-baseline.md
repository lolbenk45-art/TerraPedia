# NPC Loot Gap Closure Baseline

Date: 2026-05-09
Branch: `fix/npc-loot-gap-closure`
Baseline commit: `b88aa6b`
Capture time: `2026-05-09T03:36:05.861Z`

## Scope

This baseline supports `docs/plans/2026-05-09_npc-loot-gap-closure-plan.md`.

The target defect is NPC structured loot missing from local runtime tables. The fix must close the chain from traceable source evidence through relation/projection/local compatibility tables. It must not hand-edit runtime tables or display crawler/wiki data directly in the admin UI.

## Runtime Databases

- Local DB: `terria_v1_local`
- Relation DB: `terria_v1_relation`
- Maint DB expected for later sync phases: `terria_v1_maint`

## Read-Only Baseline Counts

| Check | Result |
| --- | ---: |
| Active local NPCs | `762` |
| Local `npc_loot_entries` rows | `1020` |
| Local NPCs with structured loot | `231` |
| Relation `item_npc_loot_relations` rows | `674` |
| Relation NPCs with loot | `206` |
| Projection NPCs with non-empty `loot_items_json` | `206` |
| Projection has loot while local compat has zero | `0` |
| `loot / ambiguous / npc_source_ambiguous` audits | `70` |
| `loot / unresolved / npc_source_unresolved` audits | `1494` |

Interpretation:

- The confirmed missing-data issue is upstream of local compatibility sync for the target Mimic variants.
- Existing projection/local agreement does not prove source completeness. It only proves local compat is not behind projection for rows already present in projection.
- The `70` ambiguous loot audits are candidate inputs for guarded `positive_id_fallback` analysis, not automatic promotion.
- The `1494` unresolved loot audits include non-NPC source rows and must be classified before any DB writer runs.

## Mimic Variant Baseline

| NPC | local id | game id | relation loot | projection loot | local loot |
| --- | ---: | ---: | ---: | ---: | ---: |
| `PresentMimic` | `341` | `341` | `0` | `0` | `0` |
| `BigMimicCorruption` | `473` | `473` | `0` | `0` | `0` |
| `BigMimicCrimson` | `474` | `474` | `0` | `0` | `0` |
| `BigMimicHallow` | `475` | `475` | `0` | `0` | `0` |
| `BigMimicJungle` | `476` | `476` | `0` | `0` | `0` |

Interpretation:

- These five rows remain blocked for structured loot.
- A later fix may materialize them only if variant-specific source evidence exists or a reviewed mapping contract is checked in.
- Generic `Mimics` evidence must not be fanned out to variants by default.

## Guardrails For Execution

- No DB writer ran while capturing this baseline.
- Phase 1 audit must be read-only and report `blocked/db_unavailable` if DB is unreachable.
- Phase 2 may only resolve `positive_id_fallback` rows under explicit representative-family guardrails.
- Phase 3 may not fabricate Mimic variant loot from generic `Mimics` rows.
- Phase 4 dry-runs must be compared against current-state audit output; current-state audit alone is not proof that dry-run rows were applied.
