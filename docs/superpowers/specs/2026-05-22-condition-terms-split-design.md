# Condition Terms Split Design

## Goal

Separate local logical condition vocabulary from wiki-backed world contexts so admin data, imports, and relation references no longer mix Terraria world phenomena with TerraPedia-derived requirement terms.

## Decision

Use a clean split:

- `world_contexts` remains the wiki-backed world-state domain.
- A new `condition_terms` domain owns local requirement vocabulary.
- Existing relation tables may continue using `ref_type` and `ref_id`, but must distinguish `WORLD_CONTEXT` from `CONDITION_TERM`.

This split is intentionally narrower than a full condition engine. It fixes the current source-provenance problem without redesigning every NPC, recipe, loot, and progression condition at once.

## Non-Negotiable Scope Boundary

Do not modify the biome domain in this work.

Biomes are being handled by other branches. This split must not create, edit, migrate, backfill, import, rename, or reclassify biome rows, biome images, biome crawler output, biome admin behavior, or biome relation semantics.

If a relation currently points to a biome-like concept, leave it as-is unless it is one of the local condition terms explicitly listed in this spec. Biome cleanup belongs to the biome branch, not this split.

## Current Problem

`world_contexts` currently contains both:

- Real wiki-backed contexts such as day, night, rain, Blood Moon, moon phases, and events.
- Local requirement terms such as `MOON_PHASE_1_4`, `PIRATE_INVASION_COMPLETED`, and `ANY_MECH_BOSS_DEFEATED`.

The admin UI labels those local rows as `LOCAL_CONDITION`, but they still live in the same table and use the same world-context API. That makes provenance hard to reason about:

- A local parsing term can look like a wiki entity.
- Future wiki imports may accidentally preserve, rewrite, or delete local terms.
- NPC shop and recipe condition relations cannot clearly express whether they reference a real world state or a local unlock condition.

## Wiki Classification Basis

The split follows the wiki's own conceptual boundaries:

- `Events` groups event pages into peaceful events, weather events, pre-Hardmode events, and Hardmode events.
- `Moon phase` is a game-mechanics page with eight phases and phase-dependent content. It is not an event.
- `Weather` is an entry point for weather-related concepts; rain, sandstorm, windy day, thunderstorm, and starfall are handled as weather or event concepts according to the world-context import rules.
- Biome classification is deliberately not changed here.

## Target Domains

### World Contexts

`world_contexts` should contain observable in-world states or phenomena that can be sourced from wiki pages.

Allowed types for this work:

- `TIME`
- `WEATHER`
- `EVENT`
- `MOON_PHASE`
- `ENVIRONMENT`

`LOCAL_CONDITION` should be retired from new world-context imports and admin creation paths once the split is implemented.

### Condition Terms

`condition_terms` should contain TerraPedia local vocabulary used to normalize logical requirements extracted from NPC shops, recipes, or similar source text.

Initial rows to move out of `world_contexts`:

- `MOON_PHASE_1_4`
- `MOON_PHASE_LISTED`
- `MARTIAN_MADNESS_COMPLETED`
- `PIRATE_INVASION_COMPLETED`
- `SNOW_LEGION_COMPLETED`
- `ANY_MECH_BOSS_DEFEATED`
- `ALL_MECH_BOSSES_DEFEATED`

Suggested fields:

- `id`
- `code`
- `name_en`
- `name_zh`
- `term_type`
- `description`
- `source_provider`
- `source_page`
- `raw_json`
- `sort_order`
- `status`
- `deleted`
- `created_at`
- `updated_at`

Suggested `term_type` values:

- `MOON_PHASE_RANGE`
- `EVENT_COMPLETED`
- `BOSS_PROGRESS`
- `GAME_PROGRESS`

The term type is not a wiki category. It is an internal normalization category for requirement logic.

## Relation Semantics

Existing relation tables can keep their polymorphic shape during this split:

- `npc_shop_conditions.ref_type/ref_id`
- `recipe_context_requirements.ref_type/ref_id`

Supported reference types after implementation:

- `WORLD_CONTEXT`: points to `world_contexts.id`
- `CONDITION_TERM`: points to `condition_terms.id`

Do not add `BIOME` handling in this work. If an existing table already supports biome references, leave that behavior untouched.

## Migration Strategy

Use a compatibility migration:

1. Create `condition_terms`.
2. Copy the seven local condition rows from `world_contexts` into `condition_terms`.
3. Update `npc_shop_conditions` and `recipe_context_requirements` rows that currently point to those seven world-context ids:
   - change `ref_type` from `WORLD_CONTEXT` to `CONDITION_TERM`
   - change `ref_id` to the matching `condition_terms.id`
4. Soft-delete or deactivate the seven `LOCAL_CONDITION` rows in `world_contexts` after all references move.
5. Keep wiki-backed moon phase rows such as `NEW_MOON` and `FULL_MOON` in `world_contexts`.

The migration must be idempotent enough for local development reruns. It must not touch biome rows or biome-like references.

## Import And Transform Changes

World-context import generation should stop emitting local condition terms.

`transform-wiki-world-contexts-to-importable.mjs` should output wiki-backed contexts only. Local condition vocabulary should come from a separate condition-term seed or transform module.

Town NPC shop condition normalization should map:

- Real states like `DAY`, `NIGHT`, `BLOOD_MOON`, `WINDY_DAY`, `PARTY`, and real moon phases to `WORLD_CONTEXT`.
- Local phrases like moon phase ranges, completed events, and mechanical boss defeat requirements to `CONDITION_TERM`.

No crawler should be added for condition terms unless the source is a real page. For these initial seven rows, source provenance should remain `terrapedia_local` with `source_page = town_npc_shop_conditions`.

## Admin UX

The existing `/entities/world-contexts` page should show only wiki-backed world contexts after migration.

Add a separate admin entity page or route for condition terms. It should expose:

- code
- English and Chinese names
- term type
- source provider
- source page
- status
- relation usage visibility if cheap to query

The UI copy should make provenance explicit:

- World contexts: wiki-backed world states.
- Condition terms: local normalized requirement terms.

The UI must not present condition terms as wiki pages.

## Validation

Minimum implementation validation:

- Migration or import tests prove the seven local condition rows move to `condition_terms`.
- Relation tests prove NPC shop and recipe references are remapped to `CONDITION_TERM`.
- World-context transform tests prove `LOCAL_CONDITION` is no longer emitted.
- Admin contract tests prove `world-contexts` no longer lists `LOCAL_CONDITION`.
- Backend tests cover condition-term list/detail behavior if a new controller is added.
- `data-query-app` typecheck passes if the admin UI changes.

## Out Of Scope

- Any biome table, crawler, import, image, admin, or relation change.
- A full generic condition engine.
- Public frontend condition browsing.
- Remote push.
- Rewriting generated local artifacts under `data/terraPedia/generated/`.

