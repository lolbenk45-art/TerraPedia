# TerraPedia M10-R2 支持域并轨执行记录
日期：2026-04-22  
对应里程碑：`M10-R2`

---

## 1. 本批目标

把 `Images / ZH Enrichment / Categories` 从分散脚本收成统一的支持域 pipeline，并接入 `backend-data-refresh` 主入口。

---

## 2. 本批改动

### 2.1 新增支持域参数构建

新增：

- `scripts/data/pipeline/support-sync-args.mjs`
- `scripts/data/pipeline/support-sync-args.test.mjs`

当前能力：

- `Localization` 默认跑 `items,npcs,projectiles,buffs`
- `Image Sync` 默认跑 `items,npcs,projectiles,buffs`
- `Categories` 默认 `apply=false`
- `Image Sync` 支持透传 `apiBase`

### 2.2 新增支持域统一 pipeline

新增：

- `scripts/data/pipeline/run-support-sync-pipeline.mjs`

当前流程：

1. `run-zh-enrich.mjs`
2. `run-image-sync.mjs`
3. `sync-item-categories-from-wiki-pages.mjs`

### 2.3 统一后端刷新入口接入 `support-sync`

`backend-data-refresh-plan.mjs` 已新增：

- `support-sync`

这意味着 `M10-R2` 中剩余的 `Images / ZH / Categories` 已并入统一后端刷新编排。

---

## 3. 验证计划

已执行：

```powershell
node --test scripts/data/pipeline/support-sync-args.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs
node --check scripts/data/pipeline/support-sync-args.mjs
node --check scripts/data/pipeline/run-support-sync-pipeline.mjs
```

结果：

- `11` tests
- `11` pass
- `node --check` 全部通过

---

## 4. 当前意义

`M10-R2` 从“只收 Shimmer”推进到“支持域整体并轨”。

当前 `M10` 剩余重点已经收敛到：

- `M10-R3` 运维说明
- 问题归档
- 验收收口
