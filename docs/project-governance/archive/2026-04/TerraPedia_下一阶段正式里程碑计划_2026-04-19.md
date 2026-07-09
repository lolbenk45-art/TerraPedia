# TerraPedia 下一阶段正式里程碑计划

日期：2026-04-19  
读者：项目负责人、当前开发者、后续执行者  
用途：基于 `TerraPedia_全域状态与优先级_2026-04-19.md` 与 `TerraPedia_下一阶段问题汇总_2026-04-19.md` 的确认答复，正式确定下一阶段的域闭环顺序、里程碑范围和完成标准。  

---

## 计划依据

本计划采用以下已确认口径：

- `Q1: A`
  - 下一阶段只覆盖 Terraria 结构化知识域
- `Q2: C`
  - 域完成标准必须满足：
    - 抓取
    - 标准化
    - 关系处理
    - DB 或管理端接入
    - 至少一个消费面验证
- `Q3: C`
  - `NPC rich source` 先以 Town NPC 闭环，再扩到 Boss 和高收益 Enemy shard
- `Q4: A`
  - Recipes 继续以 `item_relations recipes lane` 作为当前 canonical 来源
- `Q5: C`
  - Boss 先按关系聚合域处理，后续再升级成更强独立域
- `Q6: B`
  - `Categories / Taxonomy` 进入显式支撑域里程碑
- `Q7: B`
  - `Game Periods / World Contexts` 进入显式支撑域里程碑
- `Q8: B`
  - `Images / Assets` 不单列主里程碑，作为各域验收条目
- `Q9: B`
  - Shimmer 保持中优先级，排在 NPC / Recipes / Town NPC 之后
- `Q10: A`
  - 下一阶段按“域闭环”排：
    - 源域
    - 关系域
    - 维护域
    - 公开消费域

---

## 总体原则

### 1. 先定域，再接消费面

后端、前端、管理端都不能继续脱离域闭环单独推进。

每个里程碑都必须先回答：

- 这个域的源数据是什么
- 当前 canonical 口径是什么
- 和哪些支撑域或关系域耦合
- 什么算完成

### 2. 先做当前主线会反复用到的域

下一阶段不是全平台铺开，而是优先做当前真正反复使用的主线：

1. `Items`
2. `NPC Core`
3. `NPC Rich Source / Town NPC 子集`
4. `Town NPC Maintenance / NPC Shop`
5. `Item Relations + Recipes`

### 3. 图片作为验收条件，不作为独立主线

图片不单开主里程碑，但每个会被公开消费的域都必须带上图片验收标准。

### 4. Boss 暂时不按独立基础域排

Boss 先按：

- NPC member 关系
- boss loot
- item sources
- image assets

组成的聚合域推进，而不是先追求完整独立 canonical 基础域。

---

## 域完成标准

从本计划开始，任何域只有同时满足以下 5 项，才算真正完成：

1. **抓取已建立**
   - 有明确上游来源与脚本入口
2. **标准化已建立**
   - 有明确的本地标准化产物或 canonical 输出
3. **关系处理已建立**
   - 域内关键关系和跨域关键关系有明确处理结果
4. **接入已建立**
   - 已导入数据库，或已进入管理端维护链路
5. **消费验证已建立**
   - 至少有一个稳定消费面完成验证：
     - 管理端
     - 后端接口
     - 前台公开页

如果只满足前两三项，只能算“有基础”，不能算“域完成”。

---

## 里程碑总览

| 里程碑 | 名称 | 主要域 | 目标 |
|------|------|--------|------|
| `M0` | 域基线冻结 | 已完成文档基线 | 固定优先级、问题口径、完成标准 |
| `M1` | 支撑域冻结 | Categories / Taxonomy、Game Periods / World Contexts | 先把多域共用支撑规则固定下来 |
| `M2` | Town NPC 源域闭环 | NPC Core、NPC Rich Source（Town NPC 子集）、Images 验收 | 先做 Town NPC rich source 最小闭环 |
| `M3` | Town NPC 维护闭环 | Town NPC Maintenance、NPC Shop、Behavior / Move-in / Shop Matching | 让维护链路可验证、可复跑 |
| `M4` | 配方与关系域闭环 | Item Relations + Recipes、Crafting Stations、Recipe Groups | 冻结当前 recipe canonical 口径 |
| `M5` | NPC 公开消费闭环 | Public NPC Aggregate、NPC List / Detail、Buffs、Images 验收 | 让公开 NPC 消费面建立在稳定源域与维护域上 |
| `M6` | Boss 聚合域闭环 | Boss / Boss Loot / Boss Members、Items、NPCs、Images | 先做 Boss 关系聚合闭环 |
| `M7` | 次级成熟域接入 | Shimmer、Projectiles、Biomes、Armor Sets | 把成熟但非主线域纳入统一验收体系 |

---

## M0：域基线冻结

### 状态

已完成。

### 已有产物

- [TerraPedia_全域状态与优先级_2026-04-19.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_全域状态与优先级_2026-04-19.md)
- [TerraPedia_下一阶段问题汇总_2026-04-19.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_下一阶段问题汇总_2026-04-19.md)

### 作用

- 固定下一阶段的域边界
- 固定优先级
- 固定完成标准
- 防止再出现“域未确认就开始适配后端”的问题

---

## M1：支撑域冻结

### 目标

把 `Categories / Taxonomy` 和 `Game Periods / World Contexts` 从隐式依赖提升为显式支撑域。

### 包含域

- `Categories / Taxonomy`
- `Game Periods`
- `World Contexts`

### 为什么先做

它们是当前多个主线域的共同条件层：

- Items
- NPCs
- Town NPC
- Recipes
- Shimmer
- Shop Conditions

如果这层不先冻结，后面的关系域会继续长出隐式字段和临时解释逻辑。

### 交付内容

- 明确 `category` 体系的 canonical 口径
- 明确 `gamePeriod` 的 canonical 口径
- 明确 `worldContext` 的 canonical 口径
- 定义这些支撑域在：
  - DB
  - 管理端
  - 后端查询
  - 关系域引用
  
  中的统一字段名和使用方式

### 完成标准

- 支撑域有稳定数据来源与存储位置
- Town NPC、Recipes、Shimmer 至少可以共享同一套时期/上下文解释
- 分类不再在各域里各自定义

### 本里程碑不做

- 不做新的前台页面
- 不做 Boss 扩域
- 不追求所有实体域一次性全部接入支撑域

---

## M2：Town NPC 源域闭环

### 目标

把 `NPC Rich Source` 的第一闭环限定为 **Town NPC 子集**，而不是直接追求全 NPC 完成。

### 包含域

- `NPC Core`
- `NPC Rich Source / wiki-crawler-v1` 的 Town NPC 子集
- `Images / Assets` 作为验收项

### 为什么这样排

当前 `.worktrees/wiki-crawler-v1` 仍是：

- 总目标 `523`
- 已抓取 `82`
- bridge 匹配 `116 / 762`

这不足以支持“全 NPC 已完成”的判断。

但 Town NPC 子集已经有现成维护链路和消费面，是最适合先做的最小闭环。

### 交付内容

Town NPC 子集至少补齐以下源域能力：

- 基础身份与分类
- 行为说明 / function summary
- move-in 条件
- shop source
- 基础数值
- wiki 资产
- 图片链接
- 与主仓库 `NPC Core` 的 identity 对齐

### 完成标准

- Town NPC 子集 identity mapping 稳定
- 不再存在 Town NPC 级别的 unresolved identity 漏洞
- Town NPC rich source 字段可以稳定供给管理端维护链路
- 所需图片达到最小消费标准

### 本里程碑不做

- 不要求全 762 NPC 完成 rich source
- 不要求 Enemy shard 全量推进
- 不要求 Boss rich source 同步完成

---

## M3：Town NPC 维护闭环

### 目标

在 Town NPC 源域闭环之后，把管理端维护链路做成可验证、可复跑、可审计的域闭环。

### 包含域

- `Town NPC Maintenance`
- `NPC Shop`
- `Behavior Notes`
- `Move-in Conditions`
- `Shop Matching`

### 交付内容

- 维护台 overview / detail / edit 所需字段口径稳定
- `gamePeriod / behavior / shop / unmatchedShopItems` 有明确解释
- import / replace / skip 的规则固定
- 管理端对 Town NPC 的手工校正链可反复执行

### 完成标准

- 管理端可以用统一字段口径查看和修正 Town NPC
- `matched / unmatched / replaced / skipped` 的结果可解释
- Town NPC 不是“有页面”，而是“可持续维护”

### 本里程碑不做

- 不把整个 NPC 域都拉入维护台
- 不扩到 Boss 或全 Enemy

---

## M4：配方与关系域闭环

### 目标

继续使用当前 `item_relations recipes lane` 作为 canonical，把 Recipes 及其支撑关系域彻底讲清并稳定下来。

### 包含域

- `Item Relations`
- `Recipes`
- `Crafting Stations`
- `Recipe Groups`
- `Game Periods / World Contexts`

### 为什么是当前主线

它是多个域的关系中轴，当前已经在：

- Item 详情
- 管理端
- 参考数据生成
- 导入链路

中实际使用。

### 交付内容

- 冻结当前 recipe canonical 来源
- 明确 recipe / station / group / condition 的关系边界
- 补齐最关键的 audit 与验收口径

### 完成标准

- 不再在 recipe 口径上摇摆
- 管理端、后端、数据脚本三者对同一 recipe 关系的解释一致

### 本里程碑不做

- 不新建第二套配方 canonical
- 不在这一轮追求所有中文配方展示问题都一次性解决

---

## M5：NPC 公开消费闭环

### 目标

让 Public NPC 消费面建立在已经稳定的源域、维护域和关系域之上，而不是继续凭隐式字段猜。

### 包含域

- `Public NPC Aggregate`
- `NPC List / Detail`
- `Buffs`
- `Images / Assets` 作为验收项

### 交付内容

- 公共 NPC 列表与详情页使用稳定域口径
- `behaviorNotes / shopEntries / buffRelations / images` 可持续消费
- 不再混用维护域字段与公开域字段

### 完成标准

- Public NPC 至少形成一个真实可验收的公开消费面
- 前后台对同一 NPC 的基础事实一致

### 本里程碑不做

- 不扩到 Boss 公开页
- 不把全 NPC rich source 完成当成前置条件

---

## M6：Boss 聚合域闭环

### 目标

Boss 不先当成完整独立基础域处理，而先作为关系聚合域收口。

### 包含域

- `Boss`
- `Boss Loot`
- `Boss Members`
- `Items`
- `NPCs`
- `Images / Assets`

### 交付内容

- Boss member 归组
- Boss loot 关系稳定
- Boss 与 NPC / item sources 的关系解释明确
- 管理端对 Boss 的维护逻辑不再继续漂移

### 完成标准

- Boss 至少完成“关系聚合域”意义上的可维护、可查询、可验证

### 本里程碑不做

- 不要求 Boss 先拥有全独立 canonical 标准化体系

---

## M7：次级成熟域接入

### 目标

在主线域稳定后，把已经有较成熟基础、但不阻塞主线的域纳入统一验收体系。

### 包含域

- `Shimmer`
- `Projectiles`
- `Biomes`
- `Armor Sets`

### 交付内容

- 明确这些域的消费面
- 把它们放进统一的“抓取 / 标准化 / 关系 / 接入 / 消费验证”框架

### 完成标准

- 不再只是“有数据和脚本”
- 而是进入同一套工程验收体系

### 为什么排最后

- Shimmer 虽然完成度高，但不阻塞当前 NPC / Recipes / Town NPC 主线
- Projectiles / Biomes / Armor Sets 也不应该早于当前主线核心域

---

## 顺序约束

本计划必须遵守以下顺序：

1. `M1` 完成前，不进入新的关系域闭环
2. `M2` 完成前，不再继续广泛推进主仓库 NPC 公开消费扩域
3. `M3` 完成前，Town NPC 只能视为“局部可用”，不能视为完成
4. `M4` 完成前，Recipes 不能被视为完全稳定 canonical
5. `M5` 只能建立在 `M2 + M3 + M4` 完成之后
6. `M6` 不应抢在 `M2-M5` 前面
7. `M7` 必须晚于主线域闭环

---

## 建议执行方式

下一步的执行，不建议直接一口气铺到 `M7`。

建议按两段来做：

### 第一段

- `M1`
- `M2`
- `M3`

目标：

- 先把支撑域和 Town NPC 这条线做成真实样板

### 第二段

- `M4`
- `M5`
- `M6`
- `M7`

目标：

- 用样板反推关系域、公开域和次级域的统一验收体系

---

## 最终判断

下一阶段不是“继续随机扩功能”，而是：

> 先按域闭环把当前最会反复使用、最容易污染口径的主线域做稳，再去扩公开消费面和次级成熟域。

这个里程碑计划的核心，不是列更多事情，而是避免再次出现：

- 基础域未确认就适配后端
- 关系域未冻结就推进前台
- 支撑域隐式存在却没有验收标准

如果后续严格按这个顺序执行，TerraPedia 才会从“很多能力同时在动”，收敛成“几条主线真正闭环”。  
