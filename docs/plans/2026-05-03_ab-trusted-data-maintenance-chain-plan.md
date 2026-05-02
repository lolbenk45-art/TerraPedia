# A/B Trusted Data Maintenance Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` when implementing this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 A/B 档可信数据源为主，打通 TerraPedia 从来源证据、维护层、关系投影、质量门禁、管理端验收到前台消费的一整条自动维护链。

**Architecture:** 主链选择 `NPC / Item source / shop / loot`，因为当前 relation health 无 blocking，local compat 已有非空输出，适合先做可审计自动维护闭环。图片链采用 `item` 作为模板、`buff` 作为第二条验证链，`npc` 图片先进入只读审计，不扩同步写入。

**Tech Stack:** Spring Boot 3.2 + Java 17 + MyBatis Plus + Flyway, Vue 3 + Vite, Nuxt 4, Node.js data scripts, PowerShell local stack scripts, MySQL `terria_v1_local` / `terria_v1_maint` / `terria_v1_relation`, MinIO.

---

## 1. 顶级架构决策

### 1.1 数据分层

| 层 | 职责 | 自动维护判断 |
| --- | --- | --- |
| 上游事实层 | Wiki.gg module/page/template/crawler 原始输出 | 只作为事实，不直接写业务库 |
| Landing 证据层 | `source_dataset_landings` current 记录 | A 档过渡输入，必须有 provider/source/revision/hash |
| Canonical 可信输入层 | `data/canonical/` | 长期 A0 目标，当前不能假设已全部完成 |
| Maint 维护层 | `maint_*` | 自动维护业务中间层 |
| Relation/Projection 层 | `relation_*`、`projection_*` | A2 发布态，必须 health 无 blocking |
| Local/Public 发布层 | local core/compat、后端 DTO、管理端、前台 | 只能消费已准入数据 |

### 1.2 A/B 档准入

- A0：`data/canonical/` 中已审计、可追溯、可复现的数据。
- A1：`source_dataset_landings` current 记录，经过 maint 解析和 relation health 验收。
- A2：`relation_*` / `projection_*` 中 resolved/promoted/accepted 且 health 无 blocking 的数据。
- B1：`data/standardized/`、`data/generated/`、crawler bridge、recipe material reference，必须在边界文档登记。
- B2：manual override、derived-from-source、legacy fallback，只能补洞或解释。
- X：blocked group、source/original 丢失、只有 managed URL、未登记 raw/generated 直读，不得进入自动维护。

### 1.3 第一整链

优先打通：

```text
Wiki / crawler evidence
  -> source_dataset_landings / maint_item_sources
  -> item_source_facts
  -> item_npc_shop_relations / item_npc_loot_relations
  -> projection_items / projection_npcs
  -> local compat tables
  -> 管理端验收
  -> 前台 NPC/item 消费
```

不先选择 recipe / shimmer item group consumers，因为 Any Item Group audit 仍有 duplicate/blocked；blocked consumer reference 不按 consumer 类型降级。
不先选择 Boss/Biome/Projectile 公开页，因为图片和 source/cache/fallback 准入不足。
不先选择 NPC 图片同步，因为 NPC 目前只有 fallback 消费，缺统一 cache 契约。

---

## 2. 文件职责地图

### 2.1 本轮第一批落地

- Create: `docs/audits/canonical-migration-boundary.md`
  - 固化 A/B/X 数据源准入、过渡豁免、禁止规则。
- Modify: `docs/audits/data-quality-index.md`
  - 增加 canonical boundary 和数据维护链入口。
- Create: `docs/plans/2026-05-03_ab-trusted-data-maintenance-chain-plan.md`
  - 本计划。
- Create: `scripts/data/workflow/data-maintenance-chain-audit.mjs`
  - 只读聚合审计，不连 DB，不跑外部命令，不写业务数据。
- Create: `scripts/data/workflow/data-maintenance-chain-audit.test.mjs`
  - 纯函数和 CLI 输入规则测试。
- Modify: `scripts/data/import/recipe-import-mode.mjs`
  - 默认改为不写入，显式 `--apply=true` 才写。
- Modify: `scripts/data/import/recipe-import-mode.test.mjs`
  - 覆盖默认 dry-run 和显式 apply。
- Modify: `scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs`
  - 确保 pipeline 默认不隐式写库。
- Modify: `scripts/data/pipeline/recipe-reference-import-args.test.mjs`
  - 若参数层需要，补 pipeline 默认安全姿态测试。

### 2.2 后续里程碑文件

- Create: `docs/audits/relation-warning-policy.md`
- Create: `docs/runbooks/npc-item-source-maintenance-chain.md`
- Create: `scripts/data/audit/image-asset-readiness-audit.mjs`
- Create: `scripts/data/audit/image-asset-readiness-audit.test.mjs`
- Create: `data-query-app/pages/operations/data-quality.vue`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminRelationCompatibilityController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminRelationCompatibilityControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`

---

## 3. Milestone 1：准入边界和只读总闸

**目标：** 先建立统一判定标准，避免每条数据链各自解释“可信”和“可自动维护”。

### Task 1.1：A/B 档边界文档

**Files:**

- Create: `docs/audits/canonical-migration-boundary.md`
- Modify: `docs/audits/data-quality-index.md`

**Steps:**

- [ ] 写入 A0/A1/A2/B1/B2/X 分层。
- [ ] 登记当前 B 档豁免来源：NPC crawler bridge、recipe material reference、recipe group override、item group override、legacy item image。
- [ ] 写入禁止规则：blocked group、source 丢失、managed 覆盖 source、未登记 generated 直读。
- [ ] 把文档索引进 `docs/audits/data-quality-index.md`。

**Validation:**

```powershell
Test-Path .\docs\audits\canonical-migration-boundary.md
Select-String -Path .\docs\audits\data-quality-index.md -Pattern "canonical-migration-boundary"
```

### Task 1.2：只读数据维护链准入脚本

**Files:**

- Create: `scripts/data/workflow/data-maintenance-chain-audit.mjs`
- Create: `scripts/data/workflow/data-maintenance-chain-audit.test.mjs`

**Steps:**

- [ ] 导出 `buildDataMaintenanceChainAudit` 纯函数。
- [ ] 默认读取现有 relation health、Any Item Group consumer、image readiness、entity completeness 报告。
- [ ] 输出 `status`、`chains`、`blockingReasons`、`warningReasons`、`recommendedCommands`。
- [ ] 保证脚本不连接 DB、不调用子进程、不执行 apply。

**Validation:**

```powershell
node --test scripts/data/workflow/data-maintenance-chain-audit.test.mjs
node --check scripts/data/workflow/data-maintenance-chain-audit.mjs
node scripts/data/workflow/data-maintenance-chain-audit.mjs
```

### Task 1.3：Recipe 默认安全姿态

**Files:**

- Modify: `scripts/data/import/recipe-import-mode.mjs`
- Modify: `scripts/data/import/recipe-import-mode.test.mjs`
- Modify: `scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs`
- Modify: `scripts/data/pipeline/recipe-reference-import-args.test.mjs`

**Steps:**

- [ ] 默认参数解析为 dry-run。
- [ ] `--dry-run=true` 保持 dry-run。
- [ ] 只有 `--apply=true` 才允许写入。
- [ ] pipeline 默认只 build/audit，不隐式导库。

**Validation:**

```powershell
node --test scripts/data/import/recipe-import-mode.test.mjs scripts/data/pipeline/recipe-reference-import-args.test.mjs
node --check scripts/data/import/recipe-import-mode.mjs scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs
```

---

## 4. Milestone 2：NPC / Item Source Relation 主链

**目标：** 把当前最成熟的 relation 链路从“报告可看”提升到“自动维护前必须过闸”。

### Task 2.1：Relation warning policy

**Files:**

- Create: `docs/audits/relation-warning-policy.md`
- Modify: `scripts/data/relation/relation-health-report.test.mjs`

**Rules:**

- [x] `blockingCount > 0` 阻断任何 apply 和新公开页。
- [x] `unresolved_item_npc_relation_audits > 0` 是 warning，不阻断已 resolved/promoted 数据消费。
- [x] 新功能必须在管理端展示 warning 数量和样本路径。
- [x] health JSON 输出稳定包含 `checks[].reportPath`，没有报告路径时为 `null`。

**Validation:**

```powershell
node --test scripts/data/relation/relation-health-report.test.mjs
Select-String -Path .\docs\audits\relation-warning-policy.md -Pattern "unresolved_item_npc_relation_audits"
```

### Task 2.2：主链 runbook

**Files:**

- Create: `docs/runbooks/npc-item-source-maintenance-chain.md`

**Required sequence:**

1. [x] active writer 检查。
2. [x] source/landing 只读审计。
3. [x] maint dry-run。
4. [x] relation dry-run。
5. [x] relation health。
6. [x] replacement readiness。
7. [x] local compat smoke。
8. [x] 人工确认后才进入 apply。

**Validation:**

```powershell
Select-String -Path .\docs\runbooks\npc-item-source-maintenance-chain.md -Pattern "Do not run two DB apply scripts in parallel"
```

### Task 2.3：管理端 relation health JSON 稳定化

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminRelationCompatibilityController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminRelationCompatibilityControllerTest.java`

**Contract:**

- `summary.status`
- `summary.blockingCount`
- `summary.warningCount`
- `checks[].id`
- `checks[].status`
- `checks[].message`
- `checks[].reportPath`

**Validation:**

```powershell
cd back
mvn "-Dtest=AdminRelationCompatibilityControllerTest" test
```

---

## 5. Milestone 3：图片资产 A/B 链

**目标：** 用 item 图片作为完整模板，buff 作为第二链路，npc 先只审计不扩同步。

### Task 3.1：只读图片资产健康脚本

**Files:**

- Create: `scripts/data/audit/image-asset-readiness-audit.mjs`
- Create: `scripts/data/audit/image-asset-readiness-audit.test.mjs`

**Output fields:**

- `totalWithImage`
- `cachedHitCount`
- `wikiFallbackOnlyCount`
- `missingImageCount`
- `brokenCachedUrlSamples`
- `missingContentTypeCount`
- `staleLastVerifiedCount`

**Validation:**

```powershell
node --test scripts/data/audit/image-asset-readiness-audit.test.mjs
node --check scripts/data/audit/image-asset-readiness-audit.mjs
```

### Task 3.2：Item 图片模板验收

**Files:**

- Modify: `docs/runbooks/image-asset-cache.md`
- Test: `back/src/test/java/com/terraria/skills/service/impl/ItemImageServiceImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/WikiImageSyncServiceImplTest.java`

**Validation:**

```powershell
cd back
mvn "-Dtest=WikiImageSyncServiceImplTest,ItemImageServiceImplTest,ItemMapperPreferredImageSqlTest,AdminItemImageSqlTest" test
```

### Task 3.3：Buff 图片第二链验收

**Files:**

- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`
- Verify: `back/src/main/resources/db/migration/V40__add_buff_image_cache_columns.sql`

**Validation:**

```powershell
cd back
mvn "-Dtest=WikiImageSyncServiceImplTest,AdminBuffControllerTest" test
```

---

## 6. Milestone 4：管理端只读验收面

**目标：** 让 A/B 数据源准入结果在管理端可见，而不是散落在报告文件里。

### Task 4.1：数据源验收只读 API

**Files:**

- Create: `back/src/main/java/com/terraria/skills/controller/AdminDataSourceAcceptanceController.java`
- Create: `back/src/main/java/com/terraria/skills/service/DataSourceAcceptanceService.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java`
- Create: `back/src/main/java/com/terraria/skills/dto/DataSourceAcceptanceOverviewDTO.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImplTest.java`
- Create: `back/src/test/java/com/terraria/skills/controller/AdminDataSourceAcceptanceControllerTest.java`

**Contract:**

- `GET /admin/data-source-acceptance/overview`
- `overallStatus`: `pass | warning | blocked | missing`
- `relationHealth`
- `replacementReadiness`
- `sourceDatasetLanding`
- `sourceGroupAudit`
- `imageReadiness`
- `crawlerMonitor`
- `entitySourceCoverage`

**Validation:**

```powershell
cd back
mvn "-Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest" test
```

### Task 4.2：数据源验收页面最小版

**Files:**

- Create: `data-query-app/pages/operations/data-source-acceptance.vue`
- Modify: `data-query-app/layouts/default.vue`
- Create: `data-query-app/tests/data-source-acceptance-page-contract.test.mjs`

**Panels:**

- Overall acceptance verdict。
- Relation health summary。
- Any Item Group consumer duplicate/blocked。
- Image readiness item/buff/npc。
- Canonical boundary status。
- Report preview links, reused from crawler monitor patterns.

**Validation:**

```powershell
cd data-query-app
pnpm run check
pnpm run test:unit
```

---

## 7. Milestone 5：前台功能准入

**目标：** 允许继续加新功能，但只围绕 A 档和受控 B 档数据做垂直小切片。

Allowed first features:

- NPC 列表/详情体验增强。
- item source 展示增强。
- buff 来源和图片展示增强。
- 空态、错误态、SEO/meta。

Blocked until readiness:

- Boss/Biome/Projectile 新公开详情页。
- Armor set 公开页。
- 大批量 image sync apply。
- recipe group 自动合并写库。

**Validation:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
```

---

## 8. 多 Agent 执行边界

| Agent | 负责 | 可写范围 | 禁止 |
| --- | --- | --- | --- |
| Architect | 决策和验收 | docs/plans、docs/audits | 写 DB、跑 apply |
| Source Gate Agent | 只读总闸 | `scripts/data/workflow/data-maintenance-chain-audit.*` | child_process、DB 连接 |
| Recipe Safety Agent | 默认安全姿态 | recipe import/pipeline 参数文件 | 运行 recipe apply |
| Image Agent | 图片审计 | image audit scripts/tests/docs | npc sync scope 扩张 |
| Relation Agent | 主链健康 | relation policy/tests/runbook | relation/local apply |
| Admin Agent | 管理端验收面 | data-query-app 页面和 admin API | 前台公开页扩张 |

所有 apply 型任务必须串行，并且必须先有 dry-run/report gate。
