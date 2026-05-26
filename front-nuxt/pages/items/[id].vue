<script setup lang="ts">
import RecipeSummaryCard from '~/components/crafting/RecipeSummaryCard.vue'
import { usePublicItemDetail } from '~/composables/usePublicItemDetail'
import { formatTerrariaPrice, toPriceNumber } from '~/utils/price'
import type {
  PublicItemDetail,
  PublicItemDetailBundle,
  PublicItemImage,
  PublicItemRecipeTree,
  PublicItemRecipeTreeVariant,
  PublicItemSource,
} from '~/types/public-api'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'item', density: 'readable' })

const itemId = computed(() => String(route.params.id ?? '').trim())
const { data: detailBundle, pending: detailPending, error: detailError } = await usePublicItemDetail(itemId)
const detailClientReady = ref(false)
const selectedRecipeVariantKey = ref('')

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
const rawPublicCopyPattern = /{{|}}|<\/?[a-z][\s\S]*?>|https?:\/\/|wiki\.gg|iteminfo|eicons|internal|wiki\s*(?:page|path)|(?:^|[\s_-])shop[\s_/-]*\d+(?:[\s_/-]*\d+)*(?:$|[\s_-])/i
const safeItemDisplayText = (...values: unknown[]) => {
  for (const value of values) {
    const text = firstText(value).replace(/\s+/g, ' ')
    if (text && !rawPublicCopyPattern.test(text)) return text
  }

  return ''
}

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

useSeoMeta({
  title: () => `TerraPedia · ${itemName.value}`,
  description: () => `${itemName.value} 的公开资料详情，包含图片、价格、来源、配方和关联资料。`,
})

const itemEnglishName = computed(() => safeItemDisplayText(detailItem.value?.nameEn))
const itemCategory = computed(() => safeItemDisplayText(
  detailItem.value?.categoryName,
  detailItem.value?.category,
) || '未分类')
const itemPeriodLabel = (...values: unknown[]) => {
  const raw = firstText(...values)
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  const labels: Record<string, string> = {
    pre_hardmode: '困难模式前',
    prehardmode: '困难模式前',
    early: '开荒阶段',
    hardmode: '困难模式',
    post_plantera: '世纪之花后',
    post_moon_lord: '月亮领主后',
  }

  return labels[key] || safeItemDisplayText(raw) || '阶段未标记'
}
const itemRarityLabel = (...values: unknown[]) => {
  const raw = firstText(...values)
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  const labels: Record<string, string> = {
    gray: '灰色',
    white: '白色',
    blue: '蓝色',
    green: '绿色',
    orange: '橙色',
    light_red: '浅红色',
    pink: '粉色',
    light_purple: '浅紫色',
    lime: '黄绿色',
    yellow: '黄色',
    cyan: '青色',
    red: '红色',
    purple: '紫色',
    quest: '任务物品',
    expert: '专家物品',
    master: '大师物品',
  }

  return labels[key] || safeItemDisplayText(raw) || '稀有度未标记'
}
const itemRarity = computed(() => itemRarityLabel(detailItem.value?.rarity, detailItem.value?.rare))
const itemPeriod = computed(() => itemPeriodLabel(detailItem.value?.gamePeriod, detailItem.value?.phase))
const itemDescriptionSourceText = computed(() => safeItemDisplayText(
  detailItem.value?.descriptionZh,
  detailItem.value?.description,
))
const itemDescriptionText = computed(() => itemDescriptionSourceText.value || '该物品的说明正在整理中。')
const itemTooltipText = computed(() => safeItemDisplayText(
  detailItem.value?.tooltipZh,
  detailItem.value?.tooltip,
  detailItem.value?.tooltipEn,
))

const itemImage = computed(() => firstImageUrl(
  detailItem.value?.previewImage,
  detailItem.value?.imageUrl,
  detailItem.value?.iconUrl,
  detailItem.value?.image,
))

const itemFallbackGlyph = computed(() => Array.from(itemName.value)[0] ?? '?')
const sourceLabel = computed(() => rawBundle.value?.source === 'api' ? '详情资料' : '资料整理中')
const imageRoleLabel = (image: PublicItemImage, index?: number) => {
  const role = firstText(image.role, image.type).toLowerCase()
  if (role === 'icon' || role === 'primary') return '主图标'
  if (role === 'inventory') return '背包图标'
  if (role === 'animation') return '动态图'
  if (role === 'wiki') return '资料图片'
  return index == null ? '图片' : `图片 ${index + 1}`
}
const imageDimensionLabel = (width: unknown, height: unknown) => {
  const widthText = firstText(width)
  const heightText = firstText(height)
  return widthText && heightText ? `${widthText} x ${heightText}` : ''
}

const imageEntries = computed(() => {
  const images = rawBundle.value.images.map((image: PublicItemImage, index) => {
    const url = firstImageUrl(image.previewImageUrl, image.previewImage, image.imageUrl, image.url, image.src, image.path)
    const dimension = imageDimensionLabel(image.width, image.height)
    const primary = image.isPrimary === true || image.isPrimary === 1 || image.isPrimary === '1' || image.isPrimary === 'true'

    return {
      id: firstText(image.id, image.imageId, url, index),
      url,
      label: imageRoleLabel(image, index),
      note: safeItemDisplayText(image.description),
      meta: [primary ? '主图' : imageRoleLabel(image), dimension].filter(Boolean).join(' · ') || '图片',
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
    meta: '主图',
  }]
})

const sourceGroupKey = (source: PublicItemSource) => {
  const text = firstText(source.sourceType, source.sourceRefType, source.kind, source.type, source.method).toLowerCase()
  if (/drop|loot|enemy|npc|boss/.test(text)) return 'drop'
  if (/shop|sell|buy|vendor|merchant/.test(text)) return 'shop'
  if (/craft|recipe|shimmer|transmute|convert/.test(text)) return 'craft'
  if (/biome|fishing|crate|chest|world|environment|event/.test(text)) return 'world'
  return 'other'
}

const sourceGroupMeta = {
  drop: { title: '掉落来源', meta: '敌怪、Boss 或事件掉落' },
  shop: { title: '购买与商店', meta: 'NPC 出售或货币购买' },
  craft: { title: '制作与转换', meta: '配方、微光或转换获得' },
  world: { title: '环境与探索', meta: '群系、宝箱、钓鱼或世界来源' },
  other: { title: '其他来源', meta: '补充来源记录' },
} as const
const sourceFallbackIcon = (key: keyof typeof sourceGroupMeta) => ({
  drop: 'icon-boss',
  shop: 'icon-npc',
  craft: 'icon-crafting',
  world: 'icon-biome',
  other: 'icon-codex',
}[key])

const sourceQuantityLabel = (source: PublicItemSource) => {
  const explicit = safeItemDisplayText(source.quantityText)
  if (explicit) return explicit
  const min = firstText(source.quantityMin)
  const max = firstText(source.quantityMax)
  if (min && max && min !== max) return `${min}-${max}`
  return firstText(source.quantity, source.amount)
}

const percentLabel = (value: unknown) => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return ''
  return numberValue <= 1 ? `${Math.round(numberValue * 100)}%` : `${numberValue}%`
}
const sourceChanceLabel = (source: PublicItemSource) => {
  const explicit = safeItemDisplayText(source.chanceText)
  if (explicit) return explicit
  return percentLabel(source.chance ?? source.rate ?? source.chanceValue)
}
const sourceBiomeLabel = (source: PublicItemSource) => safeItemDisplayText(source.biomeNameZh, source.biomeNameEn)

const sourceEntries = computed(() => rawBundle.value.sources.map((source: PublicItemSource, index) => ({
  id: firstText(source.id, source.sourceId, index),
  name: safeItemDisplayText(source.sourceRefNameZh, source.sourceRefName, source.name, source.displayName, source.sourceName, source.title) || `来源 ${index + 1}`,
  groupKey: sourceGroupKey(source),
  detail: safeItemDisplayText(source.conditions, source.condition, source.description, source.summary, '来源信息整理中'),
  note: safeItemDisplayText(source.notes, sourceBiomeLabel(source)),
  value: [sourceQuantityLabel(source), sourceChanceLabel(source)].filter(Boolean).join(' · '),
  image: firstImageUrl(
    source.previewImage,
    source.previewImageUrl,
    source.preview_image,
    source.preview_image_url,
    source.imageUrl,
    source.image_url,
    source.iconUrl,
    source.icon_url,
    source.sourceRefImageUrl,
    source.source_ref_image_url,
    source.npcImageUrl,
    source.npc_image_url,
    source.itemImageUrl,
    source.item_image_url,
    source.image,
  ),
  fallback: Array.from(safeItemDisplayText(source.sourceRefNameZh, source.sourceRefName, source.name, source.displayName, source.sourceName) || '源')[0] ?? '源',
  icon: sourceFallbackIcon(sourceGroupKey(source)),
})))

const sourceEntryGroups = computed(() => {
  const buckets = new Map<keyof typeof sourceGroupMeta, typeof sourceEntries.value>()

  for (const source of sourceEntries.value) {
    const key = source.groupKey as keyof typeof sourceGroupMeta
    buckets.set(key, [...(buckets.get(key) ?? []), source])
  }

  return (Object.keys(sourceGroupMeta) as Array<keyof typeof sourceGroupMeta>)
    .map((key) => ({
      key,
      title: sourceGroupMeta[key].title,
      meta: sourceGroupMeta[key].meta,
      entries: buckets.get(key) ?? [],
    }))
    .filter((group) => group.entries.length > 0)
})

const recipeTreeVariants = computed(() => {
  const tree: PublicItemRecipeTree | null = rawBundle.value.recipeTree
  const variants = Array.isArray(tree?.variants) ? tree.variants : []

  return variants.filter((variant) => Array.isArray(variant?.roots) && variant.roots.length > 0)
})

const recipeVariantRank = (variant: PublicItemRecipeTreeVariant, index: number) => {
  const text = firstText(variant.variantKey, variant.variantLabel, variant.versionScope).toLowerCase()

  if (text.includes('desktop') || text.includes('mobile') || text.includes('console')) return index
  if (text.includes('base') || text.includes('通用')) return 100 + index
  return 200 + index
}

const recipeVariantDisplayLabel = (variant: PublicItemRecipeTreeVariant, index?: number) => {
  const explicit = safeItemDisplayText(variant.variantLabel)
  if (explicit) return explicit

  const scope = firstText(variant.versionScope).toLowerCase()
  if (scope.includes('desktop') || scope.includes('pc')) return '桌面版配方'
  if (scope.includes('mobile')) return '移动版配方'
  if (scope.includes('console')) return '主机版配方'
  if (scope.includes('base') || scope.includes('default') || scope.includes('通用')) return '默认配方'

  return index == null ? '默认配方' : `配方 ${index + 1}`
}

const defaultRecipeVariantKey = computed(() => recipeTreeVariants.value
  .map((variant, index) => ({ variant, index }))
  .sort((left, right) => recipeVariantRank(left.variant, left.index) - recipeVariantRank(right.variant, right.index))[0]?.variant.variantKey ?? '')

const activeRecipeVariant = computed(() => {
  const variants = recipeTreeVariants.value
  if (!variants.length) return null

  return variants.find((variant) => firstText(variant.variantKey) === selectedRecipeVariantKey.value)
    ?? variants.find((variant) => firstText(variant.variantKey) === defaultRecipeVariantKey.value)
    ?? variants[0]
})

watch(
  defaultRecipeVariantKey,
  (key) => {
    if (!selectedRecipeVariantKey.value && key) {
      selectedRecipeVariantKey.value = key
    }
  },
  { immediate: true },
)

const activeRecipeRoots = computed(() => activeRecipeVariant.value?.roots ?? [])

const recipeTreeSummary = computed(() => {
  const tree: PublicItemRecipeTree | null = rawBundle.value.recipeTree
  if (!tree || !activeRecipeVariant.value) return null

  const directMaterials = activeRecipeRoots.value.flatMap((root) => root.children ?? [])
  const textStations = firstText(tree.station, tree.craftingStation, tree.stationName)

  return {
    title: firstText(tree.item?.nameZh, tree.item?.name, tree.name, tree.displayName, tree.resultName, itemName.value),
    variant: recipeVariantDisplayLabel(activeRecipeVariant.value, recipeTreeVariants.value.indexOf(activeRecipeVariant.value)),
    recipeCount: activeRecipeRoots.value.length,
    count: directMaterials.length,
    materialCount: directMaterials.length,
    station: textStations || '制作站未标记',
    note: safeItemDisplayText(tree.note, tree.summary, tree.description),
  }
})

const buyPriceValue = computed(() => toPriceNumber(detailItem.value?.buyPrice ?? detailItem.value?.buy))
const sellPriceValue = computed(() => toPriceNumber(detailItem.value?.sellPrice ?? detailItem.value?.sell))
const itemHasPrice = computed(() => (
  (buyPriceValue.value != null && buyPriceValue.value > 0)
  || (sellPriceValue.value != null && sellPriceValue.value > 0)
))

const statRows = computed(() => [
  { label: '伤害', value: firstNumberText(detailItem.value?.damage, detailItem.value?.baseDamage) },
  { label: '防御', value: firstNumberText(detailItem.value?.defense) },
  { label: '击退', value: firstNumberText(detailItem.value?.knockback, detailItem.value?.knockBack) },
  { label: '使用时间', value: firstNumberText(detailItem.value?.useTime, detailItem.value?.useAnimation) },
  { label: '最大堆叠', value: firstNumberText(detailItem.value?.stackSize, detailItem.value?.maxStack) },
  { label: '尺寸', value: imageDimensionLabel(detailItem.value?.width, detailItem.value?.height) },
  { label: '买入', value: buyPriceValue.value != null && buyPriceValue.value > 0 ? formatTerrariaPrice(buyPriceValue.value, 'buy') : '' },
  { label: '售出', value: sellPriceValue.value != null && sellPriceValue.value > 0 ? formatTerrariaPrice(sellPriceValue.value, 'sell') : '' },
  { label: '稀有度', value: itemRarity.value },
].filter((row) => row.value))

const itemCoverageRows = computed(() => [
  { label: '基础资料', value: detailItem.value ? sourceLabel.value : '暂无记录' },
  { label: '描述', value: itemDescriptionSourceText.value ? '可查看' : '暂无说明' },
  { label: '游戏内提示', value: itemTooltipText.value ? '可查看' : '暂无提示' },
  { label: '价格', value: itemHasPrice.value ? '可查看' : '暂无价格' },
  { label: '来源', value: sourceEntries.value.length ? `${sourceEntries.value.length} 条来源记录` : '暂无来源' },
  { label: '制作', value: recipeTreeSummary.value ? '可查看制作路线' : '暂无制作资料' },
  { label: '图片', value: imageEntries.value.length ? `${imageEntries.value.length} 张图片` : '暂无图片' },
])

onMounted(() => {
  detailClientReady.value = true
})
</script>

<template>
  <section class="screen detail-screen active" :aria-busy="detailLoadingState">
    <TerraNav />
    <TerraBreadcrumb />

    <DetailItemDetailSkeleton v-if="detailLoadingState" />

    <div v-else-if="notFoundState" :class="['detail-layout', detailLayout.detailShellClass]">
      <section class="detail-hero dark-card">
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId || '未知' }} · 未找到</span>
          <strong class="detail-missing-title">没有找到这个物品</strong>
          <p>暂时没有可显示的物品资料。可以返回物品图鉴重新选择，或稍后再试。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="detailError" class="tag moss">载入异常</span>
          </div>
          <a class="primary-button" href="/items">返回物品图鉴</a>
        </div>
      </section>
    </div>

    <div v-else :class="['detail-layout', detailLayout.detailShellClass]">
      <section class="detail-hero dark-card">
        <div class="detail-icon-stage">
          <CommonPreviewImage
            :src="itemImage"
            :alt="itemName"
            :fallback="itemFallbackGlyph"
            fallback-icon="icon-items"
            loading="eager"
          />
        </div>
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId }} · {{ itemEnglishName || sourceLabel }}</span>
          <h1>{{ itemName }}</h1>
          <p>{{ itemDescriptionText }}</p>
          <p v-if="itemTooltipText" class="item-tooltip-copy">{{ itemTooltipText }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ itemCategory }}</span>
            <span class="tag moss">{{ itemPeriod }}</span>
            <span class="tag paper">{{ itemRarity }}</span>
            <span v-if="detailPending" class="tag paper">同步中</span>
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

      <div :class="['detail-grid', detailLayout.detailGridClass, detailLayout.detailDensityClass]">
        <div class="module-stack">
          <section :class="['detail-module dark-card item-recipe-summary-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <div>
                <h2>制作路线</h2>
                <span>{{ recipeTreeSummary ? `${recipeTreeSummary.variant} · ${recipeTreeSummary.count} 个直接材料` : '当前物品暂无制作路线' }}</span>
              </div>
              <span class="tag gold">{{ recipeTreeSummary ? `${recipeTreeSummary.recipeCount} 个配方` : '暂无配方' }}</span>
            </div>
            <div v-if="recipeTreeSummary && recipeTreeVariants.length > 1" class="recipe-variant-tabs" aria-label="配方版本">
              <button
                v-for="(variant, index) in recipeTreeVariants"
                :key="firstText(variant.variantKey, variant.variantLabel)"
                class="recipe-variant-tab"
                :class="{ active: activeRecipeVariant === variant }"
                type="button"
                @click="selectedRecipeVariantKey = firstText(variant.variantKey)"
              >
                {{ recipeVariantDisplayLabel(variant, index) }}
              </button>
            </div>
            <RecipeSummaryCard v-if="recipeTreeSummary" :roots="activeRecipeRoots" compact title-id="item-recipe-summary-title" />
            <p v-else class="tp-detail-empty">还没有可展示的配方、材料或制作站记录。</p>
            <p v-if="recipeTreeSummary?.note">{{ recipeTreeSummary.note }}</p>
            <a v-if="recipeTreeSummary" class="primary-button item-recipe-summary-link" :href="`/crafting?itemId=${itemId}&maxDepth=3`">查看完整制作树</a>
          </section>

          <section :class="['detail-module dark-card item-source-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>来源分组</h2>
              <span class="tag moss">{{ sourceEntries.length }} 条</span>
            </div>
            <div v-if="sourceEntryGroups.length" class="grouped-source-list">
              <section v-for="group in sourceEntryGroups" :key="group.key" class="detail-subgroup item-source-group">
                <div class="detail-subgroup-title">
                  <b>{{ group.title }}</b>
                  <span>{{ group.entries.length }} 条 · {{ group.meta }}</span>
                </div>
                <div class="source-table tp-detail-relation-grid">
                  <div v-for="source in group.entries" :key="String(source.id)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                    <span class="sprite-frame detail-relation-icon">
                      <CommonPreviewImage
                        :src="source.image"
                        :alt="source.name"
                        :fallback="source.fallback"
                        :fallback-icon="source.icon"
                      />
                    </span>
                    <div class="detail-relation-copy">
                      <b>{{ source.name }}</b>
                      <span>{{ source.detail }}</span>
                      <small v-if="source.note">{{ source.note }}</small>
                    </div>
                    <strong class="detail-relation-meta">{{ source.value || group.title }}</strong>
                  </div>
                </div>
              </section>
            </div>
            <p v-else class="tp-detail-empty">还没有可展示的掉落、购买、制作或探索来源记录。</p>
          </section>

          <section v-if="imageEntries.length" :class="['detail-module dark-card', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>图片画廊</h2>
              <span class="tag gold">{{ imageEntries.length }} 张</span>
            </div>
            <div class="item-image-gallery">
              <figure v-for="image in imageEntries" :key="String(image.id)" class="item-image-tile">
                <span class="sprite-frame item-image-preview">
                  <CommonPreviewImage
                    :src="image.url"
                    :alt="image.label"
                    :fallback="itemFallbackGlyph"
                    fallback-icon="icon-items"
                  />
                </span>
                <figcaption>
                  <b>{{ image.label }}</b>
                  <span>{{ image.meta }}</span>
                  <small v-if="image.note">{{ image.note }}</small>
                </figcaption>
              </figure>
            </div>
          </section>
        </div>

        <aside :class="['evidence-panel dark-card', detailLayout.detailModuleClass]">
          <span class="eyebrow">资料概览</span>
          <div v-for="row in itemCoverageRows" :key="row.label" class="evidence-step">
            <div><b>{{ row.label }}</b><span>{{ row.value }}</span></div>
          </div>
        </aside>
      </div>
    </div>

    <TerraFooter />
  </section>
</template>

<style scoped>
.detail-relation-row {
  grid-template-columns: 44px minmax(0, 1fr) auto;
  padding: 10px;
}

.detail-relation-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
}

.detail-relation-copy {
  min-width: 0;
}

.detail-relation-copy b,
.detail-relation-copy span,
.detail-relation-meta {
  overflow-wrap: anywhere;
}

.detail-relation-copy span {
  display: block;
  line-height: 1.5;
}

.detail-relation-meta {
  align-self: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.detail-relation-copy small,
.item-image-tile small {
  display: block;
  margin-top: 4px;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.item-tooltip-copy {
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 14px;
}

.item-recipe-summary-module {
  display: grid;
  gap: 14px;
}

.item-recipe-summary-link {
  width: fit-content;
}

.item-source-module,
.grouped-source-list,
.item-source-group {
  display: grid;
  gap: 12px;
}

.detail-subgroup-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: end;
  min-width: 0;
}

.detail-subgroup-title b,
.detail-subgroup-title span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-subgroup-title b {
  color: var(--text-strong);
  font-size: 14px;
}

.detail-subgroup-title span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 800;
}

.item-image-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.item-image-tile {
  display: grid;
  gap: 10px;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
  padding: 14px;
}

.item-image-preview {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  overflow: hidden;
}

.item-image-tile b,
.item-image-tile span {
  display: block;
  overflow-wrap: anywhere;
}

.item-image-tile b {
  color: var(--text-strong);
  font-size: 13px;
}

.item-image-tile span {
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 720px) {
  .detail-relation-row {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .detail-subgroup-title {
    display: grid;
    gap: 4px;
  }

  .detail-relation-meta {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
