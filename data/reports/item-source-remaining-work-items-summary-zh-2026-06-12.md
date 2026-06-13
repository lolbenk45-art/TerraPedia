# 物品来源剩余工作项明细

生成时间：2026-06-13T05:12:54.184Z

## 总览

- DB 写入：未执行。
- dry-run 实际可插入来源行：0，dry-run 选中候选物品：269。
- family policy blocked candidates：0。
- family parser/policy 待建模 rows：0。
- blocked source row candidates：0，blocked source rows：0。
- 显式不可导入来源豁免 candidates：23，source rows：30。
- NPC/biome 投影 rows：17。
- terminal/身份豁免 rows：19。
- 缺 raw evidence rows：0。


## 显式来源豁免状态

| key | count |
| --- | ---: |
| unobtainable | 20 |
| unimplemented | 3 |
| unobtainable_as_item | 1 |

## 投影阻断 layer

| key | count |
| --- | ---: |
| biome_projection_pending | 15 |
| npc_relation_not_projected | 2 |

## terminal 状态

| key | count |
| --- | ---: |
| internal_or_unobtainable_identity_review | 10 |
| (blank) | 5 |
| enemy_page_identity_mismatch | 3 |
| non_item_effect | 1 |

## 处置矩阵

| resolutionLane | count |
| --- | ---: |
| explicit_exemption_review | 42 |
| projection_contract_required | 17 |

## 显式不可导入来源豁免全量

| item | detail |
| --- | --- |
| 766 BoneBlock / Bone Block | Bone Block; explicit_unobtainable_or_unimplemented_source; unobtainable_as_item |
| 2772 VortexAxe / Vortex Axe | Luminite Axes; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2773 VortexChainsaw / Vortex Chainsaw | Luminite Chainsaws; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2775 VortexHammer / Vortex Hammer | Luminite Hammers; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2777 NebulaAxe / Nebula Axe | Luminite Axes; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2778 NebulaChainsaw / Nebula Chainsaw | Luminite Chainsaws; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2780 NebulaHammer / Nebula Hammer | Luminite Hammers; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2782 SolarFlareAxe / Solar Flare Axe | Luminite Axes; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2783 SolarFlareChainsaw / Solar Flare Chainsaw | Luminite Chainsaws; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2785 SolarFlareHammer / Solar Flare Hammer | Luminite Hammers; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 2881 PhasicWarpEjector / Phasic Warp Ejector | Phasic Warp Ejector; explicit_unobtainable_or_unimplemented_source; unimplemented |
| 2903 BlueCultistFighterBanner / Blue Cultist Fighter Banner | Banners (enemy); explicit_unobtainable_enemy_banner_source; unobtainable |
| 2989 WhiteCultistArcherBanner / White Cultist Archer Banner | Banners (enemy); explicit_unobtainable_enemy_banner_source; unobtainable |
| 2990 WhiteCultistCasterBanner / White Cultist Caster Banner | Banners (enemy); explicit_unobtainable_enemy_banner_source; unobtainable |
| 2991 WhiteCultistFighterBanner / White Cultist Fighter Banner | Banners (enemy); explicit_unobtainable_enemy_banner_source; unobtainable |
| 3398 SeveredHandBanner / Severed Hand Banner | Banners (enemy); explicit_unobtainable_enemy_banner_source; unobtainable |
| 3404 PoisonousSporeBanner / Poisonous Spore Banner | Banners (enemy); explicit_unobtainable_enemy_banner_source; unobtainable |
| 3462 StardustAxe / Stardust Axe | Luminite Axes; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 3463 StardustChainsaw / Stardust Chainsaw | Luminite Chainsaws; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 3465 StardustHammer / Stardust Hammer | Luminite Hammers; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 4010 ApplePieSlice / Apple Pie Slice | Apple Pie Slice; explicit_unobtainable_or_unimplemented_source; unimplemented |
| 4058 SkeletonBow / Skull Bow | Skull Bow; explicit_unobtainable_or_unimplemented_source; unobtainable |
| 5668 SoundGun / The Imploder | The Imploder; explicit_unobtainable_or_unimplemented_source; unimplemented, unobtainable |

## NPC/biome 投影 rows 全量

| item | detail |
| --- | --- |
| 1586 CenxsWings / Cenx's Wings | npc_relation_not_projected; npc_relation_chain_gap;  |
| 3217 CorruptPlanterBox / Deathweed Planter Box | npc_relation_not_projected; family_policy_candidate;  |
| 1827 BladedGlove / Bladed Glove | biome_projection_pending; biome_evidence_projection;  |
| 2312 FlarefinKoi / Flarefin Koi | biome_projection_pending; biome_evidence_projection;  |
| 2320 Rockfish / Rockfish | biome_projection_pending; biome_evidence_projection;  |
| 2885 InfernalWispDye / Infernal Wisp Dye | biome_projection_pending; biome_evidence_projection;  |
| 3027 ReflectiveGoldDye / Reflective Gold Dye | biome_projection_pending; biome_evidence_projection;  |
| 3028 BlueAcidDye / Blue Acid Dye | biome_projection_pending; biome_evidence_projection;  |
| 3196 BombFish / Bomb Fish | biome_projection_pending; biome_evidence_projection;  |
| 4377 KryptonMoss / Krypton Moss | biome_projection_pending; family_policy_candidate;  |
| 4389 ArgonMoss / Argon Moss | biome_projection_pending; family_policy_candidate;  |
| 4469 MeowmereMinecart / Meowmere Minecart | biome_projection_pending; biome_evidence_projection;  |
| 4471 PirateMinecart / The Dutchman | biome_projection_pending; biome_evidence_projection;  |
| 4546 GoblinSharkBanner / Hemogoblin Shark Banner | biome_projection_pending; biome_evidence_projection;  |
| 4942 PumpkingMasterTrophy / Pumpking Relic | biome_projection_pending; biome_evidence_projection;  |
| 4967 SporeSkeletonBanner / Spore Skeleton Banner | biome_projection_pending; biome_evidence_projection;  |
| 5375 HardenedSandWallUnsafe / Treacherous Hardened Sand Wall | biome_projection_pending; family_policy_candidate;  |

## terminal/身份豁免 rows 全量

| item | detail |
| --- | --- |
| 1475 Darkness / Darkness | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; non_item_effect |
| 2436 BlueJellyfish / Blue Jellyfish | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; enemy_page_identity_mismatch |
| 2437 GreenJellyfish / Green Jellyfish | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; enemy_page_identity_mismatch |
| 2438 PinkJellyfish / Pink Jellyfish | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; enemy_page_identity_mismatch |
| 3705 Fake_newchest1 / Fake_newchest1 | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3706 Fake_newchest2 / Fake_newchest2 | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3847 OgreMask / OgreMask | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3848 GoblinMask / GoblinMask | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3849 GoblinBomberCap / GoblinBomberCap | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3850 EtherianJavelin / EtherianJavelin | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3851 KoboldDynamiteBackpack / KoboldDynamiteBackpack | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3853 BoringBow / BoringBow | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 3861 BossBagOgre / BossBagOgre | terminal_exempt_or_identity_review; runtime_or_developer_internal;  |
| 3862 BossBagDarkMage / BossBagDarkMage | terminal_exempt_or_identity_review; runtime_or_developer_internal;  |
| 3978 ColorOnlyDye / ColorOnlyDye | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 4143 ManaCloakStar / ManaCloakStar | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate; internal_or_unobtainable_identity_review |
| 4722 FirstFractal / FirstFractal | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate;  |
| 5013 SleepingIcon / SleepingIcon | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate;  |
| 6143 FoxparksTagEffect / FoxparksTagEffect | terminal_exempt_or_identity_review; explicit_no_source_exemption_candidate;  |

完整列表见 JSON 报告。

