# NPC Public + Town Domain Inventory

日期：2026-04-18  
范围：Public NPC aggregate、Public NPC list/detail、Town NPC maintenance  
目的：冻结当前 NPC 消费面真实使用到的字段，作为 `M1` 域盘点基线。

---

## Shared Base Candidates

| Field | Current Location | Source | Consumer | Meaning | Layer |
|------|------------------|--------|----------|---------|-------|
| `id` | `NpcListItemDTO` / `front/src/types/index.ts` / `useTownNpcMaintenance.ts` rows | DB / API | public + admin | TerraPedia 内部 NPC 主键 | base |
| `gameId` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / API | public + admin | Terraria 原始 source id | base |
| `internalName` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / API | public + admin | 英文内部标识 | base |
| `name` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / API | public + admin | 英文显示名 | base |
| `nameZh` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / API | public + admin | 中文显示名 | base |
| `subName` | `NpcListItemDTO` / `front/src/types/index.ts` | DB / API | public | 英文副标题 | base |
| `subNameZh` | `NpcListItemDTO` / `front/src/types/index.ts` | DB / API | public | 中文副标题 | base |
| `categoryId` | `NpcListItemDTO` / `front/src/types/index.ts` | DB / API | public | NPC 分类 id | base |
| `categoryName` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / API | public + admin | NPC 分类名 | base |
| `isBoss` | `NpcListItemDTO` / `front/src/types/index.ts` | DB / API | public | Boss 标识与列表筛选 | base |
| `isFriendly` | `NpcListItemDTO` / `front/src/types/index.ts` | DB / API | public | Friendly 标识与 UI badge | base |
| `isTownNpc` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / API | public + admin | Town NPC 标识 | base |
| `imageUrl` | `NpcListItemDTO` / `front/src/types/index.ts` / town rows | DB / generated map / API | public + admin | 共享主图 / 头像 | base |
| `behaviorNotes` | `NpcDetailDTO` / `NpcDetailView.vue` / town rows | DB / API | public + admin | 长文本行为说明 | base |
| `status` | `NpcDetailDTO` / `front/src/types/index.ts` | DB / API | public | 发布状态或内部状态位 | base |

---

## Public Aggregate Fields

| Field | Current Location | Source | Consumer | Meaning | Layer |
|------|------------------|--------|----------|---------|-------|
| `npc` | `NpcAggregateDTO` / `NpcAggregateData` | service aggregate | public detail | 公共 NPC 基础主体 | public |
| `loot` | `NpcAggregateDTO` / `NpcAggregateData` / `NpcDetailView.vue` | service aggregate | public detail | 公共掉落列表 | public |
| `shopEntries` | `NpcAggregateDTO` / `NpcAggregateData` / `NpcDetailView.vue` | service aggregate | public detail | 公共售卖列表 | public |
| `buffRelations` | `NpcAggregateDTO` / `NpcAggregateData` / `NpcDetailView.vue` | service aggregate | public detail | Buff 关联列表 | public |
| `moduleStatus` | `NpcAggregateDTO` / `NpcAggregateData` / `NpcDetailView.vue` | service aggregate | public detail | 各聚合模块状态 | public |
| `aggregatedAt` | `NpcAggregateDTO` / `NpcAggregateData` / `NpcDetailView.vue` | service aggregate | public detail | 聚合结果生成时间 | public |
| `itemId` | `NpcLootEntryDTO` / `NpcLootEntry` / `NpcShopEntry` | DB / API | public detail | 关联物品 id | public |
| `itemName` | `NpcLootEntryDTO` / `NpcShopEntryDTO` / front types | DB / API | public detail | 关联物品英文名 | public |
| `itemNameZh` | `NpcLootEntryDTO` / `NpcShopEntryDTO` / front types | DB / API | public detail | 关联物品中文名 | public |
| `itemInternalName` | `NpcLootEntryDTO` / `NpcShopEntryDTO` / front types | DB / API | public detail | 关联物品内部名 | public |
| `itemImage` | `front/src/types/index.ts` only | normalized API payload | public detail | 物品图片兜底字段 | public |
| `quantityText` | `NpcLootEntryDTO` / `NpcLootEntry` | DB / API | public detail | 掉落数量文本 | public |
| `quantityMin` | `NpcLootEntryDTO` / `NpcLootEntry` | DB / API | public detail | 掉落最小数量 | public |
| `quantityMax` | `NpcLootEntryDTO` / `NpcLootEntry` | DB / API | public detail | 掉落最大数量 | public |
| `chanceText` | `NpcLootEntryDTO` / `NpcLootEntry` / `NpcBuffRelation` | DB / API | public detail | 概率文本 | public |
| `chanceValue` | `NpcLootEntryDTO` / `NpcBuffRelationDTO` / front types | DB / API | public detail | 概率数值 | public |
| `conditions` | `NpcLootEntryDTO` / `NpcShopEntryDTO` / `NpcBuffRelationDTO` / front types | DB / API | public detail | 条件文本或条件列表 | public |
| `notes` | loot/shop/buff DTOs / front types | DB / API | public detail | 备注说明 | public |
| `priceText` | `NpcShopEntryDTO` / `NpcShopEntry` | DB / API | public detail | 商店价格文本 | public |
| `buyPriceText` | `front/src/types/index.ts` only | normalized API payload | public detail | 前端预留的买价文本 | public |
| `currencyText` | `front/src/types/index.ts` only | normalized API payload | public detail | 前端预留的货币文案 | public |
| `conditions[].refType` | `front/src/types/index.ts` only | normalized API payload | public detail | 商店条件引用类型 | public |
| `conditions[].refId` | `front/src/types/index.ts` only | normalized API payload | public detail | 商店条件引用 id | public |
| `conditions[].conditionRole` | `front/src/types/index.ts` only | normalized API payload | public detail | 商店条件角色 | public |
| `conditions[].label` | `front/src/types/index.ts` only | normalized API payload | public detail | 商店条件展示名 | public |
| `buffId` | `NpcBuffRelationDTO` / `NpcBuffRelation` | DB / API | public detail | Buff id | public |
| `relationType` | `NpcBuffRelationDTO` / `NpcBuffRelation` | DB / API | public detail | Buff 关系类型 | public |
| `buffName` | `front/src/types/index.ts` only | normalized API payload | public detail | Buff 英文显示名 | public |
| `buffNameZh` | `NpcBuffRelationDTO` / `NpcBuffRelation` | DB / API | public detail | Buff 中文显示名 | public |
| `buffInternalName` | `NpcBuffRelationDTO` / `NpcBuffRelation` | DB / API | public detail | Buff 内部名 | public |
| `buffImage` | `front/src/types/index.ts` only | normalized API payload | public detail | Buff 图片兜底字段 | public |
| `sourceText` | `front/src/types/index.ts` only | normalized API payload | public detail | Buff 来源文案 | public |
| `durationText` | `front/src/types/index.ts` only | normalized API payload | public detail | Buff 时长文本 | public |
| `durationSeconds` | `front/src/types/index.ts` only | normalized API payload | public detail | Buff 时长秒数 | public |

---

## Town Maintenance Fields

| Field | Current Location | Source | Consumer | Meaning | Layer |
|------|------------------|--------|----------|---------|-------|
| `records` | `/admin/town-npcs/maintenance` payload / `TownNpcOverview` | controller aggregate payload | admin overview/detail/edit | Town NPC 维护记录列表 | maintenance |
| `reportFound` | admin payload | report artifact lookup | admin overview | 是否找到抓取报告 | maintenance |
| `reportFileName` | admin payload | report artifact lookup | admin overview | 当前报告文件名 | maintenance |
| `reportPath` | admin payload | report artifact lookup | admin overview | 报告相对路径 | maintenance |
| `reportUpdatedAt` | admin payload | report artifact lookup | admin overview | 报告更新时间 | maintenance |
| `reportSummary` | admin payload | report JSON | admin overview | 报告 summary 摘要 | maintenance |
| `reportGeneratedAt` | admin payload | report JSON | admin overview | 报告生成时间 | maintenance |
| `sourceMode` | admin payload | report JSON | admin overview | 报告来源模式 | maintenance |
| `importReportFound` | admin payload | import report lookup | admin overview | 是否找到导入报告 | maintenance |
| `importReportFileName` | admin payload | import report lookup | admin overview | 导入报告文件名 | maintenance |
| `importReportPath` | admin payload | import report lookup | admin overview | 导入报告路径 | maintenance |
| `importReportUpdatedAt` | admin payload | import report lookup | admin overview | 导入报告更新时间 | maintenance |
| `latestImportReport` | admin payload | import report JSON | admin overview | 最近导入摘要 | maintenance |
| `coinIcons` | admin payload | DB | admin overview/detail | 货币图标字典 | maintenance |
| `summary` | admin payload | derived | admin overview | 维护台汇总指标 | maintenance |
| `gamePeriodId` | town rows | DB | admin overview/detail/edit | 游戏阶段 id | maintenance |
| `gamePeriodLabel` | town rows | derived | admin overview/detail | 游戏阶段显示名 | maintenance |
| `shopEntryCount` | town rows | DB aggregate | admin overview | 当前售卖关系数量 | maintenance |
| `hasBehaviorNotes` | town rows | derived from DB | admin overview/detail | 是否已有说明文案 | maintenance |
| `behaviorNotesPreview` | town rows | derived from DB | admin overview | 行为说明摘要 | maintenance |
| `hasShopEntries` | town rows | derived from DB | admin overview | 是否已有售卖条目 | maintenance |
| `scrapeAvailable` | town rows | report | admin overview/detail | 是否存在抓取结果 | maintenance |
| `scrapedFunctionSummary` | town rows | report | admin overview/detail/edit | Wiki 功能摘要 | maintenance |
| `scrapedMoveInSummary` | town rows | report | admin detail/edit | Wiki 入住摘要 | maintenance |
| `scrapedMoveInConditions` | town rows | report | admin detail/edit | 结构化入住条件列表 | maintenance |
| `scrapedShopItems` | town rows | report | admin controller internal + edit | 抓取到的售卖物原始列表 | maintenance |
| `scrapedShopItemCount` | town rows | derived from report | admin overview | 抓取售卖物数 | maintenance |
| `suggestedGamePeriodId` | town rows | report-derived | admin edit | 建议游戏阶段 id | maintenance |
| `suggestedGamePeriodLabel` | town rows | report-derived | admin detail/edit | 建议游戏阶段显示名 | maintenance |
| `suggestedGamePeriodReason` | town rows | report-derived | admin detail/edit | 建议阶段原因 | maintenance |
| `suggestedBehaviorNotes` | town rows | report-derived | admin edit | 建议行为说明 | maintenance |
| `suggestedShopEntries` | town rows | report + item matching | admin edit | 建议售卖条目列表 | maintenance |
| `matchedSuggestedShopEntryCount` | town rows | derived | admin overview/detail | 已命中的建议售卖数 | maintenance |
| `unmatchedShopItems` | town rows | report + item matching | admin overview/detail/edit | 未匹配的抓取售卖物 | maintenance |
| `sourcePageTitle` | town rows | report | admin detail/edit | 来源页面标题 | maintenance |
| `sourcePageUrl` | town rows | report | admin detail/edit | 来源页面 URL | maintenance |
| `baseStats` | town rows | DB / derived | admin overview/detail | 基础数值块，目前用于 `lifeMax / damage / defense / knockBackResist` | maintenance |
| `wikiDetails` | town rows | report | admin overview/detail | Wiki 详情原始对象，当前被页面直接读取 | maintenance |
| `wikiDetails.aiType` | town detail page | report | admin detail | AI 类型标签 | maintenance |
| `wikiDetails.types` | `buildWikiTagLine` | report | admin detail | 类型标签数组 | maintenance |
| `wikiDetails.environments` | `buildWikiTagLine` | report | admin detail | 环境标签数组 | maintenance |
| `wikiDetails.spriteImage` | `wikiAssetCards` | report | admin detail | Wiki 立绘图 | maintenance |
| `wikiDetails.mapIconImage` | `wikiAssetCards` | report | admin detail | 地图图标 | maintenance |
| `wikiDetails.dialogPortraitImage` | `wikiAssetCards` | report | admin detail | 对话肖像 | maintenance |
| `currentShopItems` | town rows | DB | admin overview/detail/edit | 当前已入库售卖物 | maintenance |
| `updatedAt` | town rows | DB | admin overview/detail | 最近更新时间 | maintenance |

---

## Layer Decision

基于当前消费面，第一轮域层划分固定为：

- `base`
  - NPC 身份、分类、主图、基础说明
- `public`
  - 公共 NPC 聚合详情
  - 掉落、商店、Buff 关联和聚合状态
- `maintenance`
  - Town NPC 维护覆盖率、抓取对照、建议值、Wiki 资产、基础数值、当前售卖物

本轮明确不把以下内容放进公共域：

- `unmatchedShopItems`
- `matchedSuggestedShopEntryCount`
- `reportSummary`
- `latestImportReport`
- `scraped*` 系列字段
- `wikiDetails` 的维护诊断信息

这些字段都是维护语义，不是公共 NPC 详情语义。

---

## Immediate Naming Freeze

下一步 `M2` 统一域形状时，按以下命名冻结：

- 共享 NPC 主体：`NpcBaseDomain`
- 公共聚合：`NpcPublicAggregateDomain`
- 维护视图：`TownNpcOverview` / `TownNpcRow`
- 商店条件：`NpcShopConditionDomain`
- Town NPC 资产块：`wikiAssets`
- Town NPC 基础数值块：`baseStats`

其中：

- `wikiDetails` 暂时保留作为兼容兜底读取源
- 但新的显式维护域要引入 `wikiAssets`
- 页面逻辑不应继续把 `wikiDetails` 当作唯一结构化契约
