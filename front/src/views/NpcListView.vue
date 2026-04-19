<template>
  <div class="public-workbench npc-list-view page-wrap">
    <section class="public-page-hero npc-list-view__hero">
      <div class="public-page-hero__layout">
        <div class="public-page-hero__copy">
          <span class="section-eyebrow">Atlas Workbench</span>
          <h1 class="section-title section-title--hero">NPC Directory</h1>
          <p class="section-copy section-copy--wide">
            Browse the public TerraPedia NPC index with server-backed search, town filtering, and direct links into each
            public NPC profile.
          </p>
        </div>

        <div class="public-page-hero__meta npc-list-view__hero-meta">
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Results</span>
            <strong class="public-hero-stat-card__value">{{ pagination.total }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Mode</span>
            <strong class="public-hero-stat-card__value">{{ townOnly ? 'Town NPCs Only' : 'All public NPCs' }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Page</span>
            <strong class="public-hero-stat-card__value">{{ pagination.page }} / {{ totalPages }}</strong>
          </article>
        </div>
      </div>
    </section>

    <section class="public-summary-strip npc-list-view__filters">
      <form class="npc-list-view__toolbar" @submit.prevent="applyFilters">
        <label class="npc-list-view__field">
          <span>Search NPCs</span>
          <input
            v-model.trim="searchInput"
            type="search"
            class="npc-list-view__input"
            placeholder="Search by display name, alias, or internal name"
          />
        </label>

        <button type="submit" class="btn btn-brand npc-list-view__action">Search</button>

        <button
          type="button"
          class="npc-list-view__toggle"
          :class="{ 'npc-list-view__toggle--active': townOnly }"
          :aria-pressed="townOnly"
          @click="toggleTownOnly"
        >
          Town NPCs Only
        </button>
      </form>

      <div class="public-summary-strip__meta">
        <span class="public-chip public-chip--accent">{{ activeSearch ? `Search: ${activeSearch}` : 'No search filter' }}</span>
        <span class="public-chip">{{ townOnly ? 'Town-only filter active' : 'All NPC types visible' }}</span>
      </div>
    </section>

    <section v-if="isLoading" class="public-section-frame npc-list-view__state">
      <div class="npc-list-view__spinner" aria-hidden="true"></div>
      <p>Loading NPCs...</p>
    </section>

    <section v-else-if="error" class="public-section-frame npc-list-view__state npc-list-view__state--error">
      <strong>Could not load NPCs</strong>
      <p>{{ error }}</p>
      <button type="button" class="btn btn-brand" @click="reloadCurrentRoute">Retry</button>
    </section>

    <template v-else>
      <section class="public-section-frame npc-list-view__summary">
        <div>
          <p class="npc-list-view__caption">Current slice</p>
          <h2>{{ townOnly ? 'Town NPC roster' : 'All public NPCs' }}</h2>
        </div>

        <div class="npc-list-view__meta">
          <span>{{ pagination.total }} results</span>
          <span>Page {{ pagination.page }} / {{ totalPages }}</span>
        </div>
      </section>

      <section v-if="npcs.length === 0" class="public-section-frame npc-list-view__state">
        <strong>No NPCs found</strong>
        <p>Try a broader search term or turn off the town-only filter.</p>
      </section>

      <section v-else class="npc-list-view__grid">
        <router-link
          v-for="npc in npcs"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="public-section-frame npc-card"
        >
          <div class="npc-card__portrait">
            <img v-if="resolveImage(npc.imageUrl)" :src="resolveImage(npc.imageUrl)" :alt="displayName(npc)" loading="lazy" />
            <div v-else class="npc-card__fallback">
              <span class="npc-card__fallback-mark" aria-hidden="true">{{ portraitMark(npc) }}</span>
              <span>No portrait</span>
            </div>
          </div>

          <div class="npc-card__body">
            <div class="npc-card__badges">
              <span v-if="npc.isTownNpc" class="npc-card__badge npc-card__badge--accent">Town NPC</span>
              <span v-if="npc.isFriendly" class="npc-card__badge">Friendly</span>
            </div>

            <h3>{{ displayName(npc) }}</h3>
            <p v-if="secondaryName(npc)" class="npc-card__secondary">{{ secondaryName(npc) }}</p>
            <p v-if="displaySubName(npc)" class="npc-card__summary-copy">{{ displaySubName(npc) }}</p>

            <dl class="npc-card__facts">
              <div>
                <dt>Category</dt>
                <dd>{{ npc.categoryName || 'Uncategorized' }}</dd>
              </div>
              <div>
                <dt>Game ID</dt>
                <dd>{{ npc.gameId ?? '--' }}</dd>
              </div>
            </dl>
          </div>
        </router-link>
      </section>

      <section v-if="totalPages > 1" class="public-pager-shell npc-list-view__pager">
        <button type="button" class="btn btn-soft" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
          Prev
        </button>

        <div class="npc-list-view__page-list">
          <button
            v-for="page in displayedPages"
            :key="page"
            type="button"
            class="npc-list-view__page-chip"
            :class="{ 'npc-list-view__page-chip--active': page === pagination.page }"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
        </div>

        <button type="button" class="btn btn-soft" :disabled="pagination.page >= totalPages" @click="goToPage(pagination.page + 1)">
          Next
        </button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchNpcs } from '@/api'
import type { NpcListItem, Pagination } from '@/types'

const route = useRoute()
const router = useRouter()
const pageSize = 12

const npcs = ref<NpcListItem[]>([])
const isLoading = ref(false)
const error = ref('')
const searchInput = ref('')
const activeSearch = ref('')
const townOnly = ref(false)
const lastLoadedKey = ref('')

const pagination = ref<Pagination>({
  total: 0,
  page: 1,
  limit: pageSize,
  totalPages: 1,
})

const parsePage = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number(raw)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

const parseString = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : ''
}

const parseBoolean = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === '1' || raw === 'true'
}

const buildQueryKey = (page: number, search: string, town: boolean) => `${page}|${search}|${town}`

const routeState = () => {
  const search = parseString(route.query.search).trim()
  const page = parsePage(route.query.page)
  const town = parseBoolean(route.query.isTownNpc) || parseBoolean(route.query.town)

  return { page, search, town }
}

const syncLocalStateFromRoute = () => {
  const next = routeState()
  searchInput.value = next.search
  activeSearch.value = next.search
  townOnly.value = next.town
  pagination.value = {
    ...pagination.value,
    page: next.page,
    limit: pageSize,
  }
}

const totalPages = computed(() => Math.max(1, pagination.value.totalPages || 1))

const displayedPages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = pagination.value.page
  const start = Math.max(1, current - 1)
  const end = Math.min(total, current + 1)

  for (let page = start; page <= end; page += 1) {
    pages.push(page)
  }

  if (!pages.includes(1)) {
    pages.unshift(1)
  }

  if (!pages.includes(total)) {
    pages.push(total)
  }

  return [...new Set(pages)]
})

const displayName = (npc: NpcListItem) => npc.nameZh?.trim() || npc.name || 'Unknown NPC'

const secondaryName = (npc: NpcListItem) => {
  if (npc.nameZh?.trim()) {
    return npc.name?.trim() || npc.internalName?.trim() || ''
  }

  return npc.internalName?.trim() || ''
}

const displaySubName = (npc: NpcListItem) => npc.subNameZh?.trim() || npc.subName?.trim() || ''

const resolveImage = (value?: string | null) => {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return value.startsWith('/') ? value : `/${value}`
}

const portraitMark = (npc: NpcListItem) => {
  if (npc.isTownNpc) return 'TN'
  if (npc.isFriendly) return 'FR'
  return 'NPC'
}

const loadNpcs = async () => {
  isLoading.value = true
  error.value = ''

  try {
    const response = await fetchNpcs(
      pagination.value.page,
      pageSize,
      activeSearch.value || undefined,
      undefined,
      townOnly.value ? true : undefined,
    )

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch npc list')
    }

    npcs.value = response.data || []
    pagination.value = {
      total: response.pagination?.total ?? npcs.value.length,
      page: response.pagination?.page ?? pagination.value.page,
      limit: response.pagination?.limit ?? pageSize,
      totalPages: response.pagination?.totalPages ?? 1,
    }
  } catch (cause) {
    npcs.value = []
    pagination.value = {
      total: 0,
      page: pagination.value.page,
      limit: pageSize,
      totalPages: 1,
    }
    error.value = cause instanceof Error ? cause.message : 'Failed to fetch npc list'
  } finally {
    isLoading.value = false
  }
}

const loadFromRoute = async () => {
  const next = routeState()
  const key = buildQueryKey(next.page, next.search, next.town)

  syncLocalStateFromRoute()

  if (lastLoadedKey.value === key) {
    return
  }

  lastLoadedKey.value = key
  await loadNpcs()
}

const pushRouteState = async (page: number) => {
  const search = searchInput.value.trim()
  const query: Record<string, string> = {}

  if (page > 1) {
    query.page = String(page)
  }
  if (search) {
    query.search = search
  }
  if (townOnly.value) {
    query.isTownNpc = 'true'
  }

  activeSearch.value = search
  pagination.value = {
    ...pagination.value,
    page,
  }
  lastLoadedKey.value = buildQueryKey(page, search, townOnly.value)

  await router.push({ path: '/npcs', query })
  await loadNpcs()
}

const applyFilters = async () => {
  await pushRouteState(1)
}

const toggleTownOnly = async () => {
  townOnly.value = !townOnly.value
  await pushRouteState(1)
}

const goToPage = async (page: number) => {
  if (page < 1 || page > totalPages.value || page === pagination.value.page) {
    return
  }

  await pushRouteState(page)
}

const reloadCurrentRoute = async () => {
  lastLoadedKey.value = ''
  await loadFromRoute()
}

watch(
  () => route.fullPath,
  () => {
    void loadFromRoute()
  },
  { immediate: true },
)
</script>

<style scoped>
.npc-list-view {
  display: grid;
  gap: 1.2rem;
}

.npc-list-view__hero-meta {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.npc-list-view__toolbar {
  display: grid;
  gap: 0.85rem;
  padding: 0.95rem;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
}

.npc-list-view__field {
  display: grid;
  gap: 0.45rem;
}

.npc-list-view__field span {
  color: var(--text-secondary);
  font-size: 0.88rem;
  font-weight: 600;
}

.npc-list-view__input {
  min-height: 3rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-radius: 0.95rem;
  background: color-mix(in srgb, white 70%, var(--bg-primary));
  color: var(--text-primary);
  padding: 0.8rem 0.95rem;
}

.npc-list-view__action {
  min-height: 3rem;
}

.npc-list-view__toggle {
  min-height: 3rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-radius: 0.95rem;
  background: color-mix(in srgb, var(--bg-secondary) 86%, white 14%);
  color: var(--text-primary);
  padding: 0.75rem 1rem;
  font-weight: 700;
}

.npc-list-view__toggle--active {
  border-color: color-mix(in srgb, var(--accent-primary) 34%, transparent);
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
}

.npc-list-view__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.npc-list-view__caption {
  color: var(--text-muted);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.npc-list-view__summary h2 {
  color: var(--text-primary);
  font-size: 1.25rem;
}

.npc-list-view__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.npc-list-view__state {
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  text-align: center;
  padding: 2rem 1.25rem;
}

.npc-list-view__state strong {
  color: var(--text-primary);
  font-size: 1.1rem;
}

.npc-list-view__state p {
  color: var(--text-secondary);
}

.npc-list-view__state--error {
  border-color: color-mix(in srgb, var(--accent-error) 24%, var(--border-color));
}

.npc-list-view__spinner {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-top-color: var(--accent-primary);
  animation: npc-spin 900ms linear infinite;
}

.npc-list-view__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.npc-card {
  display: grid;
  gap: 0;
  padding: 0;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
}

.npc-card__portrait {
  min-height: 210px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent-primary) 14%, transparent), transparent 58%),
    color-mix(in srgb, white 62%, var(--bg-secondary));
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
}

.npc-card__portrait img {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
}

.npc-card__fallback {
  display: grid;
  gap: 0.4rem;
  justify-items: center;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.npc-card__fallback-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4rem;
  min-height: 4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 82%, white 18%);
  color: var(--accent-primary);
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.npc-card__body {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
}

.npc-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.npc-card__badge {
  padding: 0.32rem 0.62rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}

.npc-card__badge--accent {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
}

.npc-card h3 {
  color: var(--text-primary);
  font-size: 1.15rem;
  line-height: 1.2;
}

.npc-card__secondary,
.npc-card__summary-copy {
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.npc-card__facts {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.npc-card__facts dt {
  color: var(--text-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.npc-card__facts dd {
  margin-top: 0.22rem;
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 600;
}

.npc-list-view__pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.npc-list-view__page-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
}

.npc-list-view__page-chip {
  min-width: 2.5rem;
  min-height: 2.5rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 86%, white 14%);
  color: var(--text-primary);
  font-weight: 700;
}

.npc-list-view__page-chip--active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

@keyframes npc-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 840px) {
  .npc-list-view__toolbar {
    grid-template-columns: 1fr;
  }

  .npc-list-view__hero-meta {
    grid-template-columns: 1fr;
  }

  .npc-list-view__action,
  .npc-list-view__toggle {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .npc-list-view {
    padding-top: 1.4rem;
  }

  .npc-list-view__hero {
    padding: 1rem;
  }

  .npc-card__portrait {
    min-height: 180px;
  }
}
</style>
