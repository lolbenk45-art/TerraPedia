# P3 公开路由上线计划

**日期**: 2026-05-07
**状态**: 规划中
**前置**: `docs/plans/2026-05-07_p0-p2-closeout-plan.md`（已执行，P0-P2 收口完成）

---

## Phase 0：关闭态基线验证（必须全部通过后才能进入 Phase 1）

此时所有 6 产品域均为 `planned-public` + `publicRoute=null`。Items/NPCs 的 `plannedRouteMissing` warning 是此关闭态的预期基线。

### 0.1 生成 Domain Acceptance Evidence

```powershell
node scripts/data/relation/generate-reresolve-candidates.mjs
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
```

产物落 `reports/domain/` 和 `reports/relation/`，为本地运行时产物。当前 `.gitignore:28` (`reports/`) 阻止 `reports/domain/` 下文件被 Git 追踪（`!reports/domain/` 例外对子文件未生效，已知 P0.3 问题）。本次上线证据以 stdout 日志和 gate 报告为准，产物保留在本地磁盘备查，不依赖 Git 提交。跨机器或新 worktree 执行前必须先跑 Phase 0.1 重新生成 evidence，否则 freshness audit 会因本地报告缺失而失败。

执行时需把 Phase 0、Phase 1、Phase 2 的关键 stdout JSON 摘要记录到非 ignored 的审计文档，例如 `docs/audits/2026-05-07_p3-public-route-closeout.md`。记录字段至少包含：执行时间、命令、退出码、全局 `summary.generatedBlockedCount`、全局 `summary.freshCount`、目标域 `aGradeStatus` / `publicGateStatus` / `routeReady`、目标域 warning/blocked `checks[]` 摘要。

### 0.2 运行 Freshness Audit

```powershell
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
```

验收标准：全部面板 `freshnessStatus=fresh`，`missingCount=0`，`staleCount=0`。

### 0.3 运行全局 A-grade Gate（关闭态基线）

```powershell
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

验收标准（从 stdout JSON 提取）：

| 字段 | 要求 |
|------|------|
| `overallStatus` | 非 `blocked` |
| `summary.generatedBlockedCount` | 0 |
| `blockingReasons` | `[]` |
| `summary.missingCount` | 0 |
| `summary.freshCount` | 45 |

对 Items 和 NPCs（关闭态基线）：

| 字段 | 要求 | 说明 |
|------|------|------|
| `aGradeStatus` | `warning` | 预期值，关闭态基线 |
| `publicGateStatus` | `planned_public_no_route` | 预期值 |
| 各项 `panelStatuses[*].freshnessStatus` | 全部 `fresh` | 非 stale、非 missing |
| 顶层 `checks[]` 中目标域（Items/NPCs）的 warning/blocked 条目 | 允许的 `id` 仅 `public.plannedRouteMissing` | 按 `checks[].domainId` 和 `status in ["warning", "blocked"]` 过滤后检查 `id`；出现其他 id 则停止 |

判定方法：读取 stdout JSON 的 `checks` 数组，筛选 `domainId === 'items'` 或 `domainId === 'npcs'`，且 `status === 'warning'` 或 `status === 'blocked'` 的条目，检查每项 `id`。允许值集合 = `["public.plannedRouteMissing"]`。任何条目 `id` 不在允许集合内 → **计划停止，不进入 Phase 1**。

---

## Phase 1：Items 公开路由上线

**前置**：Phase 0 全部通过。

### 1.1 恢复公开状态

修改 `scripts/data/workflow/domain-acceptance-registry.json`：
- Items: `publicExposure` → `"public"`，`publicRoute` → `"/items"`

### 1.2 重跑 Evidence + Gate

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --domains=items --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

验收标准（从 stdout JSON 提取；`summary.*` 为全局字段，其余为 Items 域字段）：

| 字段 | 要求 |
|------|------|
| 全局 `summary.generatedBlockedCount` | 0 |
| Items `aGradeStatus` | `pass` |
| Items `publicGateStatus` | `public_route_configured` |
| Items `routeReady` | `true` |
| Items 各面板 `panelStatuses[*].freshnessStatus` | 全部 `fresh` |
| Items 目标域 warning/blocked `checks[]` | 空数组 |

其余 5 产品域的 `plannedRouteMissing` warning 仍存在，属预期行为，不阻塞。

### 1.3 前端验证

公开前端验收以 `front/` 的 Vite SPA 为准，不以 `data-query-app/` 的 Nuxt admin 为准。

| 检查项 | 方法 | 标准 |
|------|------|------|
| 路由注册与挂载 | `cd front && pnpm exec vitest run src/tests/public-front-style-shell.spec.ts src/tests/item-public-acceptance.spec.ts src/tests/npc-public-shell.spec.ts` | 4 个 spec 全部通过；`/items` 路由存在，`HomeView` / `ItemDetailView` 挂载与空态断言通过 |
| 公开 API 调用 | 同上 | `fetchItems`、`fetchPublicItemDetailShell`、`fetchItemImages`、`fetchItemSources`、`fetchItemRecipeTree` 按测试断言被调用 |
| 公开路由无回归 | `cd front && pnpm run build` | `vue-tsc` + `vite build` 通过，`front/dist` 正常产出 |

### 1.4 回滚方案

如 1.2 gate 不达标或 1.3 前端验证不通过：
1. Items: `publicExposure` → `"planned-public"`，`publicRoute` → `null`
2. 重跑 `domain-acceptance-generate-reports.mjs --domains=items --write=true`
3. 重跑 `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true`
4. 确认 Items `aGradeStatus` 回到 `warning`（仅 `plannedRouteMissing`）、`publicGateStatus=planned_public_no_route`、`routeReady=false`、全局 `generatedBlockedCount=0`

---

## Phase 2：NPCs 公开路由上线

**前置**：Phase 1 全部通过。

### 2.0 NPC 图片溯源前置检查

DB 前置：MySQL 必须可达，且 `terria_v1_local`、`terria_v1_maint`、`terria_v1_relation` 三库可读。若不是默认本地连接，执行前需确认 `TERRAPEDIA_DB_HOST`、`TERRAPEDIA_DB_PORT`、`TERRAPEDIA_DB_USERNAME`、`TERRAPEDIA_DB_PASSWORD` 指向当前验收 DB。

```powershell
node scripts/data/audit/image-source-lineage-report.mjs --source=db
```

验收标准（从 stdout JSON 提取）：`entities.npcs.contractReady === true`，`entities.npcs.gapReasons === []`，且 `entities.npcs.lineage.projection.rowsWithManagedImage === entities.npcs.lineage.projection.rowsWithImage`。若 NPCs 图片来源缺失、wiki fallback 异常、DB source lineage 退化、或上述字段不满足，则计划停止，不进入 2.1。

### 2.1 恢复公开状态

修改 `scripts/data/workflow/domain-acceptance-registry.json`：
- NPCs: `publicExposure` → `"public"`，`publicRoute` → `"/npcs"`

Items 保持 Phase 1 已公开状态；Bosses、Buffs、Projectiles、ArmorSets 保持 `planned-public` + `publicRoute=null`。

### 2.2 重跑 Evidence + Gate

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

说明：Phase 2 使用全量 evidence 刷新，不加 `--domains=npcs`。原因是 Phase 2 仍要求 Items 保持 `pass`，若只刷新 NPCs，Items 可能依赖 Phase 1 的旧 evidence，跨机器或长时间间隔执行时会削弱验收可信度。

验收标准（从 stdout JSON 提取；`summary.*` 为全局字段，重点检查 NPCs，并复核 Items）：

| 字段 | 要求 |
|------|------|
| 全局 `summary.generatedBlockedCount` | 0 |
| NPCs `aGradeStatus` | `pass` |
| NPCs `publicGateStatus` | `public_route_configured` |
| NPCs `routeReady` | `true` |
| NPCs 各面板 `panelStatuses[*].freshnessStatus` | 全部 `fresh` |
| NPCs 目标域 warning/blocked `checks[]` | 空数组 |

Items 必须继续保持 `aGradeStatus=pass`、`publicGateStatus=public_route_configured`、`routeReady=true`。其余 4 产品域的 `plannedRouteMissing` warning 仍存在，属预期行为，不阻塞。

### 2.3 前端验证

公开前端验收以 `front/` 的 Vite SPA 为准，不以 `data-query-app/` 的 Nuxt admin 为准。

| 检查项 | 方法 | 标准 |
|------|------|------|
| 路由注册与挂载 | `cd front && pnpm exec vitest run src/tests/npc-public-shell.spec.ts src/tests/npc-public-acceptance.spec.ts src/tests/public-front-style-shell.spec.ts` | 4 个 spec 全部通过；`/npcs` 路由存在，`NpcListView` / `NpcDetailView` 挂载与空态断言通过 |
| 公开 API 调用 | 同上 | `fetchNpcs`、`fetchNpcAggregateById(id, 'loot,shop,buffs')` 按测试断言被调用 |
| 公开路由无回归 | `cd front && pnpm run build` | `vue-tsc` + `vite build` 通过，`front/dist` 正常产出 |

### 2.4 回滚方案

如 2.2 gate 不达标、2.3 前端验证不通过、或 NPC 图片溯源前置检查异常：
1. NPCs: `publicExposure` → `"planned-public"`，`publicRoute` → `null`
2. 重跑 `domain-acceptance-generate-reports.mjs --write=true`
3. 重跑 `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true`
4. 确认 NPCs `aGradeStatus` 回到 `warning`（仅 `plannedRouteMissing`）、`publicGateStatus=planned_public_no_route`、`routeReady=false`、全局 `generatedBlockedCount=0`
5. 确认 Items 仍保持 `pass` + `public_route_configured` + `routeReady=true`

---

## 其余产品域（不纳入本次上线）

| 域 | 缺失项 | 优先级 |
|------|------|------|
| Bosses | projection_bosses 表 + 独立 local 实体 | 高 |
| Buffs | image lineage parity（maint/relation 层） | 中 |
| Projectiles | image lineage parity（maint/relation 层） | 中 |
| ArmorSets | image ENTITY_ORDER 接入 + 跨库审计 | 低 |

这些域保持 `planned-public` + `publicRoute=null`，全局 gate 中持续产生 `plannedRouteMissing` warning，记录在案。

---

## 硬边界

- Phase 0 基线不达标则计划停止
- 全局 gate 仅用 `--fail-on-blocked=true`；目标域通过读取 stdout JSON 中 `aGradeStatus` / `publicGateStatus` / `routeReady` 逐字段验证
- 目标域 warning/blocked `checks[]` 必须为空；关闭态基线例外仅允许 `public.plannedRouteMissing`
- 每次只开放一个域，逐域验证通过后再开下一个
- 恢复公开状态后必须重跑 evidence + gate
- 前端验证 5 项逐项检查，不得跳过
- 回滚后必须重跑 gate 确认回到关闭态基线
- 每个 Phase 的关键 stdout JSON 摘要必须写入非 ignored 审计文档
- `accepted-warning` 不得放行公开路由
