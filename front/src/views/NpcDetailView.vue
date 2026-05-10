<template>
  <div class="public-workbench entity-detail-shell npc-detail-view page-wrap">
    <div class="public-breadcrumbs npc-detail-view__breadcrumbs">
      <router-link to="/">Home</router-link>
      <span>/</span>
      <router-link to="/npcs">NPCs</router-link>
      <span>/</span>
      <span class="public-breadcrumbs__current">{{ npc ? displayName : 'NPC Detail' }}</span>
    </div>

    <router-link to="/npcs" class="public-back-link npc-detail-view__back-link">
      <span aria-hidden="true">&larr;</span>
      <span>Back to NPC Directory</span>
    </router-link>

    <section v-if="isLoading" class="public-section-frame npc-detail-view__state">
      <div class="npc-detail-view__spinner" aria-hidden="true"></div>
      <p>Loading NPC profile...</p>
    </section>

    <section v-else-if="error" class="public-section-frame npc-detail-view__state npc-detail-view__state--error">
      <strong>Could not load NPC profile</strong>
      <p>{{ error }}</p>
      <button type="button" class="btn btn-brand" @click="loadNpc">Retry</button>
    </section>

    <section v-else-if="notFound" class="public-section-frame npc-detail-view__state">
      <strong>NPC not found</strong>
      <p>The requested public NPC profile is unavailable.</p>
    </section>

    <template v-else-if="npc">
      <section class="public-page-hero npc-detail-view__hero">
        <div class="npc-detail-view__portrait">
          <img v-if="portraitUrl" :src="portraitUrl" :alt="displayName" />
          <div v-else class="npc-detail-view__fallback">
            <span class="npc-detail-view__fallback-mark" aria-hidden="true">{{ portraitMark }}</span>
            <span>No portrait</span>
          </div>
        </div>

        <div class="npc-detail-view__hero-copy">
          <div class="npc-detail-view__badges">
            <span v-if="npc.isTownNpc" class="npc-detail-view__badge npc-detail-view__badge--accent">Town NPC</span>
            <span v-if="npc.isFriendly" class="npc-detail-view__badge">Friendly</span>
            <span class="npc-detail-view__badge">{{ npc.categoryName || 'Uncategorized' }}</span>
          </div>

          <h1 class="section-title">{{ displayName }}</h1>
          <p v-if="secondaryName" class="npc-detail-view__secondary">{{ secondaryName }}</p>
          <p v-if="displaySubName" class="npc-detail-view__subname">{{ displaySubName }}</p>
          <p class="npc-detail-view__hero-note">{{ npc.behaviorNotes?.trim() || 'No behavior notes have been published for this NPC yet.' }}</p>
        </div>
      </section>

      <section class="entity-detail-shell__content">
        <div class="entity-detail-shell__main npc-detail-view__sections">
        <article class="public-section-frame npc-section">
          <div class="npc-section__head">
            <div>
              <h2>Loot</h2>
              <p>Trusted structured drops tied to this public NPC aggregate.</p>
            </div>
            <span>{{ trustedLoot.length }}</span>
          </div>

          <div v-if="trustedLoot.length" class="npc-section__list">
            <article v-for="entry in trustedLoot" :key="`loot-${entry.id ?? entry.itemId ?? entry.itemInternalName}`" class="surface-card npc-entry">
              <div class="npc-entry__media">
                <img v-if="resolveImage(entry.imageUrl || entry.itemImage)" :src="resolveImage(entry.imageUrl || entry.itemImage)" :alt="entryTitle(entry)" />
                <div v-else class="npc-entry__fallback">ITEM</div>
              </div>

              <div class="npc-entry__body">
                <h3>{{ entryTitle(entry) }}</h3>
                <p v-if="entrySecondary(entry)" class="npc-entry__secondary">{{ entrySecondary(entry) }}</p>
                <div class="npc-entry__chips">
                  <span v-if="lootQuantityLabel(entry)">Qty {{ lootQuantityLabel(entry) }}</span>
                  <span v-if="lootChanceLabel(entry)">Chance {{ lootChanceLabel(entry) }}</span>
                  <span v-if="lootProvenanceLabel(entry)" class="npc-entry__chip--warning">{{ lootProvenanceLabel(entry) }}</span>
                </div>
                <p v-if="entry.conditions" class="npc-entry__note">{{ entry.conditions }}</p>
                <p v-else-if="entry.notes" class="npc-entry__note">{{ entry.notes }}</p>
              </div>
            </article>
          </div>

          <p v-else class="npc-section__empty">No trusted structured loot data yet</p>
        </article>

        <article v-if="fallbackLoot.length" class="public-section-frame npc-section">
          <div class="npc-section__head">
            <div>
              <h2>Fallback Loot</h2>
              <p>Visible fallback rows for review only; these are not counted as trusted structured drops.</p>
            </div>
            <span>{{ fallbackLoot.length }}</span>
          </div>

          <div class="npc-section__list">
            <article v-for="entry in fallbackLoot" :key="`fallback-loot-${entry.id ?? entry.itemId ?? entry.itemInternalName}`" class="surface-card npc-entry npc-entry--warning">
              <div class="npc-entry__media">
                <img v-if="resolveImage(entry.imageUrl || entry.itemImage)" :src="resolveImage(entry.imageUrl || entry.itemImage)" :alt="entryTitle(entry)" />
                <div v-else class="npc-entry__fallback">ITEM</div>
              </div>

              <div class="npc-entry__body">
                <h3>{{ entryTitle(entry) }}</h3>
                <p v-if="entrySecondary(entry)" class="npc-entry__secondary">{{ entrySecondary(entry) }}</p>
                <div class="npc-entry__chips">
                  <span v-if="lootQuantityLabel(entry)">Qty {{ lootQuantityLabel(entry) }}</span>
                  <span v-if="lootChanceLabel(entry)">Chance {{ lootChanceLabel(entry) }}</span>
                  <span class="npc-entry__chip--warning">{{ lootProvenanceLabel(entry) || 'Untrusted fallback' }}</span>
                </div>
                <p v-if="entry.conditions" class="npc-entry__note">{{ entry.conditions }}</p>
                <p v-else-if="entry.notes" class="npc-entry__note">{{ entry.notes }}</p>
              </div>
            </article>
          </div>
        </article>

        <article class="public-section-frame npc-section">
          <div class="npc-section__head">
            <div>
              <h2>Shop</h2>
              <p>Published shop inventory available from this NPC.</p>
            </div>
            <span>{{ shopEntries.length }}</span>
          </div>

          <div v-if="shopEntries.length" class="npc-section__list">
            <article v-for="entry in shopEntries" :key="`shop-${entry.id ?? entry.itemId ?? entry.itemInternalName}`" class="surface-card npc-entry">
              <div class="npc-entry__media">
                <img v-if="resolveImage(entry.imageUrl || entry.itemImage)" :src="resolveImage(entry.imageUrl || entry.itemImage)" :alt="entryTitle(entry)" />
                <div v-else class="npc-entry__fallback">ITEM</div>
              </div>

              <div class="npc-entry__body">
                <h3>{{ entryTitle(entry) }}</h3>
                <p v-if="entrySecondary(entry)" class="npc-entry__secondary">{{ entrySecondary(entry) }}</p>
                <div class="npc-entry__chips">
                  <span>{{ shopPriceLabel(entry) }}</span>
                </div>
                <p v-if="shopConditionsLabel(entry)" class="npc-entry__note">{{ shopConditionsLabel(entry) }}</p>
                <p v-else-if="entry.notes" class="npc-entry__note">{{ entry.notes }}</p>
              </div>
            </article>
          </div>

          <p v-else class="npc-section__empty">No shop inventory yet</p>
        </article>

        <article class="public-section-frame npc-section">
          <div class="npc-section__head">
            <div>
              <h2>Buffs</h2>
              <p>Buff relationships and support effects exposed by the aggregate endpoint.</p>
            </div>
            <span>{{ buffRelations.length }}</span>
          </div>

          <div v-if="buffRelations.length" class="npc-section__list">
            <article v-for="entry in buffRelations" :key="`buff-${entry.id ?? entry.buffId ?? entry.buffInternalName}`" class="surface-card npc-entry">
              <div class="npc-entry__media">
                <img v-if="resolveImage(entry.imageUrl || entry.buffImage)" :src="resolveImage(entry.imageUrl || entry.buffImage)" :alt="entryTitle(entry)" />
                <div v-else class="npc-entry__fallback">BUFF</div>
              </div>

              <div class="npc-entry__body">
                <h3>{{ entryTitle(entry) }}</h3>
                <p v-if="entrySecondary(entry)" class="npc-entry__secondary">{{ entrySecondary(entry) }}</p>
                <div class="npc-entry__chips">
                  <span v-if="buffDurationLabel(entry)">{{ buffDurationLabel(entry) }}</span>
                  <span v-if="entry.sourceText">{{ entry.sourceText }}</span>
                </div>
                <p v-if="entry.conditions" class="npc-entry__note">{{ entry.conditions }}</p>
                <p v-else-if="entry.notes" class="npc-entry__note">{{ entry.notes }}</p>
              </div>
            </article>
          </div>

          <p v-else class="npc-section__empty">No buff relationships yet</p>
        </article>

        <article v-if="traceableRelationSections.length" class="public-section-frame npc-section">
          <div class="npc-section__head">
            <div>
              <h2>Related Items</h2>
            </div>
            <span>{{ traceableRelationCount }}</span>
          </div>

          <div class="npc-trace-list">
            <section v-for="section in traceableRelationSections" :key="section.title" class="npc-trace-group">
              <h3>{{ section.title }}</h3>
              <article v-for="entry in section.entries" :key="entry.key" class="surface-card npc-trace-entry">
                <div>
                  <strong>{{ entry.title }}</strong>
                  <p v-if="entry.secondary">{{ entry.secondary }}</p>
                </div>
                <div class="npc-entry__chips">
                  <span v-if="entry.trace">{{ entry.trace }}</span>
                  <span v-if="entry.provider">{{ entry.provider }}</span>
                </div>
                <p v-if="entry.page" class="npc-entry__note">{{ entry.page }}</p>
              </article>
            </section>
          </div>
        </article>
        </div>

        <aside class="entity-detail-shell__sidebar npc-detail-view__sidebar">
          <article class="public-section-frame npc-detail-view__summary">
            <h2>Basic Profile</h2>
            <p>{{ npc.behaviorNotes?.trim() || 'No behavior notes have been published for this NPC yet.' }}</p>
          </article>

          <article class="public-section-frame npc-detail-view__facts-card">
            <h2>Profile Facts</h2>
            <dl class="npc-detail-view__facts">
              <div class="npc-detail-view__fact-card">
                <dt>Game ID</dt>
                <dd>{{ npc.gameId ?? '--' }}</dd>
              </div>
              <div class="npc-detail-view__fact-card">
                <dt>Internal Name</dt>
                <dd>{{ npc.internalName || '--' }}</dd>
              </div>
              <div class="npc-detail-view__fact-card">
                <dt>Category</dt>
                <dd>{{ npc.categoryName || '--' }}</dd>
              </div>
              <div class="npc-detail-view__fact-card">
                <dt>Aggregated</dt>
                <dd>{{ aggregatedAtLabel }}</dd>
              </div>
            </dl>
          </article>

          <article class="public-section-frame npc-detail-view__modules">
            <h2>Aggregate Modules</h2>
            <div class="npc-detail-view__module-list">
              <div class="npc-detail-view__module-row">
                <span>Loot</span>
                <strong>{{ aggregate?.moduleStatus?.loot || 'unknown' }}</strong>
              </div>
              <div class="npc-detail-view__module-row">
                <span>Shop</span>
                <strong>{{ aggregate?.moduleStatus?.shop || 'unknown' }}</strong>
              </div>
              <div class="npc-detail-view__module-row">
                <span>Buffs</span>
                <strong>{{ aggregate?.moduleStatus?.buffs || 'unknown' }}</strong>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchNpcAggregateById } from '@/api'
import type { NpcAggregateData, NpcBuffRelation, NpcLootEntry, NpcTraceableItemSummary } from '@/types'
import { entrySecondary, entryTitle, isTrustedDirectLoot, lootProvenanceLabel, shopConditionsLabel, shopPriceLabel } from '@/views/npcDetailEntry'

const route = useRoute()
const aggregate = ref<NpcAggregateData | null>(null)
const isLoading = ref(false)
const error = ref('')
const notFound = ref(false)

const npc = computed(() => aggregate.value?.npc ?? null)
const loot = computed(() => aggregate.value?.loot ?? [])
const trustedLoot = computed(() => loot.value.filter(isTrustedDirectLoot))
const fallbackLoot = computed(() => loot.value.filter(entry => !isTrustedDirectLoot(entry)))
const shopEntries = computed(() => aggregate.value?.shopEntries ?? [])
const buffRelations = computed(() => aggregate.value?.buffRelations ?? [])
const traceableRelationSections = computed(() => {
  const sections = [
    buildTraceableSection('Loot Items', npc.value?.lootItems ?? []),
    buildTraceableSection('Shop Items', npc.value?.shopItems ?? []),
    buildTraceableSection('Source Items', npc.value?.sourceItems ?? []),
  ]
  return sections.filter(section => section.entries.length > 0)
})
const traceableRelationCount = computed(() =>
  traceableRelationSections.value.reduce((total, section) => total + section.entries.length, 0),
)

const displayName = computed(() => npc.value?.nameZh?.trim() || npc.value?.name || 'Unknown NPC')
const secondaryName = computed(() => {
  if (!npc.value) return ''
  if (npc.value.nameZh?.trim()) {
    return npc.value.name?.trim() || npc.value.internalName?.trim() || ''
  }
  return npc.value.internalName?.trim() || ''
})
const displaySubName = computed(() => npc.value?.subNameZh?.trim() || npc.value?.subName?.trim() || '')
const portraitUrl = computed(() => resolveImage(npc.value?.imageUrl))
const portraitMark = computed(() => (npc.value?.isTownNpc ? 'TN' : npc.value?.isFriendly ? 'FR' : 'NPC'))
const aggregatedAtLabel = computed(() => formatDateTime(aggregate.value?.aggregatedAt) || '--')

function resolveImage(value?: string | null) {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return value.startsWith('/') ? value : `/${value}`
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function lootQuantityLabel(entry: NpcLootEntry) {
  if (entry.quantityText?.trim()) return entry.quantityText.trim()
  if (entry.quantityMin != null && entry.quantityMax != null && entry.quantityMin !== entry.quantityMax) {
    return `${entry.quantityMin}-${entry.quantityMax}`
  }
  if (entry.quantityMin != null) return String(entry.quantityMin)
  if (entry.quantityMax != null) return String(entry.quantityMax)
  return ''
}

function lootChanceLabel(entry: NpcLootEntry) {
  if (entry.chanceText?.trim()) return entry.chanceText.trim()
  if (typeof entry.chanceValue === 'number') return `${entry.chanceValue}%`
  return ''
}

function buffDurationLabel(entry: NpcBuffRelation) {
  if (entry.durationText?.trim()) return entry.durationText.trim()
  if (typeof entry.durationSeconds === 'number') return `${entry.durationSeconds}s`
  return ''
}

function buildTraceableSection(title: string, entries: NpcTraceableItemSummary[]) {
  return {
    title,
    entries: entries.slice(0, 8).map((entry, index) => ({
      key: String(entry.sourceFactKey ?? entry.itemId ?? entry.itemInternalName ?? `${title}-${index}`),
      title: traceableItemTitle(entry),
      secondary: [
        entry.relationType?.trim() ?? '',
        entry.itemInternalName?.trim() ?? '',
        entry.quantityText?.trim() ?? '',
        entry.chanceText?.trim() ?? '',
        entry.priceText?.trim() ?? '',
      ].filter(Boolean).join(' / '),
      trace: entry.sourceFactKey?.trim() ?? '',
      provider: entry.sourceProvider?.trim() ?? '',
      page: [
        entry.sourcePage?.trim() ?? '',
        entry.sourceRevisionTimestamp ? formatDateTime(entry.sourceRevisionTimestamp) : '',
      ].filter(Boolean).join(' / '),
    })),
  }
}

function traceableItemTitle(entry: NpcTraceableItemSummary) {
  return entry.itemNameZh?.trim()
    || entry.itemName?.trim()
    || entry.itemInternalName?.trim()
    || (typeof entry.itemId === 'number' ? `Item ${entry.itemId}` : 'Linked item')
}

async function loadNpc() {
  const npcId = Number(route.params.id)

  if (!Number.isInteger(npcId) || npcId === 0) {
    aggregate.value = null
    error.value = 'Invalid NPC id'
    notFound.value = false
    isLoading.value = false
    return
  }

  isLoading.value = true
  error.value = ''
  notFound.value = false

  try {
    const response = await fetchNpcAggregateById(npcId, 'loot,shop,buffs')

    if (!response.success) {
      if (response.statusCode === 404 || response.message === 'Npc not found') {
        aggregate.value = null
        error.value = ''
        notFound.value = true
        return
      }

      throw new Error(response.message || 'Failed to fetch npc detail')
    }

    if (!response.data?.npc?.id) {
      throw new Error('Invalid npc aggregate payload')
    }

    aggregate.value = response.data
  } catch (cause) {
    aggregate.value = null
    notFound.value = false
    error.value = cause instanceof Error ? cause.message : 'Failed to fetch npc detail'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    void loadNpc()
  },
  { immediate: true },
)
</script>

<style scoped>
.npc-detail-view {
  display: grid;
  gap: 1rem;
}

.npc-detail-view__state {
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  text-align: center;
  padding: 2rem 1.25rem;
}

.npc-detail-view__state strong {
  color: var(--text-primary);
  font-size: 1.1rem;
}

.npc-detail-view__state p {
  color: var(--text-secondary);
}

.npc-detail-view__state--error {
  border-color: color-mix(in srgb, var(--accent-error) 24%, var(--border-color));
}

.npc-detail-view__spinner {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-top-color: var(--accent-primary);
  animation: npc-spin 900ms linear infinite;
}

.npc-detail-view__hero {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
}

.npc-detail-view__portrait {
  min-height: 280px;
  display: grid;
  place-items: center;
  border-radius: 1.2rem;
  overflow: hidden;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent-primary) 14%, transparent), transparent 58%),
    color-mix(in srgb, white 62%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
}

.npc-detail-view__portrait img {
  width: 100%;
  max-height: 240px;
  object-fit: contain;
}

.npc-detail-view__fallback {
  display: grid;
  gap: 0.45rem;
  justify-items: center;
  color: var(--text-muted);
}

.npc-detail-view__fallback-mark {
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

.npc-detail-view__hero-copy,
.npc-detail-view__sidebar,
.npc-detail-view__sections {
  display: grid;
  gap: 1rem;
  align-content: start;
}

.npc-detail-view__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.npc-detail-view__badge {
  padding: 0.34rem 0.68rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}

.npc-detail-view__badge--accent {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
}

.npc-detail-view__secondary,
.npc-detail-view__subname,
.npc-detail-view__hero-note {
  color: var(--text-secondary);
}

.npc-detail-view__hero-note {
  line-height: 1.75;
}

.npc-detail-view__summary,
.npc-detail-view__facts-card,
.npc-detail-view__modules {
  display: grid;
  gap: 0.75rem;
}

.npc-detail-view__summary h2,
.npc-detail-view__facts-card h2,
.npc-detail-view__modules h2 {
  color: var(--text-primary);
  font-size: 1.05rem;
}

.npc-detail-view__summary p {
  color: var(--text-secondary);
}

.npc-detail-view__facts {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.npc-detail-view__fact-card {
  padding: 0.95rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  background: color-mix(in srgb, white 52%, var(--surface-soft));
}

.npc-detail-view__facts dt {
  color: var(--text-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.npc-detail-view__facts dd {
  margin-top: 0.3rem;
  color: var(--text-primary);
  font-size: 0.92rem;
  font-weight: 700;
}

.npc-detail-view__module-list {
  display: grid;
  gap: 0.65rem;
}

.npc-detail-view__module-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: 1rem;
  background: color-mix(in srgb, white 52%, var(--surface-soft));
}

.npc-detail-view__module-row span {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.npc-detail-view__module-row strong {
  color: var(--text-primary);
  text-transform: capitalize;
}

.npc-section {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.npc-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.npc-section__head h2 {
  color: var(--text-primary);
  font-size: 1.15rem;
}

.npc-section__head p {
  margin-top: 0.3rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.npc-section__head span {
  min-width: 2.2rem;
  min-height: 2.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--accent-primary);
  font-weight: 800;
}

.npc-section__list {
  display: grid;
  gap: 0.85rem;
}

.npc-trace-list,
.npc-trace-group,
.npc-trace-entry {
  display: grid;
  gap: 0.75rem;
}

.npc-trace-group h3 {
  color: var(--text-primary);
  font-size: 0.98rem;
}

.npc-trace-entry {
  padding: 0.85rem;
  border-radius: 1rem;
  background: color-mix(in srgb, white 52%, var(--surface-soft));
}

.npc-trace-entry strong {
  color: var(--text-primary);
}

.npc-trace-entry p {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.npc-section__empty {
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.npc-entry {
  display: grid;
  gap: 0.85rem;
  padding: 0.9rem;
  grid-template-columns: 72px minmax(0, 1fr);
  border-radius: 1rem;
  background: color-mix(in srgb, white 52%, var(--surface-soft));
}

.npc-entry__media {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 1rem;
  background: color-mix(in srgb, white 62%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  overflow: hidden;
}

.npc-entry__media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.npc-entry__fallback {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.npc-entry__body {
  display: grid;
  gap: 0.45rem;
}

.npc-entry__body h3 {
  color: var(--text-primary);
  font-size: 1rem;
}

.npc-entry__secondary,
.npc-entry__note {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.npc-entry__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.npc-entry__chips span {
  padding: 0.28rem 0.56rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
}

.npc-entry__chips .npc-entry__chip--warning {
  background: color-mix(in srgb, #f59e0b 18%, var(--bg-secondary) 82%);
  color: #92400e;
}

.npc-entry--warning {
  border-color: color-mix(in srgb, #f59e0b 28%, transparent);
}

@keyframes npc-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 840px) {
  .npc-detail-view__hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .npc-detail-view__facts {
    grid-template-columns: 1fr;
  }

  .npc-entry {
    grid-template-columns: 1fr;
  }

  .npc-entry__media {
    width: 100%;
    height: 120px;
  }
}
</style>
