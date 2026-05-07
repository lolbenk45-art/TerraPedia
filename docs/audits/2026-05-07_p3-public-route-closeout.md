# P3 公开路由上线收尾审计

**日期**: 2026-05-07
**状态**: 已执行
**范围**: 将 `items`、`npcs` 从 `planned-public + publicRoute=null` 提升为 `public`，分别开放 `/items`、`/npcs`

---

## Phase 0：关闭态基线

### 执行命令

```powershell
node scripts/data/relation/generate-reresolve-candidates.mjs
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

### 结果摘要

- `generate-reresolve-candidates.mjs`
  - 退出码 `0`
  - `unresolvedAuditCount=1540`
  - `candidateCount=26`
  - `autoMatchedCount=26`
  - `manualReviewCount=1514`
- `domain-acceptance-generate-reports.mjs --write=true`
  - 退出码 `0`
  - 全局 `summary.domainCount=11`
  - 全局 `summary.panelCount=45`
  - 全局 `summary.writtenCount=45`
  - 全局 `summary.warningCount=3`
  - 全局 `summary.blockedCount=0`
- `domain-acceptance-freshness-audit.mjs`
  - 退出码 `0`
  - `overallStatus=pass`
  - 全局 `summary.freshCount=45`
  - 全局 `summary.staleCount=0`
  - 全局 `summary.missingCount=0`
- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true`
  - 退出码 `0`
  - `overallStatus=warning`
  - 全局 `summary.generatedBlockedCount=0`
  - 全局 `summary.freshCount=45`
  - `blockingReasons=[]`
  - Items
    - `aGradeStatus=warning`
    - `publicGateStatus=planned_public_no_route`
    - `routeReady=false`
    - `panelStatuses[*].freshnessStatus` 全部 `fresh`
  - NPCs
    - `aGradeStatus=warning`
    - `publicGateStatus=planned_public_no_route`
    - `routeReady=false`
    - `panelStatuses[*].freshnessStatus` 全部 `fresh`
  - 目标域 `checks[]`
    - 过滤条件：`domainId in ['items','npcs'] && status in ['warning','blocked']`
    - `targetCheckCount=10`
    - `targetCheckIds=['public.plannedRouteMissing']`
    - 未出现其他 target-domain warning/blocking id

### 结论

- 关闭态基线通过。
- gate 顶层仍为 `warning`，原因是各 `planned-public` 域预期产生 `public.plannedRouteMissing`，不构成阻断。

---

## Phase 1：Items 公开路由

### 配置变更

- `scripts/data/workflow/domain-acceptance-registry.json`
  - `items.publicExposure: "planned-public" -> "public"`
  - `items.publicRoute: null -> "/items"`

### 执行命令

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --domains=items --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
cd front
pnpm exec vitest run src/tests/public-front-style-shell.spec.ts src/tests/npc-public-shell.spec.ts src/tests/navbar-home-variant.spec.ts
pnpm exec vitest run src/tests/item-public-acceptance.spec.ts
```

### 结果摘要

- `domain-acceptance-generate-reports.mjs --domains=items --write=true`
  - 退出码 `0`
  - `summary.domainCount=1`
  - `summary.panelCount=5`
  - `summary.warningCount=3`
  - `summary.blockedCount=0`
- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true`
  - 退出码 `0`
  - 全局 `summary.generatedBlockedCount=0`
  - Items
    - `aGradeStatus=pass`
    - `publicGateStatus=public_route_configured`
    - `routeReady=true`
    - `panelStatuses[*].freshnessStatus` 全部 `fresh`
  - Items 目标域 `checks[]`
    - 过滤条件：`domainId === 'items' && status in ['warning','blocked']`
    - `itemsCheckCount=0`
  - NPCs
    - `aGradeStatus=warning`
    - `publicGateStatus=planned_public_no_route`
    - `routeReady=false`
- `front` 测试
  - `public-front-style-shell.spec.ts`、`npc-public-shell.spec.ts`、`navbar-home-variant.spec.ts`
    - 退出码 `0`
    - `15/15` 通过
  - `item-public-acceptance.spec.ts`
    - 退出码 `0`
    - `3/3` 通过
    - 其中一个预期失败路径会打印 `Failed to load item recipe tree` 到 stderr，但测试断言通过，属预期容错覆盖

### 结论

- `/items` 公开路由配置通过 gate。
- Items 域自身无 warning/blocking checks。

---

## Phase 2：NPCs 公开路由

### 预检命令

```powershell
node scripts/data/audit/image-source-lineage-report.mjs --source=db
```

### 预检结果

- 退出码 `0`
- `entities.npcs.contractReady=true`
- `entities.npcs.gapReasons=[]`
- `entities.npcs.lineage.core.rowsWithImage=758`
- `entities.npcs.lineage.maint.rowsWithStructuredImage=758`
- `entities.npcs.lineage.relation.rowsWithStructuredImage=758`
- `entities.npcs.lineage.projection.imageField='imageUrl'`
- `entities.npcs.lineage.projection.rowsWithImage=758`
- `entities.npcs.lineage.projection.rowsWithManagedImage=758`

### 配置变更

- `scripts/data/workflow/domain-acceptance-registry.json`
  - `npcs.publicExposure: "planned-public" -> "public"`
  - `npcs.publicRoute: null -> "/npcs"`

### 执行命令

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
cd front
pnpm exec vitest run src/tests/npc-public-shell.spec.ts
pnpm exec vitest run src/tests/npc-public-acceptance.spec.ts
pnpm run build
```

### 结果摘要

- `domain-acceptance-generate-reports.mjs --write=true`
  - 退出码 `0`
  - 全局 `summary.domainCount=11`
  - 全局 `summary.panelCount=45`
  - 全局 `summary.warningCount=3`
  - 全局 `summary.blockedCount=0`
- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true`
  - 退出码 `0`
  - `overallStatus=warning`
  - 全局 `summary.generatedBlockedCount=0`
  - 全局 `summary.freshCount=45`
  - Items
    - `aGradeStatus=pass`
    - `publicGateStatus=public_route_configured`
    - `routeReady=true`
  - NPCs
    - `aGradeStatus=pass`
    - `publicGateStatus=public_route_configured`
    - `routeReady=true`
    - `panelStatuses[*].freshnessStatus` 全部 `fresh`
  - NPCs 目标域 `checks[]`
    - 过滤条件：`domainId === 'npcs' && status in ['warning','blocked']`
    - `targetCheckCount=0`
  - 剩余 warning
    - 仅来自 `bosses`、`buffs`、`projectiles`、`armor_sets` 的 `public.plannedRouteMissing`
    - 外加全局 `generation.warning`
- `front` 测试
  - `npc-public-shell.spec.ts`
    - 退出码 `0`
    - `8/8` 通过
  - `npc-public-acceptance.spec.ts`
    - 退出码 `0`
    - `2/2` 通过
  - `pnpm run build`
    - 退出码 `0`
    - `vue-tsc` 通过
    - `vite build` 通过

### 结论

- `/npcs` 公开路由配置通过 gate。
- Items 与 NPCs 同时处于 `public_route_configured` 且 `routeReady=true`。

---

## 回归测试

### 执行命令

```powershell
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-generate-reports.test.mjs
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

### 结果

- domain acceptance workflow tests
  - `41/41` 通过
- image source lineage tests
  - `4/4` 通过

### 额外修正

- 更新 `scripts/data/workflow/domain-acceptance-report-manifest.test.mjs`
  - 将“所有 product 域都仍是 planned-public”改为“Items/NPCs 已公开，其余 product 域仍 planned-public”
  - 目的是让测试与当前 P3 执行后的 registry 状态一致

---

## 产出文件

- `scripts/data/workflow/domain-acceptance-registry.json`
- `scripts/data/workflow/domain-acceptance-report-manifest.test.mjs`
- `docs/plans/2026-05-07_p3-public-route-plan.md`
- `docs/audits/2026-05-07_p3-public-route-closeout.md`
- 本地运行时证据
  - `reports/domain/...`
  - `reports/relation/reresolve-candidates-2026-05-07.json`
  - `reports/audit/image-source-lineage-2026-05-07.json`

---

## 最终状态

- `items.publicExposure=public`
- `items.publicRoute=/items`
- `npcs.publicExposure=public`
- `npcs.publicRoute=/npcs`
- `bosses`、`buffs`、`projectiles`、`armor_sets` 仍为 `planned-public + publicRoute=null`
- P3 目标完成，剩余全局 warning 为非本次上线域的预期关闭态提示
