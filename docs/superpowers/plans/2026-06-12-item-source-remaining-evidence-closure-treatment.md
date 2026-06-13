# Item Source Remaining Evidence Closure Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剩余 item 来源问题按真实证据层全部闭环：已有 DB 证据的走投影/发布/豁免，确实缺原始证据的只进入受控补证据链，最终让物品详情/API/审计报告能解释每个 item 的来源状态。

**Architecture:** 先执行只读 evidence-layer audit，把 `items` 存在、recipe/shimmer、NPC loot/shop、biome、maint/relation、raw candidate、candidate import、terminal exemption 分层。然后按 lane 逐类处理：不把 recipe/shimmer/biome 这类已有专属结构表的数据重复写成普通 `item_acquisition_sources`，只对确实应该进入 local compat 来源表的候选来源做 dry-run、备份、apply 和回滚脚本。

**Tech Stack:** Node.js ESM scripts under `scripts/data/audit` and `scripts/data/relation`, MySQL local DB `terria_v1_local`, optional `terria_v1_maint` / `terria_v1_relation`, backend Java DTO/API checks, Nuxt public item detail smoke checks, generated reports under `data/reports`.

---

## 任务复述

用户看到很多 item “库里已经有数据”，但当前剩余报告仍显示没有来源。这里的根因不是单一“没提取到”，而是目标口径不同：

- `items` 表有物品：只证明物品实体存在。
- `recipes` / shimmer / `npc_loot_entries` / `npc_shop_entries` / `item_biomes` 有证据：证明某类来源证据已在专属结构表或关系表存在。
- `item_acquisition_sources WHERE status = 1 AND deleted = 0` 有行：才是当前 item source closure 报告默认统计的 active 来源闭环。

本计划的处理目标是把这三类口径统一，不盲目重抓、不重复造数据。

## 当前事实

来自 `data/reports/item-source-remaining-closure-2026-06-11-current.json`：

| lane | 数量 | 处理口径 |
| --- | ---: | --- |
| `recipe_or_shimmer_chain_covered` | 2434 | 已有 recipe/shimmer 证据，不应批量写普通来源行；要验证 API/UI 通过专属结构展示 |
| `needs_external_source_evidence` | 810 | raw page report 已有 810 个 extracted source candidates；重点是候选导入/发布缺口 |
| `family_policy_candidate` | 451 | family/shared page 证据存在但过宽，必须先做 family policy 精确解析 |
| `explicit_no_source_exemption_candidate` | 17 | terminal/exemption，不应导入普通来源行 |
| `biome_evidence_projection` | 12 | biome 关系证据存在，处理为 biome 投影/展示，不伪造成普通来源 |
| `missing_required_raw_evidence` | 3 | 缺精确 raw evidence，不能凭相似页面造来源 |
| `runtime_or_developer_internal` | 2 | internal/runtime 豁免 |
| `npc_relation_chain_gap` | 1 | NPC loot/shop 关系到 item source/API 投影缺口 |

来自 `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`：

- `totalRows`: 827
- `candidatesWithExtractedSources`: 810
- `candidateSourceRows`: 1014
- `terminalHardBlockedRows`: 17
- `missingRawPage`: 13，其中 terminal plan 已归到 3 个 required raw evidence

结论：多数不是“库里完全没有”，而是已有证据没有进入当前 active source closure 口径，或本来就不应该进入普通 item source 表。

## 硬边界

- 不跑 crawler/fetch/import/backfill/sync/pipeline/materialize/Flyway，除非对应 phase 明确把命令列为 dry-run 且用户另行确认 apply。
- 不跑 `--apply=true`，直到 dry-run 报告、备份路径、回滚 SQL 和样本验收全部通过。
- 不写生产库；只允许 `terria_v1_local`。
- 不手写 SQL 修改数据。
- 不批量修改分类字段。
- 不把 `recipes` / shimmer / biome 证据重复写成普通 `item_acquisition_sources`。
- 不把 terminal exemption、runtime/internal、missing raw evidence 导入来源表。
- 当前未提交脏文件 `data/reports/item-source-remaining-closure-2026-06-11-current.json` 有非本计划改动，本计划不得覆盖或修复它，除非用户明确要求。

## Source Of Truth

```text
wiki/raw/maint/relation evidence
  -> generated reports and candidate plans
  -> local DB tables
  -> backend DTO/API
  -> front item detail acquisition display
  -> closure/audit reports
```

关键表/文件：

- Active item source closure: `item_acquisition_sources`
- 物品实体存在: `items`
- 制作证据: `recipes`, `recipe_ingredients`, `recipe_stations`
- shimmer 证据: 当前 shimmer import/report 链路输出
- NPC 掉落/商店证据: `npc_loot_entries`, `npc_shop_entries`
- biome 证据: `item_biomes`, biome wikitext source rows
- 候选来源: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- 候选导入计划: `data/reports/item-source-candidate-import-plan.post-ref-closure.json`
- terminal 豁免: `data/reports/item-source-terminal-exemption-plan-2026-06-11.json`
- 剩余闭环报告: `data/reports/item-source-remaining-closure-2026-06-11-current.json`

## 成功标准

- 每个剩余 item 都能归到一个且仅一个 evidence layer。
- 中文报告能回答“库里有的是哪一层、有多少、为什么还不算来源闭合”。
- 可导入来源只来自已解析候选和已验证 DB ref，不来自手写猜测。
- recipe/shimmer/biome/terminal/internal 不被错误导入普通来源表。
- apply 前有 dry-run、备份、回滚 SQL、样本前后对比。
- 最终剩余项只剩两类：明确豁免/专属结构已覆盖，或确实缺 raw evidence 且有补证据任务。

---

## Multi-Agent 审查分工

- Agent A：DB 证据链审查。只读核对 `items`、`item_acquisition_sources`、`recipes`、`npc_loot_entries`、`npc_shop_entries`、`item_biomes`、maint/relation 表是否能解释剩余行。
- Agent B：候选导入/脚本契约审查。检查 raw candidate -> candidate plan -> local compat apply 的字段、去重、ref id、回滚。
- Agent C：API/UI 审查。确认 recipe/shimmer/biome/NPC 来源在 backend DTO 和前台 item 详情可见，而不是只在报告里“闭合”。
- Agent D：安全审查。检查 forbidden command、`--apply=true`、非 local DB、脏工作区、staged 范围。

并行允许：只读审查、测试、报告可读性审查。

并行禁止：多个 agent 同时写同一脚本、同一报告、同一 DB 表或同一页面。

---

## Phase 0: Evidence Layer Cross-Audit

**目的：** 先解释“库里已有数据”到底在哪个层，不开始写库。

**Files:**

- Execute existing plan: `docs/superpowers/plans/2026-06-12-item-source-existing-evidence-cross-audit.md`
- Create: `scripts/data/audit/audit-item-source-existing-evidence-layers.mjs`
- Create: `scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs`
- Create: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Create: `data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md`

**Steps:**

- [x] 写失败测试，覆盖 active source、item-only、raw candidate、candidate import、recipe/shimmer、NPC relation、biome、maint/relation、family policy、terminal、missing raw。
- [x] 实现只读审计脚本，只执行 `SELECT`，拒绝 mutation flags。
- [x] 生成 JSON 和中文 MD。
- [x] 校验 `summary.totalRows === 3730` 且 layer counts 之和等于 3730。

**Commands:**

```bash
node --test scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs

node scripts/data/audit/audit-item-source-existing-evidence-layers.mjs \
  --output=data/reports/item-source-existing-evidence-layers-2026-06-12.json \
  --summary-output=data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md
```

**验收：**

- 报告明确区分：
  - `itemExists = true`
  - `activeSourceCount > 0`
  - `recipeCount > 0`
  - `rawCandidateSourceCount > 0`
  - `candidateImportPlannedSourceRows > 0`
- 如果发现 `active_source_present > 0`，先修 stale report，不进入导入。

---

## Phase 1: Recipe/Shimmer Covered Lane Closure

**目标数量：** 2434

**处理原则：** 不把 recipe/shimmer 复制进 `item_acquisition_sources`。这类 item 应通过制作/微光结构数据在 API/UI 展示来源。

**Files to inspect/modify if needed:**

- Backend item detail DTO/controller/service for recipe/shimmer acquisition projection.
- Front item detail acquisition display.
- Reports only if runtime/API 已经正确但 closure 口径还显示为 open。

**Steps:**

- [ ] 抽样 30 个 `recipe_or_shimmer_chain_covered` item，核对 `recipes` 或 shimmer 证据存在。
- [ ] 调 backend item detail API，确认返回制作/微光来源字段。
- [ ] 打开前台 item 页面，确认用户能看到制作/微光来源。
- [ ] 如果 API/UI 缺字段，补 DTO/service/UI 测试和实现。
- [ ] 如果 API/UI 已正确，只更新 closure summary，把这 2434 标记为“专属结构已闭合，不要求 active item source row”。

**验收：**

- Iron Pickaxe / Iron Broadsword / 任意 shimmer 样本在前台可见对应来源。
- 这 2434 不再被解释成“缺来源数据”，而是“recipe/shimmer 专属结构已覆盖”。

---

## Phase 2: Raw Candidate -> Candidate Import -> Local Compat

**目标数量：** 810

**处理原则：** 这批多数不是“没提取到”，raw candidate report 已有 1014 条 extracted source rows；问题是尚未安全导入或发布为 active local compat 来源。

**Files:**

- Inspect/possibly modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Create: `scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.mjs`
- Inspect/possibly modify: `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`
- Reports:
  - `data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json`
  - `data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json`

**Steps:**

- [x] 从 Phase 0 报告筛选 `raw_candidate_not_projected` / `candidate_import_not_applied`。
- [x] 用现有 raw candidate report 重新生成 focused candidate import plan，只包含 remaining item ids。
- [x] dry-run `apply-item-source-candidate-local-compat.mjs`，禁止 apply。
- [x] 审查 blocked rows：`unsupported_source_type`、`unsupported_source_ref_type`、`source_ref_id_missing`、duplicate。
- [x] 对 focused plan 转换脚本补测试，避免一次性命令不可复现。
- [x] dry-run 为 0 validation error 后，出单独 apply 计划给用户确认。

**Allowed dry-run command:**

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json \
  --output=data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json \
  --allow-bulk=true \
  --apply=false
```

**Apply gate:**

只有以下条件全部满足才允许另起 apply 分支：

- dry-run `validationErrors = 0`
- `blockedRows = 0` 或 blocked rows 已被明确转入其他 lane
- `duplicates` 已审查
- backup path 可写
- rollback SQL 非空且样本可执行
- 用户明确同意 `--apply=true`

**验收：**

- Fallen Star / Magic Mirror / Chain Lantern 等样本能从 raw candidate 进入 candidate plan。
- dry-run 报告显示 `selectedCandidates=161`、`plannedRows=218`、`validationErrors=0`、`duplicates=0`、`inserted=0`。
- apply 后重新生成 closure report，810 lane 显著下降。当前未执行 apply，因为本计划硬边界禁止 `--apply=true`。

## Phase 2.5: Treatment Closure Report

**目的：** 把 Phase 0、Phase 2、family/API multi-agent 审查结论固化为可重复 JSON 和中文汇总，回答“剩下的具体是什么、为什么不能说已全部入库”。

**Files:**

- Create: `scripts/data/audit/build-item-source-remaining-treatment-report.mjs`
- Create: `scripts/data/audit/build-item-source-remaining-treatment-report.test.mjs`
- Create: `data/reports/item-source-remaining-treatment-report-2026-06-12.json`
- Create: `data/reports/item-source-remaining-treatment-summary-zh-2026-06-12.md`

**Steps:**

- [x] 统计 dedicated structure、dry-run ready、family policy blocked、blocked source rows、projection required、missing raw、terminal exemption。
- [x] 写单元测试，确认拒绝 mutation flags。
- [x] 输出中文版汇总，明确 `218` rows 已 dry-run 可写库但需要用户批准 `--apply=true`。
- [x] 明确不能说“全处理完并已入库”，因为 DB 写入、crawler/fetch/backfill 都未执行且在当前边界外。

---

## Phase 3: Family Policy Candidate Parser

**目标数量：** 451

**处理原则：** 这批数据通常来自 `Paintings`、`Statues`、`Bookcases`、`Tables`、`Pianos` 等 family/shared 页面。页面有来源句子，但不是每句都能安全套到每个具体 item；必须先拆 family policy。

**Files:**

- Inspect/modify: `scripts/data/audit/item-source-family-page-policy.mjs`
- Inspect/modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- New report:
  - `data/reports/item-source-family-policy-resolution-2026-06-12.json`

**Steps:**

- [x] 按 `sourcePage` 聚合 remaining pending 278 项和 candidate-plan blocked family 632 项，输出主要页面和 source row 类型。
- [ ] 建立允许规则：
  - exact item mention
  - exact recipe result match
  - family page sentence explicitly says all variants share source
  - known subgroup rule, with source row retaining family page trace
- [ ] 建立拒绝规则：
  - only decorative/function description but no acquisition source
  - source applies to subset but无法解析 subset
  - mixed sold/drop/worldgen/fishing without target mapping
- [ ] 为 Paintings、Statues、Bookcases、Tables、Pianos 各写 fixture 测试。
- [ ] 生成 resolution report，把 resolved rows 推回 candidate import plan，unresolved rows 留 family review。

**验收：**

- 451 不再整体卡在 `family_policy_candidate`。
- 每个 promoted source row 都有 `sourcePage`、原句/条件、policy rule id。
- 无法证明适用于具体 item 的行不导入。

---

## Phase 4: NPC Relation Chain Gap

**目标数量：** 1

**实际审计数量：** 2

**样本：** `CenxsWings`、`CorruptPlanterBox`

**处理原则：** 如果 `npc_loot_entries` 或 `npc_shop_entries` 已有关系，优先修投影链；如果 relation fact 缺失，补 relation publication plan，不直接猜 source row。

**Files:**

- Inspect: NPC loot/shop relation scripts and backend item acquisition projection.
- Possible reports:
  - `data/reports/item-source-npc-relation-gap-resolution-2026-06-12.json`

**Steps:**

- [ ] 只读查询 `npc_loot_entries` / `npc_shop_entries` 中该 item 的 active rows。
- [ ] 检查 backend item detail 是否从 NPC loot/shop 投影 item acquisition。
- [ ] 如果 DB 有关系但 API 不展示，修 API/UI 投影。
- [ ] 如果 DB 无关系但 raw/maint 有关系，进入 relation publication dry-run。

**验收：**

- `CenxsWings` 的来源链能在 DB/API/UI 或报告里明确闭合。

---

## Phase 5: Biome Evidence Projection

**目标数量：** 12

**实际审计数量：** 15

**处理原则：** biome 是环境/地点关系，不应伪造成普通 drop/shop 来源；应在 item detail 上作为 biome/location acquisition evidence 展示。

**Files:**

- Inspect: `item_biomes` import/projection scripts.
- Backend item detail biome relation DTO.
- Front item detail biome/source display.

**Steps:**

- [ ] 核对 12 个 item 的 `item_biomes` 或 `biome_wikitext` source evidence。
- [ ] 确认 API item detail 返回 biome acquisition evidence。
- [ ] 如果 UI 不显示，补前台展示。
- [ ] 如果 DB 缺 relation 但 raw report 有 biome evidence，走 biome relation dry-run，不写普通 source row。

**验收：**

- Bladed Glove / Flarefin Koi / Rockfish 等样本在页面可看到 biome/location 来源解释。

---

## Phase 6: Terminal / Internal / Missing Raw Evidence

**目标数量：** 17 terminal + 2 internal + 3 missing raw

**处理原则：**

- terminal/internal：明确豁免，不进入 item source import。
- missing raw：缺精确页面证据，不能用相似页面或名字猜。

**Files:**

- `data/reports/item-source-terminal-exemption-plan-2026-06-11.json`
- New report:
  - `data/reports/item-source-terminal-and-missing-raw-closure-2026-06-12.json`

**Steps:**

- [ ] 把 17 terminal rows 转为 stable exemption report，并在中文汇总里列全量。
- [ ] 把 2 runtime/internal rows 放入 internal exemption lane。
- [ ] 把 3 missing raw rows 输出为 raw evidence acquisition task，不导入。
- [ ] 如果用户批准补 raw，再开单独 fetch/raw-cache 计划；本计划不抓取。

**验收：**

- Blue/Green/Pink Jellyfish bait 等缺 raw 项只显示“缺精确 raw evidence”，不会被误导入。
- terminal/internal 项不会继续污染“需要外部来源证据”的统计。

---

## Phase 7: Rebuild Closure And UI Smoke

**Files:**

- Regenerate:
  - `data/reports/item-source-remaining-closure-2026-06-12-after-treatment.json`
  - `data/reports/item-source-remaining-closure-summary-zh-2026-06-12-after-treatment.md`

**Steps:**

- [ ] 重新生成 baseline/coverage/remaining closure reports。当前未执行，因为本轮边界禁止 refresh/import/backfill/pipeline/sync 类数据刷新。
- [ ] 对样本 item 做 DB/API/UI 三点验收：
  - Fallen Star：raw candidate -> active source 或候选导入待确认。
  - Magic Mirror：容器/世界生成来源可解释。
  - Iron Pickaxe：recipe 来源可见，不要求 active item source row。
  - Cenx's Wings：NPC relation gap 闭合。
  - Bladed Glove：biome/location 来源可见。
  - Jellyfish bait：缺 raw evidence，不导入。
- [ ] 中文报告输出“还剩多少、每类是什么、为什么剩下”。

**验收：**

- `manualReviewRequired = 0`。
- 不再出现“库里有但报告无法解释”的 item。
- 如果还有剩余，必须只属于：
  - explicit exemption
  - missing required raw evidence
  - blocked by unresolved family policy with named page/rule

---

## Validation Commands

```bash
node --test \
  scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.test.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs \
  scripts/data/audit/build-item-source-gap-coverage-plan.test.mjs \
  scripts/data/audit/build-item-source-remaining-closure-report.test.mjs

rg -n "INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|--apply=true|crawler|fetch|import|backfill|pipeline|sync|materialize" \
  scripts/data/audit/audit-item-source-existing-evidence-layers.mjs \
  docs/superpowers/plans/2026-06-12-item-source-remaining-evidence-closure-treatment.md

git diff --check
git status --short --branch -uall
```

For mutation-capable scripts, validate dry-run mode separately and inspect SQL/rollback before any apply:

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json \
  --output=data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json \
  --allow-bulk=true \
  --apply=false
```

---

## Plan Auditor Review

## Verdict

- Status: execution-ready as a staged treatment plan; Phase 0 must run first because it decides whether later lanes are projection, import, exemption, or missing evidence.
- Main goal: resolve the user's confusion and close remaining item source gaps without duplicating existing DB evidence or fabricating missing source rows.
- Closure definition: every remaining item has a machine-readable evidence layer, a user-readable Chinese explanation, and either active source projection, dedicated structure coverage, explicit exemption, or missing raw evidence task.

## Blocking Plan Defects

- Critical: none.
- Important: any apply/import/fetch/backfill must be split into a later branch with user confirmation; this plan only permits dry-run unless explicitly approved.

## Plan Repairs

- Change: recipe/shimmer and biome lanes are treated as dedicated evidence projection, not normal `item_acquisition_sources` import.
- Reason: these DB layers already encode source semantics and duplicating them would create misleading data.
- Validation added: sample DB/API/UI smoke checks for recipe, biome, NPC, raw candidate, and terminal lanes.

## Execution-Ready Plan

- Scope: evidence-layer audit, lane-specific dry-run plans, API/UI projection checks, Chinese reports.
- Agent split: DB chain, candidate import contract, API/UI projection, safety validation.
- Smoke test: Magic Mirror/Fallen Star/Iron Pickaxe/Cenx's Wings/Bladed Glove/Jellyfish bait.
- Final validation: Node tests, dry-run reports, forbidden mutation scan, closure report rebuild, `git diff --check`.

## Residual Risk

- Risk: some family/shared pages may require new parser policy and cannot be safely auto-imported.
- Follow-up trigger: if Phase 3 leaves unresolved family groups, create a page-group-specific parser plan instead of broad importing all 451 rows.
