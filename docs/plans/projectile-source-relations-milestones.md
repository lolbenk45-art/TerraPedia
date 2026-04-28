# Projectile Source Relations Milestone Plan

**目标：** 把 projectile 和会发射它的 item / npc 建立可追踪、可同步、可查询的正式关系。

**成功标准：**
- `item_projectile_relations` 从 `maint_items.raw_json.shoot` 生成 resolved 关系，保留 `item_projectile_audits` 作为审计层。
- `npc_projectile_relations` 只从明确 `projectileId` 证据生成，第一版不从 `aiStyle` 猜测。
- `projection_projectiles` 聚合 `source_items_json` 和 `source_npcs_json`，后端 `/admin/projectiles/{id}` 返回 `sourceItems/sourceNpcs`。
- dry-run、schema、processor、projection、后端 controller 测试覆盖核心路径。

## 里程碑 1：正式 relation 建模

**范围：** `scripts/data/relation/relation-schema.mjs`、`relation-schema.test.mjs`、`relation-table-catalog.mjs`。

- 新增 `item_projectile_relations` 和 `npc_projectile_relations`。
- 字段统一包含：source entity id/internal name、projectile source id/internal name、`relation_type`、`source_field`、`source_value`、trace/audit columns。
- `item_projectile_audits` 继续存在，但不作为正式游戏事实层。

## 里程碑 2：关系处理器

**范围：** `scripts/data/relation/secondary-relation-processor.mjs`、`secondary-relation-processor.test.mjs`。

- 从 `maint_items.raw_json.shoot/projectileId/projectile_id` 生成 item relation。
- 只在 projectile 匹配成功时写 resolved relation；匹配失败仍写 audit。
- 从 `maint_npcs.raw_json.wikiCrawler.combat.projectileId` 或 `raw_json.combat.projectileId` 生成 npc relation。
- 明确不使用 NPC `aiStyle` 推断。

## 里程碑 3：sync 编排与 projection 聚合

**范围：** `sync-maint-to-relation.mjs`、`sync-maint-to-relation.test.mjs`、`projection-schema.mjs`、`projection-schema.test.mjs`、`projection-sync.mjs`、`projection-sync.test.mjs`。

- dry-run summary 的 projectile 计数改为正式 relation + audit。
- apply 清表和 upsert 增加两张正式关系表。
- `projection_projectiles` 增加 `source_items_json`、`source_npcs_json`。
- `buildProjectionPayload()` 按 projectile internal name 聚合来源 item/npc。

## 里程碑 4：后端消费

**范围：** local/projectile Flyway、`Projectile.java`、`AdminProjectileController.java`、controller test、compat view/materialize columns。

- local `projectiles` 增加 `source_items_json`、`source_npcs_json`，用于 projection materialize 后直接读取。
- `Projectile` entity 增加字段。
- `/admin/projectiles/{id}` payload 返回 `sourceItemsJson/sourceNpcsJson/sourceItems/sourceNpcs`。
- 列表接口可返回 JSON 字符串，但详情必须解析数组，便于管理端展示。

## 里程碑 5：验证与样本

- 运行 node relation 单测：schema、secondary processor、projection、sync 编排、compat view。
- 运行后端 projectile controller 精确测试。
- 执行 relation dry-run，核对 item relation 数量、npc relation 数量、audit 数量。
- 样本核对：`WoodenBow -> WoodenArrowFriendly`，`IronShortsword -> IronShortswordStab`，NPC fixture 中 `idprojectile=24` 能映射到 projectile。

## 风险与边界

- Item `useAmmo` 展开会把武器可发射弹药 projectile 做成组合关系，第一版先写直接 `shoot`，不展开弹药组合，避免引入不完整事实。
- NPC 只有 infobox `projectileId` 是强证据；无该字段的 NPC 不生成关系。
- 不改前台公开页面；管理端详情可消费后端新增字段，若时间不足以后端 payload 为交付标准。
