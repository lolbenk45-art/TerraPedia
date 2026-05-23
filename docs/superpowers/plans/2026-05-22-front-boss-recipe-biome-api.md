# Front Boss Recipe Biome API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the public frontend pages for Bosses, Crafting recipes, and Biomes to real backend APIs, replacing static sample content with API data, loading skeletons, empty states, and contract checks.

**Architecture:** Keep the existing public frontend pattern: typed DTOs in `front-nuxt/types/public-api.ts`, API normalization in `front-nuxt/composables/usePublic*.ts`, and page templates that render only normalized data. Add a small backend public alias for biomes so all public-facing pages can call `/public/...` endpoints consistently. Crafting is not a global recipe catalog because no global public recipe list endpoint exists; it is a target-item recipe-tree viewer driven by item search or `?itemId=`.

**Tech Stack:** Nuxt 3, Vue composition API, TypeScript, Spring Boot controllers, existing `usePublicApiFetch`, `CommonPreviewImage`, `CommonTpSkeleton`, and `CommonPaginationDock`.

---

## Task Summary

### User-Visible Closure

- `/bosses` loads real boss rows from `GET /api/public/bosses`.
- `/bosses/34` loads a real boss detail from `GET /api/public/bosses/34`.
- `/biomes` loads real biome rows from `GET /api/public/biomes` after the backend public alias is added.
- `/biomes/1` loads a real biome detail from `GET /api/public/biomes/1`.
- `/crafting?itemId=757` loads a real recipe tree from `GET /api/public/items/757/recipe-tree?maxDepth=3`.
- During loading, pages show skeletons and do not reveal static fallback cards or sample images.
- On API failure, pages show an empty or unavailable state with no fake rows.
- Crafting item search only displays `usePublicItems` suggestions when the item result source is `api`; existing item fallback sample rows must not appear on the crafting page.

### Source Chain

```text
database rows
  -> Spring service/controller DTOs
  -> /api public endpoints
  -> front-nuxt typed composables
  -> normalized view models
  -> Nuxt pages with skeleton/empty/API states
```

### Confirmed Endpoints

- Boss list: `GET /api/public/bosses?page=1&limit=20&search=&bossType=&sortBy=progressionOrder&sortDirection=asc`
- Boss detail: `GET /api/public/bosses/{id}`
- Existing biome list: `GET /api/biomes`
- Existing biome detail: `GET /api/biomes/{id}`
- Planned biome public aliases: `GET /api/public/biomes`, `GET /api/public/biomes/{id}`
- Recipe tree: `GET /api/public/items/{id}/recipe-tree?maxDepth=3`
- Item search for crafting target selection: reuse `GET /api/public/items` through `usePublicItems`.

### Out Of Scope

- No crawler, import, or database writes.
- No new global recipe catalog endpoint in this task.
- No production deploy or remote push.
- No broad visual redesign beyond replacing static placeholder content with API-driven states.

---

## File Ownership For Multi-Agent Execution

- **Boss agent owns:** `front-nuxt/composables/usePublicBosses.ts`, `front-nuxt/composables/usePublicBossDetail.ts`, `front-nuxt/pages/bosses/index.vue`, `front-nuxt/pages/bosses/[id].vue`.
- **Biome agent owns:** `back/src/main/java/com/terraria/skills/controller/PublicBiomeController.java`, `front-nuxt/composables/usePublicBiomes.ts`, `front-nuxt/composables/usePublicBiomeDetail.ts`, `front-nuxt/pages/biomes/index.vue`, `front-nuxt/pages/biomes/[id].vue`.
- **Crafting agent owns:** `front-nuxt/composables/usePublicRecipeTree.ts`, `front-nuxt/pages/crafting/index.vue`.
- **Contract agent owns:** `front-nuxt/scripts/check-public-pages.mjs`.
- **Integration owner owns shared types:** `front-nuxt/types/public-api.ts`.

Do not let two agents edit `front-nuxt/types/public-api.ts`, the same page, or the same service lifecycle at the same time. If a worker discovers a missing backend field or endpoint, stop that worker at a note, repair this plan, re-audit it, and then continue.

---

## Target File Map

- Create `back/src/main/java/com/terraria/skills/controller/PublicBiomeController.java`: public read-only alias around `BiomeService`.
- Modify `front-nuxt/types/public-api.ts`: add Boss, Biome, and public recipe result view-model types.
- Create `front-nuxt/composables/usePublicBosses.ts`: paginated boss list fetcher and normalizer.
- Create `front-nuxt/composables/usePublicBossDetail.ts`: boss detail fetcher with empty missing state.
- Create `front-nuxt/composables/usePublicBiomes.ts`: biome list fetcher and normalizer.
- Create `front-nuxt/composables/usePublicBiomeDetail.ts`: biome detail fetcher with empty missing state.
- Create `front-nuxt/composables/usePublicRecipeTree.ts`: target item recipe-tree fetcher and normalizer.
- Modify `front-nuxt/pages/bosses/index.vue`: replace static timeline cards with API-driven list.
- Modify `front-nuxt/pages/bosses/[id].vue`: replace static detail with real boss detail, members, and loot.
- Modify `front-nuxt/pages/biomes/index.vue`: replace hardcoded biome board with API-driven biome tiles and taxonomy grouping.
- Modify `front-nuxt/pages/biomes/[id].vue`: replace static detail with real biome resources and relations.
- Modify `front-nuxt/pages/crafting/index.vue`: replace static Terra Blade example with item-target search, recipe tree, and skeleton states.
- Modify `front-nuxt/scripts/check-public-pages.mjs`: assert new public data layer and guard against static sample markers.

---

## Task 1: Add Public Biome Backend Alias

**Files:**
- Create: `back/src/main/java/com/terraria/skills/controller/PublicBiomeController.java`
- Test manually with: `curl -s http://localhost:18088/api/public/biomes | head -c 300`

- [ ] **Step 1: Create public biome controller**

Use the existing `BiomeService` and `BiomeDTO`; do not create a second service or duplicate query logic.

```java
package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.BiomeDTO;
import com.terraria.skills.service.BiomeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/public/biomes")
@RequiredArgsConstructor
@Tag(name = "Public Biomes", description = "Public read-only biome APIs")
public class PublicBiomeController {

    private final BiomeService biomeService;

    @GetMapping
    @Operation(summary = "Get public biomes")
    public ResponseEntity<ApiResponse<List<BiomeDTO>>> getPublicBiomes() {
        return ResponseEntity.ok(ApiResponse.success(biomeService.getBiomes()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get public biome by id")
    public ResponseEntity<ApiResponse<BiomeDTO>> getPublicBiomeById(@PathVariable Long id) {
        BiomeDTO biome = biomeService.getBiomeById(id);
        if (biome == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Biome not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(biome));
    }
}
```

- [ ] **Step 2: Compile the backend target surface**

Run:

```bash
cd back
mvn -DskipTests compile
```

Expected: compile success. If it fails because of unrelated local generated files, capture the exact failing class and repair only if it blocks this controller.

- [ ] **Step 3: Smoke the public biome aliases**

Run after backend is running:

```bash
curl -s 'http://localhost:18088/api/public/biomes' | head -c 300
curl -s 'http://localhost:18088/api/public/biomes/1' | head -c 300
```

Expected: responses include `"success":true` and biome data. The detail response for id `1` should include Forest data in the current local database.

- [ ] **Step 4: Commit backend alias checkpoint**

```bash
git status --short
git add back/src/main/java/com/terraria/skills/controller/PublicBiomeController.java
git diff --cached --stat
git commit -m "feat(back): expose public biome read APIs"
```

---

## Task 2: Add Shared Public API Types

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Validation: `pnpm --dir front-nuxt check`

- [ ] **Step 1: Add boss query, DTO, and view-model types**

Append the following type group near the other public catalog types.

```ts
export type PublicBossQuery = {
  page?: number
  limit?: number
  size?: number
  search?: string
  bossType?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export type PublicBossListItem = {
  id?: number | string | null
  code?: string | null
  name?: string | null
  nameZh?: string | null
  nameEn?: string | null
  bossType?: string | null
  imageUrl?: string | null
  progressionOrder?: number | string | null
  summonMethod?: string | null
  notes?: string | null
  memberCount?: number | string | null
  memberNames?: string | null
  memberSourceMode?: string | null
  lootEntryCount?: number | string | null
  uniqueLootItemCount?: number | string | null
}

export type PublicBossMember = {
  id?: number | string | null
  gameId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  bossRole?: string | null
  imageUrl?: string | null
  sourceBossCode?: string | null
}

export type PublicBossLootEntry = {
  id?: number | string | null
  itemId?: number | string | null
  sourceItemId?: number | string | null
  dropSourceKind?: string | null
  quantityMin?: number | string | null
  quantityMax?: number | string | null
  quantityText?: string | null
  chanceValue?: number | string | null
  chanceText?: string | null
  conditions?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
}

export type PublicBossDetail = PublicBossListItem & {
  members?: PublicBossMember[] | null
  referenceMembers?: PublicBossMember[] | null
  lootOwnerNpc?: PublicBossMember | null
  lootEntries?: PublicBossLootEntry[] | null
  directLootCount?: number | string | null
  treasureBagLootCount?: number | string | null
}

export type BossCatalogCard = {
  id: string
  bossId: number | null
  detailPath: string
  code: string
  name: string
  displayName: string
  englishName: string
  type: string
  image: string
  sourceImage: string
  fallback: string
  progressionOrder: number | null
  summonMethod: string
  summary: string
  memberCount: number | null
  lootEntryCount: number | null
  uniqueLootItemCount: number | null
  searchText: string
}

export type PublicBossesResult = {
  items: BossCatalogCard[]
  rawBosses: PublicBossListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}

export type PublicBossDetailResult = {
  detail: PublicBossDetail | null
  item: BossCatalogCard | null
  members: PublicBossMember[]
  referenceMembers: PublicBossMember[]
  lootEntries: PublicBossLootEntry[]
  source: 'api' | 'missing'
}
```

- [ ] **Step 2: Add biome DTO and view-model types**

```ts
export type PublicBiomeResource = {
  id?: number | string | null
  biomeId?: number | string | null
  itemId?: number | string | null
  resourceNameRaw?: string | null
  resourceType?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  itemName?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
}

export type PublicBiomeRelation = {
  id?: number | string | null
  biomeId?: number | string | null
  relatedBiomeId?: number | string | null
  relationType?: string | null
  notes?: string | null
  relatedBiomeCode?: string | null
  relatedBiomeNameEn?: string | null
  relatedBiomeNameZh?: string | null
}

export type PublicBiomeListItem = {
  id?: number | string | null
  code?: string | null
  nameEn?: string | null
  nameZh?: string | null
  aliasEn?: string | null
  aliasZh?: string | null
  layerType?: string | null
  biomeType?: string | null
  wikiGroupCode?: string | null
  wikiGroupNameEn?: string | null
  wikiGroupNameZh?: string | null
  wikiParentGroupCode?: string | null
  wikiParentGroupNameEn?: string | null
  wikiParentGroupNameZh?: string | null
  wikiSectionLevel?: number | string | null
  wikiSortOrder?: number | string | null
  wikiSectionAnchor?: string | null
  description?: string | null
  iconUrl?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sourceRevisionTimestamp?: string | null
  lastSyncedAt?: string | null
  resources?: PublicBiomeResource[] | null
  relations?: PublicBiomeRelation[] | null
}

export type BiomeCatalogTile = {
  id: string
  biomeId: number | null
  detailPath: string
  code: string
  name: string
  displayName: string
  englishName: string
  image: string
  sourceImage: string
  fallback: string
  layerType: string
  biomeType: string
  groupLabel: string
  description: string
  resourceCount: number
  relationCount: number
  searchText: string
}

export type PublicBiomesResult = {
  items: BiomeCatalogTile[]
  rawBiomes: PublicBiomeListItem[]
  source: 'api' | 'fallback'
}

export type PublicBiomeDetailResult = {
  detail: PublicBiomeListItem | null
  item: BiomeCatalogTile | null
  resources: PublicBiomeResource[]
  relations: PublicBiomeRelation[]
  source: 'api' | 'missing'
}
```

- [ ] **Step 3: Tighten recipe tree result type for crafting**

Keep existing `PublicItemRecipeTree*` DTOs. Add a result wrapper so the crafting page can distinguish loading, missing, and API states.

```ts
export type PublicRecipeTreeResult = {
  itemId: string
  tree: PublicItemRecipeTree | null
  source: 'api' | 'missing'
}
```

- [ ] **Step 4: Run frontend typecheck**

Run:

```bash
pnpm --dir front-nuxt check
```

Expected: typecheck success or only unrelated pre-existing failures. If failures mention any new `PublicBoss*`, `PublicBiome*`, or `PublicRecipeTreeResult` type, repair before continuing.

- [ ] **Step 5: Commit type checkpoint**

```bash
git status --short
git add front-nuxt/types/public-api.ts
git diff --cached --stat
git commit -m "feat(front): add boss biome recipe public API types"
```

---

## Task 3: Build Boss Frontend Data Layer

**Files:**
- Create: `front-nuxt/composables/usePublicBosses.ts`
- Create: `front-nuxt/composables/usePublicBossDetail.ts`
- Validation: `pnpm --dir front-nuxt check`

- [ ] **Step 1: Create `usePublicBosses.ts`**

Implement with empty fallback arrays, matching the existing `usePublicProjectiles.ts` pattern.

```ts
import type {
  BossCatalogCard,
  Pagination,
  PublicBossListItem,
  PublicBossQuery,
  PublicBossesResult,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const resolveRequestedPage = (query: PublicBossQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicBossQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 20)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 20
}

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: BossCatalogCard[],
  query: PublicBossQuery,
): Pagination => {
  const page = Number(pagination?.page ?? query.page ?? 1)
  const limit = Number(pagination?.limit ?? pagination?.size ?? query.limit ?? query.size ?? items.length)
  const total = Number(pagination?.total ?? items.length)
  const totalPages = Number(pagination?.totalPages ?? Math.ceil(total / Math.max(1, limit)))

  return {
    total: Number.isFinite(total) ? total : items.length,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length,
    size: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.ceil(totalPages) : 1,
  }
}

export const normalizePublicBoss = (raw: PublicBossListItem, index = 0): BossCatalogCard => {
  const bossId = toNumberOrNull(raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.name) || normalizeText(raw.code) || `Boss ${index + 1}`
  const englishName = normalizeText(raw.nameEn) || normalizeText(raw.name)
  const sourceImage = normalizeText(raw.imageUrl)
  const image = resolvePreviewImageUrl(sourceImage)
  const progressionOrder = toNumberOrNull(raw.progressionOrder)
  const memberCount = toNumberOrNull(raw.memberCount)
  const lootEntryCount = toNumberOrNull(raw.lootEntryCount)
  const uniqueLootItemCount = toNumberOrNull(raw.uniqueLootItemCount)
  const type = normalizeText(raw.bossType) || 'boss'
  const summonMethod = normalizeText(raw.summonMethod)
  const summary = summonMethod || normalizeText(raw.notes) || '召唤方式未标注'
  const id = bossId ? String(bossId) : normalizeText(raw.code) || `${displayName}-${index + 1}`

  return {
    id,
    bossId,
    detailPath: `/bosses/${id}`,
    code: normalizeText(raw.code),
    name: englishName || displayName,
    displayName,
    englishName,
    type,
    image,
    sourceImage,
    fallback: firstGlyph(displayName),
    progressionOrder,
    summonMethod,
    summary,
    memberCount,
    lootEntryCount,
    uniqueLootItemCount,
    searchText: normalizeSearchText([displayName, englishName, raw.code, type, summonMethod].join(' ')),
  }
}

const fallbackBosses: BossCatalogCard[] = []

const fallbackPublicBossesResult = (query: PublicBossQuery = {}): PublicBossesResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)
  return {
    items: [],
    rawBosses: [],
    pagination: { total: fallbackBosses.length, page, limit, size: limit, totalPages: 1 },
    source: 'fallback',
  }
}

export const fetchPublicBosses = async (query: PublicBossQuery = {}): Promise<PublicBossesResult> => {
  try {
    const page = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<PublicBossListItem[]>('/public/bosses', {
      query: {
        page,
        limit,
        search: normalizeText(query.search) || undefined,
        bossType: normalizeText(query.bossType) || undefined,
        sortBy: query.sortBy ?? 'progressionOrder',
        sortDirection: query.sortDirection ?? 'asc',
      },
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public bosses API returned an unsuccessful response')
    }

    const rawBosses = unwrapApiResponse(response)
    if (!Array.isArray(rawBosses)) {
      throw new Error('Public bosses API returned no usable boss data')
    }

    const items = rawBosses.map(normalizePublicBoss)
    return {
      items,
      rawBosses,
      pagination: normalizePagination(response.pagination, items, { ...query, page, limit }),
      source: 'api',
    }
  } catch {
    return fallbackPublicBossesResult(query)
  }
}

export const usePublicBosses = (query: PublicBossQuery | (() => PublicBossQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const value = typeof query === 'function' ? query() : query
    return {
      ...value,
      page: resolveRequestedPage(value),
      limit: resolveRequestedLimit(value),
      search: normalizeText(value.search) || undefined,
      bossType: normalizeText(value.bossType) || undefined,
      sortBy: value.sortBy ?? 'progressionOrder',
      sortDirection: value.sortDirection ?? 'asc',
    } satisfies PublicBossQuery
  })

  return useAsyncData(
    () => `public-bosses-catalog:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicBosses(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackPublicBossesResult(resolvedQuery.value),
    },
  )
}
```

- [ ] **Step 2: Create `usePublicBossDetail.ts`**

```ts
import type {
  BossCatalogCard,
  PublicBossDetail,
  PublicBossDetailResult,
  PublicBossLootEntry,
  PublicBossMember,
} from '~/types/public-api'

const missingPublicBossDetail = (): PublicBossDetailResult => ({
  detail: null,
  item: null,
  members: [],
  referenceMembers: [],
  lootEntries: [],
  source: 'missing',
})

const normalizeBossId = (bossId: string | number) => String(bossId ?? '').trim()

const normalizeMembers = (members: PublicBossMember[] | null | undefined) => Array.isArray(members) ? members : []
const normalizeLootEntries = (entries: PublicBossLootEntry[] | null | undefined) => Array.isArray(entries) ? entries : []

export const fetchPublicBossDetail = async (bossId: string | number): Promise<PublicBossDetailResult> => {
  const normalizedBossId = normalizeBossId(bossId)
  if (!normalizedBossId) {
    return missingPublicBossDetail()
  }

  try {
    const response = await usePublicApiFetch<PublicBossDetail>(`/public/bosses/${normalizedBossId}`)
    if (response.success === false) {
      return missingPublicBossDetail()
    }

    const detail = unwrapApiResponse(response)
    if (!detail) {
      return missingPublicBossDetail()
    }

    return {
      detail,
      item: normalizePublicBoss(detail) as BossCatalogCard,
      members: normalizeMembers(detail.members),
      referenceMembers: normalizeMembers(detail.referenceMembers),
      lootEntries: normalizeLootEntries(detail.lootEntries),
      source: 'api',
    }
  } catch {
    return missingPublicBossDetail()
  }
}

export const usePublicBossDetail = (bossId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-boss-detail-${normalizeBossId(toValue(bossId)) || 'missing'}`,
  () => fetchPublicBossDetail(toValue(bossId)),
  {
    server: false,
    watch: [() => toValue(bossId)],
    default: missingPublicBossDetail,
  },
)
```

- [ ] **Step 3: Run typecheck and commit**

```bash
pnpm --dir front-nuxt check
git status --short
git add front-nuxt/composables/usePublicBosses.ts front-nuxt/composables/usePublicBossDetail.ts
git diff --cached --stat
git commit -m "feat(front): add boss public data composables"
```

---

## Task 4: Connect Boss Pages

**Files:**
- Modify: `front-nuxt/pages/bosses/index.vue`
- Modify: `front-nuxt/pages/bosses/[id].vue`
- Validation: `pnpm --dir front-nuxt check:public-pages`, browser smoke `/bosses` and `/bosses/34`

- [ ] **Step 1: Replace static list data in `pages/bosses/index.vue`**

Use this state shape in `<script setup lang="ts">`:

```ts
const route = useRoute()
const page = computed(() => Number(route.query.page ?? 1) || 1)
const search = computed(() => String(route.query.search ?? '').trim())

const { data: bossData, pending } = await usePublicBosses(() => ({
  page: page.value,
  limit: 20,
  search: search.value || undefined,
  sortBy: 'progressionOrder',
  sortDirection: 'asc',
}))

const bosses = computed(() => bossData.value?.items ?? [])
const pagination = computed(() => bossData.value?.pagination)
const isApiFallback = computed(() => bossData.value?.source === 'fallback')
const showLoading = computed(() => pending.value && bosses.value.length === 0)
const showEmpty = computed(() => !pending.value && bosses.value.length === 0)
```

Render rules:

- When `showLoading`, render 8 boss skeleton nodes with `CommonTpSkeleton`.
- When `bosses.length > 0`, render each boss from API using `CommonPreviewImage`.
- When `showEmpty`, render an API-unavailable or empty result panel.
- Render `CommonPaginationDock` when `pagination.totalPages > 1`.
- Remove static hardcoded cards for 史莱姆王, 克苏鲁之眼, 骷髅王, 血肉墙, and 月亮领主.

- [ ] **Step 2: Replace static detail in `pages/bosses/[id].vue`**

Use this state shape:

```ts
const route = useRoute()
const bossId = computed(() => String(route.params.id ?? '').trim())
const { data: bossBundle, pending } = await usePublicBossDetail(bossId)

const boss = computed(() => bossBundle.value?.detail ?? null)
const bossCard = computed(() => bossBundle.value?.item ?? null)
const members = computed(() => bossBundle.value?.members ?? [])
const referenceMembers = computed(() => bossBundle.value?.referenceMembers ?? [])
const lootEntries = computed(() => bossBundle.value?.lootEntries ?? [])
const showLoading = computed(() => pending.value && !boss.value)
const showMissing = computed(() => !pending.value && !boss.value)
```

Render rules:

- Use `CommonPreviewImage` for boss portrait and member/item images.
- Show `members`, `referenceMembers`, and `lootEntries` only from API arrays.
- Do not hardcode sample loot.
- Show a missing state if the id is not found.

- [ ] **Step 3: Validate boss page contract**

Run:

```bash
pnpm --dir front-nuxt check:public-pages
pnpm --dir front-nuxt check
```

Runtime smoke:

```bash
curl -s 'http://localhost:18088/api/public/bosses?limit=1' | head -c 300
curl -s 'http://localhost:18088/api/public/bosses/34' | head -c 300
```

Expected: API success and Nuxt pages render real boss names without static sample-only content.

- [ ] **Step 4: Commit boss pages**

```bash
git status --short
git add front-nuxt/pages/bosses/index.vue front-nuxt/pages/bosses/[id].vue
git diff --cached --stat
git commit -m "feat(front): connect boss public pages"
```

---

## Task 5: Build Biome Frontend Data Layer

**Files:**
- Create: `front-nuxt/composables/usePublicBiomes.ts`
- Create: `front-nuxt/composables/usePublicBiomeDetail.ts`
- Validation: `pnpm --dir front-nuxt check`

- [ ] **Step 1: Create `usePublicBiomes.ts`**

```ts
import type {
  BiomeCatalogTile,
  PublicBiomeListItem,
  PublicBiomesResult,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export const normalizePublicBiome = (raw: PublicBiomeListItem, index = 0): BiomeCatalogTile => {
  const biomeId = toNumberOrNull(raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.nameEn) || normalizeText(raw.code) || `群系 ${index + 1}`
  const englishName = normalizeText(raw.nameEn)
  const sourceImage = normalizeText(raw.iconUrl)
  const image = resolvePreviewImageUrl(sourceImage)
  const groupLabel = normalizeText(raw.wikiGroupNameZh) || normalizeText(raw.wikiGroupNameEn) || normalizeText(raw.biomeType) || '未分组'
  const description = normalizeText(raw.description) || normalizeText(raw.aliasZh) || normalizeText(raw.aliasEn) || '暂无群系描述'
  const id = biomeId ? String(biomeId) : normalizeText(raw.code) || `${displayName}-${index + 1}`
  const resources = Array.isArray(raw.resources) ? raw.resources : []
  const relations = Array.isArray(raw.relations) ? raw.relations : []

  return {
    id,
    biomeId,
    detailPath: `/biomes/${id}`,
    code: normalizeText(raw.code),
    name: englishName || displayName,
    displayName,
    englishName,
    image,
    sourceImage,
    fallback: firstGlyph(displayName),
    layerType: normalizeText(raw.layerType) || 'unknown',
    biomeType: normalizeText(raw.biomeType) || 'unknown',
    groupLabel,
    description,
    resourceCount: resources.length,
    relationCount: relations.length,
    searchText: normalizeSearchText([displayName, englishName, raw.code, groupLabel, raw.layerType, raw.biomeType].join(' ')),
  }
}

const fallbackPublicBiomesResult = (): PublicBiomesResult => ({
  items: [],
  rawBiomes: [],
  source: 'fallback',
})

export const fetchPublicBiomes = async (): Promise<PublicBiomesResult> => {
  try {
    const response = await usePublicApiFetch<PublicBiomeListItem[]>('/public/biomes')
    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public biomes API returned an unsuccessful response')
    }

    const rawBiomes = unwrapApiResponse(response)
    if (!Array.isArray(rawBiomes)) {
      throw new Error('Public biomes API returned no usable biome data')
    }

    return {
      items: rawBiomes.map(normalizePublicBiome),
      rawBiomes,
      source: 'api',
    }
  } catch {
    return fallbackPublicBiomesResult()
  }
}

export const usePublicBiomes = () => useAsyncData(
  'public-biomes-catalog',
  fetchPublicBiomes,
  {
    server: false,
    default: fallbackPublicBiomesResult,
  },
)
```

- [ ] **Step 2: Create `usePublicBiomeDetail.ts`**

```ts
import type {
  PublicBiomeDetailResult,
  PublicBiomeListItem,
  PublicBiomeRelation,
  PublicBiomeResource,
} from '~/types/public-api'

const missingPublicBiomeDetail = (): PublicBiomeDetailResult => ({
  detail: null,
  item: null,
  resources: [],
  relations: [],
  source: 'missing',
})

const normalizeBiomeId = (biomeId: string | number) => String(biomeId ?? '').trim()
const normalizeResources = (resources: PublicBiomeResource[] | null | undefined) => Array.isArray(resources) ? resources : []
const normalizeRelations = (relations: PublicBiomeRelation[] | null | undefined) => Array.isArray(relations) ? relations : []

export const fetchPublicBiomeDetail = async (biomeId: string | number): Promise<PublicBiomeDetailResult> => {
  const normalizedBiomeId = normalizeBiomeId(biomeId)
  if (!normalizedBiomeId) {
    return missingPublicBiomeDetail()
  }

  try {
    const response = await usePublicApiFetch<PublicBiomeListItem>(`/public/biomes/${normalizedBiomeId}`)
    if (response.success === false) {
      return missingPublicBiomeDetail()
    }

    const detail = unwrapApiResponse(response)
    if (!detail) {
      return missingPublicBiomeDetail()
    }

    return {
      detail,
      item: normalizePublicBiome(detail),
      resources: normalizeResources(detail.resources),
      relations: normalizeRelations(detail.relations),
      source: 'api',
    }
  } catch {
    return missingPublicBiomeDetail()
  }
}

export const usePublicBiomeDetail = (biomeId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-biome-detail-${normalizeBiomeId(toValue(biomeId)) || 'missing'}`,
  () => fetchPublicBiomeDetail(toValue(biomeId)),
  {
    server: false,
    watch: [() => toValue(biomeId)],
    default: missingPublicBiomeDetail,
  },
)
```

- [ ] **Step 3: Run typecheck and commit**

```bash
pnpm --dir front-nuxt check
git status --short
git add front-nuxt/composables/usePublicBiomes.ts front-nuxt/composables/usePublicBiomeDetail.ts
git diff --cached --stat
git commit -m "feat(front): add biome public data composables"
```

---

## Task 6: Connect Biome Pages

**Files:**
- Modify: `front-nuxt/pages/biomes/index.vue`
- Modify: `front-nuxt/pages/biomes/[id].vue`
- Validation: `pnpm --dir front-nuxt check:public-pages`, browser smoke `/biomes` and `/biomes/1`

- [ ] **Step 1: Replace static biome index with API tiles**

Use this state shape:

```ts
const { data: biomeData, pending } = await usePublicBiomes()
const biomes = computed(() => biomeData.value?.items ?? [])
const groups = computed(() => {
  const result = new Map<string, typeof biomes.value>()
  for (const biome of biomes.value) {
    const group = biome.groupLabel || '未分组'
    result.set(group, [...(result.get(group) ?? []), biome])
  }
  return Array.from(result.entries()).map(([label, items]) => ({ label, items }))
})
const showLoading = computed(() => pending.value && biomes.value.length === 0)
const showEmpty = computed(() => !pending.value && biomes.value.length === 0)
```

Render rules:

- Render grouped tiles from `groups`.
- Use `CommonPreviewImage` with `tile.image` and `tile.fallback`.
- Remove hardcoded links to `/biomes/forest`, `/biomes/desert`, `/biomes/jungle`, `/biomes/dungeon`, `/biomes/underworld`, and `/biomes/hallow`; generated links must use numeric API ids.
- Show skeleton board while loading and empty state if no API data is available.

- [ ] **Step 2: Replace biome detail with API data**

Use this state shape:

```ts
const route = useRoute()
const biomeId = computed(() => String(route.params.id ?? '').trim())
const { data: biomeBundle, pending } = await usePublicBiomeDetail(biomeId)

const biome = computed(() => biomeBundle.value?.detail ?? null)
const biomeTile = computed(() => biomeBundle.value?.item ?? null)
const resources = computed(() => biomeBundle.value?.resources ?? [])
const relations = computed(() => biomeBundle.value?.relations ?? [])
const showLoading = computed(() => pending.value && !biome.value)
const showMissing = computed(() => !pending.value && !biome.value)
```

Render rules:

- Show biome taxonomy from `layerType`, `biomeType`, `wikiGroupNameZh`, and `wikiParentGroupNameZh`.
- Show resources from `resources`, using `resourceNameRaw`, `itemName`, `itemInternalName`, and `itemImage`.
- Show relations from `relations`, linking to `/biomes/{relatedBiomeId}` when present.
- Show source provenance from `sourceProvider`, `sourcePage`, `sourceRevisionTimestamp`, and `lastSyncedAt` only when values exist.

- [ ] **Step 3: Validate biome page contract**

Run:

```bash
pnpm --dir front-nuxt check:public-pages
pnpm --dir front-nuxt check
```

Runtime smoke:

```bash
curl -s 'http://localhost:18088/api/public/biomes' | head -c 300
curl -s 'http://localhost:18088/api/public/biomes/1' | head -c 300
```

Expected: API success and pages render real biome names, resources, and relations without hardcoded example tiles.

- [ ] **Step 4: Commit biome pages**

```bash
git status --short
git add front-nuxt/pages/biomes/index.vue front-nuxt/pages/biomes/[id].vue
git diff --cached --stat
git commit -m "feat(front): connect biome public pages"
```

---

## Task 7: Build Crafting Recipe Data Layer

**Files:**
- Create: `front-nuxt/composables/usePublicRecipeTree.ts`
- Validation: `pnpm --dir front-nuxt check`

- [ ] **Step 1: Create recipe tree composable**

```ts
import type {
  PublicItemRecipeTree,
  PublicRecipeTreeResult,
} from '~/types/public-api'

const missingPublicRecipeTree = (itemId = ''): PublicRecipeTreeResult => ({
  itemId,
  tree: null,
  source: 'missing',
})

const normalizeRecipeItemId = (itemId: string | number | null | undefined) => String(itemId ?? '').trim()

export const fetchPublicRecipeTree = async (
  itemId: string | number | null | undefined,
  maxDepth = 3,
): Promise<PublicRecipeTreeResult> => {
  const normalizedItemId = normalizeRecipeItemId(itemId)
  if (!normalizedItemId) {
    return missingPublicRecipeTree('')
  }

  try {
    const response = await usePublicApiFetch<PublicItemRecipeTree>(`/public/items/${normalizedItemId}/recipe-tree`, {
      query: { maxDepth },
    })

    if (response.success === false) {
      return missingPublicRecipeTree(normalizedItemId)
    }

    const tree = unwrapApiResponse(response)
    return {
      itemId: normalizedItemId,
      tree: tree ?? null,
      source: tree ? 'api' : 'missing',
    }
  } catch {
    return missingPublicRecipeTree(normalizedItemId)
  }
}

export const usePublicRecipeTree = (
  itemId: MaybeRefOrGetter<string | number | null | undefined>,
  maxDepth: MaybeRefOrGetter<number> = 3,
) => useAsyncData(
  () => `public-recipe-tree:${normalizeRecipeItemId(toValue(itemId)) || 'missing'}:${toValue(maxDepth)}`,
  () => fetchPublicRecipeTree(toValue(itemId), toValue(maxDepth)),
  {
    server: false,
    watch: [() => toValue(itemId), () => toValue(maxDepth)],
    default: () => missingPublicRecipeTree(normalizeRecipeItemId(toValue(itemId))),
  },
)
```

- [ ] **Step 2: Run typecheck and commit**

```bash
pnpm --dir front-nuxt check
git status --short
git add front-nuxt/composables/usePublicRecipeTree.ts
git diff --cached --stat
git commit -m "feat(front): add public recipe tree composable"
```

---

## Task 8: Connect Crafting Page

**Files:**
- Modify: `front-nuxt/pages/crafting/index.vue`
- Validation: `pnpm --dir front-nuxt check:public-pages`, browser smoke `/crafting?itemId=757`

- [ ] **Step 1: Replace static Terra Blade blueprint with route-driven recipe state**

Use `?itemId=757` only as a real API target, not as static fallback data.

```ts
const route = useRoute()
const router = useRouter()
const queryText = ref('')
const selectedItemId = computed(() => String(route.query.itemId ?? '').trim())
const maxDepth = computed(() => Number(route.query.maxDepth ?? 3) || 3)

const { data: itemResults, pending: searchPending } = await usePublicItems(() => ({
  page: 1,
  limit: 8,
  search: queryText.value || undefined,
}))

const suggestions = computed(() => itemResults.value?.source === 'api' ? itemResults.value.items : [])
const showSearchUnavailable = computed(() => !searchPending.value && queryText.value.trim().length > 0 && itemResults.value?.source !== 'api')

const { data: recipeBundle, pending: recipePending } = await usePublicRecipeTree(selectedItemId, maxDepth)
const recipeTree = computed(() => recipeBundle.value?.tree ?? null)
const variants = computed(() => recipeTree.value?.variants ?? [])
const hasSelectedTarget = computed(() => selectedItemId.value.length > 0)
const showRecipeLoading = computed(() => recipePending.value && hasSelectedTarget.value && !recipeTree.value)
const showRecipeEmpty = computed(() => !recipePending.value && hasSelectedTarget.value && !recipeTree.value)

const selectTarget = async (itemId: string | number | null) => {
  const normalized = String(itemId ?? '').trim()
  if (!normalized) return
  await router.replace({ query: { ...route.query, itemId: normalized, maxDepth: maxDepth.value } })
}
```

Render rules:

- Initial state without `itemId`: show search/select target state, not Terra Blade static blueprint.
- While `searchPending`, show suggestion skeleton rows.
- If `showSearchUnavailable`, show a compact search unavailable state; do not render `usePublicItems` fallback sample suggestions.
- While `showRecipeLoading`, show recipe canvas skeleton.
- When `variants.length > 0`, render variant tabs or stacked variant sections from API roots.
- Render stations from each node's `stations`.
- Render child ingredients recursively to depth returned by API.
- When `showRecipeEmpty`, show an unavailable state.
- Remove static hardcoded Terra Blade, True Night's Edge, True Excalibur, Broken Hero Sword, and station cards.

- [ ] **Step 2: Add small recursive renderer only if the page needs it**

Prefer a local component block in the page if Vue single-file structure remains readable. If the page grows too large, create `front-nuxt/components/crafting/RecipeTreeNode.vue` and keep it owned by the crafting agent.

Minimum node rendering contract:

```vue
<CommonPreviewImage
  :src="resolvePreviewImageUrl(node.itemImage || node.image || node.previewImage)"
  :alt="node.displayName || node.itemNameZh || node.itemName || '配方节点'"
  :fallback="firstGlyph(node.displayName || node.itemNameZh || node.itemName || '?')"
/>
```

- [ ] **Step 3: Validate crafting page contract**

Run:

```bash
pnpm --dir front-nuxt check:public-pages
pnpm --dir front-nuxt check
```

Runtime smoke:

```bash
curl -s 'http://localhost:18088/api/public/items/757/recipe-tree?maxDepth=3' | head -c 300
```

Expected: response includes `"success":true`, selected item data, variants, and roots.

- [ ] **Step 4: Commit crafting page**

```bash
git status --short
git add front-nuxt/pages/crafting/index.vue
git diff --cached --stat
git commit -m "feat(front): connect crafting recipe tree page"
```

---

## Task 9: Extend Public Page Contract Checks

**Files:**
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Validation: `pnpm --dir front-nuxt check:public-pages`

- [ ] **Step 1: Add required composable checks**

Extend the script so it fails when these files are absent or unused by their pages:

```js
const requiredPublicDataFiles = [
  'composables/usePublicBosses.ts',
  'composables/usePublicBossDetail.ts',
  'composables/usePublicBiomes.ts',
  'composables/usePublicBiomeDetail.ts',
  'composables/usePublicRecipeTree.ts',
]
```

Page usage assertions:

```js
const publicPageDataContracts = [
  { page: 'pages/bosses/index.vue', patterns: ['usePublicBosses', 'CommonPreviewImage', 'CommonTpSkeleton'] },
  { page: 'pages/bosses/[id].vue', patterns: ['usePublicBossDetail', 'CommonPreviewImage', 'CommonTpSkeleton'] },
  { page: 'pages/biomes/index.vue', patterns: ['usePublicBiomes', 'CommonPreviewImage', 'CommonTpSkeleton'] },
  { page: 'pages/biomes/[id].vue', patterns: ['usePublicBiomeDetail', 'CommonPreviewImage', 'CommonTpSkeleton'] },
  { page: 'pages/crafting/index.vue', patterns: ['usePublicRecipeTree', 'usePublicItems', 'CommonTpSkeleton'] },
]
```

- [ ] **Step 2: Enforce crafting fallback guard**

The crafting page must prove it filters existing item fallback rows before rendering suggestions.

```js
const craftingContent = readFileSync(file('pages/crafting/index.vue'), 'utf8')
if (!craftingContent.includes("itemResults.value?.source === 'api'") && !craftingContent.includes('itemResults.value?.source === "api"')) {
  throw new Error('pages/crafting/index.vue must hide usePublicItems fallback suggestions and only render API item suggestions')
}
```

- [ ] **Step 3: Add static sample marker rejection**

Fail if the connected pages still contain the old static sample-only markers:

```js
const forbiddenStaticMarkers = [
  { page: 'pages/bosses/index.vue', markers: ['史莱姆王', '克苏鲁之眼', '血肉墙', '月亮领主'] },
  { page: 'pages/biomes/index.vue', markers: ['/biomes/forest', '/biomes/desert', '/biomes/jungle'] },
  { page: 'pages/crafting/index.vue', markers: ['静态占位', '泰拉刃制作链', '英雄断剑来源'] },
]
```

Keep display-name text from the API allowed at runtime; this script only rejects source-file static sample strings on connected pages.

- [ ] **Step 4: Run and commit**

```bash
pnpm --dir front-nuxt check:public-pages
git status --short
git add front-nuxt/scripts/check-public-pages.mjs
git diff --cached --stat
git commit -m "test(front): enforce boss biome recipe public page contracts"
```

---

## Task 10: Final Validation And Merge Readiness

**Files:**
- Read-only validation across backend and `front-nuxt`

- [ ] **Step 1: Run final frontend gates**

```bash
pnpm --dir front-nuxt check:public-pages
pnpm --dir front-nuxt check:loading-skeleton
pnpm --dir front-nuxt check
```

Expected: all three commands pass. If `check:loading-skeleton` fails on a new page, repair skeleton dimensions and rerun it.

- [ ] **Step 2: Run backend compile if the public biome controller was added**

```bash
cd back
mvn -DskipTests compile
```

Expected: compile success.

- [ ] **Step 3: Run API smoke checks**

```bash
curl -s 'http://localhost:18088/api/public/bosses?limit=1' | head -c 300
curl -s 'http://localhost:18088/api/public/bosses/34' | head -c 300
curl -s 'http://localhost:18088/api/public/biomes' | head -c 300
curl -s 'http://localhost:18088/api/public/biomes/1' | head -c 300
curl -s 'http://localhost:18088/api/public/items/757/recipe-tree?maxDepth=3' | head -c 300
```

Expected: all responses include `"success":true`, except an intentional missing-id test may return a controlled 404.

- [ ] **Step 4: Run browser smoke on a free front-nuxt port**

If an existing branch is using port `5176`, choose another port such as `5188`.

```bash
pnpm --dir front-nuxt dev --host 0.0.0.0 --port 5188
```

Open:

- `http://localhost:5188/bosses`
- `http://localhost:5188/bosses/34`
- `http://localhost:5188/biomes`
- `http://localhost:5188/biomes/1`
- `http://localhost:5188/crafting?itemId=757`

Expected:

- Real data appears after skeletons.
- No static fallback cards flash before API data.
- Missing images use `CommonPreviewImage` fallback inside stable image boxes.
- Recipe animation and loading transitions are smooth enough that a fast successful request does not cause a harsh jump.

- [ ] **Step 5: Check final git scope**

```bash
git status --short
git log --oneline --max-count=8
```

Expected: only focused commits from this plan are present on the implementation branch. Keep the branch open for user acceptance, then merge only after the user asks.

---

## Plan Audit

## Verdict

- Status: Execution-ready after the user approves implementation.
- Main goal: Connect Boss, Crafting recipe tree, and Biome public frontend pages to real API data.
- Closure definition: The five smoke routes listed in Task 10 render real API data, pass public-page and skeleton checks, and do not expose static sample fallback content during loading or failure.

## Blocking Plan Defects

- Critical: None.
- Important: None.

## Plan Repairs

- Change: Biome integration includes a backend `/public/biomes` alias before frontend work.
- Reason: Existing biome routes are `/biomes`, while the public frontend data layer consistently calls `/public/...`.
- Validation added: Backend compile plus `/api/public/biomes` and `/api/public/biomes/1` smoke checks.
- Change: Crafting page plan filters `usePublicItems` suggestions to `source === 'api'`.
- Reason: The existing item composable still has static fallback sample rows; recipe search must not leak those rows while APIs are loading or unavailable.
- Validation added: Public-page contract check requires the crafting page to guard item suggestions by API source.

## Execution-Ready Plan

- Scope: One backend public controller alias, frontend types/composables, three public page families, contract checks, and runtime smoke.
- Agent split: Boss, Biome, Crafting, Contract, and Integration-owner boundaries are defined by file ownership.
- Smoke test: `/bosses`, `/bosses/34`, `/biomes`, `/biomes/1`, and `/crafting?itemId=757`.
- Final validation: `pnpm --dir front-nuxt check:public-pages`, `pnpm --dir front-nuxt check:loading-skeleton`, `pnpm --dir front-nuxt check`, backend compile, API curl checks, and browser smoke on a free Nuxt port.

## Residual Risk

- Risk: Recipe tree rendering may need a small recursive component if the existing crafting page becomes too large.
- Follow-up trigger: If `pages/crafting/index.vue` becomes hard to typecheck or review, create `front-nuxt/components/crafting/RecipeTreeNode.vue` under the crafting agent's ownership and rerun the same validation.
