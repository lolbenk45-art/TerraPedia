# TerraPedia 全量用域清单与待确认问题
日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`  
用途：在后续把重心切回“后端数据按时爬取、实时更新、标准化、稳定入库”之前，先把 TerraPedia 实际会用到的域完整列清，并把仍未拍板的问题集中成一份答题文档。

---

## 1. 先给结论

当前 TerraPedia 里“会用到的域”不能只理解成：

- `items`
- `npcs`
- `bosses`

真实会用到的域，至少要拆成 5 层：

1. **基础实体域**
2. **增强源域**
3. **关系 / canonical 域**
4. **支撑 / lookup 域**
5. **非结构化或非数据主线域**

如果后续目标是：

> 脚本按时爬取数据，数据能持续更新，更新后能标准化并稳定入库

那下一阶段真正要规划的，不只是“哪些域存在”，而是：

- 哪些域必须纳入**定时同步主线**
- 哪些域只是**静态字典 / 种子表**
- 哪些域是**下游关系域**，不能直接拿去做独立抓取
- 哪些域虽然在系统里存在，但**不属于这轮数据时效主线**

---

## 2. 本文口径

### 2.1 本文中的“会用到的域”包含

- 已经被后端控制器、服务、管理端、导入脚本、标准化脚本使用的结构化业务域
- 已经进入 `.worktrees` 或主仓脚本链路的抓取 / 标准化 / 导入对象
- 会影响后端持续更新能力的数据支撑域

### 2.2 本文中的“会用到的域”不等于

- 已经全部做成定时爬取域
- 已经全部做成公开 API
- 已经全部做成前台页面
- 已经全部完成标准化闭环

### 2.3 本文特别区分 3 类状态

- **已入库**：数据库已有表和数据
- **已纳入脚本链路**：存在抓取 / 转换 / 导入脚本
- **已形成持续同步闭环**：支持监测、增量、标准化、入库、验收

很多域目前只满足前两项，不满足第三项。

---

## 3. 全量用域总表

| 域 | 分层 | 当前用途 | 当前状态判断 | 是否应纳入后端时效主线 |
| --- | --- | --- | --- | --- |
| `Items` | 基础实体域 | 全平台核心实体 | 已入库，已标准化，已纳入脚本链路 | 是 |
| `Item Pages / Description Enrichment` | 增强源域 | 物品详情补充、描述、页面扩展信息 | 已抓取，已标准化，闭环仍偏增强型 | 是 |
| `NPC Core` | 基础实体域 | NPC 核心实体主表 | 已入库，已标准化，已纳入脚本链路 | 是 |
| `NPC Rich Source / wiki-crawler-v1` | 增强源域 | NPC 富文本、来源增强、后续 enrich | 明显未完全收口 | 是 |
| `Town NPC Maintenance` | 维护 / 关系域 | Town NPC 维护闭环、人工修正、审计 | 已有导入与维护链路，仍是子域 | 是 |
| `NPC Shop Entries` | 关系域 | Town NPC 售卖关系 | 已存在，依附于 Town NPC 维护域 | 是 |
| `Normal NPC Loot` | 关系域 | 普通 NPC 掉落 | 有导入脚本与表 | 是 |
| `Boss Groups` | 聚合实体域 | Boss 管理、Boss 成员聚合 | 已入库，域定义已收口到“聚合域” | 是 |
| `Boss Members` | 关系域 | Boss 与 NPC 成员映射 | 已接入 Boss 聚合域 | 是 |
| `Boss Loot` | 关系域 | Boss 掉落 | 已导入，但依赖 item relations 与 NPC owner 逻辑 | 是 |
| `Biomes` | 基础实体域 | 生物群系实体、配方条件、资源关系 | 已入库，已标准化，已接只读接口 | 是 |
| `Biome Relations` | 关系域 | biome 间关联 | 已存在于管理域 | 是 |
| `Biome Resources` | 关系域 | biome 资源 / 相关物品 | 已存在于管理域 | 是 |
| `Buffs` | 基础实体域 | buff 实体，关联 NPC / item | 已入库，已标准化，成熟度较高 | 是 |
| `Projectiles` | 基础实体域 | projectile 实体 | 已入库，已标准化，成熟度较高 | 是 |
| `Armor Sets` | 基础实体域 | armor set 定义与加成 | 已入库，已标准化，当前是次级成熟域 | 是 |
| `Shimmer` | 复合关系域 | 微光上下文、物品孵变、拆解、实体变换、NPC 变换 | 已入库，已验收，属于成熟复合域 | 是 |
| `Item Relations` | canonical 关系域 | 物品来源、配方、生物群系等关系容器 | 核心 canonical 关系层 | 是 |
| `Recipes` | canonical 关系域 | 配方结果、材料、站点、条件 | 已有完整关系链，但 canonical 仍需持续明确 | 是 |
| `Crafting Stations` | 支撑关系域 | 配方制作站 | 已接入 recipes | 是 |
| `Recipe Groups` | 支撑关系域 | 配方分组 | 已接入 recipes | 是 |
| `Recipe Context Requirements` | 支撑关系域 | 配方上下文条件，如 biome / world context | 已接入 recipes | 是 |
| `Categories / Taxonomy` | 支撑域 | 分类树、筛选、映射、标准化分类 | 已入库，部分已接抓取链路 | 是 |
| `Game Periods` | 支撑域 | pre-hardmode / hardmode 等阶段口径 | 已入库，但更像静态 lookup | 视决策而定 |
| `World Contexts` | 支撑域 | 月相、环境、特殊世界上下文 | 已入库，但当前多由下游导入脚本补齐 | 视决策而定 |
| `Item Rarity` | 支撑域 | 稀有度 lookup | 已入库，静态 lookup | 否，通常不纳入动态时效主线 |
| `Images / Assets` | 支撑域 | 图片同步、MinIO 存储、展示资源 | 已有独立 sync workflow | 是 |
| `ZH Enrichment` | 支撑流程域 | 中文补全 / 语言增强 | 已有 workflow | 是 |
| `Game Model` | 预留支撑域 | item / npc 表上已有字段，但现阶段没有清晰业务闭环 | 未成域 | 待确认 |
| `Articles` | 内容域 | 文章管理与公开内容 | 已存在，但不是结构化数据同步主线 | 否 |
| `Auth / User Auth` | 平台域 | 管理员 / 用户认证 | 已存在，但不属于结构化业务数据同步域 | 否 |
| `Storage / MinIO` | 基础设施域 | 文件与资源存储 | 已存在，但属于设施层 | 否 |
| `Statistics` | 平台辅助域 | 统计面板 | 已存在，但不是数据同步主线 | 否 |

---

## 4. 应纳入后端数据时效主线的域

这部分是后续如果要做“按时爬取、持续更新、标准化、入库”的真正主线域。

### 4.1 第一层：必须优先收口的主干域

1. `Items`
2. `Item Pages / Description Enrichment`
3. `NPC Core`
4. `NPC Rich Source / wiki-crawler-v1`
5. `Town NPC Maintenance`
6. `NPC Shop Entries`
7. `Item Relations`
8. `Recipes`
9. `Boss Groups`
10. `Boss Loot`
11. `Biomes`

这批域决定了：

- 主仓后端数据的新鲜度
- NPC / Boss / Recipe / Item 的口径是否持续稳定
- 后续其他次级域是否能挂在同一条主数据链上

### 4.2 第二层：成熟但应跟随主线统一时效化的域

1. `Buffs`
2. `Projectiles`
3. `Armor Sets`
4. `Shimmer`
5. `Images / Assets`
6. `ZH Enrichment`
7. `Categories / Taxonomy`

### 4.3 第三层：支撑域，但不一定是动态抓取域

1. `Game Periods`
2. `World Contexts`
3. `Item Rarity`
4. `Game Model`

这些域不能再被当成“随手补表”处理，但是否要做成独立动态同步域，要单独拍板。

---

## 5. 当前已经能确认的事实

### 5.1 已经进入统一抓取 / monitor / plan / apply 框架的域

从 [run-wiki-sync.mjs](G:\ClaudeCode\TerraPedia-dev\scripts\data\workflow\run-wiki-sync.mjs) 可以明确确认：

- `items`
- `npcs`
- `projectiles`
- `armor_sets`
- `buffs`
- `bosses`
- `biomes`
- `categories`
- `item_pages`
- `zh`
- `images`

已经有统一 workflow 配置。

### 5.2 已经明确存在后端控制器或管理入口的结构化域

从 `back/src/main/java/.../controller` 可以明确确认：

- `items`
- `npcs`
- `boss groups`
- `biomes`
- `buffs`
- `projectiles`
- `recipe groups`
- `recipe conditions`
- `item recipes`
- `crafting stations`
- `shimmer`
- `world contexts`
- `support domains`
- `categories`

### 5.3 已入库但当前更像 lookup / seed 的域

- `item_rarity`
- `game_period`
- `world_contexts` 的部分初始内容
- `category` 的基础树结构

这类域现在“不是没有”，但也“不是完整动态同步域”。

### 5.4 当前不能混用的概念

- “表里有数据” 不等于 “已经做成定时同步”
- “有后台管理页面” 不等于 “域定义已经冻结”
- “有抓取脚本” 不等于 “标准化与入库链路已经稳定”
- “有关系表” 不等于 “可以拿来当独立基础域”

---

## 6. 域分层正式建议

后续规划建议按下面这套口径固定。

### 6.1 基础实体域

- `Items`
- `NPC Core`
- `Biomes`
- `Buffs`
- `Projectiles`
- `Armor Sets`

### 6.2 增强源域

- `Item Pages / Description Enrichment`
- `NPC Rich Source / wiki-crawler-v1`

### 6.3 聚合实体域

- `Boss Groups`

说明：

- `Boss` 当前不建议回退为“独立基础实体域”
- 更合理的口径仍然是“以 NPC / loot / member 为底的聚合域”

### 6.4 关系 / canonical 域

- `Item Relations`
- `Recipes`
- `Crafting Stations`
- `Recipe Groups`
- `Recipe Context Requirements`
- `NPC Shop Entries`
- `Normal NPC Loot`
- `Boss Members`
- `Boss Loot`
- `Biome Relations`
- `Biome Resources`
- `Shimmer`

### 6.5 支撑 / lookup 域

- `Categories / Taxonomy`
- `Game Periods`
- `World Contexts`
- `Item Rarity`
- `Images / Assets`
- `ZH Enrichment`
- `Game Model`

### 6.6 非数据时效主线域

- `Articles`
- `Auth`
- `Users`
- `Storage`
- `Statistics`

这批域存在于系统中，但不应混入本轮“结构化数据按时同步”里程碑。

---

## 7. 当前不清楚、必须统一答复的问题

以下问题不再散落在对话里，统一按编号回答即可。

### Q1：下一阶段“后端优先”到底覆盖到哪一层？

推荐：`B`

- `A` 只做基础实体域与增强源域
- `B` 做基础实体域 + 增强源域 + 核心关系域
- `C` 把所有成熟次级域也一起纳入同一批

我的判断：

- 如果目标是数据持续更新，至少要选 `B`
- 只做 `A` 不足以形成真正闭环

### Q2：`Boss` 后续是否继续按“聚合域”处理？

推荐：`A`

- `A` 继续按 `Boss Groups + Boss Members + Boss Loot` 聚合域处理
- `B` 改成独立基础实体域，单独建设 canonical
- `C` 暂时不进入时效主线

### Q3：`NPC Rich Source / wiki-crawler-v1` 的第一批闭环范围是什么？

推荐：`A`

- `A` 先只收 `Town NPC` 子集
- `B` 直接扩到全量 `NPC`
- `C` 先只做当前已抓到的样本，不再继续扩大

### Q4：`Item Pages / Description Enrichment` 在时效主线中的级别是什么？

推荐：`B`

- `A` 只是物品详情附属增强，不阻塞主链
- `B` 作为 `Items` 的必需增强源，同步纳入主链
- `C` 后移到第二批

### Q5：`Recipes` 的 canonical 是否继续以当前 `item_relations recipes lane` 为准？

推荐：`A`

- `A` 继续沿用当前 canonical，不重开第二套
- `B` 重定义 recipe canonical
- `C` 暂时双轨并存

### Q6：`Categories / Taxonomy` 的定位是什么？

推荐：`B`

- `A` 完全以 DB 手工分类树为准，wiki 仅参考
- `B` DB 为主，wiki categories 作为同步与校验来源
- `C` 完全以 wiki categories 为准反推 DB

### Q7：`Game Periods` 的定位是什么？

推荐：`A`

- `A` 静态 lookup 域，不做独立动态抓取
- `B` 半静态域，允许脚本按规则补齐
- `C` 独立动态同步域

### Q8：`World Contexts` 的定位是什么？

推荐：`B`

- `A` 纯静态 lookup 域
- `B` 半静态支撑域，允许由 Town NPC / Shimmer / Recipes 等脚本补齐并统一治理
- `C` 独立动态抓取域

### Q9：`Shimmer` 是否进入下一批后端时效主线？

推荐：`B`

- `A` 先不进，只保留已验收状态
- `B` 进入第二层跟随主线统一治理
- `C` 直接提升到第一层主线

### Q10：`Buffs / Projectiles / Armor Sets / Biomes` 的收口方式是什么？

推荐：`B`

- `A` 一律后移，不进当前后端主线
- `B` 作为第二层成熟域，跟随统一调度与验收框架，但不抢第一层资源
- `C` 全部直接拉进第一层

### Q11：`Images / Assets` 与 `ZH Enrichment` 是阻塞项还是并行项？

推荐：`B`

- `A` 必须阻塞主数据入库后才算完成
- `B` 允许并行，但必须纳入统一验收矩阵
- `C` 完全后移，不计入本阶段

### Q12：`Game Model` 这个字段是否要被正式提升为支撑域？

推荐：`C`

- `A` 现在就提升为正式支撑域
- `B` 作为基础实体公共字段立即治理
- `C` 暂不立项，标记为保留字段，等真实消费出现再升格

### Q13：`Articles` 是否纳入本轮“后端时效主线”？

推荐：`C`

- `A` 纳入，和结构化域一起处理
- `B` 只做文章与实体关系
- `C` 不纳入，保持为独立内容域

### Q14：下一批里程碑默认以什么顺序推进？

推荐：`A`

- `A` 基础实体域 / 增强源域 -> 核心关系域 -> 支撑域治理 -> 次级成熟域并轨
- `B` 先做支撑域，再做全部实体域
- `C` 所有域一起并行

---

## 8. 我建议的默认答法

如果你不想逐题重新思考，按当前仓库状态和你的目标，我建议默认答法是：

- `Q1: B`
- `Q2: A`
- `Q3: A`
- `Q4: B`
- `Q5: A`
- `Q6: B`
- `Q7: A`
- `Q8: B`
- `Q9: B`
- `Q10: B`
- `Q11: B`
- `Q12: C`
- `Q13: C`
- `Q14: A`

---

## 9. 推荐回复格式

你后续可以直接按下面格式回复，不需要再重复问题文本：

```text
Q1: B
Q2: A
Q3: A
Q4: B
Q5: A
Q6: B
Q7: A
Q8: B
Q9: B
Q10: B
Q11: B
Q12: C
Q13: C
Q14: A
```

---

## 10. 本文之后的默认动作

在你给出这一轮统一答复之前，不建议直接进入新的后端适配或前台里程碑。  
更合理的顺序是：

1. 先把本文件中的问题答完
2. 基于答复生成新的“后端数据时效闭环版”正式里程碑计划
3. 再按里程碑连续执行，不再中途重复拆问
