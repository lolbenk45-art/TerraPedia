# Item Cutover Open Issues

**Date:** 2026-04-26

**Purpose:** Consolidate the remaining facts and risks before generating the final item cutover milestones. This file is issue-first and does not prescribe execution order.

---

## Verified Current State

- `projection_npcs`, `projection_projectiles`, and `projection_buffs` are already switchable.
- `projection_items` has no remaining field-level blocker.
- `projection_items.image` is currently fully backfilled for shared rows by a temporary `local.items.image` fallback.
- `projection_items` is still blocked as a whole because row membership does not exactly match `local.items`.
- Latest readiness result:
  - `items.status = blocked`
  - `items.blockingFields = none`
  - `items.missingInProjection = 3`
  - `items.extraInProjection = 10`

---

## Remaining Blocking Issues

### 1. Three `local.items` rows have no maint-backed source chain

Rows:

- `ZH_RECIPE_BLUE_JELLYFISH_BAIT`
- `ZH_RECIPE_GREEN_JELLYFISH_BAIT`
- `ZH_RECIPE_PINK_JELLYFISH_BAIT`

Verified state:

- Present in `terria_v1_local.items`
- Absent from `terria_v1_maint.maint_items`
- Absent from `terria_v1_maint.maint_item_page_recipes`
- Absent from `terria_v1_maint.maint_recipe_page_recipes`
- Absent from `data/standardized/items.standardized.json`

Implication:

- These are not rebuildable from the current maint/standardized chain.
- They must be handled as one of:
  - explicit exclusion from cutover acceptance
  - formal backfill into maint through a new source-backed path
  - temporary local compatibility overlay with explicit audit trace

Current planning assumption:

- Treat them as row-set exceptions until a formal maint source exists.

### 2. Ten `projection_items` rows come from weak maint landing facts and are not present in `local.items`

Rows:

- `Fake_newchest1`
- `Fake_newchest2`
- `OgreMask`
- `GoblinMask`
- `GoblinBomberCap`
- `EtherianJavelin`
- `KoboldDynamiteBackpack`
- `BoringBow`
- `BossBagOgre`
- `BossBagDarkMage`

Verified state:

- Present in `terria_v1_maint.maint_items`
- Present in `terria_v1_relation.relation_items`
- Present in `terria_v1_relation.projection_items`
- Absent from `terria_v1_local.items`
- Absent from `data/standardized/items.standardized.json`
- Source chain is `terraria.wiki.gg -> Module:Iteminfo/data -> wiki.module.iteminfo`
- Raw payloads are weak and often contain only `id` and `internalName`, with missing `english_name`

Implication:

- These rows have a landing trace, but not enough validated business facts to justify strict local replacement.
- They behave more like weak-source candidates or upstream residue than accepted production items.

Current planning assumption:

- Filter them out of `projection_items` for strict local replacement unless a stronger source chain is established.

### 3. Current image parity depends on a temporary local fallback

Verified state:

- Shared-row image parity is currently achieved by filling `projection_items.image` from `local.items.image` only when the maint-backed image is missing.
- A background wiki page refresh is still running and may later improve `maint_item_images`.

Implication:

- Current image parity is operationally useful, but not a pure maint-backed final state.
- A later cleanup milestone is still required to re-measure how much of image coverage can be shifted back to maint-only.

Current planning assumption:

- Keep local image fallback in place for current cutover readiness.
- Do not treat this as the final steady-state image architecture.

### 4. Strict cutover and effective cutover are now different acceptance modes

Verified state:

- If the 13 row-set exceptions above are excluded, `projection_items` matches local on field completeness.
- If strict one-to-one row parity is required with no exclusions, `projection_items` is still blocked.

Implication:

- Final milestone planning must explicitly separate:
  - effective replacement readiness
  - strict row-identical replacement readiness

Current planning assumption:

- Build milestones toward strict replacement, but keep the intermediate “effective replacement” state visible because it is already achieved.

---

## Planning Constraints

- Do not introduce guessed business facts.
- Prefer maint-backed and auditable chains when facts are promoted into relation.
- Temporary local fallbacks must be explicit, narrow, and reversible.
- Planning should avoid reopening already-closed field-level work for items.

---

## Recommended Planning Focus

The next milestone set should no longer optimize field coverage. That work is done.

The remaining milestones should focus on:

1. Row-set adjudication for the 3 missing and 10 extra item rows
2. Final cutover acceptance rules for strict vs effective replacement
3. Eventual removal or downgrade of temporary local image fallback once maint image coverage catches up
