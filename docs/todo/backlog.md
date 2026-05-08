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
