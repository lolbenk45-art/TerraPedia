<script setup lang="ts">
import { usePublicBiomeDetail } from '~/composables/usePublicBiomeDetail'

const route = useRoute()
const biomeClientReady = ref(false)
const biomeDetailVisualLoading = ref(true)
const biomeDetailVisualLoadingMinimumMs = 180
let biomeDetailVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let biomeDetailVisualLoadingStartedAt = Date.now()

const biomeRouteId = computed(() => String(route.params.id ?? '').trim())

const {
  data: biomeBundle,
  pending: biomePending,
  error: biomeError,
  refresh: refreshBiomeDetail,
} = await usePublicBiomeDetail(biomeRouteId)

const biomeDetail = computed(() => biomeBundle.value?.detail ?? null)
const biomeTile = computed(() => biomeBundle.value?.item ?? null)
const biomeResources = computed(() => biomeBundle.value?.resources ?? [])
const biomeRelations = computed(() => biomeBundle.value?.relations ?? [])
const biomeRawLoading = computed(() => !biomeClientReady.value || biomePending.value)
const biomeMissing = computed(() => biomeClientReady.value && !biomePending.value && !biomeDetail.value)
const biomeTitle = computed(() => biomeTile.value?.displayName || biomeDetail.value?.nameZh || biomeDetail.value?.nameEn || '群系详情')

useSeoMeta({
  title: () => `TerraPedia · ${biomeTitle.value}`,
  description: () => `${biomeTitle.value} 的公开群系资料详情，包含资源、来源和关联生态。`,
})

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const resourceImage = (value: { itemImage?: string | null }) => resolvePreviewImageUrl(value.itemImage || '')
const resourceTitle = (resource: { resourceNameRaw?: string | null; itemName?: string | null; itemInternalName?: string | null }) => (
  displayText(resource.resourceNameRaw, resource.itemName, resource.itemInternalName, '未命名资源')
)

const clearBiomeDetailVisualLoadingTimer = () => {
  if (biomeDetailVisualLoadingTimer) {
    clearTimeout(biomeDetailVisualLoadingTimer)
    biomeDetailVisualLoadingTimer = null
  }
}

const syncBiomeDetailVisualLoading = (isLoading: boolean) => {
  clearBiomeDetailVisualLoadingTimer()

  if (isLoading) {
    biomeDetailVisualLoadingStartedAt = Date.now()
    biomeDetailVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - biomeDetailVisualLoadingStartedAt
  const remaining = Math.max(0, biomeDetailVisualLoadingMinimumMs - elapsed)

  biomeDetailVisualLoadingTimer = setTimeout(() => {
    biomeDetailVisualLoading.value = false
    biomeDetailVisualLoadingTimer = null
  }, remaining)
}

watch(biomeRawLoading, syncBiomeDetailVisualLoading, { immediate: true })

onMounted(() => {
  biomeClientReady.value = true
})

onBeforeUnmount(clearBiomeDetailVisualLoadingTimer)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout" :aria-busy="biomeDetailVisualLoading">
      <section class="biome-detail-hero support-panel">
        <div>
          <span class="eyebrow">
            <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="pill" />
            <template v-else>Biome · {{ biomeTile?.englishName || biomeTile?.code || biomeRouteId }}</template>
          </span>
          <h1>
            <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="line" />
            <template v-else>{{ biomeTitle }}</template>
          </h1>
          <p>
            <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="line" />
            <template v-else>{{ biomeTile?.description || '暂无公开说明。' }}</template>
          </p>
          <div v-if="biomeDetailVisualLoading" class="tag-row biome-detail-loading-tags">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
          <div v-else-if="biomeMissing" class="tag-row biome-detail-missing-tags">
            <span class="tag paper">详情缺失</span>
            <span v-if="biomeError" class="tag moss">请求异常</span>
          </div>
          <div v-else class="tag-row">
            <span class="tag gold">{{ biomeTile?.groupLabel || '未分组' }}</span>
            <span class="tag moss">{{ biomeTile?.layerType || '层级未标注' }}</span>
            <span class="tag paper">{{ biomeTile?.biomeType || '类型未标注' }}</span>
          </div>
        </div>
        <div class="biome-scan">
          <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="icon" />
          <CommonPreviewImage
            v-else
            :src="biomeTile?.image || ''"
            :alt="biomeTitle"
            :fallback="biomeTile?.fallback || firstGlyph(biomeTitle)"
            :source-image="biomeTile?.sourceImage || ''"
            width="96"
            height="96"
          />
        </div>
      </section>

      <section v-if="biomeDetailVisualLoading" class="category-detail-grid">
        <article v-for="slot in 4" :key="`biome-detail-loading-${slot}`" class="support-panel category-branch">
          <b><CommonTpSkeleton type="line" /></b>
          <span><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
        </article>
      </section>

      <section v-else-if="biomeMissing" class="search-suggestion-band support-panel">
        <div>
          <b>群系详情暂未载入</b>
          <span>当前 ID 没有返回公开资料，页面不会展示静态样例。</span>
        </div>
        <button class="small-button active" type="button" @click="refreshBiomeDetail()">重新加载</button>
      </section>

      <template v-else>
        <section class="category-detail-grid">
          <article class="support-panel category-branch active">
            <b>资源</b>
            <span>{{ biomeResources.length }} 项资源可供查看。</span>
            <a href="/items">打开物品图鉴</a>
          </article>
          <article class="support-panel category-branch">
            <b>关系</b>
            <span>{{ biomeRelations.length }} 条关联群系。</span>
            <a href="/biomes">返回群系列表</a>
          </article>
          <article class="support-panel category-branch">
            <b>来源</b>
            <span>{{ displayText(biomeDetail?.sourceProvider, biomeDetail?.sourcePage, '来源未标注') }}</span>
            <a href="/search">搜索资料</a>
          </article>
          <article class="support-panel category-branch">
            <b>同步</b>
            <span>{{ displayText(biomeDetail?.sourceRevisionTimestamp, biomeDetail?.lastSyncedAt, '同步时间未标注') }}</span>
            <a href="/categories">查看分类</a>
          </article>
        </section>

        <section class="search-suggestion-band support-panel">
          <a v-for="resource in biomeResources" :key="displayText(resource.id, resource.itemId, resource.resourceNameRaw, 'resource')" :href="resource.itemId ? `/items/${resource.itemId}` : '/items'">
            <CommonPreviewImage
              :src="resourceImage(resource)"
              :alt="resourceTitle(resource)"
              :fallback="firstGlyph(resourceTitle(resource))"
              width="40"
              height="40"
            />
            <b>{{ resourceTitle(resource) }}</b>
            <span>{{ displayText(resource.resourceType, resource.notes, '类型未标注') }}</span>
          </a>
          <div v-if="!biomeResources.length">
            <b>暂无资源</b>
            <span>当前没有可展示的资源记录。</span>
          </div>
        </section>

        <section class="taxonomy-band">
          <article v-for="relation in biomeRelations" :key="displayText(relation.id, relation.relatedBiomeId, relation.relatedBiomeCode, 'relation')" class="support-panel">
            <span class="eyebrow">{{ displayText(relation.relationType, '关联') }}</span>
            <h2>{{ displayText(relation.relatedBiomeNameZh, relation.relatedBiomeNameEn, relation.relatedBiomeCode, '未命名关联') }}</h2>
            <p>{{ displayText(relation.notes, relation.relatedBiomeCode, '暂无说明') }}</p>
          </article>
          <article v-if="!biomeRelations.length" class="support-panel">
            <span class="eyebrow">关系</span>
            <h2>暂无关联</h2>
            <p>当前没有可展示的关联群系。</p>
          </article>
        </section>
      </template>
    </main>

    <TerraFooter />
  </section>
</template>
