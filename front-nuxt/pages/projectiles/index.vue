<script setup lang="ts">
import { usePublicProjectiles } from '~/composables/usePublicProjectiles'
import type { PublicProjectileQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const defaultProjectilePageSize = 24
const projectilePageSizeOptions = [12, 24, 48, 96]
const projectileSortOptions = [
  { value: 'id', label: '编号' },
  { value: 'name', label: '名称' },
  { value: 'damage', label: '伤害' },
  { value: 'aiStyle', label: 'AI' },
] as const

const projectileClientReady = ref(false)
const projectileWallTopRef = ref<HTMLElement | null>(null)
const projectileSearchQuery = ref('')
const debouncedProjectileSearchQuery = ref('')
const projectileSortBy = ref<PublicProjectileQuery['sortBy']>('id')
const projectileSortDirection = ref<'asc' | 'desc'>('asc')
const projectileCurrentPage = ref(1)
const projectilePageSize = ref(defaultProjectilePageSize)
const projectileJumpPageInput = ref('')
const projectileVisualLoading = ref(true)
const projectileVisualLoadingMinimumMs = 180
let projectileSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let projectileVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let projectileVisualLoadingStartedAt = Date.now()
let syncingProjectileRouteQuery = false

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
const parseProjectilePageSize = (value: unknown) => {
  const parsed = parsePositiveInteger(value, defaultProjectilePageSize)
  return projectilePageSizeOptions.includes(parsed) ? parsed : defaultProjectilePageSize
}
const parseProjectileSort = (value: unknown) => {
  const candidate = String(firstQueryValue(value) ?? 'id')
  return projectileSortOptions.some((option) => option.value === candidate) ? candidate : 'id'
}
const parseProjectileSortDirection = (value: unknown): 'asc' | 'desc' => (
  String(firstQueryValue(value) ?? '').toLocaleLowerCase() === 'desc' ? 'desc' : 'asc'
)

const projectileListQuery = computed(() => ({
  page: projectileCurrentPage.value,
  limit: projectilePageSize.value,
  search: debouncedProjectileSearchQuery.value.trim() || undefined,
  sortBy: projectileSortBy.value,
  sortDirection: projectileSortDirection.value,
}) satisfies PublicProjectileQuery)

const {
  data: publicProjectilesResult,
  pending: projectilesPending,
  error: projectilesError,
  refresh: refreshPublicProjectiles,
} = await usePublicProjectiles(() => projectileListQuery.value)

const projectilePagination = computed(() => publicProjectilesResult.value?.pagination)
const projectileRawLoading = computed(() => !projectileClientReady.value || projectilesPending.value)
const projectileApiUnavailable = computed(() => (
  projectileClientReady.value
  && !projectilesPending.value
  && publicProjectilesResult.value?.source !== 'api'
))
const projectileItems = computed(() => {
  const items = publicProjectilesResult.value?.items
  return Array.isArray(items) ? items : []
})
const projectileDisplayItems = computed(() => (
  projectileVisualLoading.value || projectileApiUnavailable.value ? [] : projectileItems.value
))
const projectileTotalItems = computed(() => (
  projectileVisualLoading.value || projectileApiUnavailable.value
    ? 0
    : projectilePagination.value?.total ?? projectileDisplayItems.value.length
))
const projectilePageLimit = computed(() => projectilePagination.value?.limit ?? projectilePagination.value?.size ?? projectilePageSize.value)
const projectileTotalPages = computed(() => Math.max(
  1,
  projectilePagination.value?.totalPages ?? Math.ceil(projectileTotalItems.value / Math.max(1, projectilePageLimit.value)),
))
const projectileCanGoPrevious = computed(() => projectileCurrentPage.value > 1)
const projectileCanGoNext = computed(() => projectileCurrentPage.value < projectileTotalPages.value)
const projectileLoadingSlotCount = computed(() => Math.min(projectilePageSize.value, 48))
const projectileStatusLabel = computed(() => {
  if (projectileVisualLoading.value) return '加载中'
  if (projectileApiUnavailable.value || projectilesError.value) return '未载入'
  return '已更新'
})
const projectileResultSummary = computed(() => {
  if (projectileVisualLoading.value) return '加载中'
  if (projectileApiUnavailable.value) return '等待接口'
  return `${projectileDisplayItems.value.length} / ${projectileTotalItems.value.toLocaleString('zh-CN')}`
})
const projectileOrbitItems = computed(() => projectileDisplayItems.value.slice(0, 3))
const projectilePageWindowItems = computed(() => {
  if (projectileVisualLoading.value) return [1]

  const pages = projectileTotalPages.value
  const page = projectileCurrentPage.value
  const candidates = new Set([1, pages])

  for (let index = page - 2; index <= page + 2; index += 1) {
    if (index >= 1 && index <= pages) {
      candidates.add(index)
    }
  }

  return [...candidates].sort((left, right) => left - right).reduce<Array<number | 'gap'>>((items, item) => {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && item - previous > 1) {
      items.push('gap')
    }
    items.push(item)
    return items
  }, [])
})

const clearProjectileVisualLoadingTimer = () => {
  if (projectileVisualLoadingTimer) {
    clearTimeout(projectileVisualLoadingTimer)
    projectileVisualLoadingTimer = null
  }
}

const syncProjectileVisualLoading = (isLoading: boolean) => {
  clearProjectileVisualLoadingTimer()

  if (isLoading) {
    projectileVisualLoadingStartedAt = Date.now()
    projectileVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - projectileVisualLoadingStartedAt
  const remaining = Math.max(0, projectileVisualLoadingMinimumMs - elapsed)

  projectileVisualLoadingTimer = setTimeout(() => {
    projectileVisualLoading.value = false
    projectileVisualLoadingTimer = null
  }, remaining)
}

const scrollProjectilesToTop = async () => {
  if (!import.meta.client) return

  await nextTick()
  projectileWallTopRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const goToProjectilePage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), projectileTotalPages.value)
  if (nextPage === projectileCurrentPage.value) return

  projectileCurrentPage.value = nextPage
  projectileJumpPageInput.value = ''
  void scrollProjectilesToTop()
}

const goToProjectileJumpPage = () => {
  const page = parsePositiveInteger(projectileJumpPageInput.value, projectileCurrentPage.value)
  goToProjectilePage(page)
}

const clearProjectileSearch = () => {
  projectileSearchQuery.value = ''
}

const resetProjectileFilters = () => {
  projectileSearchQuery.value = ''
  debouncedProjectileSearchQuery.value = ''
  projectileSortBy.value = 'id'
  projectileSortDirection.value = 'asc'
  projectileCurrentPage.value = 1
}

const setProjectilePageSize = (pageSize: number) => {
  projectilePageSize.value = pageSize
  projectileCurrentPage.value = 1
  projectileJumpPageInput.value = ''
  void scrollProjectilesToTop()
}

const updateProjectileRouteQuery = () => {
  const query = {
    ...route.query,
    page: projectileCurrentPage.value > 1 ? String(projectileCurrentPage.value) : undefined,
    pageSize: projectilePageSize.value !== defaultProjectilePageSize ? String(projectilePageSize.value) : undefined,
    q: debouncedProjectileSearchQuery.value.trim() || undefined,
    sortBy: projectileSortBy.value !== 'id' ? projectileSortBy.value : undefined,
    sortDirection: projectileSortDirection.value !== 'asc' ? projectileSortDirection.value : undefined,
  }

  syncingProjectileRouteQuery = true
  void router.replace({ query }).finally(() => {
    syncingProjectileRouteQuery = false
  })
}

const hydrateProjectileStateFromRoute = () => {
  if (syncingProjectileRouteQuery) return

  const search = String(firstQueryValue(route.query.q) ?? '')
  projectileSearchQuery.value = search
  debouncedProjectileSearchQuery.value = search
  projectileCurrentPage.value = parsePositiveInteger(route.query.page, 1)
  projectilePageSize.value = parseProjectilePageSize(route.query.pageSize)
  projectileSortBy.value = parseProjectileSort(route.query.sortBy)
  projectileSortDirection.value = parseProjectileSortDirection(route.query.sortDirection)
}

hydrateProjectileStateFromRoute()

watch(projectileSearchQuery, () => {
  if (projectileSearchDebounceTimer) {
    clearTimeout(projectileSearchDebounceTimer)
  }

  projectileCurrentPage.value = 1
  projectileSearchDebounceTimer = setTimeout(() => {
    debouncedProjectileSearchQuery.value = projectileSearchQuery.value
  }, 300)
}, { flush: 'sync' })

watch([projectileSortBy, projectileSortDirection], () => {
  projectileCurrentPage.value = 1
  void scrollProjectilesToTop()
}, { flush: 'sync' })

watch(projectileTotalPages, (pages) => {
  if (projectileCurrentPage.value > pages) {
    projectileCurrentPage.value = pages
  }
})

watch(
  [projectileCurrentPage, projectilePageSize, debouncedProjectileSearchQuery, projectileSortBy, projectileSortDirection],
  updateProjectileRouteQuery,
  { flush: 'post' },
)

watch(projectileRawLoading, syncProjectileVisualLoading, { immediate: true })
watch(() => route.query, hydrateProjectileStateFromRoute)

onMounted(() => {
  projectileClientReady.value = true
})

onBeforeUnmount(() => {
  if (projectileSearchDebounceTimer) {
    clearTimeout(projectileSearchDebounceTimer)
  }

  clearProjectileVisualLoadingTimer()
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ projectileVisualLoading ? '加载射弹资料' : projectileApiUnavailable ? '等待接口返回' : `${projectileTotalItems.toLocaleString('zh-CN')} 个射弹` }}</span>
          <h1>Projectile 行为库</h1>
          <p>射弹页展示弹道行为、友方/敌方归属、AI 样式、伤害和击退，帮助玩家理解武器与 Boss 招式。</p>
        </div>
        <a class="primary-button" href="/bosses">查看 Boss 弹幕</a>
      </div>
    </div>

    <main
      ref="projectileWallTopRef"
      class="projectile-layout"
      :aria-busy="projectileVisualLoading"
      :data-source="publicProjectilesResult?.source ?? 'fallback'"
    >
      <section class="projectile-command">
        <div>
          <span class="eyebrow">行为矩阵</span>
          <h2>从“它叫什么”转成“它怎么运动、怎么命中”</h2>
          <p>搜索名称或内部名，按编号、名称、伤害或 AI 样式排序。当前列表只使用公共射弹接口。</p>
        </div>
        <div class="projectile-orbit" aria-hidden="true">
          <span v-for="projectile in projectileOrbitItems" :key="`orbit-${projectile.id}`">
            <CommonPreviewImage
              :src="projectile.image"
              :alt="projectile.displayName"
              :fallback="projectile.fallback"
              :source-image="projectile.sourceImage"
              width="44"
              height="44"
              decorative
            />
          </span>
          <span v-for="slot in Math.max(0, 3 - projectileOrbitItems.length)" :key="`orbit-loading-${slot}`">
            <CommonTpSkeleton type="icon" />
          </span>
        </div>
      </section>

      <section class="projectile-command" aria-label="射弹筛选">
        <form class="catalog-search-form" role="search" @submit.prevent>
          <label class="catalog-search-label" for="projectile-search">搜索射弹</label>
          <input
            id="projectile-search"
            v-model="projectileSearchQuery"
            class="catalog-search-input"
            type="search"
            name="search"
            autocomplete="off"
            placeholder="搜索名称 / 英文 / 内部名"
          />
          <span v-if="projectilesPending && projectileSearchQuery" class="catalog-search-spinner" aria-hidden="true"></span>
          <button
            v-if="projectileSearchQuery"
            class="catalog-clear-search"
            type="button"
            @click="clearProjectileSearch"
          >
            清空
          </button>
        </form>

        <div class="projectile-facts" aria-label="排序和状态">
          <label>
            <span>排序</span>
            <select v-model="projectileSortBy">
              <option
                v-for="option in projectileSortOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label>
            <span>方向</span>
            <select v-model="projectileSortDirection">
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </label>
          <span>{{ projectileResultSummary }}</span>
          <span>{{ projectileStatusLabel }}</span>
        </div>
      </section>

      <section class="projectile-grid" aria-label="射弹列表">
        <template v-if="projectileVisualLoading">
          <article
            v-for="slot in projectileLoadingSlotCount"
            :key="`projectile-loading-${slot}`"
            class="projectile-card"
          >
            <i><CommonTpSkeleton type="icon" /></i>
            <h3><CommonTpSkeleton type="line" /></h3>
            <p><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></p>
            <div class="projectile-facts">
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="pill" />
            </div>
          </article>
        </template>

        <template v-else-if="projectileDisplayItems.length">
          <article
            v-for="projectile in projectileDisplayItems"
            :key="projectile.id"
            class="projectile-card"
            :class="{ active: projectile.friendly, hostile: projectile.hostile }"
          >
            <i>
              <CommonPreviewImage
                :src="projectile.image"
                :alt="projectile.displayName"
                :fallback="projectile.fallback"
                :source-image="projectile.sourceImage"
                width="64"
                height="64"
              />
            </i>
            <h3>{{ projectile.displayName }}</h3>
            <p>{{ projectile.summary }}</p>
            <div class="projectile-facts">
              <span>{{ projectile.allegianceLabel }}</span>
              <span>{{ projectile.aiStyle === null ? 'AI 未标记' : `AI ${projectile.aiStyle}` }}</span>
              <span>{{ projectile.damage === null ? '伤害未标记' : `伤害 ${projectile.damage}` }}</span>
              <span>{{ projectile.knockBack === null ? '击退未标记' : `击退 ${projectile.knockBack}` }}</span>
            </div>
          </article>
        </template>

        <div v-else class="catalog-empty-state">
          <b>{{ projectileApiUnavailable ? '射弹资料暂未载入' : '没有匹配射弹' }}</b>
          <span>{{ projectileApiUnavailable ? '当前公共接口暂不可用，页面不会展示静态样例射弹。' : '调整搜索词或排序后重试。' }}</span>
          <button
            v-if="projectileApiUnavailable"
            class="small-button active"
            type="button"
            @click="refreshPublicProjectiles()"
          >
            重新加载
          </button>
          <button v-else class="small-button active" type="button" @click="resetProjectileFilters">重置筛选</button>
        </div>
      </section>

      <section class="projectile-data-band">
        <div><b>总数</b><span>{{ projectileTotalItems.toLocaleString('zh-CN') }}</span></div>
        <div><b>分页</b><span>第 {{ projectileCurrentPage }} / {{ projectileTotalPages }} 页</span></div>
        <div><b>排序</b><span>{{ projectileSortBy }} · {{ projectileSortDirection === 'asc' ? '升序' : '降序' }}</span></div>
        <div><b>接口</b><span>{{ publicProjectilesResult?.source === 'api' ? '公共 API' : '等待公共 API' }}</span></div>
      </section>

      <nav class="catalog-page-dock" aria-label="射弹分页">
        <span class="catalog-page-dock-summary">第 {{ projectileVisualLoading ? 1 : projectileCurrentPage }} / {{ projectileVisualLoading ? 1 : projectileTotalPages }} 页</span>
        <div class="catalog-page-dock-core">
          <button class="catalog-dock-button" type="button" :disabled="projectileVisualLoading || !projectileCanGoPrevious" @click="goToProjectilePage(1)">
            首页
          </button>
          <button class="catalog-dock-icon-button" type="button" aria-label="上一页" :disabled="projectileVisualLoading || !projectileCanGoPrevious" @click="goToProjectilePage(projectileCurrentPage - 1)">
            ‹
          </button>
          <template v-for="(pageItem, index) in projectilePageWindowItems" :key="`${pageItem}-${index}`">
            <span v-if="pageItem === 'gap'" class="catalog-page-gap">…</span>
            <button
              v-else
              class="catalog-dock-page-button"
              type="button"
              :class="{ active: pageItem === projectileCurrentPage }"
              :aria-current="!projectileVisualLoading && pageItem === projectileCurrentPage ? 'page' : undefined"
              :disabled="projectileVisualLoading"
              @click="goToProjectilePage(pageItem)"
            >
              {{ pageItem }}
            </button>
          </template>
          <button class="catalog-dock-icon-button" type="button" aria-label="下一页" :disabled="projectileVisualLoading || !projectileCanGoNext" @click="goToProjectilePage(projectileCurrentPage + 1)">
            ›
          </button>
          <button class="catalog-dock-button" type="button" :disabled="projectileVisualLoading || !projectileCanGoNext" @click="goToProjectilePage(projectileTotalPages)">
            末页
          </button>
        </div>
        <form class="catalog-dock-jump-form" aria-label="跳页" @submit.prevent="goToProjectileJumpPage">
          <label for="projectile-page-jump">跳至</label>
          <input
            id="projectile-page-jump"
            v-model="projectileJumpPageInput"
            type="number"
            inputmode="numeric"
            min="1"
            :max="projectileTotalPages"
            :placeholder="String(projectileCurrentPage)"
            :disabled="projectileVisualLoading"
          />
          <span>/ {{ projectileTotalPages }}</span>
          <button class="catalog-dock-button" type="submit" :disabled="projectileVisualLoading">前往</button>
        </form>
        <div class="catalog-density-picker" aria-label="每页数量">
          <span>每页</span>
          <button
            v-for="pageSize in projectilePageSizeOptions"
            :key="pageSize"
            class="catalog-density-chip"
            :class="{ active: pageSize === projectilePageSize }"
            type="button"
            :aria-pressed="pageSize === projectilePageSize"
            :disabled="projectileVisualLoading"
            @click="setProjectilePageSize(pageSize)"
          >
            {{ pageSize }}
          </button>
        </div>
      </nav>
    </main>

    <TerraFooter />
  </section>
</template>
