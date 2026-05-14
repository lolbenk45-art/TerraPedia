# TerraPedia M7-R1 Shimmer 收口验收

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M7-R1: Shimmer` 已达到可收口状态。

当前结论：

- Shimmer 抓取 / transform / import 链路已有明确入口
- import dry-run 成功
- manifest / DB / admin overview 三者统计对齐
- 管理端页面可访问
- 当前 `unresolvedTitles = 0`

---

## 2. 数据链路

### 2.1 源与转换入口

- `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- `scripts/data/transform/transform-wiki-shimmer-to-importable.mjs`
- `scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs`

### 2.2 导库入口

- `scripts/data/import/import-wiki-shimmer-to-db.mjs`

### 2.3 后端与管理端入口

- `back/src/main/java/com/terraria/skills/controller/AdminShimmerController.java`
- `data-query-app/pages/recipes/shimmer.vue`

---

## 3. 最新 dry-run 统计

基于 `reports/wiki-shimmer-db-import-2026-04-22.json`：

- `database = terria_v1_local`
- `apply = false`
- `itemTransforms = 279`
- `decraftRules = 248`
- `entityTransforms = 121`
- `npcTransforms = 29`
- `unresolvedTitles = 0`

dry-run 前后 DB 统计一致：

- `shimmer_item_transforms = 279`
- `shimmer_decraft_rules = 248`
- `shimmer_entity_transforms = 121`
- `shimmer_npc_transforms = 29`

---

## 4. Admin Overview 验收

接口：

```powershell
GET /api/admin/shimmer/overview
```

结果：

- HTTP `200`
- `context.code = SHIMMER`
- `context.nameZh = 微光`
- `context.contextType = ENVIRONMENT`
- `manifest.unresolvedCount = 0`

dataset count：

- `item-transforms = 279`
- `decraft-rules = 248`
- `entity-transforms = 121`
- `npc-transforms = 29`

---

## 5. 页面 Smoke

页面：

```text
http://localhost:3001/recipes/shimmer
```

结果：

- HTTP `200`

---

## 6. 通用审计修复

执行 `M7` 通用审计时发现两个脚本层阻塞：

1. `audit-entity-data-completeness.mjs` 仍读取旧字段 `buffs.name / buffs.image_path`
2. Armor Set 审计硬编码 `/admin/armor-sets/2`

已修复为：

- Buff 审计使用当前字段：
  - `buffs.name_zh`
  - `buffs.image`
- Armor Set 审计动态读取首条有效 ID 后再取详情

新验证结果：

- `entity-audit-sql.test.mjs` 通过
- `entity-audit-api-path.test.mjs` 通过
- `audit-entity-data-completeness.mjs` 可完整生成报告
- `verify-module-api-smoke.mjs` 返回 `16/16 pass`

---

## 7. 设计接受项

当前 `Shimmer` 没有业务级 unresolved 项。

接受项：

- `SHIMMER` 作为 `world_contexts` 中的环境上下文，而不是独立公开实体页
- 当前消费面以管理端 `Shimmer Data` 工作区为主
- 不在 `M7-R1` 中新增前台公开页

---

## 8. 验证命令

已执行：

```powershell
node scripts/data/import/import-wiki-shimmer-to-db.mjs --apply=false --output=reports/wiki-shimmer-db-import-2026-04-22.json
```

结果：

- dry-run 成功
- `unresolvedTitles = 0`

已执行：

```powershell
node scripts/data/audit/audit-entity-data-completeness.mjs --apiBase=http://127.0.0.1:18088/api --output=reports/entity-data-completeness-2026-04-22.json
```

结果：

- 审计报告生成成功

已执行：

```powershell
node scripts/dev/verify/verify-module-api-smoke.mjs --apiBase=http://127.0.0.1:18088/api
```

结果：

- `16/16 pass`

已执行：

```powershell
node --test scripts/data/audit/entity-audit-api-path.test.mjs scripts/data/audit/entity-audit-sql.test.mjs
```

结果：

- `3/3 pass`

---

## 9. 当前结论

`M7-R1: Shimmer` 可以收口。

下一步进入：

`M7-R2: Projectiles 收口`

默认重点：

- `standardizedCount = 1111`
- `db total = 1111`
- `minio_image = 1110`
- `name_zh` 缺口需要独立统计并归因
