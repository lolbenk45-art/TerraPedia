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

type UsageCompanion = {
  name?: string | null
  href?: string | null
}

type PublicItemDetailWithUsage = PublicItemDetail & {
  usageDescription?: string | null
  usage?: string | null
  useDescription?: string | null
  suitableFor?: string | null
  companions?: UsageCompanion[] | string[] | null
  criticalChance?: number | string | null
  critChance?: number | string | null
  crit?: number | string | null
  useSpeed?: number | string | null
  speed?: number | string | null
  value?: number | string | null
}

const route = useRoute()
const failedImages = ref(new Set<string>())
const currentRecipeVariantIndex = ref(0)

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

const formatPriceText = (...values: unknown[]) => {
  const rawText = firstText(...values)
  if (!rawText) return ''

  const numericValue = Number(rawText)
  if (!Number.isFinite(numericValue)) return rawText

  const copper = Math.max(0, Math.floor(numericValue))
  const platinum = Math.floor(copper / 1000000)
  const gold = Math.floor((copper % 1000000) / 10000)
  const silver = Math.floor((copper % 10000) / 100)
  const copperRemainder = copper % 100
  const parts = [
    platinum ? `${platinum}铂` : '',
    gold ? `${gold}金` : '',
    silver ? `${silver}银` : '',
    copperRemainder ? `${copperRemainder}铜` : '',
  ].filter(Boolean)

  return parts.slice(0, 2).join(' ') || '0铜'
}

const formatPercentText = (...values: unknown[]) => {
  const rawText = firstText(...values)
  if (!rawText) return ''
  return rawText.includes('%') ? rawText : `${rawText}%`
}

const rawBundle = computed<PublicItemDetailBundle>(() => detailBundle.value)
const imageEntries = computed(() => rawBundle.value.images)
const detailItem = computed<PublicItemDetail | null>(() => rawBundle.value.item)
const detailUsageItem = computed(() => detailItem.value as PublicItemDetailWithUsage | null)
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

const primaryImageEntry = computed(() => (
  imageEntries.value.find((image) => image.isPrimary === true || image.isPrimary === 1 || image.isPrimary === '1')
  ?? imageEntries.value[0]
))

const itemImage = computed(() => firstImageUrl(
  detailItem.value?.previewImage,
  detailItem.value?.imageUrl,
  detailItem.value?.iconUrl,
  detailItem.value?.image,
  primaryImageEntry.value?.previewImage,
  primaryImageEntry.value?.previewImageUrl,
  primaryImageEntry.value?.imageUrl,
  primaryImageEntry.value?.url,
  primaryImageEntry.value?.src,
  rawBundle.value.recipeTree?.item?.previewImage,
  rawBundle.value.recipeTree?.item?.imageUrl,
  rawBundle.value.recipeTree?.item?.iconUrl,
  rawBundle.value.recipeTree?.item?.image,
))

const itemFallbackGlyph = computed(() => Array.from(itemName.value)[0] ?? '?')

const itemUsageDescription = computed(() => firstText(
  detailUsageItem.value?.usageDescription,
  detailUsageItem.value?.useDescription,
  detailUsageItem.value?.usage,
  '用法信息整理中',
))

const itemSuitableFor = computed(() => firstText(detailUsageItem.value?.suitableFor, '—'))

const itemCompanions = computed(() => {
  const companions = detailUsageItem.value?.companions

  if (!Array.isArray(companions)) return []

  return companions.flatMap((companion) => {
    if (typeof companion === 'string') {
      const name = companion.trim()
      return name ? [{ name, href: '' }] : []
    }

    const name = firstText(companion.name)
    return name ? [{ name, href: firstText(companion.href) }] : []
  }).slice(0, 5)
})

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

const recipeVariants = computed(() => rawBundle.value.recipeTree?.variants ?? [])
const selectedRecipeVariant = computed(() => recipeVariants.value[currentRecipeVariantIndex.value] ?? recipeVariants.value[0])

watch(recipeVariants, (variants) => {
  if (currentRecipeVariantIndex.value >= variants.length) {
    currentRecipeVariantIndex.value = 0
  }
})

const visibleRecipeMaterialLimit = 5

const recipeTreeSummary = computed(() => {
  const tree: PublicItemRecipeTree | null = rawBundle.value.recipeTree
  if (!tree) return null

  const variants = tree.variants ?? []
  const firstRoot = selectedRecipeVariant.value?.roots?.[0] ?? variants.flatMap((variant) => variant.roots ?? [])[0]
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
    variantCount: variants.length,
    currentVariantIndex: currentRecipeVariantIndex.value,
    hiddenMaterialCount: Math.max(0, directMaterials.length - visibleRecipeMaterialLimit),
    materials: directMaterials.slice(0, visibleRecipeMaterialLimit).map((material, index) => ({
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
  { label: '击退', value: firstNumberText(detailItem.value?.knockback, detailItem.value?.knockBack) },
  { label: '速度', value: firstNumberText(detailUsageItem.value?.useSpeed, detailUsageItem.value?.speed, detailItem.value?.useTime, detailItem.value?.useAnimation) },
  { label: '暴击', value: formatPercentText(detailUsageItem.value?.criticalChance, detailUsageItem.value?.critChance, detailUsageItem.value?.crit) },
  { label: '售价', value: formatPriceText(detailItem.value?.sellPrice, detailItem.value?.sell, detailUsageItem.value?.value) },
].map((row) => ({ ...row, value: row.value || '—' })))

const markImageFallback = (image: string) => {
  if (!image) return
  failedImages.value = new Set(failedImages.value).add(image)
}

const showNextRecipeVariant = () => {
  const variantCount = recipeTreeSummary.value?.variantCount ?? 0
  if (variantCount <= 1) return
  currentRecipeVariantIndex.value = (currentRecipeVariantIndex.value + 1) % variantCount
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
          <div class="detail-stat-strip" aria-hidden="true">
            <span v-for="slot in 5" :key="`detail-loading-stat-${slot}`"></span>
          </div>
        </div>
      </section>

      <section class="detail-section detail-usage">
        <div class="detail-section-head">
          <span class="detail-loading-heading" aria-hidden="true"></span>
        </div>
        <div class="source-table" aria-hidden="true">
          <div v-for="slot in 2" :key="`detail-loading-row-${slot}`" class="source-row detail-loading-row">
            <span class="detail-loading-mini-icon"></span>
            <span class="detail-loading-row-text"></span>
            <span class="detail-loading-row-value"></span>
          </div>
        </div>
      </section>

      <section class="detail-section detail-recipe">
        <div class="detail-section-head">
          <span class="detail-loading-heading" aria-hidden="true"></span>
          <span class="detail-loading-pill" aria-hidden="true"></span>
        </div>
        <div class="recipe-tree" aria-hidden="true">
          <div v-for="slot in 3" :key="`detail-loading-recipe-${slot}`" class="recipe-node">
            <span class="detail-loading-mini-icon"></span>
            <span class="detail-loading-row-text"></span>
          </div>
        </div>
      </section>
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
          <span class="eyebrow">
            #{{ itemId }}<template v-if="itemEnglishName"> · {{ itemEnglishName }}</template>
          </span>
          <h1>{{ itemName }}</h1>
          <div class="tag-row">
            <span class="tag gold">{{ itemCategory }}</span>
            <span class="tag moss">{{ itemPeriod }}</span>
            <span class="tag paper">{{ itemRarity }}</span>
          </div>
          <p class="detail-tooltip">{{ itemDescription }}</p>
          <div class="detail-stat-strip" aria-label="核心属性">
            <span v-for="row in statRows" :key="row.label">
              <b>{{ row.value }}</b> {{ row.label }}
            </span>
          </div>
        </div>
      </section>

      <section class="detail-section detail-usage">
        <header class="detail-section-head">
          <h2>用法</h2>
        </header>
        <div class="detail-usage-body">
          <p>{{ itemUsageDescription }}</p>
          <div class="detail-usage-meta">
            <div>
              <span>适合</span>
              <strong>{{ itemSuitableFor }}</strong>
            </div>
            <div>
              <span>推荐搭配</span>
              <div v-if="itemCompanions.length" class="detail-usage-companions">
                <template v-for="companion in itemCompanions" :key="`${companion.name}-${companion.href}`">
                  <NuxtLink v-if="companion.href" :to="companion.href">{{ companion.name }}</NuxtLink>
                  <span v-else>{{ companion.name }}</span>
                </template>
              </div>
              <strong v-else>—</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="detail-section detail-recipe">
        <header class="detail-section-head">
          <h2>合成</h2>
          <span v-if="recipeTreeSummary" class="tag gold">{{ recipeTreeSummary.count }} 项材料</span>
        </header>

        <div v-if="recipeTreeSummary" class="recipe-tree">
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
          <div class="recipe-node result">
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
          </div>
          <span class="recipe-station-inline">@{{ recipeTreeSummary.station }}</span>
        </div>
        <p v-else>合成信息整理中</p>
        <div v-if="recipeTreeSummary" class="recipe-actions">
          <button
            v-if="recipeTreeSummary.variantCount > 1"
            class="text-button"
            type="button"
            @click="showNextRecipeVariant"
          >
            切换配方 ({{ recipeTreeSummary.currentVariantIndex + 1 }}/{{ recipeTreeSummary.variantCount }})
          </button>
          <span v-if="recipeTreeSummary.hiddenMaterialCount">另有 {{ recipeTreeSummary.hiddenMaterialCount }} 项材料</span>
          <span v-if="recipeTreeSummary.note">{{ recipeTreeSummary.note }}</span>
        </div>
      </section>

      <details class="detail-section detail-extras">
        <summary>
          <span>更多信息</span>
          <span class="detail-extras-arrow" aria-hidden="true"></span>
        </summary>
        <div class="detail-extras-body">
          <section v-if="sourceEntries.length">
            <div class="detail-section-head">
              <h2>来源</h2>
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

          <section>
            <div class="detail-section-head">
              <h2>同类对比</h2>
            </div>
            <p>同类对比整理中</p>
          </section>

          <section>
            <div class="detail-section-head">
              <h2>历史变更</h2>
            </div>
            <p>历史变更整理中</p>
          </section>

          <section>
            <div class="detail-section-head">
              <h2>备注</h2>
            </div>
            <p>{{ recipeTreeSummary?.note || itemDescription }}</p>
          </section>
        </div>
      </details>
    </div>

    <TerraFooter />
  </section>
</template>
