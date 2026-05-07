<template>
  <div class="entity-list-view public-workbench page-wrap">
    <section class="public-page-hero entity-list-view__hero">
      <div class="public-page-hero__layout">
        <div class="public-page-hero__copy">
          <span class="section-eyebrow">Atlas Workbench</span>
          <h1 class="section-title section-title--hero">Armor Set Archive</h1>
          <p class="section-copy section-copy--wide">
            Review public armor set compositions with managed image groups and quick set composition facts.
          </p>
        </div>
        <div class="public-page-hero__meta entity-list-view__hero-meta">
          <article class="public-hero-stat-card"><span class="public-hero-stat-card__label">Results</span><strong class="public-hero-stat-card__value">{{ pagination.total }}</strong></article>
          <article class="public-hero-stat-card"><span class="public-hero-stat-card__label">Focus</span><strong class="public-hero-stat-card__value">{{ activeSearch ? 'Filtered' : 'All public armor sets' }}</strong></article>
          <article class="public-hero-stat-card"><span class="public-hero-stat-card__label">Page</span><strong class="public-hero-stat-card__value">{{ pagination.page }} / {{ totalPages }}</strong></article>
        </div>
      </div>
    </section>

    <section class="public-summary-strip entity-list-view__filters">
      <form class="entity-list-view__toolbar" @submit.prevent="applyFilters">
        <label class="entity-list-view__field">
          <span>Search Armor Sets</span>
          <input v-model.trim="searchInput" type="search" class="entity-list-view__input" placeholder="Search by armor set name or text key" />
        </label>
        <button type="submit" class="btn btn-brand entity-list-view__action">Search</button>
      </form>
      <div class="public-summary-strip__meta">
        <span class="public-chip public-chip--accent">{{ activeSearch ? `Search: ${activeSearch}` : 'No search filter' }}</span>
        <span class="public-chip">Public list only</span>
      </div>
    </section>

    <section v-if="isLoading" class="public-section-frame entity-list-view__state"><div class="entity-list-view__spinner" aria-hidden="true"></div><p>Loading armor sets...</p></section>
    <section v-else-if="error" class="public-section-frame entity-list-view__state entity-list-view__state--error"><strong>Could not load armor sets</strong><p>{{ error }}</p><button type="button" class="btn btn-brand" @click="reloadCurrentRoute">Retry</button></section>

    <template v-else>
      <section class="public-section-frame entity-list-view__summary">
        <div><p class="entity-list-view__caption">Current slice</p><h2>{{ activeSearch ? 'Search results' : 'All public armor sets' }}</h2></div>
        <div class="entity-list-view__meta"><span>{{ pagination.total }} results</span><span>Page {{ pagination.page }} / {{ totalPages }}</span></div>
      </section>

      <section v-if="armorSets.length === 0" class="public-section-frame entity-list-view__state"><strong>No armor sets found</strong><p>Try a broader search term.</p></section>

      <section v-else class="entity-list-view__grid">
        <article v-for="armorSet in armorSets" :key="armorSet.id" class="public-section-frame entity-card">
          <div class="entity-card__portrait entity-card__portrait--stack">
            <div v-if="primaryImages(armorSet).length" class="entity-card__image-stack">
              <img v-for="image in primaryImages(armorSet).slice(0, 3)" :key="image" :src="image" :alt="displayName(armorSet)" loading="lazy" />
            </div>
            <div v-else class="entity-card__fallback">
              <span class="entity-card__fallback-mark" aria-hidden="true">{{ fallbackMark(armorSet.textKey) }}</span>
              <span>No managed set art</span>
            </div>
          </div>

          <div class="entity-card__body">
            <div class="entity-card__badges">
              <span v-if="armorSet.primaryPart" class="entity-card__badge entity-card__badge--accent">{{ armorSet.primaryPart }}</span>
              <span class="entity-card__badge">Pieces {{ armorSet.setCount ?? 0 }}</span>
            </div>

            <div class="entity-card__heading">
              <h3>{{ displayName(armorSet) }}</h3>
              <p v-if="armorSet.textKey" class="entity-card__secondary">{{ armorSet.textKey }}</p>
            </div>

            <p class="entity-card__summary">Unique items {{ armorSet.uniqueItemCount ?? 0 }} · Male {{ armorSet.maleImages?.length ?? 0 }} · Female {{ armorSet.femaleImages?.length ?? 0 }}</p>

            <dl class="entity-card__facts">
              <div><dt>Special images</dt><dd>{{ armorSet.specialImages?.length ?? 0 }}</dd></div>
              <div><dt>Source key</dt><dd>{{ armorSet.sourceKey || '--' }}</dd></div>
            </dl>
          </div>
        </article>
      </section>

      <section v-if="totalPages > 1" class="public-pager-shell entity-list-view__pager">
        <button type="button" class="btn btn-soft" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">Prev</button>
        <div class="entity-list-view__page-list">
          <button v-for="page in displayedPages" :key="page" type="button" class="entity-list-view__page-chip" :class="{ 'entity-list-view__page-chip--active': page === pagination.page }" @click="goToPage(page)">{{ page }}</button>
        </div>
        <button type="button" class="btn btn-soft" :disabled="pagination.page >= totalPages" @click="goToPage(pagination.page + 1)">Next</button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchArmorSets } from '@/api'
import type { ArmorSetListItem, Pagination } from '@/types'

const route = useRoute()
const router = useRouter()
const pageSize = 12
const armorSets = ref<ArmorSetListItem[]>([])
const isLoading = ref(false)
const error = ref('')
const searchInput = ref('')
const activeSearch = ref('')
const lastLoadedKey = ref('')
const pagination = ref<Pagination>({ total: 0, page: 1, limit: pageSize, totalPages: 1 })

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
const routeState = () => ({ page: parsePage(route.query.page), search: parseString(route.query.search).trim() })
const syncLocalStateFromRoute = () => {
  const next = routeState()
  searchInput.value = next.search
  activeSearch.value = next.search
  pagination.value = { ...pagination.value, page: next.page, limit: pageSize }
}
const totalPages = computed(() => Math.max(1, pagination.value.totalPages || 1))
const displayedPages = computed(() => {
  const pages: number[] = []
  const start = Math.max(1, pagination.value.page - 1)
  const end = Math.min(totalPages.value, pagination.value.page + 1)
  for (let page = start; page <= end; page += 1) pages.push(page)
  if (!pages.includes(1)) pages.unshift(1)
  if (!pages.includes(totalPages.value)) pages.push(totalPages.value)
  return [...new Set(pages)]
})
const displayName = (armorSet: ArmorSetListItem) => armorSet.nameZh?.trim() || armorSet.name?.trim() || armorSet.nameEn?.trim() || armorSet.textKey?.trim() || 'Unknown Armor Set'
const primaryImages = (armorSet: ArmorSetListItem) => [...(armorSet.maleImages || []), ...(armorSet.femaleImages || []), ...(armorSet.specialImages || [])]
const fallbackMark = (value?: string | null) => value?.trim()?.slice(0, 2).toUpperCase() || 'AS'

const loadArmorSets = async () => {
  isLoading.value = true
  error.value = ''
  try {
    const response = await fetchArmorSets(pagination.value.page, pageSize, activeSearch.value || undefined)
    if (!response.success) throw new Error(response.message || 'Failed to fetch armor set list')
    armorSets.value = response.data || []
    pagination.value = {
      total: response.pagination?.total ?? armorSets.value.length,
      page: response.pagination?.page ?? pagination.value.page,
      limit: response.pagination?.limit ?? pageSize,
      totalPages: response.pagination?.totalPages ?? 1,
    }
  } catch (cause) {
    armorSets.value = []
    pagination.value = { total: 0, page: pagination.value.page, limit: pageSize, totalPages: 1 }
    error.value = cause instanceof Error ? cause.message : 'Failed to fetch armor set list'
  } finally {
    isLoading.value = false
  }
}

const loadFromRoute = async () => {
  const next = routeState()
  const key = buildQueryKey(next.page, next.search)
  syncLocalStateFromRoute()
  if (lastLoadedKey.value === key) return
  lastLoadedKey.value = key
  await loadArmorSets()
}
const pushRouteState = async (page: number) => {
  const search = searchInput.value.trim()
  const query: Record<string, string> = {}
  if (page > 1) query.page = String(page)
  if (search) query.search = search
  activeSearch.value = search
  pagination.value = { ...pagination.value, page }
  lastLoadedKey.value = buildQueryKey(page, search)
  await router.push({ path: '/armor-sets', query })
  await loadArmorSets()
}
const applyFilters = async () => { await pushRouteState(1) }
const goToPage = async (page: number) => {
  if (page < 1 || page > totalPages.value || page === pagination.value.page) return
  await pushRouteState(page)
}
const reloadCurrentRoute = async () => {
  lastLoadedKey.value = ''
  await loadFromRoute()
}
watch(() => route.fullPath, () => { void loadFromRoute() }, { immediate: true })
</script>

<style scoped src="./entity-list-view.css"></style>
