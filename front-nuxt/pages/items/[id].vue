<script setup lang="ts">
import { usePublicItemDetail } from '~/composables/usePublicItemDetail'
import type {
  PublicItemDetail,
  PublicItemDetailBundle,
  PublicItemImage,
  PublicItemRecipeTree,
  PublicItemRecipeTreeNode,
  PublicItemRecipeTreeStation,
  PublicItemSource,
} from '~/types/public-api'

const route = useRoute()

const itemId = computed(() => String(route.params.id ?? '').trim())
const { data: detailBundle, pending: detailPending, error: detailError } = await usePublicItemDetail(itemId)
const detailClientReady = ref(false)

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
const detailLoadingState = computed(() => !detailClientReady.value || (detailPending.value && !detailItem.value))
const notFoundState = computed(() => detailClientReady.value && !detailPending.value && !detailItem.value)

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
const sourceLabel = computed(() => rawBundle.value?.source === 'api' ? '实时接口' : '详情数据')

const imageEntries = computed(() => {
  const images = rawBundle.value.images.map((image: PublicItemImage, index) => {
    const url = firstImageUrl(image.previewImageUrl, image.previewImage, image.imageUrl, image.url, image.src, image.path)

    return {
      id: firstText(image.id, image.imageId, url, index),
      url,
      label: firstText(image.label, image.type, image.role, image.name, `图片 ${index + 1}`),
      note: firstText(image.description, image.source, image.status),
    }
  }).filter((image) => image.url)

  if (images.length > 0 || !itemImage.value) {
    return images
  }

  return [{
    id: 'primary',
    url: itemImage.value,
    label: '主图标',
    note: itemName.value,
  }]
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

onMounted(() => {
  detailClientReady.value = true
})
</script>

<template>
  <section class="screen detail-screen active" :aria-busy="detailLoadingState">
    <TerraNav />
    <TerraBreadcrumb />

    <DetailItemDetailSkeleton v-if="detailLoadingState" />

    <div v-else-if="notFoundState" class="detail-layout">
      <section class="detail-hero dark-card">
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId || '未知' }} · 未找到</span>
          <strong class="detail-missing-title">没有找到这个物品</strong>
          <p>当前详情接口没有返回可渲染的物品资料。可以返回物品图鉴重新选择，或稍后在数据同步完成后再试。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="detailError" class="tag moss">接口异常</span>
          </div>
          <a class="primary-button" href="/items">返回物品图鉴</a>
        </div>
      </section>
    </div>

    <div v-else class="detail-layout">
      <section class="detail-hero dark-card">
        <div class="detail-icon-stage">
          <CommonPreviewImage
            :src="itemImage"
            :alt="itemName"
            :fallback="itemFallbackGlyph"
            loading="eager"
          />
        </div>
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId }} · {{ itemEnglishName || sourceLabel }}</span>
          <h1>{{ itemName }}</h1>
          <p>{{ itemDescription }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ itemCategory }}</span>
            <span class="tag moss">{{ itemPeriod }}</span>
            <span class="tag paper">{{ itemRarity }}</span>
            <span v-if="detailPending" class="tag paper">同步中</span>
          </div>
          <div class="detail-tabs">
            <button class="detail-tab active" type="button">概览</button>
            <button class="detail-tab" type="button">合成</button>
            <button class="detail-tab" type="button">来源</button>
            <button class="detail-tab" type="button">证据链</button>
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
          <section v-if="imageEntries.length" class="detail-module dark-card">
            <div class="module-title">
              <h2>图片</h2>
              <span class="tag gold">{{ imageEntries.length }} 张</span>
            </div>
            <div class="source-table">
              <div v-for="image in imageEntries" :key="String(image.id)" class="source-row">
                <span class="sprite-frame" style="width:42px;height:42px">
                  <CommonPreviewImage
                    :src="image.url"
                    :alt="image.label"
                    :fallback="itemFallbackGlyph"
                  />
                </span>
                <div><b>{{ image.label }}</b><span>{{ image.note || image.url }}</span></div>
                <strong>图片</strong>
              </div>
            </div>
          </section>

          <section v-if="recipeTreeSummary" class="detail-module dark-card">
            <div class="module-title">
              <h2>合成路线</h2>
              <span class="tag gold">{{ recipeTreeSummary.count }} 个直接材料</span>
            </div>
            <div class="recipe-tree">
              <template v-for="(material, index) in recipeTreeSummary.materials" :key="String(material.id)">
                <div class="recipe-node">
                  <span class="sprite-frame" style="width:48px;height:48px">
                    <CommonPreviewImage
                      :src="material.image"
                      :alt="material.name"
                      :fallback="material.fallback"
                    />
                  </span>
                  <b>{{ material.name }}</b>
                  <span>{{ material.amount || '数量未标记' }}</span>
                </div>
                <div v-if="index < recipeTreeSummary.materials.length - 1" class="recipe-arrow">+</div>
              </template>
              <div v-if="recipeTreeSummary.materials.length" class="recipe-arrow">=</div>
              <div class="recipe-node">
                <span class="sprite-frame" style="width:48px;height:48px">
                  <CommonPreviewImage
                    :src="itemImage"
                    :alt="itemName"
                    :fallback="itemFallbackGlyph"
                  />
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
              <span class="tag moss">{{ sourceEntries.length }} 条</span>
            </div>
            <div class="source-table">
              <div v-for="source in sourceEntries" :key="String(source.id)" class="source-row">
                <span class="sprite-frame" style="width:42px;height:42px">
                  <CommonPreviewImage
                    :src="source.image"
                    :alt="source.name"
                    :fallback="source.fallback"
                  />
                </span>
                <div><b>{{ source.name }}</b><span>{{ source.detail }}</span></div>
                <strong>{{ source.value || '来源' }}</strong>
              </div>
            </div>
          </section>
        </div>

        <aside class="evidence-panel dark-card">
          <span class="eyebrow">资料链路</span>
          <div class="evidence-step"><div><b>详情接口</b><span>/public/items/{{ itemId }}</span></div></div>
          <div class="evidence-step"><div><b>图片关系</b><span>{{ imageEntries.length }} 张候选图片</span></div></div>
          <div class="evidence-step"><div><b>来源关系</b><span>{{ sourceEntries.length }} 条来源记录</span></div></div>
          <div class="evidence-step"><div><b>配方树</b><span>{{ recipeTreeSummary ? '已返回摘要' : '暂无配方树' }}</span></div></div>
        </aside>
      </div>
    </div>

    <TerraFooter />
  </section>
</template>
