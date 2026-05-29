# Item Category Taxonomy Repair Design

## Goal

Repair the item category data chain so crawled Terraria wiki item pages drive the canonical item taxonomy instead of leaving gameplay categories such as mount summons, pets, accessories, ammunition, furniture subtypes, tools, armor parts, and consumables collapsed into legacy roots like `MATERIAL`.

The concrete failure that triggered this work is `DrillContainmentUnit`: the crawler has the item, item page, recipe result, image, and zh name, but the local item row and standardized output classify it as `MATERIAL` even though the wiki page describes it as a mount-summoning item.

## Current Evidence

- `data/standardized/items.standardized.json` contains 6131 items but only legacy category codes: `MATERIAL`, `FURNITURE`, `WEAPON`, `CONSUMABLE`, `PICKAXE`, `AXE`, `TOOL`, `HELMET`, `CHESTPLATE`, `LEGGINGS`, and `ARMOR`.
- The standardized item page envelope has 6131 records with `hasWikitext: true`, but it stores only metadata and lengths, not the actual wikitext needed for classification.
- Runtime DB `terria_v1_local` currently has `MOUNT` item count `0`.
- Verified mount-like samples currently under `MATERIAL`: `FuzzyCarrot`, `SlimySaddle`, `DrillContainmentUnit`, `CosmicCarKey`, `WitchBroom`, `RatMountItem`, and `RollerSkatesBlueMountItem`.
- `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs` already has a richer wiki-page classifier and dry-run/apply behavior, but its input path requires raw item pages. In this WSL workspace the shared raw item-pages directory is missing, so apply must be gated until raw pages are present.

## Source Chain

The trusted chain for category repair is:

```text
raw/wiki/item-pages/*.latest.json
  -> wiki page classifier
  -> category table definitions
  -> items.category_id primary category
  -> item_category_rel related category bridge
  -> backend category DTO/API
  -> frontend/admin consumers
```

`data/standardized/items.standardized.json` remains useful for stable item identity, legacy roots, and import compatibility. It is not sufficient by itself for final category accuracy because it is produced from the normalized iteminfo module, which does not preserve every gameplay taxonomy token.

## Scope

In scope:

- Expand shared category definitions so all classifier outputs have category rows and stable parentage.
- Add focused tests for mount summons and a representative spread of other common item categories.
- Add a read-only audit/smoke script that can run without writing DB rows and reports coverage, category distribution, suspicious `MATERIAL` rows, and missing raw-page blockers.
- Repair the wiki-page classifier where tests expose gaps.
- Produce a manual dry-run/apply sequence that updates local DB categories only after raw item pages are available.
- Validate that `DrillContainmentUnit` and representative samples no longer classify as `MATERIAL` when the classifier sees raw wiki page content.

Out of scope for this branch:

- Frontend layout, filter copy, or UX changes.
- Running crawler refreshes.
- Running DB-writing apply steps automatically.
- Replacing the full relation-layer architecture or changing item identity semantics.
- Hand-curating every item one by one as a permanent source of truth.

## Design

The repair should keep the existing script direction: category truth comes from raw wiki item pages, with standardized item records used as an identity and fallback layer.

`scripts/data/lib/item-category-normalization.mjs` becomes the shared taxonomy definition source for all import/backfill paths. It should include every category emitted by `sync-item-categories-from-wiki-pages.mjs`, including `ACCESSORY`, `AMMUNITION`, `PET`, `MOUNT`, `VANITY`, `DYE`, `CRITTER`, `MISC`, consumable leaves, material leaves, furniture leaves, tool leaves, weapon leaves, and armor part leaves.

`scripts/data/sync/sync-item-categories-from-wiki-pages.mjs` remains the DB synchronization entrypoint. Its classifier should prefer explicit wiki page evidence in this order:

1. Item infobox `type` tokens such as `Mount summon`, `Pet summon`, `Ammunition`, `Crafting material`, `Furniture`, `Tool`, and `Weapon`.
2. Wiki page template/show flags and article text only when the type token is absent.
3. Wiki categories and listcat values.
4. Name heuristics for known weakly-typed cases.
5. Standardized root fallback only as the last resort.

`MATERIAL` should no longer be a sticky category when an explicit wiki token says the item is a mount, pet, accessory, ammunition, tool, furniture subtype, or consumable subtype.

## Safety

All DB mutation remains manual-only:

- First run read-only tests.
- Then run audit script.
- Then run category sync with `--apply=false`.
- Only after reviewing the dry-run report, run `--apply=true`.

If raw item pages are missing, the audit and sync plan must stop with a clear blocker. They must not infer final taxonomy from `item_pages.standardized.json` metadata alone.

## Acceptance

Minimum acceptance after implementation:

- Unit tests prove `DrillContainmentUnit`, `SlimySaddle`, `FuzzyCarrot`, `CosmicCarKey`, `WitchBroom`, and `RatMountItem` classify to `MOUNT`.
- Unit tests prove at least one representative item for each expanded root or high-risk leaf: `PET`, `ACCESSORY`, `AMMUNITION`, `CONSUMABLE_POTION`, `CONSUMABLE_SUMMON`, `CONSUMABLE_GRAB_BAG`, `FURNITURE_CRAFTING_STATION`, `FURNITURE_LIGHT`, `TOOL_DRILL`, `TOOL_PICKAXE`, `TOOL_AXE`, `TOOL_CHAINSAW`, `ARMOR_PART_HEAD`, `ARMOR_PART_BODY`, `ARMOR_PART_LEGS`, and `MATERIAL_BAR`.
- Taxonomy tests prove every classifier output code has a category definition or migration/upsert path.
- Audit script reports `raw item pages missing` as a blocker in this WSL workspace instead of silently passing.
- With raw item pages available, dry-run output includes nonzero `MOUNT` classifications and shows the verified mount samples moving away from `MATERIAL`.
- No frontend code changes are required for this closure.

