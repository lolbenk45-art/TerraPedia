<script setup lang="ts">
import { usePublicBuffDetail } from '~/composables/usePublicBuffDetail'
import type { PublicBuffFactSummary } from '~/types/public-api'

const route = useRoute()
const buffId = computed(() => String(route.params.id ?? '').trim())
const { data: buffDetailResult, pending: buffDetailPending, error: buffDetailError } = await usePublicBuffDetail(buffId)
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

const buffDetail = computed(() => buffDetailResult.value?.detail ?? null)
const buffItem = computed(() => buffDetailResult.value?.item ?? null)
const sources = computed(() => buffDetailResult.value?.sources ?? [])
const inflicters = computed(() => buffDetailResult.value?.inflicters ?? [])
const immuneTargets = computed(() => buffDetailResult.value?.immuneTargets ?? [])
const buffDetailVisualLoading = computed(() => !buffDetailClientReady.value || (buffDetailPending.value && !buffDetail.value))
const buffNotFound = computed(() => buffDetailClientReady.value && !buffDetailPending.value && !buffDetail.value)

const buffName = computed(() => firstText(buffDetail.value?.nameZh, buffDetail.value?.name, buffDetail.value?.internalName, `效果 ${buffId.value}`))
const buffEnglishName = computed(() => firstText(buffDetail.value?.englishName, buffDetail.value?.name, buffDetail.value?.internalName))
const buffTooltip = computed(() => firstText(buffDetail.value?.tooltipZh, buffDetail.value?.tooltipEn, '该效果的公开说明正在整理中。'))
const buffImage = computed(() => firstImageUrl(buffDetail.value?.imageUrl, buffItem.value?.image))
const buffFallback = computed(() => firstGlyph(buffName.value))
const buffTypeLabel = computed(() => buffItem.value?.typeLabel ?? '效果')

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

const factImage = (fact: PublicBuffFactSummary) => firstImageUrl(fact.imageUrl)

const relationItems = (items: PublicBuffFactSummary[]) => items.slice(0, 8).map((fact, index) => ({
  id: firstText(fact.id, fact.sourceId, fact.internalName, index),
  name: factName(fact, index),
  meta: factMeta(fact),
  image: factImage(fact),
  fallback: firstGlyph(factName(fact, index)),
}))

const buffRelationSections = computed(() => [
  {
    key: 'sources',
    title: '来源',
    count: sources.value.length,
    empty: '暂无来源记录',
    items: relationItems(sources.value),
  },
  {
    key: 'inflicters',
    title: '施加者',
    count: inflicters.value.length,
    empty: '暂无施加者记录',
    items: relationItems(inflicters.value),
  },
  {
    key: 'immuneTargets',
    title: '免疫目标',
    count: immuneTargets.value.length,
    empty: '暂无免疫目标记录',
    items: relationItems(immuneTargets.value),
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
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout" :aria-busy="buffDetailVisualLoading">
      <section v-if="buffDetailVisualLoading" class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <CommonTpSkeleton type="icon" />
        </div>
        <div>
          <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
          <strong class="detail-missing-title"><CommonTpSkeleton type="line" /></strong>
          <p><CommonTpSkeleton type="line" /></p>
          <div class="tag-row">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
        </div>
      </section>

      <section v-else-if="buffNotFound" class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <CommonPreviewImage src="" alt="效果缺失" fallback="?" />
        </div>
        <div>
          <span class="eyebrow">Buff #{{ buffId || '未知' }}</span>
          <strong class="detail-missing-title">没有找到这个效果</strong>
          <p>当前公共详情接口没有返回可渲染资料。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="buffDetailError" class="tag moss">接口异常</span>
          </div>
          <a class="primary-button" href="/buffs">返回 Buff 图鉴</a>
        </div>
      </section>

      <section v-else class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <CommonPreviewImage
            :src="buffImage"
            :alt="buffName"
            :fallback="buffFallback"
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
        class="search-suggestion-band support-panel"
      >
        <template v-if="buffDetailVisualLoading">
          <div v-for="slot in 3" :key="`${section.key}-loading-${slot}`">
            <b><CommonTpSkeleton type="line" /></b>
            <span><CommonTpSkeleton type="line" /></span>
          </div>
        </template>
        <template v-else-if="section.items.length">
          <a v-for="item in section.items" :key="String(item.id)" href="/items">
            <CommonPreviewImage
              :src="item.image"
              :alt="item.name"
              :fallback="item.fallback"
              width="42"
              height="42"
            />
            <b>{{ item.name }}</b>
            <span>{{ section.title }} · {{ item.meta }}</span>
          </a>
        </template>
        <div v-else>
          <b>{{ section.title }}</b>
          <span>{{ section.empty }}</span>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
