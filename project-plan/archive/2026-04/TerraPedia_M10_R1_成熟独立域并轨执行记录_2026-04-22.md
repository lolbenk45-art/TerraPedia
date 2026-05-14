# TerraPedia M10-R1 成熟独立域并轨执行记录
日期：2026-04-22  
对应里程碑：`M10-R1`

---

## 1. 本批目标

把第二层成熟域第一批：

- `Buffs`
- `Projectiles`
- `Armor Sets`

接入统一后端数据刷新主线。

---

## 2. 本批已落改动

### 2.1 独立实体导入器支持 dry-run

新增：

- `scripts/data/import/independent-entity-import-mode.mjs`
- `scripts/data/import/independent-entity-import-mode.test.mjs`

改造：

- `scripts/data/import/import-independent-entities-to-db.mjs`

当前行为：

- 默认保持 apply 模式
- `--dry-run=true` 或 `--apply=false` 时事务回滚
- 输出 summary 中增加 `apply`

### 2.2 新增成熟独立域 pipeline

新增：

- `scripts/data/pipeline/independent-entity-sync-args.mjs`
- `scripts/data/pipeline/independent-entity-sync-args.test.mjs`
- `scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs`

当前流程：

1. `run-wiki-sync --mode=apply --entity=buffs,projectiles,armor_sets`
2. `standardize-existing-data.mjs`
3. `import-independent-entities-to-db.mjs`

默认安全策略：

- pipeline import 默认 dry-run
- 只有显式 `--apply=true` 才真正落库

### 2.3 统一后端刷新入口接入 `independent-entity-sync`

`backend-data-refresh-plan.mjs` 现在新增：

- `independent-entity-sync`

这意味着 `Buffs / Projectiles / Armor Sets` 已正式进入统一后端刷新主线。

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/import/independent-entity-import-mode.test.mjs
node --test scripts/data/pipeline/independent-entity-sync-args.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

结果：

- `14` tests
- `14` pass

已执行：

```powershell
node --check scripts/data/import/import-independent-entities-to-db.mjs
node --check scripts/data/pipeline/independent-entity-sync-args.mjs
node --check scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs
node --check scripts/data/workflow/backend-data-refresh-plan.mjs
```

结果：

- PASS

已执行：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync
```

结果：

- 正确输出 `independent-entity-sync` action

---

## 4. 当前意义

第二层成熟域第一批已经具备：

- 统一抓取入口
- 标准化入口
- 导入入口
- dry-run / apply 语义
- 统一后端刷新入口 action

这满足 `M10-R1` 的最小并轨标准。

---

## 5. 下一步

继续 `M10-R2`：

- `Shimmer`
- `Images`
- `ZH Enrichment`
- `Categories`
