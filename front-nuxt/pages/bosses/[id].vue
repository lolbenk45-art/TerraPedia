<script setup lang="ts">
import { usePublicBossDetail } from '~/composables/usePublicBossDetail'

const route = useRoute()
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
const bossLootEntries = computed(() => bossBundle.value?.lootEntries ?? [])
const bossRawLoading = computed(() => !bossClientReady.value || bossPending.value)
const bossMissing = computed(() => bossClientReady.value && !bossPending.value && !bossDetail.value)
const bossTitle = computed(() => bossCard.value?.displayName || bossDetail.value?.nameZh || bossDetail.value?.name || 'Boss 详情')
const bossSubtitle = computed(() => bossCard.value?.englishName || bossDetail.value?.nameEn || bossDetail.value?.code || 'Public boss detail')
const bossProgressionLabel = computed(() => (
  bossCard.value?.progressionOrder == null ? '顺序未标注' : `推进 #${bossCard.value.progressionOrder}`
))

useSeoMeta({
  title: () => `TerraPedia · ${bossTitle.value}`,
  description: () => `${bossTitle.value} 的公开 Boss 资料详情，包含成员、掉落和推进信息。`,
})

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const entryImage = (value: { itemImage?: string | null; imageUrl?: string | null }) => resolvePreviewImageUrl(value.itemImage || value.imageUrl || '')
const memberImage = (value: { imageUrl?: string | null }) => resolvePreviewImageUrl(value.imageUrl || '')
const lootTitle = (entry: { itemNameZh?: string | null; itemName?: string | null; itemInternalName?: string | null }) => (
  displayText(entry.itemNameZh, entry.itemName, entry.itemInternalName, '未命名掉落')
)

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

    <main class="boss-detail-shell" :aria-busy="bossDetailVisualLoading">
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
            <template v-else>{{ bossCard?.summary || bossDetail?.notes || '暂无公开说明。' }}</template>
          </p>
          <div v-if="bossDetailVisualLoading" class="tag-row boss-detail-loading-tags">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
          <div v-else-if="bossMissing" class="tag-row boss-detail-missing-tags">
            <span class="tag paper">详情缺失</span>
            <span v-if="bossError" class="tag moss">请求异常</span>
          </div>
          <div v-else class="tag-row">
            <span class="tag gold">{{ bossCard?.type || 'boss' }}</span>
            <span class="tag moss">{{ bossProgressionLabel }}</span>
            <span class="tag paper">{{ bossLootEntries.length }} 条掉落</span>
            <span class="tag paper">{{ bossMembers.length }} 个成员</span>
          </div>
        </div>

        <aside class="boss-readiness">
          <b>{{ bossDetailVisualLoading ? '加载资料' : '公开资料' }}</b>
          <span>{{ bossDetailVisualLoading ? '读取 Boss 详情、成员和掉落' : (bossBundle?.source === 'api' ? '已载入真实 Boss 资料' : '未载入公开资料') }}</span>
          <em>{{ bossError ? '请求异常' : bossPending ? '请求中' : bossBundle?.source === 'api' ? '已更新' : '等待重试' }}</em>
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
          <article class="support-panel boss-phase active">
            <span>Members</span>
            <h2>成员</h2>
            <p>{{ bossMembers.length ? `包含 ${bossMembers.length} 个实体或部件。` : '暂无成员资料。' }}</p>
          </article>
          <article class="support-panel boss-phase">
            <span>Loot</span>
            <h2>掉落</h2>
            <p>{{ bossLootEntries.length ? `整理 ${bossLootEntries.length} 条掉落记录。` : '暂无掉落资料。' }}</p>
          </article>
          <article class="support-panel boss-phase">
            <span>Reference</span>
            <h2>参考成员</h2>
            <p>{{ bossReferenceMembers.length ? `包含 ${bossReferenceMembers.length} 个参考实体。` : '暂无参考成员。' }}</p>
          </article>
        </section>

        <section class="boss-detail-grid">
          <article class="support-panel loot-panel">
            <span class="eyebrow">掉落</span>
            <div v-for="entry in bossLootEntries" :key="entry.id ?? `${entry.itemId}-${entry.itemName}`" class="loot-row detail-loot-row">
              <CommonPreviewImage
                :src="entryImage(entry)"
                :alt="lootTitle(entry)"
                :fallback="firstGlyph(lootTitle(entry))"
                width="44"
                height="44"
              />
              <b>{{ lootTitle(entry) }}</b>
              <span>{{ displayText(entry.quantityText, entry.conditions, entry.notes, '掉落条件未标注') }}</span>
              <em>{{ displayText(entry.chanceText, entry.dropSourceKind, '概率未标注') }}</em>
            </div>
            <div v-if="!bossLootEntries.length" class="loot-row">
              <b>暂无掉落</b><span>当前没有可展示的掉落记录。</span><em>空</em>
            </div>
          </article>

          <article class="support-panel prep-panel">
            <span class="eyebrow">成员</span>
            <a v-for="member in bossMembers" :key="displayText(member.id, member.gameId, member.internalName, 'member')" class="detail-member-link" href="/npcs">
              <CommonPreviewImage
                :src="memberImage(member)"
                :alt="displayText(member.nameZh, member.name, member.internalName, '成员')"
                :fallback="firstGlyph(displayText(member.nameZh, member.name, member.internalName, '?'))"
                width="40"
                height="40"
              />
              <b>{{ displayText(member.nameZh, member.name, member.internalName, '未命名成员') }}</b>
              <span>{{ displayText(member.bossRole, member.sourceBossCode, '角色未标注') }}</span>
            </a>
            <a v-if="!bossMembers.length" class="detail-member-link" href="/bosses">
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
  grid-template-columns: 52px minmax(0, 1fr) minmax(72px, auto);
}

.detail-loot-row .item-art {
  grid-row: 1 / span 2;
  width: 44px;
  height: 44px;
  overflow: hidden;
}

.detail-loot-row b,
.detail-loot-row span,
.detail-loot-row em,
.detail-member-link b,
.detail-member-link span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-loot-row span {
  grid-column: 2;
}

.detail-loot-row em {
  grid-column: 3;
}

.detail-member-link {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 12px;
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

  .detail-loot-row em {
    grid-column: 2;
    grid-row: auto;
    justify-self: start;
  }
}
</style>
