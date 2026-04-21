# TerraPedia M9-R2 TownNPC持续同步执行记录
日期：2026-04-22  
对应里程碑：`M9-R2`

---

## 1. 本批目标

把 `Town NPC` 从“独立 fetch + 独立 import 的分散调用”提升到“单独可执行的持续同步 pipeline”。

---

## 2. 本批已落改动

### 2.1 新增 Town NPC pipeline 参数构建

新增：

- `scripts/data/pipeline/town-npc-sync-args.mjs`
- `scripts/data/pipeline/town-npc-sync-args.test.mjs`

当前支持：

- fetch 参数构建
- import 参数构建
- import 默认 `apply=false`
- 显式 `apply=true` 时切换到落库模式

### 2.2 新增 Town NPC 同步 pipeline

新增：

- `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`

当前逻辑：

1. 先执行 `fetch-wiki-town-npc-maintenance.py`
2. 再执行 `import-wiki-town-npcs-to-db.mjs`

默认使用同一组参数贯通 fetch 与 import。

### 2.3 统一后端刷新入口改接 `town-npc-sync`

`backend-data-refresh-plan.mjs` 已从：

- `town-npc-fetch`
- `town-npc-import`

收敛为：

- `town-npc-sync`

这让 `Town NPC` 在统一后端刷新入口中成为单个主干动作，而不是两段散动作。

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/pipeline/town-npc-sync-args.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

结果：

- `11` tests
- `11` pass

已执行：

```powershell
node --check scripts/data/pipeline/town-npc-sync-args.mjs
node --check scripts/data/pipeline/run-town-npc-sync-pipeline.mjs
node --check scripts/data/workflow/backend-data-refresh-plan.mjs
```

结果：

- PASS

已执行：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-sync
```

结果：

- 正确输出单个 `town-npc-sync` action

---

## 4. 当前意义

这一步把 `Town NPC` 主线从：

- 手工串 fetch
- 手工串 import

推进到：

- 有单独 pipeline
- 有统一入口 action
- 后续可以继续补干跑、报告和恢复

---

## 5. 下一步

继续沿 `M9-R2` 推进：

1. 评估 `Town NPC` pipeline 是否需要统一 report 输出
2. 判断是否要把 `NPC Core` 与 `Town NPC` 的时效链进一步合并
3. 再决定是否切到 `Boss / Biomes` 的 `M9-R3`
