# TerraPedia M7 次级成熟域执行计划

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 本轮目标

在 `M6: Boss 聚合域闭环` 收口后，下一阶段正式进入：

`M7: 次级成熟域接入`

本轮包含 4 个域：

- `Shimmer`
- `Projectiles`
- `Biomes`
- `Armor Sets`

目标不是扩新功能，而是把这些已有基础、但尚未纳入统一验收体系的域，按同一标准收口：

- 抓取 / 生成入口明确
- 标准化产物明确
- DB / 管理端接入明确
- 至少一个消费面可验证
- 差异与设计接受项可解释

---

## 2. 当前基线

### 2.1 Shimmer

当前已确认：

- 抓取与转换：
  - `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
  - `scripts/data/transform/transform-wiki-shimmer-to-importable.mjs`
  - `scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs`
- 导库：
  - `scripts/data/import/import-wiki-shimmer-to-db.mjs`
- 管理端：
  - `data-query-app/pages/recipes/shimmer.vue`
- 后端：
  - `back/src/main/java/com/terraria/skills/controller/AdminShimmerController.java`

当前数据：

- item transforms: `279`
- decraft rules: `248`
- entity transforms: `121`
- npc transforms: `29`
- `unresolvedCount = 0`

DB 现状：

- `shimmer_item_transforms = 280`
- `shimmer_decraft_rules = 248`
- `shimmer_entity_transforms = 121`
- `shimmer_npc_transforms = 29`
- `world_contexts(code='SHIMMER') = 1`

结论：

- `Shimmer` 是 `M7` 中最成熟、最适合先收口的域

### 2.2 Projectiles

当前已确认：

- 标准化：
  - `data/standardized/projectiles.standardized.json`
- 抓取与补强：
  - `scripts/data/fetch/fetch-wiki-projectileinfo.mjs`
  - `scripts/data/backfill/backfill-projectile-zh-and-images.mjs`
  - `scripts/data/workflow/run-zh-enrich.mjs`
  - `scripts/data/workflow/run-image-sync.mjs`
- 导库：
  - `scripts/data/import/import-independent-entities-to-db.mjs`
- 后端：
  - `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`
- 管理端：
  - `data-query-app/pages/entities/[type].vue`

当前数据：

- standardized count: `1111`
- DB count: `1111`
- DB `name_zh` 覆盖：`1006`

结论：

- 主体链路稳定
- 但中文字段与图片仍需统一验收

### 2.3 Biomes

当前已确认：

- 标准化：
  - `data/standardized/biomes.standardized.json`
- 抓取与转换：
  - `scripts/data/fetch/fetch-wiki-biomes.mjs`
  - `scripts/data/transform/transform-wiki-biomes-to-import.mjs`
- 后端：
  - `admin/biomes`
- 管理端：
  - `data-query-app/pages/entities/[type].vue`

当前数据：

- standardized count: `7`
- DB count: `29`
- DB `icon_url` 覆盖：`0`

结论：

- 该域已经存在显著口径漂移
- 是 `M7` 中最需要“先解释差异再验收”的域

### 2.4 Armor Sets

当前已确认：

- 标准化：
  - `data/standardized/armor_sets.standardized.json`
- 生成：
  - `scripts/data/generate/generate-armor-set-definition-map.mjs`
- 审计：
  - `scripts/data/audit/validate-independent-entity-item-links.mjs`
- 后端：
  - `admin/armor-sets`
- 管理端：
  - `data-query-app/pages/entities/[type].vue`

当前数据：

- standardized count: `63`
- DB count: `88`
- `armor_set_items = 149`

结论：

- 该域也存在 standardized 与 DB 规模不一致的问题
- 但优先级低于 `Shimmer / Projectiles / Biomes`

---

## 3. 当前是否跑偏

截至 `2026-04-22`，当前执行没有跑偏。

理由：

1. `M5` 已正式验收收口
2. `M6` 已按“Boss 聚合域”而非“Boss 公开前台”完成收口
3. 最近提交仍围绕：
   - Boss import
   - Boss loot
   - Boss acceptance
4. 当前没有回头扩 `Town NPC`
5. 当前也没有提前去做 `M7` 之外的公开前台扩域

因此，当前最合理的动作就是：

> 直接从 `M6` 切到 `M7`，按成熟度和差异风险分批收口四个次级域

---

## 4. 执行顺序

### M7-R1：Shimmer 收口

目标：

- 把 `Shimmer` 纳入统一验收体系

完成标准：

- 抓取 / transform / import 入口可跑
- manifest / DB / admin overview 三者对齐
- 管理端样本可验收

### M7-R2：Projectiles 收口

目标：

- 确认 `Projectiles` 的标准化、中文补强、图片、管理端消费链是否一致

完成标准：

- standardized / DB / admin 对齐
- `name_zh` 缺口明确
- 图片验收口径明确

### M7-R3：Biomes 收口

目标：

- 解释 `7` 条 standardized 与 `29` 条 DB 的差异来源

完成标准：

- 差异被归因
- 关系 / 图标 / 管理端口径可解释

### M7-R4：Armor Sets 收口

目标：

- 解释 `63` 条 standardized 与 `88` 条 DB 的差异来源

完成标准：

- 套装主表与 `armor_set_items` 关系稳定
- 管理端样本可验收

### M7-R5：总体验收

目标：

- 输出 `M7` 正式验收结论

必须输出：

- 各域最终统计
- 各域设计接受项
- 各域剩余延期项
- API / 管理端样本验收结果

---

## 5. 默认验证矩阵

### 通用验证

- `scripts/data/audit/audit-entity-data-completeness.mjs`
- `scripts/dev/verify/verify-module-api-smoke.mjs`
- 管理端页面 smoke

### Shimmer

- `node scripts/data/import/import-wiki-shimmer-to-db.mjs --apply=false`
- `GET /api/admin/shimmer/overview`
- `http://localhost:3001/recipes/shimmer`

### Projectiles

- `GET /api/admin/projectiles`
- `GET /api/admin/projectiles/:id`
- `http://localhost:3001/entities/projectiles`

### Biomes

- `GET /api/admin/biomes`
- `GET /api/admin/biomes/:id`
- `http://localhost:3001/entities/biomes`

### Armor Sets

- `GET /api/admin/armor-sets`
- `GET /api/admin/armor-sets/:id`
- `http://localhost:3001/entities/armor-sets`

---

## 6. 当前立即执行入口

当前默认从 `M7-R1: Shimmer` 开始。

原因：

- 数据、脚本、后端、管理端四条链都已存在
- `unresolvedCount = 0`
- 该域最容易先产出一份标准样板验收

收完 `Shimmer` 后，再进入：

1. `Projectiles`
2. `Biomes`
3. `Armor Sets`

---

## 7. 当前结论

本轮没有跑偏。

后续不再回到 `M5/M6` 追加尾项，而是按 `M7-R1 -> R5` 连续执行。
