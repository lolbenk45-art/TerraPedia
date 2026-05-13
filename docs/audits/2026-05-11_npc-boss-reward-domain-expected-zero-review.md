# NPC Boss Reward Domain Expected-Zero Review

Review date: 2026-05-11

## Decision

The following boss NPC rows are expected-zero in the normal NPC drop domain because their rewards are modeled through the boss reward/local boss compatibility path, not as ordinary `npc_drop` rows:

- `EyeofCthulhu`
- `KingSlime`
- `QueenBee`

This does not mean the bosses have no rewards. Their local compatibility rows are present with `drop_source_kind` values such as `direct_boss` and `treasure_bag`, and the NPC runtime parity audit deliberately scopes ordinary NPC drops to `NULL` or `npc_drop`.

## Evidence

- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs` preserves non-NPC-drop rows while rebuilding `npc_drop` rows.
- `scripts/data/audit/npc-domain-loot-chain-audit.mjs` and `scripts/data/audit/npc-loot-runtime-parity-audit.mjs` scope NPC drop evidence to ordinary NPC drop rows.
- `docs/superpowers/plans/2026-04-29-npc-item-relation-complete-chain.md` documents boss item rewards as a separate relation path.

## Boundary

Do not materialize these boss rewards into `item_npc_loot_relations` as ordinary NPC drops to satisfy NPC domain closure. Boss reward closure belongs to the boss relation path.
