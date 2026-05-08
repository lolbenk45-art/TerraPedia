# TerraPedia TODO Backlog

Last updated: 2026-05-08

## Usage

- This file is the single backlog entrypoint for follow-up TODO items.
- New deferred work should be appended here instead of creating more one-off TODO files under `docs/todo/`.
- Keep each backlog item self-contained with recurrence risk, next-iteration actions, and current-scope notes.

## Projectile Placeholder Regression

Date: 2026-05-08

### Why This Can Recur

- Projectile zh sources can contain language-pack alias references such as `{$ProjectileName.ObsidianFire}` instead of a final display name.
- Current fix resolves the known projectile alias pattern, but future upstream data refreshes may introduce new alias rows or new token families.
- Other entity domains may eventually expose similar unresolved reference tokens if their zh/source pipelines accept template-like placeholders as valid localized text.

### Next Iteration TODO

- [ ] Add a repo-level audit that fails when unresolved `{$ProjectileName.*}` values appear in projectile standardized data, generated maps, or local DB snapshots.
- [ ] Extend the audit to detect generic unresolved localization tokens shaped like `{$...}` across other independent entities, then explicitly classify each token family as `supported resolver` or `hard reject`.
- [ ] Add an execution report step for zh enrich / independent-entity import that prints how many projectile zh names were resolved through alias indirection, so future regressions are visible in evidence files.
- [ ] Sample-scan items, buffs, and NPCs for the same placeholder pattern before the next data refresh cycle, and record whether they need dedicated resolvers or rejection rules.

### Current Scope Note

- This fix closes the current projectile admin/runtime issue and prevents known projectile alias placeholders from leaking to the page.
- It does not yet introduce a global placeholder audit gate for every entity family.

## Recipe Tree VersionScope Regression

Date: 2026-05-08

### Why This Can Recur

- Recipe tree child expansion still depends on heuristic `versionScope` normalization rather than a fully structured compatibility model.
- The current fix covers the known case where a base parent branch needs to expand child recipes that only exist in the modern Desktop/Console/Mobile scope.
- Future upstream recipe imports may introduce new scope text variants or other mixed-scope combinations that the current normalization and fallback rules do not classify.
- Because admin and public recipe-tree endpoints both share the same backend tree service, one scope-classification regression can silently affect multiple surfaces at once.

### Next Iteration TODO

- [ ] Add a repo-level audit that detects items whose base recipe-tree branch contains child ingredients with recipes available only under non-base scopes, and report which ones do not expand under current rules.
- [ ] Expand recipe-tree regression coverage beyond the current modern three-platform case to include other mixed-scope combinations such as old-gen console and Nintendo 3DS branches.
- [ ] Replace ad hoc scope-string fallback rules with a clearer compatibility model or mapping table so recipe-tree expansion does not depend on only a few hard-coded normalized strings.
- [ ] Add a repeatable API spot-check script for representative multi-step recipe chains and record evidence before future recipe data refreshes or tree-service refactors.

### Current Scope Note

- The current fix closes the confirmed Ankh Shield / Ankh Charm child-expansion regression and other same-pattern cases where base branches need modern-scope child recipes.
- It does not guarantee that every future `versionScope` text variant or non-modern mixed-scope branch will expand correctly without additional audit coverage.

## Buff Detail NPC Image Local-Source Boundary

Date: 2026-05-08

### Why This Can Recur

- Current local DB evidence shows `npcs.image_url` still stores wiki image URLs, not local managed image URLs.
- `maint_npc_images` and `maint_item_images` are currently empty, so NPC / projectile image maintenance has not closed the same way `item_images` has.
- Buff detail samples such as `immuneNpcSamples` and `inflictingNpcSamples` are easy to "make look right" by returning wiki URLs or item banner fallbacks, even when the local NPC / projectile image chain is not actually complete.
- If this boundary is not enforced, future fixes may again bypass the local DB source-of-truth requirement and ship UI that appears correct while still consuming crawler/wiki-origin image URLs directly.

### Next Iteration TODO

- [ ] Add a hard audit for admin/public NPC and projectile image consumers that fails when runtime payloads for NPC / projectile cards use raw wiki image URLs instead of local managed image URLs.
- [ ] Build and validate a real local managed image chain for NPCs and projectiles, equivalent in rigor to `items -> item_images.cached_url`, and document the owning tables plus sync/import path.
- [ ] Backfill or import managed NPC / projectile image records into the correct local tables before re-enabling any strict image display path that depends on them.
- [ ] Add a DB coverage report that distinguishes `managed local image`, `item/banner fallback only`, and `wiki-only / unresolved` for NPC and projectile samples used by buff detail cards.
- [ ] Prevent future controller-level hotfixes from bypassing this boundary by requiring any temporary fallback policy to be explicitly documented as a reviewed exception instead of silently returning wiki URLs.

### Current Scope Note

- As of this review, `item_images` is populated, but `maint_npc_images` and `maint_item_images` are empty, `npcs.image_url` is still wiki-origin, and sampled buff-detail NPC cards do not yet have a confirmed local managed NPC image source.
- The correct next-step is to close the local NPC / projectile image chain, not to continue masking the gap with direct wiki image output.

## NPC / Projectile MinIO Path Normalization And Legacy Object Audit

Date: 2026-05-08

### Why This Can Recur

- Current MinIO managed URL policy is configured with a single global `object-prefix: items`, so any entity type that reuses the same upload path logic can be materialized under `terrapedia-images/items/...` even when it is not an item.
- Local standardized/generated artifacts already show this cross-domain path drift: `npcs.standardized.json`, `npc-standardized-map.json`, and `projectiles.standardized.json` contain many managed URLs shaped like `http://localhost:9000/terrapedia-images/items/...`.
- Business-table state is not aligned with those artifacts: `npcs.image_url` is still wiki-origin for current rows, `projectiles.image_url` is effectively empty, and `maint_npc_images` is empty, so runtime/local-DB consumers and generated evidence are not describing the same image source layer.
- The current read-only evidence proves path taxonomy is mixed and legacy dated managed URLs exist, but it does not yet prove the MinIO object bytes themselves are stale or wrong. Without an object-level audit, future fixes may misdiagnose a path-contract bug as a pure cache-refresh problem, or the reverse.

### Next Iteration TODO

- [ ] Add a read-only audit that inventories managed image URLs for `items`, `npcs`, and `projectiles` separately, then flags any non-item entity whose managed URL still lands under the `terrapedia-images/items/...` prefix.
- [ ] Compare MinIO object keys, DB rows, and standardized/generated artifacts for NPC and projectile images so the repo can distinguish `path normalization bug`, `business-table sync gap`, and `truly stale/wrong cached object`.
- [ ] Define and document canonical object-prefix rules per entity family before any further NPC / projectile image backfill, instead of continuing to rely on the current global `items` prefix.
- [ ] Add a blocking audit for generated artifacts that rejects new NPC / projectile managed URLs under the item prefix once the canonical prefix contract is introduced.
- [ ] Verify a representative sample of suspect NPC / projectile objects by source URL, object key, and rendered image content before declaring any old-cache cleanup complete.

### Current Scope Note

- This review confirms the path-normalization problem is real: non-item NPC / projectile managed URLs already exist in local artifacts under the item MinIO prefix.
- This review does not yet prove that MinIO object content is old or semantically wrong; that requires a follow-up object-level audit against source URL and rendered content.
