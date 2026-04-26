# Category And Recipe Relation Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the backend's dependency on stale local `category` and `recipe` business data by rebuilding local-compatible category and recipe tables from current wiki-backed sources.

**Architecture:** Keep `terria_v1_local` as the backend runtime database so existing Spring Boot queries and admin CRUD stay stable. Rebuild `recipes`, `recipe_ingredients`, and `recipe_stations` from `terria_v1_relation.item_recipe_*`, and rebuild `category`, `item_category_rel`, and `items.category_id` from current wiki-backed classification sources instead of old local rows. Do not replace the app taxonomy tree with raw wiki taxonomy; map into the existing app category contract and only import what can be resolved deterministically.

**Tech Stack:** Spring Boot, MyBatis Plus, Node.js, mysql2, PowerShell local stack scripts, Markdown reports.

---

## Scope

- Included:
  - recipe local table rebuild from relation recipe facts
  - category local table rebuild from wiki-backed classification sources
  - `items.category_id` and `item_category_rel` refresh
  - dry-run/apply scripts, reports, and targeted verification
- Not included:
  - moving backend runtime DB away from `terria_v1_local`
  - raw wiki taxonomy tree exposure through `/categories`
  - non-deterministic import of unresolved zh-only recipe rows
  - MinIO image cutover work

## Current Baseline

- Backend runtime DB: `terria_v1_local`
- Recipe consumers:
  - `back/src/main/java/com/terraria/skills/controller/ItemRecipeController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/RecipeServiceImpl.java`
  - `back/src/main/java/com/terraria/skills/service/impl/RecipeTreeServiceImpl.java`
- Category consumers:
  - `back/src/main/java/com/terraria/skills/controller/CategoryController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/CategoryManagementServiceImpl.java`
  - `back/src/main/resources/mapper/ItemMapper.xml`
- Local counts:
  - `category`: `137`
  - `item_category_rel`: `13061`
  - `recipes`: `8539`
  - `recipe_ingredients`: `14409`
  - `recipe_stations`: `11576`
- Relation counts:
  - `category_nodes`: `2175`
  - `item_category_assignments`: `1758`
  - `item_recipe_heads`: `7399`
  - `item_recipe_ingredients`: `12345`
  - `item_recipe_stations`: `10146`
- Maint counts actually used by relation/category scripts:
  - `maint_categories`: `6`
  - `maint_item_categories`: `2047`
  - `maint_item_recipes`: `3203`
  - `maint_item_page_recipes`: `1171`
  - `maint_recipe_page_recipes`: `3663`
- Risk already confirmed:
  - current local recipe rows are stale and can point to the wrong `result_item_id`
  - current backend category tree depends on app codes like `WEAPON`, `TOOL`, `CONSUMABLE`, `MATERIAL`, `FURNITURE`, `AMMUNITION`, `ACCESSORY`, `VANITY`, `DYE`, `PET`, `MOUNT`, `CRITTER`, `MISC`
  - raw `relation.category_nodes` is wiki taxonomy and cannot replace the app tree directly

## Milestones

### M1: Freeze Contract And Baseline

**Files:**
- Create: `docs/superpowers/plans/2026-04-26-category-recipe-relation-cutover.md`
- Create: `reports/relation/category-recipe-cutover-baseline-2026-04-26.json`
- Create: `reports/relation/category-recipe-cutover-baseline-2026-04-26.md`

- [x] Record local vs relation vs maint counts for category and recipe source tables.
- [x] Record backend entrypoints and current contract assumptions.
- [x] Record cutover rule: recipe comes from relation, category comes from app taxonomy mapping, not raw wiki tree.

### M2: Recipe Local-Compatible Rebuild

**Files:**
- Create: `scripts/data/relation/sync-relation-recipes-to-local.mjs`
- Create: `scripts/data/relation/sync-relation-recipes-to-local.test.mjs`
- Create: `reports/relation/recipe-local-sync-2026-04-26.json`

- [x] Write failing tests for dry-run planning, internal-name item mapping, station mapping, and apply SQL shape.
- [x] Implement dry-run/apply recipe sync from `item_recipe_heads`, `item_recipe_ingredients`, and `item_recipe_stations`.
- [x] Rebuild `recipes`, `recipe_ingredients`, and `recipe_stations` from resolvable relation rows only.
- [x] Keep unresolved rows in the report instead of writing guessed local rows.

### M3: Category Local-Compatible Rebuild

**Files:**
- Create: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
- Create: `reports/relation/category-local-sync-2026-04-26.json`

- [x] Write failing tests for category definition seeding, primary category mapping, related category relation sync, and dry-run reporting.
- [x] Refactor the existing wiki category sync script into testable exported helpers without changing its runtime contract.
- [x] Rebuild `category`, `item_category_rel`, and `items.category_id` from wiki-backed classification instead of stale local rows.
- [x] Preserve the app taxonomy tree consumed by `CategoryManagementServiceImpl`.

### M4: Verification And Runtime Safety

**Files:**
- Modify: `reports/relation/replacement-readiness-2026-04-25.md`
- Create: `reports/relation/category-recipe-cutover-verification-2026-04-26.md`

- [x] Run targeted Node tests for recipe and category sync scripts.
- [x] Run dry-run then apply for recipe sync and category sync.
- [x] Run targeted backend tests for category and recipe consumers.
- [x] Confirm local stack still starts and key item/category/recipe endpoints respond correctly.

## Execution Order

1. Freeze and write the baseline reports.
2. Implement and verify recipe sync first.
3. Implement and verify category sync second.
4. Apply recipe sync to `terria_v1_local`.
5. Apply category sync to `terria_v1_local`.
6. Re-run backend tests and local stack startup.

## Cutover Rules

- Never edit an already-applied Flyway migration.
- Never use old local `recipes` or `item_category_rel` rows as source facts.
- Do not replace `/categories` with raw wiki taxonomy.
- Only write rows that resolve deterministically to local item/category/station identities.
- Put unresolved rows into reports; do not guess.
- If a script applies data, it must support dry-run first.

## Success Criteria

- Recipe success:
  - local `recipes`, `recipe_ingredients`, and `recipe_stations` are rebuilt from current relation rows
  - obvious stale local mis-links are removed
  - `/items/{id}/recipes` and `/items/{id}/recipe-tree` still work
- Category success:
  - local `category` stays compatible with `CategoryManagementServiceImpl`
  - `items.category_id` and `item_category_rel` come from current wiki-backed classification
  - `/categories`, `/categories/items`, and item category filtering still work
- Runtime success:
  - targeted Node tests pass
  - targeted Maven tests pass
  - local stack starts on backend `18088`, front `5174`, admin `3001`
