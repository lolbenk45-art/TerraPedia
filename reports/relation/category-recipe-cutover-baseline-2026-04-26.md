# Category / Recipe Cutover Baseline

Date: `2026-04-26`

## Databases

- Runtime: `terria_v1_local`
- Relation: `terria_v1_relation`
- Maint: `terria_v1_maint`

## Counts

| Layer | Table | Rows |
| --- | --- | ---: |
| local | `category` | 137 |
| local | `item_category_rel` | 13061 |
| local | `recipes` | 8539 |
| local | `recipe_ingredients` | 14409 |
| local | `recipe_stations` | 11576 |
| relation | `category_nodes` | 2175 |
| relation | `item_category_assignments` | 1758 |
| relation | `item_recipe_heads` | 7399 |
| relation | `item_recipe_ingredients` | 12345 |
| relation | `item_recipe_stations` | 10146 |
| maint | `maint_categories` | 6 |
| maint | `maint_item_categories` | 2047 |
| maint | `maint_item_recipes` | 3203 |
| maint | `maint_item_page_recipes` | 1171 |
| maint | `maint_recipe_page_recipes` | 3663 |
| maint | `maint_category_nodes` | 0 |
| maint | `maint_item_category_assignments` | 0 |

## Key Findings

- Backend still reads category and recipe business tables from `terria_v1_local`.
- Relation recipe tables are populated, but only `3829` recipe heads are currently `resolved`; `3570` are still unresolved.
- Local recipe data is stale enough to contain obvious wrong `result_item_id` links.
- Category import cannot use raw `relation.category_nodes` directly because the backend expects app taxonomy codes such as `WEAPON`, `TOOL`, `CONSUMABLE`, `MATERIAL`, `FURNITURE`, `AMMUNITION`, `ACCESSORY`, `VANITY`, `DYE`, `PET`, `MOUNT`, `CRITTER`, and `MISC`.
- The actual category script inputs are `maint_categories` and `maint_item_categories`; `maint_category_nodes` and `maint_item_category_assignments` are empty and are not valid cutover sources for this phase.
- `items.category_id` must be rebuilt together with `item_category_rel`, because item search, detail, and statistics queries read both.

## Entrypoints

- Category:
  - `back/src/main/java/com/terraria/skills/controller/CategoryController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/CategoryManagementServiceImpl.java`
  - `back/src/main/resources/mapper/ItemMapper.xml`
- Recipe:
  - `back/src/main/java/com/terraria/skills/controller/ItemRecipeController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/RecipeServiceImpl.java`
  - `back/src/main/java/com/terraria/skills/service/impl/RecipeTreeServiceImpl.java`
- Data scripts:
  - `scripts/data/relation/recipe-relation-processor.mjs`
  - `scripts/data/relation/category-relation-processor.mjs`
  - `scripts/data/relation/sync-maint-to-relation.mjs`
  - `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`

## Cutover Rule

- Recipe: rebuild local tables from relation tables and import only deterministically resolvable rows.
- Category: rebuild local-compatible app taxonomy data from current wiki-backed category classification sources, not from stale local rows and not from raw wiki taxonomy nodes.
