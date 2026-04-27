# Buff Three-Layer Maintenance Design

日期：2026-04-27

## 目标

建立 Buff / Debuff 关系的三层数据维护链路，使物品关联 Buff、NPC 攻击附带 Buff、Boss 减益不依赖人工逐条录入，而是由上游数据、关系处理和运行时投影自动维护。

本 spec 只定义设计，不进入实施。

## 成功标准

- `maint` 层能够保存 Buff 相关上游事实、人工覆盖和同步来源。
- `relation` 层能够自动生成规范化关系：
  - 物品 -> Buff
  - NPC -> Buff / Debuff
  - Boss -> Buff / Debuff
- `projection/local` 层能够把关系物化为后台和前台接口可直接消费的数据。
- 后台人工维护只作为 override / patch，不作为主数据来源。
- 全量同步和局部重算都可审计、可重复执行、可回滚定位。
- 下一次上游同步不会静默覆盖人工确认过的少数补丁。

## 当前事实

当前数据库和代码已经具备一部分基础能力：

- `terria_v1_local.buffs` 有 388 条未删除 Buff 记录。
- `terria_v1_local.buff_source_items` 有 245 条物品来源关系。
- `terria_v1_relation.relation_buffs` 有 388 条 Buff 实体投影。
- `terria_v1_relation.item_buff_relations` 有 245 条物品-Buff 关系。
- `terria_v1_local.npc_buff_relations` 当前为 0，NPC 攻击附带 Buff 尚未形成有效数据链。
- `terria_v1_relation.boss_effect_relations` 有 11 条 Boss 进度解锁类 effect，但不是 Boss 攻击减益。
- `data/standardized/npcs.standardized.json` 当前只稳定包含 `buffImmune`，不包含 NPC 攻击造成的 Buff。

相关入口：

- Buff 抓取：`scripts/data/fetch/fetch-wiki-buffs.mjs`
- Maint 入库：`scripts/data/maint/sync-landing-to-maint.mjs`
- Relation 处理：`scripts/data/relation/sync-maint-to-relation.mjs`
- Buff relation 处理：`scripts/data/relation/secondary-relation-processor.mjs`
- Boss relation 处理：`scripts/data/relation/boss-series-processor.mjs`
- 后台 Buff API：`back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- 后台 NPC 关系 API：`back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- 公共 NPC 聚合：`back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- 公共物品聚合：`back/src/main/java/com/terraria/skills/service/impl/PublicItemAggregateService.java`
- 后台 Boss API：`back/src/main/java/com/terraria/skills/controller/AdminBossController.java`

## 不在本轮范围

- 不直接实施代码。
- 不把人工维护设计成主流程。
- 不把页面展示作为第一优先级。
- 不在缺少来源证据时硬编码 NPC 或 Boss 的减益关系。
- 不让查询接口每次实时解析原始 JSON。

## 总体方案

采用“全量/定时同步 + 局部重算”的三层链路：

```text
source / wiki / generated data
  -> landing / maint
  -> relation
  -> projection / local
  -> API / pages
```

主链路通过定时任务或手动按钮触发。后台编辑少量补丁时，只重算受影响对象，不全量重跑。

推荐优先级：

1. 上游结构化事实
2. 上游页面抽取证据
3. `maint` 人工 override
4. `relation` 低置信候选
5. 历史 local 数据只做迁移和对照，不作为新事实来源

## 三层职责

### Layer 1: Maint

`maint` 层保存原始事实和人工覆盖，不直接作为页面消费模型。

需要支持的事实类型：

- Buff 基础字段：名称、类型、描述、图标、来源页面。
- Item Buff 来源：物品使用或装备后给予的 Buff。
- NPC Buff 输出：NPC 攻击、接触、弹幕、特殊技能造成的 Buff / Debuff。
- Boss Buff 输出：Boss 或 Boss 成员造成的 Buff / Debuff。
- NPC Buff 免疫：当前已有 `buff_immune`，继续保留为独立语义，不混入“攻击附带”。

人工维护必须存为 override，而不是直接覆盖自动事实。override 至少包含：

- `target_type`: `item` / `npc` / `boss` / `buff`
- `target_key`
- `relation_type`
- `field_name`
- `override_value`
- `reason`
- `source_url` 或证据文本
- `confidence`
- `review_status`
- `updated_by`
- `updated_at`

### Layer 2: Relation

`relation` 层把 maint 事实转换成规范化关系。

已有可复用：

- `relation_buffs`
- `item_buff_relations`
- `boss_effect_relations`

需要补齐或扩展：

- `npc_buff_relations` 的 relation 侧来源表，表达 NPC 造成 Buff。
- Boss 减益关系，推荐作为独立关系，而不是混入当前“进度解锁 effect”：
  - 可选表名：`boss_buff_relations`
  - 或扩展 `boss_effect_relations`，但必须新增 `effect_family='combat_buff'`

推荐新关系字段：

- `record_key`
- `source_actor_type`: `item` / `npc` / `boss`
- `source_actor_id`
- `source_actor_internal_name`
- `buff_source_id`
- `buff_internal_name`
- `buff_type`: `buff` / `debuff`
- `relation_type`: `grants` / `inflicts` / `summons_with` / `immune_to`
- `duration_ticks`
- `chance_value`
- `chance_text`
- `conditions`
- `evidence_text`
- `source_page`
- `source_revision_timestamp`
- `confidence`
- `review_status`
- trace columns

关系生成规则：

- 物品 -> Buff：优先使用 `maint_buffs.raw_json.sourceItems` 和现有 `item_buff_relations`。
- NPC -> Buff：不能从 `buffImmune` 推断，需要新增 NPC 页面/模板抽取来源。
- Boss -> Buff：优先继承 Boss 成员 NPC 的 Buff 输出；Boss 页面若有独立战斗效果说明，再作为 Boss 级补充关系。
- 免疫关系单独建模，不能当作“攻击附带”。
- 低置信文本抽取只能进入候选状态，不能直接投影为正式运行时事实。

### Layer 3: Projection / Local

`projection/local` 层只保存运行时消费模型。

需要支持：

- 物品详情能拿到该物品给予的 Buff。
- NPC 详情能拿到该 NPC 会造成的 Buff / Debuff。
- Boss 详情能拿到 Boss 及成员会造成的 Buff / Debuff。
- 后台详情能看到自动来源、人工 override、冲突和置信度。

投影规则：

- `resolved` 和人工确认的 override 可以进入正式 API。
- `candidate_low_confidence` 只在后台审核区显示，不进入前台默认展示。
- 人工 override 的优先级高于自动抽取，但必须保留原自动事实用于对照。

## 同步模式

### 全量 / 定时同步

用于主数据更新，推荐由脚本或后台按钮触发：

```text
fetch wiki/source
  -> sync landing to maint
  -> build relation rows
  -> materialize projection/local
  -> write audit reports
```

全量同步必须输出：

- 输入计数
- 自动生成关系计数
- 人工 override 应用计数
- 冲突计数
- 低置信候选计数
- 投影写入计数
- 失败样本

### 局部重算

后台保存以下对象后触发局部重算：

- Buff override
- Item Buff override
- NPC Buff override
- Boss Buff override
- 上游单页重新抓取结果

局部重算边界：

- 改 Buff：重算该 Buff 关联的 item / npc / boss 投影。
- 改 Item：重算该 Item 的 Buff 投影。
- 改 NPC：重算该 NPC 和包含该 NPC 的 Boss 投影。
- 改 Boss：重算该 Boss 的成员聚合和 Boss 级 Buff 投影。

局部重算必须记录一条 run：

- run type: `partial`
- trigger type: `admin_override` / `source_refresh`
- affected keys
- relation rows changed
- projection rows changed
- conflict samples

## 数据来源策略

### 已有稳定来源

- `Template:GetBuffInfo`：Buff 基础字段、类型、部分来源物品。
- `Module:Iteminfo/data`：物品 buffType / buffTime。
- `Module:Npcinfo/data`：NPC 免疫 Buff，目前主要是 `buffImmune`。
- `maint_buffs`：Buff 实体及来源物品 JSON。
- `relation.item_buff_relations`：已存在的物品-Buff 规范关系。

### 需要新增来源

NPC 攻击附带 Buff 和 Boss 减益不能从当前稳定字段完整得到，需要新增抽取链路：

- NPC 页面 infobox / stats 表中的 debuff 字段。
- NPC 攻击说明段落中的 “inflicts X” 证据。
- Boss 页面中的攻击/阶段说明。
- Boss 成员 NPC 与 `boss_group` 的继承关系。

新增抽取结果先进入 maint 或 landing，不直接写 local。

## 人工维护模型

人工维护只处理三类情况：

- 上游缺字段，但证据明确。
- 自动抽取错误，需要屏蔽或修正。
- 低置信候选经人工确认。

人工操作类型：

- `confirm`: 确认候选关系。
- `override`: 覆盖自动字段。
- `suppress`: 屏蔽错误自动关系。
- `add`: 添加上游缺失但有证据的关系。

人工记录必须可撤销。撤销后重新回到自动同步结果。

## API 消费设计

建议新增或扩展聚合模块：

- `GET /api/items/{id}/aggregate?include=buffs`
- `GET /api/npcs/{id}/aggregate?include=buffs`
- `GET /admin/bosses/{id}` 返回 `buffRelations`
- `GET /admin/buffs/{id}` 保留来源物品、免疫样例，并扩展“造成者/关联者”反查

DTO 推荐拆分：

- `BuffRelationDTO`
- `ItemBuffRelationDTO`
- `NpcBuffRelationDTO`
- `BossBuffRelationDTO`

共同字段：

- buff id / source id / internal name
- display name
- image
- buff type
- relation type
- duration
- chance
- conditions
- evidence
- source mode: `auto` / `override` / `candidate`
- review status

## 后台交互边界

后台第一阶段只需要支持：

- 查看自动生成的关系。
- 查看候选和冲突。
- 添加/确认/屏蔽人工 override。
- 触发单对象局部重算。
- 查看最近一次 run 状态。

不要求第一阶段做复杂批量编辑器。

## 验证计划

最小验证：

- Node relation processor 单元测试。
- 后端聚合 DTO / Controller 测试。
- 同步脚本 dry-run 不写 local。
- apply 只写 relation/projection 允许范围。
- 数据计数核对：
  - Buff 总数
  - Item Buff 关系数
  - NPC Buff 关系数
  - Boss Buff 关系数
  - override 应用数
  - candidate 数
- 抽样核验至少覆盖：
  - 一个药水类 Buff
  - 一个武器/弹药造成的 Debuff
  - 一个普通 NPC 造成的 Debuff
  - 一个 Boss 成员继承 Debuff
  - 一个人工 override

## 风险

- NPC 攻击附带 Buff 的上游字段不如 Buff 来源物品稳定，必须先做候选和证据链。
- Boss 是组模型，Boss 级关系和成员 NPC 关系容易重复，需要用 `source_actor_type` 区分。
- `buffImmune` 容易被误用成“造成 Buff”，必须单独建模。
- 如果直接把候选关系投影到前台，会造成错误展示。
- 人工 override 如果直接写业务表，后续全量同步会不可控；必须保存在 override 层。

## 推荐实施顺序

1. 补三层数据模型和 override 设计。
2. 补 Item Buff relation 到 public item aggregate。
3. 新增 NPC Buff source 抽取和 relation 处理。
4. 新增 Boss Buff relation 聚合，继承成员 NPC 关系。
5. 建立局部重算入口。
6. 后台展示自动关系、候选、override 和 run 状态。
7. 前台消费稳定投影。

## 设计结论

本需求的核心不是“手工维护 Buff”，而是建立 Buff 关系事实的自动维护系统。

推荐以 `maint -> relation -> projection/local` 为唯一主链路，人工维护作为可审计 override。全量/定时同步负责主数据刷新，后台局部编辑只触发受影响对象重算。这样可以支撑物品 Buff、NPC 攻击附带 Buff、Boss 减益长期跟随数据源更新，而不会把维护压力转移到人工录入。
