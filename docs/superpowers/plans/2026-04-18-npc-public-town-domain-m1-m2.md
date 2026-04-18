# NPC Public + Town Domain M1-M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the public NPC plus Town NPC maintenance domain baseline in docs and code before any backend adaptation.

**Architecture:** First record the actual field inventory that current public and maintenance consumers depend on. Then introduce explicit domain contracts in the frontend and admin code so `NpcBase`, public aggregate, and Town NPC maintenance stop living as hidden `any`-shapes. This batch intentionally stops before backend controller or service adaptation.

**Tech Stack:** Markdown docs, Vue 3 + TypeScript + Vitest, Nuxt 4 + TypeScript typecheck

---

## File Structure

- Create: `docs/research/2026-04-18-npc-public-town-domain-inventory.md`
- Create: `front/src/types/npcDomain.ts`
- Create: `front/src/api/npcDomain.ts`
- Create: `front/src/tests/npc-domain-contract.spec.ts`
- Modify: `front/src/api/index.ts`
- Modify: `front/src/types/index.ts`
- Create: `data-query-app/types/npcDomain.ts`
- Create: `data-query-app/types/npcDomain.typecheck.ts`
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`

### Task 1: Freeze The Domain Inventory

**Files:**
- Create: `docs/research/2026-04-18-npc-public-town-domain-inventory.md`

- [ ] **Step 1: Write the inventory document with one matrix per surface**

Create the document with these sections and table headers:

```md
# NPC Public + Town Domain Inventory

日期：2026-04-18
范围：Public NPC aggregate、Public NPC list/detail、Town NPC maintenance

## Shared Base Candidates

| Field | Current Location | Source | Consumer | Meaning | Layer |
|------|------------------|--------|----------|---------|-------|

## Public Aggregate Fields

| Field | Current Location | Source | Consumer | Meaning | Layer |
|------|------------------|--------|----------|---------|-------|

## Town Maintenance Fields

| Field | Current Location | Source | Consumer | Meaning | Layer |
|------|------------------|--------|----------|---------|-------|
```

- [ ] **Step 2: Fill the matrix with the currently consumed NPC fields**

Record at least these rows:

```md
| id | back dto / front types / town rows | DB / API | public + admin | internal DB id | base |
| gameId | dto / front types / town rows | DB / API | public + admin | Terraria source id | base |
| internalName | dto / front types / town rows | DB / API | public + admin | internal English identifier | base |
| name | dto / front types / town rows | DB / API | public + admin | display English name | base |
| nameZh | dto / front types / town rows | DB / API | public + admin | display Chinese name | base |
| subName | dto / front types | DB / API | public | public subtitle | base |
| subNameZh | dto / front types | DB / API | public | public subtitle zh | base |
| categoryId | dto / front types | DB / API | public | public classification id | base |
| categoryName | dto / front types / town rows | DB / API | public + admin | classification label | base |
| isBoss | dto / front types | DB / API | public | public badge and filtering | base |
| isFriendly | dto / front types | DB / API | public | public badge and fallback mark | base |
| isTownNpc | dto / front types / town rows | DB / API | public + admin | town classification | base |
| imageUrl | dto / front types / town rows | DB / generated map | public + admin | shared primary portrait image | base |
| behaviorNotes | dto / town rows | DB / API | public + admin | long-form npc notes | base |
| status | dto | DB / API | public | publish state | base |
| loot | aggregate dto / front aggregate | API | public | npc drop list | public |
| shopEntries | aggregate dto / front aggregate | API | public | public shop list | public |
| buffRelations | aggregate dto / front aggregate | API | public | buff relation list | public |
| moduleStatus | aggregate dto / front aggregate | service | public | aggregate module state | public |
| aggregatedAt | aggregate dto / front aggregate | service | public | aggregate timestamp | public |
| hasBehaviorNotes | town rows | derived | admin | maintenance coverage flag | maintenance |
| hasShopEntries | town rows | derived | admin | maintenance coverage flag | maintenance |
| gamePeriodId | town rows | DB | admin | progression slot | maintenance |
| gamePeriodLabel | town rows | derived | admin | readable progression label | maintenance |
| behaviorNotesPreview | town rows | derived | admin | short note preview | maintenance |
| scrapedFunctionSummary | town rows | report | admin | scraped summary text | maintenance |
| baseStats | town rows | DB / derived | admin | structured core stats | maintenance |
| wikiDetails | town rows | report | admin | scraped wiki detail block | maintenance |
| scrapedMoveInConditions | town rows | report | admin | move-in condition list | maintenance |
| currentShopItems | town rows | DB | admin | persisted shop items | maintenance |
| unmatchedShopItems | town rows | report + matching | admin | unresolved scraped shop items | maintenance |
| matchedSuggestedShopEntryCount | town rows | derived | admin | shop reconciliation coverage | maintenance |
```

- [ ] **Step 3: Verify the document has no missing critical surfaces**

Run:

```powershell
rg -n "NpcAggregateData|NpcListItem|TownNpcRow|currentShopItems|unmatchedShopItems|baseStats|wikiDetails|behaviorNotes" `
  G:\ClaudeCode\TerraPedia-dev\front\src `
  G:\ClaudeCode\TerraPedia-dev\data-query-app `
  G:\ClaudeCode\TerraPedia-dev\back\src\main\java\com\terraria\skills
```

Expected:

- every field from the output that is actively consumed is represented in the inventory doc

- [ ] **Step 4: Commit**

```bash
git add docs/research/2026-04-18-npc-public-town-domain-inventory.md
git commit -m "docs: add NPC public and town domain inventory"
```

### Task 2: Introduce Public NPC Domain Contracts In Frontend

**Files:**
- Create: `front/src/types/npcDomain.ts`
- Create: `front/src/api/npcDomain.ts`
- Create: `front/src/tests/npc-domain-contract.spec.ts`
- Modify: `front/src/api/index.ts`
- Modify: `front/src/types/index.ts`

- [ ] **Step 1: Write the failing test**

Create `front/src/tests/npc-domain-contract.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  normalizeNpcBase,
  normalizeNpcShopEntry,
  normalizeNpcPublicAggregate,
} from '@/api/npcDomain'

describe('npc domain contracts', () => {
  it('normalizes shared NPC base fields into one contract', () => {
    const result = normalizeNpcBase({
      id: '7',
      game_id: 22,
      internal_name: 'Guide',
      name_zh: '向导',
      is_town_npc: true,
      image_url: '/img/guide.png',
    } as any)

    expect(result).toMatchObject({
      id: 7,
      gameId: 22,
      internalName: 'Guide',
      nameZh: '向导',
      isTownNpc: true,
      imageUrl: '/img/guide.png',
    })
  })

  it('normalizes public NPC shop entry conditions', () => {
    const result = normalizeNpcShopEntry({
      item_id: 5,
      item_name_zh: '火箭靴',
      price_text: '5 gold',
      conditions: [
        { ref_type: 'WORLD_CONTEXT', ref_id: 3, condition_role: 'unlock', label: 'Goblin Army' },
      ],
    } as any)

    expect(result.conditions?.[0]).toMatchObject({
      refType: 'WORLD_CONTEXT',
      refId: 3,
      conditionRole: 'unlock',
      label: 'Goblin Army',
    })
  })

  it('normalizes the aggregate payload through the frozen public domain shape', () => {
    const result = normalizeNpcPublicAggregate({
      npc: { id: 1, name: 'Guide', name_zh: '向导', is_town_npc: true },
      loot: [],
      shopEntries: [{ item_id: 5, item_name: 'Rocket Boots', price_text: '5 gold', conditions: [] }],
      buffRelations: [],
      moduleStatus: { shop: 'ok' },
      aggregatedAt: '2026-04-18T12:00:00',
    } as any)

    expect(result.npc.nameZh).toBe('向导')
    expect(result.shopEntries[0].priceText).toBe('5 gold')
    expect(result.moduleStatus.shop).toBe('ok')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
pnpm --dir G:\ClaudeCode\TerraPedia-dev\front test:unit -- src/tests/npc-domain-contract.spec.ts
```

Expected:

- FAIL because `@/api/npcDomain` does not exist yet

- [ ] **Step 3: Implement the frontend domain types**

Create `front/src/types/npcDomain.ts`:

```ts
export interface NpcBaseDomain {
  id: number
  gameId?: number | null
  internalName?: string | null
  name: string
  nameZh?: string | null
  subName?: string | null
  subNameZh?: string | null
  categoryId?: number | null
  categoryName?: string | null
  isBoss?: boolean
  isFriendly?: boolean
  isTownNpc?: boolean
  imageUrl?: string | null
  behaviorNotes?: string | null
  status?: number | null
}

export interface NpcShopConditionDomain {
  refType?: string | null
  refId?: number | null
  conditionRole?: string | null
  label?: string | null
  notes?: string | null
}

export interface NpcLootEntryDomain {
  id?: number | null
  itemId?: number | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  imageUrl?: string | null
  quantityText?: string | null
  quantityMin?: number | null
  quantityMax?: number | null
  chanceText?: string | null
  chanceValue?: number | null
  conditions?: string | null
  notes?: string | null
}

export interface NpcShopEntryDomain {
  id?: number | null
  itemId?: number | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  imageUrl?: string | null
  priceText?: string | null
  buyPriceText?: string | null
  currencyText?: string | null
  conditions?: NpcShopConditionDomain[] | null
  notes?: string | null
}

export interface NpcBuffRelationDomain {
  id?: number | null
  buffId?: number | null
  relationType?: string | null
  buffName?: string | null
  buffNameZh?: string | null
  buffInternalName?: string | null
  buffImage?: string | null
  imageUrl?: string | null
  sourceText?: string | null
  durationText?: string | null
  durationSeconds?: number | null
  chanceText?: string | null
  chanceValue?: number | null
  conditions?: string | null
  notes?: string | null
}

export interface NpcPublicAggregateDomain {
  npc: NpcBaseDomain
  loot: NpcLootEntryDomain[]
  shopEntries: NpcShopEntryDomain[]
  buffRelations: NpcBuffRelationDomain[]
  moduleStatus: Record<string, string>
  aggregatedAt?: string
}
```

- [ ] **Step 4: Implement the frontend normalizers**

Create `front/src/api/npcDomain.ts`:

```ts
import type {
  NpcBaseDomain,
  NpcBuffRelationDomain,
  NpcLootEntryDomain,
  NpcPublicAggregateDomain,
  NpcShopEntryDomain,
} from '@/types/npcDomain'

export const normalizeNpcBase = <T extends Partial<NpcBaseDomain>>(npc: T): T & NpcBaseDomain => ({
  ...npc,
  id: Number(npc.id),
  gameId: npc.gameId ?? (npc as any).game_id ?? null,
  internalName: npc.internalName ?? (npc as any).internal_name ?? null,
  name: npc.name ?? (npc as any).displayName ?? (npc as any).internal_name ?? 'Unknown NPC',
  nameZh: npc.nameZh ?? (npc as any).name_zh ?? null,
  subName: npc.subName ?? (npc as any).sub_name ?? null,
  subNameZh: npc.subNameZh ?? (npc as any).sub_name_zh ?? null,
  categoryId: npc.categoryId ?? (npc as any).category_id ?? null,
  categoryName: npc.categoryName ?? (npc as any).category_name ?? null,
  isBoss: npc.isBoss ?? (npc as any).is_boss ?? false,
  isFriendly: npc.isFriendly ?? (npc as any).is_friendly ?? false,
  isTownNpc: npc.isTownNpc ?? (npc as any).is_town_npc ?? false,
  imageUrl: npc.imageUrl ?? (npc as any).image_url ?? null,
  behaviorNotes: (npc as any).behaviorNotes ?? (npc as any).behavior_notes ?? null,
  status: (npc as any).status ?? null,
})

export const normalizeNpcLootEntry = (loot: NpcLootEntryDomain): NpcLootEntryDomain => ({
  ...loot,
  itemId: loot.itemId ?? (loot as any).item_id ?? null,
  itemName: loot.itemName ?? (loot as any).item_name ?? null,
  itemNameZh: loot.itemNameZh ?? (loot as any).item_name_zh ?? null,
  itemInternalName: loot.itemInternalName ?? (loot as any).item_internal_name ?? null,
  itemImage: loot.itemImage ?? (loot as any).item_image ?? null,
  imageUrl: loot.imageUrl ?? (loot as any).image_url ?? loot.itemImage ?? (loot as any).item_image ?? null,
  quantityText: loot.quantityText ?? (loot as any).quantity_text ?? null,
  quantityMin: loot.quantityMin ?? (loot as any).quantity_min ?? null,
  quantityMax: loot.quantityMax ?? (loot as any).quantity_max ?? null,
  chanceText: loot.chanceText ?? (loot as any).chance_text ?? null,
  chanceValue: loot.chanceValue ?? (loot as any).chance_value ?? null,
  conditions: loot.conditions ?? null,
  notes: loot.notes ?? null,
})

export const normalizeNpcShopEntry = (entry: NpcShopEntryDomain): NpcShopEntryDomain => ({
  ...entry,
  itemId: entry.itemId ?? (entry as any).item_id ?? null,
  itemName: entry.itemName ?? (entry as any).item_name ?? null,
  itemNameZh: entry.itemNameZh ?? (entry as any).item_name_zh ?? null,
  itemInternalName: entry.itemInternalName ?? (entry as any).item_internal_name ?? null,
  itemImage: entry.itemImage ?? (entry as any).item_image ?? null,
  imageUrl: entry.imageUrl ?? (entry as any).image_url ?? entry.itemImage ?? (entry as any).item_image ?? null,
  priceText: entry.priceText ?? (entry as any).price_text ?? null,
  buyPriceText: entry.buyPriceText ?? (entry as any).buy_price_text ?? null,
  currencyText: entry.currencyText ?? (entry as any).currency_text ?? null,
  conditions: Array.isArray(entry.conditions)
    ? entry.conditions.map((condition: any) => ({
        ...condition,
        refType: condition?.refType ?? condition?.ref_type ?? null,
        refId: condition?.refId ?? condition?.ref_id ?? null,
        conditionRole: condition?.conditionRole ?? condition?.condition_role ?? null,
        label: condition?.label ?? null,
        notes: condition?.notes ?? null,
      }))
    : entry.conditions ?? null,
  notes: entry.notes ?? null,
})

export const normalizeNpcBuffRelation = (relation: NpcBuffRelationDomain): NpcBuffRelationDomain => ({
  ...relation,
  buffId: relation.buffId ?? (relation as any).buff_id ?? null,
  buffName: relation.buffName ?? (relation as any).buff_name ?? null,
  buffNameZh: relation.buffNameZh ?? (relation as any).buff_name_zh ?? null,
  buffInternalName: relation.buffInternalName ?? (relation as any).buff_internal_name ?? null,
  buffImage: relation.buffImage ?? (relation as any).buff_image ?? null,
  imageUrl: relation.imageUrl ?? (relation as any).image_url ?? relation.buffImage ?? (relation as any).buff_image ?? null,
  sourceText: relation.sourceText ?? (relation as any).source_text ?? null,
  durationText: relation.durationText ?? (relation as any).duration_text ?? null,
  durationSeconds: relation.durationSeconds ?? (relation as any).duration_seconds ?? null,
  chanceText: relation.chanceText ?? (relation as any).chance_text ?? null,
  chanceValue: relation.chanceValue ?? (relation as any).chance_value ?? null,
  conditions: relation.conditions ?? null,
  notes: relation.notes ?? null,
})

export const normalizeNpcPublicAggregate = (payload: NpcPublicAggregateDomain): NpcPublicAggregateDomain => ({
  npc: normalizeNpcBase(payload.npc),
  loot: (payload.loot || []).map(normalizeNpcLootEntry),
  shopEntries: (payload.shopEntries || []).map(normalizeNpcShopEntry),
  buffRelations: (payload.buffRelations || []).map(normalizeNpcBuffRelation),
  moduleStatus: payload.moduleStatus || {},
  aggregatedAt: payload.aggregatedAt,
})
```

- [ ] **Step 5: Wire the frontend to the new contract**

Modify `front/src/types/index.ts` so existing NPC exports come from the new domain file:

```ts
export type {
  NpcBaseDomain as NpcListItem,
  NpcLootEntryDomain as NpcLootEntry,
  NpcShopEntryDomain as NpcShopEntry,
  NpcBuffRelationDomain as NpcBuffRelation,
  NpcPublicAggregateDomain as NpcAggregateData,
} from '@/types/npcDomain'
```

Modify `front/src/api/index.ts` so the NPC normalizers are imported instead of duplicated:

```ts
import {
  normalizeNpcBase as normalizeNpc,
  normalizeNpcBuffRelation,
  normalizeNpcLootEntry,
  normalizeNpcPublicAggregate as normalizeNpcAggregateData,
  normalizeNpcShopEntry,
} from '@/api/npcDomain'
```

Remove the in-file duplicated NPC normalization functions after the import is in place.

- [ ] **Step 6: Run the test to verify it passes**

Run:

```powershell
pnpm --dir G:\ClaudeCode\TerraPedia-dev\front test:unit -- src/tests/npc-domain-contract.spec.ts
pnpm --dir G:\ClaudeCode\TerraPedia-dev\front run check
```

Expected:

- Vitest PASS for `npc-domain-contract.spec.ts`
- `vue-tsc --noEmit` passes

- [ ] **Step 7: Commit**

```bash
git add front/src/types/npcDomain.ts front/src/api/npcDomain.ts front/src/tests/npc-domain-contract.spec.ts front/src/api/index.ts front/src/types/index.ts
git commit -m "feat: add public NPC domain contracts"
```

### Task 3: Introduce Town NPC Maintenance Domain Contracts In Admin App

**Files:**
- Create: `data-query-app/types/npcDomain.ts`
- Create: `data-query-app/types/npcDomain.typecheck.ts`
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`

- [ ] **Step 1: Write the failing typecheck contract**

Create `data-query-app/types/npcDomain.typecheck.ts`:

```ts
import type { TownNpcOverview, TownNpcRow } from '~/types/npcDomain'

const overview: TownNpcOverview = {
  reportFound: true,
  records: [
    {
      id: 1,
      gameId: 22,
      name: 'Guide',
      nameZh: '向导',
      isTownNpc: true,
      hasBehaviorNotes: true,
      hasShopEntries: false,
      baseStats: { lifeMax: 250, damage: 10, defense: 30, knockBackResist: 0 },
      wikiAssets: { spriteImage: '/sprite.png', mapIconImage: '/icon.png', dialogPortraitImage: '/portrait.png' },
    } satisfies TownNpcRow,
  ],
}

void overview
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run:

```powershell
pnpm --dir G:\ClaudeCode\TerraPedia-dev\data-query-app run check
```

Expected:

- FAIL because `~/types/npcDomain` does not exist yet

- [ ] **Step 3: Implement the Town NPC maintenance domain types**

Create `data-query-app/types/npcDomain.ts`:

```ts
export interface NpcBaseDomain {
  id: number
  gameId?: number | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  categoryName?: string | null
  isTownNpc?: boolean
  imageUrl?: string | null
  behaviorNotes?: string | null
  updatedAt?: string | null
  [key: string]: any
}

export interface NpcStatBlock {
  lifeMax?: number | null
  damage?: number | null
  defense?: number | null
  knockBackResist?: number | string | null
  [key: string]: any
}

export interface NpcWikiAssets {
  spriteImage?: string | null
  mapIconImage?: string | null
  dialogPortraitImage?: string | null
}

export interface TownNpcShopItem extends Record<string, any> {
  itemId?: number | null
  name?: string | null
  nameZh?: string | null
  internalName?: string | null
  image?: string | null
  priceText?: string | null
}

export interface TownNpcRow extends NpcBaseDomain {
  gamePeriodId?: number | null
  gamePeriodLabel?: string | null
  shopEntryCount?: number | null
  hasBehaviorNotes?: boolean
  hasShopEntries?: boolean
  behaviorNotesPreview?: string | null
  scrapedFunctionSummary?: string | null
  scrapedMoveInConditions?: Array<Record<string, any>>
  currentShopItems?: TownNpcShopItem[]
  unmatchedShopItems?: TownNpcShopItem[]
  matchedSuggestedShopEntryCount?: number | null
  wikiDetails?: Record<string, any>
  wikiAssets?: NpcWikiAssets
  baseStats?: NpcStatBlock
}

export interface TownNpcOverview {
  reportFound?: boolean
  reportFileName?: string | null
  reportPath?: string | null
  reportUpdatedAt?: string | null
  reportSummary?: Record<string, any>
  reportGeneratedAt?: string | null
  sourceMode?: string | null
  importReportFound?: boolean
  importReportFileName?: string | null
  importReportPath?: string | null
  importReportUpdatedAt?: string | null
  latestImportReport?: Record<string, any>
  coinIcons?: Record<string, string>
  records?: TownNpcRow[]
  summary?: Record<string, any>
}

export interface TownNpcEditorDetail extends Record<string, any> {}
```

- [ ] **Step 4: Replace `Record<string, any>` aliases with explicit domain contracts**

Modify `data-query-app/composables/useTownNpcMaintenance.ts`:

```ts
import { get, put } from '~/composables/useApi'
import type {
  TownNpcEditorDetail,
  TownNpcOverview,
  TownNpcRow,
} from '~/types/npcDomain'

export type RefItem = Record<string, any>
export type PriceToken = { unit: string, amount: number, label: string, icon: string }
export type WikiAssetCard = { key: string, label: string, src: string }
```

Also normalize `wikiAssetCards` to prefer the new `wikiAssets` block before falling back to raw `wikiDetails`:

```ts
export const wikiAssetCards = (row: TownNpcRow | null | undefined): WikiAssetCard[] => {
  if (!row) return []
  const assets = row.wikiAssets || {
    spriteImage: row.wikiDetails?.spriteImage,
    mapIconImage: row.wikiDetails?.mapIconImage,
    dialogPortraitImage: row.wikiDetails?.dialogPortraitImage,
  }
  return [
    { key: 'sprite', label: 'NPC 立绘', src: String(assets.spriteImage || '') },
    { key: 'mapIcon', label: '地图图标', src: String(assets.mapIconImage || '') },
    { key: 'portrait', label: '对话肖像', src: String(assets.dialogPortraitImage || '') },
  ].filter(item => item.src)
}
```

- [ ] **Step 5: Run typecheck to verify it passes**

Run:

```powershell
pnpm --dir G:\ClaudeCode\TerraPedia-dev\data-query-app run check
```

Expected:

- `nuxt typecheck` passes

- [ ] **Step 6: Commit**

```bash
git add data-query-app/types/npcDomain.ts data-query-app/types/npcDomain.typecheck.ts data-query-app/composables/useTownNpcMaintenance.ts
git commit -m "feat: add town NPC maintenance domain contracts"
```

## Self-Review

- Spec coverage:
  - M1 inventory freeze: covered by Task 1
  - M2 unified domain shape for public and maintenance consumers: covered by Task 2 and Task 3
  - M3 backend adaptation: intentionally not included in this batch
  - M4 consumer alignment: partially advanced by Task 2 and Task 3, but full endpoint alignment remains out of scope
- Placeholder scan:
  - no `TODO`, `TBD`, or deferred implementation markers remain
- Type consistency:
  - public side uses `NpcBaseDomain`, `NpcPublicAggregateDomain`, nested loot / shop / buff domains
  - admin side uses `TownNpcOverview`, `TownNpcRow`, `NpcStatBlock`, `NpcWikiAssets`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-npc-public-town-domain-m1-m2.md`. Execution has already been requested, so proceed with inline execution of M1 and M2 in the current feature branch, then stop before M3 backend adaptation.
