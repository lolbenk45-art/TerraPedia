# NPC R43 Zombie Elf Page-Level Shared Loot Review

Date: 2026-05-12

## Goal

Close only the two held Zombie Elf variants with a reviewed page-level shared-loot materialization.

This review does not reopen broad Zombie-family inheritance. It covers one wiki page, one source revision, four loot rows, and two explicit target NPC internal names.

## Source Evidence

- Source page: `Zombie Elf`
- Source URL: `https://terraria.wiki.gg/wiki/Zombie_Elf`
- Source page ID: `10071`
- Source revision timestamp: `2025-03-18T07:10:16Z`
- Local normalized evidence: `data/generated/tmp-npc-r30-smallfamilies-agent/normalized-light/npc/zombie-elf.latest.json`

The page lead describes the Zombie Elf page subject as the basic fighter-type enemy spawned during the Frost Moon event. The page owns one drops table whose row infobox uses `sourceInfobox.autoId=338` and the plural image `Zombie Elves.png`.

## Reviewed Loot Rows

Only these source rows are approved for shared materialization:

| sourceRowIndex | itemName | quantityText | chanceText | conditionText |
| ---: | --- | --- | --- | --- |
| 0 | Elf Hat | 1 | 0.17% |  |
| 1 | Elf Shirt | 1 | 0.17% |  |
| 2 | Elf Pants | 1 | 0.17% |  |
| 3 | Heart | 1 | 20% |  |

## Explicit Target NPCs

Only these target NPC internal names are approved:

- `ZombieElfBeard`
- `ZombieElfGirl`

`ZombieElf` is already represented by the existing exact source materialization from R30 and is not rewritten by this review.

The approved targets share the page display name `Zombie Elf` and banner `2994` with `ZombieElf`, but have distinct internal names and images:

| npcInternalName | sourceId/type/netID | name | banner | imageFileTitle |
| --- | ---: | --- | ---: | --- |
| ZombieElf | 338 | Zombie Elf | 2994 | Zombie Elf.gif |
| ZombieElfBeard | 339 | Zombie Elf | 2994 | Zombie Elf Beard.gif |
| ZombieElfGirl | 340 | Zombie Elf | 2994 | Zombie Elf Girl.gif |

## Materialization Decision

Approved rows must carry:

- `sourceRefName = Zombie Elf`
- `sourceRefInternalName = ZombieElfBeard` or `ZombieElfGirl`
- `sourceRefResolution = reviewed_page_level_shared_loot`
- `reviewedSharedLootEvidenceSource = docs/audits/2026-05-12_npc-r43-zombie-elf-page-shared-loot-review.md`

## Expected Impact

If the chain applies cleanly, the two Zombie Elf variant rows should move from `blocked_source_gap` to trusted direct loot.

Expected R43 delta after R42:

- `blockedSourceGap`: `80 -> 78`
- `releaseBlockingCount`: `80 -> 78`
- `source_page_present_with_loot`: `392 -> 394`
- `group_page_present_variant_not_extracted`: `79 -> 77`
- Runtime parity should remain pass with `blockingCount = 0`

## Boundaries

- No broad `Zombie` family closure.
- No `FemaleZombie`, themed Zombie, Zombie Eskimo, or holiday Zombie inference.
- No fuzzy matching.
- No generic bucket fanout.
- No expected-zero classification.
- No boss/component/event-resource promotion.
- No worm/segment inheritance.
