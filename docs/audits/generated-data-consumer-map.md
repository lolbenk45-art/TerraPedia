# Generated / Standardized Consumer Map

Status: P0.3 minimum viable audit  
Date: 2026-05-06  
Scope: read-only audit for `data/generated/**` and `data/standardized/**` in `G:\ClaudeCode\TerraPedia-dev\.worktrees\p0-source-stability`

## Goal

This document provides the first reusable consumer map for historical active outputs under `data/generated/` and `data/standardized/`.

It does **not** claim full-repo exhaustion. It locks down:

- the highest-value tracked artifacts that are still actively consumed
- the main consumer classes already visible in backend, admin, audit, import, maint, relation, and workflow scripts
- a lifecycle label for each mapped artifact so P0/P1 can decide what should migrate to canonical, stay transitional, or be retired

## Audit Method

Read-only evidence used in this pass:

- `docs/plans/2026-05-06_source-stability-traceability-execution-plan.md`
- `docs/audits/canonical-migration-boundary.md`
- `data/README.md`
- `data/standardized/_manifest.standardized.json`
- `data/standardized-view/_index.json`
- `back/src/main/java/**`
- `scripts/data/**`
- `data-query-app/**`

Search method:

- repository-wide `rg` for direct file-path consumers
- spot checks on real entrypoints that read these files
- no business code changes, no `.gitignore` changes, no DB writes

## Lifecycle Labels

| Label | Meaning |
| --- | --- |
| `active-transitional` | still on the hot path; current consumers read it directly; canonical replacement not done |
| `active-derived` | generated derivative used for admin/audit/import convenience, not trusted source-of-truth |
| `bridge-transitional` | temporary bridge output between old and target source chain |
| `snapshot-legacy` | historical snapshot kept in repo, current direct consumers not confirmed in this pass |
| `needs-followup` | visible artifact family exists, but this pass did not finish consumer-by-consumer confirmation |

## Consumer Classes

| Consumer class | Typical directories |
| --- | --- |
| Backend runtime | `back/src/main/java/**` |
| Admin UI / type contracts | `data-query-app/**` |
| Data import / sync | `scripts/data/import/**`, `scripts/data/sync/**`, `scripts/data/maint/**`, `scripts/data/relation/**` |
| Workflow / monitoring | `scripts/data/workflow/**`, `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java` |
| Audit / readiness gates | `scripts/data/audit/**` |
| Transform / generator | `scripts/data/transform/**`, `scripts/data/generate/**`, `scripts/data/fetch/**` |

## Mapped Artifacts

### `data/standardized/`

| Artifact | Current role | Representative consumers found | Main flow | Lifecycle |
| --- | --- | --- | --- | --- |
| `data/standardized/_manifest.standardized.json` | shared standardized dataset manifest | crawler monitor architecture layer; `import-standardized-to-db.mjs`; upstream monitor | standardized output inventory -> monitor/import/audit | `active-transitional` |
| `data/standardized/items.standardized.json` | primary standardized item dataset | zh/index and image workflows; maint sync scripts; category/item backfills; item group generator | standardized items -> maint/backfill/generators -> DB/report | `active-transitional` |
| `data/standardized/item_pages.standardized.json` | item page structured source | crawler monitor; local image/title sync; item rarity/period sync; missing image backfills | standardized item pages -> maint/local enrichment/backfill | `active-transitional` |
| `data/standardized/npcs.standardized.json` | primary standardized NPC dataset | zh/index; image sync; entity sync; NPC bridge/coverage chain | standardized NPCs -> maint/backfill/audit | `active-transitional` |
| `data/standardized/projectiles.standardized.json` | primary standardized projectile dataset | zh/index; image sync; entity sync; projectile backfill/readiness | standardized projectiles -> maint/backfill/audit | `active-transitional` |
| `data/standardized/buffs.standardized.json` | primary standardized buff dataset | zh/index; image sync; domain readiness; admin buff source check | standardized buffs -> maint/audit/admin readiness | `active-transitional` |
| `data/standardized/armor_sets.standardized.json` | armor set normalized dataset | admin armor set controller; image fetch scripts; standardized-view index | standardized armor sets -> admin/readiness/image workflows | `active-transitional` |
| `data/standardized/biomes.standardized.json` | biome normalized dataset | manifest and standardized-view index; entity completeness audit | standardized biomes -> audit/view split | `active-transitional` |

Notes:

- `_manifest.standardized.json` currently records 8 datasets: `items`, `buffs`, `npcs`, `projectiles`, `armor_sets`, `item_relations`, `biomes`, `item_pages`.
- `data/standardized-view/_index.json` confirms `standardized-view` is a downstream consumer of the standardized layer, not a source layer.
- `item_relations.standardized.json` is listed in the manifest but was not present in the current worktree listing under `data/standardized/`; treat that as a follow-up discrepancy, not as proof of deprecation.

### `data/generated/` high-value active files

| Artifact | Current role | Representative consumers found | Main flow | Lifecycle |
| --- | --- | --- | --- | --- |
| `data/generated/wiki-sync-progress.latest.json` | standalone crawl progress / monitor status | backend crawler monitor; workflow tests; item page crawl scripts | crawl runner -> progress JSON -> backend/admin monitor | `active-derived` |
| `data/generated/recipe-material-reference.json` | recipe group reference source | `AdminItemGroupController`; `AdminRecipeGroupController`; `RecipeTreeServiceImpl`; recipe relation sync; readiness audit | generated reference -> backend/admin/relation/import | `active-transitional` |
| `data/generated/recipe-group-overrides.json` | recipe group override layer | `AdminItemGroupController`; `AdminRecipeGroupController`; `RecipeTreeServiceImpl`; any-item-group audit | override file -> backend/admin/group merge | `active-transitional` |
| `data/generated/item-group-overrides.json` | central override layer shared by recipe/npc_shop/shimmer semantics | `AdminItemGroupController`; `RecipeTreeServiceImpl`; admin UI `item-groups.vue`; any-item-group audit | override file -> backend/admin/runtime merge -> downstream group consumers | `active-transitional` |
| `data/generated/wiki-bosses.latest.json` | boss import/readiness source | boss fetch/import/pipeline scripts; source dataset locator; domain readiness audit | fetch -> generated boss JSON -> import/readiness/landing registration | `active-transitional` |
| `data/generated/wiki-town-npc-maintenance.latest.json` | town NPC maintenance import input | town NPC import pipeline; admin town NPC maintenance controller; zh source index; readiness audit | fetch python -> generated latest -> import/admin/audit | `active-transitional` |
| `data/generated/buff-standardized-map.json` | buff source mapping derivative | admin buff controller; domain readiness audit; generator scripts | generated map -> admin/readiness support | `active-derived` |
| `data/generated/projectile-zh-map.json` | projectile zh/image supplement map | zh source index; projectile zh/image backfill; readiness audit | generated map -> backfill/readiness | `active-derived` |
| `data/generated/armor-set-definition-map.json` | armor set definition supplement | admin armor set controller; readiness audit; generator | generated map -> admin/readiness supplement | `active-derived` |
| `data/generated/shimmer/wiki-shimmer-manifest.latest.json` | shimmer import manifest | shimmer import script; readiness audit | transform -> shimmer manifest -> import/audit | `active-transitional` |
| `data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json` | shimmer item transform importable output | shimmer import script; item group override generator; any-item-group audit; readiness audit | transform -> shimmer importable data -> import/group audit | `active-transitional` |
| `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` | NPC bridge output used as transitional source | crawler monitor task registry; source dataset locator tests; npc buff backfill; npc-item relation bundle build; canonical migration boundary | crawler bridge -> bridge standardized NPCs -> relation/backfill/landing | `bridge-transitional` |

### `data/generated/` visible but not fully mapped in this pass

| Artifact family | Current observation | Lifecycle |
| --- | --- | --- |
| `data/generated/item-zh-map.json` | present in repo and referenced by item group override generation; downstream runtime usage not fully enumerated in this pass | `needs-followup` |
| `data/generated/npc-standardized-map.json` | present in repo and used as optional readiness evidence for bosses image readiness; direct broader consumer set not fully enumerated | `needs-followup` |
| `data/generated/npc-zh-map.json` | present in repo; no first-pass high-value runtime chain documented yet | `needs-followup` |
| `data/generated/shimmer/wiki-shimmer-context.importable.latest.json` | optional readiness evidence and likely import support; not fully enumerated here | `needs-followup` |
| `data/generated/shimmer/wiki-shimmer-decraft-rules.importable.latest.json` | generated shimmer derivative; direct consumer chain not fully enumerated here | `needs-followup` |
| `data/generated/shimmer/wiki-shimmer-entity-transforms.importable.latest.json` | generated shimmer derivative; direct consumer chain not fully enumerated here | `needs-followup` |
| `data/generated/shimmer/wiki-shimmer-npc-transforms.importable.latest.json` | generated shimmer derivative; direct consumer chain not fully enumerated here | `needs-followup` |
| `data/generated/shimmer/wiki-shimmer-python-scrape.latest.json` | rawer shimmer intermediate visible in repo; consumer chain not locked in this pass | `needs-followup` |
| `data/generated/wiki-armor-sets.*.json` timestamped snapshots | historical snapshots exist alongside active armor-set pipelines; current direct runtime reads not confirmed | `snapshot-legacy` |

## Flow Summary

### Standardized chain

`data/standardized/*.standardized.json` and `_manifest.standardized.json` are still active shared inputs for:

- monitor visibility
- maint/backfill sync scripts
- admin source checks
- readiness audits
- `standardized-view` split output generation

They are not just archival outputs. In the current repo state, they remain active transitional data contracts.

### Generated chain

`data/generated/` currently mixes at least four different roles:

- runtime monitor state, such as `wiki-sync-progress.latest.json`
- transitional import sources, such as `wiki-bosses.latest.json` and `wiki-town-npc-maintenance.latest.json`
- group/reference control files, such as `recipe-material-reference.json`, `recipe-group-overrides.json`, `item-group-overrides.json`
- derived support maps, such as `buff-standardized-map.json`, `projectile-zh-map.json`, `armor-set-definition-map.json`

This confirms the execution plan diagnosis: `generated/` is not a single semantic layer.

## First-Pass Conclusions

1. `data/standardized/` is still an active consumption layer, not a cold archive.
2. `data/generated/` contains both business-critical transitional inputs and convenience derivatives, so a single ignore/archive rule would be unsafe.
3. Any Item Group files are especially high risk because backend runtime, admin editing, relation sync, and audit all depend on the same generated files.
4. Shimmer and NPC bridge outputs already behave like transitional contracts and should be tracked as named exemptions until canonical replacement exists.
5. P0.3 can land as documentation first because the consumer shape is already visible from direct path reads without touching business code.

## Suggested Migration Buckets

| Bucket | Artifacts |
| --- | --- |
| highest-priority transitional contracts | `recipe-material-reference.json`, `recipe-group-overrides.json`, `item-group-overrides.json`, `wiki-bosses.latest.json`, `wiki-town-npc-maintenance.latest.json`, `wiki-crawler-npc-bridge/standardized/npcs.standardized.json`, `data/standardized/*.standardized.json`, `_manifest.standardized.json` |
| support derivatives to keep but not treat as trusted source | `wiki-sync-progress.latest.json`, `buff-standardized-map.json`, `projectile-zh-map.json`, `armor-set-definition-map.json`, most shimmer importable derivatives |
| likely legacy / snapshot candidates | timestamped `wiki-armor-sets.*.json` snapshots after active consumer confirmation |

## Gaps Left For Follow-up

This pass intentionally did **not** finish:

- exhaustive consumer-by-consumer mapping for every `data/generated/shimmer/**` file
- exhaustive consumer mapping for `item-zh-map.json`, `npc-standardized-map.json`, `npc-zh-map.json`
- confirmation of whether any frontend public pages still read generated/standardized artifacts indirectly through backend contracts only, or also through local file assumptions
- resolution of the `item_relations.standardized.json` manifest-vs-worktree discrepancy
- `.gitignore` remediation list; that remains an audit conclusion for a separate change, per P0 scope

## Evidence Pointers

- Consumer registry and readiness evidence: `scripts/data/audit/domain-readiness-audit.mjs`
- Transitional boundary registration: `docs/audits/canonical-migration-boundary.md`
- Shared data layer intent: `data/README.md`
- Standardized manifest and view split: `data/standardized/_manifest.standardized.json`, `data/standardized-view/_index.json`
- Backend monitor direct reads: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Item group runtime/admin direct reads: `back/src/main/java/com/terraria/skills/controller/AdminItemGroupController.java`, `back/src/main/java/com/terraria/skills/controller/AdminRecipeGroupController.java`, `back/src/main/java/com/terraria/skills/service/impl/RecipeTreeServiceImpl.java`
