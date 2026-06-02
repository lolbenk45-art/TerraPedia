# Biome Wikitext Policy Relation Design

Date: 2026-06-02

Branch: `plan/biome-wikitext-unresolved-2026-06-02`

## Goal

Turn the unresolved biome wikitext audit results into a conservative, reviewable policy plan that can guide later relation modeling without guessing entity mappings or writing to the database.

## Current Evidence

The first resolved ingest already wrote only unique item/NPC matches under scheme A. The remaining unresolved set is 42 rows:

- 24 missing local entities
- 14 ambiguous NPC rows
- 2 boss treasure-bag rows
- 2 armor-set rows

The follow-up local audits found more evidence, but none of it should be imported as a normal single item/NPC biome relation without an explicit policy decision.

## Policy

Use the evidence category to choose the next surface:

| Evidence | Policy action | DB write now |
| --- | --- | --- |
| Boss `Treasure Bag` rows | Treat as boss-detail loot projection evidence only. Boss detail already exposes `drop_source_kind = 'treasure_bag'` loot. | No |
| Armor/set rows | Treat as collection or armor-set relation candidates, not single item relations. | No |
| Component set rows such as `Mummy set` and `Pedguin's set` | Treat as item-set/component collection candidates. | No |
| Furniture family rows such as `Obsidian furniture` | Treat as item collection family candidates. | No |
| Ambiguous NPC rows | Keep unresolved until a variant policy is chosen. | No |
| Normalized NPC rows such as dragonflies | Keep user-gated even when there is one normalized candidate, because family variants are also present. | No |
| Weak family evidence | Use only as backfill/search evidence. | No |
| Still missing rows | Keep unresolved. | No |

## Data Model Direction

Do not reuse `biome_relations` for this work. It is a biome-to-biome table with `biome_id`, `related_biome_id`, and `relation_type`; using it for boss, armor-set, or item collection targets would overload its meaning.

Do not write these rows to `item_biomes` or `npc_biomes` in this phase. `item_biomes` is for resolved single-item relations, and `npc_biomes` is for resolved single-NPC relations.

If later approved, prefer explicit typed tables over a broad polymorphic relation table:

- `biome_boss_contexts`: biome to `boss_groups`, for reviewed boss encounter context only. Treasure Bag rows are excluded from this table unless the user separately approves a boss-biome context rule based on boss occurrence evidence, not loot evidence alone.
- `biome_armor_sets`: biome to `armor_sets`, for armor set candidates.
- `biome_item_collections`: biome to named collection keys and reviewed component item IDs, for furniture/banner/vanity set collections.

This keeps backend DTOs typed and avoids hiding unresolved collection semantics behind a generic target type.

## Phase 1 Deliverable

Create a dry-run policy plan report from the existing local reports:

- Input: `reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json`
- Input: `reports/biome-wikitext-missing-local-evidence-audit-2026-06-02.json`
- Output: `reports/biome-wikitext-policy-relation-plan-2026-06-02.json`

The report must be evidence-only:

- every row has `evidenceOnly: true`
- every row has `needsUserDecision: true`
- every row has `dbWriteAction: "none"`
- every row has `resolvedMapping: null`
- no import/apply flag exists
- no SQL statement, target-table write payload, alias map, or import plan exists
- no DB connection exists
- no crawler/fetch/import/backfill/load command is executed

The two inputs must be joined by stable row identity:

- `inputIndex`
- `original.rowKey`

The policy-plan builder must reject duplicate local-domain rows, duplicate missing-evidence rows, missing-evidence rows that do not belong to a missing local-domain row, and missing-evidence rows whose `original.rowKey` does not match the local-domain row.

## Acceptance

The phase is complete when the report accounts for all 42 unresolved rows and classifies them into next-action categories without producing any resolved mapping or database write plan.

Expected category counts for the current 2026-06-02 reports:

| Policy action | Count |
| --- | ---: |
| `boss_treasure_bag_projection_only` | 2 |
| `armor_set_relation_schema_needed` | 2 |
| `item_set_component_collection_schema_needed` | 2 |
| `item_family_collection_schema_needed` | 1 |
| `ambiguous_npc_variant_policy_needed` | 14 |
| `normalized_npc_candidate_policy_needed` | 3 |
| `weak_npc_family_backfill_clue_only` | 16 |
| `still_missing_entity_evidence_needed` | 2 |

## Follow-Up Gates

Before any later schema, import, API, or UI work:

1. Ask the user which relation surfaces to create.
2. Add migrations and import scripts only after that explicit approval.
3. Keep ambiguous NPC and weak family evidence unresolved unless the user chooses a concrete variant/family policy.
4. Run dry-run first for every new import path.
