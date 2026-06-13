# 物品来源现有证据层审计汇总

生成时间：2026-06-13T05:12:39.837Z

## 结论

items 表有物品，不等于 active item_acquisition_sources 来源闭合。

- `items` 表有物品，只代表物品实体存在。
- `active item_acquisition_sources` 才代表当前来源闭环口径里已有 active 来源行。
- `recipes`、`npc_loot_entries`、`npc_shop_entries`、`item_biomes`、maint/relation、raw candidate 都是“库里有/报告里有”的证据层，但处理方式不同。
- 本报告的目的不是重做数据，而是说明每条剩余 item 应该走投影、导入、豁免还是补 raw evidence。

## 三层口径对照

| 口径 | 代表什么 | 不代表什么 |
| --- | --- | --- |
| `items` 实体存在 | 物品记录在库里 | 不代表有获取来源 |
| 专属证据存在 | recipe/shimmer/NPC/biome/maint/relation/raw candidate 有证据 | 不一定已经发布为 active source |
| active `item_acquisition_sources` | 当前 closure 统计认可的普通来源行 | 不覆盖所有专属结构来源 |

## 总数

- 剩余行数：3730
- layer 计数合计：3730
- active 来源已存在但仍在 closure：1068

## 分层统计

| evidenceLayer | 中文说明 | 数量 | 下一步 |
| --- | --- | ---: | --- |
| `active_source_present` | active 来源已存在，剩余报告可能过期 | 1068 | 先重建 closure report 或排查 stale report，不做数据导入。 |
| `terminal_exempt_or_identity_review` | terminal/身份审查豁免 | 19 | 保留为豁免/身份审查，不导入普通 item source。 |
| `missing_required_raw_evidence` | 缺精确 raw evidence | 0 | 补精确 raw evidence 后再解析，不能用相似页面猜来源。 |
| `recipe_or_shimmer_covered` | recipe/shimmer 专属结构已覆盖 | 2603 | 验证 backend/API/UI 展示 recipe/shimmer，不重复写普通 source row。 |
| `npc_relation_not_projected` | NPC 掉落/商店关系未投影 | 2 | 检查 NPC loot/shop 到 item detail/API 的投影链。 |
| `biome_projection_pending` | biome/location 证据待投影 | 15 | 检查 biome/location 关系投影，不伪造成普通 drop/shop。 |
| `maint_or_relation_not_published` | maint/relation 证据未发布到 local | 0 | 制定 relation/maint publication dry-run，不直接手写 SQL。 |
| `candidate_import_not_applied` | 候选导入计划未 apply/publish | 0 | 跑 local compat candidate dry-run，审查 validation/duplicate 后再申请 apply。 |
| `raw_candidate_not_projected` | raw 页面已提取但未进入候选导入/发布 | 23 | 把 raw candidates 重新生成 focused candidate import plan。 |
| `family_policy_pending` | family/shared 页面策略待解析 | 0 | 按 family page/sourcePage 做精确 policy parser。 |
| `item_only_no_source_evidence` | 只有 item 实体，未找到已检查来源证据 | 0 | 按类别和名称分组，再决定是否需要补 raw evidence。 |

## 每层样本

### active_source_present（1068）

| itemId | internalName | name | closureLane | 关键计数 |
| ---: | --- | --- | --- | --- |
| 75 | FallenStar | Fallen Star | `needs_external_source_evidence` | active=2, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 136 | ChainLantern | Chain Lantern | `needs_external_source_evidence` | active=3, recipe=0, raw=3, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 184 | Star | Star | `needs_external_source_evidence` | active=1, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 206 | WaterBucket | Water Bucket | `needs_external_source_evidence` | active=1, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 207 | LavaBucket | Lava Bucket | `needs_external_source_evidence` | active=1, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 226 | LesserRestorationPotion | Lesser Restoration Potion | `needs_external_source_evidence` | active=2, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 261 | Goldfish | Goldfish | `needs_external_source_evidence` | active=1, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 321 | Tombstone | Tombstone | `needs_external_source_evidence` | active=1, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 424 | SiltBlock | Silt Block | `needs_external_source_evidence` | active=1, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 438 | StarStatue | Star Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 439 | SwordStatue | Sword Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 440 | SlimeStatue | Slime Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 441 | GoblinStatue | Goblin Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 442 | ShieldStatue | Shield Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 443 | BatStatue | Bat Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 446 | SkeletonStatue | Skeleton Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 447 | ReaperStatue | Reaper Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 448 | WomanStatue | Woman Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 449 | ImpStatue | Imp Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 450 | GargoyleStatue | Gargoyle Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 451 | GloomStatue | Gloom Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 452 | HornetStatue | Hornet Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 453 | BombStatue | Bomb Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 454 | CrabStatue | Crab Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 455 | HammerStatue | Hammer Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 456 | PotionStatue | Potion Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 457 | SpearStatue | Spear Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 458 | CrossStatue | Cross Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 459 | JellyfishStatue | Jellyfish Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 460 | BowStatue | Bow Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 461 | BoomerangStatue | Boomerang Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 462 | BootStatue | Boot Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 463 | ChestStatue | Chest Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 465 | AxeStatue | Axe Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 466 | CorruptStatue | Corrupt Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 467 | TreeStatue | Tree Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 468 | AnvilStatue | Anvil Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 469 | PickaxeStatue | Pickaxe Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 470 | MushroomStatue | Mushroom Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 471 | EyeballStatue | Eyeball Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 472 | PillarStatue | Pillar Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 473 | HeartStatue | Heart Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 474 | PotStatue | Pot Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 475 | SunflowerStatue | Sunflower Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 476 | KingStatue | King Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 477 | QueenStatue | Queen Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 478 | PiranhaStatue | Piranha Statue | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 563 | MusicBoxEerie | Music Box (Eerie) | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 564 | MusicBoxNight | Music Box (Night) | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 566 | MusicBoxUnderground | Music Box (Underground) | `family_policy_candidate` | active=1, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |

仅展示前 50 条；完整列表见 JSON 报告。

### terminal_exempt_or_identity_review（19）

| itemId | internalName | name | closureLane | 关键计数 |
| ---: | --- | --- | --- | --- |
| 1475 | Darkness | Darkness | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2436 | BlueJellyfish | Blue Jellyfish | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2437 | GreenJellyfish | Green Jellyfish | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2438 | PinkJellyfish | Pink Jellyfish | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3705 | Fake_newchest1 | Fake_newchest1 | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3706 | Fake_newchest2 | Fake_newchest2 | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3847 | OgreMask | OgreMask | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3848 | GoblinMask | GoblinMask | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3849 | GoblinBomberCap | GoblinBomberCap | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3850 | EtherianJavelin | EtherianJavelin | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3851 | KoboldDynamiteBackpack | KoboldDynamiteBackpack | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3853 | BoringBow | BoringBow | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3861 | BossBagOgre | BossBagOgre | `runtime_or_developer_internal` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3862 | BossBagDarkMage | BossBagDarkMage | `runtime_or_developer_internal` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3978 | ColorOnlyDye | ColorOnlyDye | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 4143 | ManaCloakStar | ManaCloakStar | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 4722 | FirstFractal | FirstFractal | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 5013 | SleepingIcon | SleepingIcon | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 6143 | FoxparksTagEffect | FoxparksTagEffect | `explicit_no_source_exemption_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |

### recipe_or_shimmer_covered（2603）

| itemId | internalName | name | closureLane | 关键计数 |
| ---: | --- | --- | --- | --- |
| 1 | IronPickaxe | Iron Pickaxe | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 4 | IronBroadsword | Iron Broadsword | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 6 | IronShortsword | Iron Shortsword | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 7 | IronHammer | Iron Hammer | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 10 | IronAxe | Iron Axe | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 15 | CopperWatch | Copper Watch | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 16 | SilverWatch | Silver Watch | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 17 | GoldWatch | Gold Watch | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 24 | WoodenSword | Wooden Sword | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 25 | WoodenDoor | Wooden Door | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 26 | StoneWall | Stone Wall | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 34 | WoodenChair | Wooden Chair | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 37 | Goggles | Goggles | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 39 | WoodenBow | Wooden Bow | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 41 | FlamingArrow | Flaming Arrow | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 44 | DemonBow | Demon Bow | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 45 | WarAxeoftheNight | War Axe of the Night | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 46 | LightsBane | Light's Bane | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 48 | Chest | Chest | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 55 | EnchantedBoomerang | Enchanted Boomerang | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 57 | DemoniteBar | Demonite Bar | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 70 | WormFood | Worm Food | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 71 | CopperCoin | Copper Coin | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 72 | SilverCoin | Silver Coin | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 73 | GoldCoin | Gold Coin | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 74 | PlatinumCoin | Platinum Coin | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 76 | CopperGreaves | Copper Greaves | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 78 | SilverGreaves | Silver Greaves | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 80 | CopperChainmail | Copper Chainmail | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 82 | SilverChainmail | Silver Chainmail | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 85 | Chain | Chain | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 89 | CopperHelmet | Copper Helmet | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 91 | SilverHelmet | Silver Helmet | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 93 | WoodWall | Wood Wall | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 94 | WoodPlatform | Wood Platform | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 99 | IronBow | Iron Bow | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 100 | ShadowGreaves | Shadow Greaves | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 101 | ShadowScalemail | Shadow Scalemail | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 102 | ShadowHelmet | Shadow Helmet | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 103 | NightmarePickaxe | Nightmare Pickaxe | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 104 | TheBreaker | The Breaker | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 105 | Candle | Candle | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 106 | CopperChandelier | Copper Chandelier | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 107 | SilverChandelier | Silver Chandelier | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 108 | GoldChandelier | Gold Chandelier | `recipe_or_shimmer_chain_covered` | active=0, recipe=1, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 109 | ManaCrystal | Mana Crystal | `recipe_or_shimmer_chain_covered` | active=0, recipe=4, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 119 | Flamarang | Flamarang | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 120 | MoltenFury | Molten Fury | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 121 | FieryGreatsword | Volcano | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 122 | MoltenPickaxe | Molten Pickaxe | `recipe_or_shimmer_chain_covered` | active=0, recipe=2, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |

仅展示前 50 条；完整列表见 JSON 报告。

### npc_relation_not_projected（2）

| itemId | internalName | name | closureLane | 关键计数 |
| ---: | --- | --- | --- | --- |
| 1586 | CenxsWings | Cenx's Wings | `npc_relation_chain_gap` | active=0, recipe=0, raw=0, candidate=0, npc=1, biome=0, maint=0, relation=0 |
| 3217 | CorruptPlanterBox | Deathweed Planter Box | `family_policy_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=1, biome=0, maint=0, relation=0 |

### biome_projection_pending（15）

| itemId | internalName | name | closureLane | 关键计数 |
| ---: | --- | --- | --- | --- |
| 1827 | BladedGlove | Bladed Glove | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 2312 | FlarefinKoi | Flarefin Koi | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 2320 | Rockfish | Rockfish | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 2885 | InfernalWispDye | Infernal Wisp Dye | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 3027 | ReflectiveGoldDye | Reflective Gold Dye | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 3028 | BlueAcidDye | Blue Acid Dye | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 3196 | BombFish | Bomb Fish | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4377 | KryptonMoss | Krypton Moss | `family_policy_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4389 | ArgonMoss | Argon Moss | `family_policy_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4469 | MeowmereMinecart | Meowmere Minecart | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4471 | PirateMinecart | The Dutchman | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4546 | GoblinSharkBanner | Hemogoblin Shark Banner | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4942 | PumpkingMasterTrophy | Pumpking Relic | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 4967 | SporeSkeletonBanner | Spore Skeleton Banner | `biome_evidence_projection` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |
| 5375 | HardenedSandWallUnsafe | Treacherous Hardened Sand Wall | `family_policy_candidate` | active=0, recipe=0, raw=0, candidate=0, npc=0, biome=1, maint=0, relation=0 |

### raw_candidate_not_projected（23）

| itemId | internalName | name | closureLane | 关键计数 |
| ---: | --- | --- | --- | --- |
| 766 | BoneBlock | Bone Block | `needs_external_source_evidence` | active=0, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2772 | VortexAxe | Vortex Axe | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2773 | VortexChainsaw | Vortex Chainsaw | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2775 | VortexHammer | Vortex Hammer | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2777 | NebulaAxe | Nebula Axe | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2778 | NebulaChainsaw | Nebula Chainsaw | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2780 | NebulaHammer | Nebula Hammer | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2782 | SolarFlareAxe | Solar Flare Axe | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2783 | SolarFlareChainsaw | Solar Flare Chainsaw | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2785 | SolarFlareHammer | Solar Flare Hammer | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2881 | PhasicWarpEjector | Phasic Warp Ejector | `needs_external_source_evidence` | active=0, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2903 | BlueCultistFighterBanner | Blue Cultist Fighter Banner | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2989 | WhiteCultistArcherBanner | White Cultist Archer Banner | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2990 | WhiteCultistCasterBanner | White Cultist Caster Banner | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 2991 | WhiteCultistFighterBanner | White Cultist Fighter Banner | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3398 | SeveredHandBanner | Severed Hand Banner | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3404 | PoisonousSporeBanner | Poisonous Spore Banner | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3462 | StardustAxe | Stardust Axe | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3463 | StardustChainsaw | Stardust Chainsaw | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 3465 | StardustHammer | Stardust Hammer | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 4010 | ApplePieSlice | Apple Pie Slice | `needs_external_source_evidence` | active=0, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 4058 | SkeletonBow | Skull Bow | `needs_external_source_evidence` | active=0, recipe=0, raw=1, candidate=0, npc=0, biome=0, maint=0, relation=0 |
| 5668 | SoundGun | The Imploder | `needs_external_source_evidence` | active=0, recipe=0, raw=2, candidate=0, npc=0, biome=0, maint=0, relation=0 |

## 下一轮建议

先处理 `active_source_present` 1068 条：重建 closure 或排查 stale report。

