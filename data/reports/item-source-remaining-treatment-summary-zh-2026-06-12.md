# 物品来源剩余处理闭环汇总

生成时间：2026-06-13T05:13:04.058Z

## 总结论

- 本次完成的是“剩余来源证据处理闭环”：把剩余行分成已由专属结构覆盖、dry-run 可导入、policy/parser 阻断、投影阻断、raw evidence 缺失、豁免审查。
- dry-run 实际可插入普通来源：`0` source rows / `269` candidates。当前无待 apply 的普通来源行。
- 不能说“全处理完并已入库”：因为写库 apply、crawler/fetch、真实 backfill 都在本轮安全边界之外。

## 数量

| 类别 | 数量 | 当前处理方式 |
| --- | ---: | --- |
| 总剩余行 | 3730 | 已按 evidence layer 全量分类 |
| recipe/shimmer 专属结构覆盖 | 2603 | 不重复写普通来源，后续补 API/UI 专属展示 |
| dry-run 可插入普通来源 | 0 | 无待 apply 普通来源行 |
| family policy 阻断候选 | 0 | 需要 family page policy/parser |
| family parser/policy 待建模 | 0 | 需要 pageTitle/sourceType/sourceRefType 规则 |
| blocked source row 候选 | 0 | 需要 ref type / group source 精修 |
| NPC/biome 投影阻断 | 17 | 需要关系投影/API/UI contract |
| 缺 raw evidence | 0 | 不能猜，需补精确 raw 页面证据 |
| terminal/身份豁免 | 19 | 保持豁免或人工审查，不导入普通来源 |
| item-only 无证据 | 0 | 本轮为 0 |

## 已可执行但未越界执行

- 已生成 focused candidate plan：292 candidates。
- dry-run 选中：269 candidates。
- dry-run 将插入：0 rows。
- validation errors：0。
- duplicates：276。
- 本轮没有执行 `--apply=true`，没有写 DB，没有跑 crawler/fetch/import/backfill/sync/pipeline/Flyway。

## family policy 审查

| sourcePage | items |
| --- | ---: |
| Paintings | 97 |
| Music Boxes | 95 |
| Statues | 52 |
| Dragonflies | 6 |
| Logic Gates | 6 |
| Team Blocks | 6 |
| Altars | 4 |
| Moss | 4 |
| Vases | 4 |

| sourceType/refType | rows |
| --- | ---: |
| `worldgen/world` | 221 |
| `shop/npc` | 108 |
| `drop/boss` | 8 |
| `mining/world` | 5 |
| `drop/npc` | 4 |

## API/UI 审查

- 可见性：partial。
- 结论：前台 item detail 已能泛化展示 /public/items/{id}/sources 和 recipe-tree，但 recipe/shimmer、NPC loot/shop、biome/location 的专属证据字段还没有完整落到 public contract/UI。
- 缺字段：`evidenceKind`、`sourceFactKey`、`recipeId`、`recipeKind`、`npcDetailPath`、`lootEntryId`、`shopEntryId`、`dropSourceKind`、`biomeDetailPath`

## 样本

### dry-run 可插入样本

| internalName | name | 说明 |
| --- | --- | --- |
| RoninShirt | Wandering Yukata | craft/item |
| TimelessTravelerHood | Timeless Traveler's Hood | craft/item |
| TVHeadPants | Pinstripe Pants | craft/item |
| AHorribleNightforAlchemy | A Horrible Night for Alchemy | worldgen/world |
| AmericanExplosive | American Explosive | worldgen/world |
| AncientTablet | Ancient Tablet | worldgen/world |
| AndrewSphinx | Andrew Sphinx | worldgen/world |
| AnvilStatue | Anvil Statue | worldgen/world |
| AuroraBorealis | Aurora Borealis | worldgen/world |
| AxeStatue | Axe Statue | worldgen/world |

### 投影阻断样本

| internalName | name | 说明 |
| --- | --- | --- |
| CenxsWings | Cenx's Wings |  |
| CorruptPlanterBox | Deathweed Planter Box |  |
| BladedGlove | Bladed Glove |  |
| FlarefinKoi | Flarefin Koi |  |
| Rockfish | Rockfish |  |
| InfernalWispDye | Infernal Wisp Dye |  |
| ReflectiveGoldDye | Reflective Gold Dye |  |
| BlueAcidDye | Blue Acid Dye |  |
| BombFish | Bomb Fish |  |
| KryptonMoss | Krypton Moss |  |
| ArgonMoss | Argon Moss |  |
| MeowmereMinecart | Meowmere Minecart |  |
| PirateMinecart | The Dutchman |  |
| GoblinSharkBanner | Hemogoblin Shark Banner |  |
| PumpkingMasterTrophy | Pumpking Relic |  |
| SporeSkeletonBanner | Spore Skeleton Banner |  |
| HardenedSandWallUnsafe | Treacherous Hardened Sand Wall |  |

## 下一步

- NPC/biome 关系投影：17。补 public contract 和前台专属展示，不伪造成普通来源。

