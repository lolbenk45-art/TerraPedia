<script setup lang="ts">
import { usePublicItemDetail } from '~/composables/usePublicItemDetail'
import type {
  PublicItemDetail,
  PublicItemDetailBundle,
  PublicItemRecipeTree,
  PublicItemRecipeTreeNode,
  PublicItemRecipeTreeStation,
  PublicItemSource,
} from '~/types/public-api'

const route = useRoute()
const failedImages = ref(new Set<string>())

const itemId = computed(() => String(route.params.id ?? '').trim())
const { data: detailBundle, pending: detailPending, error: detailError } = await usePublicItemDetail(itemId)

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }

  return ''
}

const firstNumberText = (...values: unknown[]) => {
  const text = firstText(...values)
  return text || ''
}

const firstImageUrl = (...values: unknown[]) => resolvePreviewImageUrl(firstText(...values))

const rawBundle = computed<PublicItemDetailBundle>(() => detailBundle.value)
const detailItem = computed<PublicItemDetail | null>(() => rawBundle.value.item)
const detailLoadingState = computed(() => detailPending.value && !detailItem.value)
const notFoundState = computed(() => !detailPending.value && !detailItem.value)

const itemName = computed(() => firstText(
  detailItem.value?.displayName,
  detailItem.value?.nameZh,
  detailItem.value?.name,
  detailItem.value?.nameEn,
  `物品 ${itemId.value}`,
))

const itemEnglishName = computed(() => firstText(detailItem.value?.nameEn, detailItem.value?.internalName))
const itemCategory = computed(() => firstText(
  detailItem.value?.categoryName,
  detailItem.value?.category,
  detailItem.value?.categoryPath,
  '未分类',
))
const itemRarity = computed(() => firstText(detailItem.value?.rarity, detailItem.value?.rare, '稀有度未标记'))
const itemPeriod = computed(() => firstText(detailItem.value?.gamePeriod, detailItem.value?.phase, '阶段未标记'))
const itemDescription = computed(() => firstText(
  detailItem.value?.descriptionZh,
  detailItem.value?.description,
  detailItem.value?.tooltipZh,
  detailItem.value?.tooltip,
  '该物品的说明正在整理中。',
))

const itemImage = computed(() => firstImageUrl(
  detailItem.value?.previewImage,
  detailItem.value?.imageUrl,
  detailItem.value?.iconUrl,
  detailItem.value?.image,
))

const itemFallbackGlyph = computed(() => Array.from(itemName.value)[0] ?? '?')

const sourceEntries = computed(() => rawBundle.value.sources.map((source: PublicItemSource, index) => ({
  id: firstText(source.id, source.sourceId, index),
  name: firstText(source.sourceRefNameZh, source.sourceRefName, source.name, source.displayName, source.sourceName, source.title, `来源 ${index + 1}`),
  detail: firstText(source.conditions, source.notes, source.description, source.summary, source.condition, source.method, source.sourceType, '来源信息整理中'),
  value: firstText(source.chanceText, source.quantityText, source.chance, source.rate, source.amount, source.quantity, source.kind, source.sourceType, source.type),
  image: firstImageUrl(source.previewImage, source.imageUrl, source.iconUrl, source.image),
  fallback: Array.from(firstText(source.sourceRefNameZh, source.sourceRefName, source.name, source.displayName, source.sourceName, '源'))[0] ?? '源',
})))

const recipeNodeImage = (node: PublicItemRecipeTreeNode) => firstImageUrl(
  node.previewImage,
  node.itemImageUrl,
  node.itemImage,
  node.image,
)

const recipeNodeName = (node: PublicItemRecipeTreeNode, index: number) => firstText(
  node.itemNameZh,
  node.displayName,
  node.itemName,
  node.name,
  node.itemInternalName,
  `材料 ${index + 1}`,
)

const recipeNodeAmount = (node: PublicItemRecipeTreeNode) => firstText(
  node.quantityText,
  node.resultQuantity,
  node.quantity,
  node.amount,
  node.count,
)

const stationName = (station: PublicItemRecipeTreeStation) => firstText(
  station.stationNameZh,
  station.stationName,
  station.stationNameRaw,
  station.displayName,
  station.name,
)

const recipeTreeSummary = computed(() => {
  const tree: PublicItemRecipeTree | null = rawBundle.value.recipeTree
  if (!tree) return null

  const firstRoot = tree.variants?.flatMap((variant) => variant.roots ?? [])[0]
  const directMaterials = (
    firstRoot?.children
    ?? tree.materials
    ?? tree.ingredients
    ?? tree.children
    ?? tree.nodes
    ?? []
  )
  const stations = firstRoot?.stations ?? tree.stations ?? tree.craftingStations ?? []
  const stationNames = stations.map(stationName).filter(Boolean)
  const textStations = firstText(tree.station, tree.craftingStation, tree.stationName)

  return {
    title: firstText(tree.item?.nameZh, tree.item?.name, tree.name, tree.displayName, tree.resultName, itemName.value),
    count: directMaterials.length,
    materials: directMaterials.slice(0, 6).map((material, index) => ({
      id: firstText(material.id, material.itemId, material.name, index),
      name: recipeNodeName(material, index),
      amount: recipeNodeAmount(material),
      image: recipeNodeImage(material),
      fallback: Array.from(recipeNodeName(material, index))[0] ?? '材',
    })),
    station: stationNames.join(' / ') || textStations || '制作站未标记',
    note: firstText(tree.note, tree.summary, tree.description),
  }
})

const statRows = computed(() => [
  { label: '伤害', value: firstNumberText(detailItem.value?.damage, detailItem.value?.baseDamage) },
  { label: '防御', value: firstNumberText(detailItem.value?.defense) },
  { label: '击退', value: firstNumberText(detailItem.value?.knockback, detailItem.value?.knockBack) },
  { label: '使用时间', value: firstNumberText(detailItem.value?.useTime, detailItem.value?.useAnimation) },
  { label: '堆叠', value: firstNumberText(detailItem.value?.stackSize, detailItem.value?.maxStack) },
  { label: '买入', value: firstText(detailItem.value?.buyPrice, detailItem.value?.buy) },
  { label: '售出', value: firstText(detailItem.value?.sellPrice, detailItem.value?.sell) },
  { label: '稀有度', value: itemRarity.value },
].filter((row) => row.value))

const markImageFallback = (image: string) => {
  if (!image) return
  failedImages.value = new Set(failedImages.value).add(image)
}
</script>

<template>
  <section class="screen detail-screen active" :aria-busy="detailPending">
    <TerraNav />
    <TerraBreadcrumb />

    <div v-if="detailLoadingState" class="detail-layout detail-loading-skeleton">
      <section class="detail-hero dark-card">
        <div class="detail-icon-stage">
          <span class="detail-loading-icon" aria-hidden="true"></span>
        </div>
        <div class="detail-main">
          <span class="detail-loading-kicker" aria-hidden="true"></span>
          <span class="detail-loading-title" aria-hidden="true"></span>
          <span class="detail-loading-copy" aria-hidden="true"></span>
          <span class="detail-loading-copy short" aria-hidden="true"></span>
          <div class="tag-row" aria-hidden="true">
            <span class="detail-loading-pill"></span>
            <span class="detail-loading-pill"></span>
            <span class="detail-loading-pill"></span>
          </div>
        </div>
        <aside class="detail-side">
          <p class="section-label">核心属性</p>
          <div class="detail-loading-stat-list" aria-hidden="true">
            <span v-for="slot in 8" :key="`detail-loading-stat-${slot}`"></span>
          </div>
        </aside>
      </section>

      <div class="detail-grid">
        <div class="module-stack">
          <section class="detail-module dark-card">
            <div class="module-title">
              <span class="detail-loading-heading" aria-hidden="true"></span>
              <span class="detail-loading-pill" aria-hidden="true"></span>
            </div>
            <div class="source-table" aria-hidden="true">
              <div v-for="slot in 3" :key="`detail-loading-row-${slot}`" class="source-row detail-loading-row">
                <span class="detail-loading-mini-icon"></span>
                <span class="detail-loading-row-text"></span>
                <span class="detail-loading-row-value"></span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div v-else-if="notFoundState" class="detail-layout">
      <section class="detail-hero dark-card">
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId || '未知' }} · 未找到</span>
          <strong class="detail-missing-title">没有找到这个物品</strong>
          <p>暂时没有这个物品的资料。可以返回物品列表重新选择，或稍后再试。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="detailError" class="tag moss">数据异常</span>
          </div>
          <a class="primary-button" href="/items">返回物品列表</a>
        </div>
      </section>
    </div>

    <div v-else class="detail-layout">
      <section class="detail-hero dark-card">
        <div class="detail-icon-stage">
          <span
            class="item-art"
            :class="{ 'is-fallback': !itemImage || failedImages.has(itemImage) }"
            :data-fallback="itemFallbackGlyph"
          >
            <img
              v-if="itemImage && !failedImages.has(itemImage)"
              :src="itemImage"
              :alt="itemName"
              decoding="async"
              @error="markImageFallback(itemImage)"
            />
          </span>
        </div>
        <div class="detail-main">
          <span class="eyebrow">#{{ itemId }} · {{ itemEnglishName }}</span>
          <h1>{{ itemName }}</h1>
          <p>{{ itemDescription }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ itemCategory }}</span>
            <span class="tag moss">{{ itemPeriod }}</span>
            <span class="tag paper">{{ itemRarity }}</span>
          </div>
          <div class="detail-tabs">
            <button class="detail-tab active" type="button">概览</button>
            <button class="detail-tab" type="button">合成</button>
            <button class="detail-tab" type="button">来源</button>
          </div>
        </div>
        <aside class="detail-side">
          <p class="section-label">核心属性</p>
          <dl>
            <template v-for="row in statRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </aside>
      </section>

      <div class="detail-grid">
        <div class="module-stack">
          <section v-if="recipeTreeSummary" class="detail-module dark-card">
            <div class="module-title">
              <h2>合成</h2>
              <span class="tag gold">{{ recipeTreeSummary.count }} 项材料</span>
            </div>
            <div class="recipe-tree">
              <template v-for="(material, index) in recipeTreeSummary.materials" :key="String(material.id)">
                <div class="recipe-node">
                  <span class="sprite-frame" style="width:48px;height:48px">
                    <span
                      class="item-art"
                      :class="{ 'is-fallback': !material.image || failedImages.has(material.image) }"
                      :data-fallback="material.fallback"
                    >
                      <img
                        v-if="material.image && !failedImages.has(material.image)"
                        :src="material.image"
                        :alt="material.name"
                        loading="lazy"
                        decoding="async"
                        @error="markImageFallback(material.image)"
                      />
                    </span>
                  </span>
                  <b>{{ material.name }}</b>
                  <span>{{ material.amount || '数量未标记' }}</span>
                </div>
                <div v-if="index < recipeTreeSummary.materials.length - 1" class="recipe-arrow">+</div>
              </template>
              <div v-if="recipeTreeSummary.materials.length" class="recipe-arrow">=</div>
              <div class="recipe-node">
                <span class="sprite-frame" style="width:48px;height:48px">
                  <span
                    class="item-art"
                    :class="{ 'is-fallback': !itemImage || failedImages.has(itemImage) }"
                    :data-fallback="itemFallbackGlyph"
                  >
                    <img
                      v-if="itemImage && !failedImages.has(itemImage)"
                      :src="itemImage"
                      :alt="itemName"
                      loading="lazy"
                      decoding="async"
                      @error="markImageFallback(itemImage)"
                    />
                  </span>
                </span>
                <b>{{ recipeTreeSummary.title }}</b>
                <span>{{ recipeTreeSummary.station }}</span>
              </div>
            </div>
            <p v-if="recipeTreeSummary.note">{{ recipeTreeSummary.note }}</p>
          </section>

          <section v-if="sourceEntries.length" class="detail-module dark-card">
            <div class="module-title">
              <h2>来源与关联</h2>
              <span class="tag moss">{{ sourceEntries.length }} 项</span>
            </div>
            <div class="source-table">
              <div v-for="source in sourceEntries" :key="String(source.id)" class="source-row">
                <span class="sprite-frame" style="width:42px;height:42px">
                  <span
                    class="item-art"
                    :class="{ 'is-fallback': !source.image || failedImages.has(source.image) }"
                    :data-fallback="source.fallback"
                  >
                    <img
                      v-if="source.image && !failedImages.has(source.image)"
                      :src="source.image"
                      :alt="source.name"
                      loading="lazy"
                      decoding="async"
                      @error="markImageFallback(source.image)"
                    />
                  </span>
                </span>
                <div><b>{{ source.name }}</b><span>{{ source.detail }}</span></div>
                <strong>{{ source.value || '来源' }}</strong>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <TerraFooter />
  </section>
</template>
