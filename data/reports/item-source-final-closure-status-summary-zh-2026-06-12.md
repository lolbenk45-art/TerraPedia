# 物品来源闭环状态报告

生成时间：2026-06-13T05:16:55.140Z

## 结论

- 普通来源 apply 证据：270 rows / 269 candidates 已写入本地库；该数字是历史 apply 证据，不代表仍待写入。
- family parser/policy 待处理：0 rows。
- blocked source 剩余：0 rows / 0 candidates；其中 23 个显式豁免、0 个仍需专属机制投影。
- candidate plan 显式不可导入来源豁免：30 rows / 23 candidates。
- NPC/biome projection：17/17 已由 public sources contract 只读投影；不包括 blocked source 中仍需专属机制建模的转换/事件类来源。
- terminal/身份豁免：19 rows。
- 缺 raw evidence：0 rows。
- validation errors：0；duplicates：6。

## Projection 全量

| item | status | evidence | next |
| --- | --- | --- | --- |
| 1586 CenxsWings / Cenx's Wings | projected_by_public_sources_contract | loot 0, shop 1, biomeResource 0, itemBiome 0 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 3217 CorruptPlanterBox / Deathweed Planter Box | projected_by_public_sources_contract | loot 0, shop 1, biomeResource 0, itemBiome 0 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 1827 BladedGlove / Bladed Glove | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 2312 FlarefinKoi / Flarefin Koi | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 2320 Rockfish / Rockfish | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 2885 InfernalWispDye / Infernal Wisp Dye | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 1, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 3027 ReflectiveGoldDye / Reflective Gold Dye | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 3028 BlueAcidDye / Blue Acid Dye | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 3196 BombFish / Bomb Fish | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4377 KryptonMoss / Krypton Moss | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4389 ArgonMoss / Argon Moss | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4469 MeowmereMinecart / Meowmere Minecart | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4471 PirateMinecart / The Dutchman | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4546 GoblinSharkBanner / Hemogoblin Shark Banner | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 1, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4942 PumpkingMasterTrophy / Pumpking Relic | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 4967 SporeSkeletonBanner / Spore Skeleton Banner | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |
| 5375 HardenedSandWallUnsafe / Treacherous Hardened Sand Wall | projected_by_public_sources_contract | loot 0, shop 0, biomeResource 0, itemBiome 1 | 由 public item sources contract 只读投影，不写 item_acquisition_sources。 |

## Blocked Source 剩余全量

| item | status | next |
| --- | --- | --- |

## 显式不可导入来源豁免全量

| item | status | next |
| --- | --- | --- |
| 766 BoneBlock / Bone Block | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2772 VortexAxe / Vortex Axe | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2773 VortexChainsaw / Vortex Chainsaw | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2775 VortexHammer / Vortex Hammer | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2777 NebulaAxe / Nebula Axe | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2778 NebulaChainsaw / Nebula Chainsaw | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2780 NebulaHammer / Nebula Hammer | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2782 SolarFlareAxe / Solar Flare Axe | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2783 SolarFlareChainsaw / Solar Flare Chainsaw | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2785 SolarFlareHammer / Solar Flare Hammer | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2881 PhasicWarpEjector / Phasic Warp Ejector | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2903 BlueCultistFighterBanner / Blue Cultist Fighter Banner | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2989 WhiteCultistArcherBanner / White Cultist Archer Banner | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2990 WhiteCultistCasterBanner / White Cultist Caster Banner | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 2991 WhiteCultistFighterBanner / White Cultist Fighter Banner | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 3398 SeveredHandBanner / Severed Hand Banner | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 3404 PoisonousSporeBanner / Poisonous Spore Banner | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 3462 StardustAxe / Stardust Axe | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 3463 StardustChainsaw / Stardust Chainsaw | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 3465 StardustHammer / Stardust Hammer | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 4010 ApplePieSlice / Apple Pie Slice | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 4058 SkeletonBow / Skull Bow | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |
| 5668 SoundGun / The Imploder | explicit_exemption_review | 显式不可获得/未实现来源，保留为豁免，不导入普通 item source。 |

## Terminal / 身份豁免全量

| item | status | next |
| --- | --- | --- |
| 1475 Darkness / Darkness | non_item_effect | 保持显式豁免/身份审查，不导入普通来源。 |
| 2436 BlueJellyfish / Blue Jellyfish | enemy_page_identity_mismatch | 保持显式豁免/身份审查，不导入普通来源。 |
| 2437 GreenJellyfish / Green Jellyfish | enemy_page_identity_mismatch | 保持显式豁免/身份审查，不导入普通来源。 |
| 2438 PinkJellyfish / Pink Jellyfish | enemy_page_identity_mismatch | 保持显式豁免/身份审查，不导入普通来源。 |
| 3705 Fake_newchest1 / Fake_newchest1 | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3706 Fake_newchest2 / Fake_newchest2 | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3847 OgreMask / OgreMask | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3848 GoblinMask / GoblinMask | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3849 GoblinBomberCap / GoblinBomberCap | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3850 EtherianJavelin / EtherianJavelin | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3851 KoboldDynamiteBackpack / KoboldDynamiteBackpack | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3853 BoringBow / BoringBow | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 3861 BossBagOgre / BossBagOgre | internal_boss_bag_identity | 保持显式豁免/身份审查，不导入普通来源。 |
| 3862 BossBagDarkMage / BossBagDarkMage | internal_boss_bag_identity | 保持显式豁免/身份审查，不导入普通来源。 |
| 3978 ColorOnlyDye / ColorOnlyDye | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 4143 ManaCloakStar / ManaCloakStar | internal_or_unobtainable_identity_review | 保持显式豁免/身份审查，不导入普通来源。 |
| 4722 FirstFractal / FirstFractal | unreleased_internal_item | 保持显式豁免/身份审查，不导入普通来源。 |
| 5013 SleepingIcon / SleepingIcon | runtime_internal_effect | 保持显式豁免/身份审查，不导入普通来源。 |
| 6143 FoxparksTagEffect / FoxparksTagEffect | runtime_internal_effect | 保持显式豁免/身份审查，不导入普通来源。 |

## Missing Raw 全量

| item | next |
| --- | --- |

