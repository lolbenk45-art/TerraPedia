# NPC R50 Boss Helper Domain-Separated Review

Date: 2026-05-12

## Goal

Close only boss clone/helper rows where exact source infobox evidence exists and all source page loot rows belong to the main boss row, not to the helper row.

These rows are not expected-zero. They are reviewed domain-separated rows: the page has real boss rewards, but those rewards must not be promoted into ordinary NPC `npc_drop` rows for the helper.

## Source Evidence

- R49 bridge output root: `data/generated/tmp-npc-r49-remaining-source-scan-bridge`
- Bridge summary: `data/generated/tmp-npc-r49-remaining-source-scan-bridge/report/npc-bridge-summary.latest.json`
- Bridge standardized NPC payload: `data/generated/tmp-npc-r49-remaining-source-scan-bridge/standardized/npcs.standardized.json`
- Normalized Martian Saucer page: `data/generated/tmp-npc-r49-remaining-source-scan/normalized-light/npc/martian-saucer.latest.json`
- Normalized Lunatic Cultist page: `data/generated/tmp-npc-r49-remaining-source-scan/normalized-light/npc/lunatic-cultist.latest.json`
- Prior boss boundary: `docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md`
- Prior component boundary: `docs/audits/2026-05-12_npc-r49-component-domain-separated-review.md`

## Approved Domain-Separated Rows

| npcInternalName | sourcePage | exactSignal | sourceLootRowsTotal | filteredLootRows | reason |
| --- | --- | --- | ---: | ---: | --- |
| CultistBossClone | Lunatic Cultist | `sourceInfoboxes.autoId=440` | 6 | 0 | boss_clone_or_helper_domain_separated |
| MartianSaucerCore | Martian Saucer | `sourceInfoboxes.autoId=395` | 10 | 0 | boss_clone_or_helper_domain_separated |

For `CultistBossClone`, the six source loot rows are scoped to `autoId=439` (`CultistBoss`), not clone `autoId=440`.

For `MartianSaucerCore`, the ten source loot rows are scoped to `autoId=392` (`MartianSaucer`), not core `autoId=395`. R50 includes a bridge regression that preserves exact `autoId=395` source infobox evidence even when the local image title differs by extension, while still refusing to attach the main boss loot rows to the core.

## Held Rows

| npcInternalName | reason |
| --- | --- |
| FungoFish | Exact infobox exists, but Jellyfish page loot belongs to other Jellyfish rows; this is not boss/helper domain separation. |
| Zombie and Skeleton remaining variants | Require reviewed shared-loot materialization or inheritance, not boss/helper separation. |

## Boundaries

- No page-level fanout from main boss rows.
- No expected-zero classification when source pages have positive loot rows.
- No boss reward, boss helper, clone, core, component, or health-pickup evidence may be written as ordinary NPC `npc_drop`.
- Exact source infobox evidence for a helper only proves domain separation; it does not authorize loot inheritance.
