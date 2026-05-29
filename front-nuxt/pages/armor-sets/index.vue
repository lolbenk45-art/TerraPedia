<script setup lang="ts">
import { usePublicArmorSets } from '~/composables/usePublicArmorSets'
import type { ArmorSetCatalogItem, EquipmentEffectAttribute, PublicArmorSetQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'TerraPedia · 套装路线',
  description: '浏览 Terraria 公开防具套装资料，查看部件数量、套装效果、词条解析和分页搜索。',
})

const armorClientReady = ref(false)
const armorSearchQuery = ref('')
const armorDebouncedSearchQuery = ref('')
const armorCurrentPage = ref(1)
const armorPageSize = ref(24)
const armorVisualLoading = ref(true)
const armorVisualLoadingMinimumMs = 180
let armorSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let armorVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let armorVisualLoadingStartedAt = Date.now()
let syncingArmorRouteQuery = false

const statLabels: Record<string, string> = {
  damage_bonus: '伤害',
  crit_chance: '暴击',
  move_speed: '移速',
  melee_speed: '近战速度',
  summon_damage: '召唤伤害',
  minion_capacity: '仆从',
  ammo_conservation: '弹药节省',
  defense: '防御',
  mana_max: '魔力',
  mana_cost: '魔耗',
  mining_speed: '挖矿',
  special_effect: '特效',
}

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const armorListQuery = computed(() => ({
  page: armorCurrentPage.value,
  limit: armorPageSize.value,
  search: armorDebouncedSearchQuery.value.trim() || undefined,
}) satisfies PublicArmorSetQuery)

const {
  data: publicArmorSetsResult,
  pending: armorSetsPending,
  error: armorSetsError,
  refresh: refreshPublicArmorSets,
} = await usePublicArmorSets(() => armorListQuery.value)

const armorPagination = computed(() => publicArmorSetsResult.value?.pagination)
const armorRawLoading = computed(() => !armorClientReady.value || armorSetsPending.value)
const armorFallbackUnavailable = computed(() => armorClientReady.value && !armorSetsPending.value && publicArmorSetsResult.value?.source !== 'api')
const armorDisplayItems = computed(() => (armorVisualLoading.value || armorFallbackUnavailable.value) ? [] : publicArmorSetsResult.value?.items ?? [])
const armorTotalItems = computed(() => (armorVisualLoading.value || armorFallbackUnavailable.value) ? 0 : armorPagination.value?.total ?? armorDisplayItems.value.length)
const armorTotalPages = computed(() => Math.max(1, armorPagination.value?.totalPages ?? Math.ceil(armorTotalItems.value / Math.max(1, armorPageSize.value))))
const armorStatusLabel = computed(() => armorVisualLoading.value ? '加载中' : armorFallbackUnavailable.value || armorSetsError.value ? '未载入' : '已更新')
const armorHeroEyebrow = computed(() => {
  if (armorVisualLoading.value) return '加载套装资料'
  if (armorFallbackUnavailable.value || armorSetsError.value) return '套装资料暂未载入'
  return `${armorTotalItems.value.toLocaleString('zh-CN')} 套防具`
})
const armorLoadingSlotCount = computed(() => Math.min(armorPageSize.value, 24))
const featuredArmor = computed(() => armorDisplayItems.value.find((item) => item.parsedEffects.length >= 3) ?? armorDisplayItems.value[0] ?? null)

const clearArmorVisualLoadingTimer = () => {
  if (armorVisualLoadingTimer) {
    clearTimeout(armorVisualLoadingTimer)
    armorVisualLoadingTimer = null
  }
}

const syncArmorVisualLoading = (isLoading: boolean) => {
  clearArmorVisualLoadingTimer()

  if (isLoading) {
    armorVisualLoadingStartedAt = Date.now()
    armorVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - armorVisualLoadingStartedAt
  const remaining = Math.max(0, armorVisualLoadingMinimumMs - elapsed)

  armorVisualLoadingTimer = setTimeout(() => {
    armorVisualLoading.value = false
    armorVisualLoadingTimer = null
  }, remaining)
}

const goToArmorPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), armorTotalPages.value)
  if (nextPage === armorCurrentPage.value) return
  armorCurrentPage.value = nextPage
}

const clearArmorSearch = () => {
  armorSearchQuery.value = ''
}

const resetArmorSearch = () => {
  armorSearchQuery.value = ''
  armorDebouncedSearchQuery.value = ''
  armorCurrentPage.value = 1
}

const updateArmorRouteQuery = () => {
  syncingArmorRouteQuery = true
  void router.replace({
    query: {
      ...route.query,
      page: armorCurrentPage.value > 1 ? String(armorCurrentPage.value) : undefined,
      q: armorDebouncedSearchQuery.value.trim() || undefined,
    },
  }).finally(() => {
    syncingArmorRouteQuery = false
  })
}

const hydrateArmorStateFromRoute = () => {
  if (syncingArmorRouteQuery) return

  const search = String(firstQueryValue(route.query.q) ?? '')
  armorCurrentPage.value = parsePositiveInteger(route.query.page, 1)
  armorSearchQuery.value = search
  armorDebouncedSearchQuery.value = search
}

const numberLabel = (value: number | null | undefined) => (
  value == null ? '未标记' : value.toLocaleString('zh-CN')
)

const formatEffectValue = (effect: EquipmentEffectAttribute) => {
  const numeric = Number(effect.valueDecimal)
  if (!Number.isFinite(numeric)) {
    return effect.unit === 'boolean' ? '' : ''
  }

  if (effect.unit === 'percent') return `${numeric > 0 ? '+' : ''}${numeric}%`
  if (effect.unit === 'multiplier') return `×${numeric}`
  return `${numeric > 0 ? '+' : ''}${numeric}`
}

const effectLabel = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  const label = statLabels[key] ?? effect.statLabelZh ?? key
  const value = formatEffectValue(effect)
  const scope = effect.classScope && effect.classScope !== 'all' ? ` · ${effect.classScope}` : ''
  return `${label}${value ? ` ${value}` : ''}${scope}`
}

const effectToneClass = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/damage|crit|melee|summon|ammo/.test(key)) return 'is-offense'
  if (/move|speed|dash|acceleration/.test(key)) return 'is-mobility'
  if (/defense|immunity/.test(key)) return 'is-defense'
  return 'is-special'
}

const shownEffects = (armor: ArmorSetCatalogItem, limit = 6) => {
  const parsed = armor.parsedEffects.length ? armor.parsedEffects : armor.effects
  return parsed.slice(0, limit)
}

const benefitLines = (armor: ArmorSetCatalogItem, limit = 4) => (
  armor.benefitZh
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
)

const armorSummary = (armor: ArmorSetCatalogItem) => {
  const parsedCount = armor.parsedEffects.length
  const totalCount = armor.effects.length
  return `${numberLabel(armor.uniqueItemCount)} 个部件 · ${parsedCount}/${totalCount} 条效果`
}

hydrateArmorStateFromRoute()

watch(armorSearchQuery, () => {
  if (armorSearchDebounceTimer) {
    clearTimeout(armorSearchDebounceTimer)
  }

  armorCurrentPage.value = 1
  armorSearchDebounceTimer = setTimeout(() => {
    armorDebouncedSearchQuery.value = armorSearchQuery.value
  }, 300)
}, { flush: 'sync' })

watch(armorDebouncedSearchQuery, () => {
  armorCurrentPage.value = 1
})

watch(armorTotalPages, (pages) => {
  if (armorCurrentPage.value > pages) {
    armorCurrentPage.value = pages
  }
})

watch([armorCurrentPage, armorDebouncedSearchQuery], updateArmorRouteQuery, { flush: 'post' })
watch(armorRawLoading, syncArmorVisualLoading, { immediate: true })
watch(() => route.query, hydrateArmorStateFromRoute)

onMounted(() => {
  armorClientReady.value = true
})

onBeforeUnmount(() => {
  if (armorSearchDebounceTimer) {
    clearTimeout(armorSearchDebounceTimer)
  }

  clearArmorVisualLoadingTimer()
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ armorHeroEyebrow }}</span>
          <h1>套装路线</h1>
          <p>按套装、部件数量和效果词条查看防具推进。</p>
        </div>
        <a class="primary-button" href="/items">查看部件</a>
      </div>
    </div>

    <main class="armor-layout" :aria-busy="armorVisualLoading" :data-source="publicArmorSetsResult?.source ?? 'fallback'">
      <section class="armor-command">
        <form class="catalog-search-form" role="search" @submit.prevent>
          <label class="catalog-search-label" for="armor-search">搜索套装</label>
          <input
            id="armor-search"
            v-model="armorSearchQuery"
            class="catalog-search-input"
            type="search"
            name="search"
            autocomplete="off"
            placeholder="搜索名称 / 效果 / 属性"
          />
          <button v-if="armorSearchQuery" class="catalog-clear-search" type="button" @click="clearArmorSearch">
            清空
          </button>
        </form>

        <div class="catalog-control-summary" aria-live="polite">
          <span>第 {{ armorCurrentPage }} / {{ armorTotalPages }} 页</span>
          <b>{{ armorStatusLabel }}</b>
          <strong>{{ armorTotalItems.toLocaleString('zh-CN') }} 条</strong>
        </div>
      </section>

      <section v-if="featuredArmor && !armorVisualLoading" class="armor-spotlight">
        <div>
          <span class="eyebrow">当前焦点</span>
          <h2>{{ featuredArmor.displayName }}</h2>
          <p>{{ armorSummary(featuredArmor) }}</p>
          <div class="armor-effect-strip">
            <span
              v-for="effect in shownEffects(featuredArmor, 8)"
              :key="`${featuredArmor.id}-${effect.statKey}-${effect.rawText}`"
              :class="effectToneClass(effect)"
            >
              {{ effectLabel(effect) }}
            </span>
          </div>
        </div>
        <div class="armor-stage">
          <CommonPreviewImage
            :src="featuredArmor.image"
            :alt="featuredArmor.displayName"
            :fallback="featuredArmor.fallback"
            fallback-icon="icon-armor"
            :source-image="featuredArmor.sourceImage"
            width="180"
            height="110"
          />
        </div>
      </section>

      <section v-if="armorVisualLoading" class="armor-grid" aria-label="套装加载中">
        <article v-for="slot in armorLoadingSlotCount" :key="`armor-loading-${slot}`" class="armor-card">
          <CommonTpSkeleton type="icon" />
          <div>
            <span><CommonTpSkeleton type="pill" /></span>
            <h3><CommonTpSkeleton type="line" /></h3>
            <p><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></p>
          </div>
          <em><CommonTpSkeleton type="pill" /></em>
        </article>
      </section>

      <section v-else-if="armorDisplayItems.length" class="armor-grid" aria-label="套装列表">
        <NuxtLink
          v-for="armor in armorDisplayItems.filter((entry) => entry.armorSetId)"
          :key="armor.id"
          class="armor-card armor-card-live armor-card-link"
          :class="{ active: armor.id === featuredArmor?.id }"
          :to="`/armor-sets/${armor.armorSetId}`"
          :aria-label="`查看套装 ${armor.displayName}`"
        >
          <CommonPreviewImage
            :src="armor.image"
            :alt="armor.displayName"
            :fallback="armor.fallback"
            fallback-icon="icon-armor"
            :source-image="armor.sourceImage"
            width="88"
            height="92"
          />
          <div class="armor-card-body">
            <span>{{ armor.englishName || armor.sourceKey || armor.textKey }}</span>
            <h3>{{ armor.displayName }}</h3>
            <p>{{ armorSummary(armor) }}</p>
            <div v-if="armor.benefitZh" class="armor-benefit-lines" aria-label="套装原始效果">
              <span v-for="line in benefitLines(armor)" :key="`${armor.id}-${line}`">{{ line }}</span>
            </div>
            <div v-if="shownEffects(armor).length" class="armor-effect-row">
              <span
                v-for="effect in shownEffects(armor)"
                :key="`${armor.id}-${effect.statKey}-${effect.rawText}`"
                :class="effectToneClass(effect)"
              >
                {{ effectLabel(effect) }}
              </span>
            </div>
          </div>
          <em>{{ armor.setCount ?? 1 }} 组</em>
        </NuxtLink>
        <article
          v-for="armor in armorDisplayItems.filter((entry) => !entry.armorSetId)"
          :key="armor.id"
          class="armor-card armor-card-live"
          :class="{ active: armor.id === featuredArmor?.id }"
        >
          <CommonPreviewImage
            :src="armor.image"
            :alt="armor.displayName"
            :fallback="armor.fallback"
            fallback-icon="icon-armor"
            :source-image="armor.sourceImage"
            width="88"
            height="92"
          />
          <div class="armor-card-body">
            <span>{{ armor.englishName || armor.sourceKey || armor.textKey }}</span>
            <h3>{{ armor.displayName }}</h3>
            <p>{{ armorSummary(armor) }}</p>
            <div v-if="armor.benefitZh" class="armor-benefit-lines" aria-label="套装原始效果">
              <span v-for="line in benefitLines(armor)" :key="`${armor.id}-${line}`">{{ line }}</span>
            </div>
            <div v-if="shownEffects(armor).length" class="armor-effect-row">
              <span
                v-for="effect in shownEffects(armor)"
                :key="`${armor.id}-${effect.statKey}-${effect.rawText}`"
                :class="effectToneClass(effect)"
              >
                {{ effectLabel(effect) }}
              </span>
            </div>
          </div>
          <em>{{ armor.setCount ?? 1 }} 组</em>
        </article>
      </section>

      <section v-else class="search-suggestion-band support-panel">
        <div>
          <b>{{ armorFallbackUnavailable ? '套装资料暂未载入' : '没有匹配套装' }}</b>
          <span>{{ armorFallbackUnavailable ? '当前套装资料暂未载入。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="armorFallbackUnavailable" class="small-button active" type="button" @click="refreshPublicArmorSets()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="resetArmorSearch">
          重置搜索
        </button>
      </section>

      <section class="armor-route-band">
        <a href="/items"><b>部件</b><span>头盔、胸甲、护腿</span></a>
        <a href="/buffs"><b>套装效果</b><span>防御、暴击、移速、仆从</span></a>
        <a href="/bosses"><b>推进阶段</b><span>Boss 后资源与制作站</span></a>
        <a href="/articles"><b>职业路线</b><span>近战、射手、法师、召唤</span></a>
      </section>

      <CommonPaginationDock
        :current-page="armorCurrentPage"
        :total-pages="armorTotalPages"
        :disabled="armorVisualLoading"
        aria-label="套装分页"
        jump-id="armor-page-jump"
        @page-change="goToArmorPage"
      />
    </main>

    <TerraFooter />
  </section>
</template>
