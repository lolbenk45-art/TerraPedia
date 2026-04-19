<template>
  <div class="public-workbench entity-detail-shell item-detail-view page-wrap">
    <div class="public-breadcrumbs item-detail-view__breadcrumbs">
      <router-link to="/">Home</router-link>
      <span>/</span>
      <router-link to="/items">Items</router-link>
      <template v-for="category in breadcrumbCategories" :key="category.id">
        <span>/</span>
        <span>{{ category.name }}</span>
      </template>
      <span>/</span>
      <span class="public-breadcrumbs__current">{{ item ? displayName : 'Item Detail' }}</span>
    </div>

    <router-link to="/items" class="public-back-link item-detail-view__back-link">
      <span aria-hidden="true">&larr;</span>
      <span>Back to Item Index</span>
    </router-link>

    <section v-if="isLoading" class="public-section-frame item-detail-view__state">
      <div class="item-detail-view__spinner" aria-hidden="true"></div>
      <p>Loading item detail...</p>
    </section>

    <section v-else-if="error" class="public-section-frame item-detail-view__state item-detail-view__state--error">
      <strong>Could not load item detail</strong>
      <p>{{ error }}</p>
      <button type="button" class="btn btn-brand" @click="loadItem">Retry</button>
    </section>

    <section v-else-if="notFound" class="public-section-frame item-detail-view__state">
      <strong>Item not found</strong>
      <p>The requested public item profile is unavailable.</p>
    </section>

    <template v-else-if="item">
      <section class="public-page-hero item-detail-view__hero">
        <div class="item-detail-view__hero-layout">
          <div class="item-detail-view__media">
            <img v-if="heroImageUrl" :src="heroImageUrl" :alt="displayName" class="item-detail-view__image" />
            <div v-else class="item-detail-view__fallback">
              <span class="item-detail-view__fallback-mark" aria-hidden="true">{{ fallbackMark }}</span>
              <small>No artwork</small>
            </div>

            <div class="item-detail-view__media-meta">
              <span>{{ imageCards.length }} image{{ imageCards.length === 1 ? '' : 's' }}</span>
              <span>{{ relatedSources.length }} source{{ relatedSources.length === 1 ? '' : 's' }}</span>
            </div>
          </div>

          <div class="item-detail-view__hero-copy">
            <div class="item-detail-view__badges">
              <span v-if="displayRarity" class="item-detail-view__badge item-detail-view__badge--rarity" :style="rarityBadgeStyle">
                {{ displayRarity }}
              </span>
              <span class="item-detail-view__badge">{{ displayCategory }}</span>
              <span class="item-detail-view__badge">ID {{ item.id }}</span>
              <span v-if="stackLabel" class="item-detail-view__badge">{{ stackLabel }}</span>
            </div>

            <div class="item-detail-view__heading">
              <span class="section-eyebrow">Atlas Workbench</span>
              <h1 class="section-title">{{ displayName }}</h1>
              <p v-if="secondaryName" class="item-detail-view__secondary">{{ secondaryName }}</p>
              <p class="item-detail-view__summary">
                {{ summaryText }}
              </p>
              <p v-if="summaryFallbackNote" class="item-detail-view__summary-note">{{ summaryFallbackNote }}</p>
            </div>

            <div v-if="showLanguageToggle" class="item-detail-view__language">
              <span class="item-detail-view__language-label">Content priority</span>
              <div class="item-detail-view__language-toggle">
                <button
                  type="button"
                  class="item-detail-view__language-button"
                  :class="{ 'item-detail-view__language-button--active': contentLanguage === 'zh' }"
                  @click="contentLanguage = 'zh'"
                >
                  Chinese
                </button>
                <button
                  type="button"
                  class="item-detail-view__language-button"
                  :class="{ 'item-detail-view__language-button--active': contentLanguage === 'en' }"
                  @click="contentLanguage = 'en'"
                >
                  English
                </button>
              </div>
            </div>

            <div class="item-detail-view__stat-grid">
              <article v-for="stat in heroStats" :key="stat.label" class="public-hero-stat-card">
                <span class="public-hero-stat-card__label">{{ stat.label }}</span>
                <strong class="public-hero-stat-card__value">{{ stat.value }}</strong>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section class="entity-detail-shell__content">
        <div class="entity-detail-shell__main item-detail-view__main">
          <article v-if="contentCards.length" class="public-section-frame item-detail-view__panel">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Description</h2>
                <p>Localized copy stays grouped in a calmer workbench panel.</p>
              </div>
              <span class="item-detail-view__panel-chip">{{ contentLanguageLabel }}</span>
            </div>

            <div class="item-detail-view__content-grid">
              <article v-for="card in contentCards" :key="card.key" class="item-detail-view__content-card">
                <div class="item-detail-view__content-head">
                  <strong>{{ card.label }}</strong>
                  <span>{{ card.languageLabel }}</span>
                </div>
                <p>{{ card.text }}</p>
                <small v-if="card.fallbackMessage">{{ card.fallbackMessage }}</small>
              </article>
            </div>
          </article>

          <article v-if="detailSections.length" class="public-section-frame item-detail-view__panel">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Detail bands</h2>
                <p>Combat, economy, and registry data stay separated for faster scanning.</p>
              </div>
            </div>

            <div class="item-detail-view__section-grid">
              <article v-for="section in detailSections" :key="section.title" class="item-detail-view__section-card">
                <h3>{{ section.title }}</h3>
                <dl class="item-detail-view__field-list">
                  <div v-for="field in section.fields" :key="field.label" class="item-detail-view__field-row">
                    <dt>{{ field.label }}</dt>
                    <dd>{{ field.value }}</dd>
                  </div>
                </dl>
              </article>
            </div>
          </article>
 
          <article class="public-section-frame item-detail-view__panel">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Recipes</h2>
                <p>Published recipe paths, crafting stations, and tree variants stay visible without overloading the page.</p>
              </div>
              <span class="item-detail-view__panel-chip">{{ recipeCards.length }} cards</span>
            </div>

            <div v-if="recipeVariants.length" class="item-detail-view__tree-block">
              <div class="item-detail-view__variant-tabs">
                <button
                  v-for="(variant, index) in recipeVariants"
                  :key="recipeVariantKey(variant, index)"
                  type="button"
                  class="item-detail-view__variant-button"
                  :class="{
                    'item-detail-view__variant-button--active': recipeVariantKey(variant, index) === activeVariantKey,
                  }"
                  @click="activeVariantKey = recipeVariantKey(variant, index)"
                >
                  {{ recipeVariantLabel(variant, index) }}
                </button>
              </div>

              <div class="item-detail-view__tree-meta">
                <span>{{ activeTreeSummary }}</span>
                <span v-if="treeDepthLabel">Depth {{ treeDepthLabel }}</span>
              </div>

              <div v-if="treePreviewCards.length" class="item-detail-view__tree-grid">
                <article v-for="card in treePreviewCards" :key="card.key" class="item-detail-view__tree-card">
                  <strong>{{ card.title }}</strong>
                  <p v-if="card.secondary">{{ card.secondary }}</p>
                  <div class="item-detail-view__tree-card-meta">
                    <span>{{ card.output }}</span>
                    <span>{{ card.ingredients }} ingredients</span>
                    <span>{{ card.stations }} stations</span>
                  </div>
                </article>
              </div>
            </div>

            <div v-if="recipeCards.length" class="item-detail-view__recipe-list">
              <article v-for="card in recipeCards" :key="card.key" class="item-detail-view__recipe-card">
                <div class="item-detail-view__recipe-head">
                  <div>
                    <h3>{{ card.title }}</h3>
                    <p v-if="card.secondary">{{ card.secondary }}</p>
                  </div>
                  <span>{{ card.quantity }}</span>
                </div>

                <p v-if="card.ingredients.length">
                  <strong>Ingredients:</strong>
                  {{ card.ingredients.join(' / ') }}
                </p>
                <p v-if="card.stations.length">
                  <strong>Stations:</strong>
                  {{ card.stations.join(' / ') }}
                </p>
                <p v-if="card.source">
                  <strong>Scope:</strong>
                  {{ card.source }}
                </p>
                <p v-if="card.notes">
                  <strong>Notes:</strong>
                  {{ card.notes }}
                </p>
              </article>
            </div>

            <p v-else class="item-detail-view__empty-copy">No published recipe data is available for this item yet.</p>
          </article>

          <article class="public-section-frame item-detail-view__panel">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Source registry</h2>
                <p>Drop rates, acquisition notes, and linked source records stay grouped in one ledger.</p>
              </div>
              <span class="item-detail-view__panel-chip">{{ sourceCards.length }} entries</span>
            </div>

            <div v-if="sourceCards.length" class="item-detail-view__source-list">
              <article v-for="card in sourceCards" :key="card.key" class="item-detail-view__source-card">
                <div class="item-detail-view__source-head">
                  <div>
                    <h3>{{ card.title }}</h3>
                    <p v-if="card.secondary">{{ card.secondary }}</p>
                  </div>
                </div>
                <div class="item-detail-view__source-meta">
                  <span v-if="card.quantity">{{ card.quantity }}</span>
                  <span v-if="card.chance">{{ card.chance }}</span>
                </div>
                <p v-if="card.notes">{{ card.notes }}</p>
              </article>
            </div>

            <p v-else class="item-detail-view__empty-copy">No public source data has been attached to this item yet.</p>
          </article>
        </div>

        <aside class="entity-detail-shell__sidebar item-detail-view__sidebar">
          <article class="public-section-frame item-detail-view__sidebar-card">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Metadata</h2>
                <p>Aggregate counts, modules, and registry facts.</p>
              </div>
            </div>

            <div class="item-detail-view__aggregate-grid">
              <article v-for="metric in aggregateMetrics" :key="metric.label" class="item-detail-view__aggregate-card">
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
              </article>
            </div>

            <dl class="item-detail-view__sidebar-fields">
              <div v-for="field in metadataFields" :key="field.label" class="item-detail-view__field-row">
                <dt>{{ field.label }}</dt>
                <dd>{{ field.value }}</dd>
              </div>
            </dl>

            <div v-if="moduleRows.length" class="item-detail-view__module-list">
              <div v-for="module in moduleRows" :key="module.label" class="item-detail-view__module-row">
                <span>{{ module.label }}</span>
                <strong>{{ module.value }}</strong>
              </div>
            </div>
          </article>

          <article class="public-section-frame item-detail-view__sidebar-card">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Category trail</h2>
                <p>Path inside the public atlas taxonomy.</p>
              </div>
            </div>

            <div class="item-detail-view__trail">
              <span v-for="category in breadcrumbTrail" :key="category" class="item-detail-view__trail-chip">
                {{ category }}
              </span>
            </div>
          </article>

          <article class="public-section-frame item-detail-view__sidebar-card">
            <div class="item-detail-view__panel-head">
              <div>
                <h2>Image registry</h2>
                <p>Primary and related artwork collected for this entry.</p>
              </div>
            </div>

            <div v-if="imageCards.length" class="item-detail-view__image-grid">
              <article v-for="card in imageCards" :key="card.key" class="item-detail-view__image-card">
                <img :src="card.url" :alt="card.alt" />
                <span>{{ card.meta }}</span>
              </article>
            </div>

            <p v-else class="item-detail-view__empty-copy">No public images have been attached to this item yet.</p>
          </article>
        </aside>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchCategories, fetchItemAggregateById, fetchItemRecipeTree } from '@/api'
import type {
  Category,
  ItemAggregateData,
  ItemRecipeTreeNode,
  ItemRecipeTreeResponse,
  ItemRecipeTreeVariant,
  ItemSourceRelation,
  RecipeIngredientRelation,
} from '@/types'
import { getItemFallbackMark } from '@/utils/itemFallbackMark'
import { getRarityPresentation } from '@/utils/rarity'

type ContentLanguage = 'zh' | 'en'

type DetailField = {
  label: string
  value: string
}

type DetailSection = {
  title: string
  fields: DetailField[]
}

type ContentCard = {
  key: string
  label: string
  text: string
  languageLabel: string
  fallbackMessage: string
}

type MetricCard = {
  label: string
  value: string
}

type RecipeCard = {
  key: string
  title: string
  secondary: string
  quantity: string
  ingredients: string[]
  stations: string[]
  source: string
  notes: string
}

type SourceCard = {
  key: string
  title: string
  secondary: string
  quantity: string
  chance: string
  notes: string
}

type ImageCard = {
  key: string
  url: string
  alt: string
  meta: string
}

type TreePreviewCard = {
  key: string
  title: string
  secondary: string
  output: string
  ingredients: number
  stations: number
}

const route = useRoute()

const aggregate = ref<ItemAggregateData | null>(null)
const categories = ref<Category[]>([])
const recipeTree = ref<ItemRecipeTreeResponse | null>(null)
const isLoading = ref(false)
const error = ref('')
const notFound = ref(false)
const contentLanguage = ref<ContentLanguage>('zh')
const activeVariantKey = ref('')

const item = computed(() => aggregate.value?.item ?? null)
const relatedImages = computed(() => aggregate.value?.images ?? [])
const relatedSources = computed(() => aggregate.value?.sources ?? [])
const relatedRecipes = computed(() => aggregate.value?.recipes ?? [])
const moduleStatus = computed(() => aggregate.value?.moduleStatus ?? {})

const hasChineseContent = computed(() =>
  Boolean(textValue(item.value?.descriptionZh) || textValue(item.value?.tooltipZh)),
)
const hasEnglishContent = computed(() =>
  Boolean(
    textValue(item.value?.descriptionEn)
      || textValue(item.value?.description)
      || textValue(item.value?.tooltipEn)
      || textValue(item.value?.tooltip),
  ),
)

const showLanguageToggle = computed(() => hasChineseContent.value && hasEnglishContent.value)
const contentLanguageLabel = computed(() => (contentLanguage.value === 'zh' ? 'Chinese first' : 'English first'))

const displayName = computed(() =>
  oneLine(item.value?.nameZh) || oneLine(item.value?.name) || 'Unknown item',
)

const secondaryName = computed(() => {
  const englishName = oneLine(item.value?.name)
  const internalName = oneLine(item.value?.internalName)

  if (oneLine(item.value?.nameZh) && englishName && englishName !== displayName.value) {
    return englishName
  }

  if (internalName && internalName !== displayName.value && internalName !== englishName) {
    return internalName
  }

  return ''
})

const categoryMap = computed(() => {
  const map = new Map<number, Category>()
  categories.value.forEach((category) => {
    map.set(category.id, category)
  })
  return map
})

const breadcrumbCategories = computed(() => {
  const categoryId = item.value?.categoryId
  if (!categoryId) {
    return []
  }

  const path: Category[] = []
  const seen = new Set<number>()
  let currentId: number | null = categoryId

  while (currentId != null && currentId > 0 && !seen.has(currentId)) {
    const current = categoryMap.value.get(currentId)
    if (!current) {
      break
    }

    path.unshift(current)
    seen.add(currentId)
    currentId = current.parentId ?? null
  }

  return path
})

const displayCategory = computed(() => {
  const lastCategory = breadcrumbCategories.value[breadcrumbCategories.value.length - 1]
  return lastCategory?.name || oneLine(item.value?.categoryName) || oneLine(item.value?.category) || 'Uncategorized'
})

const breadcrumbTrail = computed(() => {
  const trail = breadcrumbCategories.value.map(category => category.name)
  return trail.length ? trail : [displayCategory.value]
})

const fallbackMark = computed(() =>
  getItemFallbackMark({
    id: item.value?.id,
    name: displayName.value,
    category: displayCategory.value,
  }),
)

const displayRarity = computed(() => {
  const raw = oneLine(item.value?.rarity) || oneLine(item.value?.rare)
  if (raw) {
    return raw
  }

  if (typeof item.value?.rarityId === 'number') {
    return `Tier ${item.value.rarityId}`
  }

  return ''
})

const rarityBadgeStyle = computed(() =>
  getRarityPresentation({
    rarityId: item.value?.rarityId ?? null,
    rarity: item.value?.rarity ?? null,
    rare: item.value?.rare ?? null,
  }).badgeStyle,
)

const stackLabel = computed(() => {
  const stackValue = item.value?.stack ?? item.value?.stackSize ?? null
  if (typeof stackValue === 'number' && stackValue > 1) {
    return `Stack x${stackValue}`
  }

  if (item.value?.isStackable === false) {
    return 'Single slot'
  }

  return ''
})

const heroImageUrl = computed(() => {
  const primaryImage = relatedImages.value.find(image => image.isPrimary && resolveImage(image.imageUrl || image.cachedUrl || image.originalUrl))
  return resolveImage(
    item.value?.image
      || primaryImage?.imageUrl
      || primaryImage?.cachedUrl
      || primaryImage?.originalUrl
      || relatedImages.value[0]?.imageUrl
      || relatedImages.value[0]?.cachedUrl
      || relatedImages.value[0]?.originalUrl
      || null,
  )
})

const recipeVariants = computed(() => recipeTree.value?.variants ?? [])

watch(
  recipeVariants,
  (variants) => {
    if (!variants.length) {
      activeVariantKey.value = ''
      return
    }

    const hasActive = variants.some((variant, index) => recipeVariantKey(variant, index) === activeVariantKey.value)
    if (!hasActive) {
      activeVariantKey.value = recipeVariantKey(variants[0], 0)
    }
  },
  { immediate: true },
)

const activeRecipeVariant = computed(() =>
  recipeVariants.value.find((variant, index) => recipeVariantKey(variant, index) === activeVariantKey.value)
  ?? recipeVariants.value[0]
  ?? null,
)

const activeRecipeRoots = computed(() => activeRecipeVariant.value?.roots ?? [])

const contentCards = computed<ContentCard[]>(() => {
  const cards: ContentCard[] = []

  const description = resolveLocalizedContent(
    contentLanguage.value,
    item.value?.descriptionZh,
    item.value?.descriptionEn,
    item.value?.description,
  )
  if (description.text) {
    cards.push({
      key: 'description',
      label: 'Description',
      text: description.text,
      languageLabel: description.languageLabel,
      fallbackMessage: description.fallbackMessage,
    })
  }

  const tooltip = resolveLocalizedContent(
    contentLanguage.value,
    item.value?.tooltipZh,
    item.value?.tooltipEn,
    item.value?.tooltip,
  )
  if (tooltip.text) {
    cards.push({
      key: 'tooltip',
      label: 'Tooltip',
      text: tooltip.text,
      languageLabel: tooltip.languageLabel,
      fallbackMessage: tooltip.fallbackMessage,
    })
  }

  return cards
})

const summaryText = computed(() =>
  contentCards.value[0]?.text || 'No public description has been published for this item yet.',
)

const summaryFallbackNote = computed(() => contentCards.value[0]?.fallbackMessage || '')

const treeDepthLabel = computed(() => {
  const configuredDepth = recipeTree.value?.treeMeta?.maxDepth
  if (typeof configuredDepth === 'number' && configuredDepth > 0) {
    return String(configuredDepth)
  }

  const inferredDepth = activeRecipeRoots.value.length
    ? Math.max(...activeRecipeRoots.value.map(root => inferTreeDepth(root)))
    : 0

  return inferredDepth > 0 ? String(inferredDepth) : ''
})

const heroStats = computed<MetricCard[]>(() => {
  const stats: MetricCard[] = [
    { label: 'Images', value: String(imageCards.value.length) },
    { label: 'Sources', value: String(sourceCards.value.length) },
    { label: 'Recipes', value: String(recipeCards.value.length) },
  ]

  if (activeRecipeRoots.value.length) {
    stats.push({ label: 'Tree Paths', value: String(activeRecipeRoots.value.length) })
  } else if (stackLabel.value) {
    stats.push({ label: 'Stack', value: stackLabel.value.replace(/^Stack\s+/, '') })
  } else if (typeof item.value?.damage === 'number') {
    stats.push({ label: 'Damage', value: String(item.value.damage) })
  } else if (typeof item.value?.defense === 'number') {
    stats.push({ label: 'Defense', value: String(item.value.defense) })
  } else if (typeof item.value?.useTime === 'number') {
    stats.push({ label: 'Use Time', value: String(item.value.useTime) })
  } else {
    stats.push({ label: 'Category', value: displayCategory.value })
  }

  return stats
})

const detailSections = computed<DetailSection[]>(() => {
  const sections: DetailSection[] = []

  const combatFields: DetailField[] = compactFields([
    numberField('Damage', item.value?.damage),
    numberField('Defense', item.value?.defense),
    numberField('Knockback', item.value?.knockback),
    numberField('Use Time', item.value?.useTime),
  ])
  if (combatFields.length) {
    sections.push({ title: 'Combat', fields: combatFields })
  }

  const economyFields: DetailField[] = compactFields([
    textField('Buy', formatCoins(item.value?.buy)),
    textField('Sell', formatCoins(item.value?.sell)),
    textField('Stack Size', stackValueLabel(item.value?.stack ?? item.value?.stackSize)),
    textField('Rarity', displayRarity.value),
  ])
  if (economyFields.length) {
    sections.push({ title: 'Economy', fields: economyFields })
  }

  const profileFields: DetailField[] = compactFields([
    textField('Internal Name', oneLine(item.value?.internalName)),
    textField('Category', displayCategory.value),
    numberField('Width', item.value?.width),
    numberField('Height', item.value?.height),
    numberField('Game Period', item.value?.gamePeriodId),
    numberField('Game Model', item.value?.gameModelId),
  ])
  if (profileFields.length) {
    sections.push({ title: 'Profile', fields: profileFields })
  }

  return sections
})

const recipeCards = computed<RecipeCard[]>(() =>
  relatedRecipes.value.slice(0, 8).map((recipe, index) => ({
    key: String(recipe.id ?? `${recipe.versionScope ?? 'recipe'}-${index}`),
    title:
      oneLine(recipe.resultItemNameZh)
      || oneLine(recipe.resultItemName)
      || oneLine(recipe.resultItemInternalName)
      || displayName.value,
    secondary: oneLine(recipe.resultItemNameZh)
      ? oneLine(recipe.resultItemName) || oneLine(recipe.resultItemInternalName)
      : oneLine(recipe.resultItemInternalName),
    quantity: `Output x${recipe.resultQuantity ?? 1}`,
    ingredients: (recipe.ingredients ?? [])
      .slice(0, 6)
      .map(ingredient => `${ingredientLabel(ingredient)} x${formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax)}`),
    stations: (recipe.stations ?? [])
      .slice(0, 4)
      .map(station => oneLine(station.itemNameZh) || oneLine(station.itemName) || oneLine(station.stationNameRaw))
      .filter(Boolean),
    source: [oneLine(recipe.versionScope), oneLine(recipe.sourcePage)].filter(Boolean).join(' / '),
    notes: oneLine(recipe.notes),
  })),
)

const sourceCards = computed<SourceCard[]>(() =>
  relatedSources.value.slice(0, 8).map((source, index) => ({
    key: String(source.id ?? `${source.sourceRefType ?? source.sourceType ?? 'source'}-${index}`),
    title:
      oneLine(source.sourceRefName)
      || oneLine(source.biomeNameZh)
      || oneLine(source.biomeNameEn)
      || oneLine(source.sourceType)
      || 'Linked source',
    secondary: [oneLine(source.sourceType), oneLine(source.sourceRefType)].filter(Boolean).join(' / '),
    quantity: quantityLabel(source),
    chance: chanceLabel(source),
    notes: [oneLine(source.conditions), oneLine(source.notes)].filter(Boolean).join(' / '),
  })),
)

const imageCards = computed<ImageCard[]>(() =>
  relatedImages.value
    .map((image, index) => ({
      key: String(image.id ?? index),
      url: resolveImage(image.imageUrl || image.cachedUrl || image.originalUrl || null),
      alt: image.sourceFileTitle || displayName.value,
      meta: [image.role || (image.isPrimary ? 'primary' : ''), image.provider || 'public'].filter(Boolean).join(' / '),
    }))
    .filter(card => Boolean(card.url))
    .slice(0, 8),
)

const treePreviewCards = computed<TreePreviewCard[]>(() =>
  activeRecipeRoots.value.slice(0, 6).map((root, index) => ({
    key: recipeNodeKey(root, index),
    title: recipeNodeLabel(root),
    secondary: recipeNodeSecondary(root),
    output: `Output x${root.resultQuantity ?? 1}`,
    ingredients: root.children?.length ?? 0,
    stations: root.stations?.length ?? 0,
  })),
)

const activeTreeSummary = computed(() => {
  if (!activeRecipeVariant.value) {
    return 'No recipe tree variant published'
  }

  const label = recipeVariantLabel(activeRecipeVariant.value, 0)
  const count = activeRecipeVariant.value.recipeCount ?? activeRecipeRoots.value.length
  const suffix = count === 1 ? 'path' : 'paths'
  return `${label} / ${count} ${suffix}`
})

const aggregateMetrics = computed<MetricCard[]>(() => [
  { label: 'Images', value: String(imageCards.value.length) },
  { label: 'Sources', value: String(sourceCards.value.length) },
  { label: 'Recipes', value: String(recipeCards.value.length) },
  { label: 'Tree', value: recipeVariants.value.length ? `${recipeVariants.value.length} variants` : 'No tree' },
])

const metadataFields = computed<DetailField[]>(() =>
  compactFields([
    numberField('Item ID', item.value?.id),
    textField('Category', displayCategory.value),
    textField('Internal Name', oneLine(item.value?.internalName)),
    textField('Rarity', displayRarity.value),
    textField('Aggregated', formatDateTime(aggregate.value?.aggregatedAt)),
    textField('Stack Cap', stackValueLabel(item.value?.stack ?? item.value?.stackSize)),
  ]),
)

const moduleRows = computed<DetailField[]>(() => {
  const rows: DetailField[] = []

  rows.push({
    label: 'Images',
    value: oneLine(moduleStatus.value.images) || (imageCards.value.length ? 'ready' : 'empty'),
  })
  rows.push({
    label: 'Sources',
    value: oneLine(moduleStatus.value.sources) || (sourceCards.value.length ? 'ready' : 'empty'),
  })
  rows.push({
    label: 'Recipes',
    value: oneLine(moduleStatus.value.recipes) || (recipeCards.value.length ? 'ready' : 'empty'),
  })

  return rows
})

function textValue(value?: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function oneLine(value?: string | null) {
  return textValue(value).replace(/\s+/g, ' ')
}

function compactFields(fields: Array<DetailField | null>) {
  return fields.filter((field): field is DetailField => Boolean(field))
}

function textField(label: string, value?: string | null): DetailField | null {
  const normalized = oneLine(value)
  return normalized ? { label, value: normalized } : null
}

function numberField(label: string, value?: number | null): DetailField | null {
  return typeof value === 'number' && Number.isFinite(value) ? { label, value: String(value) } : null
}

function stackValueLabel(value?: number | null) {
  return typeof value === 'number' && value > 0 ? `x${value}` : ''
}

function formatDateTime(value?: string | null) {
  const normalized = textValue(value)
  if (!normalized) {
    return ''
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return normalized
  }

  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatCoins(value?: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return ''
  }

  const total = Math.max(0, Math.trunc(value))
  const platinum = Math.floor(total / 1000000)
  const gold = Math.floor((total % 1000000) / 10000)
  const silver = Math.floor((total % 10000) / 100)
  const copper = total % 100

  const parts = [
    platinum > 0 ? `${platinum}p` : '',
    gold > 0 ? `${gold}g` : '',
    silver > 0 ? `${silver}s` : '',
    copper > 0 ? `${copper}c` : '',
  ].filter(Boolean)

  return `${parts.join(' ') || '0c'} (${total.toLocaleString()} copper)`
}

function formatQuantity(text?: string | null, min?: number | null, max?: number | null) {
  const normalized = oneLine(text)
  if (normalized) {
    return normalized
  }

  if (typeof min === 'number' && typeof max === 'number' && min !== max) {
    return `${min}-${max}`
  }

  if (typeof min === 'number') {
    return String(min)
  }

  if (typeof max === 'number') {
    return String(max)
  }

  return '1'
}

function quantityLabel(source: ItemSourceRelation) {
  const value = formatQuantity(source.quantityText, source.quantityMin, source.quantityMax)
  return value === '1' && source.quantityText == null && source.quantityMin == null && source.quantityMax == null
    ? ''
    : `Qty ${value}`
}

function chanceLabel(source: ItemSourceRelation) {
  const normalized = oneLine(source.chanceText)
  if (normalized) {
    return `Chance ${normalized}`
  }

  if (typeof source.chanceValue === 'number') {
    return `Chance ${source.chanceValue}%`
  }

  return ''
}

function ingredientLabel(recipeIngredient: RecipeIngredientRelation) {
  return oneLine(recipeIngredient?.itemNameZh)
    || oneLine(recipeIngredient?.itemName)
    || oneLine(recipeIngredient?.ingredientNameRaw)
    || oneLine(recipeIngredient?.itemInternalName)
    || 'Unknown ingredient'
}

function resolveLocalizedContent(preferred: ContentLanguage, zh?: string | null, en?: string | null, shared?: string | null) {
  const zhValue = textValue(zh)
  const enValue = textValue(en)
  const sharedValue = textValue(shared)

  if (preferred === 'zh') {
    if (zhValue) {
      return { text: zhValue, languageLabel: 'Chinese', fallbackMessage: '' }
    }
    if (sharedValue) {
      return { text: sharedValue, languageLabel: 'Shared', fallbackMessage: 'Chinese copy unavailable.' }
    }
    if (enValue) {
      return { text: enValue, languageLabel: 'English', fallbackMessage: 'Chinese copy unavailable.' }
    }
  }

  if (preferred === 'en') {
    if (enValue) {
      return { text: enValue, languageLabel: 'English', fallbackMessage: '' }
    }
    if (sharedValue) {
      return { text: sharedValue, languageLabel: 'Shared', fallbackMessage: 'English copy unavailable.' }
    }
    if (zhValue) {
      return { text: zhValue, languageLabel: 'Chinese', fallbackMessage: 'English copy unavailable.' }
    }
  }

  return { text: '', languageLabel: '', fallbackMessage: '' }
}

function resolveImage(value?: string | null) {
  const normalized = textValue(value)
  if (!normalized) {
    return ''
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function flattenCategories(nodes: Category[]) {
  const result: Category[] = []

  nodes.forEach((node) => {
    result.push(node)
    if (node.children?.length) {
      result.push(...flattenCategories(node.children))
    }
  })

  return result
}

function recipeVariantKey(variant: ItemRecipeTreeVariant, index = 0) {
  return oneLine(variant.variantKey) || oneLine(variant.versionScope) || oneLine(variant.variantLabel) || `variant-${index}`
}

function recipeVariantLabel(variant: ItemRecipeTreeVariant, index = 0) {
  return oneLine(variant.variantLabel) || oneLine(variant.versionScope) || `Variant ${index + 1}`
}

function recipeNodeLabel(node: ItemRecipeTreeNode) {
  return oneLine(node.displayName)
    || oneLine(node.itemNameZh)
    || oneLine(node.itemName)
    || oneLine(node.groupCanonicalName)
    || oneLine(node.itemInternalName)
    || 'Unknown item'
}

function recipeNodeSecondary(node: ItemRecipeTreeNode) {
  if (oneLine(node.itemNameZh)) {
    return oneLine(node.itemName) || oneLine(node.itemInternalName)
  }

  const display = recipeNodeLabel(node)
  const internalName = oneLine(node.itemInternalName)
  return internalName && internalName !== display ? internalName : ''
}

function recipeNodeKey(node: ItemRecipeTreeNode, index = 0) {
  return String(node.recipeId ?? node.itemId ?? node.referenceKey ?? index)
}

function inferTreeDepth(node: ItemRecipeTreeNode): number {
  if (!node.children?.length) {
    return 1
  }

  return 1 + Math.max(...node.children.map(child => inferTreeDepth(child)))
}

async function loadItem() {
  const itemId = Number(route.params.id)

  if (!Number.isFinite(itemId) || itemId <= 0) {
    aggregate.value = null
    categories.value = []
    recipeTree.value = null
    error.value = 'Invalid item id'
    notFound.value = false
    isLoading.value = false
    return
  }

  isLoading.value = true
  error.value = ''
  notFound.value = false
  activeVariantKey.value = ''

  try {
    const [aggregateRes, categoriesRes, recipeTreeRes] = await Promise.all([
      fetchItemAggregateById(itemId, 'images,sources,recipes'),
      fetchCategories(),
      fetchItemRecipeTree(itemId, 3),
    ])

    if (!aggregateRes.success || !aggregateRes.data?.item?.id) {
      const message = aggregateRes.message || 'Failed to fetch item detail'

      if (aggregateRes.statusCode === 404 || /not found/i.test(message)) {
        aggregate.value = null
        categories.value = []
        recipeTree.value = null
        notFound.value = true
        return
      }

      throw new Error(message)
    }

    aggregate.value = aggregateRes.data
    categories.value = categoriesRes.success ? flattenCategories(categoriesRes.data || []) : []
    recipeTree.value = recipeTreeRes
  } catch (cause) {
    console.error('Failed to load item detail:', cause)
    aggregate.value = null
    categories.value = []
    recipeTree.value = null
    notFound.value = false
    error.value = cause instanceof Error ? cause.message : 'Failed to load item detail'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    void loadItem()
  },
  { immediate: true },
)
</script>

<style scoped>
.item-detail-view {
  display: grid;
  gap: 1rem;
  color: var(--text-primary);
}

.item-detail-view__state {
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  text-align: center;
  padding: 2rem 1.25rem;
}

.item-detail-view__state strong {
  color: var(--text-primary);
  font-size: 1.08rem;
}

.item-detail-view__state p {
  color: var(--text-secondary);
}

.item-detail-view__state--error {
  border-color: color-mix(in srgb, var(--accent-error) 24%, var(--border-color));
}

.item-detail-view__spinner {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-top-color: var(--accent-primary);
  animation: item-spin 900ms linear infinite;
}

.item-detail-view__hero {
  gap: 1rem;
}

.item-detail-view__hero-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
}

.item-detail-view__media {
  display: grid;
  align-content: space-between;
  gap: 1rem;
  min-height: 320px;
  padding: 1rem;
  border-radius: 1.25rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent-primary) 14%, transparent), transparent 56%),
    linear-gradient(180deg, color-mix(in srgb, white 60%, var(--surface-panel)), var(--surface-panel));
}

.item-detail-view__image,
.item-detail-view__fallback {
  width: 100%;
  min-height: 240px;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  background: color-mix(in srgb, white 66%, var(--bg-secondary));
}

.item-detail-view__image {
  object-fit: contain;
  padding: 1rem;
}

.item-detail-view__fallback {
  display: grid;
  place-items: center;
  gap: 0.55rem;
  color: var(--text-muted);
}

.item-detail-view__fallback-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.75rem;
  min-height: 4.75rem;
  border-radius: 1.4rem;
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.item-detail-view__media-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.item-detail-view__media-meta span {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 84%, transparent);
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
}

.item-detail-view__hero-copy,
.item-detail-view__main,
.item-detail-view__sidebar {
  display: grid;
  gap: 1rem;
  align-content: start;
}

.item-detail-view__badges,
.item-detail-view__variant-tabs,
.item-detail-view__trail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.item-detail-view__badge,
.item-detail-view__panel-chip,
.item-detail-view__variant-button,
.item-detail-view__trail-chip {
  padding: 0.38rem 0.72rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  background: color-mix(in srgb, white 58%, var(--bg-secondary));
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
}

.item-detail-view__badge--rarity {
  color: inherit;
}

.item-detail-view__heading {
  display: grid;
  gap: 0.55rem;
}

.item-detail-view__secondary,
.item-detail-view__summary,
.item-detail-view__summary-note,
.item-detail-view__panel-head p,
.item-detail-view__recipe-card p,
.item-detail-view__source-card p,
.item-detail-view__tree-card p,
.item-detail-view__empty-copy {
  color: var(--text-secondary);
}

.item-detail-view__summary {
  margin: 0;
  line-height: 1.8;
  font-size: 1rem;
}

.item-detail-view__summary-note {
  font-size: 0.84rem;
}

.item-detail-view__language {
  display: grid;
  gap: 0.5rem;
}

.item-detail-view__language-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.item-detail-view__language-toggle {
  display: inline-flex;
  gap: 0.4rem;
  padding: 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
}

.item-detail-view__language-button {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.item-detail-view__language-button--active {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
}

.item-detail-view__stat-grid,
.item-detail-view__aggregate-grid,
.item-detail-view__section-grid,
.item-detail-view__content-grid,
.item-detail-view__tree-grid {
  display: grid;
  gap: 0.85rem;
}

.item-detail-view__stat-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.item-detail-view__aggregate-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.item-detail-view__section-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.item-detail-view__content-grid,
.item-detail-view__tree-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.item-detail-view__panel,
.item-detail-view__sidebar-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.item-detail-view__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.item-detail-view__panel-head h2 {
  color: var(--text-primary);
  font-size: 1.08rem;
}

.item-detail-view__content-card,
.item-detail-view__section-card,
.item-detail-view__recipe-card,
.item-detail-view__source-card,
.item-detail-view__tree-card,
.item-detail-view__aggregate-card,
.item-detail-view__image-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.9rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  background: color-mix(in srgb, white 54%, var(--surface-soft));
}

.item-detail-view__content-head,
.item-detail-view__recipe-head,
.item-detail-view__source-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.item-detail-view__content-head strong,
.item-detail-view__recipe-head h3,
.item-detail-view__source-head h3,
.item-detail-view__tree-card strong,
.item-detail-view__section-card h3 {
  color: var(--text-primary);
}

.item-detail-view__content-head span,
.item-detail-view__content-card small,
.item-detail-view__recipe-head span,
.item-detail-view__recipe-head p,
.item-detail-view__source-head p,
.item-detail-view__tree-card-meta,
.item-detail-view__image-card span {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.item-detail-view__content-card p {
  white-space: pre-line;
  line-height: 1.75;
  color: var(--text-secondary);
}

.item-detail-view__field-list,
.item-detail-view__sidebar-fields,
.item-detail-view__module-list,
.item-detail-view__recipe-list,
.item-detail-view__source-list {
  display: grid;
  gap: 0.8rem;
}

.item-detail-view__field-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.item-detail-view__field-row dt {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.item-detail-view__field-row dd {
  text-align: right;
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 700;
}

.item-detail-view__tree-block {
  display: grid;
  gap: 0.85rem;
}

.item-detail-view__variant-button {
  cursor: pointer;
}

.item-detail-view__variant-button--active {
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 28%, var(--border-color));
}

.item-detail-view__tree-meta,
.item-detail-view__tree-card-meta,
.item-detail-view__source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.item-detail-view__tree-meta span,
.item-detail-view__tree-card-meta span,
.item-detail-view__source-meta span {
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 84%, transparent);
}

.item-detail-view__aggregate-card span {
  color: var(--text-muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.item-detail-view__aggregate-card strong,
.item-detail-view__module-row strong {
  color: var(--text-primary);
}

.item-detail-view__module-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0.85rem;
  border-radius: 1rem;
  background: color-mix(in srgb, var(--bg-primary) 84%, transparent);
}

.item-detail-view__module-row span {
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.item-detail-view__image-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.item-detail-view__image-card img {
  width: 100%;
  height: 110px;
  object-fit: contain;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
}

@keyframes item-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .item-detail-view__hero-layout,
  .item-detail-view__section-grid,
  .item-detail-view__content-grid,
  .item-detail-view__tree-grid,
  .item-detail-view__stat-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .item-detail-view__aggregate-grid,
  .item-detail-view__image-grid {
    grid-template-columns: 1fr;
  }

  .item-detail-view__panel-head,
  .item-detail-view__content-head,
  .item-detail-view__recipe-head,
  .item-detail-view__source-head,
  .item-detail-view__field-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .item-detail-view__field-row dd {
    text-align: left;
  }
}
</style>
