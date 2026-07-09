# TerraPedia M10-R2 Shimmer并轨执行记录
日期：2026-04-22  
对应里程碑：`M10-R2`

---

## 1. 本批目标

先把 `Shimmer` 从已有独立 extraction/import 链路收成统一后端刷新入口中的单个 action。

---

## 2. 本批已落改动

### 2.1 新增 Shimmer pipeline 参数构建

新增：

- `scripts/data/pipeline/shimmer-sync-args.mjs`
- `scripts/data/pipeline/shimmer-sync-args.test.mjs`

当前能力：

- import 默认 `apply=false`
- 显式 `apply=true` 时写入
- 支持透传 `input` 与 `raw`

### 2.2 新增 Shimmer 同步 pipeline

新增：

- `scripts/data/pipeline/run-shimmer-sync-pipeline.mjs`

当前流程：

1. `run-wiki-shimmer-extraction-pipeline.mjs`
2. `import-wiki-shimmer-to-db.mjs`

### 2.3 统一后端刷新入口接入 `shimmer-sync`

`backend-data-refresh-plan.mjs` 已新增：

- `shimmer-sync`

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/pipeline/shimmer-sync-args.test.mjs
```

结果：

- `3` tests
- `3` pass

已执行：

```powershell
node --check scripts/data/pipeline/shimmer-sync-args.mjs
node --check scripts/data/pipeline/run-shimmer-sync-pipeline.mjs
```

结果：

- PASS

---

## 4. 当前意义

`Shimmer` 已从成熟但独立的功能链路，进入统一后端刷新入口。

后续 `M10-R2` 剩余对象：

- `Images`
- `ZH Enrichment`
- `Categories`
