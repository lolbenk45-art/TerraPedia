# Relation Replace Local Design

日期：2026-04-25

## Goal

以 `terria_v1_maint` 为唯一上游事实入口，持续建设 `terria_v1_relation`，使其成为“规范化事实库 + 可审计关系库 + local-compatible projection 来源库”，最终替代 `terria_v1_local` 作为稳定数据来源。

这次替代不是机械复制 `local`，而是满足两条硬约束：

- 比 `local` 更全面
- 比 `local` 更真实，且所有正式结果都必须可回溯

---

## Approved Decisions

本设计基于用户 2026-04-25 的统一拍板：

- `relation` 的替代目标是：先成为事实库，再投影生成新的业务层
- `relation` 内允许同时存在：
  - 规范化事实层
  - local-compatible projection 层
- 后续允许在 `relation` 内新增 projection tables / views
- 优先级固定为：真实性与溯源优先，字段对齐和业务兼容其次
- `items / npcs / projectiles / buffs` 都要有完整实体基表
- `buff` 域必须补足为完整实体域
- `biomes / bosses / armor_sets` 也纳入 relation 的实体层规划
- 中文、描述、tooltip、价格、稀有度、分类、slug 都纳入目标范围
- 中文与业务字段只接受可证实来源，不回退到 `local` 当事实源
- 图片同时保留：
  - 独立图片表
  - 实体层主图字段
- 配方组采用“双表示”：
  - 保留组语义
  - 同时允许后续展开
- NPC 商店、NPC 掉落都要从 candidate 升级为正式规范关系
- NPC 条件以文本为主，逐步结构化
- 掉落环境条件尽量结构化拆分
- boss / npc 系列与相关物品关系纳入任务范围
- 迁移策略固定为：
  - 先构建 projection
  - 再切换业务查询
- 无法证实的关系和字段：
  - 不进入正式结果
  - 只进入 issue/report
- 执行时不再反复询问用户
  - 所有问题统一记入 issue log md

---

## Current State

### Verified Relation Strengths

- `relation` 已有独立 recipe 规范层
- `relation` 已有 item->npc 商店/掉落候选层
- `relation` 已有 item->buff / item->biome 关系层
- `relation` 已有 item / npc / projectile / buff 独立图片镜像层
- 主要关系结果都带 trace 与 audit 字段

### Verified Relation Gaps

- 缺 `relation_buffs` 实体基表
- 缺 business projection 层
- 缺中文覆盖
- 缺 `slug / category_id / rarity_id / buy / sell / description / tooltip` 等业务字段
- 缺 boss / biome / armor set 的 relation 实体域
- NPC 商店/掉落仍是 candidate 命名与承载方式
- 复杂关系仍偏文本，不足以直接替代现有业务查询

---

## Replacement Architecture

整体采用三层结构。

### Layer 1: Maint Fact Snapshot

职责：

- 承接原始爬取、标准化、页面解析和结构抽取结果
- 提供唯一事实入口
- 不承接最终业务查询职责

来源库：

- `terria_v1_maint`

要求：

- 所有 relation 结果必须能回溯到 maint
- 所有新的正式 relation 域，如果 maint 缺少必要事实承载，也要先补 maint 层镜像表或结构化表

### Layer 2: Relation Normalized Facts

职责：

- 承载完整实体快照
- 承载规范化关系
- 承载候选、冲突、审计与覆盖率

目标库：

- `terria_v1_relation`

该层是未来唯一的“可信中台事实层”。

### Layer 3: Relation Projection

职责：

- 向业务侧提供 local-compatible 口径
- 输出能替代 `local` 的投影表或视图
- 把复杂的 relation 结构压平成前台/API容易使用的模型

该层仍然落在 `terria_v1_relation` 内，但语义上与规范化事实层区分。

---

## Data Modeling Strategy

### 1. Full Entity Bases

必须在 `relation` 内完整存在这些实体基表：

- `relation_items`
- `relation_npcs`
- `relation_projectiles`
- `relation_buffs`
- 后续扩展：
  - `relation_biomes`
  - `relation_bosses`
  - `relation_armor_sets`

这些表的目标不是简单复制 `local`，而是：

- 继承 maint 事实
- 显式补充业务字段
- 保留 trace、reason、confidence、review_status

### 2. Dual Modeling For Images

图片采用双轨：

- 独立图片表保存完整图片资产历史与主次图信息
- 实体层保存主图字段，供 projection 和业务查询直接使用

主图默认选择规则：

1. `cached_url`
2. `original_url`
3. `NULL`

### 3. Dual Modeling For Recipes

配方保留两种表达：

- 规范化 recipe head / ingredient / station
- 配方组展开层

例如：

- `Any Iron Bar`
- `Any Wood`

既保留原始组语义，也允许展开成枚举替代关系，以支持更细粒度的业务查询与校验。

### 4. Formal NPC Commerce And Loot Relations

现有：

- `item_npc_shop_candidates`
- `item_npc_loot_candidates`

目标：

- 升级成正式关系表
- 条件字段保留文本版
- 同步逐步沉淀结构化字段：
  - biome
  - difficulty
  - event
  - time
  - weather
  - special flags

### 5. Series / Grouped Domain Relations

纳入正式规划的复杂域：

- boss 召唤物
- boss 奖励层级
- npc 相关物品
- 系列物品
- 召唤、纪念品、圣物、宠物等奖励分层

此类关系不接受无证据推断。

---

## Source Rules

### Canonical Source Priority

事实优先级固定为：

1. `maint` 结构化事实与 `raw_json`
2. `landing_source_id / landing_source_key / landing_content_hash`
3. `maint` 派生镜像表
4. 标准化文件与生成中间件
5. 历史报告

`local` 不再作为事实优先级来源，只作为兼容目标和差异对照目标。

### Non-Negotiable Rules

- 不胡编
- 不用 `local` 覆盖 `maint`
- 不丢证据链
- 不把低置信推断直接写成正式事实
- 所有 unresolved 必须可报告

---

## Acceptance Strategy

采用字段级 + 域级双重验收。

### Phase Acceptance

先验收：

- 实体基表
- 中文与图片
- 业务关键字段

再验收：

- recipe
- NPC 商店/掉落
- buff / biome
- boss / npc 系列

最后验收：

- projection 层
- local-compatible 查询能力
- 差异分析与替代可行性

### Required Report Outputs

每个域都必须产出：

- 覆盖率统计
- 缺口明细
- 样例证据链
- unresolved / conflict 列表

---

## Execution Rule

本长任务的执行规则固定为：

- 不在过程中反复向用户提问
- 所有问题、缺口、阻塞、需要拍板的事项统一写入 issue log md
- 实施时严格按 milestone 顺序推进

---

## Milestone Order

固定顺序：

1. 实体层
2. 关系层
3. projection 层
4. 替换验证

这也是后续 implementation plan 的唯一主线。
