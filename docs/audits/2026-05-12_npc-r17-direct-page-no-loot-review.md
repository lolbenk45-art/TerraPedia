# NPC R17 Direct Page No-Loot Review

Review date: 2026-05-12

## Decision

The R17 direct-page batch below is expected-zero for ordinary NPC item loot. Each row has a direct wiki NPC page, crawler audit `pass`, bridge match, and normalized `loot: []`.

This does not prove the entity has no behavior, no money, no event progress, no spawned helpers, or no projectile/combat data. It only means there are no direct item drop rows to materialize into the NPC loot domain.

## Evidence

- Crawler output root: `data/generated/tmp-npc-source-page-present-unextracted-r17`
- Batch summary: `data/generated/tmp-npc-source-page-present-unextracted-r17/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-present-unextracted-r17-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-present-unextracted-r17-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 25
- `pass`: 25
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 25
- `matched`: 25
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Reviewed Rows

| npcInternalName | sourcePage | normalizedFile | lootRows | reason |
| --- | --- | --- | ---: | --- |
| BloodSquid | Blood Squid | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/blood-squid.latest.json | 0 | enemy_no_direct_item_loot |
| MaggotZombie | Maggot Zombie | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/maggot-zombie.latest.json | 0 | enemy_no_direct_item_loot |
| MossZombie | Moss Zombie | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/moss-zombie.latest.json | 0 | enemy_no_direct_item_loot |
| PirateGhost | Pirate's Curse | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/pirate-s-curse.latest.json | 0 | enemy_no_direct_item_loot |
| GoldenSlime | Golden Slime | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/golden-slime.latest.json | 0 | enemy_no_direct_item_loot |
| MartianProbe | Martian Probe | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/martian-probe.latest.json | 0 | enemy_no_direct_item_loot |
| MartianDrone | Martian Drone | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/martian-drone.latest.json | 0 | enemy_no_direct_item_loot |
| MartianTurret | Tesla Turret | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/tesla-turret.latest.json | 0 | enemy_no_direct_item_loot |
| MoonLordLeechBlob | Moon Leech Clot | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/moon-leech-clot.latest.json | 0 | enemy_no_direct_item_loot |
| StardustCellBig | Star Cell | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/star-cell.latest.json | 0 | enemy_no_direct_item_loot |
| StardustSpiderBig | Twinkle Popper | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/twinkle-popper.latest.json | 0 | enemy_no_direct_item_loot |
| StardustSoldier | Stargazer | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/stargazer.latest.json | 0 | enemy_no_direct_item_loot |
| SolarSpearman | Drakanian | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/drakanian.latest.json | 0 | enemy_no_direct_item_loot |
| SolarSroller | Sroller | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/sroller.latest.json | 0 | enemy_no_direct_item_loot |
| SolarCorite | Corite | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/corite.latest.json | 0 | enemy_no_direct_item_loot |
| SolarSolenian | Selenian | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/selenian.latest.json | 0 | enemy_no_direct_item_loot |
| NebulaBrain | Nebula Floater | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/nebula-floater.latest.json | 0 | enemy_no_direct_item_loot |
| NebulaHeadcrab | Brain Suckler | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/brain-suckler.latest.json | 0 | enemy_no_direct_item_loot |
| NebulaBeast | Evolution Beast | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/evolution-beast.latest.json | 0 | enemy_no_direct_item_loot |
| NebulaSoldier | Predictor | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/predictor.latest.json | 0 | enemy_no_direct_item_loot |
| VortexRifleman | Storm Diver | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/storm-diver.latest.json | 0 | enemy_no_direct_item_loot |
| VortexHornetQueen | Alien Queen | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/alien-queen.latest.json | 0 | enemy_no_direct_item_loot |
| VortexHornet | Alien Hornet | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/alien-hornet.latest.json | 0 | enemy_no_direct_item_loot |
| VortexLarva | Alien Larva | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/alien-larva.latest.json | 0 | enemy_no_direct_item_loot |
| VortexSoldier | Vortexian | data/generated/tmp-npc-source-page-present-unextracted-r17/normalized-light/npc/vortexian.latest.json | 0 | enemy_no_direct_item_loot |

## Boundary

Do not use this review to infer no-loot status for other enemies or family/group pages.

Do not convert `Mimics`, `Mummies`, `Ghouls`, `Jellyfish`, `Sand Sharks`, `Slimes`, `The Twins`, or `Celestial Pillars` generic source buckets into ordinary NPC loot from this evidence.

Do not classify backfill-only crawler outputs as closed unless a reviewed expected-zero row is added to the contract.
