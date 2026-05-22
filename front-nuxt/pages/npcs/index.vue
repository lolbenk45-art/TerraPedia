<script setup lang="ts">
import type { NpcCatalogCard, PublicNpcQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const pageSize = 24

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const parsePositiveInteger = (value: unknown, fallback = 1) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
const parseString = (value: unknown) => String(firstQueryValue(value) ?? '').trim()
const parseBoolean = (value: unknown) => {
  const raw = String(firstQueryValue(value) ?? '').trim().toLowerCase()
  return raw === 'true' || raw === '1'
}

const npcSearch = ref(parseString(route.query.search))
const currentPage = computed(() => parsePositiveInteger(route.query.page, 1))
const townOnly = computed(() => parseBoolean(route.query.isTownNpc) || parseBoolean(route.query.town))
const publicNpcQuery = computed(() => ({
  page: currentPage.value,
  limit: pageSize,
  search: parseString(route.query.search) || undefined,
  isTownNpc: townOnly.value ? true : undefined,
}) satisfies PublicNpcQuery)

const {
  data: npcResult,
  pending: npcPending,
  error: npcError,
  refresh: refreshNpcs,
} = await usePublicNpcs(() => publicNpcQuery.value)

const npcCards = computed<NpcCatalogCard[]>(() => npcResult.value?.npcs ?? [])
const pagination = computed(() => npcResult.value?.pagination ?? { total: 0, page: currentPage.value, limit: pageSize, totalPages: 1 })
const totalPages = computed(() => Math.max(1, Number(pagination.value.totalPages ?? 1)))
const selectedNpc = computed(() => npcCards.value[0] ?? null)
const npcLoading = computed(() => npcPending.value && npcResult.value?.source !== 'api')
const npcSourceLabel = computed(() => npcResult.value?.source === 'api' ? '实时接口' : '等待接口')
const npcStatusText = computed(() => npcLoading.value ? '加载 NPC' : npcError.value ? '接口未载入' : npcSourceLabel.value)
const townHref = computed(() => townOnly.value ? '/npcs' : '/npcs?isTownNpc=true')

const displayedPages = computed(() => {
  const pages = new Set([1, totalPages.value, currentPage.value, currentPage.value - 1, currentPage.value + 1])
  return [...pages].filter((page) => page >= 1 && page <= totalPages.value).sort((left, right) => left - right)
})

watch(
  () => route.query.search,
  () => {
    npcSearch.value = parseString(route.query.search)
  },
)

const applySearch = async () => {
  const query: Record<string, string> = {}
  const search = npcSearch.value.trim()

  if (search) query.search = search
  if (townOnly.value) query.isTownNpc = 'true'

  await router.push({ path: '/npcs', query })
}

const refreshNpcList = () => {
  void refreshNpcs()
}

const goToPage = async (page: number) => {
  const query: Record<string, string> = {}
  const search = parseString(route.query.search)

  if (page > 1) query.page = String(page)
  if (search) query.search = search
  if (townOnly.value) query.isTownNpc = 'true'

  await router.push({ path: '/npcs', query })
}

const npcKindLabel = (npc: NpcCatalogCard) => {
  if (npc.isTownNpc) return '城镇 NPC'
  if (npc.isFriendly) return '友好 NPC'
  return npc.isBoss ? 'Boss 相关' : '敌怪 / 生态'
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ pagination.total ?? 0 }} 个角色与敌怪 · 公共资料索引</span>
          <h1>NPC 图鉴</h1>
          <p>把城镇角色、敌怪、Boss 部件和事件生物放到同一个可筛选图鉴里。列表来自公开接口，详情页继续进入掉落、商店和 Buff 聚合资料。</p>
        </div>
        <a class="primary-button" href="/bosses">进入 Boss 路线</a>
      </div>
    </div>

    <main class="entity-layout">
      <aside class="entity-rail">
        <p class="section-label">角色域</p>
        <a class="entity-filter" :class="{ active: !townOnly }" href="/npcs"><span></span><b>全部 NPC</b><em>{{ pagination.total ?? 0 }}</em></a>
        <a class="entity-filter" :class="{ active: townOnly }" :href="townHref"><span></span><b>城镇角色</b><em>{{ townOnly ? pagination.total ?? 0 : '筛选' }}</em></a>
        <a class="entity-filter" href="/npcs"><span></span><b>敌怪</b><em>公开</em></a>
        <a class="entity-filter" href="/bosses"><span></span><b>Boss 相关</b><em>阶段</em></a>

        <div class="entity-mini-panel">
          <strong>公共展示口径</strong>
          <p>列表只呈现玩家能理解的信息：身份、生态、公开头像和详情入口。</p>
        </div>
      </aside>

      <section class="entity-main-panel">
        <form class="entity-toolbar" role="search" @submit.prevent="applySearch">
          <label class="catalog-search">
            <span class="search-glyph" aria-hidden="true"></span>
            <input v-model="npcSearch" type="search" placeholder="向导 / 商人 / 克苏鲁之眼" />
          </label>
          <div class="toolbar-buttons">
            <button class="small-button active" type="submit">搜索</button>
            <a class="small-button" :href="townHref">{{ townOnly ? '全部' : '城镇' }}</a>
            <button class="small-button" type="button" @click="refreshNpcList">刷新</button>
          </div>
        </form>

        <div class="entity-stat-strip">
          <div><b>{{ pagination.total ?? 0 }}</b><span>接口记录</span></div>
          <div><b>{{ pageSize }}</b><span>每页展示</span></div>
          <div><b>{{ currentPage }}/{{ totalPages }}</b><span>当前分页</span></div>
          <div><b>{{ npcStatusText }}</b><span>数据状态</span></div>
        </div>

        <div v-if="npcLoading" class="npc-board" aria-live="polite">
          <article v-for="slot in 6" :key="slot" class="npc-card">
            <i><span class="item-art tp-preview-image is-fallback" data-fallback="N"></span></i>
            <div><b>加载 NPC</b><span>公开接口同步中</span></div>
            <em>加载</em>
          </article>
        </div>

        <div v-else-if="npcError || npcCards.length === 0" class="entity-mini-panel">
          <strong>{{ npcError ? 'NPC 接口暂不可用' : '没有匹配 NPC' }}</strong>
          <p>{{ npcError ? '当前页面没有拿到公开 NPC 列表，可以稍后刷新。' : '换一个关键词或关闭城镇筛选后再试。' }}</p>
        </div>

        <div v-else class="npc-board">
          <a
            v-for="npc in npcCards"
            :key="npc.id"
            class="npc-card"
            :class="{ active: npc === selectedNpc, danger: npc.isBoss }"
            :href="npc.detailPath"
          >
            <i>
              <CommonPreviewImage :src="npc.image" :alt="npc.displayName" :fallback="npc.fallback" />
            </i>
            <div><b>{{ npc.displayName }}</b><span>{{ npcKindLabel(npc) }} · {{ npc.categoryName }}</span></div>
            <em>详情</em>
          </a>
        </div>

        <div v-if="totalPages > 1" class="toolbar-buttons" style="margin-top:16px">
          <button class="small-button" type="button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">上一页</button>
          <button
            v-for="page in displayedPages"
            :key="page"
            class="small-button"
            :class="{ active: page === currentPage }"
            type="button"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
          <button class="small-button" type="button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">下一页</button>
        </div>
      </section>

      <aside class="entity-preview-dark">
        <span class="eyebrow">当前焦点</span>
        <div class="portrait-stage">
          <CommonPreviewImage
            :src="selectedNpc?.image"
            :alt="selectedNpc?.displayName || 'NPC'"
            :fallback="selectedNpc?.fallback || 'N'"
            loading="eager"
          />
        </div>
        <h2>{{ selectedNpc?.displayName || 'NPC 资料' }}</h2>
        <p>{{ selectedNpc ? `${selectedNpc.categoryName} · ${selectedNpc.internalName || selectedNpc.secondaryName || '公开资料'}` : '选择一个公开 NPC 后查看详情。' }}</p>
        <div class="mini-facts">
          <div><b>{{ selectedNpc?.gameId ?? '--' }}</b><span>Game ID</span></div>
          <div><b>{{ selectedNpc?.isTownNpc ? '城镇' : '公开' }}</b><span>角色类型</span></div>
          <div><b>{{ selectedNpc?.isFriendly ? '友好' : '生态' }}</b><span>关系</span></div>
          <div><b>{{ npcResult?.source === 'api' ? 'API' : '--' }}</b><span>来源</span></div>
        </div>
        <a v-if="selectedNpc" class="primary-button full-button" :href="selectedNpc.detailPath">打开详情</a>
      </aside>
    </main>

    <TerraFooter />
  </section>
</template>
