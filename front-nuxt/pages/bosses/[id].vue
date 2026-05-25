<script setup lang="ts">
import { usePublicBossDetail } from '~/composables/usePublicBossDetail'
import type {
  BossConditionDTO,
  BossDifficultyNoteDTO,
  BossMechanicNoteDTO,
  BossSummonItemDTO,
} from '~/types/public-api'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'boss', density: 'readable' })
const bossClientReady = ref(false)
const bossDetailVisualLoading = ref(true)
const bossDetailVisualLoadingMinimumMs = 180
let bossDetailVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let bossDetailVisualLoadingStartedAt = Date.now()

const bossRouteId = computed(() => String(route.params.id ?? '').trim())

const {
  data: bossBundle,
  pending: bossPending,
  error: bossError,
  refresh: refreshBossDetail,
} = await usePublicBossDetail(bossRouteId)

const bossDetail = computed(() => bossBundle.value?.detail ?? null)
const bossCard = computed(() => bossBundle.value?.item ?? null)
const bossMembers = computed(() => bossBundle.value?.members ?? [])
const bossReferenceMembers = computed(() => bossBundle.value?.referenceMembers ?? [])
const bossVisibleMembers = computed(() => bossMembers.value.length ? bossMembers.value : bossReferenceMembers.value)
const bossUsesReferenceMembers = computed(() => !bossMembers.value.length && bossReferenceMembers.value.length > 0)
const bossLootEntries = computed(() => bossBundle.value?.lootEntries ?? [])
const bossRawLoading = computed(() => !bossClientReady.value || bossPending.value)
const bossMissing = computed(() => bossClientReady.value && !bossPending.value && !bossDetail.value)
const bossTitle = computed(() => bossCard.value?.displayName || bossDetail.value?.nameZh || bossDetail.value?.name || 'Boss 详情')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const rawPublicCopyPattern = /{{|}}|<\/?[a-z][\s\S]*?>|https?:\/\/|wiki\.gg|iteminfo|eicons|internal|wiki\s*(?:page|path)|(?:^|[\s_-])shop[\s_/-]*\d+(?:[\s_/-]*\d+)*(?:$|[\s_-])/i
const safeBossDisplayText = (...values: unknown[]) => {
  for (const value of values) {
    const text = displayText(value).replace(/\s+/g, ' ')
    if (text && !rawPublicCopyPattern.test(text)) return text
  }

  return ''
}
const bossSubtitle = computed(() => safeBossDisplayText(bossCard.value?.englishName, bossDetail.value?.nameEn) || '公开 Boss 资料')
const bossProgressionLabel = computed(() => (
  bossCard.value?.progressionOrder == null ? '顺序未标注' : `推进 #${bossCard.value.progressionOrder}`
))
const bossTypeLabel = computed(() => {
  const key = displayText(bossCard.value?.type, bossDetail.value?.bossType).toLowerCase()
  if (key === 'pre_hardmode') return '困难模式前'
  if (key === 'hardmode') return '困难模式'
  if (key === 'event') return '事件 Boss'
  if (key === 'mini_boss' || key === 'miniboss') return '小 Boss'
  return 'Boss'
})

useSeoMeta({
  title: () => `TerraPedia · ${bossTitle.value}`,
  description: () => `${bossTitle.value} 的公开 Boss 资料详情，包含成员、掉落和推进信息。`,
})

const entryImage = (value: { itemImage?: string | null; imageUrl?: string | null }) => resolvePreviewImageUrl(value.itemImage || value.imageUrl || '')
const memberImage = (value: { imageUrl?: string | null }) => resolvePreviewImageUrl(value.imageUrl || '')
const lootTitle = (entry: { itemNameZh?: string | null; itemName?: string | null; itemInternalName?: string | null }) => (
  safeBossDisplayText(entry.itemNameZh, entry.itemName) || '未命名掉落'
)
const dropSourceKindLabel = (value: unknown) => {
  const key = displayText(value).toLowerCase()
  if (key === 'direct_boss') return '直接掉落'
  if (key === 'treasure_bag') return '宝藏袋'
  return ''
}
const asArray = <T,>(value: T[] | null | undefined) => Array.isArray(value) ? value : []
const bossSummonMethod = computed(() => safeBossDisplayText(
  bossDetail.value?.summonMethodResolved,
  bossDetail.value?.summonMethod,
  bossCard.value?.summonMethod,
))
const bossSummonItems = computed(() => asArray(bossDetail.value?.summonItems)
  .filter((item) => summonItemTitle(item)))
const bossSummonConditions = computed(() => asArray(bossDetail.value?.summonConditions)
  .filter((condition) => bossConditionCopy(condition)))
const bossMechanicNotes = computed(() => asArray(bossDetail.value?.mechanicNotes)
  .filter((note) => bossMechanicCopy(note)))
const bossDifficultyNotes = computed(() => asArray(bossDetail.value?.difficultyNotes)
  .filter((note) => bossDifficultyCopy(note)))
const summonItemTitle = (item: BossSummonItemDTO) => safeBossDisplayText(item.nameZh, item.name)
const bossSummonItemPath = (item: BossSummonItemDTO) => {
  const id = displayText(item.itemId)
  return id ? `/items/${id}` : ''
}
const summonItemImage = (item: BossSummonItemDTO) => resolvePreviewImageUrl(item.imageUrl || '')
const bossConditionCopy = (condition: BossConditionDTO) => (
  [safeBossDisplayText(condition.label), safeBossDisplayText(condition.value)]
    .filter(Boolean)
    .join(' · ')
)
const bossMechanicCopy = (note: BossMechanicNoteDTO) => safeBossDisplayText(note.description)
const bossMechanicTitle = (note: BossMechanicNoteDTO) => safeBossDisplayText(note.title) || '机制提示'
const bossDifficultyCopy = (note: BossDifficultyNoteDTO) => safeBossDisplayText(note.description)
const bossLootConditionLabel = (entry: { conditions?: string | null }) => safeBossDisplayText(entry.conditions)
const bossLootNoteLabel = (entry: { notes?: string | null }) => safeBossDisplayText(entry.notes)
const bossLootChanceLabel = (entry: { chanceText?: string | null; dropSourceKind?: string | null }) => (
  safeBossDisplayText(entry.chanceText) || dropSourceKindLabel(entry.dropSourceKind) || '概率未标注'
)
const bossLootDetailLabel = (entry: { quantityText?: string | null; conditions?: string | null; notes?: string | null }) => (
  [safeBossDisplayText(entry.quantityText), bossLootConditionLabel(entry), bossLootNoteLabel(entry)]
    .filter(Boolean)
    .join(' · ') || '掉落条件未标注'
)
const bossSummaryText = computed(() => safeBossDisplayText(
  bossCard.value?.summary,
  bossDetail.value?.notes,
  '暂无公开说明。',
))
const bossMemberTagLabel = computed(() => {
  if (bossMembers.value.length) return `${bossMembers.value.length} 个成员`
  if (bossReferenceMembers.value.length) return `${bossReferenceMembers.value.length} 个参考成员`
  return '暂无成员'
})
const bossMemberSummaryText = computed(() => {
  if (bossMembers.value.length) return `包含 ${bossMembers.value.length} 个实体或部件。`
  if (bossReferenceMembers.value.length) return `暂无直接成员记录，可参考 ${bossReferenceMembers.value.length} 个关联成员。`
  return '暂无成员资料。'
})
const bossMemberSectionTitle = computed(() => bossUsesReferenceMembers.value ? '参考成员' : '成员')
const bossReadinessCopy = computed(() => {
  if (bossDetailVisualLoading.value) return '正在整理 Boss 详情、成员和掉落'
  return bossBundle.value?.source === 'api' ? '资料已更新，可查看召唤、成员和掉落' : '资料暂不可用'
})
const bossReadinessState = computed(() => {
  if (bossError.value) return '更新失败'
  if (bossPending.value) return '正在更新'
  return bossBundle.value?.source === 'api' ? '已更新' : '稍后重试'
})
const bossSummonStatusRows = computed(() => [
  {
    label: '召唤说明',
    value: bossSummonMethod.value || '公开资料暂未标注召唤方式、召唤物或触发条件',
  },
  ...(
    bossSummonItems.value.length || bossSummonConditions.value.length
      ? []
      : [{
    label: '补充资料',
    value: '召唤物、自然出现和特殊触发条件暂无可展示记录',
      }]
  ),
])
const bossMemberRoleLabel = (bossRole: unknown, sourceBossCode: unknown) => {
  const key = displayText(bossRole, sourceBossCode).toLowerCase()
  if (key === 'primary' || key === 'main' || key === 'body') return '本体'
  if (key === 'part' || key === 'segment' || key === 'body_part') return '部件'
  if (key === 'minion' || key === 'summon') return '召唤体'
  return '成员'
}
const bossMemberPath = (member: { gameId?: string | number | null; id?: string | number | null }) => {
  const id = displayText(member.gameId, member.id)
  return id ? `/npcs/${id}` : '/npcs'
}
const bossLootItemPath = (entry: { itemId?: string | number | null }) => {
  const id = displayText(entry.itemId)
  return id ? `/items/${id}` : ''
}
const bossLootGroupKey = (entry: { dropSourceKind?: string | null; conditions?: string | null }) => {
  if (bossLootConditionLabel(entry)) return 'conditional'
  const key = displayText(entry.dropSourceKind).toLowerCase()
  if (key === 'treasure_bag') return 'treasureBag'
  return 'direct'
}
const bossLootGroupMeta = {
  direct: { title: '普通掉落', meta: 'Boss 本体直接掉落' },
  treasureBag: { title: '宝藏袋', meta: '专家或大师模式奖励' },
  conditional: { title: '条件掉落', meta: '需要特定版本、事件或条件' },
} as const
const bossLootGroups = computed(() => {
  const buckets = new Map<keyof typeof bossLootGroupMeta, typeof bossLootEntries.value>()

  for (const entry of bossLootEntries.value) {
    const key = bossLootGroupKey(entry) as keyof typeof bossLootGroupMeta
    buckets.set(key, [...(buckets.get(key) ?? []), entry])
  }

  return (Object.keys(bossLootGroupMeta) as Array<keyof typeof bossLootGroupMeta>)
    .map((key) => ({
      key,
      title: bossLootGroupMeta[key].title,
      meta: bossLootGroupMeta[key].meta,
      entries: buckets.get(key) ?? [],
    }))
    .filter((group) => group.entries.length > 0)
})

const clearBossDetailVisualLoadingTimer = () => {
  if (bossDetailVisualLoadingTimer) {
    clearTimeout(bossDetailVisualLoadingTimer)
    bossDetailVisualLoadingTimer = null
  }
}

const syncBossDetailVisualLoading = (isLoading: boolean) => {
  clearBossDetailVisualLoadingTimer()

  if (isLoading) {
    bossDetailVisualLoadingStartedAt = Date.now()
    bossDetailVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - bossDetailVisualLoadingStartedAt
  const remaining = Math.max(0, bossDetailVisualLoadingMinimumMs - elapsed)

  bossDetailVisualLoadingTimer = setTimeout(() => {
    bossDetailVisualLoading.value = false
    bossDetailVisualLoadingTimer = null
  }, remaining)
}

watch(bossRawLoading, syncBossDetailVisualLoading, { immediate: true })

onMounted(() => {
  bossClientReady.value = true
})

onBeforeUnmount(clearBossDetailVisualLoadingTimer)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main :class="['boss-detail-shell', detailLayout.detailShellClass]" :aria-busy="bossDetailVisualLoading">
      <section class="boss-detail-hero support-panel">
        <div class="boss-detail-portrait">
          <CommonTpSkeleton v-if="bossDetailVisualLoading" type="icon" />
          <CommonPreviewImage
            v-else
            :src="bossCard?.image || ''"
            :alt="bossTitle"
            :fallback="bossCard?.fallback || firstGlyph(bossTitle)"
            :source-image="bossCard?.sourceImage || ''"
            width="120"
            height="120"
          />
        </div>

        <div>
          <span class="eyebrow">
            <CommonTpSkeleton v-if="bossDetailVisualLoading" type="pill" />
            <template v-else>Boss · {{ bossSubtitle }}</template>
          </span>
          <h1>
            <CommonTpSkeleton v-if="bossDetailVisualLoading" type="line" />
            <template v-else>{{ bossTitle }}</template>
          </h1>
          <p>
            <CommonTpSkeleton v-if="bossDetailVisualLoading" type="line" />
            <template v-else>{{ bossSummaryText }}</template>
          </p>
          <div v-if="bossDetailVisualLoading" class="tag-row boss-detail-loading-tags">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
          <div v-else-if="bossMissing" class="tag-row boss-detail-missing-tags">
            <span class="tag paper">详情缺失</span>
            <span v-if="bossError" class="tag moss">载入异常</span>
          </div>
          <div v-else class="tag-row">
            <span class="tag gold">{{ bossTypeLabel }}</span>
            <span class="tag moss">{{ bossProgressionLabel }}</span>
            <span class="tag paper">{{ bossLootEntries.length }} 条掉落</span>
            <span class="tag paper">{{ bossMemberTagLabel }}</span>
          </div>
        </div>

        <aside class="boss-readiness">
          <b>{{ bossDetailVisualLoading ? '加载资料' : '公开资料' }}</b>
          <span>{{ bossReadinessCopy }}</span>
          <em>{{ bossReadinessState }}</em>
        </aside>
      </section>

      <section v-if="bossDetailVisualLoading" class="boss-phase-grid">
        <article v-for="slot in 3" :key="`boss-detail-loading-${slot}`" class="support-panel boss-phase">
          <span><CommonTpSkeleton type="pill" /></span>
          <h2><CommonTpSkeleton type="line" /></h2>
          <p><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></p>
        </article>
      </section>

      <section v-else-if="bossMissing" class="search-suggestion-band support-panel">
        <div>
          <b>Boss 详情暂未载入</b>
          <span>当前 ID 没有返回公开资料，页面不会展示静态样例。</span>
        </div>
        <button class="small-button active" type="button" @click="refreshBossDetail()">重新加载</button>
      </section>

      <template v-else>
        <section class="boss-phase-grid">
          <article :class="['support-panel boss-phase active', detailLayout.detailModuleClass]">
            <h2>召唤与触发</h2>
            <p>{{ bossSummonMethod || '当前资料还没有明确的召唤物和触发条件。' }}</p>
          </article>
          <article :class="['support-panel boss-phase', detailLayout.detailModuleClass]">
            <h2>成员</h2>
            <p>{{ bossMemberSummaryText }}</p>
          </article>
          <article :class="['support-panel boss-phase', detailLayout.detailModuleClass]">
            <h2>掉落</h2>
            <p>{{ bossLootEntries.length ? `整理 ${bossLootEntries.length} 条掉落记录。` : '暂无掉落资料。' }}</p>
          </article>
        </section>

        <section :class="['boss-detail-grid', detailLayout.detailGridClass, detailLayout.detailDensityClass]">
          <article :class="['support-panel loot-panel', detailLayout.detailModuleClass]">
            <span class="eyebrow">掉落</span>
            <div v-for="group in bossLootGroups" :key="group.key" class="detail-loot-group">
              <div class="detail-loot-group-title">
                <b>{{ group.title }}</b>
                <span>{{ group.entries.length }} 条 · {{ group.meta }}</span>
              </div>
              <div v-for="entry in group.entries.slice(0, 8)" :key="entry.id ?? `${entry.itemId}-${entry.itemName}`" :class="['loot-row detail-loot-row', detailLayout.detailRelationRowClass]">
                <CommonPreviewImage
                  :src="entryImage(entry)"
                  :alt="lootTitle(entry)"
                  :fallback="firstGlyph(lootTitle(entry))"
                  width="44"
                  height="44"
                />
                <div class="detail-loot-copy">
                  <NuxtLink v-if="bossLootItemPath(entry)" :to="bossLootItemPath(entry)" class="detail-loot-link">
                    <b>{{ lootTitle(entry) }}</b>
                  </NuxtLink>
                  <b v-else>{{ lootTitle(entry) }}</b>
                  <span>{{ bossLootDetailLabel(entry) }}</span>
                </div>
                <em>{{ bossLootChanceLabel(entry) }}</em>
              </div>
              <details v-if="group.entries.length > 8" class="detail-group-remainder">
                <summary>展开其余 {{ group.entries.length - 8 }} 条</summary>
                <div v-for="entry in group.entries.slice(8)" :key="entry.id ?? `${entry.itemId}-${entry.itemName}`" :class="['loot-row detail-loot-row', detailLayout.detailRelationRowClass]">
                  <CommonPreviewImage
                    :src="entryImage(entry)"
                    :alt="lootTitle(entry)"
                    :fallback="firstGlyph(lootTitle(entry))"
                    width="44"
                    height="44"
                  />
                  <div class="detail-loot-copy">
                    <NuxtLink v-if="bossLootItemPath(entry)" :to="bossLootItemPath(entry)" class="detail-loot-link">
                      <b>{{ lootTitle(entry) }}</b>
                    </NuxtLink>
                    <b v-else>{{ lootTitle(entry) }}</b>
                    <span>{{ bossLootDetailLabel(entry) }}</span>
                  </div>
                  <em>{{ bossLootChanceLabel(entry) }}</em>
                </div>
              </details>
            </div>
            <div v-if="!bossLootEntries.length" :class="['loot-row', detailLayout.detailRelationRowClass]">
              <b>暂无掉落</b><span>当前没有可展示的掉落记录。</span><em>待补充</em>
            </div>
          </article>

          <article :class="['support-panel prep-panel', detailLayout.detailModuleClass]">
            <span class="eyebrow">召唤与触发</span>
            <div class="boss-summon-facts">
              <div v-for="row in bossSummonStatusRows" :key="row.label">
                <b>{{ row.label }}</b>
                <span>{{ row.value }}</span>
              </div>
            </div>
            <div v-if="bossSummonItems.length" class="boss-contract-list boss-summon-items">
              <span class="eyebrow">召唤物</span>
              <div v-for="item in bossSummonItems" :key="displayText(item.itemId, summonItemTitle(item))" :class="['boss-contract-row boss-contract-item', detailLayout.detailRelationRowClass]">
                <CommonPreviewImage
                  :src="summonItemImage(item)"
                  :alt="summonItemTitle(item)"
                  :fallback="firstGlyph(summonItemTitle(item))"
                  width="40"
                  height="40"
                />
                <NuxtLink v-if="bossSummonItemPath(item)" :to="bossSummonItemPath(item)">
                  <b>{{ summonItemTitle(item) }}</b>
                </NuxtLink>
                <b v-else>{{ summonItemTitle(item) }}</b>
              </div>
            </div>
            <div v-if="bossSummonConditions.length" class="boss-contract-list">
              <span class="eyebrow">触发条件</span>
              <div v-for="condition in bossSummonConditions" :key="bossConditionCopy(condition)" :class="['boss-contract-row', detailLayout.detailRelationRowClass]">
                <span>{{ bossConditionCopy(condition) }}</span>
              </div>
            </div>
            <div v-if="bossMechanicNotes.length" class="boss-contract-list">
              <span class="eyebrow">机制</span>
              <div v-for="note in bossMechanicNotes" :key="`${bossMechanicTitle(note)}-${bossMechanicCopy(note)}`" :class="['boss-contract-row', detailLayout.detailRelationRowClass]">
                <b>{{ bossMechanicTitle(note) }}</b>
                <span>{{ bossMechanicCopy(note) }}</span>
              </div>
            </div>
            <div v-if="bossDifficultyNotes.length" class="boss-contract-list">
              <span class="eyebrow">难度提示</span>
              <div v-for="note in bossDifficultyNotes" :key="bossDifficultyCopy(note)" :class="['boss-contract-row', detailLayout.detailRelationRowClass]">
                <span>{{ bossDifficultyCopy(note) }}</span>
              </div>
            </div>
            <span class="eyebrow boss-members-eyebrow">{{ bossMemberSectionTitle }}</span>
            <NuxtLink v-for="member in bossVisibleMembers" :key="displayText(member.id, member.gameId, member.internalName, 'member')" :class="['detail-member-link', detailLayout.detailRelationRowClass]" :to="bossMemberPath(member)">
              <CommonPreviewImage
                :src="memberImage(member)"
                :alt="safeBossDisplayText(member.nameZh, member.name) || '成员'"
                :fallback="firstGlyph(safeBossDisplayText(member.nameZh, member.name) || '?')"
                width="40"
                height="40"
              />
              <b>{{ safeBossDisplayText(member.nameZh, member.name) || '未命名成员' }}</b>
              <span>{{ bossUsesReferenceMembers ? `参考 · ${bossMemberRoleLabel(member.bossRole, member.sourceBossCode)}` : bossMemberRoleLabel(member.bossRole, member.sourceBossCode) }}</span>
            </NuxtLink>
            <a v-if="!bossVisibleMembers.length" :class="['detail-member-link', detailLayout.detailRelationRowClass]" href="/bosses">
              <b>暂无成员</b>
              <span>当前没有可展示的成员记录。</span>
            </a>
          </article>
        </section>
      </template>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.detail-loot-row {
  grid-template-columns: 52px minmax(0, 1fr) max-content;
  align-items: center;
}

.detail-loot-group {
  display: grid;
  gap: 10px;
}

.detail-loot-group + .detail-loot-group {
  margin-top: 18px;
}

.detail-loot-group-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: end;
  min-width: 0;
}

.detail-loot-group-title b,
.detail-loot-group-title span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-loot-group-title b {
  color: var(--text-strong);
  font-size: 14px;
}

.detail-loot-group-title span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 800;
}

.detail-group-remainder {
  display: grid;
  gap: 10px;
}

.detail-group-remainder summary {
  width: fit-content;
  cursor: pointer;
  color: var(--gold);
  font-size: 12px;
  font-weight: 900;
}

.detail-loot-row .item-art {
  width: 44px;
  height: 44px;
  overflow: hidden;
}

.detail-loot-copy,
.detail-loot-copy b,
.detail-loot-copy span,
.detail-loot-copy a,
.detail-loot-row em,
.detail-member-link b,
.detail-member-link span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-loot-copy {
  display: grid;
  gap: 4px;
  grid-column: 2;
}

.detail-loot-copy b {
  display: block;
  color: var(--text-strong);
  line-height: 1.35;
  word-break: normal;
}

.detail-loot-copy span {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.detail-loot-row em {
  grid-column: 3;
  justify-self: end;
  white-space: nowrap;
}

.detail-member-link {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 12px;
}

.boss-summon-facts {
  display: grid;
  gap: 10px;
  margin: 14px 0 20px;
}

.boss-summon-facts div {
  display: grid;
  gap: 4px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
  padding: 12px;
}

.boss-summon-facts b,
.boss-summon-facts span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.boss-summon-facts b {
  color: var(--text-strong);
  font-size: 13px;
}

.boss-summon-facts span {
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 1.5;
}

.boss-contract-list {
  display: grid;
  gap: 10px;
  margin: 0 0 20px;
}

.boss-contract-row {
  display: grid;
  gap: 4px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
  padding: 12px;
}

.boss-contract-item {
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
}

.boss-contract-item .item-art {
  grid-row: 1;
  width: 40px;
  height: 40px;
  overflow: hidden;
}

.boss-contract-row b,
.boss-contract-row span,
.boss-contract-row a {
  min-width: 0;
  overflow-wrap: anywhere;
}

.boss-contract-row b,
.boss-contract-row a {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 900;
}

.boss-contract-row span {
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 1.5;
}

.boss-members-eyebrow {
  display: block;
  margin-top: 6px;
}

.detail-member-link .item-art {
  grid-row: 1 / 3;
  width: 40px;
  height: 40px;
  overflow: hidden;
}

@media (max-width: 720px) {
  .detail-loot-row {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .detail-loot-group-title {
    display: grid;
    gap: 4px;
  }

  .detail-loot-row em {
    grid-column: 2;
    grid-row: auto;
    justify-self: start;
  }
}
</style>
