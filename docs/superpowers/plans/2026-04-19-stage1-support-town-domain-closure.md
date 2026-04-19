# Stage 1 Support + Town NPC Domain Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the first stage of the confirmed milestone plan by freezing shared support domains and making Town NPC source/maintenance closure measurable and explicit.

**Architecture:** Stage 1 is limited to `M1 + M2 + M3` from the approved milestone plan. First freeze `Categories / Taxonomy` and `Game Periods / World Contexts` as explicit support-domain contracts in docs. Then add a repeatable Town NPC source-domain audit over `wiki-town-npc-maintenance.latest.json`. Finally expose maintenance-closure status explicitly through backend DTOs and admin types so the current Town NPC maintenance UI stops relying only on ad hoc interpretation of summary numbers.

**Tech Stack:** Markdown docs, Node.js ESM + built-in `node:test`, Spring Boot 3 + JUnit 5, Nuxt 4 typecheck

---

## File Structure

- Create: `docs/research/2026-04-19-support-domain-baseline.md`
- Create: `scripts/data/audit/audit-town-npc-domain-readiness.mjs`
- Create: `scripts/data/audit/audit-town-npc-domain-readiness.test.mjs`
- Create: `back/src/main/java/com/terraria/skills/dto/TownNpcDomainStatusDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/TownNpcOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java`
- Modify: `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`
- Modify: `data-query-app/types/npcDomain.ts`
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`
- Modify: `data-query-app/pages/entities/town-npcs/index.vue`

### Task 1: Freeze Support-Domain Baseline

**Files:**
- Create: `docs/research/2026-04-19-support-domain-baseline.md`

- [ ] **Step 1: Write the support-domain baseline document**

Create the file with these sections:

```md
# Support Domain Baseline

日期：2026-04-19
范围：Categories / Taxonomy、Game Periods、World Contexts

## Categories / Taxonomy

| Field | Canonical Name | Current Source | Current Consumers | Rule |
|------|----------------|----------------|-------------------|------|

## Game Periods

| Field | Canonical Name | Current Source | Current Consumers | Rule |
|------|----------------|----------------|-------------------|------|

## World Contexts

| Field | Canonical Name | Current Source | Current Consumers | Rule |
|------|----------------|----------------|-------------------|------|

## Shared Rules

- categories are explicit support domains, not implicit UI-only metadata
- game periods are required support values for Town NPC and recipe progression
- world contexts are required support values for recipe conditions, shop conditions, and shimmer context
```

- [ ] **Step 2: Fill the baseline with concrete current rules**

Add at least these entries:

```md
| category.id | `categoryId` | DB `category` table | items, npcs, admin filters | numeric foreign key only |
| category.code | `categoryCode` | DB `category.code` / wiki item category fetch | backfill + admin | code is taxonomy anchor, not display label |
| category.name | `categoryName` | DB `category.name` | public/admin display | display only, not canonical code |
| npcs.game_period_id | `gamePeriodId` | DB `npcs.game_period_id` | Town NPC maintenance | progression anchor for maintenance |
| derived game period label | `gamePeriodLabel` | backend formatter | admin UI | display-only field derived from canonical id |
| world_contexts.id | `worldContextId` | DB `world_contexts` | recipe conditions, shimmer, npc shop conditions | numeric reference key |
| world_contexts.code | `worldContextCode` | DB `world_contexts.code` | admin + integration | canonical context identity |
| world_contexts.name_en/name_zh | `worldContextNameEn` / `worldContextNameZh` | DB | admin display | display fields only |
```

- [ ] **Step 3: Verify the baseline references real code paths**

Run:

```powershell
rg -n "categoryId|categoryCode|gamePeriodId|world_contexts|WorldContext|contextType" `
  G:\ClaudeCode\TerraPedia-dev\back `
  G:\ClaudeCode\TerraPedia-dev\data-query-app `
  G:\ClaudeCode\TerraPedia-dev\scripts\data
```

Expected:

- every canonical field named in the document maps to at least one real source or consumer file

- [ ] **Step 4: Commit**

```bash
git add docs/research/2026-04-19-support-domain-baseline.md
git commit -m "docs: add support domain baseline"
```

### Task 2: Add Repeatable Town NPC Domain Audit

**Files:**
- Create: `scripts/data/audit/audit-town-npc-domain-readiness.test.mjs`
- Create: `scripts/data/audit/audit-town-npc-domain-readiness.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/data/audit/audit-town-npc-domain-readiness.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTownNpcDomainAudit } from './audit-town-npc-domain-readiness.mjs';

test('buildTownNpcDomainAudit summarizes support and source gaps', () => {
  const audit = buildTownNpcDomainAudit({
    records: [
      {
        gameId: 22,
        pageTitle: '向导',
        suggestedGamePeriodId: 1,
        functionSummary: 'Provides advice.',
        shopItems: [{ nameEn: 'Torch', priceText: '50 CC' }],
        wikiDetails: {
          spriteImage: '/sprite.png',
          mapIconImage: '/map.png',
          dialogPortraitImage: '/portrait.png',
        },
      },
      {
        gameId: 17,
        pageTitle: '商人',
        suggestedGamePeriodId: null,
        functionSummary: '',
        shopItems: [],
        wikiDetails: {},
      },
    ],
  });

  assert.deepEqual(audit.summary, {
    totalRecords: 2,
    missingGamePeriodCount: 1,
    missingBehaviorSummaryCount: 1,
    missingShopSourceCount: 1,
    missingWikiAssetCount: 1,
    readyRecords: 1,
  });
  assert.equal(audit.issues.length, 1);
  assert.equal(audit.issues[0].pageTitle, '商人');
  assert.deepEqual(audit.issues[0].missingKeys, [
    'gamePeriod',
    'behaviorSummary',
    'shopSource',
    'wikiAssets',
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test G:\ClaudeCode\TerraPedia-dev\scripts\data\audit\audit-town-npc-domain-readiness.test.mjs
```

Expected:

- FAIL because `audit-town-npc-domain-readiness.mjs` does not exist

- [ ] **Step 3: Implement the audit module**

Create `scripts/data/audit/audit-town-npc-domain-readiness.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export function buildTownNpcDomainAudit(payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const issues = [];

  let missingGamePeriodCount = 0;
  let missingBehaviorSummaryCount = 0;
  let missingShopSourceCount = 0;
  let missingWikiAssetCount = 0;

  for (const record of records) {
    const missingKeys = [];
    const hasGamePeriod = Number(record?.suggestedGamePeriodId || 0) > 0;
    const hasBehaviorSummary = Boolean(String(record?.functionSummary || '').trim());
    const hasShopSource = Array.isArray(record?.shopItems) && record.shopItems.length > 0;
    const details = record?.wikiDetails && typeof record.wikiDetails === 'object' ? record.wikiDetails : {};
    const hasWikiAssets = Boolean(details.spriteImage && details.mapIconImage && details.dialogPortraitImage);

    if (!hasGamePeriod) {
      missingGamePeriodCount += 1;
      missingKeys.push('gamePeriod');
    }
    if (!hasBehaviorSummary) {
      missingBehaviorSummaryCount += 1;
      missingKeys.push('behaviorSummary');
    }
    if (!hasShopSource) {
      missingShopSourceCount += 1;
      missingKeys.push('shopSource');
    }
    if (!hasWikiAssets) {
      missingWikiAssetCount += 1;
      missingKeys.push('wikiAssets');
    }

    if (missingKeys.length > 0) {
      issues.push({
        gameId: Number(record?.gameId || 0) || null,
        pageTitle: record?.pageTitle || null,
        missingKeys,
      });
    }
  }

  return {
    summary: {
      totalRecords: records.length,
      missingGamePeriodCount,
      missingBehaviorSummaryCount,
      missingShopSourceCount,
      missingWikiAssetCount,
      readyRecords: records.length - issues.length,
    },
    issues,
  };
}

if (process.argv[1] === __filename) {
  const inputPath = path.resolve(process.argv[2] || path.join(repoRoot, 'data', 'generated', 'wiki-town-npc-maintenance.latest.json'));
  const outputPath = path.resolve(process.argv[3] || path.join(repoRoot, 'reports', 'wiki-town-npc-domain-audit.latest.json'));
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const audit = buildTownNpcDomainAudit(payload);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ outputPath, summary: audit.summary }, null, 2));
}
```

- [ ] **Step 4: Run the test and the real audit**

Run:

```powershell
node --test G:\ClaudeCode\TerraPedia-dev\scripts\data\audit\audit-town-npc-domain-readiness.test.mjs
node G:\ClaudeCode\TerraPedia-dev\scripts\data\audit\audit-town-npc-domain-readiness.mjs
```

Expected:

- the unit test passes
- `reports/wiki-town-npc-domain-audit.latest.json` is generated

- [ ] **Step 5: Commit**

```bash
git add scripts/data/audit/audit-town-npc-domain-readiness.mjs scripts/data/audit/audit-town-npc-domain-readiness.test.mjs reports/wiki-town-npc-domain-audit.latest.json
git commit -m "feat: add town NPC domain readiness audit"
```

### Task 3: Expose Explicit Maintenance Domain Status In Backend

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`
- Create: `back/src/main/java/com/terraria/skills/dto/TownNpcDomainStatusDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/TownNpcOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java`

- [ ] **Step 1: Write the failing mapper test**

Append to `TownNpcMaintenanceDomainMapperTest.java`:

```java
@Test
void shouldBuildExplicitDomainStatusSummaryForTownNpcOverview() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", 1L);
    row.put("gameId", 17L);
    row.put("name", "Merchant");
    row.put("hasBehaviorNotes", false);
    row.put("hasShopEntries", true);
    row.put("gamePeriodId", null);
    row.put("matchedSuggestedShopEntryCount", 0);

    TownNpcOverviewDTO overview = TownNpcMaintenanceDomainMapper.toOverview(
        true,
        "wiki-town-npc-maintenance.latest.json",
        "data/generated/wiki-town-npc-maintenance.latest.json",
        "2026-04-19T10:00:00Z",
        Map.of(),
        "2026-04-19T09:55:00Z",
        "wiki",
        true,
        "wiki-town-npc-import.latest.json",
        "data/generated/wiki-town-npc-import.latest.json",
        "2026-04-19T10:05:00Z",
        Map.of(),
        Map.of(),
        List.of(row),
        Map.of("totalTownNpcs", 1)
    );

    assertEquals(4, overview.getDomainStatus().size());
    assertEquals("gap", overview.getDomainStatus().get(0).getStatus());
    assertEquals("gamePeriod", overview.getDomainStatus().get(0).getKey());
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd G:\ClaudeCode\TerraPedia-dev\back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest#shouldBuildExplicitDomainStatusSummaryForTownNpcOverview" test
```

Expected:

- FAIL because `TownNpcOverviewDTO` has no `domainStatus`

- [ ] **Step 3: Implement the explicit domain status DTO and mapping**

Create `TownNpcDomainStatusDTO.java`:

```java
package com.terraria.skills.dto;

import lombok.Data;

@Data
public class TownNpcDomainStatusDTO {
    private String key;
    private String status;
    private Integer totalCount;
    private Integer gapCount;
    private String note;
}
```

Modify `TownNpcOverviewDTO.java`:

```java
private List<TownNpcDomainStatusDTO> domainStatus = new ArrayList<>();
```

Modify `TownNpcMaintenanceDomainMapper.java` inside `toOverview(...)`:

```java
dto.setDomainStatus(buildDomainStatus(dto.getRecords()));
```

Add this helper:

```java
private static List<TownNpcDomainStatusDTO> buildDomainStatus(List<TownNpcRowDTO> rows) {
    int total = rows == null ? 0 : rows.size();
    int missingGamePeriod = (int) rows.stream().filter(row -> row.getGamePeriodId() == null || row.getGamePeriodId() == 0).count();
    int missingBehavior = (int) rows.stream().filter(row -> !Boolean.TRUE.equals(row.getHasBehaviorNotes())).count();
    int missingShop = (int) rows.stream().filter(row -> !Boolean.TRUE.equals(row.getHasShopEntries())).count();
    int unmatchedSource = (int) rows.stream().filter(row -> (row.getMatchedSuggestedShopEntryCount() == null ? 0 : row.getMatchedSuggestedShopEntryCount()) <= 0).count();

    return List.of(
        buildStatus("gamePeriod", total, missingGamePeriod, "阶段缺口"),
        buildStatus("behaviorNotes", total, missingBehavior, "说明文案缺口"),
        buildStatus("shopEntries", total, missingShop, "现有售卖关系缺口"),
        buildStatus("sourceMatch", total, unmatchedSource, "抓取售卖映射缺口")
    );
}

private static TownNpcDomainStatusDTO buildStatus(String key, int total, int gapCount, String note) {
    TownNpcDomainStatusDTO dto = new TownNpcDomainStatusDTO();
    dto.setKey(key);
    dto.setStatus(gapCount == 0 ? "ok" : gapCount == total ? "empty" : "gap");
    dto.setTotalCount(total);
    dto.setGapCount(gapCount);
    dto.setNote(note);
    return dto;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
cd G:\ClaudeCode\TerraPedia-dev\back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest" test
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add back/src/main/java/com/terraria/skills/dto/TownNpcDomainStatusDTO.java back/src/main/java/com/terraria/skills/dto/TownNpcOverviewDTO.java back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java
git commit -m "feat: add town NPC maintenance domain status"
```

### Task 4: Surface Domain Status In Admin Types And UI

**Files:**
- Modify: `data-query-app/types/npcDomain.ts`
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`
- Modify: `data-query-app/pages/entities/town-npcs/index.vue`

- [ ] **Step 1: Write the failing typecheck expectation**

Append to `data-query-app/types/npcDomain.typecheck.ts`:

```ts
overview.domainStatus = [
  {
    key: 'gamePeriod',
    status: 'gap',
    totalCount: 39,
    gapCount: 5,
    note: '阶段缺口',
  },
]
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run:

```powershell
pnpm --dir G:\ClaudeCode\TerraPedia-dev\data-query-app run check
```

Expected:

- FAIL because `domainStatus` is not declared in `TownNpcOverview`

- [ ] **Step 3: Add the admin-side type and minimal UI wiring**

Modify `data-query-app/types/npcDomain.ts`:

```ts
export interface TownNpcDomainStatus {
  key: string
  status: 'ok' | 'gap' | 'empty'
  totalCount: number
  gapCount: number
  note?: string | null
}

export interface TownNpcOverview {
  // existing fields...
  domainStatus?: TownNpcDomainStatus[]
}
```

Modify `data-query-app/composables/useTownNpcMaintenance.ts`:

```ts
export const domainStatusRows = (overview: TownNpcOverview | null | undefined) =>
  Array.isArray(overview?.domainStatus) ? overview.domainStatus : []
```

Modify `data-query-app/pages/entities/town-npcs/index.vue` imports:

```ts
import {
  // existing imports...
  domainStatusRows,
} from '~/composables/useTownNpcMaintenance'
```

Add a computed:

```ts
const supportDomainStatus = computed(() => domainStatusRows(overview.value))
```

Render it under the summary ribbon:

```vue
<section v-if="supportDomainStatus.length" class="section-card workspace-panel">
  <div class="panel-head">
    <div>
      <h2 class="section-card__title">域闭环状态</h2>
      <p class="section-card__subtitle">显示 Town NPC 维护链当前最主要的支撑域和源域缺口。</p>
    </div>
  </div>
  <div class="summary-ribbon">
    <article v-for="status in supportDomainStatus" :key="status.key" class="metric-card">
      <span>{{ status.key }}</span>
      <strong>{{ status.gapCount }} / {{ status.totalCount }}</strong>
      <small>{{ status.note || status.status }}</small>
    </article>
  </div>
</section>
```

- [ ] **Step 4: Run typecheck to verify it passes**

Run:

```powershell
pnpm --dir G:\ClaudeCode\TerraPedia-dev\data-query-app run check
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add data-query-app/types/npcDomain.ts data-query-app/composables/useTownNpcMaintenance.ts data-query-app/pages/entities/town-npcs/index.vue data-query-app/types/npcDomain.typecheck.ts
git commit -m "feat: surface town NPC domain status in admin UI"
```

## Self-Review

- Spec coverage:
  - `M1` support-domain freeze: covered by Task 1
  - `M2` Town NPC source closure: covered by Task 2
  - `M3` maintenance closure: covered by Task 3 and Task 4
- Placeholder scan:
  - no `TODO`, `TBD`, or missing file paths remain
- Type consistency:
  - support-domain names stay `categoryId/categoryCode/categoryName`, `gamePeriodId/gamePeriodLabel`, `worldContextId/worldContextCode`
  - Town NPC closure status uses one shared `domainStatus` contract across backend and admin

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-stage1-support-town-domain-closure.md`. Because the current branch is already heavily dirty and shared with prior work, the next safe execution step is to create an isolated worktree from the current HEAD and then execute Task 1 through Task 4 there.
