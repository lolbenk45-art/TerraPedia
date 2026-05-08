# Projectile Placeholder Regression TODO

Date: 2026-05-08

## Why This Can Recur

- Projectile zh sources can contain language-pack alias references such as `{$ProjectileName.ObsidianFire}` instead of a final display name.
- Current fix resolves the known projectile alias pattern, but future upstream data refreshes may introduce new alias rows or new token families.
- Other entity domains may eventually expose similar unresolved reference tokens if their zh/source pipelines accept template-like placeholders as valid localized text.

## Next Iteration TODO

- [ ] Add a repo-level audit that fails when unresolved `{$ProjectileName.*}` values appear in projectile standardized data, generated maps, or local DB snapshots.
- [ ] Extend the audit to detect generic unresolved localization tokens shaped like `{$...}` across other independent entities, then explicitly classify each token family as `supported resolver` or `hard reject`.
- [ ] Add an execution report step for zh enrich / independent-entity import that prints how many projectile zh names were resolved through alias indirection, so future regressions are visible in evidence files.
- [ ] Sample-scan items, buffs, and NPCs for the same placeholder pattern before the next data refresh cycle, and record whether they need dedicated resolvers or rejection rules.

## Current Scope Note

- This fix closes the current projectile admin/runtime issue and prevents known projectile alias placeholders from leaking to the page.
- It does not yet introduce a global placeholder audit gate for every entity family.
