# TerraPedia M9-R1 Items与Recipes持续同步执行记录
日期：2026-04-22  
对应里程碑：`M9-R1`

---

## 1. 本批目标

开始把第一层主干域从“有入口”推进到“有持续同步语义”。

本批先处理：

- `Items`
- `Item Pages`
- `Item Relations`
- `Recipes`

本轮切入点是 `Recipes` 导入脚本的 dry-run / apply 语义。

---

## 2. 本批已落改动

### 2.1 新增 recipe import 模式解析

新增：

- `scripts/data/import/recipe-import-mode.mjs`
- `scripts/data/import/recipe-import-mode.test.mjs`

当前规则：

- 默认仍保持 `apply = true`
- `--dry-run=true` 时只演练，不提交事务
- `--apply=false` 时只演练，不提交事务

### 2.2 `import-recipes-from-external-data.mjs` 支持 dry-run

当前脚本行为：

- 仍会完整跑导入逻辑
- 但当 `apply = false` 时，最终事务回滚
- 输出 `summary.apply`

这样就具备了“同一脚本既可演练、也可落库”的基本能力。

### 2.3 `run-recipe-reference-sync-pipeline.mjs` 可显式透传 import dry-run

新增：

- `scripts/data/pipeline/recipe-reference-import-args.mjs`
- `scripts/data/pipeline/recipe-reference-import-args.test.mjs`

当前 pipeline 支持：

- 默认 import 为落库模式
- 当传入 `--import-dry-run=true` 时，import 层会收到 `--apply=false`

这让 recipe reference pipeline 的 dry-run 行为开始变得更细粒度，而不是只能整段跳过 import。

### 2.4 统一后端刷新入口避免默认污染 tracked recipe reference

`run-backend-data-refresh` 的 `recipe-reference-sync` action 现在显式使用：

```powershell
--recipe-reference=reports/backend-refresh/recipe-material-reference.latest.json
```

目的：

- 避免持续同步默认改写仓库内 tracked 文件 `data/generated/recipe-material-reference.json`
- 把运行中产生的 recipe reference 放入运行产物目录
- 降低后续自动刷新导致工作区变脏的风险

### 2.5 `run-item-detail-sync-pipeline.mjs` 支持最小 dry-run 语义

新增：

- `scripts/data/pipeline/item-detail-sync-mode.mjs`
- `scripts/data/pipeline/item-detail-sync-mode.test.mjs`

当前行为：

- 默认仍是 apply 模式
- 当传入 `--dry-run=true` 时：
  - 跑 item 文件校验
  - 跳过 item import
  - 跳过 relation import
  - 若启用 boss loot，则默认转为 boss loot dry-run

这让 `item-detail-sync` 从“默认直接写入”提升到“至少可以无写入演练主链前半段”。

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/import/recipe-import-mode.test.mjs
node --test scripts/data/pipeline/recipe-reference-import-args.test.mjs
```

结果：

- `5` tests
- `5` pass

已执行：

```powershell
node --check scripts/data/import/import-recipes-from-external-data.mjs
node --check scripts/data/import/recipe-import-mode.mjs
node --check scripts/data/pipeline/recipe-reference-import-args.mjs
node --check scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
node --test scripts/data/pipeline/item-detail-sync-mode.test.mjs
node --check scripts/data/pipeline/item-detail-sync-mode.mjs
node --check scripts/data/pipeline/run-item-detail-sync-pipeline.mjs
```

结果：

- PASS

---

## 4. 当前意义

这一步虽然不大，但把 `Recipes` 从：

- 只能直接落库

推进到了：

- 至少具备同脚本 dry-run / apply 两种模式

这是后续主干域统一持续同步的必要前提。

---

## 5. 下一步

继续沿 `M9-R1` 收口：

1. 评估 `run-recipe-reference-sync-pipeline.mjs` 是否要把 dry-run 明确透传到 import 层
2. 继续评估 item / relation import 是否需要更细粒度 dry-run，而不只是 pipeline 层 skip
3. 逐步把 `Items / Item Relations / Recipes` 拉到同一套持续同步口径
