# Maint Category Rule Layer Design

日期：2026-04-23

## Goal

在 `maint` 维护库内，以 `maint_categories + maint_item_categories` 为来源快照基准，新增一层 current-only 分类规则结果：

- `maint_category_nodes`
- `maint_item_category_assignments`

这层结果只服务 `maint` 内规则化、审计和后续下游导入准备，不直接写 `local`。

## Scope

### In Scope

- 扩展 `maint` schema，新增两张分类规则结果表
- 在 `scripts/data/maint/sync-landing-to-maint.mjs` 中，当 `categories_raw` 被处理时，同时产出规则层结果
- 保留来源快照与规则结果之间的显式回溯关系
- 只保留 current 结果，按 scope 执行“旧 current 失效，新 current 激活”
- 在 report summary 中补充分类规则层的最小诊断信息

### Out Of Scope

- 不改 `terria_v1_local`
- 不改前后端 API / 页面
- 不把这层结果直接导入 `category / item_category`
- 不新建 `maint_*_issues` 持久表

## Source Of Truth

### Snapshot Layer

- `maint_categories`
  代表单个 wiki category template 的模板级快照
- `maint_item_categories`
  代表从该 template 中展开出的明细节点

### Rule Layer

- `maint_category_nodes`
  代表 canonical category 节点
- `maint_item_category_assignments`
  代表 item 到 canonical category 的 current 映射

## Data Model

### `maint_category_nodes`

表达一个可复用的 canonical category node，关键特征：

- 使用 `top_level + section + group + path` 形成稳定 canonical key
- 保留 `node_name`、`path_text`、`parent_node_key`
- group node 保留，但通过 `is_group_node` 显式标记
- 使用 `source_maint_category_record_key`、`source_maint_item_category_record_key`、`landing_source_id` 回溯来源
- current-only：旧结果会先失效，再被本轮同 key 记录重新激活

### `maint_item_category_assignments`

表达 item 到 canonical category 的映射，关键特征：

- 一个 item 允许多个分类命中
- 必须有 `is_primary`
- 主次排序策略：
  - 优先非 group node
  - 再优先更深层路径
  - 再按 `path_text` 稳定排序
- 未匹配出 `itemInternalName` 的来源行不进入主结果表，只进入 report 统计

## Canonical Key Strategy

### Node Key

节点 canonical key 由以下维度稳定生成：

- `topLevel`
- `sectionTitle`
- `groupName`
- 从根到当前节点的路径片段

实现上保留：

- `node_key`
- `path_text`

其中：

- `node_key` 用于唯一标识和父子关联
- `path_text` 用于可读展示和后续导出

### Assignment Key

assignment 以 `item_internal_name + category_node_key` 为 canonical pair。  
当同一个 item-category pair 被多个来源重复命中时，只保留一个 current assignment，并记录优选来源。

## Processing Rules

### Rule Extraction

从 `categories_raw` 解析出来源快照后，继续对展开记录执行二次规则化：

1. 基于每条 `maint_item_categories` 候选记录构造 canonical path
2. 生成对应的 `maint_category_nodes`
3. 对具备 `itemInternalName` 的记录生成 `maint_item_category_assignments`
4. 对同 item 的多个 assignments 进行主次排序并标记 `is_primary`
5. 对未匹配内部名的记录只进入 report，不落主结果表

### Current Refresh

当 `categories` scope 执行 apply 时：

1. 先把 `maint_category_nodes`
2. 和 `maint_item_category_assignments`

现有 current 行统一标记为失效：

- `status = 0`
- `deleted = 1`

然后本轮提取出的结果再通过 upsert 重新激活：

- `status = 1`
- `deleted = 0`

这样旧 key 可以保留审计痕迹，本轮不存在的 key 会继续保持失效状态。

## Diagnostics And Reporting

不增加持久 issues 表，只在本次 sync summary 中补充最小诊断：

- 规则节点行数
- assignment 行数
- unmatched item count
- primary assignment count
- secondary assignment count

## Validation

最小验证顺序：

1. `node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs`
2. `node --check scripts/data/maint/maint-schema.mjs`
3. `node --check scripts/data/maint/sync-landing-to-maint.mjs`

## Risks

1. wiki 的 section/group 未必完全等价于最终业务分类，需要后续人工校正策略。
2. `standardized/items.standardized.json` 的命中率决定 assignment 覆盖率。
3. 同 item 的多模板命中可能导致主分类排序争议，本轮只给出稳定规则，不做人工覆盖层。

