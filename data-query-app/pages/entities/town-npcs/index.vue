<template>
  <div class="page-wrap town-npc-index">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified workspace-hero--compact npc-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">TOWN NPC WORKBENCH</p>
          <h1 class="page-head__title">城镇 NPC 维护台</h1>
          <p class="page-head__subtitle">
            这里负责扫视维护状态、售卖概况和缺口。详情与编辑不再跳转独立页面，统一在卡片式工作台内完成。
          </p>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadOverview">
            <RefreshCw :size="15" />
            {{ loading ? '刷新中...' : '刷新概览' }}
          </button>
          <NuxtLink to="/entities/npcs" class="btn btn-strong">返回 NPC 管理</NuxtLink>
        </div>
      </div>
    </section>

    <section class="layout">
      <section class="main main--full">
        <section class="section-card workspace-panel">
          <div class="summary-ribbon">
            <article v-for="stat in summaryCards" :key="stat.label" class="metric-card">
              <span>{{ stat.label }}</span>
              <strong>{{ stat.value }}</strong>
              <small>{{ stat.help }}</small>
            </article>
          </div>
        </section>

        <section class="section-card workspace-panel">
          <div class="panel-head panel-head--split">
            <div>
              <h2 class="section-card__title">筛选与扫描</h2>
              <p class="section-card__subtitle">优先把有售卖物、缺口多、需要补数据的 NPC 放在前面。</p>
            </div>
            <div class="panel-head__meta">
              <span>{{ filteredRows.length }} / {{ rows.length }} 个 NPC</span>
              <small>{{ overview?.reportFileName || '未找到抓取报告' }}</small>
            </div>
          </div>

          <form class="filter-toolbar" @submit.prevent>
            <label class="field field--search">
              <span class="field__label">关键词</span>
              <div class="search-wrap">
                <Search :size="16" />
                <input
                  v-model.trim="search"
                  class="input input--search"
                  type="text"
                  placeholder="中文名、英文名、internalName、gameId"
                >
              </div>
            </label>

            <label class="field">
              <span class="field__label">缺口过滤</span>
              <button type="button" class="toggle-chip" :class="{ 'toggle-chip--active': gapsOnly }" @click="gapsOnly = !gapsOnly">
                {{ gapsOnly ? '仅看缺口项' : '显示全部' }}
              </button>
            </label>

            <label class="field">
              <span class="field__label">售卖物</span>
              <div class="chip-group">
                <button type="button" class="toggle-chip toggle-chip--compact" :class="{ 'toggle-chip--active': shopFilter === 'all' }" @click="shopFilter = 'all'">
                  全部
                </button>
                <button type="button" class="toggle-chip toggle-chip--compact" :class="{ 'toggle-chip--active': shopFilter === 'with_shop' }" @click="shopFilter = 'with_shop'">
                  有售卖物
                </button>
                <button type="button" class="toggle-chip toggle-chip--compact" :class="{ 'toggle-chip--active': shopFilter === 'without_shop' }" @click="shopFilter = 'without_shop'">
                  无售卖物
                </button>
              </div>
            </label>
          </form>
        </section>

        <section class="npc-grid">
          <article v-for="row in filteredRows" :key="row.id" class="npc-card" @dblclick="openWorkbench(row, 'detail')">
            <div class="npc-card__head">
              <div class="npc-card__identity">
                <div class="npc-card__portrait">
                  <img
                    v-if="row.imageUrl"
                    :src="row.imageUrl"
                    :alt="row.nameZh || row.name || row.internalName || 'NPC'"
                    class="npc-card__portrait-image"
                  >
                  <div v-else class="npc-card__portrait-fallback">{{ buildFallback(row) }}</div>
                </div>

                <div class="npc-card__titlebox">
                  <strong>{{ row.nameZh || row.name || row.internalName }}</strong>
                  <span>{{ row.name || row.internalName }}</span>
                  <small>#{{ row.gameId }}</small>
                </div>
              </div>

              <div class="npc-card__actions">
                <button type="button" class="ghost-action" @click="openWorkbench(row, 'detail')">
                  <Eye :size="15" />
                  详情
                </button>
                <button type="button" class="ghost-action ghost-action--primary" @click="openWorkbench(row, 'edit')">
                  <PencilLine :size="15" />
                  编辑
                </button>
              </div>
            </div>

            <div class="chip-row">
              <span class="info-chip">{{ row.gamePeriodLabel || '未设置时期' }}</span>
              <span class="info-chip info-chip--accent">{{ row.shopEntryCount || 0 }} 件售卖物</span>
              <span class="info-chip" :class="{ 'info-chip--warn': !row.hasBehaviorNotes }">
                {{ row.hasBehaviorNotes ? '描述已维护' : '缺描述' }}
              </span>
              <span v-if="row.matchedSuggestedShopEntryCount" class="info-chip info-chip--soft">
                Wiki 命中 {{ row.matchedSuggestedShopEntryCount }}
              </span>
            </div>

            <div class="stat-row">
              <span v-if="resolveNpcStat(row, 'damage') != null" class="stat-pill"><b>ATK</b><span>{{ resolveNpcStat(row, 'damage') }}</span></span>
              <span v-if="resolveNpcStat(row, 'lifeMax') != null" class="stat-pill"><b>HP</b><span>{{ resolveNpcStat(row, 'lifeMax') }}</span></span>
              <span v-if="resolveNpcStat(row, 'defense') != null" class="stat-pill"><b>DEF</b><span>{{ resolveNpcStat(row, 'defense') }}</span></span>
              <span v-if="resolveKnockBackResist(row)" class="stat-pill"><b>KB</b><span>{{ resolveKnockBackResist(row) }}</span></span>
            </div>

            <p class="npc-card__summary">
              {{ row.behaviorNotesPreview || row.scrapedFunctionSummary || '暂无功能描述' }}
            </p>

            <div class="shop-strip">
              <article v-for="(item, index) in row.currentShopItems?.slice(0, 3) || []" :key="`${row.id}-shop-${index}`" class="shop-pill">
                <div class="shop-pill__media">
                  <img v-if="item.image" :src="item.image" :alt="item.nameZh || item.name || item.internalName || 'item'" class="shop-pill__image">
                  <div v-else class="shop-pill__fallback">{{ buildItemFallback(item) }}</div>
                </div>

                <div class="shop-pill__body">
                  <strong>{{ item.nameZh || item.name || item.internalName }}</strong>
                  <div v-if="buildPriceVisual(item, coinIcons).length" class="price-row">
                    <span v-for="token in buildPriceVisual(item, coinIcons)" :key="`${item.itemId || item.name}-${token.unit}`" class="coin-chip">
                      <img v-if="token.icon" :src="token.icon" :alt="token.label" class="coin-chip__icon">
                      <span class="coin-chip__value">{{ token.amount }}</span>
                    </span>
                  </div>
                  <span v-else class="price-pill">{{ formatDisplayPrice(item, coinIcons) }}</span>
                </div>
              </article>

              <div v-if="!row.currentShopItems?.length" class="shop-strip__empty">暂无售卖物</div>
            </div>

            <div class="npc-card__foot">
              <span v-if="row.unmatchedShopItems?.length" class="footnote footnote--warn">
                未匹配 {{ row.unmatchedShopItems.length }} 项
              </span>
              <span class="footnote">{{ formatTime(row.updatedAt) }}</span>
            </div>
          </article>
        </section>

        <section v-if="!filteredRows.length" class="section-card workspace-panel empty-state">
          当前筛选条件下没有可显示的 Town NPC。
        </section>
      </section>
    </section>

    <TownNpcWorkbenchModal
      v-if="activeRow"
      v-model="workbenchVisible"
      :row="activeRow"
      :coin-icons="coinIcons"
      :mode="workbenchMode"
      @saved="handleWorkbenchSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { Eye, PencilLine, RefreshCw, Search } from 'lucide-vue-next'
import { showToast } from '~/composables/useToast'
import {
  buildFallback,
  buildItemFallback,
  buildPriceVisual,
  coinIconsFromOverview,
  fetchTownNpcOverview,
  formatDisplayPrice,
  formatNumber,
  formatTime,
  importSummaryFromOverview,
  isGapRow,
  resolveKnockBackResist,
  resolveNpcStat,
  rowsFromOverview,
  type TownNpcOverview,
  type TownNpcRow,
} from '~/composables/useTownNpcMaintenance'

definePageMeta({ title: '城镇 NPC 维护台', navSection: '/entities/town-npcs', headerVariant: 'compact' })

const loading = ref(false)
const search = ref('')
const gapsOnly = ref(false)
const shopFilter = ref<'all' | 'with_shop' | 'without_shop'>('with_shop')
const overview = ref<TownNpcOverview | null>(null)

const activeNpcId = ref<number | null>(null)
const workbenchVisible = ref(false)
const workbenchMode = ref<'detail' | 'edit'>('detail')

const rows = computed<TownNpcRow[]>(() => rowsFromOverview(overview.value))
const coinIcons = computed(() => coinIconsFromOverview(overview.value))
const importSummary = computed(() => importSummaryFromOverview(overview.value))
const summaryCards = computed(() => [
  { label: 'TOWN NPC', value: formatNumber(rows.value.length), help: '城镇 NPC 总数' },
  { label: 'WITH SHOP', value: formatNumber(rows.value.filter(row => row.hasShopEntries).length), help: '已有售卖关系' },
  { label: 'GAPS', value: formatNumber(rows.value.filter(row => isGapRow(row)).length), help: '时期 / 描述 / 售卖缺口' },
  { label: 'LINKS', value: formatNumber(importSummary.value.insertedShopEntryCount), help: '最近导入的 shop 关系' },
  { label: 'REBUILT', value: formatNumber(importSummary.value.replacedShopNpcCount), help: '最近重建的 NPC 数' },
])

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  const filtered = rows.value.filter((row) => {
    if (gapsOnly.value && !isGapRow(row)) return false
    if (shopFilter.value === 'with_shop' && !row.hasShopEntries) return false
    if (shopFilter.value === 'without_shop' && row.hasShopEntries) return false
    if (!keyword) return true
    return [row.nameZh, row.name, row.internalName, String(row.gameId || '')]
      .some(value => String(value || '').toLowerCase().includes(keyword))
  })

  return [...filtered].sort((left, right) => {
    const gapDiff = Number(isGapRow(right)) - Number(isGapRow(left))
    if (gapDiff !== 0) return gapDiff
    const shopDiff = Number(right.shopEntryCount || 0) - Number(left.shopEntryCount || 0)
    if (shopDiff !== 0) return shopDiff
    const noteDiff = Number(Boolean(left.hasBehaviorNotes)) - Number(Boolean(right.hasBehaviorNotes))
    if (noteDiff !== 0) return noteDiff
    return Number(left.id || 0) - Number(right.id || 0)
  })
})

const activeRow = computed(() => rows.value.find(row => Number(row.id) === Number(activeNpcId.value || 0)) || null)

onMounted(loadOverview)

async function loadOverview() {
  loading.value = true
  try {
    overview.value = await fetchTownNpcOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '加载城镇 NPC 维护台失败', 'error')
  } finally {
    loading.value = false
  }
}

function openWorkbench(row: TownNpcRow, mode: 'detail' | 'edit') {
  activeNpcId.value = Number(row.id)
  workbenchMode.value = mode
  workbenchVisible.value = true
}

async function handleWorkbenchSaved(npcId: number) {
  activeNpcId.value = npcId
  await loadOverview()
}
</script>

<style scoped>
.main--full {
  width: 100%;
}

.npc-hero {
  align-items: center;
}

.workspace-hero--compact {
  padding-bottom: 18px;
}

.summary-ribbon {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.metric-card,
.npc-card {
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
}

.metric-card {
  padding: 16px 18px;
  display: grid;
  gap: 6px;
}

.metric-card span,
.panel-head__meta small,
.footnote {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.metric-card strong {
  color: #0f172a;
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.metric-card small {
  color: #94a3b8;
  line-height: 1.5;
}

.panel-head {
  margin-bottom: 14px;
}

.panel-head--split {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.panel-head__meta {
  display: grid;
  justify-items: end;
  gap: 4px;
  color: #334155;
  font-weight: 700;
}

.filter-toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 1.1fr) minmax(180px, 0.5fr) minmax(280px, 0.9fr);
  gap: 14px;
}

.search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(255, 255, 255, 0.98);
  color: #64748b;
}

.input--search {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
}

.toggle-chip {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-weight: 700;
  cursor: pointer;
}

.toggle-chip--compact {
  flex: 1;
}

.toggle-chip--active {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.28);
  background: rgba(240, 253, 250, 0.96);
}

.chip-group {
  display: flex;
  gap: 8px;
}

.npc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.npc-card {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.npc-card__head,
.npc-card__identity,
.npc-card__actions,
.chip-row,
.stat-row,
.price-row,
.npc-card__foot {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.npc-card__head {
  justify-content: space-between;
  align-items: flex-start;
}

.npc-card__identity {
  min-width: 0;
  flex: 1;
}

.npc-card__portrait {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(249, 115, 22, 0.08));
  border: 1px solid rgba(191, 219, 254, 0.48);
}

.npc-card__portrait-image,
.shop-pill__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 8px;
}

.npc-card__portrait-fallback,
.shop-pill__fallback {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.94);
  color: #0f766e;
  font-weight: 800;
}

.npc-card__titlebox {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.npc-card__titlebox strong {
  color: #0f172a;
  font-size: 17px;
}

.npc-card__titlebox span,
.npc-card__titlebox small,
.npc-card__summary {
  color: #64748b;
}

.ghost-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-weight: 700;
  cursor: pointer;
}

.ghost-action--primary {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.28);
  background: rgba(240, 253, 250, 0.96);
}

.info-chip,
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: rgba(248, 250, 252, 0.96);
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.info-chip--accent {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.24);
  background: rgba(240, 253, 250, 0.96);
}

.info-chip--warn {
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(255, 251, 235, 0.96);
}

.info-chip--soft {
  color: #1d4ed8;
  border-color: rgba(96, 165, 250, 0.26);
  background: rgba(239, 246, 255, 0.98);
}

.stat-pill b,
.stat-pill span {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.npc-card__summary {
  margin: 0;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shop-strip {
  display: grid;
  gap: 10px;
}

.shop-pill {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.shop-pill__media {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.shop-pill__body {
  display: grid;
  gap: 6px;
}

.shop-pill__body strong {
  color: #0f172a;
  font-size: 14px;
  line-height: 1.3;
}

.shop-strip__empty,
.empty-state {
  color: #64748b;
  text-align: center;
}

.shop-strip__empty {
  padding: 8px 0 0;
}

.footnote--warn {
  color: #b45309;
}

.coin-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 4px 9px 4px 7px;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 255, 255, 0.98));
}

.coin-chip__icon {
  width: 15px;
  height: 15px;
  object-fit: contain;
}

.coin-chip__value {
  color: #7c2d12;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.price-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #b45309, #f59e0b);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

@media (max-width: 1180px) {
  .summary-ribbon,
  .filter-toolbar {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .summary-ribbon,
  .filter-toolbar,
  .npc-grid {
    grid-template-columns: 1fr;
  }

  .chip-group {
    flex-wrap: wrap;
  }

  .npc-card__head {
    flex-direction: column;
  }
}
</style>
