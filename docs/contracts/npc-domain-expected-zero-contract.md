# NPC Domain Expected-Zero Contract

Contract version: `1`

Review date: 2026-05-10

Status: Phase 0 governance contract. Rows may be added only after review evidence exists.

## Purpose

This contract defines when an active NPC may be classified as `expected_zero_loot` in the NPC domain loot chain audit.

Zero current DB rows are not evidence.

An NPC may be expected-zero only when a checked-in contract row records a reviewed reason and evidence source. The absence of rows in `npc_loot_entries`, `item_npc_loot_relations`, or `projection_npcs.loot_items_json` must never be treated as proof that the NPC has no drops.

## Allowed Reasons

| Reason | Meaning |
| --- | --- |
| `town_npc_no_loot` | Town NPC has no direct drop table by design for the reviewed context. |
| `bound_or_rescue_state` | Bound, trapped, rescue, or pre-rescue state is not an independent killable loot source. |
| `critter_no_loot` | Critter or harmless entity has reviewed no-loot evidence. |
| `enemy_no_direct_item_loot` | Killable enemy has a reviewed direct NPC page and crawler evidence showing no direct item drop rows for the NPC loot domain. |
| `body_or_segment_inherits` | Body, tail, or segment row does not own direct loot and is handled by representative inheritance. |
| `event_helper_no_loot` | Event helper, visual helper, or support entity is not a direct loot source. |
| `projectile_or_effect_not_killable` | Projectile, effect, or non-killable NPC-like entity must not produce NPC loot. |
| `placeholder_or_internal_test_helper_no_loot` | Placeholder, sentinel, or internal test helper row is not a real NPC loot source. |

## Required Fields

Every expected-zero row must include:

| Field | Required | Notes |
| --- | --- | --- |
| `npcInternalName` | yes | Canonical local/standardized NPC internal name. |
| `npcType` | yes | Current reviewed NPC category or type. |
| `reason` | yes | One of the allowed reasons above. |
| `evidenceSource` | yes | Wiki page, crawler artifact, code/source contract, or review document proving no direct loot is expected. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | ISO date of the review. |

## Row Format

Use this table format when adding reviewed rows:

| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| BoundGoblin | friendly | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| BoundWizard | friendly | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| BoundMechanic | friendly | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| GolferRescue | friendly | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| BoundTownSlimeOld | friendly | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| BoundTownSlimePurple | enemy | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| BoundTownSlimeYellow | enemy | bound_or_rescue_state | docs/audits/2026-05-11_npc-bound-rescue-expected-zero-review.md | codex | 2026-05-11 |
| OldMan | friendly | event_helper_no_loot | docs/audits/2026-05-11_npc-oldman-expected-zero-review.md | codex | 2026-05-11 |
| Merchant | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Nurse | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| ArmsDealer | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Dryad | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Demolitionist | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Clothier | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| GoblinTinkerer | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Wizard | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| SantaClaus | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Truffle | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Cyborg | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| WitchDoctor | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Pirate | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Angler | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Golfer | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| BestiaryGirl | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownCat | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownDog | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownBunny | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeBlue | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeCopper | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeGreen | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeOld | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimePurple | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeRainbow | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeRed | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| TownSlimeYellow | friendly | town_npc_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| Bunny | enemy | critter_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| BunnySlimed | enemy | critter_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| BunnyXmas | enemy | critter_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| PartyBunny | enemy | critter_no_loot | docs/audits/2026-05-11_npc-town-critter-expected-zero-review.md | codex | 2026-05-11 |
| BloodSquid | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| MaggotZombie | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| MossZombie | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| PirateGhost | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| GoldenSlime | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| MartianProbe | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| MartianDrone | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| MartianTurret | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| MoonLordLeechBlob | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| StardustCellBig | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| StardustSpiderBig | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| StardustSoldier | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| SolarSpearman | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| SolarSroller | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| SolarCorite | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| SolarSolenian | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| NebulaBrain | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| NebulaHeadcrab | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| NebulaBeast | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| NebulaSoldier | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| VortexRifleman | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| VortexHornetQueen | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| VortexHornet | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| VortexLarva | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| VortexSoldier | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r17-direct-page-no-loot-review.md | codex | 2026-05-12 |
| CorruptGoldfish | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| LavaSlime | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| Vulture | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| PossessedArmor | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| Arapaima | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| HoppinJack | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| Ghost | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| Yeti | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| ElfCopter | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| ElfArcher | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| Krampus | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| Flocko | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r16-direct-page-no-loot-review.md | codex | 2026-05-12 |
| ServantofCthulhu | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| BurningSphere | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| WaterSphere | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| SpikeBall | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| BlazingWheel | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Parrot | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| AnomuraFungus | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| MushiLadybug | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| FungiBulb | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| GiantFungiBulb | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Mouse | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Firefly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Worm | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| LightningBug | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Snail | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| GlowingSnail | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Frog | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| DetonatingBubble | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| Grasshopper | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r19-direct-page-review.md | codex | 2026-05-12 |
| ChatteringTeethBomb | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| MoonLordFreeEye | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SolarDrakomire | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SolarDrakomireRider | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| CultistTablet | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldBird | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldBunny | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldButterfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldFrog | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldGrasshopper | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldMouse | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldWorm | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SkeletonMerchant | friendly | town_npc_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| CrimsonGoldfish | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| ShadowFlameApparition | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| EnchantedNightcrawler | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Grubby | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Sluggy | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Buggy | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| TargetDummy | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SolarFlare | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SolarGoop | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| AncientCultistSquidhead | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| AncientLight | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| AncientDoom | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| DemonTaxCollector | enemy | bound_or_rescue_state | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SquirrelGold | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| DD2EterniaCrystal | friendly | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| DD2LanePortal | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| DD2LightningBugT3 | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| LadyBug | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldLadyBug | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Maggot | friendly | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Pupfish | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Rat | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| WaterStrider | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldWaterStrider | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| ExplosiveBunny | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Dolphin | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Turtle | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| TurtleJungle | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Gnome | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| SeaTurtle | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Seahorse | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| GoldSeahorse | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Lavafly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| MagmaSnail | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| EmpressButterfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Stinkbug | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Toucan | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| ShimmerSlime | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Shimmerfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| Pufferfish | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| PalworldCattivaDistressed | friendly | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| PalworldFoxsparksDistressed | friendly | event_helper_no_loot | docs/audits/2026-05-12_npc-r22-direct-page-review.md | codex | 2026-05-12 |
| BartenderUnconscious | friendly | bound_or_rescue_state | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| SleepingAngler | friendly | bound_or_rescue_state | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| WebbedStylist | friendly | bound_or_rescue_state | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PrimeCannon | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PrimeSaw | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PrimeVice | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PrimeLaser | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| GolemHead | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| GolemHeadFree | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PlanterasHook | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PlanterasTentacle | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| MoonLordHand | boss | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| MoonLordCore | boss | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| MartianSaucerTurret | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| MartianSaucerCannon | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| PirateShipCannon | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| MothronEgg | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| MothronSpawn | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| StardustCellSmall | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| StardustSpiderSmall | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r23-source-missing-parent-review.md | codex | 2026-05-12 |
| Bird | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| BirdBlue | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| BirdRed | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| BlueMacaw | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| ScarletMacaw | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GrayCockatiel | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| YellowCockatiel | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| Butterfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| HellButterfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| FairyCritterBlue | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| FairyCritterGreen | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| FairyCritterPink | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnyAmber | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnyAmethyst | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnyDiamond | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnyEmerald | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnyRuby | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnySapphire | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemBunnyTopaz | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelAmber | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelAmethyst | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelDiamond | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelEmerald | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelRuby | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelSapphire | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| GemSquirrelTopaz | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| Squirrel | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| SquirrelRed | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r24-catchable-critter-source-missing-review.md | codex | 2026-05-12 |
| BlackDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| BlueDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| GreenDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| OrangeDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| RedDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| YellowDragonfly | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Duck | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Duck2 | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| DuckWhite | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| DuckWhite2 | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Goldfish | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| GoldfishWalker | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| GoldGoldfish | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| GoldGoldfishWalker | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Grebe | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Grebe2 | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Owl | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| OwlMimic | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r48-owl-source-infobox-exact-review.md | codex | 2026-05-12 |
| Penguin | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| PenguinBlack | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Scorpion | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| ScorpionBlack | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Seagull | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| Seagull2 | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| TruffleWorm | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| TruffleWormDigger | enemy | critter_no_loot | docs/audits/2026-05-12_npc-r29-catchable-critter-group-page-review.md | codex | 2026-05-12 |
| FungiSpore | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| Spore | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| CultistArcherBlue | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| CultistArcherWhite | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| ForceBubble | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| CultistDevote | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| StatueMimic | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r25-explicit-page-review.md | codex | 2026-05-12 |
| ChaosBall | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r30-smallfamilies-source-review.md | codex | 2026-05-12 |
| ChaosBallTim | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r30-smallfamilies-source-review.md | codex | 2026-05-12 |
| VileSpit | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r30-smallfamilies-source-review.md | codex | 2026-05-12 |
| VileSpitEaterOfWorlds | enemy | projectile_or_effect_not_killable | docs/audits/2026-05-12_npc-r30-smallfamilies-source-review.md | codex | 2026-05-12 |
| SkeletronHand | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md | codex | 2026-05-12 |
| DD2GoblinT1 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2GoblinT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2GoblinT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2GoblinBomberT1 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2GoblinBomberT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2GoblinBomberT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2WyvernT1 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2WyvernT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2WyvernT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2JavelinstT1 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2JavelinstT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2JavelinstT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2SkeletonT1 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2SkeletonT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2WitherBeastT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2DrakinT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2DrakinT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2KoboldWalkerT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2KoboldWalkerT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2KoboldFlyerT2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| DD2KoboldFlyerT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r39-old-ones-army-expected-zero-review.md | codex | 2026-05-12 |
| Bee | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r40-exact-no-loot-enemy-review.md | codex | 2026-05-12 |
| JungleCreeper | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r40-exact-no-loot-enemy-review.md | codex | 2026-05-12 |
| ZombieMushroom | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r40-exact-no-loot-enemy-review.md | codex | 2026-05-12 |
| ZombieMushroomHat | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r40-exact-no-loot-enemy-review.md | codex | 2026-05-12 |
| Nutcracker | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r40-exact-no-loot-enemy-review.md | codex | 2026-05-12 |
| None | unknown | placeholder_or_internal_test_helper_no_loot | docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md | codex | 2026-05-12 |
| None2 | unknown | placeholder_or_internal_test_helper_no_loot | docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md | codex | 2026-05-12 |
| None3 | unknown | placeholder_or_internal_test_helper_no_loot | docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md | codex | 2026-05-12 |
| DD2AttackerTest | enemy | placeholder_or_internal_test_helper_no_loot | docs/audits/2026-05-12_npc-r41-placeholder-internal-expected-zero-review.md | codex | 2026-05-12 |
| CultistDragonHead | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| CultistDragonBody1 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| CultistDragonBody2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| CultistDragonBody3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| CultistDragonBody4 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| CultistDragonTail | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| SolarCrawltipedeHead | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| SolarCrawltipedeBody | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| SolarCrawltipedeTail | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| DuneSplicerHead | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| DuneSplicerBody | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| DuneSplicerTail | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| StardustWormHead | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| StardustWormBody | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| StardustWormTail | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| StardustJellyfishBig | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| StardustJellyfishSmall | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| Sharkron | enemy | event_helper_no_loot | docs/audits/2026-05-12_npc-r44-reviewed-no-loot-source-pages-review.md | codex | 2026-05-12 |
| BeeSmall | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r49-exact-source-no-loot-review.md | codex | 2026-05-12 |
| JungleCreeperWall | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r49-exact-source-no-loot-review.md | codex | 2026-05-12 |
| NutcrackerSpinning | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r49-exact-source-no-loot-review.md | codex | 2026-05-12 |
| Sharkron2 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r49-exact-source-no-loot-review.md | codex | 2026-05-12 |
| DD2WitherBeastT3 | enemy | enemy_no_direct_item_loot | docs/audits/2026-05-12_npc-r49-exact-source-no-loot-review.md | codex | 2026-05-12 |

## Audit Rules

- A zero local loot count without a matching contract row remains `unclassified_zero`.
- A missing source page without a matching contract row remains a source gap, not expected zero.
- Expected-zero rows may short-circuit source-gap classification only for the reviewed NPC and reviewed reason.
- Expected-zero rows do not bypass duplicate, pollution, projection, local, API, or row-identity checks.
- `body_or_segment_inherits` is allowed here only to classify the segment as not owning direct loot; trusted inherited loot still requires the inheritance contract.
