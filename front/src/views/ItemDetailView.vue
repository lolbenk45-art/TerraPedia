<template>
  <div class="item-detail-view py-8">
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div class="mb-6 flex flex-wrap items-center gap-2 text-sm" style="color: var(--text-secondary);">
        <router-link to="/" class="transition-colors hover:text-[var(--accent-primary)]">首页</router-link>
        <span style="color: var(--text-muted);">/</span>
        <router-link to="/items" class="transition-colors hover:text-[var(--accent-primary)]">物品列表</router-link>
        <template v-for="category in breadcrumbCategories" :key="category.id">
          <span style="color: var(--text-muted);">/</span>
          <span>{{ category.name }}</span>
        </template>
        <span style="color: var(--text-muted);">/</span>
        <span style="color: var(--text-primary);">{{ item?.name || '物品详情' }}</span>
      </div>

      <div class="mb-6">
        <router-link
          to="/items"
          class="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
          style="border-color: var(--border-color); color: var(--text-primary);"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          返回物品列表
        </router-link>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
        <div
          class="h-12 w-12 animate-spin rounded-full border-2"
          style="border-color: var(--bg-tertiary); border-top-color: var(--accent-primary);"
        ></div>
        <p class="mt-4 text-sm" style="color: var(--text-secondary);">正在加载物品详情...</p>
      </div>

      <div
        v-else-if="error"
        class="rounded-2xl border p-8 text-center"
        style="background-color: var(--bg-secondary); border-color: var(--border-color);"
      >
        <p class="mb-4 text-sm text-red-500">{{ error }}</p>
        <router-link
          to="/items"
          class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style="background-color: var(--accent-primary);"
        >
          返回物品列表
        </router-link>
      </div>

      <div
        v-else-if="item"
        class="space-y-6"
      >
        <section
          class="item-detail-view__hero overflow-hidden rounded-3xl border shadow-lg"
          style="background-color: var(--bg-secondary); border-color: var(--border-color);"
        >
          <div class="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div
              class="item-detail-view__media relative flex min-h-[280px] items-center justify-center overflow-hidden border-b p-8 lg:border-b-0 lg:border-r"
              style="background: radial-gradient(circle at top, color-mix(in srgb, var(--accent-primary) 18%, var(--bg-primary)), var(--bg-primary) 60%); border-color: var(--border-color);"
            >
              <div
                class="absolute inset-0 opacity-25"
                style="background-image: radial-gradient(circle at 1px 1px, var(--text-muted) 1px, transparent 0); background-size: 18px 18px;"
              ></div>
              <img
                v-if="item.image"
                :src="getImageUrl(item.image)"
                :alt="item.name"
                class="item-detail-view__image relative z-10 max-h-56 w-full object-contain drop-shadow-2xl"
              />
              <div
                v-else
                class="item-detail-view__fallback relative z-10 flex h-36 w-36 items-center justify-center rounded-3xl text-6xl"
                style="background-color: color-mix(in srgb, var(--bg-secondary) 75%, transparent);"
              >
                {{ categoryIcon(displayCategory) }}
              </div>
            </div>

            <div class="p-6 lg:p-8">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      v-if="displayRarity"
                      class="rounded-full px-3 py-1 text-xs font-semibold"
                      :class="rarityClass"
                    >
                      {{ displayRarity }}
                    </span>
                    <span
                      class="rounded-full border px-3 py-1 text-xs font-medium"
                      style="border-color: var(--border-color); color: var(--text-secondary);"
                    >
                      {{ displayCategory }}
                    </span>
                    <span
                      class="rounded-full border px-3 py-1 text-xs font-mono"
                      style="border-color: var(--border-color); color: var(--text-muted);"
                    >
                      ID {{ item.id }}
                    </span>
                  </div>

                  <h1 class="text-3xl font-bold lg:text-4xl" style="color: var(--text-primary);">{{ displayName }}</h1>
                  <p
                    v-if="secondaryName"
                    class="mt-2 font-mono text-sm"
                    style="color: var(--text-muted);"
                  >
                    {{ secondaryName }}
                  </p>
                </div>
              </div>

              <div
                v-if="summaryText"
                class="item-detail-view__summary mt-6 rounded-2xl border p-4"
                style="background-color: var(--bg-primary); border-color: var(--border-color);"
              >
                <p class="leading-7" style="color: var(--text-secondary);">{{ summaryText }}</p>
              </div>

              <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div
                  v-for="stat in heroStats"
                  :key="stat.label"
                  class="item-detail-view__stat rounded-2xl border p-4"
                  style="background-color: var(--bg-primary); border-color: var(--border-color);"
                >
                  <div class="text-xs font-medium" style="color: var(--text-muted);">{{ stat.label }}</div>
                  <div class="mt-2 text-lg font-semibold" style="color: var(--text-primary);">{{ stat.value }}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div class="space-y-6">
            <div
              v-if="descriptionText && tooltipText && descriptionText !== tooltipText"
              class="rounded-2xl border p-6"
              style="background-color: var(--bg-secondary); border-color: var(--border-color);"
            >
              <h2 class="mb-3 text-lg font-semibold" style="color: var(--text-primary);">说明与提示</h2>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="rounded-2xl border p-4" style="background-color: var(--bg-primary); border-color: var(--border-color);">
                  <div class="mb-2 text-xs font-medium uppercase tracking-wide" style="color: var(--text-muted);">Description</div>
                  <p class="leading-7" style="color: var(--text-secondary);">{{ descriptionText }}</p>
                </div>
                <div class="rounded-2xl border p-4" style="background-color: var(--bg-primary); border-color: var(--border-color);">
                  <div class="mb-2 text-xs font-medium uppercase tracking-wide" style="color: var(--text-muted);">Tooltip</div>
                  <p class="leading-7" style="color: var(--text-secondary);">{{ tooltipText }}</p>
                </div>
              </div>
            </div>

            <div
              class="rounded-2xl border p-6"
              style="background-color: var(--bg-secondary); border-color: var(--border-color);"
            >
              <h2 class="mb-5 text-lg font-semibold" style="color: var(--text-primary);">详细信息</h2>
              <div class="grid gap-5 sm:grid-cols-2">
                <div
                  v-for="section in detailSections"
                  :key="section.title"
                  class="rounded-2xl border p-4"
                  style="background-color: var(--bg-primary); border-color: var(--border-color);"
                >
                  <h3 class="mb-4 text-sm font-semibold uppercase tracking-wide" style="color: var(--text-muted);">
                    {{ section.title }}
                  </h3>
                  <div class="space-y-3">
                    <div
                      v-for="field in section.fields"
                      :key="field.label"
                      class="flex items-start justify-between gap-4"
                    >
                      <span class="text-sm" style="color: var(--text-secondary);">{{ field.label }}</span>
                      <span class="text-right text-sm font-medium" style="color: var(--text-primary);">{{ field.value }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              class="rounded-2xl border p-6"
              style="background-color: var(--bg-secondary); border-color: var(--border-color);"
            >
              <div class="mb-5 flex items-center justify-between gap-3">
                <h2 class="text-lg font-semibold" style="color: var(--text-primary);">配方</h2>
                <span class="text-sm" style="color: var(--text-secondary);">{{ relatedRecipes.length }} 条</span>
              </div>

              <div v-if="desktopRecipeVariant" class="space-y-4">
                <div
                  v-if="desktopRecipeStations.length"
                  class="rounded-2xl border p-4"
                  style="background-color: var(--bg-primary); border-color: var(--border-color);"
                >
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-base font-semibold" style="color: var(--text-primary);">Desktop 制作站</h3>
                      <p class="mt-1 text-sm" style="color: var(--text-secondary);">将工作台、熔炉、铁砧等制作站独立列出，先看站点再看流程。</p>
                    </div>
                    <span class="rounded-full border px-3 py-1 text-xs font-semibold" style="border-color: var(--border-color); color: var(--text-primary);">
                      {{ desktopRecipeStations.length }} 个
                    </span>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <article
                      v-for="station in desktopRecipeStations"
                      :key="`${station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw}-${station.isAlternative}`"
                      class="rounded-2xl border p-3"
                      style="background-color: var(--bg-secondary); border-color: var(--border-color);"
                    >
                      <div class="flex items-center gap-3">
                        <img
                          v-if="getImageUrl(station.stationImage)"
                          :src="getImageUrl(station.stationImage)"
                          :alt="getRecipeStationName(station)"
                          class="h-11 w-11 rounded-xl border object-contain p-1.5"
                          style="background-color: var(--bg-primary); border-color: var(--border-color);"
                        />
                        <div class="min-w-0">
                          <div class="text-sm font-semibold" style="color: var(--text-primary);">{{ getRecipeStationName(station) }}</div>
                          <div class="mt-1 text-xs" style="color: var(--text-secondary);">
                            {{ station.stationType === 'environment' ? '环境条件' : station.isAlternative ? '可替代制作站' : '主要制作站' }}
                          </div>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>

                <div
                  class="rounded-2xl border p-4"
                  style="background-color: var(--bg-primary); border-color: var(--border-color);"
                >
                  <RecipeFlowChart
                    :variant="desktopRecipeVariant"
                    :resolve-image="getImageUrl"
                  />
                </div>
              </div>

              <div v-else-if="relatedRecipes.length" class="space-y-4">
                <article
                  v-for="recipe in relatedRecipes"
                  :key="recipe.id ?? recipe.versionScope ?? recipe.sourcePage"
                  class="rounded-2xl border p-4"
                  style="background-color: var(--bg-primary); border-color: var(--border-color);"
                >
                  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <img
                        v-if="getRecipeResultImage(recipe)"
                        :src="getImageUrl(getRecipeResultImage(recipe))"
                        :alt="getRecipeResultName(recipe)"
                        class="h-12 w-12 rounded-xl border object-contain p-1.5"
                        style="background-color: var(--bg-secondary); border-color: var(--border-color);"
                      />
                      <div>
                        <strong style="color: var(--text-primary);">{{ formatVersionScope(recipe.versionScope) }}</strong>
                        <div class="mt-1 text-sm font-medium" style="color: var(--text-primary);">{{ getRecipeResultName(recipe) }}</div>
                        <p v-if="recipe.sourcePage || recipe.notes" class="mt-1 text-sm" style="color: var(--text-secondary);">
                          {{ recipe.sourcePage || recipe.notes }}
                        </p>
                      </div>
                    </div>
                    <span
                      class="rounded-full border px-3 py-1 text-sm font-medium"
                      style="border-color: var(--border-color); color: var(--text-primary);"
                    >
                      产出 {{ recipe.resultQuantity ?? 1 }}
                    </span>
                  </div>

                  <div class="mb-4 rounded-2xl border p-4" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
                    <div class="mb-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);">配方树</div>
                    <RecipeTreeBranch
                      :root-item-id="item.id"
                      :root-item-name="displayName"
                      :root-item-internal-name="item.internalName"
                      :root-item-secondary-name="secondaryName"
                      :root-item-image="item.image || ''"
                      :recipe="recipe"
                      :depth="0"
                      :max-depth="3"
                      :ancestry="[item.id]"
                    />
                  </div>

                  <div class="grid gap-4 lg:grid-cols-2">
                    <div class="rounded-2xl border p-4" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
                      <div class="mb-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);">原料</div>
                      <ul v-if="recipe.ingredients?.length" class="space-y-2">
                        <li
                          v-for="ingredient in recipe.ingredients"
                          :key="ingredient.id ?? ingredient.itemInternalName ?? ingredient.ingredientNameRaw"
                          class="flex items-start justify-between gap-4 text-sm"
                        >
                          <span style="color: var(--text-primary);">{{ ingredient.itemNameZh || ingredient.itemName || ingredient.ingredientNameRaw || '未知原料' }}</span>
                          <span style="color: var(--text-secondary);">{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
                        </li>
                      </ul>
                      <p v-else class="text-sm" style="color: var(--text-secondary);">暂无原料信息</p>
                    </div>

                    <div class="rounded-2xl border p-4" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
                      <div class="mb-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);">工作台</div>
                      <ul v-if="recipe.stations?.length" class="space-y-2">
                        <li
                          v-for="station in recipe.stations"
                          :key="station.id ?? station.itemInternalName ?? station.stationNameRaw"
                          class="flex items-start justify-between gap-4 text-sm"
                        >
                          <span style="color: var(--text-primary);">{{ station.itemNameZh || station.itemName || station.stationNameRaw || '未知工作台' }}</span>
                          <span v-if="station.isAlternative" style="color: var(--text-secondary);">可替代</span>
                        </li>
                      </ul>
                      <p v-else class="text-sm" style="color: var(--text-secondary);">暂无工作台信息</p>
                    </div>
                  </div>
                </article>
              </div>

              <p v-else class="text-sm" style="color: var(--text-secondary);">暂无可展示的配方数据。</p>
            </div>
          </div>

          <div class="space-y-6">
            <div
              class="rounded-2xl border p-6"
              style="background-color: var(--bg-secondary); border-color: var(--border-color);"
            >
              <h2 class="mb-4 text-lg font-semibold" style="color: var(--text-primary);">分类路径</h2>
              <div v-if="breadcrumbCategories.length" class="flex flex-wrap items-center gap-2">
                <template v-for="category in breadcrumbCategories" :key="category.id">
                  <span
                    class="rounded-full border px-3 py-1 text-sm font-medium"
                    style="border-color: var(--border-color); color: var(--text-primary);"
                  >
                    {{ category.name }}
                  </span>
                  <span style="color: var(--text-muted);">/</span>
                </template>
                <span
                  class="rounded-full px-3 py-1 text-sm font-semibold text-white"
                  style="background-color: var(--accent-primary);"
                >
                  {{ displayName }}
                </span>
              </div>
              <p v-else class="text-sm" style="color: var(--text-secondary);">
                当前接口未返回可追溯的分类路径，仅能确认所属分类为 {{ displayCategory }}。
              </p>
            </div>

            <div
              class="rounded-2xl border p-6"
              style="background-color: var(--bg-secondary); border-color: var(--border-color);"
            >
              <h2 class="mb-4 text-lg font-semibold" style="color: var(--text-primary);">元数据</h2>
              <div class="space-y-3">
                <div class="rounded-xl border p-3" style="background-color: var(--bg-primary); border-color: var(--border-color);">
                  <div class="mb-2 text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted);">Aggregate</div>
                  <div class="grid grid-cols-3 gap-2 text-sm">
                    <div style="color: var(--text-secondary);">图片 <span style="color: var(--text-primary);">{{ relatedSummary.images }}</span></div>
                    <div style="color: var(--text-secondary);">来源 <span style="color: var(--text-primary);">{{ relatedSummary.sources }}</span></div>
                    <div style="color: var(--text-secondary);">配方 <span style="color: var(--text-primary);">{{ relatedSummary.recipes }}</span></div>
                  </div>
                </div>
                <div
                  v-for="field in metadataFields"
                  :key="field.label"
                  class="flex items-start justify-between gap-4"
                >
                  <span class="text-sm" style="color: var(--text-secondary);">{{ field.label }}</span>
                  <span class="text-right text-sm font-medium" style="color: var(--text-primary);">{{ field.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div
        v-else
        class="rounded-2xl border p-10 text-center"
        style="background-color: var(--bg-secondary); border-color: var(--border-color);"
      >
        <p class="text-sm" style="color: var(--text-secondary);">物品不存在</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchCategories, fetchItemAggregateById, fetchItemRecipeTree } from '@/api'
import RecipeFlowChart from '@/components/RecipeFlowChart.vue'
import RecipeTreeBranch from '@/components/RecipeTreeBranch.vue'
import type { Category, Item, ItemImageRelation, ItemRecipeRelation, ItemRecipeTreeResponse, ItemRecipeTreeStation, ItemRecipeTreeVariant, ItemSourceRelation } from '@/types'
import { formatCurrencyWithRaw } from '@/utils/currency'
import { getRarityPresentation } from '@/utils/rarity'

type DetailField = {
  label: string
  value: string
}

type DetailSection = {
  title: string
  fields: DetailField[]
}

const route = useRoute()
const item = ref<Item | null>(null)
const categories = ref<Category[]>([])
const relatedImages = ref<ItemImageRelation[]>([])
const relatedSources = ref<ItemSourceRelation[]>([])
const relatedRecipes = ref<ItemRecipeRelation[]>([])
const recipeTree = ref<ItemRecipeTreeResponse | null>(null)
const isLoading = ref(true)
const error = ref('')

const flattenCategories = (nodes: Category[]): Category[] => {
  const result: Category[] = []

  nodes.forEach((node) => {
    result.push(node)
    if (node.children?.length) {
      result.push(...flattenCategories(node.children))
    }
  })

  return result
}

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
  return lastCategory?.name ?? item.value?.categoryName ?? item.value?.category ?? '其他'
})
const displayName = computed(() => item.value?.nameZh?.trim() || item.value?.name || '未知物品')
const secondaryName = computed(() => {
  if (!item.value) return ''
  if (item.value.nameZh?.trim()) {
    return item.value.name || item.value.internalName || ''
  }
  return item.value.internalName || ''
})

const rarityInfo = computed(() => getRarityPresentation(item.value))
const displayRarity = computed(() => rarityInfo.value.label === '未知' ? '' : rarityInfo.value.label)

const descriptionText = computed(() => item.value?.descriptionZh?.trim() || item.value?.description?.trim() || '')
const tooltipText = computed(() => item.value?.tooltipZh?.trim() || item.value?.tooltip?.trim() || '')

const summaryText = computed(() => {
  if (descriptionText.value) {
    return descriptionText.value
  }
  if (tooltipText.value) {
    return tooltipText.value
  }
  return ''
})

const formatNullable = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return String(value)
}

const formatBoolean = (value: boolean | undefined): string | null => {
  if (value === undefined) {
    return null
  }
  return value ? '是' : '否'
}

const formatNumber = (value: number | undefined): string | null => {
  if (value === undefined || value === null) {
    return null
  }
  return value.toLocaleString()
}

const formatCoinValue = (value: number | undefined): string | null => formatCurrencyWithRaw(value)

const formatDateTime = (value: string | undefined): string | null => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

const formatQuantity = (text?: string | null, min?: number, max?: number): string => {
  if (text?.trim()) {
    return text.trim()
  }
  if (min != null && max != null && min !== max) {
    return `${min}-${max}`
  }
  if (min != null) {
    return String(min)
  }
  if (max != null) {
    return String(max)
  }
  return '1'
}

const formatVersionScope = (value?: string | null): string => {
  const text = value?.trim() ?? ''
  if (!text) {
    return '主版本配方'
  }
  const labels = ['Desktop version', 'Console version', 'Mobile version', 'Old-gen console version', 'Nintendo 3DS version']
    .filter(label => text.includes(label))
  return labels.length > 0 ? `${labels.join(' / ')} only` : text
}

const getRecipeResultName = (recipe: ItemRecipeRelation): string => (
  recipe.resultItemNameZh?.trim()
  || recipe.resultItemName?.trim()
  || recipe.resultItemInternalName?.trim()
  || displayName.value
)

const getRecipeResultImage = (recipe: ItemRecipeRelation): string => (
  recipe.resultItemImage?.trim()
  || item.value?.image?.trim()
  || ''
)

const compactFields = (fields: Array<{ label: string; value: string | null }>): DetailField[] => {
  return fields
    .filter((field): field is { label: string; value: string } => field.value !== null)
    .map((field) => ({ label: field.label, value: field.value }))
}

const heroStats = computed(() => {
  if (!item.value) {
    return []
  }

  return compactFields([
    { label: '分类', value: displayCategory.value },
    { label: '伤害', value: formatNumber(item.value.damage) },
    { label: '防御', value: formatNumber(item.value.defense) },
    { label: '堆叠上限', value: formatNumber(item.value.stackSize ?? item.value.stack) },
    { label: '击退', value: formatNumber(item.value.knockback) },
    { label: '使用时间', value: formatNumber(item.value.useTime) },
  ]).slice(0, 4)
})

const detailSections = computed<DetailSection[]>(() => {
  if (!item.value) {
    return []
  }

  const sections: DetailSection[] = []

  const basicFields = compactFields([
    { label: '分类名称', value: displayCategory.value },
    { label: '分类路径', value: breadcrumbCategories.value.map((category) => category.name).join(' / ') || null },
    { label: '稀有度', value: displayRarity.value || null },
    { label: '可堆叠', value: formatBoolean(item.value.isStackable) },
    { label: '堆叠上限', value: formatNumber(item.value.stackSize ?? item.value.stack) },
  ])

  if (basicFields.length) {
    sections.push({ title: '基础属性', fields: basicFields })
  }

  const combatFields = compactFields([
    { label: '伤害', value: formatNumber(item.value.damage) },
    { label: '防御', value: formatNumber(item.value.defense) },
    { label: '击退', value: formatNumber(item.value.knockback) },
    { label: '使用时间', value: formatNumber(item.value.useTime) },
    { label: '宽度', value: formatNumber(item.value.width) },
    { label: '高度', value: formatNumber(item.value.height) },
  ])

  if (combatFields.length) {
    sections.push({ title: '战斗与尺寸', fields: combatFields })
  }

  const economyFields = compactFields([
    { label: '购买价格', value: formatCoinValue(item.value.buy) },
    { label: '出售价格', value: formatCoinValue(item.value.sell) },
    { label: '游戏时期 ID', value: formatNullable(item.value.gamePeriodId) },
    { label: '游戏模式 ID', value: formatNullable(item.value.gameModelId) },
  ])

  if (economyFields.length) {
    sections.push({ title: '经济与阶段', fields: economyFields })
  }

  return sections
})

const metadataFields = computed<DetailField[]>(() => {
  if (!item.value) {
    return []
  }

  return compactFields([
    { label: '物品 ID', value: formatNullable(item.value.id) },
    { label: '分类 ID', value: formatNullable(item.value.categoryId) },
    { label: '稀有度 ID', value: formatNullable(item.value.rarityId) },
    { label: '内部名', value: item.value.internalName ?? null },
    { label: '英文名', value: item.value.nameZh?.trim() ? item.value.name : null },
    { label: '创建时间', value: formatDateTime(item.value.createdAt) },
    { label: '更新时间', value: formatDateTime(item.value.updatedAt) },
  ])
})

const relatedSummary = computed(() => ({
  images: relatedImages.value.length,
  sources: relatedSources.value.length,
  recipes: (recipeTree.value?.variants?.length ?? 0) || relatedRecipes.value.length,
}))

const desktopRecipeVariant = computed<ItemRecipeTreeVariant | null>(() => {
  const variants = recipeTree.value?.variants || []
  if (!variants.length) {
    return null
  }

  const desktopExact = variants.find((variant) => {
    const scope = variant.versionScope?.toLowerCase() || ''
    return scope.includes('desktop version')
  })
  if (desktopExact) {
    return desktopExact
  }

  const desktopMixed = variants.find((variant) => {
    const scope = variant.versionScope?.toLowerCase() || ''
    return scope.includes('desktop')
  })
  if (desktopMixed) {
    return desktopMixed
  }

  const baseVariant = variants.find((variant) => !variant.versionScope?.trim())
  return baseVariant || variants[0] || null
})

const desktopRecipeStations = computed<ItemRecipeTreeStation[]>(() => {
  const roots = desktopRecipeVariant.value?.roots || []
  const deduped = new Map<string, ItemRecipeTreeStation>()

  roots.forEach((root) => {
    ;(root.stations || []).forEach((station) => {
      const key = String(station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw ?? '')
      if (!key || deduped.has(key)) return
      deduped.set(key, station)
    })
  })

  return Array.from(deduped.values())
})

const rarityClass = computed(() => rarityInfo.value.badgeClass)

const getImageUrl = (image?: string | null) => {
  if (!image) return ''
  if (image.startsWith('http')) return image
  if (image.startsWith('localhost:')) return `http://${image}`
  return image.startsWith('/') ? image : `/${image}`
}

const getRecipeStationName = (station: ItemRecipeTreeStation) => (
  station.stationNameZh?.trim()
  || station.stationName?.trim()
  || station.stationNameRaw?.trim()
  || station.stationInternalName?.trim()
  || '未知制作站'
)

const categoryIcon = (name: string) => {
  const normalized = name.toLowerCase()

  if (normalized.includes('weapon') || normalized.includes('sword') || normalized.includes('武器')) return '⚔️'
  if (normalized.includes('tool') || normalized.includes('pickaxe') || normalized.includes('工具')) return '⛏️'
  if (normalized.includes('armor') || normalized.includes('盔甲') || normalized.includes('护甲')) return '🛡️'
  if (normalized.includes('consumable') || normalized.includes('药') || normalized.includes('消耗')) return '🧪'
  if (normalized.includes('material') || normalized.includes('材料')) return '📦'
  if (normalized.includes('furniture') || normalized.includes('家具')) return '🪑'
  if (normalized.includes('block') || normalized.includes('方块')) return '🧱'
  if (normalized.includes('ammo') || normalized.includes('arrow') || normalized.includes('弹药')) return '🏹'
  return '📘'
}

const loadItem = async () => {
  const itemId = Number(route.params.id)

  if (!Number.isFinite(itemId) || itemId <= 0) {
    error.value = '无效的物品 ID'
    item.value = null
    recipeTree.value = null
    isLoading.value = false
    return
  }

  try {
    isLoading.value = true
    error.value = ''

    const [itemResponse, categoriesResponse] = await Promise.all([
      fetchItemAggregateById(itemId),
      fetchCategories(),
    ])

    if (!itemResponse.success || !itemResponse.data?.item?.id) {
      throw new Error(itemResponse.message || '物品不存在')
    }

    item.value = itemResponse.data.item
    relatedImages.value = itemResponse.data.images || []
    relatedSources.value = itemResponse.data.sources || []
    relatedRecipes.value = itemResponse.data.recipes || []
    categories.value = categoriesResponse.success ? flattenCategories(categoriesResponse.data || []) : []
    recipeTree.value = await fetchItemRecipeTree(itemId, 4)
  } catch (err) {
    console.error('加载物品详情失败:', err)
    item.value = null
    categories.value = []
    relatedImages.value = []
    relatedSources.value = []
    relatedRecipes.value = []
    recipeTree.value = null
    error.value = err instanceof Error ? err.message : '加载物品详情失败'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadItem)

watch(
  () => route.params.id,
  () => {
    loadItem()
  }
)
</script>

<style scoped>
.item-detail-view {
  color: var(--text-primary);
}

.item-detail-view__hero {
  box-shadow: 0 18px 40px rgba(42, 61, 49, 0.08) !important;
  border-color: color-mix(in srgb, var(--border-color) 82%, transparent) !important;
}

.item-detail-view__media {
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent-primary) 10%, white 90%), color-mix(in srgb, var(--bg-primary) 92%, white 8%)) !important;
}

.item-detail-view__image {
  filter: drop-shadow(0 10px 22px rgba(42, 61, 49, 0.12));
}

.item-detail-view__fallback {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.item-detail-view__summary,
.item-detail-view__stat {
  background-color: color-mix(in srgb, white 58%, var(--bg-primary)) !important;
}

.item-detail-view h1 {
  letter-spacing: -0.025em;
}

.item-detail-view .rounded-full {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.item-detail-view .rounded-2xl.border,
.item-detail-view .rounded-xl.border {
  border-color: color-mix(in srgb, var(--border-color) 82%, transparent) !important;
  box-shadow: 0 10px 20px rgba(42, 61, 49, 0.04);
}
</style>
