# Maint Item Relation Domain Design

日期：2026-04-23

## Goal

以 `terria_v1_maint` 现有 `maint_*` 数据为唯一上游事实入口，核查并加工 `item` 与下列关系域之间的真实关联：

- `recipe`
- `npc source / loot / shop`
- `buff`
- `projectile`
- `biome`
- `category`
- `image`
- `source snapshot`

但处理结果**不写回** `terria_v1_maint`，也**不直接写入** `terria_v1_local`，而是新建一套独立处理库承接规范化关系结果与审计结果。

---

## Scope

### In Scope

- 以 `terria_v1_maint` 的 `maint_*` 表为唯一输入面
- 新建独立关系处理库，暂定名为 `terria_v1_relation`
- 在新库中落规范化后的 item 关系结果表、异常表、审计表
- 补齐 `maint` 中尚未真正落库但已在脚本中定义的分类规则结果链路
- 对 `recipe / npc source / buff / projectile / biome / category` 建立可回溯、可审计、可 dry-run 的处理流程
- 先做 audit + canonical 规则层，不直接覆盖 `local`

### Out Of Scope

- 不直接改写 `terria_v1_local` 业务表
- 不把 `maint` 当成最终业务消费库
- 不在本轮直接改前后端 API / 页面
- 不把低置信推断直接当成最终事实落地
- 不把无证据的名称猜测写成正式关系

---

## Confirmed Decisions

以下决策来自本轮问卷确认：

- `maint` 是唯一上游事实入口，`local` 不再与 `maint` 并列作为主事实源
- 第一阶段只在 `maint` 基础上加工，不写 `local`
- 分类规则层需要补齐
- `maint` 与 `local` 的数量差异不阻断 maint 内加工，但阻断任何直接覆盖 local 的动作
- 允许新增关系处理表，但尽量只在确有必要时新增
- 所有加工关系都必须可回溯到 `maint record_key / landing_source_id`
- 所有可疑关系都必须进入异常报告
- 异常本轮先以报告形式输出，不先建持久 `issues` 库表
- 允许低置信推断，但必须显式标记 `reason / confidence / review_status`
- item 主匹配键采用 `source_id + internal_name` 双校验，缺失时降级并入 issue
- recipe 采用多来源合并去重后形成 canonical
- `item source -> npc` 不直接信任 `source_ref_type='npc'`，必须做实体核验
- `drop` 要区分 NPC 掉落与环境/对象来源
- buff 采用双向视图，但底层只保留一套规范关系
- projectile 第一阶段只做审计，不直接落正式关系
- biome 采用 `maint + local` 对照校验
- 输出必须包含 JSON + Markdown dry-run/audit 报告

---

## Architecture

整体采用三库分层：

### Layer 1: Landing / Maint Snapshot

保留当前已存在的事实快照，不承担最终业务语义：

- `source_dataset_landings`
- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`
- `maint_item_pages`
- `maint_item_page_recipes`
- `maint_item_images`
- `maint_recipe_pages`
- `maint_recipe_page_recipes`
- `maint_item_recipes`
- `maint_item_sources`
- `maint_item_biomes`
- `maint_source_snapshots`
- `maint_categories`
- `maint_item_categories`

这一层只回答：

- 原始数据是什么
- 从哪里来
- 当前快照长什么样

### Layer 2: Relation Processing Database

新增独立数据库，暂定：

- `terria_v1_relation`

这一层回答：

- 基础实体当前快照是什么
- 哪些关系被视为 canonical
- 哪些关系只是候选
- 哪些关系无法确定
- 每条关系为什么成立
- 每条关系回溯到哪里

### Layer 3: Local Business Projection

`terria_v1_local` 继续作为当前运行时业务库，但本轮只允许：

- 只读对照
- 差异分析
- 导入规划

不允许本轮直接覆盖。

---

## Source Of Truth

### 上游唯一事实入口

唯一上游事实入口是 `terria_v1_maint`。

含义：

- 所有 item 关系加工都从 `maint` 读取
- `local` 只做既有业务模型对照
- `standardized` 文件和历史报告只作为辅助证据，不直接盖过 `maint`

### 证据优先级

同一事实发生冲突时，优先级为：

1. `maint` 原始快照行与其 `raw_json`
2. 对应 `landing_source_id / landing_source_key`
3. `maint_source_snapshots`
4. `terria_v1_local` 既有业务表
5. `data/standardized/*.json`
6. 历史报告与执行记录

---

## Data Flow

### 1. Read

从 `terria_v1_maint` 读取：

- item 主实体
- recipe 多来源快照
- item source 候选
- biome 候选
- buff / projectile / npc 独立实体
- category 快照
- source snapshot

### 2. Normalize

按关系域分别做规范化：

- recipe canonical
- item source canonical
- NPC shop / loot 候选拆分
- buff source canonical
- biome canonical
- category canonical

### 3. Resolve

对需要实体匹配的关系做解析：

- item -> npc
- item -> buff
- item -> biome
- item -> category

解析结果分三类：

- `resolved`
- `candidate_low_confidence`
- `unresolved`

### 4. Persist

写入新库 `terria_v1_relation`：

- canonical result tables
- candidate tables 或 low-confidence rows
- audit summary tables
- run summary tables

### 5. Report

每轮处理输出：

- JSON 报告
- Markdown 报告
- 抽样证据链
- unresolved / conflict 清单

---

## Data Model

本轮采用“关系头表 + 规范化明细 + 审计结果”的结构，不把所有语义挤进单表。

### A. Run / Audit Tables

- `relation_runs`
  - 一次处理执行记录
  - 保存输入范围、时间、模式、统计

- `relation_run_reports`
  - 保存输出报告索引
  - 指向生成的 JSON / Markdown 文件

### A1. Base Entity Tables

- `relation_items`
- `relation_npcs`
- `relation_projectiles`

语义：

- 直接镜像 `maint_items / maint_npcs / maint_projectiles`
- 作为 `relation` 库内的基础实体快照层
- 与关系结果表共用同一库，但来源仍然只认 `maint`
- 不引入 `local` 口径

### B. Category Result Tables

从 `maint_categories + maint_item_categories` 生成：

- `category_nodes`
- `item_category_assignments`

语义沿用已确认的旧问卷：

- group node 保留但显式标记
- item 可多分类命中
- 必须有 `is_primary`
- current-only

### C. Recipe Result Tables

从 `maint_item_recipes + maint_item_page_recipes + maint_recipe_page_recipes` 合并得到：

- `item_recipe_heads`
- `item_recipe_ingredients`
- `item_recipe_stations`

关键点：

- recipe 以 `result + ingredients + stations + version_scope` 去重
- ingredients / stations 无法匹配 item 时保留原始文本并标记 unresolved
- 多来源保留 source trace，不丢原始来源差异

### D. Item Source / NPC Candidate Tables

从 `maint_item_sources` 生成：

- `item_source_facts`
- `item_source_details`
- `item_npc_shop_candidates`
- `item_npc_loot_candidates`

拆分原因：

- 当前 `maint_item_sources` 没有完整展开掉率、数量、解析状态
- `shop` 与 `drop` 的语义不同
- `source_ref_type='npc'` 不足以直接写成 NPC 关系

`item_source_facts` 负责保存通用来源事实：

- item
- source type
- source ref text
- biome code
- source trace

`item_source_details` 负责补充来源细节：

- quantity_min / quantity_max / quantity_text
- chance_value / chance_text
- notes
- source_ref_internal_name
- source_ref_resolution

NPC 解析后再分流：

- 能稳定匹配 NPC 的 `shop` -> `item_npc_shop_candidates`
- 能稳定匹配 NPC 的 `drop` -> `item_npc_loot_candidates`
- 不能稳定匹配的保留 unresolved，不写成 NPC 事实

### E. Buff Result Tables

第一阶段采用双向视图、一套底层事实：

- `item_buff_relations`

字段表达：

- item 侧
- buff 侧
- relation_type
- duration_ticks
- chance_value / chance_text
- confidence
- source trace

来源优先以 `maint` 为主，并与 `local.buff_source_items` 交叉比对，不直接覆盖 local。

### F. Biome Result Tables

- `item_biome_relations`

来源优先以 `maint_item_biomes` 为主，但要和 `local.item_biomes` 做对照审计。

### G. Projectile Audit Tables

第一阶段不落正式 item-projectile 事实表，只做：

- `item_projectile_audits`

记录：

- 候选来源
- 可用字段
- 是否可稳定解析
- 为什么暂不落正式关系

### H. Issue / Review Output

本轮不新建持久 `issues` 表，问题通过报告输出。

每条问题至少包含：

- domain
- severity
- relation key
- source trace
- reason
- confidence
- recommended action

---

## Canonical Rules

### Item Identity

item 解析规则：

1. 先以 `source_id + internal_name` 双校验
2. `source_id` 缺失或异常时降级 `internal_name`
3. 名称只允许辅助，不允许直接成为正式主键
4. 仅存在于 `maint` 不存在于 `local` 的 item 仍参与加工，但必须标记 `local_missing`

### Recipe Canonical

recipe 规则：

1. 收集三条 maint recipe 来源
2. 转成统一 recipe structure
3. 按 `result + ingredients + stations + version_scope` 生成 canonical key
4. 保留所有来源 trace
5. 无法解析的 ingredient / station 保留为 unresolved component

### NPC Source Canonical

item source -> NPC 规则：

1. 不能仅凭 `source_ref_type='npc'` 直接认定 NPC
2. 先匹配 `maint_npcs`
3. 再对照 `local.npcs`
4. 文本污染或对象来源保留 unresolved
5. `shop` 与 `drop` 分开建模

### Buff Canonical

1. 先建立 item 与 buff 的底层事实
2. item 侧与 buff 侧都可投影读取
3. 来源不足时允许空 duration/chance，但必须保留 trace 和 reason

### Category Canonical

沿用已确认问卷结果：

- current-only
- one item may map to multiple categories
- must mark primary
- group node retained but explicitly marked

---

## Diagnostics And Reporting

每个关系域都必须输出：

- 总输入行数
- 成功解析数
- 低置信候选数
- unresolved 数
- conflict 数
- 典型样例至少 5 条

最少报告集合：

- `reports/relation-audit-YYYY-MM-DD.json`
- `reports/relation-audit-YYYY-MM-DD.md`
- `reports/relation-conflicts-YYYY-MM-DD.json`
- `reports/relation-unresolved-YYYY-MM-DD.json`

---

## Validation

### Minimum Validation

1. schema 生成脚本测试通过
2. 关系解析单元测试通过
3. dry-run 不写 local
4. 新库行数统计与报告一致
5. 每个关系域至少完成 5 条人工抽样证据链核验

### Validation Order

1. `maint` 输入计数核验
2. 关系处理 dry-run
3. 审计报告比对
4. 小样本 SQL 抽查
5. 仅在全部通过后，才写新库

---

## Risks

1. `maint_item_sources` 当前字段展开不足，必须补 detail 层，否则 NPC 掉落/商店关系会失真。
2. `maint_items / standardized / local.items` 数量不一致，任何 local 投影前都必须有差异报告。
3. 分类规则层在脚本已定义、库中未落地，说明 schema 与运行库状态存在漂移。
4. projectile 关系缺少稳定显式字段，强推 item-projectile 正式关系风险高。
5. `source_ref_name` 存在明显污染样本，如 `Dryad for`，必须保留原值与清洗证据，不能静默改写。

---

## Success Criteria

- `maint` 成为唯一上游事实入口
- 新增独立处理库，且不与 `local / maint` 混用
- recipe / npc source / buff / biome / category 至少形成可运行的 canonical + audit 方案
- 所有关系结果都可回溯到 `maint` 与 landing
- 所有 unresolved / conflict 都有报告
- 在未完成差异审计前，不发生任何 `local` 覆盖写入

---

## Implementation Status

- Plan: `docs/superpowers/plans/2026-04-23-maint-item-relation-domain.md`
- Target processing database: `terria_v1_relation`
- Write policy: no writes to `terria_v1_local` or `terria_v1_maint`
- Current status: implemented through dry-run and `apply=true`
- Local reference status: removed from runtime generation path; current pipeline uses `maint` only
- Base entity status: `relation_items / relation_npcs / relation_projectiles` 已同步入库
- Current reports:
  - `reports/relation/relation-audit-2026-04-24.json`
  - `reports/relation/relation-audit-2026-04-24.md`
  - `reports/relation/relation-conflicts-2026-04-24.json`
  - `reports/relation/relation-unresolved-2026-04-24.json`
