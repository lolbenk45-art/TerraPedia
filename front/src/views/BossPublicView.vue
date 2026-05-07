<template>
  <div class="boss-list-view public-workbench page-wrap">
    <section class="public-page-hero boss-list-view__hero">
      <div class="public-page-hero__layout">
        <div class="public-page-hero__copy">
          <span class="section-eyebrow">Atlas Workbench</span>
          <h1 class="section-title section-title--hero">Boss Archive</h1>
          <p class="section-copy section-copy--wide">
            Track public boss records with server-backed search, progression-aware ordering, and quick summaries for members and loot.
          </p>
        </div>

        <div class="public-page-hero__meta boss-list-view__hero-meta">
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Results</span>
            <strong class="public-hero-stat-card__value">{{ pagination.total }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Focus</span>
            <strong class="public-hero-stat-card__value">{{ activeSearch ? 'Filtered' : 'All public bosses' }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Page</span>
            <strong class="public-hero-stat-card__value">{{ pagination.page }} / {{ totalPages }}</strong>
          </article>
        </div>
      </div>
    </section>

    <section class="public-summary-strip boss-list-view__filters">
      <form class="boss-list-view__toolbar" @submit.prevent="applyFilters">
        <label class="boss-list-view__field">
          <span>Search Bosses</span>
          <input
            v-model.trim="searchInput"
            type="search"
            class="boss-list-view__input"
            placeholder="Search by name, alias, or code"
          />
        </label>

        <button type="submit" class="btn btn-brand boss-list-view__action">Search</button>
      </form>

      <div class="public-summary-strip__meta">
        <span class="public-chip public-chip--accent">{{ activeSearch ? `Search: ${activeSearch}` : 'No search filter' }}</span>
        <span class="public-chip">Public list only</span>
      </div>
    </section>

    <section v-if="isLoading" class="public-section-frame boss-list-view__state">
      <div class="boss-list-view__spinner" aria-hidden="true"></div>
      <p>Loading bosses...</p>
    </section>

    <section v-else-if="error" class="public-section-frame boss-list-view__state boss-list-view__state--error">
      <strong>Could not load bosses</strong>
      <p>{{ error }}</p>
      <button type="button" class="btn btn-brand" @click="reloadCurrentRoute">Retry</button>
    </section>

    <template v-else>
      <section class="public-section-frame boss-list-view__summary">
        <div>
          <p class="boss-list-view__caption">Current slice</p>
          <h2>{{ activeSearch ? 'Search results' : 'All public bosses' }}</h2>
        </div>

        <div class="boss-list-view__meta">
          <span>{{ pagination.total }} results</span>
          <span>Page {{ pagination.page }} / {{ totalPages }}</span>
        </div>
      </section>

      <section v-if="bosses.length === 0" class="public-section-frame boss-list-view__state">
        <strong>No bosses found</strong>
        <p>Try a broader search term.</p>
      </section>

      <section v-else class="boss-list-view__grid">
        <article
          v-for="boss in bosses"
          :key="boss.id"
          class="public-section-frame boss-card"
        >
          <div class="boss-card__portrait">
            <img v-if="resolveImage(boss.imageUrl)" :src="resolveImage(boss.imageUrl)" :alt="displayName(boss)" loading="lazy" />
            <div v-else class="boss-card__fallback">
              <span class="boss-card__fallback-mark" aria-hidden="true">{{ fallbackMark(boss) }}</span>
              <span>No managed portrait</span>
            </div>
          </div>

          <div class="boss-card__body">
            <div class="boss-card__badges">
              <span v-if="boss.bossType" class="boss-card__badge boss-card__badge--accent">{{ formatBossType(boss.bossType) }}</span>
              <span class="boss-card__badge">Order {{ boss.progressionOrder ?? '--' }}</span>
            </div>

            <div class="boss-card__heading">
              <h3>{{ displayName(boss) }}</h3>
              <p v-if="secondaryName(boss)" class="boss-card__secondary">{{ secondaryName(boss) }}</p>
            </div>

            <p v-if="boss.summonMethod" class="boss-card__summary">{{ boss.summonMethod }}</p>
            <p v-else-if="boss.notes" class="boss-card__summary">{{ boss.notes }}</p>
            <p v-else class="boss-card__summary boss-card__summary--muted">Summon details not published yet.</p>

            <dl class="boss-card__facts">
              <div>
                <dt>Members</dt>
                <dd>{{ boss.memberCount ?? 0 }}</dd>
              </div>
              <div>
                <dt>Loot entries</dt>
                <dd>{{ boss.lootEntryCount ?? 0 }}</dd>
              </div>
              <div>
                <dt>Unique loot</dt>
                <dd>{{ boss.uniqueLootItemCount ?? 0 }}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{{ boss.code || '--' }}</dd>
              </div>
            </dl>

            <div v-if="boss.memberNames?.length" class="boss-card__members">
              <span class="boss-card__members-label">Members</span>
              <p>{{ boss.memberNames.slice(0, 4).join(' | ') }}</p>
            </div>
          </div>
        </article>
      </section>

      <section v-if="totalPages > 1" class="public-pager-shell boss-list-view__pager">
        <button type="button" class="btn btn-soft" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">
          Prev
        </button>

        <div class="boss-list-view__page-list">
          <button
            v-for="page in displayedPages"
            :key="page"
            type="button"
            class="boss-list-view__page-chip"
            :class="{ 'boss-list-view__page-chip--active': page === pagination.page }"
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
import { fetchBosses } from '@/api'
import type { BossListItem, Pagination } from '@/types'

const route = useRoute()
const router = useRouter()
const pageSize = 12

const bosses = ref<BossListItem[]>([])
const isLoading = ref(false)
const error = ref('')
const searchInput = ref('')
const activeSearch = ref('')
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

const buildQueryKey = (page: number, search: string) => `${page}|${search}`

const routeState = () => {
  const search = parseString(route.query.search).trim()
  const page = parsePage(route.query.page)
  return { page, search }
}

const syncLocalStateFromRoute = () => {
  const next = routeState()
  searchInput.value = next.search
  activeSearch.value = next.search
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

const displayName = (boss: BossListItem) => boss.nameZh?.trim() || boss.name?.trim() || boss.nameEn?.trim() || 'Unknown Boss'

const secondaryName = (boss: BossListItem) => {
  if (boss.nameZh?.trim()) {
    return boss.nameEn?.trim() || boss.name?.trim() || boss.code?.trim() || ''
  }

  return boss.code?.trim() || ''
}

const resolveImage = (value?: string | null) => {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return value.startsWith('/') ? value : `/${value}`
}

const fallbackMark = (boss: BossListItem) => {
  const code = boss.code?.trim()
  if (code) {
    return code.slice(0, 2)
  }
  return 'BS'
}

const formatBossType = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const loadBosses = async () => {
  isLoading.value = true
  error.value = ''

  try {
    const response = await fetchBosses(
      pagination.value.page,
      pageSize,
      activeSearch.value || undefined,
    )

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch boss list')
    }

    bosses.value = response.data || []
    pagination.value = {
      total: response.pagination?.total ?? bosses.value.length,
      page: response.pagination?.page ?? pagination.value.page,
      limit: response.pagination?.limit ?? pageSize,
      totalPages: response.pagination?.totalPages ?? 1,
    }
  } catch (cause) {
    bosses.value = []
    pagination.value = {
      total: 0,
      page: pagination.value.page,
      limit: pageSize,
      totalPages: 1,
    }
    error.value = cause instanceof Error ? cause.message : 'Failed to fetch boss list'
  } finally {
    isLoading.value = false
  }
}

const loadFromRoute = async () => {
  const next = routeState()
  const key = buildQueryKey(next.page, next.search)

  syncLocalStateFromRoute()

  if (lastLoadedKey.value === key) {
    return
  }

  lastLoadedKey.value = key
  await loadBosses()
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

  activeSearch.value = search
  pagination.value = {
    ...pagination.value,
    page,
  }
  lastLoadedKey.value = buildQueryKey(page, search)

  await router.push({ path: '/bosses', query })
  await loadBosses()
}

const applyFilters = async () => {
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
.boss-list-view {
  display: grid;
  gap: 1.2rem;
}

.boss-list-view__hero-meta {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.boss-list-view__toolbar {
  display: grid;
  gap: 0.85rem;
  padding: 0.95rem;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.boss-list-view__field {
  display: grid;
  gap: 0.45rem;
}

.boss-list-view__field span {
  color: var(--text-secondary);
  font-size: 0.88rem;
  font-weight: 600;
}

.boss-list-view__input {
  min-height: 3rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-radius: 0.95rem;
  background: color-mix(in srgb, white 70%, var(--bg-primary));
  color: var(--text-primary);
  padding: 0.8rem 0.95rem;
}

.boss-list-view__action {
  min-height: 3rem;
}

.boss-list-view__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.boss-list-view__caption {
  color: var(--text-muted);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.boss-list-view__summary h2 {
  color: var(--text-primary);
  font-size: 1.25rem;
}

.boss-list-view__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.boss-list-view__state {
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  text-align: center;
  padding: 2rem 1.25rem;
}

.boss-list-view__state strong {
  color: var(--text-primary);
  font-size: 1.1rem;
}

.boss-list-view__state p {
  color: var(--text-secondary);
}

.boss-list-view__state--error {
  border-color: color-mix(in srgb, var(--accent-error) 24%, var(--border-color));
}

.boss-list-view__spinner {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-top-color: var(--accent-primary);
  animation: boss-spin 900ms linear infinite;
}

.boss-list-view__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.boss-card {
  display: grid;
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.boss-card__portrait {
  min-height: 220px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent-primary) 14%, transparent), transparent 58%),
    color-mix(in srgb, white 62%, var(--bg-secondary));
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
}

.boss-card__portrait img {
  width: 100%;
  max-height: 190px;
  object-fit: contain;
}

.boss-card__fallback {
  display: grid;
  gap: 0.4rem;
  justify-items: center;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.boss-card__fallback-mark {
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
  text-transform: uppercase;
}

.boss-card__body {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
}

.boss-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.boss-card__badge {
  padding: 0.32rem 0.62rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}

.boss-card__badge--accent {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
}

.boss-card__heading {
  display: grid;
  gap: 0.25rem;
}

.boss-card h3 {
  color: var(--text-primary);
  font-size: 1.15rem;
  line-height: 1.2;
}

.boss-card__secondary,
.boss-card__summary {
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.boss-card__summary {
  line-height: 1.45;
}

.boss-card__summary--muted {
  color: var(--text-muted);
}

.boss-card__facts {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.boss-card__facts dt {
  color: var(--text-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.boss-card__facts dd {
  margin-top: 0.22rem;
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 600;
}

.boss-card__members {
  display: grid;
  gap: 0.24rem;
}

.boss-card__members-label {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.boss-card__members p {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.boss-list-view__pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.boss-list-view__page-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
}

.boss-list-view__page-chip {
  min-width: 2.5rem;
  min-height: 2.5rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 86%, white 14%);
  color: var(--text-primary);
  font-weight: 700;
}

.boss-list-view__page-chip--active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

@keyframes boss-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 840px) {
  .boss-list-view__toolbar {
    grid-template-columns: 1fr;
  }

  .boss-list-view__hero-meta {
    grid-template-columns: 1fr;
  }

  .boss-list-view__action {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .boss-list-view {
    padding-top: 1.4rem;
  }

  .boss-list-view__hero {
    padding: 1rem;
  }

  .boss-card__portrait {
    min-height: 180px;
  }
}
</style>
