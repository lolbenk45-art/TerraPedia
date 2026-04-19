<template>
  <div class="home-page">
    <OfflineState
      v-if="isOfflineMode && hasCachedData"
      @retry="retryConnection"
      @viewCached="noop"
    />

    <ErrorState
      v-else-if="error"
      :error="error"
      title="首页暂时不可用"
      message="首页数据加载失败，请检查网络后重试。"
      @retry="loadData"
    />

    <div v-else class="home-page__content">
      <div v-if="isLoading" class="home-page__loading-mask" aria-live="polite">
        <div class="home-page__spinner" aria-hidden="true"></div>
        <p>正在加载探索路径...</p>
      </div>

      <section class="atlas-hero">
        <div class="page-wrap atlas-hero__wrap">
          <div class="atlas-hero__copy">
            <span class="section-eyebrow">冒险图鉴</span>
            <h1 class="section-title section-title--hero atlas-hero__title">
              进入泰拉瑞亚世界的物品图鉴入口
              <span>Open the front door to Terraria knowledge.</span>
            </h1>
            <p class="section-copy section-copy--wide atlas-hero__subtitle">
              搜索仍然是第一动作，分类仍然承担探索入口，但首页的气质现在更像一座冒险图鉴大厅，而不是普通工具页。
            </p>

            <div class="atlas-hero__actions">
              <RouterLink to="/items" class="button button--primary">
                开始探索物品
              </RouterLink>
              <button type="button" class="button button--secondary" @click="scrollToRoutes">
                查看探索路径
              </button>
            </div>

            <div class="atlas-search surface-panel">
              <div class="atlas-search__head">
                <span class="atlas-search__kicker">主搜索入口</span>
                <span class="atlas-search__meta">{{ totalItems.toLocaleString() }} indexed entries</span>
              </div>

              <ItemSearchInput
                v-model="quickSearch"
                placeholder="搜索物品、分类或目标条目"
                show-submit-button
                submit-text="搜索"
                variant="hero"
                @submit="goToSearch"
                @pick="handleQuickSuggestionPick"
              />

              <div class="atlas-search__tags">
                <button
                  v-for="tag in quickTags"
                  :key="tag.name"
                  type="button"
                  class="atlas-tag"
                  @click="applyQuickTag(tag.name)"
                >
                  <span class="atlas-tag__code">{{ tag.code }}</span>
                  <span>{{ tag.name }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="atlas-hero__stage">
            <div class="atlas-stage surface-panel atlas-panel">
              <div class="atlas-stage__sky" aria-hidden="true"></div>
              <div class="atlas-stage__glow" aria-hidden="true"></div>
              <div class="atlas-stage__grid" aria-hidden="true"></div>
              <div class="atlas-stage__artifacts" aria-hidden="true">
                <span class="atlas-artifact atlas-artifact--one"></span>
                <span class="atlas-artifact atlas-artifact--two"></span>
                <span class="atlas-artifact atlas-artifact--three"></span>
                <span class="atlas-artifact atlas-artifact--four"></span>
              </div>

              <div class="atlas-stage__header">
                <div>
                  <p class="atlas-stage__eyebrow">热门探索路径</p>
                  <h2 class="atlas-stage__title">直接进入玩家最常使用的探索入口。</h2>
                </div>
                <span class="atlas-stage__chip">Batch 1</span>
              </div>

              <div class="atlas-stage__routes">
                <article v-for="route in atlasRoutes" :key="route.title" class="atlas-route">
                  <span class="atlas-route__glyph">{{ route.glyph }}</span>
                  <div>
                    <h3>{{ route.title }}</h3>
                    <p>{{ route.copy }}</p>
                  </div>
                </article>
              </div>

              <div class="atlas-stage__story">
                <div class="atlas-stage__quest-grid">
                  <article
                    v-for="quest in questCards"
                    :key="quest.title"
                    class="atlas-quest-card surface-card atlas-panel"
                  >
                    <span class="atlas-quest-card__label">{{ quest.label }}</span>
                    <h3>{{ quest.title }}</h3>
                    <p>{{ quest.copy }}</p>
                  </article>
                </div>

                <div class="atlas-stage__relics surface-card atlas-panel">
                  <div class="atlas-stage__relics-head">
                    <div>
                      <p class="atlas-stage__eyebrow">收藏遗物陈列</p>
                      <h3>使用真实物品卡建立 Terraria 识别度。</h3>
                    </div>
                    <span class="atlas-stage__chip atlas-stage__chip--soft">Relics</span>
                  </div>

                  <div class="atlas-stage__items">
                    <button
                      v-for="item in featuredItems"
                      :key="item.id"
                      type="button"
                      class="atlas-item"
                      :title="item.name"
                      @click="openItemDetail(item)"
                    >
                      <span class="atlas-item__media">
                        <img v-if="item.image" :src="getImageUrl(item.image)" :alt="item.name" loading="lazy" />
                        <span v-else>{{ itemInitials(item.name) }}</span>
                      </span>
                      <span class="atlas-item__name line-clamp-2" :title="item.name">{{ item.name }}</span>
                      <span class="atlas-item__meta line-clamp-1" :title="item.category || 'Unsorted'">
                        {{ item.category || 'Unsorted' }}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="atlas-stage__path" aria-hidden="true"></div>
              <div class="atlas-stage__terrain" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="!isOnline && hasCachedData" class="atlas-banner">
        <div class="page-wrap atlas-banner__wrap">
          <span class="atlas-banner__dot" aria-hidden="true"></span>
          <span>Offline mode is active. Cached atlas routes and item samples are on screen.</span>
          
        </div>
      </section>

      <section class="atlas-stats">
        <div class="page-wrap">
          <div class="atlas-stats__grid">
            <article v-for="stat in stats" :key="stat.label" class="atlas-stat surface-card atlas-panel">
              <span class="atlas-stat__label">{{ stat.label }}</span>
              <strong>{{ stat.value }}</strong>
              <p>{{ stat.copy }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="atlas-features">
        <div class="page-wrap atlas-section">
          <div class="atlas-section__head">
            <span class="section-eyebrow">前台系统</span>
            <h2 class="section-title">不改数据契约，也能把首页外壳做得更强。</h2>
            <p class="section-copy">
              第一批实现保留现有获取链路，但会把首页的表层系统、信息层级和路径感全部统一起来。
            </p>
          </div>

          <div class="atlas-features__grid">
            <article
              v-for="feature in features"
              :key="feature.title"
              :class="[
                'atlas-feature',
                'surface-card',
                'atlas-panel',
                feature.variant === 'primary' ? 'atlas-feature--primary' : 'atlas-feature--secondary'
              ]"
            >
              <span class="atlas-feature__glyph">{{ feature.glyph }}</span>
              <div>
                <span v-if="feature.kicker" class="atlas-feature__kicker">{{ feature.kicker }}</span>
                <h3>{{ feature.title }}</h3>
                <p>{{ feature.description }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="atlas-routes" class="atlas-categories">
        <div class="page-wrap atlas-section">
          <div class="atlas-section__head atlas-section__head--split">
            <div>
              <span class="section-eyebrow">探索路径</span>
              <h2 class="section-title">从分类继续探索，而不是在噪音里继续下滑。</h2>
              <p class="section-copy">
                顶层分类仍然是探索骨架，但这些卡片现在更像路线标记，而不是普通的后台式分组。
              </p>
            </div>
            <RouterLink to="/items" class="button button--secondary">查看全部物品</RouterLink>
          </div>

          <div class="atlas-categories__grid">
            <RouterLink
              v-for="category in topCategories"
              :key="category.id"
              :to="`/items?category=${category.id}`"
              class="atlas-category surface-card atlas-panel"
            >
              <div class="atlas-category__top">
                <span class="atlas-category__glyph">{{ categoryGlyph(category.name) }}</span>
                <span class="atlas-category__count">{{ category.count }} entries</span>
              </div>
              <h3>{{ category.name }}</h3>
              <p>{{ categoryRouteCopy(category.count) }}</p>
              <div class="atlas-category__bar">
                <span :style="{ width: `${Math.min(100, (category.count / maxCategoryCount) * 100)}%` }"></span>
              </div>
            </RouterLink>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ErrorState from '@/components/ErrorState.vue'
import ItemSearchInput from '@/components/ItemSearchInput.vue'
import OfflineState from '@/components/OfflineState.vue'
import { fetchCategories, fetchItems, fetchStatsOverview } from '@/api'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import type { Category, Item, ItemSuggestion, StatsOverview } from '@/types'
import { flattenCategories } from '@/utils/categoryTree'

const router = useRouter()
const { isOnline } = useNetworkStatus()

const homepageItemSampleSize = 36
const emptyStats: StatsOverview = {
  totalItems: 0,
  totalCategories: 0,
  rootCategoryCounts: [],
  categoryItemCounts: {},
}

const items = ref<Item[]>([])
const categories = ref<Category[]>([])
const statsOverview = ref<StatsOverview>(emptyStats)
const cachedItems = ref<Item[]>([])
const cachedCategories = ref<Category[]>([])
const isLoading = ref(true)
const isOfflineMode = ref(false)
const hasCachedData = ref(false)
const error = ref('')
const quickSearch = ref('')

const quickTags = [
  { name: 'Weapons', code: 'BLD' },
  { name: 'Tools', code: 'KIT' },
  { name: 'Armor', code: 'ARM' },
  { name: 'Potions', code: 'ALC' },
  { name: 'Materials', code: 'MAT' },
  { name: 'Furniture', code: 'HAB' },
]

const atlasRoutes = [
  { glyph: 'SR', title: '搜索路径', copy: '从名称、目标物品或关键词直接进入。' },
  { glyph: 'CT', title: '分类路径', copy: '用顶层分类把世界缩到更容易探索的范围。' },
  { glyph: 'ST', title: '统计信号', copy: '通过条目数量判断哪些入口更值得先进入。' },
]

const questCards = [
  {
    label: '今日探索入口',
    title: '先从搜索出发，而不是先读说明。',
    copy: '把搜索做成首屏主动作，第一眼就知道可以立刻进入图鉴。',
  },
  {
    label: '热门路线',
    title: '武器 / 工具 / 饰品 / 材料',
    copy: '用最常见的探索方向承接首屏动作。',
  },
  {
    label: '世界层次',
    title: '天空辉光、网格和地貌一起建立入口感。',
    copy: '这些层次负责把数据库升级成世界入口。',
  },
  {
    label: '任务节奏',
    title: '先启程，再分流，再确认深度。',
    copy: '标题、搜索、路线卡和遗物陈列按顺序工作。',
  },
]

const features = [
  {
    glyph: '01',
    kicker: 'Hero System',
    title: '统一外壳',
    description: '导航、首页与页脚现在共用同一套 Moss Lantern 视觉令牌，整页像一个产品而不是拼接出来的页面。',
    variant: 'primary',
  },
  {
    glyph: '02',
    kicker: 'Primary Action',
    title: '主搜索入口',
    description: '搜索仍是第一动作，但现在被放进图鉴入口框架里，承担“开始探索”的任务而不是普通表单。',
    variant: 'secondary',
  },
  {
    glyph: '03',
    kicker: 'Visual Language',
    title: '去掉表情化 UI',
    description: '路径提示依赖克制的字形标记、面板节奏与对比，而不是新奇图标和平均化功能卡。',
    variant: 'secondary',
  },
]

const totalItems = computed(() => statsOverview.value.totalItems || items.value.length)

const rootCategories = computed(() =>
  categories.value.filter(category => category.parentId === null || category.parentId === 0)
)

const featuredItems = computed(() => items.value.slice(0, 6))

const statsCategoryCountMap = computed(() => {
  const map = new Map<number, number>()
  for (const [categoryId, count] of Object.entries(statsOverview.value.categoryItemCounts || {})) {
    map.set(Number(categoryId), count)
  }
  for (const entry of statsOverview.value.rootCategoryCounts || []) {
    if (entry.categoryId != null) {
      map.set(entry.categoryId, entry.count)
    }
  }
  return map
})

const topCategories = computed(() =>
  rootCategories.value
    .map(category => ({
      ...category,
      count: statsCategoryCountMap.value.get(category.id) ?? 0,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8)
)

const maxCategoryCount = computed(() => Math.max(...topCategories.value.map(category => category.count), 1))

const stats = computed(() => [
  {
    label: 'Indexed Items',
    value: totalItems.value.toLocaleString(),
    copy: '首页搜索可以直接进入当前物品索引。',
  },
  {
    label: 'Root Categories',
    value: String(statsOverview.value.totalCategories || rootCategories.value.length),
    copy: '顶层分类仍然是结构化浏览的骨架。',
  },
  {
    label: 'Atlas Routes',
    value: String(topCategories.value.length),
    copy: '首页只保留信号最强的分类入口。',
  },
  {
    label: 'Theme Pairing',
    value: document.documentElement.classList.contains('dark') ? 'Dark' : 'Light',
    copy: 'Moss Lantern 在明暗主题里共用同一套产品语气。',
  },
])

const noop = () => {}

const itemInitials = (name: string) => name.trim().slice(0, 2).toUpperCase()

const getImageUrl = (image?: string | null) => {
  if (!image) return ''
  if (image.startsWith('http')) return image
  if (image.startsWith('localhost:')) return `http://${image}`
  return image.startsWith('/') ? image : `/${image}`
}

const categoryGlyph = (name: string) => {
  const normalized = name.toLowerCase()
  if (normalized.includes('weapon') || normalized.includes('sword') || normalized.includes('bow')) return 'WP'
  if (normalized.includes('tool') || normalized.includes('pickaxe')) return 'TL'
  if (normalized.includes('armor') || normalized.includes('helmet')) return 'AR'
  if (normalized.includes('potion') || normalized.includes('consumable')) return 'AL'
  if (normalized.includes('material')) return 'MT'
  if (normalized.includes('furniture') || normalized.includes('wall')) return 'HB'
  if (normalized.includes('block')) return 'BL'
  return 'AT'
}

const categoryRouteCopy = (count: number) => {
  if (count >= 500) return '高密度入口，适合作为第一站开始探索。'
  if (count >= 100) return '适合继续缩小范围，查找构筑或配方目标。'
  return '较轻量的入口，更适合定向查找和补充细节。'
}

const applyQuickTag = (tag: string) => {
  quickSearch.value = tag
  goToSearch()
}

const scrollToRoutes = () => {
  document.getElementById('atlas-routes')?.scrollIntoView({ behavior: 'smooth' })
}

const goToSearch = () => {
  const keyword = quickSearch.value.trim()
  if (!keyword) return

  void router.push({
    path: '/items',
    query: { search: keyword },
  })
}

const handleQuickSuggestionPick = (suggestion: ItemSuggestion) => {
  void router.push({ path: `/items/${suggestion.id}` })
}

const openItemDetail = (item: Item) => {
  if (!item.id) return
  void router.push({ path: `/items/${item.id}` })
}

const loadData = async () => {
  isLoading.value = true

  try {
    error.value = ''
    isOfflineMode.value = false

    const [itemsRes, categoriesRes, statsRes] = await Promise.all([
      fetchItems(1, homepageItemSampleSize, undefined, undefined, undefined, 'id', 'desc'),
      fetchCategories(),
      fetchStatsOverview(),
    ])

    if (!itemsRes.success) {
      throw new Error(itemsRes.message || 'Failed to load homepage items.')
    }

    items.value = itemsRes.data || []
    categories.value = flattenCategories(categoriesRes.data || [])
    statsOverview.value = statsRes.success ? statsRes.data : emptyStats

    cachedItems.value = [...items.value]
    cachedCategories.value = [...categories.value]
    hasCachedData.value = true
  } catch (err) {
    if (hasCachedData.value && cachedItems.value.length > 0) {
      items.value = [...cachedItems.value]
      categories.value = [...cachedCategories.value]
      statsOverview.value = emptyStats
      isOfflineMode.value = true
      error.value = ''
    } else {
      error.value = err instanceof Error ? err.message : 'Homepage load failed.'
    }
  } finally {
    isLoading.value = false
  }
}

const retryConnection = async () => {
  await loadData()
}

onMounted(() => {
  void loadData()
})
</script>

<style scoped>
.home-page {
  position: relative;
  min-height: calc(100vh - 8rem);
  padding: 0 0 2.5rem;
}

.home-page::before {
  content: '';
  position: absolute;
  inset: -6.2rem 0 -2.5rem;
  background:
    radial-gradient(ellipse at 50% -4%, rgb(222 190 111 / 0.16), transparent 18%),
    radial-gradient(ellipse at 18% 14%, rgb(124 170 102 / 0.24), transparent 28%),
    radial-gradient(ellipse at 84% 12%, rgb(114 154 144 / 0.18), transparent 24%),
    radial-gradient(ellipse at 52% 34%, rgb(27 41 31 / 0.72), transparent 44%),
    radial-gradient(ellipse at 50% 106%, rgb(75 106 79 / 0.26), transparent 30%),
    linear-gradient(90deg, rgb(0 0 0 / 0.22), transparent 10%, transparent 90%, rgb(0 0 0 / 0.18)),
    linear-gradient(180deg, #263128 0%, #161e19 14%, #0d130f 42%, #050705 100%);
  pointer-events: none;
  z-index: 0;
}

.home-page::after {
  content: '';
  position: absolute;
  inset: -2rem 10% auto;
  height: 14rem;
  border-radius: 999px;
  background:
    radial-gradient(circle, rgb(154 194 107 / 0.16), transparent 56%);
  filter: blur(54px);
  opacity: 0.68;
  pointer-events: none;
  z-index: 0;
}

.home-page__loading-mask {
  position: absolute;
  inset: 0 auto auto 0;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  margin: 1.2rem;
  padding: 0.8rem 1rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 46%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(10px);
}

.home-page__spinner {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  border-top-color: var(--accent-primary);
  animation: atlas-spin 0.9s linear infinite;
}

.home-page__content {
  position: relative;
  width: min(var(--max-width), calc(100vw - 2rem));
  margin: -0.2rem auto 2rem;
  padding: 0 0 2rem;
  z-index: 1;
  border: 1px solid rgb(240 233 208 / 0.035);
  border-top: none;
  border-radius: 0 0 2rem 2rem;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 14% 12%, rgb(146 190 104 / 0.12), transparent 28%),
    radial-gradient(ellipse at 78% 10%, rgb(224 192 117 / 0.13), transparent 22%),
    radial-gradient(ellipse at 46% 36%, rgb(34 50 38 / 0.58), transparent 46%),
    radial-gradient(ellipse at 52% 104%, rgb(82 111 84 / 0.22), transparent 28%),
    linear-gradient(180deg, rgb(22 30 24 / 0.7) 0%, rgb(14 20 16 / 0.84) 18%, rgb(10 14 11 / 0.95) 52%, rgb(5 7 6 / 0.99) 100%);
  box-shadow:
    0 28px 76px rgb(0 0 0 / 0.18),
    0 0 0 1px rgb(255 255 255 / 0.015),
    inset 0 1px 0 rgb(255 255 255 / 0.03);
}

.home-page__content::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 18% 10%, rgb(146 190 104 / 0.08), transparent 30%),
    radial-gradient(ellipse at 78% 16%, rgb(216 185 113 / 0.07), transparent 24%),
    radial-gradient(ellipse at 50% 44%, rgb(0 0 0 / 0.18), transparent 54%),
    linear-gradient(
      90deg,
      rgb(147 193 106 / 0.035) 0%,
      transparent 18%,
      rgb(218 186 115 / 0.024) 40%,
      transparent 58%,
      rgb(120 168 159 / 0.03) 82%,
      transparent 100%
    ),
    linear-gradient(rgb(255 255 255 / 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.018) 1px, transparent 1px);
  background-size: auto, auto, auto, auto, 30px 30px, 30px 30px;
  mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.88), rgb(0 0 0 / 0.64) 48%, transparent 100%);
  opacity: 0.88;
  pointer-events: none;
}

.home-page__content::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(ellipse at top center, rgb(255 255 255 / 0.02), transparent 48%);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.018),
    inset 0 22px 54px rgb(255 255 255 / 0.015),
    inset 0 -72px 140px rgb(0 0 0 / 0.22),
    inset 0 160px 180px rgb(0 0 0 / 0.08);
  pointer-events: none;
}

.home-page__content :deep(.page-wrap) {
  width: calc(100% - 3rem);
}

.home-page__content :deep(.surface-panel),
.home-page__content :deep(.surface-card) {
  border-color: rgb(240 233 208 / 0.08);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.024)),
    radial-gradient(circle at top right, rgb(147 193 106 / 0.06), transparent 28%);
  box-shadow:
    0 18px 42px rgb(0 0 0 / 0.1),
    inset 0 1px 0 rgb(255 255 255 / 0.045);
  backdrop-filter: blur(12px);
}

.home-page__content .section-title,
.home-page__content .atlas-stage__title,
.home-page__content .atlas-route h3,
.home-page__content .atlas-feature h3,
.home-page__content .atlas-category h3,
.home-page__content .atlas-stat strong,
.home-page__content .atlas-item__name,
.home-page__content .atlas-quest-card h3,
.home-page__content .atlas-stage__relics h3 {
  color: #f4f0df;
}

.home-page__content .section-copy,
.home-page__content .atlas-hero__subtitle,
.home-page__content .atlas-route p,
.home-page__content .atlas-feature p,
.home-page__content .atlas-category p,
.home-page__content .atlas-stat p,
.home-page__content .atlas-quest-card p,
.home-page__content .atlas-item__meta,
.home-page__content .atlas-search__meta,
.home-page__content .atlas-category__count,
.home-page__content .atlas-stat__label {
  color: #b3beac;
}

.home-page__content .section-eyebrow,
.home-page__content .atlas-search__kicker,
.home-page__content .atlas-stage__eyebrow,
.home-page__content .atlas-quest-card__label,
.home-page__content .atlas-feature__kicker {
  color: #93c16a;
}

.home-page__content .button--secondary {
  border-color: rgb(240 233 208 / 0.12);
  background: rgb(255 255 255 / 0.04);
  color: #f4f0df;
}

.home-page__content .button--secondary:hover {
  background: rgb(255 255 255 / 0.08);
}

.home-page__content .atlas-stage {
  border-color: rgb(240 233 208 / 0.09);
  background:
    radial-gradient(circle at 68% 14%, rgb(222 188 107 / 0.16), transparent 16%),
    radial-gradient(circle at 22% 14%, rgb(121 168 112 / 0.14), transparent 22%),
    radial-gradient(circle at 52% 68%, rgb(10 16 12 / 0.2), transparent 40%),
    linear-gradient(180deg, rgb(37 48 39 / 0.68), rgb(18 26 21 / 0.88) 46%, rgb(10 15 12 / 0.94) 100%);
  box-shadow:
    0 24px 58px rgb(0 0 0 / 0.16),
    inset 0 1px 0 rgb(255 255 255 / 0.07),
    inset 0 -40px 90px rgb(0 0 0 / 0.2);
}

.home-page__content .atlas-stage__sky {
  background:
    radial-gradient(circle at 22% 16%, rgb(214 180 107 / 0.24), transparent 22%),
    radial-gradient(circle at 76% 18%, rgb(111 161 145 / 0.18), transparent 26%),
    linear-gradient(180deg, rgb(255 255 255 / 0.05), transparent 100%);
  opacity: 0.82;
}

.home-page__content .atlas-stage__glow {
  background:
    radial-gradient(circle at 62% 16%, rgb(225 192 117 / 0.32), transparent 14%),
    radial-gradient(circle at 64% 17%, rgb(255 244 208 / 0.34), transparent 6%),
    radial-gradient(circle at 34% 54%, rgb(147 193 106 / 0.1), transparent 22%);
  opacity: 0.78;
}

.home-page__content .atlas-stage__grid {
  opacity: 0.34;
}

.home-page__content .atlas-search {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.03));
}

.home-page__content .atlas-tag,
.home-page__content .atlas-item,
.home-page__content .atlas-route,
.home-page__content .atlas-feature--secondary {
  background: rgb(255 255 255 / 0.04);
}

.home-page__content .atlas-feature--primary,
.home-page__content .atlas-quest-card,
.home-page__content .atlas-stage__relics {
  background:
    radial-gradient(circle at top right, rgb(147 193 106 / 0.08), transparent 22%),
    rgb(255 255 255 / 0.05);
}

.home-page__content .atlas-route__glyph,
.home-page__content .atlas-feature__glyph,
.home-page__content .atlas-category__glyph,
.home-page__content .atlas-tag__code {
  background: rgb(147 193 106 / 0.12);
  color: #d6e8c8;
}

.home-page__content .atlas-stage__chip,
.home-page__content .atlas-stage__chip--soft {
  background: rgb(255 255 255 / 0.04);
}

.home-page__content .atlas-stage__path {
  background:
    radial-gradient(circle at 30% 50%, rgb(255 244 210 / 0.66), transparent 12%),
    linear-gradient(90deg, #c9aa67, #8ba45f);
  opacity: 0.32;
}

.home-page__content .atlas-stage__terrain {
  background:
    linear-gradient(180deg, transparent 0%, rgb(9 15 11 / 0.36) 28%, rgb(6 10 8 / 0.95) 100%),
    linear-gradient(90deg, #1d2d21 0%, #141d16 100%);
  opacity: 0.95;
}

.home-page__content .atlas-stats {
  padding-top: 0.2rem;
}

.home-page__content .atlas-banner__wrap {
  color: #b3beac;
}

.atlas-hero {
  position: relative;
  padding: 2.05rem 0 1rem;
}

.atlas-hero::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: min(46rem, 84%);
  background:
    radial-gradient(circle at 14% 20%, rgb(147 193 106 / 0.16), transparent 26%),
    radial-gradient(circle at 78% 8%, rgb(218 186 115 / 0.12), transparent 18%),
    radial-gradient(circle at 42% 44%, rgb(16 23 18 / 0.42), transparent 42%),
    linear-gradient(180deg, rgb(255 255 255 / 0.025), transparent 100%);
  opacity: 0.95;
  pointer-events: none;
}

.atlas-hero__wrap {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 1.25rem;
  align-items: stretch;
}

.atlas-hero__title span {
  display: block;
  max-width: 8ch;
  margin-top: 0.72rem;
  font-size: clamp(1.45rem, 3.35vw, 2.55rem);
  line-height: 1.04;
  font-weight: 700;
  color: color-mix(in srgb, var(--accent-primary) 84%, #d8e7bb);
}

.atlas-hero__title {
  max-width: 10.8ch;
  font-size: clamp(1.95rem, 4.35vw, 3.2rem);
  line-height: 1.02;
  letter-spacing: -0.045em;
  text-wrap: balance;
}

.atlas-hero__subtitle {
  max-width: 56ch;
  margin-top: 0.9rem;
  font-size: 0.96rem;
}

.atlas-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.4rem;
}

.atlas-search,
.atlas-stage {
  padding: 1.1rem;
}

.atlas-search {
  margin-top: 1.5rem;
}

.atlas-stage {
  position: relative;
  min-height: 100%;
  overflow: hidden;
  isolation: isolate;
  padding: 1.1rem;
  background:
    radial-gradient(circle at 22% 16%, color-mix(in srgb, var(--accent-gold) 16%, transparent), transparent 26%),
    radial-gradient(circle at 78% 22%, color-mix(in srgb, var(--accent-support) 14%, transparent), transparent 30%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 92%, white 8%), color-mix(in srgb, var(--surface-soft) 96%, var(--bg-secondary)));
  box-shadow:
    0 22px 52px color-mix(in srgb, black 26%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.44);
}

.atlas-search__head,
.atlas-stage__header,
.atlas-section__head--split {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.atlas-search__kicker,
.atlas-stage__eyebrow,
.atlas-stage__chip,
.atlas-search__meta,
.atlas-stat__label,
.atlas-category__count {
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.atlas-search__kicker,
.atlas-stage__eyebrow {
  color: var(--accent-primary);
  font-weight: 700;
}

.atlas-search__meta,
.atlas-category__count,
.atlas-stat__label {
  color: var(--text-muted);
}

.atlas-search__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1rem;
}

.atlas-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.6rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--text-primary);
}

.atlas-tag__code,
.atlas-route__glyph,
.atlas-feature__glyph,
.atlas-category__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--accent-primary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.atlas-stage__title {
  margin-top: 0.3rem;
  color: var(--text-primary);
  font-size: 1.4rem;
  line-height: 1.2;
}

.atlas-stage__sky,
.atlas-stage__glow,
.atlas-stage__grid,
.atlas-stage__path,
.atlas-stage__terrain,
.atlas-stage__artifacts {
  position: absolute;
  pointer-events: none;
}

.atlas-stage__sky {
  inset: 0 0 auto;
  height: 74%;
  background:
    radial-gradient(circle at 24% 18%, color-mix(in srgb, var(--accent-gold) 24%, transparent), transparent 26%),
    radial-gradient(circle at 74% 18%, color-mix(in srgb, var(--accent-support) 24%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 42%, transparent), transparent 100%);
  opacity: 0.98;
}

.atlas-stage__glow {
  inset: 0;
  background:
    radial-gradient(circle at 63% 18%, color-mix(in srgb, var(--accent-gold) 30%, transparent), transparent 14%),
    radial-gradient(circle at 66% 19%, rgb(255 246 206 / 0.35), transparent 7%),
    radial-gradient(circle at 36% 58%, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 24%);
  mix-blend-mode: screen;
  opacity: 0.95;
}

.atlas-stage__grid {
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--text-primary) 4%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--text-primary) 4%, transparent) 1px, transparent 1px);
  background-size: 26px 26px;
  mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.5), transparent 82%);
  opacity: 0.52;
}

.atlas-stage__artifacts {
  inset: 0;
}

.atlas-artifact {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  border-radius: 1.2rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 12%, var(--surface-soft)), color-mix(in srgb, var(--surface-soft) 88%, transparent));
  box-shadow:
    0 22px 44px color-mix(in srgb, var(--bg-primary) 18%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.36);
  backdrop-filter: blur(12px);
  animation: atlas-float 7s ease-in-out infinite;
}

.atlas-artifact::before {
  content: '';
  position: absolute;
  inset: 0.55rem;
  border-radius: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 28%, transparent);
  background:
    radial-gradient(circle at 30% 24%, color-mix(in srgb, var(--accent-gold) 36%, transparent), transparent 42%),
    linear-gradient(145deg, color-mix(in srgb, var(--accent-primary) 10%, transparent), transparent 70%);
  opacity: 0.92;
}

.atlas-artifact--one {
  top: 1.6rem;
  right: 1.4rem;
  width: 4.6rem;
  height: 4.6rem;
  transform: rotate(-12deg);
}

.atlas-artifact--two {
  top: 5.6rem;
  right: 8rem;
  width: 6.4rem;
  height: 6.4rem;
  transform: rotate(10deg);
  animation-delay: 0.7s;
}

.atlas-artifact--three {
  bottom: 5.8rem;
  right: 2.4rem;
  width: 3.9rem;
  height: 3.9rem;
  transform: rotate(8deg);
  animation-delay: 1.4s;
}

.atlas-artifact--four {
  bottom: 7rem;
  left: 1rem;
  width: 5rem;
  height: 5rem;
  transform: rotate(-11deg);
  animation-delay: 2.1s;
}

.atlas-stage__header,
.atlas-stage__routes,
.atlas-stage__story,
.atlas-stage__items {
  position: relative;
  z-index: 1;
}

.atlas-stage__header {
  padding-right: 4.5rem;
}

.atlas-stage__chip {
  padding: 0.4rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 34%, var(--border-color));
  border-radius: 999px;
  color: var(--accent-gold);
  background: color-mix(in srgb, white 28%, transparent);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3);
}

.atlas-stage__routes,
.atlas-features__grid,
.atlas-stats__grid,
.atlas-categories__grid {
  display: grid;
  gap: 1rem;
}

.atlas-stage__routes {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 0.95rem;
  gap: 0.8rem;
}

.atlas-route {
  min-height: 7rem;
  padding: 0.8rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: 1.1rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 36%, var(--surface-panel)), color-mix(in srgb, var(--surface-soft) 94%, transparent));
  box-shadow:
    0 14px 34px color-mix(in srgb, var(--bg-primary) 8%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.34);
}

.atlas-stage__story {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.92fr);
  gap: 0.8rem;
  margin-top: 0.85rem;
  align-items: stretch;
}

.atlas-stage__quest-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  align-content: start;
}

.atlas-quest-card,
.atlas-stage__relics {
  padding: 1rem;
}

.atlas-quest-card {
  min-height: 7.4rem;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent-gold) 14%, transparent), transparent 30%),
    linear-gradient(180deg, color-mix(in srgb, white 48%, var(--surface-soft)), color-mix(in srgb, var(--surface-soft) 94%, transparent));
  box-shadow:
    0 16px 30px color-mix(in srgb, var(--bg-primary) 8%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.34);
}

.atlas-quest-card:nth-child(1) {
  grid-column: 1 / -1;
  min-height: 6.8rem;
}

.atlas-quest-card__label,
.atlas-feature__kicker {
  display: inline-flex;
  margin-bottom: 0.55rem;
  color: var(--accent-primary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.atlas-quest-card h3,
.atlas-stage__relics h3 {
  color: var(--text-primary);
  font-size: 0.96rem;
  line-height: 1.3;
}

.atlas-quest-card p {
  margin-top: 0.38rem;
  color: var(--text-secondary);
  font-size: 0.84rem;
  line-height: 1.52;
}

.atlas-stage__relics {
  position: relative;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent-support) 18%, transparent), transparent 34%),
    radial-gradient(circle at 18% 20%, color-mix(in srgb, var(--accent-gold) 14%, transparent), transparent 24%),
    linear-gradient(180deg, color-mix(in srgb, white 46%, var(--surface-soft)), color-mix(in srgb, var(--surface-soft) 96%, transparent));
  box-shadow:
    0 18px 38px color-mix(in srgb, var(--bg-primary) 10%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.36);
}

.atlas-stage__relics-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.7rem;
}

.atlas-stage__relics-head > div {
  min-width: 0;
}

.atlas-stage__relics-head h3 {
  margin-top: 0.32rem;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.atlas-stage__chip--soft {
  border-color: color-mix(in srgb, var(--accent-support) 34%, var(--border-color));
  color: var(--accent-support);
}

.atlas-route,
.atlas-feature {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  align-items: start;
}

.atlas-route h3,
.atlas-feature h3,
.atlas-category h3 {
  color: var(--text-primary);
  font-size: 0.96rem;
}

.atlas-route p,
.atlas-feature p,
.atlas-category p,
.atlas-stat p {
  margin-top: 0.35rem;
  color: var(--text-secondary);
  line-height: 1.55;
  font-size: 0.84rem;
}

.atlas-stage__items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 0.65rem;
}

.atlas-stage__path {
  left: 48%;
  right: 9%;
  bottom: 5.9rem;
  height: 6.8rem;
  border-radius: 999px;
  background:
    radial-gradient(circle at 30% 50%, rgb(255 244 210 / 0.88), transparent 12%),
    linear-gradient(90deg, color-mix(in srgb, var(--accent-gold) 76%, white 24%), color-mix(in srgb, var(--accent-primary) 54%, var(--accent-gold)));
  filter: blur(1px);
  opacity: 0.78;
  transform: perspective(260px) rotateX(68deg);
  transform-origin: center bottom;
  box-shadow:
    0 0 24px color-mix(in srgb, var(--accent-gold) 28%, transparent),
    0 16px 36px color-mix(in srgb, var(--accent-gold) 18%, transparent);
}

.atlas-stage__terrain {
  inset: auto 0 0;
  height: 8.4rem;
  background:
    linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--bg-primary) 24%, transparent) 20%, color-mix(in srgb, var(--bg-tertiary) 96%, var(--bg-secondary)) 100%),
    linear-gradient(90deg, color-mix(in srgb, var(--bg-tertiary) 92%, var(--accent-primary)), color-mix(in srgb, var(--bg-secondary) 94%, var(--accent-support)));
  clip-path: polygon(0 58%, 10% 44%, 20% 50%, 32% 34%, 44% 48%, 58% 24%, 70% 40%, 82% 18%, 100% 34%, 100% 100%, 0 100%);
  opacity: 0.9;
}

.atlas-item {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0.4rem;
  min-width: 0;
  height: 100%;
  padding: 0.65rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 28%, var(--surface-panel)), color-mix(in srgb, var(--bg-secondary) 88%, transparent));
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.atlas-item:hover,
.atlas-item:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent-primary) 28%, var(--border-color));
  box-shadow: var(--shadow-sm);
}

.atlas-item__media {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--accent-support) 14%, transparent);
  color: var(--accent-support);
  font-weight: 700;
}

.atlas-item__media img {
  width: 2rem;
  height: 2rem;
  object-fit: contain;
}

.atlas-item__name {
  min-width: 0;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 0.82rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.atlas-item__meta {
  min-width: 0;
  color: var(--text-muted);
  font-size: 0.74rem;
  overflow-wrap: anywhere;
}

.atlas-category {
  position: relative;
  overflow: hidden;
  text-decoration: none;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.atlas-category::after {
  content: '';
  position: absolute;
  top: -1.5rem;
  right: -1rem;
  width: 7rem;
  height: 7rem;
  border-radius: 2rem;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 16%, transparent), transparent 68%);
  pointer-events: none;
}

.atlas-category:hover,
.atlas-category:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent-primary) 24%, var(--border-color));
  box-shadow: var(--shadow-sm);
}

.atlas-banner {
  padding: 0.4rem 0 0.8rem;
}

.atlas-banner__wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text-secondary);
}

.atlas-banner__dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  background: var(--accent-primary);
  box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--accent-primary) 14%, transparent);
}

.atlas-stats,
.atlas-features,
.atlas-categories {
  padding: 0.6rem 0 0;
}

.atlas-stats__grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.atlas-stat,
.atlas-category {
  padding: 1.15rem;
}

.atlas-features__grid {
  grid-template-columns: minmax(0, 1.15fr) repeat(2, minmax(0, 0.85fr));
  align-items: stretch;
}

.atlas-feature {
  padding: 1.2rem;
  min-height: 11rem;
}

.atlas-feature--primary {
  min-height: 14rem;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent-gold) 14%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, white 42%, var(--surface-soft)), color-mix(in srgb, var(--surface-soft) 96%, transparent));
}

.atlas-feature--secondary {
  background:
    linear-gradient(180deg, color-mix(in srgb, white 28%, var(--surface-soft)), color-mix(in srgb, var(--surface-soft) 94%, transparent));
}

.atlas-stat strong {
  display: block;
  margin-top: 0.5rem;
  color: var(--text-primary);
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  line-height: 1.05;
}

.atlas-section {
  display: grid;
  gap: 1.4rem;
}

.atlas-categories__grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.atlas-category__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.atlas-category__bar {
  margin-top: 1rem;
  height: 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  overflow: hidden;
}

.atlas-category__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-support));
}

@keyframes atlas-float {
  0%,
  100% {
    transform: translateY(0) rotate(var(--atlas-rotation, 0deg));
  }

  50% {
    transform: translateY(-8px) rotate(var(--atlas-rotation, 0deg));
  }
}

@keyframes atlas-spin {
  to {
    transform: rotate(360deg);
  }
}

.atlas-artifact--one { --atlas-rotation: -12deg; }
.atlas-artifact--two { --atlas-rotation: 10deg; }
.atlas-artifact--three { --atlas-rotation: 8deg; }
.atlas-artifact--four { --atlas-rotation: -11deg; }

@media (max-width: 1100px) {
  .atlas-hero__wrap,
  .atlas-stats__grid,
  .atlas-categories__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .atlas-stage__story,
  .atlas-features__grid,
  .atlas-stage__routes,
  .atlas-stage__items {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .atlas-stage__relics {
    grid-column: 1 / -1;
  }

  .atlas-artifact--two {
    right: 6rem;
  }
}

@media (max-width: 720px) {
  .home-page__content {
    width: calc(100vw - 1rem);
    margin-top: -0.15rem;
    border-radius: 0 0 1.5rem 1.5rem;
  }

  .home-page__content :deep(.page-wrap) {
    width: calc(100% - 1.5rem);
  }

  .atlas-hero__wrap,
  .atlas-stats__grid,
  .atlas-features__grid,
  .atlas-categories__grid,
  .atlas-stage__story,
  .atlas-stage__quest-grid,
  .atlas-stage__routes,
  .atlas-stage__items {
    grid-template-columns: 1fr;
  }

  .atlas-search__head,
  .atlas-stage__header,
  .atlas-stage__relics-head,
  .atlas-section__head--split {
    flex-direction: column;
  }

  .atlas-stage {
    padding-bottom: 7rem;
  }

  .atlas-stage__header {
    padding-right: 0;
  }

  .atlas-stage__path {
    left: 12%;
    right: 12%;
    bottom: 5.6rem;
  }

  .atlas-stage__artifacts {
    opacity: 0.72;
  }

  .atlas-hero__title {
    max-width: 9.4ch;
    font-size: clamp(1.7rem, 8.6vw, 2.4rem);
    line-height: 1.04;
  }

  .atlas-hero__title span {
    max-width: 7.2ch;
    margin-top: 0.55rem;
    font-size: clamp(1.22rem, 7vw, 1.82rem);
    line-height: 1.08;
  }

  .atlas-hero__subtitle {
    max-width: 34ch;
    font-size: 0.92rem;
    line-height: 1.68;
  }

  .atlas-artifact--one {
    top: 1rem;
    right: 1rem;
  }

  .atlas-artifact--two {
    top: 5rem;
    right: 1rem;
    width: 4.7rem;
    height: 4.7rem;
  }

  .atlas-artifact--three {
    bottom: 5rem;
    right: 1rem;
  }

  .atlas-artifact--four {
    display: none;
  }
}
</style>
