# Relation Replace Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `terria_v1_relation` into a maint-backed fact and projection system that can replace `terria_v1_local` as the stable source for business data.

**Architecture:** Keep `maint` as the only upstream fact source, expand `relation` into a full normalized fact layer, then add local-compatible projection tables/views inside `relation`. All final data must carry source trace and auditability, while unresolved content goes to issue/report outputs instead of formal results.

**Tech Stack:** Node.js scripts, MySQL, maint/relation schemas, Markdown/JSON audit reports

---

## File Structure

### Core Planning / Tracking

- Create: `docs/superpowers/specs/2026-04-25-relation-replace-local-design.md`
- Create: `docs/superpowers/specs/2026-04-25-relation-replace-local-questionnaire.md`
- Create: `docs/superpowers/plans/2026-04-25-relation-replace-local-milestones.md`
- Create: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

### Expected Implementation Areas

- Modify: `scripts/data/maint/*.mjs`
- Modify: `scripts/data/relation/*.mjs`
- Create: `scripts/data/relation/projection-*.mjs`
- Create: `reports/relation/*.json`
- Create: `reports/relation/*.md`

---

## Milestone Overview

### M1: Entity Foundation

目标：

- 让 `relation` 具备完整实体域基础
- 建立 items / npcs / projectiles / buffs 的完整可替代表达

交付：

- `relation_buffs`
- items/npcs/projectiles/buffs 主图字段策略
- 中文字段来源链方案
- 业务关键字段缺口报告

验收：

- 每个实体域都有覆盖率报告
- 每个实体域都有字段级缺口清单

### M2: Core Item Relations

目标：

- 完成 recipe / NPC shop / NPC loot / buff / biome 的正式关系化

交付：

- recipe 双表示
- NPC 商店正式关系表
- NPC 掉落正式关系表
- 条件字段规范化策略
- unresolved 规则固化

验收：

- 重点样例证据链齐全
- 可以覆盖“替代材料/替代制作站/NPC 售卖/NPC 掉落环境条件”场景

### M3: Boss / Series / Special Reward Domains

目标：

- 把 boss / npc 系列及相关物品关系纳入 relation

交付：

- boss 奖励分层关系模型
- npc 相关物品 / 系列物品模型
- 只接受显式证据链的建模规则

验收：

- 至少完成一个 boss 系列与一个 npc 系列的贯通样例

### M4: Projection Layer

目标：

- 在 `relation` 内产出 local-compatible projection 层

交付：

- item / npc / projectile / buff projection tables or views
- 字段名兼容 `local`
- 查询口径与差异报告

验收：

- projection 层可以承接现有主要业务查询语义

### M5: Replacement Validation

目标：

- 验证 relation projection 是否足以替代 local

交付：

- local vs relation projection 差异报告
- 切换风险清单
- cutover 建议顺序

验收：

- 明确哪些域可切换
- 明确哪些字段仍阻塞切换

---

## Milestone Details

### Task 1: Lock Entity Coverage Baseline

**Files:**
- Modify: `reports/relation/relation-audit-*.json`
- Create: `reports/relation/entity-coverage-baseline-*.json`
- Create: `reports/relation/entity-coverage-baseline-*.md`

- [ ] Step 1: Freeze current baseline counts for `local`, `maint`, and `relation`
- [ ] Step 2: Record missing domains and field-level coverage gaps
- [ ] Step 3: Save baseline reports with sample evidence rows
- [ ] Step 4: Mark unresolved gaps into the issue log

### Task 2: Build Full Buff Entity Domain

**Files:**
- Modify: `scripts/data/relation/relation-schema.mjs`
- Create: `scripts/data/relation/buff-entity-processor.mjs`
- Create: `scripts/data/relation/buff-entity-processor.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`

- [ ] Step 1: Add `relation_buffs` schema and tests
- [ ] Step 2: Map `maint_buffs` into full buff entity rows
- [ ] Step 3: Sync rows into relation and validate counts
- [ ] Step 4: Write coverage and unresolved report

### Task 3: Backfill Business-Critical Entity Fields

**Files:**
- Modify: `scripts/data/relation/base-entity-processor.mjs`
- Create: `scripts/data/relation/entity-field-audit.mjs`
- Create: `scripts/data/relation/entity-field-audit.test.mjs`

- [ ] Step 1: Define target business-critical fields per entity domain
- [ ] Step 2: Audit reliable upstream sources for each field
- [ ] Step 3: Add only provable fields into relation entities
- [ ] Step 4: Push unresolved field gaps into reports and issue log

### Task 4: Formalize Recipe Dual Representation

**Files:**
- Modify: `scripts/data/relation/recipe-relation-processor.mjs`
- Create: `scripts/data/relation/recipe-expansion-processor.mjs`
- Create: `scripts/data/relation/recipe-expansion-processor.test.mjs`

- [ ] Step 1: Preserve current grouped recipe representation
- [ ] Step 2: Add expanded substitute-material representation
- [ ] Step 3: Ensure both forms share source trace
- [ ] Step 4: Validate with `MechanicalEye` and similar recipes

### Task 5: Upgrade NPC Shop/Loot From Candidate To Formal Relation

**Files:**
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Create: `scripts/data/relation/npc-commerce-audit.mjs`

- [ ] Step 1: Define formal relation tables for NPC shop and loot
- [ ] Step 2: Preserve old candidate trace during migration
- [ ] Step 3: Keep textual conditions plus structured-condition roadmap fields
- [ ] Step 4: Validate with sampled shop and loot evidence chains

### Task 6: Structure Environment Conditions

**Files:**
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Create: `scripts/data/relation/source-condition-normalizer.mjs`
- Create: `scripts/data/relation/source-condition-normalizer.test.mjs`

- [ ] Step 1: Normalize condition text into stable fields where provable
- [ ] Step 2: Split biome/difficulty/event/time/weather/special flags
- [ ] Step 3: Leave unverifiable parts in raw text
- [ ] Step 4: Write unresolved condition parsing report

### Task 7: Add Boss / NPC Series Relation Modeling

**Files:**
- Create: `scripts/data/relation/boss-series-processor.mjs`
- Create: `scripts/data/relation/boss-series-processor.test.mjs`
- Create: `scripts/data/relation/npc-series-processor.mjs`
- Create: `scripts/data/relation/npc-series-processor.test.mjs`

- [ ] Step 1: Define formal relation types for summon/reward/series links
- [ ] Step 2: Only admit evidence-backed relations
- [ ] Step 3: Emit unresolved report for non-provable series guesses
- [ ] Step 4: Validate with sampled boss and npc chains

### Task 8: Build Local-Compatible Projection Layer

**Files:**
- Create: `scripts/data/relation/projection-schema.mjs`
- Create: `scripts/data/relation/projection-sync.mjs`
- Create: `scripts/data/relation/projection-sync.test.mjs`

- [ ] Step 1: Define projection tables/views for item/npc/projectile/buff
- [ ] Step 2: Align field names with `local` where practical
- [ ] Step 3: Keep projection derivation strictly relation-backed
- [ ] Step 4: Generate projection coverage report

### Task 9: Validate Replacement Readiness

**Files:**
- Create: `scripts/data/relation/replacement-readiness-audit.mjs`
- Create: `scripts/data/relation/replacement-readiness-audit.test.mjs`
- Create: `reports/relation/replacement-readiness-*.json`
- Create: `reports/relation/replacement-readiness-*.md`

- [ ] Step 1: Compare projection vs local at row and field level
- [ ] Step 2: Report switchable domains, blocked domains, and blocking fields
- [ ] Step 3: Add evidence samples for each blocked domain
- [ ] Step 4: Append unresolved items into the issue log

---

## Execution Rules

- [ ] Never stop to ask the user during execution
- [ ] Any blocker, ambiguity, or upstream data defect must be written to the issue log
- [ ] Do not use `local` as a fact source
- [ ] Do not write unverifiable results into formal relation/projection tables
- [ ] Every milestone must end with:
  - coverage report
  - sample evidence chain
  - unresolved list

---

## Milestone Success Criteria

- M1 success: relation has full entity bases and business-field gap reports
- M2 success: recipe and NPC commerce/loot are formalized with evidence chains
- M3 success: boss/npc series domains are modeled without unverifiable guessing
- M4 success: local-compatible projection layer exists and is relation-backed
- M5 success: replacement-readiness report clearly states what can and cannot cut over
