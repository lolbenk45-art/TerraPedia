# TerraPedia M9-R3 Boss与Biomes持续同步执行记录
日期：2026-04-22  
对应里程碑：`M9-R3`

---

## 1. 本批目标

把 `Boss / Boss Loot / Biomes` 接入后端持续同步主线，先收成可执行 pipeline，再纳入统一后端刷新入口。

---

## 2. 本批已落改动

### 2.1 新增 Boss pipeline 参数构建

新增：

- `scripts/data/pipeline/boss-sync-args.mjs`
- `scripts/data/pipeline/boss-sync-args.test.mjs`

当前能力：

- `Boss fetch` 参数构建
- `Boss import` 参数构建
- `Boss loot` 参数构建
- 默认 dry-run，显式 `apply=true` 才进入写入模式

### 2.2 新增 Biome pipeline 参数构建

新增：

- `scripts/data/pipeline/biome-sync-args.mjs`
- `scripts/data/pipeline/biome-sync-args.test.mjs`

当前能力：

- 判断 biome import 是否启用
- 传递 `wiki-biomes-file`

### 2.3 新增 Boss 持续同步 pipeline

新增：

- `scripts/data/pipeline/run-boss-sync-pipeline.mjs`

当前流程：

1. `fetch-wiki-bosses.mjs`
2. `import-wiki-bosses-to-db.mjs`
3. `run-boss-loot-sync-pipeline.mjs`

默认安全策略：

- 未显式 `apply=true` 时，Boss import 与 Boss loot 都走 dry-run

### 2.4 新增 Biome 持续同步 pipeline

新增：

- `scripts/data/pipeline/run-biome-sync-pipeline.mjs`

当前流程：

1. `fetch-wiki-biomes.mjs`
2. `transform-wiki-biomes-to-import.mjs`
3. 仅在 `apply=true` 时触发 `import-standardized-to-db.mjs --wiki-biomes-file=...`

说明：

- 这一步是最小安全接法
- 当前 biome import 仍依赖宽口径 `import-standardized-to-db.mjs`

### 2.5 统一后端刷新入口接入 `boss-sync` 与 `biome-sync`

`backend-data-refresh-plan.mjs` 现在已包含：

- `boss-sync`
- `biome-sync`

说明 `M9-R3` 已经正式进入统一后端刷新入口。

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/pipeline/boss-sync-args.test.mjs
node --test scripts/data/pipeline/biome-sync-args.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

结果：

- `13` tests
- `13` pass

已执行：

```powershell
node --check scripts/data/pipeline/boss-sync-args.mjs
node --check scripts/data/pipeline/biome-sync-args.mjs
node --check scripts/data/pipeline/run-boss-sync-pipeline.mjs
node --check scripts/data/pipeline/run-biome-sync-pipeline.mjs
node --check scripts/data/workflow/backend-data-refresh-plan.mjs
```

结果：

- PASS

已执行：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-sync,biome-sync
```

结果：

- 正确输出 `boss-sync` 与 `biome-sync` 两个 actions

---

## 4. 当前意义

到这一步，第一层主干域的统一入口覆盖已经扩到：

- `Items / Item Pages / Item Relations / Recipes`
- `Town NPC`
- `Boss / Boss Loot`
- `Biomes`

这说明 `M9` 已经不是局部脚本修补，而是开始形成真正的后端持续同步骨架。

---

## 5. 当前边界

### 5.1 Boss 已有独立 pipeline，但仍是聚合域口径

这与已确认决策一致：

- `Boss` 不回退成独立基础实体域
- 仍按聚合域处理

### 5.2 Biome import 仍偏宽口径

当前 `run-biome-sync-pipeline` 的 import 还依赖：

- `import-standardized-to-db.mjs`

这意味着：

- biome import 不是完全独立导入器
- 后续若继续精化，需要把 biome import 从宽口径 standardized importer 中拆出

---

## 6. 下一步

默认继续进入：

- `M10` 第一批成熟域并轨

优先顺序建议：

1. `Buffs / Projectiles / Armor Sets`
2. 再处理 `Shimmer / Images / ZH / Categories`
