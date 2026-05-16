<template>
  <div class="entity-list-view public-workbench page-wrap">
    <section class="public-page-hero entity-list-view__hero">
      <div class="public-page-hero__layout">
        <div class="public-page-hero__copy">
          <span class="section-eyebrow">Atlas Workbench</span>
          <h1 class="section-title section-title--hero">Buff Archive</h1>
          <p class="section-copy section-copy--wide">
            Inspect public buff effects with managed icon fallback, search, and quick support metadata.
          </p>
        </div>
        <div class="public-page-hero__meta entity-list-view__hero-meta">
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Results</span>
            <strong class="public-hero-stat-card__value">{{ pagination.total }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Focus</span>
            <strong class="public-hero-stat-card__value">{{ activeSearch ? 'Filtered' : 'All public buffs' }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Page</span>
            <strong class="public-hero-stat-card__value">{{ pagination.page }} / {{ totalPages }}</strong>
          </article>
        </div>
      </div>
    </section>

    <section class="public-summary-strip entity-list-view__filters">
      <form class="entity-list-view__toolbar" @submit.prevent="applyFilters">
        <label class="entity-list-view__field">
          <span>Search Buffs</span>
          <input v-model.trim="searchInput" type="search" class="entity-list-view__input" placeholder="Search by buff name or internal name" />
        </label>
        <button type="submit" class="btn btn-brand entity-list-view__action">Search</button>
      </form>

      <div class="public-summary-strip__meta">
        <span class="public-chip public-chip--accent">{{ activeSearch ? `Search: ${activeSearch}` : 'No search filter' }}</span>
        <span class="public-chip">Public list only</span>
      </div>
    </section>

    <section v-if="isLoading" class="public-section-frame entity-list-view__state">
      <div class="entity-list-view__spinner" aria-hidden="true"></div>
      <p>Loading buffs...</p>
    </section>

    <section v-else-if="error" class="public-section-frame entity-list-view__state entity-list-view__state--error">
      <strong>Could not load buffs</strong>
      <p>{{ error }}</p>
      <button type="button" class="btn btn-brand" @click="reloadCurrentRoute">Retry</button>
    </section>

    <template v-else>
      <section class="public-section-frame entity-list-view__summary">
        <div>
          <p class="entity-list-view__caption">Current slice</p>
          <h2>{{ activeSearch ? 'Search results' : 'All public buffs' }}</h2>
        </div>

        <div class="entity-list-view__meta">
          <span>{{ pagination.total }} results</span>
          <span>Page {{ pagination.page }} / {{ totalPages }}</span>
        </div>
      </section>

      <section v-if="buffs.length === 0" class="public-section-frame entity-list-view__state">
        <strong>No buffs found</strong>
        <p>Try a broader search term.</p>
      </section>

      <section v-else class="entity-list-view__grid">
        <article v-for="buff in buffs" :key="buff.id" class="public-section-frame entity-card" @click="openBuffDetail(buff)">
          <div class="entity-card__portrait">
            <img v-if="resolveImage(buff.imageUrl)" :src="resolveImage(buff.imageUrl)" :alt="displayName(buff)" loading="lazy" />
            <div v-else class="entity-card__fallback">
              <span class="entity-card__fallback-mark" aria-hidden="true">{{ fallbackMark(buff.internalName) }}</span>
              <span>No managed icon</span>
            </div>
          </div>

          <div class="entity-card__body">
            <div class="entity-card__badges">
              <span v-if="buff.buffType" class="entity-card__badge entity-card__badge--accent">{{ buff.buffType }}</span>
              <span class="entity-card__badge">Source items {{ buff.sourceItemCount ?? 0 }}</span>
            </div>

            <div class="entity-card__heading">
              <h3>{{ displayName(buff) }}</h3>
              <p v-if="buff.internalName" class="entity-card__secondary">{{ buff.internalName }}</p>
            </div>

            <p v-if="buff.tooltipZh" class="entity-card__summary">{{ buff.tooltipZh }}</p>
            <p v-else class="entity-card__summary entity-card__summary--muted">Tooltip not published yet.</p>

            <dl class="entity-card__facts">
              <div>
                <dt>Immune NPCs</dt>
                <dd>{{ buff.immuneNpcCount ?? 0 }}</dd>
              </div>
              <div>
                <dt>Source items</dt>
                <dd>{{ buff.sourceItemCount ?? 0 }}</dd>
              </div>
            </dl>
          </div>
        </article>
      </section>

      <section v-if="selectedBuff" class="public-section-frame entity-card entity-card--detail">
        <div class="entity-card__heading">
          <h3>{{ displayName(selectedBuff) }}</h3>
          <p v-if="selectedBuff.internalName" class="entity-card__secondary">{{ selectedBuff.internalName }}</p>
        </div>
        <dl class="entity-card__facts">
          <div>
            <dt>Source items</dt>
            <dd>{{ selectedBuff.sourceItems?.length ?? selectedBuff.sourceItemCount ?? 0 }}</dd>
          </div>
          <div>
            <dt>Inflicting NPCs</dt>
            <dd>{{ selectedBuff.inflictingNpcs?.length ?? selectedBuff.inflictingNpcCount ?? 0 }}</dd>
          </div>
          <div>
            <dt>Immune NPCs</dt>
            <dd>{{ selectedBuff.immuneNpcs?.length ?? selectedBuff.immuneNpcCount ?? 0 }}</dd>
          </div>
        </dl>
        <div class="entity-card__body">
          <p v-if="selectedBuff.sourceEvidence?.parseStatus" class="entity-card__summary">
            Evidence: {{ selectedBuff.sourceEvidence.parseStatus }} from {{ selectedBuff.sourceEvidence.pageTitle || selectedBuff.provenance?.pageTitle || 'unknown page' }}
          </p>
          <p v-else class="entity-card__summary entity-card__summary--muted">Evidence provenance is not available yet.</p>

          <section class="entity-card__section">
            <h4>Source Items</h4>
            <div v-if="selectedBuff.sourceItems?.length" class="entity-card__fact-grid">
              <article v-for="fact in selectedBuff.sourceItems" :key="factKey(fact)" class="entity-card__fact">
                <img v-if="resolveImage(fact.imageUrl)" :src="resolveImage(fact.imageUrl)" :alt="factName(fact)" loading="lazy" />
                <div v-else class="entity-card__fallback entity-card__fallback--small">IT</div>
                <strong>{{ factName(fact) }}</strong>
                <span>{{ fact.internalName || fact.sourcePage || 'resolved item' }}</span>
              </article>
            </div>
            <p v-else class="entity-card__summary entity-card__summary--muted">No source item facts are published for this buff.</p>
          </section>

          <section class="entity-card__section">
            <h4>Inflicting NPCs</h4>
            <div v-if="selectedBuff.inflictingNpcs?.length" class="entity-card__fact-grid">
              <component
                :is="npcFactRoute(fact) ? RouterLink : 'article'"
                v-for="fact in selectedBuff.inflictingNpcs"
                :key="factKey(fact)"
                class="entity-card__fact entity-card__fact--npc"
                :class="{ 'entity-card__fact--linked': npcFactRoute(fact) }"
                v-bind="npcFactRoute(fact) ? { to: npcFactRoute(fact) } : {}"
              >
                <img v-if="resolveImage(fact.imageUrl)" :src="resolveImage(fact.imageUrl)" :alt="factName(fact)" loading="lazy" />
                <div v-else class="entity-card__fallback entity-card__fallback--small">NP</div>
                <strong>{{ factName(fact) }}</strong>
                <span>{{ fact.internalName || fact.relationType || 'inflicts' }}</span>
                <small>{{ factIdLabel(fact) }}</small>
                <small v-if="fact.sourceId != null">Game ID {{ fact.sourceId }}</small>
              </component>
            </div>
            <p v-else class="entity-card__summary entity-card__summary--muted">No inflicting NPC facts are published for this buff.</p>
          </section>

          <section class="entity-card__section">
            <h4>Immune NPCs</h4>
            <div v-if="visibleImmuneNpcs.length" class="entity-card__fact-grid">
              <component
                :is="npcFactRoute(fact) ? RouterLink : 'article'"
                v-for="fact in visibleImmuneNpcs"
                :key="factKey(fact)"
                class="entity-card__fact entity-card__fact--npc"
                :class="{ 'entity-card__fact--linked': npcFactRoute(fact) }"
                v-bind="npcFactRoute(fact) ? { to: npcFactRoute(fact) } : {}"
              >
                <img v-if="resolveImage(fact.imageUrl)" :src="resolveImage(fact.imageUrl)" :alt="factName(fact)" loading="lazy" />
                <div v-else class="entity-card__fallback entity-card__fallback--small">NP</div>
                <strong>{{ factName(fact) }}</strong>
                <span>{{ fact.internalName || fact.sourceSection || 'immune' }}</span>
                <small>{{ factIdLabel(fact) }}</small>
                <small v-if="fact.sourceId != null">Game ID {{ fact.sourceId }}</small>
              </component>
            </div>
            <p v-if="hiddenImmuneNpcCount > 0" class="entity-card__summary entity-card__summary--muted">
              Showing {{ visibleImmuneNpcs.length }} of {{ selectedBuff.immuneNpcs?.length }} immune NPCs.
            </p>
            <p v-else-if="!visibleImmuneNpcs.length" class="entity-card__summary entity-card__summary--muted">No full immune NPC facts are published for this buff.</p>
          </section>
        </div>
      </section>

      <section v-if="totalPages > 1" class="public-pager-shell entity-list-view__pager">
        <button type="button" class="btn btn-soft" :disabled="pagination.page <= 1" @click="goToPage(pagination.page - 1)">Prev</button>
        <div class="entity-list-view__page-list">
          <button
            v-for="page in displayedPages"
            :key="page"
            type="button"
            class="entity-list-view__page-chip"
            :class="{ 'entity-list-view__page-chip--active': page === pagination.page }"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
        </div>
        <button type="button" class="btn btn-soft" :disabled="pagination.page >= totalPages" @click="goToPage(pagination.page + 1)">Next</button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { fetchBuffById, fetchBuffs } from '@/api'
import type { BuffDetailItem, BuffFactSummary, BuffListItem, Pagination } from '@/types'

const route = useRoute()
const router = useRouter()
const pageSize = 12
const immuneNpcPreviewLimit = 24

const buffs = ref<BuffListItem[]>([])
const selectedBuff = ref<BuffDetailItem | null>(null)
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

const displayName = (buff: BuffListItem) => buff.nameZh?.trim() || buff.name?.trim() || buff.internalName?.trim() || 'Unknown Buff'
const factName = (fact: { nameZh?: string | null; name?: string | null; internalName?: string | null; sourceId?: number | null }) =>
  fact.nameZh?.trim() || fact.name?.trim() || fact.internalName?.trim() || `Fact ${fact.sourceId ?? '--'}`
const factKey = (fact: { id?: number | null; sourceId?: number | null; internalName?: string | null; name?: string | null }) =>
  `${fact.id ?? fact.sourceId ?? fact.internalName ?? fact.name ?? 'fact'}`
const npcFactRoute = (fact: BuffFactSummary) => typeof fact.id === 'number' && Number.isFinite(fact.id) ? `/npcs/${fact.id}` : null
const factIdLabel = (fact: BuffFactSummary) => `ID ${fact.id ?? '--'}`
const isRawWikiImageUrl = (value?: string | null) => Boolean(value?.toLowerCase().includes('terraria.wiki.gg/images/'))
const resolveImage = (value?: string | null) => {
  if (!value || isRawWikiImageUrl(value)) return ''
  return value.startsWith('http://') || value.startsWith('https://') ? value : value.startsWith('/') ? value : `/${value}`
}
const fallbackMark = (value?: string | null) => value?.trim()?.slice(0, 2).toUpperCase() || 'BF'
const visibleImmuneNpcs = computed(() => (selectedBuff.value?.immuneNpcs || []).slice(0, immuneNpcPreviewLimit))
const hiddenImmuneNpcCount = computed(() => Math.max(0, (selectedBuff.value?.immuneNpcs?.length || 0) - visibleImmuneNpcs.value.length))

const openBuffDetail = async (buff: BuffListItem) => {
  const response = await fetchBuffById(buff.id)
  selectedBuff.value = response.success ? response.data : null
}

const loadBuffs = async () => {
  isLoading.value = true
  error.value = ''
  try {
    const response = await fetchBuffs(pagination.value.page, pageSize, activeSearch.value || undefined)
    if (!response.success) throw new Error(response.message || 'Failed to fetch buff list')
    buffs.value = response.data || []
    pagination.value = {
      total: response.pagination?.total ?? buffs.value.length,
      page: response.pagination?.page ?? pagination.value.page,
      limit: response.pagination?.limit ?? pageSize,
      totalPages: response.pagination?.totalPages ?? 1,
    }
  } catch (cause) {
    buffs.value = []
    pagination.value = { total: 0, page: pagination.value.page, limit: pageSize, totalPages: 1 }
    error.value = cause instanceof Error ? cause.message : 'Failed to fetch buff list'
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
  await loadBuffs()
}

const pushRouteState = async (page: number) => {
  const search = searchInput.value.trim()
  const query: Record<string, string> = {}
  if (page > 1) query.page = String(page)
  if (search) query.search = search
  activeSearch.value = search
  pagination.value = { ...pagination.value, page }
  lastLoadedKey.value = buildQueryKey(page, search)
  await router.push({ path: '/buffs', query })
  await loadBuffs()
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
