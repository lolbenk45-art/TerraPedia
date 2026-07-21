<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import { usePublicBuffDetail } from '~/composables/usePublicBuffDetail'
import type { PublicBuffFactSummary } from '~/types/public-api'

const route = useRoute()
const buffId = computed(() => String(route.params.id ?? '').trim())
const { data: buffDetailResult, pending: buffDetailPending, error: buffDetailError, refresh: refreshBuffDetail } = await usePublicBuffDetail(buffId)

if (!buffDetailResult.value?.detail) {
  throw createError({ statusCode: 404, statusMessage: 'Buff not found' })
}

const buffDetailClientReady = ref(false)

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }

  return ''
}

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const firstImageUrl = (...values: unknown[]) => resolvePreviewImageUrl(firstText(...values))
const buffFallbackIcon = 'icon-buff'

const buffDetail = computed(() => buffDetailResult.value?.detail ?? null)
const buffItem = computed(() => buffDetailResult.value?.item ?? null)
const sources = computed(() => buffDetailResult.value?.sources ?? [])
const inflicters = computed(() => buffDetailResult.value?.inflicters ?? [])
const immuneTargets = computed(() => buffDetailResult.value?.immuneTargets ?? [])
const buffDetailVisualLoading = computed(() => !buffDetail.value && (!buffDetailClientReady.value || buffDetailPending.value))
const buffNotFound = computed(() => buffDetailClientReady.value && !buffDetailPending.value && !buffDetail.value)

const buffName = computed(() => firstText(buffDetail.value?.nameZh, buffDetail.value?.name, buffDetail.value?.internalName, `效果 ${buffId.value}`))
const buffEnglishName = computed(() => firstText(buffDetail.value?.englishName, buffDetail.value?.name, buffDetail.value?.internalName))
const buffTooltip = computed(() => firstText(buffDetail.value?.tooltipZh, buffDetail.value?.tooltipEn, '该效果的公开说明正在整理中。'))
const buffImage = computed(() => firstImageUrl(buffDetail.value?.imageUrl, buffItem.value?.image))
const buffFallback = computed(() => firstGlyph(buffName.value))
const buffTypeLabel = computed(() => buffItem.value?.typeLabel ?? '效果')

const toAbsoluteSeoUrl = useAbsoluteSiteUrl()

useSeoMeta({
  title: () => `TerraPedia · ${buffName.value}`,
  description: () => `${buffName.value} 的公开 Buff 资料详情，包含来源、施加者和免疫目标。`,
  ogImage: () => toAbsoluteSeoUrl(buffImage.value),
})

useHead({
  link: [{ rel: 'canonical', href: () => toAbsoluteSeoUrl(route.path) }],
})

const factName = (fact: PublicBuffFactSummary, index: number) => firstText(
  fact.nameZh,
  fact.name,
  fact.internalName,
  `关联 ${index + 1}`,
)

const factMeta = (fact: PublicBuffFactSummary) => firstText(
  fact.chanceText,
  fact.conditions,
  fact.relationType,
  fact.sourceProvider,
  fact.sourcePage,
  '关联资料',
)

const factImage = (fact: PublicBuffFactSummary) => firstImageUrl(
  fact.previewImage,
  fact.previewImageUrl,
  fact.preview_image,
  fact.preview_image_url,
  fact.iconUrl,
  fact.icon_url,
  fact.image,
  fact.imageUrl,
  fact.image_url,
)

const relationItems = (items: PublicBuffFactSummary[], detailBase: '/items' | '/npcs', kindLabel: string) => items.slice(0, 16).map((fact, index) => ({
  id: firstText(fact.id, fact.sourceId, fact.internalName, index),
  href: /^\d+$/.test(String(fact.id ?? '')) ? `${detailBase}/${fact.id}` : detailBase,
  name: factName(fact, index),
  meta: `${kindLabel} · ${factMeta(fact)}`,
  image: factImage(fact),
  fallback: firstGlyph(factName(fact, index)),
  icon: detailBase === '/npcs' ? 'icon-npc' : 'icon-items',
  kindLabel,
}))

const buffRelationSections = computed(() => [
  {
    key: 'sources',
    title: '物品来源',
    count: sources.value.length,
    empty: '暂无来源记录',
    items: relationItems(sources.value, '/items', '物品来源'),
  },
  {
    key: 'inflicters',
    title: '施加该效果的 NPC',
    count: inflicters.value.length,
    empty: '暂无施加者记录',
    items: relationItems(inflicters.value, '/npcs', '施加该效果的 NPC'),
  },
  {
    key: 'immuneTargets',
    title: '免疫该效果的 NPC',
    count: immuneTargets.value.length,
    empty: '暂无免疫目标记录',
    items: relationItems(immuneTargets.value, '/npcs', '免疫该效果的 NPC'),
  },
])

const buffSignalCards = computed(() => [
  { label: '类型', value: buffTypeLabel.value, detail: firstText(buffDetail.value?.buffType, '公开分类') },
  { label: '来源', value: String(sources.value.length), detail: '公开来源记录' },
  { label: '免疫', value: String(immuneTargets.value.length), detail: '公开目标记录' },
])

onMounted(() => {
  buffDetailClientReady.value = true
})
</script>

<template>
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout" :aria-busy="buffDetailVisualLoading">
      <section v-if="buffDetailVisualLoading" class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <CommonTpSkeleton type="icon" />
        </div>
        <div>
          <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
          <component :is="'h1'" class="detail-missing-title"><CommonTpSkeleton type="line" /></component>
          <p><CommonTpSkeleton type="line" /></p>
          <div class="tag-row">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
        </div>
      </section>

      <section v-else-if="buffNotFound" class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <CommonPreviewImage src="" alt="效果缺失" fallback="?" :fallback-icon="buffFallbackIcon" />
        </div>
        <div>
          <span class="eyebrow">Buff #{{ buffId || '未知' }}</span>
          <component :is="'h1'" class="detail-missing-title">{{ buffDetailError ? '效果资料加载失败' : '没有找到这个效果' }}</component>
          <p>{{ buffDetailError ? '加载效果资料时出现异常，可以重试或稍后再来。' : '当前详情资料还没有可渲染内容。' }}</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="buffDetailError" class="tag moss">加载异常</span>
          </div>
          <button v-if="buffDetailError" class="primary-button" type="button" @click="refreshBuffDetail()">重试加载</button>
          <a class="primary-button" href="/buffs">返回 Buff 图鉴</a>
        </div>
      </section>

      <section v-else class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <CommonPreviewImage
            :src="buffImage"
            :alt="buffName"
            :fallback="buffFallback"
            :fallback-icon="buffFallbackIcon"
            loading="eager"
          />
        </div>
        <div>
          <span class="eyebrow">Buff #{{ buffId }} · {{ buffEnglishName || buffTypeLabel }}</span>
          <h1>{{ buffName }}</h1>
          <p>{{ buffTooltip }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ buffTypeLabel }}</span>
            <span class="tag moss">{{ sources.length }} 个来源</span>
            <span class="tag paper">{{ immuneTargets.length }} 个免疫目标</span>
          </div>
        </div>
      </section>

      <section class="buff-detail-grid">
        <article
          v-for="(card, index) in buffSignalCards"
          :key="card.label"
          class="support-panel buff-signal"
          :class="{ active: index === 0 }"
        >
          <span>{{ card.label }}</span>
          <h2>{{ buffDetailVisualLoading ? '...' : card.value }}</h2>
          <p>{{ card.detail }}</p>
        </article>
      </section>

      <section
        v-for="section in buffRelationSections"
        :key="section.key"
        class="search-suggestion-band support-panel buff-relation-section"
      >
        <header class="buff-relation-head">
          <h2 class="buff-relation-title">{{ section.title }}</h2>
          <span class="buff-relation-count">{{ section.count }} 条</span>
        </header>
        <template v-if="buffDetailVisualLoading">
          <div v-for="slot in 3" :key="`${section.key}-loading-${slot}`">
            <b><CommonTpSkeleton type="line" /></b>
            <span><CommonTpSkeleton type="line" /></span>
          </div>
        </template>
        <template v-else-if="section.items.length">
          <NuxtLink v-for="item in section.items" :key="String(item.id)" class="detail-relation-link" :to="item.href">
            <CommonPreviewImage
              :src="item.image"
              :alt="item.name"
              :fallback="item.fallback"
              :fallback-icon="item.icon"
              width="42"
              height="42"
            />
            <b>{{ item.name }}</b>
            <span class="buff-entity-kind">{{ item.kindLabel || section.title }}</span>
            <span>{{ item.meta }}</span>
          </NuxtLink>
        </template>
        <div v-else>
          <b>{{ section.title }}</b>
          <span>{{ section.empty }}</span>
        </div>
      </section>
    </main>
</template>

<style scoped>
.detail-relation-link {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 5px 12px;
  min-height: 58px;
  padding: 8px 0;
}

.detail-relation-link .item-art {
  grid-row: 1 / 3;
  width: 42px;
  height: 42px;
  overflow: hidden;
}

.detail-relation-link b,
.detail-relation-link span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-relation-link b {
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}

.detail-relation-link span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.buff-signal {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 10px;
  min-height: 112px;
  padding: 18px;
}

.buff-signal > span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
}

.buff-signal h2 {
  margin: 0;
  color: var(--text);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.buff-signal p {
  align-self: end;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}
.buff-entity-kind {
  display: inline-flex;
  width: fit-content;
  border: 1px solid rgba(var(--theme-border-rgb, 214, 177, 90), 0.24);
  border-radius: 999px;
  padding: 1px 8px;
  color: var(--text-muted, inherit);
  font-size: 12px;
  font-weight: 700;
}
.buff-type-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 14px;
}
.buff-relation-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.buff-relation-title {
  margin: 0;
  font-size: 18px;
  color: var(--text-strong, inherit);
}
.buff-relation-count {
  color: var(--text-muted, inherit);
  font-size: 12px;
  font-weight: 700;
}
</style>
