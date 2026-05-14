# TerraPedia M8-M10 后端数据时效闭环正式里程碑计划
日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`  
依据：`TerraPedia_全量用域清单与待确认问题_2026-04-22.md` 的已确认答复

---

## 1. 本轮目标

本批里程碑不再以前台公开能力为主线，正式切回：

> 后端数据按时爬取、持续更新、标准化、稳定入库、可验收、可回跑。

本批主线不处理：

- 前台新页面
- 公开 DTO / SEO / Sitemap
- 文章与实体联动

这些能力全部后移，不纳入本批默认执行范围。

---

## 2. 已确认口径

本轮按以下已确认答复执行：

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

由此固定出以下执行原则：

1. 本轮覆盖 `基础实体域 + 增强源域 + 核心关系域`
2. `Boss` 继续按聚合域处理，不回退成独立基础实体域
3. `NPC Rich Source` 第一批只收 `Town NPC` 子集
4. `Item Pages / Description Enrichment` 纳入主链
5. `Recipes` 继续沿用当前 `item_relations recipes lane` canonical
6. `Categories` 采用 `DB 为主、wiki 为校验与同步来源`
7. `Game Periods` 为静态 lookup
8. `World Contexts` 为半静态支撑域
9. `Shimmer / Buffs / Projectiles / Armor Sets / Biomes / Images / ZH` 作为第二层成熟域跟随主线并轨
10. `Articles` 不纳入本轮结构化数据时效主线

---

## 3. 本轮域范围

### 3.1 第一层主干域

- `Items`
- `Item Pages / Description Enrichment`
- `NPC Core`
- `NPC Rich Source / Town NPC 子集`
- `Town NPC Maintenance`
- `NPC Shop Entries`
- `Item Relations`
- `Recipes`
- `Boss Groups`
- `Boss Loot`
- `Biomes`

### 3.2 第二层跟随域

- `Buffs`
- `Projectiles`
- `Armor Sets`
- `Shimmer`
- `Images / Assets`
- `ZH Enrichment`
- `Categories / Taxonomy`

### 3.3 支撑治理域

- `Game Periods`
- `World Contexts`
- `Item Rarity`
- `Game Model` 保持保留字段，不在本轮升格

---

## 4. 里程碑总览

| 里程碑 | 名称 | 核心目标 |
| --- | --- | --- |
| `M8` | 后端时效入口统一 | 把抓取、标准化、导入、验收从分散脚本收敛成统一后端刷新入口 |
| `M9` | 主干域持续同步闭环 | 完成第一层主干域的持续同步、增量执行、统一验收 |
| `M10` | 成熟域并轨与运维收口 | 把第二层成熟域并入同一框架，并补齐运行文档、问题归档、验收口径 |

---

## 5. M8：后端时效入口统一

### 5.1 目标

把当前分散的数据脚本链路收敛为统一入口，至少解决以下问题：

- 默认 API 基址漂移
- 抓取与导入入口分散
- 计划 / 执行 / 恢复能力不统一
- 无法快速判断“本轮后端刷新到底跑了哪些域”

### 5.2 范围

- `run-wiki-sync`
- `Town NPC fetch/import`
- `item detail / item relations / boss loot` pipeline
- `standardized` 数据与导入脚本入口
- 默认运行配置解析

### 5.3 默认批次

- `M8-R1`：统一脚本默认后端 API 基址与本地运行配置
- `M8-R2`：新增统一后端数据刷新入口，串起主干抓取与导入链
- `M8-R3`：补齐计划 / 执行 / 问题归档 / 最小验收输出

### 5.4 完成标准

- 不再依赖散落的 `8888` 历史默认值
- 核心后端刷新具备一个明确入口
- 单次执行结束后可以输出本轮动作与问题汇总

---

## 6. M9：主干域持续同步闭环

### 6.1 目标

把第一层主干域真正纳入“可重复执行”的持续同步闭环。

### 6.2 范围

- `Items`
- `Item Pages`
- `NPC Core`
- `Town NPC 子集 Rich Source`
- `Town NPC Maintenance / Shop`
- `Item Relations / Recipes`
- `Boss Groups / Boss Loot`
- `Biomes`

### 6.3 默认批次

- `M9-R1`：Items / Item Pages / Item Relations / Recipes
- `M9-R2`：NPC Core / Town NPC Rich Source / Town NPC Import
- `M9-R3`：Boss 聚合域 / Boss Loot / Biomes

### 6.4 完成标准

- 每批都有清晰的 fetch -> transform/standardize -> import -> audit 链
- 支持 dry-run 与 apply
- 结果可通过固定报告或 JSON 快照复核

---

## 7. M10：成熟域并轨与运维收口

### 7.1 目标

把第二层成熟域纳入同一套刷新与验收框架，并补齐运维侧收口。

### 7.2 范围

- `Buffs`
- `Projectiles`
- `Armor Sets`
- `Shimmer`
- `Images`
- `ZH Enrichment`
- `Categories`
- 问题汇总文档
- 运行说明与默认命令

### 7.3 默认批次

- `M10-R1`：Buffs / Projectiles / Armor Sets
- `M10-R2`：Shimmer / Images / ZH / Categories
- `M10-R3`：运维说明、问题归档、验收收口

### 7.4 完成标准

- 第二层成熟域并入统一入口
- 问题不再散落在对话里，而是沉淀到文档
- 后端数据链路达到“可持续运转”标准

---

## 8. 顺序约束

1. `M8` 必须先于 `M9`
2. `M9` 必须先于 `M10`
3. `M8` 没有收住前，不允许继续扩前台能力
4. `Boss` 不回退为独立基础实体域
5. `Game Periods` 不升级为独立动态抓取域
6. `World Contexts` 继续按半静态支撑域治理

---

## 9. 当前默认执行入口

本轮已确认后，默认立即从：

- `M8-R1：统一脚本默认后端 API 基址与本地运行配置`

开始执行。

原因：

- 这是当前所有后端刷新链路的公共前置条件
- 现有脚本中仍残留历史 `8888` 默认口径
- 不先收掉这层，后续统一刷新入口和自动执行都不可靠

---

## 10. 运行中问题处理原则

执行过程中如果出现问题：

1. 不在对话里逐条追问
2. 统一沉淀到 `project-plan` 下的问题汇总 `MD`
3. 在不影响主线的情况下先继续推进后续可执行项
4. 仅在真正阻塞整个批次时停止

---

## 11. 结论

本轮正式从“前台公开能力规划”切回“后端数据时效闭环”主线。  
默认执行顺序为：

- `M8`
- `M9`
- `M10`

并且已经明确从 `M8-R1` 开始直接执行，不再重复确认。
