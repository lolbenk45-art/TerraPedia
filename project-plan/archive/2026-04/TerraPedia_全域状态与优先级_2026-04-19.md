# TerraPedia 全域状态与优先级

日期：2026-04-19  
读者：项目负责人、当前开发者、后续里程碑制定者  
用途：在继续推进 TerraPedia 下一阶段之前，先把“会用到的结构化业务域”盘清，确认当前状态、依赖关系、优先级和下一步动作。  

---

## 先下结论

截至 2026-04-19，TerraPedia 不能被判断为“基础域都已爬好、关系都已处理完成”。

更准确的判断是：

> 一部分基础实体域已经具备稳定标准化数据，一部分关系域已经有脚本链路和局部消费面，但全域完成度并不一致，尤其 NPC rich data、Boss、配方 canonical 化、上下文域、图片资产域仍存在明显缺口。

因此，下一阶段不能按“所有域都已就绪”来排期，而应该按：

1. 是否阻塞当前主线
2. 是否已具备可复用数据基础
3. 是否已被主仓库前后台实际消费
4. 是否会持续污染后端/前端口径

来决定优先级。

---

## 本文范围

本文只讨论 **Terraria 结构化业务域**，不包含：

- 文章内容域
- 用户与认证域
- 通用前端壳层
- 纯开发工具链

本文中的“域”分为 4 类：

- **基础实体域**：物品、NPC、Buff、Projectile、Biome 等
- **关系域**：配方、掉落、商店、Shimmer 转化、Boss 成员关系等
- **支撑域**：分类、时期、世界上下文、图片资产等
- **消费/维护域**：Town NPC 维护、Public NPC Aggregate 等

---

## 排序规则

本次优先级采用以下规则：

### `P0`

当前主线的基础域或关键关系域。没有它们，NPC / Town NPC / Public NPC / 配方等主线会持续返工或口径不稳。

### `P1`

不立即阻塞主线，但已经被多个域依赖，或者已经有管理端 / 后端消费，需要尽快补成明确闭环。

### `P2`

已有一定基础，但不属于下一阶段最先收口对象。适合在核心域稳定后继续推进。

### `P3`

存在数据或功能基础，但当前不应抢占核心主线资源。

---

## 全域总表

| 域 | 类型 | 当前证据 | 当前状态 | 当前消费者 | 主要依赖 | 优先级 | 排序理由 | 下一步动作 |
|------|------|----------|----------|------------|----------|--------|----------|------------|
| `Items` | 基础实体域 | `items.standardized.json`，6131 条；已有 import / sync / public aggregate / admin | 高成熟度，可用 | 后端、前台、管理端、配方、Shimmer、Boss loot、Town NPC shop | 无 | `P0` | 几乎所有关系域都依赖物品；是全平台主根域 | 维持为基准域，继续做分类/时期/图片同步，不重开大改 |
| `Item Pages / Description Enrichment` | 支撑域 | `item_pages.standardized.json`，6131 条；有页面抓取与描述回填脚本 | 中高成熟度，局部消费 | Item 详情、描述同步、页面 enrich | Items | `P1` | 已经有全量标准化页面数据，但消费面没有完全冻结 | 作为 Items 子域继续收口，不单独抢主线 |
| `NPC Core` | 基础实体域 | `npcs.standardized.json`，762 条；DB / admin / public list/detail 已接入 | 中高成熟度，但 rich layer 未完成 | 管理端、Public NPC、Town NPC、后端聚合 | 无 | `P0` | 当前主线核心域；前后台都已经在用 | 保持 base contract 稳定，后续以 source enrichment 补全 |
| `NPC Rich Source / wiki-crawler-v1` | 关系/源增强域 | `.worktrees/wiki-crawler-v1`；`coverage-audit` 显示 523 目标、已抓 82、可继续 336；bridge `matched=116 / 762` | 明显未完成，只能算局部样板 | 暂未完整进入主仓库，只作为源增强候选 | NPC Core、图片、wiki 页面 | `P0` | 是 NPC 进一步做稳的关键，但完成度还不足；如果不先确认，会继续误导主仓库适配 | 先冻结“完成标准”，优先决定 Town NPC 子集还是全 NPC 子集作为第一闭环 |
| `Town NPC Maintenance / NPC Shop` | 维护/关系域 | `wiki-town-npc-maintenance.latest.json`；`recordCount=39`；`wiki-town-npc-import.latest.json` 显示 `matchedNpcCount=39`、`unmatchedShopItemCount=54`；管理端页面已存在 | 可用但未闭环 | 管理端 Town NPC 维护台、后端维护接口 | NPC Core、Items、时期、世界上下文 | `P0` | 当前正在真实消费；数据缺口可见且可量化 | 先把 shop / move-in / behavior / gamePeriod 的域边界固定，再决定 Town NPC 完成阈值 |
| `Item Relations + Recipes` | 关系域 | `item_relations.standardized.json`，14746 条；`standardized-view/item_relations/recipes/*`；生成 `recipe-material-reference.json`；有多条 import / sync / audit 脚本 | 中高成熟度，但 canonical 口径复杂 | Item 详情、管理端配方、材料参考、导入链路 | Items、Crafting Stations、Recipe Groups、World Context | `P0` | 是 Items、Town NPC、Shimmer、Boss loot 等多个域的关系中轴 | 先确认“当前 canonical 来源是否仍是 item_relations recipes lane” |
| `Crafting Stations` | 关系支撑域 | 管理端与后端已有；配方链路中持续使用 | 可用 | 管理端、配方服务 | Items、Recipes | `P1` | 已在当前系统里实用，但更多是配方支撑子域，不必单列抢主线 | 作为 Recipes 子域继续维持，不单开第一波里程碑 |
| `Recipe Groups` | 关系支撑域 | 有管理端、后端、`recipe-group-overrides.json` | 可用 | 配方服务、管理端 | Items、Recipes | `P1` | 与配方强绑定，不需要独立先行 | 与 Recipes 一起收口 canonical 口径 |
| `Buffs` | 基础实体域 + 关系域 | `buffs.standardized.json`，388 条；`buff-standardized-map.json`；有 import 与 backfill；管理端已覆盖；Public NPC aggregate 已读 buffRelations | 高成熟度，可用 | 管理端、后端、Public NPC 间接消费 | Items、NPCs | `P1` | 数据基础已经好，且是 NPC / item 关系的重要补域，但不是当前唯一阻塞项 | 可作为第二批稳定消费域，不需要早于 NPC / Recipes |
| `Boss / Boss Loot / Boss Members` | 基础实体域 + 关系域 | 有 `fetch-wiki-bosses.mjs`、`generate-boss-loot-bundle.mjs`、`import-boss-loot-to-db.mjs`；管理端已有 Boss 工作区；但无本地标准化 manifest 证据 | 中等成熟度，域形状未彻底冻结 | 管理端 Boss、部分掉落链路 | NPC Core、Items、Item Relations、Images | `P1` | 已经有功能基础，但当前主线不是 Boss；且 Boss 本身和 NPC/loot/member 关系复杂 | 先确认 Boss 是独立基础域还是 NPC 关系聚合域 |
| `Categories / Taxonomy` | 支撑域 | `wiki-item-categories.latest.json`、分类管理服务、Item/NPC 分类回填脚本 | 可用但口径分散 | Items、NPCs、前台筛选、管理端 | 无 | `P1` | 多个域共用，但目前更像支撑域而不是主里程碑主角 | 作为所有实体域的共同支撑规则先冻结 |
| `Game Periods / World Contexts` | 支撑域 | `PageQuery`、Town NPC、Shimmer 文档、商店条件等已使用；Shimmer 已写入 `world_contexts`；Town NPC 用 `gamePeriodId` | 局部可用，完成标准不清 | Recipes、Town NPC、Shimmer、Shop Conditions | 无 | `P1` | 是多个关系域的隐性依赖；如果不先定，条件类数据会持续混乱 | 先定义它是“支撑域”还是“可公开消费域” |
| `Images / Assets` | 支撑域 | image enrich、backfill、MinIO sync、多条 image sync workflow、`npc-standardized-map.json` 内已有 imageUrl | 可用但不均衡 | 前台、管理端、源增强域 | Items、NPCs、Projectiles、Buffs、Bosses | `P1` | 几乎所有公开域都需要，但它应该依附实体域验收，不应抢主线 | 定义每个实体域对图片的最小验收标准 |
| `Shimmer` | 关系增强域 | 已有抓取、transform、import、管理端 CRUD；`wiki-shimmer-manifest.latest.json` 显示 `itemTransforms=279`、`decraftRules=248`、`entityTransforms=121`、`npcTransforms=29`、`unresolvedCount=0` | 高成熟度，但偏独立功能域 | 管理端 Shimmer 页面、后端 CRUD | Items、NPCs、World Contexts | `P2` | 功能完成度高，但不阻塞当前 NPC / recipe / source 主线 | 保持现有成果，待主线稳定后再提消费优先级 |
| `Projectiles` | 基础实体域 | `projectiles.standardized.json`，1111 条；fetch / backfill / import 已存在；管理端已覆盖 | 高成熟度，但公开消费弱 | 管理端 | Items、Buffs、Images | `P2` | 数据基础不错，但当前不阻塞 NPC / recipe 主线 | 后置到核心关系域稳定之后 |
| `Biomes` | 基础实体域 + 关系支撑域 | `biomes.standardized.json`，7 条；fetch / transform / 管理端已存在 | 中高成熟度 | 管理端、itemBiomes 关系 | Item Relations、World Contexts | `P2` | 已有稳定基础，但当前不是最紧急公共消费域 | 作为中期公开实体域候选 |
| `Armor Sets` | 基础实体域 | `armor_sets.standardized.json`，18 条；生成 `armor-set-definition-map.json` | 中等成熟度 | 管理端或后续详情 enrich | Items | `P3` | 范围小，不是当前里程碑优先对象 | 继续保留，不抢资源 |

---

## 当前推荐优先级顺序

如果按“先把下一阶段真正会反复用到的域做稳”排序，推荐顺序是：

### 第一层：必须先确认

1. `Items`
2. `NPC Core`
3. `NPC Rich Source / wiki-crawler-v1`
4. `Town NPC Maintenance / NPC Shop`
5. `Item Relations + Recipes`

原因：

- 这是当前主线最直接的事实层和关系层
- 它们已经在主仓库和 `.worktrees` 两侧形成真实耦合
- 如果这五个域不先定，后续后端、前台、管理端都会继续长出隐式口径

### 第二层：应尽快跟上

6. `Categories / Taxonomy`
7. `Game Periods / World Contexts`
8. `Images / Assets`
9. `Buffs`
10. `Boss / Boss Loot / Boss Members`

原因：

- 它们是多个核心域的支撑域或扩展关系域
- 不一定是第一刀，但不应无限后拖

### 第三层：核心主线稳定后再推进

11. `Shimmer`
12. `Projectiles`
13. `Biomes`
14. `Armor Sets`

原因：

- 有的已经做得不错
- 但当前不应抢占 NPC / Recipes / Town NPC 这条主线的资源

---

## 当前最大现实问题

### 1. “基础域完成”与“消费域完成”被混用了

例如：

- `NPC Core` 已标准化，不等于 `NPC Rich Source` 已完成
- `Town NPC Maintenance` 已有页面，不等于 `NPC Shop` 已完全清洗
- `Recipes` 已有关系数据，不等于 canonical 口径已冻结

### 2. `.worktrees/wiki-crawler-v1` 不能被当成“NPC 已完成”

从当前报告看：

- 目标 `523`
- 已抓取 `82`
- bridge 匹配 `116 / 762`
- 还有 `646` 条 standardized NPC 未 enriched

这说明它是“有效推进中的源增强域”，不是“已完成源域”。

### 3. 支撑域没有明确验收口径

尤其是：

- `Categories / Taxonomy`
- `Game Periods / World Contexts`
- `Images / Assets`

这些域如果不先明确“什么算可用”，会持续以隐式字段污染各实体域。

---

## 下一步建议

本文件之后，不应立刻写实现代码，而应先做两件事：

1. 让项目负责人确认“哪些域进入下一波里程碑”
2. 把当前仍会影响里程碑设计的问题集中收拢后统一答复

换句话说：

> 这份文档的作用不是直接宣布“下一步开始做什么”，而是先把“哪些域真的值得进入下一阶段”说清楚。

在没有统一答复前，不建议继续往主仓库后端或前端推进新的域适配。
