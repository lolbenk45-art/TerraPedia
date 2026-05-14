# Town NPC Backend Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已经闭环的 Town NPC rich source / bridge 子集稳定接入后端维护链路和公开聚合链路，让 Town NPC Maintenance 与 Public NPC Aggregate 都消费同一套冻结字段。

**Architecture:** 先冻结 Town NPC backend 可消费字段，再按“维护链路优先、公开聚合其次”的顺序推进。维护链路继续以 `TownNpcMaintenanceDomainMapper + AdminNpcController + data-query-app` 为主，公开链路以 `PublicNpcService + PublicNpcAggregateController + front NPC detail` 为次；两条链路共享同一套 Town NPC source facts，但不直接消费 crawler 原始 JSON 结构。

**Tech Stack:** Spring Boot, MyBatis/JdbcTemplate, Java DTOs, Vue/Nuxt admin app, Vue public frontend, Node-generated crawler outputs, project-plan Markdown

---

## Current State

### What Is Already True

- `feature/npc-domain-m1-m2` 当前头提交：`f0a4eb6`
- Town NPC crawler 子集已闭环：
  - `coverage`：`32/32 resolved`，`32/32 alreadyCrawled`
  - `bridge`：`crawlerNpcTotal=39`，`matched=39`，`unmatchedCrawler=0`
- 相关验收文档已存在：
  - `project-plan/TerraPedia_TownNPC_bridge提升验收_2026-04-19.md`
  - `project-plan/TerraPedia_TownNPC_rich-source修复进展_2026-04-19.md`

### Why The Next Milestone Is M2-C4

Town NPC rich source 的主要缺口已经不再是 crawler 页面解析，而是“这些 source facts 什么时候、以什么字段、先进入哪条业务链路”。

当前后端和前后端消费面的现状是：

- 维护链路已有字段：
  - `behaviorNotes`
  - `gamePeriodId`
  - `shopEntries`
  - `scrapedFunctionSummary`
  - `scrapedMoveInSummary`
  - `scrapedMoveInConditions`
  - `scrapedShopItems`
  - `sourcePageTitle`
  - `sourcePageUrl`
  - `wikiAssets`
- 公开链路已有字段：
  - `npc.behaviorNotes`
  - `loot`
  - `shopEntries`
  - `buffRelations`

这说明下一里程碑不该再扩 crawler，而应该做 **Town NPC backend field freeze + maintenance-first adaptation**。

---

## Milestone Definition

### Milestone Name

`M2-C4: Town NPC Backend Adaptation`

### Success Criteria

要算完成，这一里程碑至少同时满足以下条件：

1. Town NPC Maintenance 不再依赖临时字段解释
2. Town NPC Maintenance 明确区分：
   - 当前维护字段
   - crawler/bridge 建议字段
   - 未匹配/未提升字段
3. Town NPC backend 冻结一套明确可消费字段
4. Public NPC Aggregate 至少消费其中一部分冻结字段
5. Java 精确测试、管理端类型检查、crawler 测试都能通过

### Explicit Non-Goals

- 不处理 Boss backend 适配
- 不处理非 `p0_town` 的 rich source 进入后端
- 不把 `data/wiki-crawler/**` 或 `data/generated/wiki-crawler-npc-bridge/**` 生成产物提交进 git
- 不在这一轮解决 `Town Cat` / `Town Dog` lead summary 噪音问题

---

## Frozen Backend Field Contract

### Maintenance Contract

Town NPC Maintenance 在本轮允许正式消费的字段：

- `identity`
  - `id`
  - `gameId`
  - `internalName`
  - `name`
  - `nameZh`
  - `isTownNpc`
- `maintenance facts`
  - `gamePeriodId`
  - `gamePeriodLabel`
  - `behaviorNotes`
  - `shopEntries`
- `crawler-derived suggestions`
  - `scrapedFunctionSummary`
  - `scrapedMoveInSummary`
  - `scrapedMoveInConditions`
  - `scrapedShopItems`
  - `suggestedGamePeriodId`
  - `suggestedGamePeriodLabel`
  - `suggestedGamePeriodReason`
  - `suggestedBehaviorNotes`
  - `suggestedShopEntries`
  - `matchedSuggestedShopEntryCount`
  - `unmatchedShopItems`
- `source / assets`
  - `sourcePageTitle`
  - `sourcePageUrl`
  - `wikiAssets`
  - `baseStats`

### Public Contract

Public NPC Aggregate 本轮允许开始消费的 Town NPC 字段：

- `npc.behaviorNotes`
- `npc.imageUrl`
- `shopEntries`
- `moduleStatus`

可选增强，但不设为本轮完成前置：

- `npc.sourceSummary`
- `npc.moveInSummary`
- `npc.moveInConditions`
- `npc.wikiAssets`

### Forbidden Contract

本轮禁止后端直接消费以下内容：

- 原始 crawler `revisionText`
- 原始 group-page `groupMembers` 全量结构
- 任何未经字段冻结的 `wikiCrawler.*` 临时嵌套对象

---

## File Map

### Backend

**Modify:**

- `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- `back/src/main/java/com/terraria/skills/service/PublicNpcService.java`
- `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`

**Test:**

- `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`
- `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`
- `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- `back/src/test/java/com/terraria/skills/controller/NpcControllerTest.java`

### Admin App

**Modify:**

- `data-query-app/types/npcDomain.ts`
- `data-query-app/types/npcDomain.typecheck.ts`
- `data-query-app/composables/useTownNpcMaintenance.ts`
- `data-query-app/components/TownNpcWorkbenchModal.vue`
- `data-query-app/pages/entities/town-npcs/index.vue`
- `data-query-app/pages/entities/town-npcs/[id]/index.vue`
- `data-query-app/pages/entities/town-npcs/[id]/edit.vue`

### Public Frontend

**Modify:**

- `front/src/types/npcDomain.ts`
- `front/src/api/npcDomain.ts`
- `front/src/views/NpcDetailView.vue`
- `front/src/views/NpcListView.vue`
- `front/src/views/npcDetailEntry.ts`

---

## Tasks

### Task 1: Freeze Town NPC Maintenance Contract

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- Test: `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`
- Doc: `project-plan/TerraPedia_M2-C4_TownNPC后端适配计划_2026-04-19.md`

- [ ] **Step 1: Write the failing mapper test for the frozen Town NPC field contract**

Add assertions for:

- `scrapedMoveInSummary`
- `scrapedMoveInConditions`
- `scrapedShopItems`
- `suggestedBehaviorNotes`
- `sourcePageTitle`
- `wikiAssets`

Run:

```powershell
cd back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest" test
```

Expected:

- FAIL if current mapper misses any frozen field

- [ ] **Step 2: Update `TownNpcMaintenanceDomainMapper` to project only the frozen fields**

Rules:

- Keep field names stable
- Avoid exposing raw crawler nested structures
- Convert source maps/lists into current DTO-safe shapes only

- [ ] **Step 3: Re-run the mapper test**

Run:

```powershell
cd back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest" test
```

Expected:

- PASS

- [ ] **Step 4: Commit the mapper contract freeze**

Run:

```powershell
git add back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java
git commit -m "test: freeze town npc maintenance contract"
```

### Task 2: Wire Maintenance Endpoint To Frozen Fields

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`

- [ ] **Step 1: Write the failing controller test for Town NPC maintenance payload shape**

Cover:

- detail payload includes frozen maintenance fields
- edit payload round-trips `gamePeriodId`
- edit payload round-trips `behaviorNotes`
- edit payload round-trips `shopEntries`

Run:

```powershell
cd back
mvn "-Dtest=AdminNpcControllerTest" test
```

Expected:

- FAIL on missing payload contract

- [ ] **Step 2: Make `AdminNpcController` emit the frozen maintenance payload**

Rules:

- Keep existing routes
- Prefer stable JSON field names already consumed by `data-query-app`
- Do not inject raw `wikiCrawler` object

- [ ] **Step 3: Re-run the controller test**

Run:

```powershell
cd back
mvn "-Dtest=AdminNpcControllerTest" test
```

Expected:

- PASS

- [ ] **Step 4: Commit the maintenance endpoint alignment**

Run:

```powershell
git add back/src/main/java/com/terraria/skills/controller/AdminNpcController.java back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java
git commit -m "feat: align town npc maintenance payload"
```

### Task 3: Align Admin App With Frozen Contract

**Files:**

- Modify: `data-query-app/types/npcDomain.ts`
- Modify: `data-query-app/types/npcDomain.typecheck.ts`
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`
- Modify: `data-query-app/components/TownNpcWorkbenchModal.vue`
- Modify: `data-query-app/pages/entities/town-npcs/index.vue`
- Modify: `data-query-app/pages/entities/town-npcs/[id]/index.vue`
- Modify: `data-query-app/pages/entities/town-npcs/[id]/edit.vue`

- [ ] **Step 1: Write the failing admin typecheck expectations**

Cover:

- maintenance detail uses frozen field names
- overview/detail/edit pages do not depend on ad-hoc keys

Run:

```powershell
cd data-query-app
pnpm run check
```

Expected:

- FAIL on outdated or implicit field access

- [ ] **Step 2: Update admin types and composables**

Rules:

- `TownNpcRow` reflects the frozen contract
- composables normalize nullable arrays/maps consistently

- [ ] **Step 3: Update overview/detail/edit pages**

Focus:

- use `behaviorNotes || scrapedFunctionSummary` only as a deliberate fallback
- keep `sourcePageTitle`, `sourcePageUrl`, `wikiAssets`, `scrapedMoveInConditions`, `suggestedShopEntries` visible

- [ ] **Step 4: Re-run admin typecheck**

Run:

```powershell
cd data-query-app
pnpm run check
```

Expected:

- PASS

- [ ] **Step 5: Commit the admin alignment**

Run:

```powershell
git add data-query-app/types/npcDomain.ts data-query-app/types/npcDomain.typecheck.ts data-query-app/composables/useTownNpcMaintenance.ts data-query-app/components/TownNpcWorkbenchModal.vue data-query-app/pages/entities/town-npcs/index.vue data-query-app/pages/entities/town-npcs/[id]/index.vue data-query-app/pages/entities/town-npcs/[id]/edit.vue
git commit -m "feat: align town npc admin maintenance flow"
```

### Task 4: Add Minimal Public NPC Aggregate Support For Town NPC Facts

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/PublicNpcService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- Optional verify: `back/src/test/java/com/terraria/skills/controller/NpcControllerTest.java`

- [ ] **Step 1: Write the failing public aggregate test for Town NPC behavior/shop contract**

Cover:

- `npc.behaviorNotes` preserved
- `shopEntries` still populated
- module status remains stable when arrays are empty

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcAggregateControllerTest,NpcControllerTest" test
```

Expected:

- FAIL if aggregate/base contract drifts

- [ ] **Step 2: Align `PublicNpcServiceImpl` and controller with the frozen public contract**

Rules:

- keep `loot/shop/buffs` module behavior intact
- do not over-expand into raw crawler source fields
- Town NPC enrich enters public aggregate only through stable DTO fields

- [ ] **Step 3: Re-run public aggregate tests**

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcAggregateControllerTest,NpcControllerTest" test
```

Expected:

- PASS

- [ ] **Step 4: Commit public aggregate alignment**

Run:

```powershell
git add back/src/main/java/com/terraria/skills/service/PublicNpcService.java back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java back/src/test/java/com/terraria/skills/controller/NpcControllerTest.java
git commit -m "feat: align public town npc aggregate contract"
```

### Task 5: Align Public Frontend With The Aggregate Contract

**Files:**

- Modify: `front/src/types/npcDomain.ts`
- Modify: `front/src/api/npcDomain.ts`
- Modify: `front/src/views/NpcDetailView.vue`
- Modify: `front/src/views/NpcListView.vue`
- Modify: `front/src/views/npcDetailEntry.ts`

- [ ] **Step 1: Write or update the failing public type/contract tests if they exist**

If no direct frontend tests cover this contract, treat `npm/vitest` absence as a gap and use type-level verification plus manual route verification.

- [ ] **Step 2: Align public types and API normalizers**

Focus:

- `behaviorNotes`
- `shopEntries`
- `buffRelations`
- `loot`
- `moduleStatus`

- [ ] **Step 3: Keep Town NPC detail pages consuming only the frozen aggregate contract**

Do not:

- couple page rendering to crawler-only fields
- duplicate admin-only suggestion logic in public pages

- [ ] **Step 4: Run the strongest available frontend verification**

Run:

```powershell
cd front
pnpm test
```

If no stable test command exists, document that and at minimum verify:

```powershell
cd front
pnpm build
```

Expected:

- PASS, or explicit documented gap if the repo lacks a working frontend test/build command

- [ ] **Step 5: Commit the public frontend alignment**

Run:

```powershell
git add front/src/types/npcDomain.ts front/src/api/npcDomain.ts front/src/views/NpcDetailView.vue front/src/views/NpcListView.vue front/src/views/npcDetailEntry.ts
git commit -m "feat: align public town npc aggregate consumption"
```

### Task 6: Milestone Verification And Close-Out

**Files:**

- Create: `project-plan/TerraPedia_M2-C4_执行结果_2026-04-19.md`

- [ ] **Step 1: Run combined backend verification**

Run:

```powershell
cd back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest,AdminNpcControllerTest,PublicNpcAggregateControllerTest,NpcControllerTest" test
```

Expected:

- PASS

- [ ] **Step 2: Run crawler regression verification**

Run:

```powershell
node --test data/wiki-crawler/tests/*.test.mjs
```

Expected:

- PASS

- [ ] **Step 3: Run admin verification**

Run:

```powershell
cd data-query-app
pnpm run check
```

Expected:

- PASS

- [ ] **Step 4: Record milestone result**

Document:

- what fields were frozen
- what maintenance/public payloads changed
- what still remains risky
- whether refresh/restart/rerun is required

- [ ] **Step 5: Commit the milestone close-out**

Run:

```powershell
git add project-plan/TerraPedia_M2-C4_执行结果_2026-04-19.md
git commit -m "docs: record m2-c4 town npc backend adaptation results"
```

---

## Risk Register

### Risk 1: Summary Quality vs. Contract Stability

`Town Cat` / `Town Dog` 的 lead summary 当前包含 breed table 噪音。这个问题不应在 M2-C4 扩散到后端字段设计里；保持它是 source-quality issue，而不是 backend contract issue。

### Risk 2: Admin/Public Contract Drift

当前管理端和公开端使用的是两套不同的 NPC domain types。M2-C4 必须让它们在 Town NPC 共用字段上对齐，但不要为了“统一”把 admin 专用建议字段带进 public contract。

### Risk 3: Generated Output Noise

本地 `data/wiki-crawler/**`、`data/generated/wiki-crawler-npc-bridge/**` 依然只作验证证据，不应顺手进入本轮 git 提交。

---

## Recommended Execution Order

1. `Task 1` 冻结 mapper 字段契约
2. `Task 2` 对齐 maintenance endpoint
3. `Task 3` 对齐 admin app
4. `Task 4` 对齐 public aggregate backend
5. `Task 5` 对齐 public frontend
6. `Task 6` 做里程碑总验收
