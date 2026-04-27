# Armor Set Three-Layer Design

日期：2026-04-27

## 目标

把套装数据从旧 `local.armor_sets` / `local.armor_set_items` 的事实来源中剥离出来，改为由稳定三层链路维护：

```text
wiki/source
  -> maint
  -> relation
  -> projection
  -> backend/admin/page
```

本轮目标不是补手工套装数据，而是让套装 ID、套装部件、穿戴槽位、穿戴展示图都来自可重复抓取和可审计的数据源。

## 成功标准

- 上游监控可以用 `--modules=armor_sets` 检查 `Module:ArmorSetBonuses`。
- item 规范化数据保留装备槽位事实：`headSlot`、`bodySlot`、`legSlot` 等，而不是在后续层临时解析 raw JSON。
- relation 层建立套装专用表：
  - `relation_armor_sets`
  - `relation_armor_set_items`
  - `relation_armor_set_images`
- projection 层建立 `projection_armor_sets`，提供后台可消费的套装运行时模型。
- `sync-maint-to-relation` dry-run 可以从 `maint_armor_sets`、`maint_items` 和可选图片事实生成套装 relation/projection payload。
- 后台 armor set 查询优先读取 relation/projection 表；旧 local 表只作为 projection 不存在时的兼容回退，不再作为首选事实源。
- 本轮不执行会写入数据库的 apply/backfill，验证以单元测试、语法检查和 dry-run 为主。

## 当前事实

- `Module:ArmorSetBonuses` 已在上游监控源列表中，当前只接受 `armorsetbonuses` / `armorsets` 等别名，缺少 `armor_sets`。
- 本地探针已确认 `--modules=armorsetbonuses --check-official=false --write-state=false` 可运行并返回 `no_action`。
- 当前数据库状态：
  - `terria_v1_local.armor_sets = 88`
  - `terria_v1_local.armor_set_items = 149`
  - `terria_v1_local.maint_armor_sets = 0`
  - `terria_v1_maint.maint_armor_sets = 63`
  - `terria_v1_relation` 还没有 armor set 表。
- 旧 `local.armor_sets` 有 `male_images` / `female_images` / `special_images` 字段，但当前为空；不能把它当新事实源。
- `scripts/data/generate/generate-armor-set-definition-map.mjs` 依赖当前 DB 的 `armor_sets`，属于 legacy/local 依赖，后续只可作为迁移对照，不再参与新链路事实生成。
- `Module:Iteminfo/data` 有套装部件的穿戴槽位字段，例如：
  - Wood Helmet: `headSlot=52`
  - Wood Breastplate: `bodySlot=32`
  - Wood Greaves: `legSlot=31`
  - Mining Helmet: `headSlot=11`
  - Mining Shirt: `bodySlot=20`
  - Mining Pants: `legSlot=19`
- 当前 `normalized/items.wiki.json` 和 `standardized/items.standardized.json` 没保留这些槽位，需要补到稳定层。
- wiki 页面图片可通过 page parse/imageinfo 获取，例如 `Wood armor` 有 `Wood_armor.png`、`Wood_armor_female.png`，`Cactus armor` 有 `_female` 和 demo gif。

## 不在本轮范围

- 不把旧 `local.armor_sets` / `local.armor_set_items` 写回新链路。
- 不把旧 local 图片列当事实源。
- 不执行生产或本地 DB 写入 apply。
- 不做复杂人工 override UI。
- 不保证一次覆盖所有 wiki armor 页面图片抓取任务；本轮先打通 schema、处理器、projection 和后台读取优先级。

## 数据源优先级

1. `Module:ArmorSetBonuses`：套装定义、text key、benefit expression、部件 source item id。
2. `Module:Iteminfo/data`：item source id、internal name、display name、装备槽位、基础物品属性。
3. wiki armor page / file imageinfo：男女穿戴图、特殊 demo 图、图片 URL 和尺寸。
4. maint 人工 override：只作为可审计补丁。
5. legacy local：只用于迁移比对和 projection 缺失时的兼容回退。

## 三层职责

### Maint

`maint_armor_sets` 继续保存来自 `Module:ArmorSetBonuses` 的标准套装定义。item 装备槽位从 item stable layer 进入后续处理，不从 local 表读取。

后续可新增 `maint_armor_set_images`，保存 wiki 页面图片事实。字段至少包括：

- `text_key`
- `page_title`
- `image_role`: `male` / `female` / `demo` / `part` / `other`
- `source_file_title`
- `original_url`
- `width`
- `height`
- trace/audit 字段

### Relation

relation 层把套装定义展开成规范关系：

- `relation_armor_sets`
  - 一条记录代表一个上游套装 text key。
  - 稳定身份是 `record_key`，由 source + `text_key` 生成，不使用 local auto-increment id。
- `relation_armor_set_items`
  - 一条记录代表一个套装 variant 中的一个部件。
  - 保存 `source_item_id`、item internal/name、part role、slot type、slot id、variant index、part index。
- `relation_armor_set_images`
  - 一条记录代表一个套装展示图。
  - 图片事实来自 wiki file/imageinfo 或 maint image fact，不来自 local。

### Projection

`projection_armor_sets` 是后台和页面的消费模型。它聚合：

- 套装名称/描述字段。
- 当前套装部件 ID 和部件列表 JSON。
- 男女展示图和特殊展示图。
- `related_items_json`，用于后台不再临时查询 legacy mapping 文件。
- `mapping_status`，区分 `mapped`、`partial`、`missing_item`。

## 后台读取策略

`AdminArmorSetController` 查询顺序：

1. 如果当前连接数据库中存在 `projection_armor_sets`，优先读取它。
2. 若 projection 表不存在，回退到当前旧 `armor_sets` / `armor_set_items` 逻辑。
3. create/update/delete 暂时保留旧逻辑，避免扩大写路径；后台只读列表和详情先完成事实源切换。

## 验证计划

- Node tests:
  - upstream monitor alias 支持 `armor_sets`。
  - item normalize/standardize 保留装备槽位。
  - armor set processor 能生成 relation sets/items/images/projection 输入。
  - relation/projection schema 包含 armor set 表。
  - projection payload 能输出 `projectionArmorSets`。
  - sync dry-run 聚合 summary 包含 armor set count。
- Java tests:
  - controller 在 projection 表存在时读 projection。
  - projection 不存在时仍能回退旧 local 表查询。
- 语法检查：
  - `node --check` 覆盖修改过的 `.mjs` 文件。
- 不执行 DB apply；若后续需要 apply，必须先单独做 dry-run 报告和表计数确认。

## 风险

- 套装 page title 不能总是从 `textKey` 直接可靠反推，图片抓取需要保留 page title/source evidence。
- 上游套装定义有 variant，一个 text key 可能对应多个部件组合，relation item 必须保留 `set_variant_index`。
- item 的 source id 和 DB runtime id 不是一回事，projection 必须明确使用 source id，并通过 projection_items 做消费层关联。
- 旧 local 有 88 条，maint 标准源有 63 条；本轮以 63 条为标准，不追求复刻旧 local 数量。
