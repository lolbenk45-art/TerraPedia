<script setup lang="ts">
const failedItemImages = ref(new Set<string>())
const searchQuery = ref('')
const activeFilter = ref('全部')
const selectedDensity = ref(120)
const focusedItemId = ref<string | null>(null)

type ApiItem = {
  id?: number | string | null
  name?: string | null
  nameZh?: string | null
  nameEn?: string | null
  internalName?: string | null
  image?: string | null
  imageUrl?: string | null
  category?: string | null
  categoryName?: string | null
  categoryPaths?: string[] | null
  rarity?: string | null
  rare?: string | null
  gamePeriod?: string | null
  gamePeriodId?: number | string | null
  damage?: number | string | null
  defense?: number | string | null
  knockback?: number | string | null
  useTime?: number | string | null
  stackSize?: number | string | null
  description?: string | null
  descriptionZh?: string | null
  tooltip?: string | null
  tooltipZh?: string | null
}

type ApiItemsResponse = {
  success?: boolean
  data?: ApiItem[]
  pagination?: {
    total?: number
    page?: number
    limit?: number
    size?: number
    totalPages?: number
  }
}

type SampleItem = {
  name: string
  image: string
  category: string
  phase: string
  fallback: string
  damage?: number
}

type CatalogItem = {
  id: string
  itemId: number | null
  detailPath: string
  name: string
  displayName: string
  englishName: string
  internalName: string
  image: string
  category: string
  categoryPath: string
  categoryGroup: string
  phase: string
  rarity: string
  fallback: string
  range: string
  damage: number | null
  defense: number | null
  knockback: number | null
  useTime: number | null
  stackSize: number | null
  description: string
  searchText: string
}

const imageBase = 'http://localhost:9000/terrapedia-images/items/2026/04/08'

const primarySampleItems = [
  { name: '泰拉刃', image: 'a192da2a6a2d415ca9c5a09782113e3d.png', category: '武器', phase: '月前', fallback: '泰', damage: 85 },
  { name: '真永夜刃', image: 'cd8d30c0359b4fbda34ffcfba4745145.png', category: '武器', phase: '困难', fallback: '夜', damage: 70 },
  { name: '真断钢剑', image: '5495725121204ede9da25ddf678ca246.png', category: '武器', phase: '困难', fallback: '钢', damage: 66 },
  { name: '神圣镐', image: '195bfda5955641b5bf340322fdd26eba.png', category: '工具', phase: '困难', fallback: '镐', damage: 35 },
  { name: '铁皮药水', image: '6ef1b719169348b595c93654cbf60c1c.png', category: '药水', phase: '开荒', fallback: '药' },
  { name: '神圣锭', image: 'c626dfb6e7bc4139b099b81ffc4680d1.png', category: '材料', phase: '困难', fallback: '锭' },
  { name: '永夜刃', image: 'b3ddc7b2db8b4c53a00b0274ed9edfaa.png', category: '武器', phase: 'Boss 前', fallback: '刃', damage: 42 },
  { name: '村正', image: 'c049cc2442144242a8b7768517723664.png', category: '武器', phase: '地牢', fallback: '村', damage: 26 },
  { name: '铜短剑', image: '3a43bd1521b5418fade0c386891cc047.png', category: '武器', phase: '开荒', fallback: '铜', damage: 5 },
  { name: '铜镐', image: '195bfda5955641b5bf340322fdd26eba.png', category: '工具', phase: '开荒', fallback: '镐', damage: 4 },
  { name: '铁矿', image: '32a6970ec3f746ad9e23b6312c4dea1c.png', category: '材料', phase: '开荒', fallback: '矿' },
  { name: '治疗药水', image: '6ef1b719169348b595c93654cbf60c1c.png', category: '药水', phase: '开荒', fallback: '疗' },
  { name: '星星炮', image: '572d02498c01441e86ce0e55aa946f5b.png', category: '武器', phase: 'Boss 前', fallback: '星', damage: 55 },
  { name: '陨石锭', image: '6b53bc835cd742dba96053653aac8f4f.png', category: '材料', phase: 'Boss 前', fallback: '陨' },
  { name: '钴镐', image: '84a7346cf0044805ab5b443b96ca15e0.png', category: '工具', phase: '困难', fallback: '钴', damage: 10 },
  { name: '星怒', image: '1c9f832ea4a6424c8bdae1bc843ec02f.png', category: '武器', phase: '空岛', fallback: '怒', damage: 22 },
  { name: '暴雪瓶', image: '034a248ac37a42049c5ef882098a4eb8.png', category: '配饰', phase: '开荒', fallback: '瓶' },
  { name: '再生药水', image: '6ef1b719169348b595c93654cbf60c1c.png', category: '药水', phase: '开荒', fallback: '生' },
  { name: '水晶风暴', image: '034a248ac37a42049c5ef882098a4eb8.png', category: '武器', phase: '困难', fallback: '晶', damage: 32 },
  { name: '梦魇镐', image: '195bfda5955641b5bf340322fdd26eba.png', category: '工具', phase: 'Boss 后', fallback: '梦', damage: 9 },
] satisfies SampleItem[]

const quickFilters = ['全部', '武器', '材料', '药水', '困难模式']
const densityOptions = [120, 240, 480]
const fallbackSampleItem: SampleItem = primarySampleItems[0]!

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const resolveCategoryGroup = (text: string) => {
  if (/药水|potion|增益|buff/i.test(text)) return '药水'
  if (/武器|剑|弓|枪|炮|魔法|召唤|近战|远程|melee|ranged|magic|summon|weapon/i.test(text)) return '武器'
  if (/材料|矿|锭|块|方块|木材|矿石|material|bar|ore|block/i.test(text)) return '材料'
  if (/困难模式后|困难模式|hardmode/i.test(text)) return '困难模式'
  return '其他'
}

const normalizeApiItem = (raw: ApiItem, index: number): CatalogItem => {
  const itemId = toNumberOrNull(raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.name) || `物品 ${index + 1}`
  const englishName = normalizeText(raw.nameEn) || normalizeText(raw.name)
  const internalName = normalizeText(raw.internalName)
  const categoryPath = Array.isArray(raw.categoryPaths) && raw.categoryPaths.length > 0
    ? normalizeText(raw.categoryPaths[0])
    : ''
  const category = categoryPath || normalizeText(raw.categoryName) || normalizeText(raw.category) || '未分类'
  const phase = normalizeText(raw.gamePeriod) || (Number(raw.gamePeriodId) > 1 ? '困难模式后' : '阶段未标记')
  const rarity = normalizeText(raw.rarity) || normalizeText(raw.rare) || '稀有度未标记'
  const image = normalizeText(raw.imageUrl) || normalizeText(raw.image) || `${imageBase}/${primarySampleItems[index % primarySampleItems.length]?.image ?? fallbackSampleItem.image}`
  const categoryGroup = resolveCategoryGroup([category, categoryPath, phase, displayName, englishName, internalName].join(' '))
  const description = normalizeText(raw.descriptionZh)
    || normalizeText(raw.description)
    || normalizeText(raw.tooltipZh)
    || normalizeText(raw.tooltip)
    || `${category} · ${rarity} · ${phase}`
  const id = itemId ? String(itemId) : `${internalName || displayName}-${index + 1}`
  const searchText = normalizeSearchText([
    displayName,
    englishName,
    internalName,
    category,
    categoryPath,
    categoryGroup,
    phase,
    rarity,
  ].join(' '))

  return {
    id,
    itemId,
    detailPath: itemId ? `/items/${itemId}` : '/items/terra-blade',
    name: englishName || displayName,
    displayName,
    englishName,
    internalName,
    image,
    category,
    categoryPath,
    categoryGroup,
    phase,
    rarity,
    fallback: firstGlyph(displayName),
    range: String(index + 1).padStart(3, '0'),
    damage: toNumberOrNull(raw.damage),
    defense: toNumberOrNull(raw.defense),
    knockback: toNumberOrNull(raw.knockback),
    useTime: toNumberOrNull(raw.useTime),
    stackSize: toNumberOrNull(raw.stackSize),
    description,
    searchText,
  }
}

const fallbackCatalogItems: CatalogItem[] = Array.from({ length: 240 }, (_, index) => {
  const source: SampleItem = primarySampleItems[index % primarySampleItems.length] ?? primarySampleItems[0]!

  return normalizeApiItem({
    id: index + 1,
    name: source.name,
    nameZh: source.name,
    image: `${imageBase}/${source.image}`,
    imageUrl: `${imageBase}/${source.image}`,
    category: source.category,
    categoryName: source.category,
    categoryPaths: [source.category],
    rarity: source.category === '材料' ? '白色' : '黄色',
    gamePeriod: source.phase,
    damage: source.damage ?? null,
    stackSize: source.category === '材料' || source.category === '药水' ? 99 : 1,
  }, index)
})

const { data: itemsResponse, pending: itemsPending, error: itemsError } = await useAsyncData<ApiItemsResponse>(
  'items-pixel-gallery-catalog',
  () => $fetch<ApiItemsResponse>('/api/items', {
    query: {
      page: 1,
      limit: 480,
      sortBy: 'id',
      sortDirection: 'asc',
    },
  }),
  {
    server: false,
    default: () => ({
      success: false,
      data: [],
      pagination: {
        total: fallbackCatalogItems.length,
        page: 1,
        limit: 480,
        size: 480,
        totalPages: 1,
      },
    }),
  },
)

const apiCatalogItems = computed(() => {
  const rows = itemsResponse.value?.data
  return Array.isArray(rows) && rows.length > 0 ? rows.map(normalizeApiItem) : []
})

const catalogItems = computed(() => apiCatalogItems.value.length > 0 ? apiCatalogItems.value : fallbackCatalogItems)
const totalItems = computed(() => itemsResponse.value?.pagination?.total ?? catalogItems.value.length)
const dataSourceLabel = computed(() => apiCatalogItems.value.length > 0 ? '实时接口' : '本地兜底')

const matchesQuickFilter = (item: CatalogItem, filter: string) => {
  if (filter === '全部') return true
  if (filter === '困难模式') {
    return /困难模式后|困难模式|hardmode/i.test(item.phase) && !/困难模式前/i.test(item.phase)
  }
  return item.categoryGroup === filter || item.searchText.includes(normalizeSearchText(filter))
}

const filteredCatalogItems = computed(() => {
  const keyword = normalizeSearchText(searchQuery.value.trim())

  return catalogItems.value.filter((item) => {
    if (!matchesQuickFilter(item, activeFilter.value)) return false
    return !keyword || item.searchText.includes(keyword)
  })
})

const visibleWallItems = computed(() => filteredCatalogItems.value.slice(0, selectedDensity.value))
const defaultFocusedItem = fallbackCatalogItems[0]!
const focusedItem = computed<CatalogItem>(() => (
  visibleWallItems.value.find((item) => item.id === focusedItemId.value)
  ?? filteredCatalogItems.value.find((item) => item.id === focusedItemId.value)
  ?? visibleWallItems.value[0]
  ?? catalogItems.value[0]
  ?? defaultFocusedItem
))
const focusedItemIndex = computed(() => Math.max(catalogItems.value.findIndex((item) => item.id === focusedItem.value?.id) + 1, 1))
const resultSummary = computed(() => `${filteredCatalogItems.value.length} / ${totalItems.value.toLocaleString('zh-CN')}`)

const setFocusedItem = (item: CatalogItem) => {
  focusedItemId.value = item.id
}

const setActiveFilter = (filter: string) => {
  activeFilter.value = filter
}

const setDensity = (density: number) => {
  selectedDensity.value = density
}

const clearSearch = () => {
  searchQuery.value = ''
}

const itemImageSrc = (item: CatalogItem) => item.image

const markImageFallback = (image: string) => {
  failedItemImages.value = new Set(failedItemImages.value).add(image)
}

watch(catalogItems, (items) => {
  if (!focusedItemId.value && items[0]) {
    setFocusedItem(items[0])
  }
}, { immediate: true })

watch(filteredCatalogItems, (items) => {
  const firstItem = items[0]
  if (firstItem && !items.some((item) => item.id === focusedItemId.value)) {
    setFocusedItem(firstItem)
  }
})
</script>

<template>
  <section class="screen catalog-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ totalItems.toLocaleString('zh-CN') }} 个物品 · {{ dataSourceLabel }}</span>
          <h2>物品图鉴</h2>
          <p>图标墙是主浏览界面。搜索、分类、密度和悬停焦点都直接作用在当前墙面上。</p>
        </div>
        <a class="primary-button" :href="focusedItem.detailPath">打开当前物品</a>
      </div>
    </div>

    <section class="catalog-pixel-stage" aria-label="物品图鉴墙">
      <div class="catalog-wall-shell">
        <div class="catalog-wall-main">
          <div class="catalog-wall-topbar">
            <div class="catalog-wall-title">
              <span class="eyebrow">ITEM WALL</span>
              <h3>所有物品先出现</h3>
              <p>直接在图标墙里搜索、筛选和扫过图标。右侧焦点卡始终跟随当前物品。</p>
            </div>

            <div class="catalog-wall-controls">
              <form class="catalog-search-form" role="search" @submit.prevent>
                <label class="catalog-search-label" for="catalog-item-search">搜索物品</label>
                <input
                  id="catalog-item-search"
                  v-model="searchQuery"
                  class="catalog-search-input"
                  type="search"
                  name="search"
                  autocomplete="off"
                  placeholder="搜索名称 / 英文 / 分类 / 阶段"
                />
                <button
                  v-if="searchQuery"
                  class="catalog-clear-search"
                  type="button"
                  @click="clearSearch"
                >
                  清空
                </button>
              </form>

              <nav class="catalog-quick-filter-rail" aria-label="快速筛选">
                <button
                  v-for="filter in quickFilters"
                  :key="filter"
                  class="small-button"
                  :class="{ active: filter === activeFilter }"
                  type="button"
                  :aria-pressed="filter === activeFilter"
                  @click="setActiveFilter(filter)"
                >
                  {{ filter }}
                </button>
              </nav>
            </div>
          </div>

          <div class="density-rail catalog-density-rail">
            <span>当前结果 {{ resultSummary }} · 墙面显示 {{ visibleWallItems.length }}</span>
            <div class="density-actions" aria-label="墙面密度">
              <button
                v-for="density in densityOptions"
                :key="density"
                class="small-button density-choice"
                :class="{ active: density === selectedDensity }"
                type="button"
                :aria-pressed="density === selectedDensity"
                @click="setDensity(density)"
              >
                {{ density }}
              </button>
            </div>
            <strong>{{ itemsPending ? '同步中' : itemsError ? '兜底' : dataSourceLabel }}</strong>
          </div>

          <div v-if="visibleWallItems.length" class="catalog-wall-grid" aria-label="物品图标墙">
            <button
              v-for="item in visibleWallItems"
              :key="`wall-${item.id}`"
              class="catalog-wall-cell"
              :class="{ active: focusedItem.id === item.id }"
              type="button"
              :aria-pressed="focusedItem.id === item.id"
              :aria-label="item.displayName"
              :title="`${item.displayName} · ${item.category}`"
              @mouseenter="setFocusedItem(item)"
              @focus="setFocusedItem(item)"
              @click="setFocusedItem(item)"
            >
              <span
                class="item-art"
                :class="{ 'is-fallback': failedItemImages.has(item.image) }"
                :data-fallback="item.fallback"
              >
                <img
                  :src="itemImageSrc(item)"
                  :alt="item.displayName"
                  loading="lazy"
                  decoding="async"
                  @error="markImageFallback(item.image)"
                />
              </span>
              <span class="catalog-wall-cell-index">{{ item.range }}</span>
              <span class="catalog-wall-cell-label">{{ item.displayName }}</span>
            </button>
          </div>

          <div v-else class="catalog-empty-state">
            <b>没有匹配物品</b>
            <span>调整搜索词或切回全部分类。</span>
            <button class="small-button active" type="button" @click="clearSearch">清空搜索</button>
          </div>
        </div>

        <aside class="catalog-floating-focus">
          <span
            class="item-art focus-art"
            :class="{ 'is-fallback': failedItemImages.has(focusedItem.image) }"
            :data-fallback="focusedItem.fallback"
          >
            <img
              :src="itemImageSrc(focusedItem)"
              :alt="focusedItem.displayName"
              decoding="async"
              @error="markImageFallback(focusedItem.image)"
            />
          </span>
          <div>
            <span>当前焦点 · #{{ focusedItemIndex.toString().padStart(3, '0') }}</span>
            <h3>{{ focusedItem.displayName }}</h3>
            <p>{{ focusedItem.description }}</p>
            <div class="tag-row">
              <span class="tag gold">{{ focusedItem.category }}</span>
              <span class="tag moss">{{ focusedItem.rarity }}</span>
              <span class="tag paper">{{ focusedItem.phase }}</span>
            </div>
          </div>
          <dl class="catalog-focus-stats">
            <div><dt>伤害</dt><dd>{{ focusedItem.damage ?? '—' }}</dd></div>
            <div><dt>击退</dt><dd>{{ focusedItem.knockback ?? '—' }}</dd></div>
            <div><dt>使用</dt><dd>{{ focusedItem.useTime ?? '—' }}</dd></div>
            <div><dt>堆叠</dt><dd>{{ focusedItem.stackSize ?? '—' }}</dd></div>
          </dl>
          <nav :aria-label="`${focusedItem.displayName} 快捷操作`">
            <a :href="focusedItem.detailPath">详情</a>
            <a :href="`/search?keyword=${encodeURIComponent(focusedItem.displayName)}`">相关</a>
          </nav>
        </aside>
      </div>
    </section>

    <TerraFooter />
  </section>
</template>
