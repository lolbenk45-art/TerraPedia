# Canonical Migration Boundary

状态：A/B 档可信数据源与自动维护准入边界。

## 目标

本文件定义 TerraPedia 在 canonical 尚未完全迁入前，哪些数据可以进入自动维护链，哪些只能作为过渡或人工解释来源。

准入判断只看可审计事实，不看口头记忆：

1. 来源能否追溯到上游事实。
2. 是否有稳定中间层或报告承接。
3. 是否能 dry-run 或只读审计。
4. 是否有发布前 blocking/warning 判定。

## 分层

| 层级 | 名称 | 允许用途 | 必要证据 |
| --- | --- | --- | --- |
| A0 | canonical 可信输入 | 自动维护首选输入 | `data/canonical/` 中已审计、可复现、字段语义稳定 |
| A1 | landing 证据输入 | canonical 迁移前的可信过渡输入 | `source_dataset_landings` current 记录，带 provider/source/revision/hash/payload |
| A2 | relation/projection 发布态 | 后端和前台消费输入 | `relation_*` / `projection_*` 已解析，health 无 blocking |
| B1 | standardized/generated 过渡输入 | 自动维护前的受控输入 | 已登记消费者、迁移目标、审计命令 |
| B2 | manual/derived/legacy 补洞输入 | 局部 fallback 或人工解释 | 有 owner、source reason、不得单独支撑新公开功能 |
| X | blocked 输入 | 不得进入公开功能或自动 apply | blocked group、source 丢失、只有 managed URL、未登记 raw/generated 直读 |

## 当前 A 档范围

| 数据域 | 当前可用输入 | 自动维护状态 | 发布准入 |
| --- | --- | --- | --- |
| item 基础数据 | standardized item + local DB + relation projection | 可自动维护，但 canonical 迁移仍需推进 | 允许新增低风险 item 体验和审计功能 |
| item 图片 | `item_images.original_url` / `cached_url` + legacy `items.image` fallback | 可自动维护 | MinIO cache 优先，wiki fallback 可降级 |
| buff 基础数据 | standardized buff + local DB | 可自动维护 | 新增字段需管理端验收 |
| buff 图片 | `buffs.image_original_url` / `image_cached_url` / content type / last verified | 可自动维护，范围小于 item | 可作为第二条图片链路模板 |
| npc 基础数据 | wiki-crawler bridge + standardized npc + local DB | 可自动维护基础字段 | NPC 公开体验可继续，但关系 warning 需保留 |
| NPC/item source relation | maint -> relation -> projection -> local compat | 可自动维护 dry-run 和审计 | health 无 blocking 后允许消费 resolved/promoted 数据 |

## 当前 B 档范围

| 数据域 | 当前输入 | 风险 | 必须补的准入 |
| --- | --- | --- | --- |
| Any Item Group consumers | `data/generated/recipe-material-reference.json`、`recipe-group-overrides.json`、`item-group-overrides.json` | recipe/npc_shop/shimmer consumer 共用审计，存在 duplicate group keys、blocked group | source group audit 必须无 blocked；blocked 不按 consumer 类型降级 |
| npc 图片 | `npcs.image`、relation payload source、raw JSON fallback | 缺统一 cache 字段和 sync scope | 先只读审计，不扩同步 |
| projectile 图片 | `projectiles.image` | source/cache/fallback 未统一 | 管理端验收前不得公开扩张 |
| biome 图片 | `biomes.image` 或 icon resource | 当前 image readiness 不足 | 先补图片准入审计 |
| article 图片 | 上传或外链资源 | 发布流程未统一 source/cache/fallback | 发布预检确认 |
| armor set | generated armor definitions | 中文/英文/图片完整性不足 | 先 source coverage 审计，不进入自动公开链 |

## 禁止规则

- 禁止公开页面直接读取未登记的 `data/raw/`、`data/normalized/`、`data/generated/`。
- 禁止把 managed/cache URL 写回后覆盖 source/original URL。
- 禁止 blocked group 进入 recipe、shop、shimmer 或公开展示。
- Any Item Group audit 同时覆盖 recipe、npc_shop、shimmer consumer；blocked consumer reference 必须保持 X 档，不能因只属于 shimmer 而降级为 warning。
- 禁止 relation unresolved/ambiguous/polluted/rejected 数据绕过 warning policy 进入新公开功能。
- 禁止同一 DB 表、同一图片同步 scope、同一 crawler shard 被多个 agent 并行 apply。

## 过渡豁免登记

| 输入 | 当前消费者 | 迁移目标 | 验收命令 |
| --- | --- | --- | --- |
| `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` | NPC 基础数据、NPC-Buff 回填 | `source_dataset_landings` -> canonical npc | `node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc` |
| `data/generated/recipe-material-reference.json` | recipe material group | canonical recipe group | `node scripts/data/audit/audit-any-item-group-sources.mjs` |
| `data/generated/recipe-group-overrides.json` | recipe group 补洞 | canonical recipe group override | `node scripts/data/audit/audit-any-item-group-sources.mjs` |
| `data/generated/item-group-overrides.json` | npc_shop/shimmer group 解释 | canonical item group override | `node scripts/data/audit/audit-any-item-group-sources.mjs` |
| legacy `items.image` | item image fallback | `item_images.original_url` / `cached_url` | `cd back; mvn "-Dtest=WikiImageSyncServiceImplTest,ItemImageServiceImplTest,ItemMapperPreferredImageSqlTest" test` |

## Apply 前准入

任何自动维护 apply 前必须满足：

1. 有对应 dry-run 或只读审计报告。
2. `relation-health-report` 无 blocking。
3. 写入目标 DB、表、scope 已打印在命令或报告中。
4. 没有其他任务正在写同一目标。
5. 失败后有停止边界；不能在未知失败后扩大批次。

## 首条整链选择

优先打通 `NPC / Item source / shop / loot`：

```text
source landing / maint_item_sources
  -> item_source_facts
  -> item_npc_shop_relations / item_npc_loot_relations
  -> projection_items / projection_npcs
  -> local compat tables
  -> 管理端验收 / 前台 NPC 消费
```

选择原因：

- 当前 relation health 无 blocking。
- shop/loot orphan 和 missing resolution 已通过。
- local compat 已有非空输出。
- unresolved audit 仍是 warning，适合在管理端显式展示，而不是阻断全部 NPC 体验。
