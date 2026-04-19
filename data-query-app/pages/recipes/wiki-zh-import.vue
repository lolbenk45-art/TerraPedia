<template>
  <div class="page-wrap import-page">
    <section class="workspace-shell workspace-shell--unified page-workspace">
      <div class="workspace-hero workspace-hero--unified import-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">WIKI_ZH RECIPE IMPORT</p>
          <h1 class="page-head__title">中文配方导入</h1>
          <p class="page-head__subtitle">查看 `wiki_zh` 配方入库状态、provider 优先级、gap-only 覆盖和制作站补齐情况，作为当前 recipe canonical 的后台验收面。</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadOverview">
            {{ loading ? '刷新中...' : '刷新概览' }}
          </button>
          <NuxtLink to="/recipes" class="btn btn-strong">回到配方管理</NuxtLink>
        </div>
      </div>

      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch" aria-label="配方模块视图切换">
          <NuxtLink to="/recipes" class="view-switch__link">配方编辑</NuxtLink>
          <NuxtLink to="/recipes/tree" class="view-switch__link">合成路径</NuxtLink>
          <NuxtLink to="/recipes/stations" class="view-switch__link">制作站管理</NuxtLink>
          <NuxtLink to="/recipes/groups" class="view-switch__link">任意物品组</NuxtLink>
          <NuxtLink to="/recipes/wiki-zh-import" class="view-switch__link view-switch__link--active">中文配方导入</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="layout">
      <section class="main main--full">
        <section class="section-card workspace-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">导入状态</h2>
              <p class="section-card__subtitle">报告文件和数据库双侧校验。报告来自本地导入脚本，数据库统计来自后台实时查询。</p>
            </div>
            <div class="meta-pills">
              <span class="meta-pill" :class="{ 'meta-pill--ok': overview?.reportFound }">{{ overview?.reportFound ? '已发现报告' : '未发现报告' }}</span>
              <span class="meta-pill">provider: {{ overview?.sourceProvider || 'wiki_zh' }}</span>
            </div>
          </div>

          <div v-if="overview" class="detail-grid">
            <article class="detail-card">
              <span class="detail-card__label">最新报告</span>
              <strong>{{ overview.reportFileName || '未生成' }}</strong>
              <small>{{ overview.reportUpdatedAt || '暂无时间戳' }}</small>
              <code v-if="overview.reportPath">{{ overview.reportPath }}</code>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">数据库配方数</span>
              <strong>{{ formatNumber(database.recipeCount) }}</strong>
              <small>当前 `recipes.source_provider = wiki_zh`</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">活跃配方数</span>
              <strong>{{ formatNumber(database.activeRecipeCount) }}</strong>
              <small>`wiki_zh` 且 `status = 1`</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">结果物数量</span>
              <strong>{{ formatNumber(database.resultItemCount) }}</strong>
              <small>去重后的 result_item_id</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">活跃结果物</span>
              <strong>{{ formatNumber(database.activeResultItemCount) }}</strong>
              <small>当前真正由 `wiki_zh` 提供有效配方的结果物</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">占位物品数</span>
              <strong>{{ formatNumber(database.placeholderItemCount) }}</strong>
              <small>仅用于补齐当前库缺失项</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">条件行数</span>
              <strong>{{ formatNumber(database.conditionRowCount) }}</strong>
              <small>`recipe_context_requirements` 活跃行数</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">引用条件数</span>
              <strong>{{ formatNumber(database.referencedConditionCount) }}</strong>
              <small>`ref_type + ref_id` 去重计数</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">引用制作站数</span>
              <strong>{{ formatNumber(database.referencedStationCount) }}</strong>
              <small>`recipe_stations.station_id` 去重计数</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">残留空洞</span>
              <strong>{{ formatNumber(database.unresolvedIngredientRows + database.unresolvedStationRows) }}</strong>
              <small>原料空洞 {{ formatNumber(database.unresolvedIngredientRows) }} / 站点空洞 {{ formatNumber(database.unresolvedStationRows) }}</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">被上位 provider 覆盖</span>
              <strong>{{ formatNumber(database.suppressedOverlapRecipeCount) }}</strong>
              <small>`wiki_zh` 已写入但当前不作为 top provider 的 recipe</small>
            </article>
            <article class="detail-card">
              <span class="detail-card__label">gap-only 结果物</span>
              <strong>{{ formatNumber(database.gapOnlyActiveResultItemCount) }}</strong>
              <small>当前只能依赖 `wiki_zh` 的活跃结果物</small>
            </article>
          </div>

          <AppEmptyState
            v-else-if="!loading"
            icon="ZH"
            title="尚未加载到中文配方导入概览"
            description="点击刷新概览，确认后台接口和本地导入报告都可读取。"
          />
        </section>

        <div class="import-columns">
          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">导入摘要</h2>
                <p class="section-card__subtitle">这里直接读取最近一次导入脚本写出的报告文件。</p>
              </div>
            </div>

            <div v-if="report" class="kv-list">
              <div class="kv-row">
                <span>输入页面</span>
                <strong>{{ formatNumber(report.inputPages) }}</strong>
              </div>
              <div class="kv-row">
                <span>输入配方</span>
                <strong>{{ formatNumber(report.inputRecipes) }}</strong>
              </div>
              <div class="kv-row">
                <span>导入配方</span>
                <strong>{{ formatNumber(report.insertedRecipes) }}</strong>
              </div>
              <div class="kv-row">
                <span>原料行</span>
                <strong>{{ formatNumber(report.insertedIngredientRows) }}</strong>
              </div>
              <div class="kv-row">
                <span>制作站行</span>
                <strong>{{ formatNumber(report.insertedStationRows) }}</strong>
              </div>
              <div class="kv-row">
                <span>任意物品组行</span>
                <strong>{{ formatNumber(report.groupIngredientRows) }}</strong>
              </div>
              <div class="kv-row">
                <span>复用现有物品</span>
                <strong>{{ formatNumber(report.reusedItemsByZhOrEn) }}</strong>
              </div>
              <div class="kv-row">
                <span>langlink 解析命中</span>
                <strong>{{ formatNumber(report.resolvedViaLanglink) }}</strong>
              </div>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="RP"
              title="未找到最近一次导入报告"
              description="数据库里可能已经有数据，但后台当前还没有找到本地报告文件。"
            />
          </section>

          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">热门来源页</h2>
                <p class="section-card__subtitle">按 `source_page` 聚合，方便从后台识别配方密度最高的页面。</p>
              </div>
            </div>

            <div v-if="topSourcePages.length" class="list-table">
              <article v-for="(entry, index) in topSourcePages" :key="entry.sourcePage || `source-${index}`" class="list-table__row">
                <div>
                  <strong>{{ entry.sourcePage }}</strong>
                  <small>{{ formatNumber(entry.resultItemCount) }} 个结果物</small>
                </div>
                <span class="list-table__metric">{{ formatNumber(entry.recipeCount) }}</span>
              </article>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="PG"
              title="暂无来源页统计"
              description="当前库里还没有 `wiki_zh` 配方，或统计尚未写入。"
            />
          </section>
        </div>

        <div class="import-columns">
          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">结果物 provider 优先级</h2>
                <p class="section-card__subtitle">按 result item 的 top provider 聚合，判断当前 canonical 主体究竟落在哪个 provider。</p>
              </div>
            </div>

            <div v-if="topProviderResultItemDistribution.length" class="list-table">
              <article v-for="(entry, index) in topProviderResultItemDistribution" :key="entry.provider || `provider-${index}`" class="list-table__row">
                <div>
                  <strong>{{ entry.provider || '(empty)' }}</strong>
                  <small>{{ formatNumber(entry.resultItemCount) }} 个结果物</small>
                </div>
                <span class="list-table__metric">{{ formatNumber(entry.resultItemCount) }}</span>
              </article>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="PR"
              title="暂无 provider 优先级分布"
              description="当前库里还没有足够的 recipe provider 统计。"
            />
          </section>

          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">活跃配方 provider 分布</h2>
                <p class="section-card__subtitle">只看 `status = 1` 的有效 recipe，确认 `wiki_zh` 目前处在补洞还是主供给位置。</p>
              </div>
            </div>

            <div v-if="activeRecipeDistribution.length" class="list-table">
              <article v-for="(entry, index) in activeRecipeDistribution" :key="entry.provider || `active-provider-${index}`" class="list-table__row">
                <div>
                  <strong>{{ entry.provider || '(empty)' }}</strong>
                  <small>{{ formatNumber(entry.resultItemCount) }} 个结果物</small>
                </div>
                <span class="list-table__metric">{{ formatNumber(entry.recipeCount) }}</span>
              </article>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="AC"
              title="暂无活跃配方分布"
              description="当前还没有可用的活跃 recipe provider 统计。"
            />
          </section>
        </div>

        <div class="import-columns">
          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">占位物品</h2>
                <p class="section-card__subtitle">这些是当前库缺失、导入时被自动补齐的最小物品记录。</p>
              </div>
            </div>

            <div v-if="placeholderItems.length" class="list-table">
              <article v-for="(item, index) in placeholderItems" :key="item.id ?? `placeholder-${index}`" class="list-table__row">
                <div>
                  <strong>{{ item.nameZh || item.name || item.internalName }}</strong>
                  <small>{{ item.name || item.internalName }}</small>
                </div>
                <span class="list-table__metric">#{{ item.id }}</span>
              </article>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="IT"
              title="没有占位物品"
              description="当前导入已完全命中现有物品库，未额外插入补齐项。"
            />
          </section>

          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">活跃来源页</h2>
                <p class="section-card__subtitle">只看当前活跃 recipe，判断哪些 `source_page` 仍在支撑现在的 recipe canonical。</p>
              </div>
            </div>

            <div v-if="activeTopSourcePages.length" class="list-table">
              <article v-for="(entry, index) in activeTopSourcePages" :key="entry.sourcePage || `active-source-${index}`" class="list-table__row">
                <div>
                  <strong>{{ entry.sourcePage }}</strong>
                  <small>{{ formatNumber(entry.resultItemCount) }} 个结果物</small>
                </div>
                <span class="list-table__metric">{{ formatNumber(entry.recipeCount) }}</span>
              </article>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="AP"
              title="暂无活跃来源页统计"
              description="当前库里还没有可用的活跃 `source_page` 聚合。"
            />
          </section>

          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">本次补齐的制作站</h2>
                <p class="section-card__subtitle">优先复用已有站点；只有后台缺站时才自动补齐。</p>
              </div>
            </div>

            <div v-if="createdStations.length" class="list-table">
              <article v-for="(station, index) in createdStations" :key="station.id || station.internalName || station.nameZh || `station-${index}`" class="list-table__row">
                <div>
                  <strong>{{ station.nameZh || station.nameEn || station.internalName }}</strong>
                  <small>{{ station.nameEn || station.internalName || '未命名站点' }}</small>
                </div>
                <span class="list-table__metric">{{ station.itemId ? `item ${station.itemId}` : `#${station.id}` }}</span>
              </article>
            </div>

            <AppEmptyState
              v-else-if="!loading"
              icon="ST"
              title="没有新增制作站"
              description="当前导入已经完全命中现有 crafting_stations。"
            />
          </section>
        </div>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { showToast } from '~/composables/useToast'
import { get } from '~/composables/useApi'
import type {
  RecipeImportDistributionEntry,
  RecipeImportOverview,
  RecipeImportSourcePageEntry,
} from '~/types/recipeImport'

definePageMeta({ title: '中文配方导入', navSection: '/recipes', headerVariant: 'compact' })

const loading = ref(false)
const overview = ref<RecipeImportOverview | null>(null)

const report = computed<Record<string, any>>(() => overview.value?.latestReport || {})
const database = computed(() => ({
  recipeCount: Number(overview.value?.database?.recipeCount || 0),
  activeRecipeCount: Number(overview.value?.database?.activeRecipeCount || 0),
  resultItemCount: Number(overview.value?.database?.resultItemCount || 0),
  activeResultItemCount: Number(overview.value?.database?.activeResultItemCount || 0),
  placeholderItemCount: Number(overview.value?.database?.placeholderItemCount || 0),
  conditionRowCount: Number(overview.value?.database?.conditionRowCount || 0),
  referencedConditionCount: Number(overview.value?.database?.referencedConditionCount || 0),
  referencedStationCount: Number(overview.value?.database?.referencedStationCount || 0),
  unresolvedIngredientRows: Number(overview.value?.database?.unresolvedIngredientRows || 0),
  unresolvedStationRows: Number(overview.value?.database?.unresolvedStationRows || 0),
  suppressedOverlapRecipeCount: Number(overview.value?.database?.suppressedOverlapRecipeCount || 0),
  gapOnlyActiveRecipeCount: Number(overview.value?.database?.gapOnlyActiveRecipeCount || 0),
  gapOnlyActiveResultItemCount: Number(overview.value?.database?.gapOnlyActiveResultItemCount || 0),
}))
const topSourcePages = computed<RecipeImportSourcePageEntry[]>(() => Array.isArray(overview.value?.topSourcePages) ? overview.value!.topSourcePages! : [])
const activeTopSourcePages = computed<RecipeImportSourcePageEntry[]>(() => Array.isArray(overview.value?.activeTopSourcePages) ? overview.value!.activeTopSourcePages! : [])
const topProviderResultItemDistribution = computed<RecipeImportDistributionEntry[]>(() =>
  Array.isArray(overview.value?.topProviderResultItemDistribution) ? overview.value!.topProviderResultItemDistribution! : [])
const activeRecipeDistribution = computed<RecipeImportDistributionEntry[]>(() =>
  Array.isArray(overview.value?.activeRecipeDistribution) ? overview.value!.activeRecipeDistribution! : [])
const placeholderItems = computed(() => Array.isArray(overview.value?.placeholderItems) ? overview.value!.placeholderItems! : [])
const createdStations = computed(() => Array.isArray(report.value?.createdStations) ? report.value.createdStations : [])

const summaryCards = computed(() => [
  { label: 'ACTIVE RECIPES', value: formatNumber(database.value.activeRecipeCount) },
  { label: 'ACTIVE RESULTS', value: formatNumber(database.value.activeResultItemCount) },
  { label: 'GAP-ONLY', value: formatNumber(database.value.gapOnlyActiveResultItemCount) },
  { label: 'OVERLAP', value: formatNumber(database.value.suppressedOverlapRecipeCount) },
  { label: 'PLACEHOLDERS', value: formatNumber(database.value.placeholderItemCount) },
  { label: 'CONDITIONS', value: formatNumber(database.value.conditionRowCount) },
  { label: 'UNRESOLVED', value: formatNumber(database.value.unresolvedIngredientRows + database.value.unresolvedStationRows) },
])

onMounted(() => {
  loadOverview()
})

async function loadOverview() {
  loading.value = true
  try {
    const response: any = await get('/admin/recipe-imports/wiki-zh')
    overview.value = (response?.data ?? response) || null
  } catch (error: any) {
    console.error('Failed to load wiki zh recipe import overview:', error)
    showToast(error?.data?.message || error?.message || '加载中文配方导入概览失败', 'error')
  } finally {
    loading.value = false
  }
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : '0'
}
</script>

<style scoped>
.main--full {
  width: 100%;
}

.import-hero {
  align-items: flex-start;
}

.import-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.detail-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 247, 251, 0.9));
  border: 1px solid rgba(160, 174, 192, 0.2);
}

.detail-card__label {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #617287;
}

.detail-card strong {
  font-size: 22px;
  color: #172230;
}

.detail-card small,
.detail-card code {
  color: #5f6f82;
  font-size: 13px;
}

.meta-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.meta-pill {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(233, 239, 246, 0.9);
  color: #314154;
  font-size: 13px;
  font-weight: 600;
}

.meta-pill--ok {
  background: rgba(220, 252, 231, 0.9);
  color: #166534;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(215, 223, 233, 0.8);
}

.kv-row:last-child {
  border-bottom: none;
}

.kv-row span {
  color: #607086;
}

.kv-row strong {
  color: #162131;
}

.list-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-table__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(245, 248, 252, 0.88);
  border: 1px solid rgba(212, 220, 230, 0.7);
}

.list-table__row strong {
  display: block;
  color: #162131;
}

.list-table__row small {
  color: #66778d;
}

.list-table__metric {
  flex-shrink: 0;
  font-weight: 700;
  color: #274567;
}

@media (max-width: 1080px) {
  .detail-grid,
  .import-columns {
    grid-template-columns: 1fr;
  }
}
</style>
