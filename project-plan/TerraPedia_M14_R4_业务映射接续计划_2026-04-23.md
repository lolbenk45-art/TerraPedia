# TerraPedia M14-R4 业务映射接续计划
日期：2026-04-23  
对应里程碑：`M14-R4`

---

## 1. 目标

在 `source_dataset_landings` 已稳定落地并完成 `M14-R3` 审计后，明确每种 `dataset_type` 的后续去向：

- 哪些直接接续到业务表
- 哪些先经规则层或二次标准化
- 哪些暂时只保留在 landing 层

---

## 2. 当前前提

已确认事实：

1. `source_dataset_landings` current 行数为 `6514`
2. `terria_v1_local` 仍是当前开发主库
3. `r2` 不应直接覆盖 `local`
4. `local` 在 `armor_sets / biomes / category / recipes` 上明显强于 `r2`
5. `item_relations_bundle_raw` 已采用 chunk 落地，不适合直接原样并入业务表

---

## 3. 数据集去向判定

### 3.1 第一优先级：直接进入业务表的候选

这些数据结构较稳定，且已有业务表承接对象明确：

- `items_raw`
- `npcs_raw`
- `projectiles_raw`
- `buffs_raw`
- `bosses_raw`
- `biomes_raw`

建议策略：

- 以 landing 为上游输入
- 新增或改造 landing-to-domain adapter
- 对业务表执行幂等 upsert
- 不直接覆盖已有人工维护字段

### 3.2 第二优先级：经轻规则层后进入业务表

这些数据已有业务表，但仍需要轻量映射或规则清洗：

- `armor_sets_raw`
- `shimmer_raw`

建议策略：

- 先从 landing 读取 current 数据
- 输出 importable 中间结构
- 再复用现有 `import-wiki-shimmer-to-db.mjs`、armor 相关生成/导入链

### 3.3 第三优先级：先留在 landing 层，暂不直接并入业务表

这些数据当前更适合作为规则层输入、参考层或审计层，不宜直接落业务表：

- `categories_raw`
- `item_pages_raw`
- `recipes_raw`
- `item_relations_bundle_raw`

原因：

- `categories_raw` 当前与 `local.category` 并非一一对应，`local` 已扩展到 `137`
- `item_pages_raw` 是大页级原文/HTML/wikitext，适合解析和补数，不适合直接入业务主表
- `recipes_raw` 当前是页面级中文配方抓取结果，应继续通过规则层输出标准 recipe rows
- `item_relations_bundle_raw` 目前是大 bundle + chunk current，不应直接映射到业务关系表

---

## 4. 正式接续顺序

建议按下面顺序继续：

1. `items_raw`
2. `npcs_raw`
3. `projectiles_raw`
4. `buffs_raw`
5. `bosses_raw`
6. `biomes_raw`
7. `armor_sets_raw`
8. `shimmer_raw`
9. `categories_raw`
10. `recipes_raw`
11. `item_pages_raw`
12. `item_relations_bundle_raw`

---

## 5. 接续约束

后续进入业务表时，统一遵守：

1. 业务表仍以 `terria_v1_local` 为准，不做 `r2` 覆盖式迁移
2. landing 只作为事实输入层，不直接替代业务表
3. adapter 必须支持幂等执行
4. 业务表写入必须保留人工维护结果的保护边界
5. landing 层需保留 current 数据，便于回放和审计

---

## 6. M15 建议

建议下一主线进入 `M15`：

- `M15-R1`：`items / npcs / projectiles / buffs` landing-to-domain adapter
- `M15-R2`：`bosses / biomes / armor_sets / shimmer` 接续
- `M15-R3`：`categories / recipes / item_pages / item_relations` 规则层重构

---

## 7. 结论

`M14` 到此完成了：

- `R1` 统一落地表建模
- `R2` 当前抓取结果真实入库
- `R3` landing / local / r2 审计
- `R4` 正式业务映射接续方案

下一步不再是“有没有数据”，而是“按优先级把 landing 层稳定接入业务表”。 
