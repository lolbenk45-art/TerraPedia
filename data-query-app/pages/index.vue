<template>
  <div class="page-wrap page-workspace dashboard">
    <!-- Hero 概览带 -->
    <section class="workspace-shell workspace-shell--unified dashboard__hero">
      <div class="workspace-hero workspace-hero--unified">
        <div class="workspace-hero__copy">
          <p class="dashboard__eyebrow items-hero__eyebrow">概览</p>
          <h1 class="page-head__title">{{ greeting }}，欢迎回来</h1>
          <p class="page-head__subtitle">
            TerraPedia 数据管理后台 · 一处掌握词条、实体、内容与制作流的最新规模。
          </p>

          <div class="dashboard__hero-actions">
            <NuxtLink to="/items" class="btn btn-secondary">
              <Package :size="16" />
              <span>物品管理</span>
            </NuxtLink>
            <NuxtLink to="/recipes" class="btn btn-primary">
              <Hammer :size="16" />
              <span>配方工作区</span>
            </NuxtLink>
          </div>
        </div>

        <div class="workspace-summary-grid dashboard__hero-summary">
          <article class="hero-stat">
            <span class="hero-stat__label">词条总量</span>
            <strong class="hero-stat__value">{{ formatNumber(totalItemCount) }}</strong>
          </article>
          <article class="hero-stat">
            <span class="hero-stat__label">实体总量</span>
            <strong class="hero-stat__value">{{ formatNumber(statisticsStore.totalEntities) }}</strong>
          </article>
          <article class="hero-stat">
            <span class="hero-stat__label">已发布内容</span>
            <strong class="hero-stat__value">{{ formatNumber(overview.totalPublishedArticles) }}</strong>
          </article>
        </div>
      </div>
    </section>

    <!-- 核心指标 -->
    <div class="kpi-grid">
      <article v-for="stat in kpiStats" :key="stat.label" class="kpi-card">
        <div class="kpi-card__top">
          <span class="kpi-card__icon" :style="{ '--stat-gradient': stat.gradient }">
            <component :is="stat.icon" :size="22" />
          </span>
          <NuxtLink :to="stat.to" class="kpi-card__link" :aria-label="`前往${stat.label}`">
            <ArrowUpRight :size="16" />
          </NuxtLink>
        </div>
        <strong class="kpi-card__value">{{ formatNumber(stat.value) }}</strong>
        <span class="kpi-card__label">{{ stat.label }}</span>
        <small class="kpi-card__hint">{{ stat.hint }}</small>
      </article>
    </div>

    <!-- 数据全景 -->
    <section class="section-card panorama">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">数据全景</h3>
          <p class="section-card__subtitle">按业务板块汇总各数据集规模，点击即可进入对应管理页。</p>
        </div>
      </div>

      <div class="panorama__groups">
        <div v-for="group in entityPanorama" :key="group.label" class="panorama__group">
          <div class="panorama__group-head">
            <span class="panorama__group-label">{{ group.label }}</span>
            <span class="panorama__group-rule" />
          </div>
          <div class="panorama__grid">
            <NuxtLink v-for="tile in group.tiles" :key="tile.to" :to="tile.to" class="panorama-tile">
              <span class="panorama-tile__icon">
                <component :is="tile.icon" :size="18" />
              </span>
              <span class="panorama-tile__body">
                <strong class="panorama-tile__value">{{ formatNumber(tile.value) }}</strong>
                <small class="panorama-tile__label">{{ tile.label }}</small>
              </span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- 分类分布 + 快捷工作区 -->
    <div class="dashboard__split">
      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">分类分布</h3>
            <p class="section-card__subtitle">收录物品最多的根分类，掌握目录的重心。</p>
          </div>
        </div>

        <div v-if="statisticsStore.loading" class="loading-placeholder">加载中...</div>
        <div v-else-if="distribution.length" class="dist">
          <div v-for="row in distribution" :key="row.categoryId" class="dist__row">
            <div class="dist__head">
              <span class="dist__name">{{ row.name }}</span>
              <span class="dist__count">{{ formatNumber(row.count) }}</span>
            </div>
            <div class="dist__track">
              <span class="dist__fill" :style="{ width: row.percent + '%' }" />
            </div>
          </div>
        </div>
        <p v-else class="empty-text">暂无分类统计数据</p>
      </section>

      <section class="section-card quick-section">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">快捷工作区</h3>
            <p class="section-card__subtitle">高频维护动作收拢一处，减少导航切换。</p>
          </div>
        </div>

        <div class="quick-actions">
          <NuxtLink v-for="action in quickActions" :key="action.to" :to="action.to" class="quick-action">
            <span class="quick-action__icon">
              <component :is="action.icon" :size="20" />
            </span>
            <span class="quick-action__body">
              <strong>{{ action.label }}</strong>
              <small>{{ action.description }}</small>
            </span>
            <ArrowRight class="quick-action__arrow" :size="16" />
          </NuxtLink>
        </div>
      </section>
    </div>

    <!-- 数据运维入口 -->
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">数据运维</h3>
          <p class="section-card__subtitle">爬取、验收与审计工作台的快速入口。</p>
        </div>
      </div>

      <div class="ops-grid">
        <NuxtLink v-for="ops in opsLinks" :key="ops.to" :to="ops.to" class="ops-card">
          <span class="ops-card__icon">
            <component :is="ops.icon" :size="18" />
          </span>
          <span class="ops-card__body">
            <strong>{{ ops.label }}</strong>
            <small>{{ ops.description }}</small>
          </span>
          <ArrowRight class="ops-card__arrow" :size="16" />
        </NuxtLink>
      </div>
    </section>

    <!-- 最近动态 -->
    <div class="dashboard__recent">
      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">最近物品</h3>
            <p class="section-card__subtitle">最新录入的物品优先显示，便于即时核对。</p>
          </div>
          <NuxtLink to="/items" class="btn-link">查看全部</NuxtLink>
        </div>

        <div v-if="itemsStore.loading" class="loading-placeholder">加载中...</div>
        <template v-else>
          <table v-if="recentItems.length" class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>分类</th>
                <th>稀有度</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in recentItems" :key="row.id" @click="viewItem(row)">
                <td>#{{ row.id }}</td>
                <td>{{ row.name }}</td>
                <td>
                  <span v-if="row.categoryId" class="tag tag--info">{{ categoriesStore.getCategoryNameById(row.categoryId) }}</span>
                  <span v-else>--</span>
                </td>
                <td>
                  <span class="tag" :class="getRarityPresentation(row).tagClass">{{ getRarityPresentation(row).label }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-text">暂无数据</p>
        </template>
      </section>

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">最近文章</h3>
            <p class="section-card__subtitle">按更新时间排序的内容，便于跟进发布与审核。</p>
          </div>
          <NuxtLink to="/articles" class="btn-link">查看全部</NuxtLink>
        </div>

        <div v-if="articlesStore.loading" class="loading-placeholder">加载中...</div>
        <template v-else>
          <ul v-if="recentArticles.length" class="article-list">
            <li v-for="article in recentArticles" :key="article.id">
              <NuxtLink to="/articles" class="article-row">
                <span class="article-row__body">
                  <strong class="article-row__title">{{ article.title }}</strong>
                  <span class="article-row__meta">
                    <span class="article-row__metric"><Eye :size="13" /> {{ formatNumber(article.viewCount ?? 0) }}</span>
                    <span class="article-row__metric"><MessageSquareText :size="13" /> {{ formatNumber(article.commentCount ?? 0) }}</span>
                    <span class="article-row__date">{{ formatDate(article.updatedAt) }}</span>
                  </span>
                </span>
                <span class="tag" :class="articleStatusTag(article.status).tagClass">
                  {{ articleStatusTag(article.status).label }}
                </span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="empty-text">暂无文章</p>
        </template>
      </section>
    </div>

    <AppModal v-model="detailVisible" title="物品详情" width="560px">
      <ItemDetail v-if="selectedItem" :item="selectedItem" />
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="detailVisible = false">关闭</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  Crown,
  Crosshair,
  Eye,
  FileSearch,
  FlaskConical,
  FolderTree,
  Hammer,
  MessageSquareText,
  Newspaper,
  Package,
  Shield,
  ShieldCheck,
  Trees,
  Users,
} from 'lucide-vue-next'
import type { ArticleStatus } from '~/stores/articles'
import { getRarityPresentation } from '~/utils/rarity'

type KpiStat = {
  label: string
  value: number | string
  hint: string
  gradient: string
  icon: Component
  to: string
}

type PanoramaTile = {
  to: string
  label: string
  value: number
  icon: Component
}

type PanoramaGroup = {
  label: string
  tiles: PanoramaTile[]
}

type QuickAction = {
  to: string
  label: string
  description: string
  icon: Component
}

const itemsStore = useItemsStore()
const categoriesStore = useCategoriesStore()
const statisticsStore = useStatisticsStore()
const articlesStore = useArticlesStore()

const detailVisible = ref(false)
const selectedItem = ref<any>(null)

const overview = computed(() => statisticsStore.overview)
const recentItems = computed(() => itemsStore.items?.slice(0, 5) ?? [])
const recentArticles = computed(() => articlesStore.articles?.slice(0, 5) ?? [])

const totalItemCount = computed(() => overview.value.totalItems || itemsStore.totalItems)
const totalCategoryCount = computed(() => overview.value.totalCategories || categoriesStore.categoryOptions.length)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const kpiStats = computed<KpiStat[]>(() => [
  {
    icon: Package,
    value: totalItemCount.value,
    label: '物品总数',
    hint: '已收录的物品主数据',
    gradient: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
    to: '/items',
  },
  {
    icon: FolderTree,
    value: totalCategoryCount.value,
    label: '分类总数',
    hint: `${statisticsStore.rootCategoryCount} 个根分类`,
    gradient: 'linear-gradient(135deg, var(--color-info) 0%, color-mix(in srgb, var(--color-info) 65%, var(--color-bg-secondary)) 100%)',
    to: '/categories',
  },
  {
    icon: Newspaper,
    value: overview.value.totalPublishedArticles,
    label: '已发布文章',
    hint: '面向前台的已发布内容',
    gradient: 'linear-gradient(135deg, var(--color-warning) 0%, color-mix(in srgb, var(--color-warning) 65%, var(--color-bg-secondary)) 100%)',
    to: '/articles',
  },
  {
    icon: Shield,
    value: statisticsStore.totalEntities,
    label: '实体总量',
    hint: 'Boss / NPC / Buff / 群系 / 套装 / 射弹',
    gradient: 'linear-gradient(135deg, var(--color-secondary) 0%, var(--color-primary) 100%)',
    to: '/entities/bosses',
  },
])

const entityPanorama = computed<PanoramaGroup[]>(() => [
  {
    label: '资料目录',
    tiles: [
      { to: '/items', label: '物品', value: overview.value.totalItems, icon: Package },
      { to: '/categories', label: '分类', value: overview.value.totalCategories, icon: FolderTree },
      { to: '/entities/armor-sets', label: '套装', value: overview.value.totalArmorSets, icon: Shield },
    ],
  },
  {
    label: '实体管理',
    tiles: [
      { to: '/entities/bosses', label: 'Boss', value: overview.value.totalBosses, icon: Crown },
      { to: '/entities/npcs', label: 'NPC', value: overview.value.totalNpcs, icon: Users },
      { to: '/entities/buffs', label: 'Buff', value: overview.value.totalBuffs, icon: FlaskConical },
      { to: '/entities/projectiles', label: '射弹', value: overview.value.totalProjectiles, icon: Crosshair },
    ],
  },
  {
    label: '世界数据',
    tiles: [
      { to: '/entities/biomes', label: '群系', value: overview.value.totalBiomes, icon: Trees },
    ],
  },
  {
    label: '内容运营',
    tiles: [
      { to: '/articles', label: '已发布文章', value: overview.value.totalPublishedArticles, icon: Newspaper },
    ],
  },
])

const distribution = computed(() => {
  const rows = [...overview.value.rootCategoryCounts]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
  const max = rows[0]?.count ?? 0
  return rows.map((row) => ({
    categoryId: row.categoryId,
    name: row.name || `分类 #${row.categoryId}`,
    count: row.count,
    percent: max > 0 ? Math.max(6, Math.round((row.count / max) * 100)) : 0,
  }))
})

const quickActions: QuickAction[] = [
  { to: '/items', label: '物品管理', description: '维护名称、图片、分类与展示状态。', icon: Package },
  { to: '/categories', label: '分类管理', description: '定位树节点并维护层级结构。', icon: FolderTree },
  { to: '/recipes', label: '配方管理', description: '集中编辑配方与制作路径。', icon: Hammer },
  { to: '/entities/town-npcs', label: '城镇 NPC 维护', description: '时期、功能与商店维护。', icon: Users },
  { to: '/articles', label: '文章管理', description: '内容创作、审核与发布。', icon: Newspaper },
  { to: '/operations/crawler-monitor', label: '爬取监控', description: '刷新进度与运行日志。', icon: Activity },
]

const opsLinks: QuickAction[] = [
  { to: '/operations/crawler-monitor', label: '爬取监控', description: '查看刷新进度与运行日志', icon: Activity },
  { to: '/operations/data-source-acceptance', label: '数据源验收', description: '数据源替换准入状态', icon: ShieldCheck },
  { to: '/operations/domain-acceptance', label: 'B 档域验收', description: 'B 档域自动维护证据', icon: ShieldCheck },
  { to: '/operations/classification-audit', label: '分类审计', description: '分类缺口与引用异常', icon: FileSearch },
]

function articleStatusTag(status: ArticleStatus) {
  switch (status) {
    case 'PUBLISHED':
      return { label: '已发布', tagClass: 'tag--emerald' }
    case 'OFFLINE':
      return { label: '已下线', tagClass: 'tag--amber' }
    case 'DRAFT':
    default:
      return { label: '草稿', tagClass: 'tag--slate' }
  }
}

function formatNumber(value: number | string | undefined) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num.toLocaleString('zh-CN') : String(value ?? '--')
}

function formatDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function viewItem(item: any) {
  selectedItem.value = item
  detailVisible.value = true
}

onMounted(async () => {
  articlesStore.sortBy = 'updatedAt'
  await Promise.allSettled([
    itemsStore.fetchItems(1, 5),
    categoriesStore.fetchCategories(),
    statisticsStore.fetchOverview(),
    articlesStore.fetchArticles(1, 5),
  ])
})
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 20px;
}

.dashboard__hero {
  margin-bottom: 0;
}

.dashboard__hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.dashboard__hero-summary {
  --workspace-hero-summary-min: 132px;
}

/* 核心指标 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.kpi-card {
  display: grid;
  gap: 6px;
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-surface-1) 98%, transparent),
    color-mix(in srgb, var(--color-surface-2) 92%, transparent)
  );
  box-shadow: var(--shadow-surface-1);
  transition:
    transform var(--transition-base) var(--ease-standard),
    box-shadow var(--transition-base) var(--ease-standard),
    border-color var(--transition-base) var(--ease-standard);
}

.kpi-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  box-shadow: var(--shadow-lg);
}

.kpi-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.kpi-card__icon {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: #fff;
  background: var(--stat-gradient);
  box-shadow: 0 20px 28px -22px color-mix(in srgb, var(--color-primary) 60%, transparent);
}

.kpi-card__link {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-bg-tertiary) 70%, transparent);
  transition: color var(--transition-fast) var(--ease-standard), background-color var(--transition-fast) var(--ease-standard);
}

.kpi-card:hover .kpi-card__link {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary));
}

.kpi-card__value {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 1.4rem + 0.5vw, 2.1rem);
  font-weight: 700;
  line-height: 1.05;
  color: var(--color-text);
}

.kpi-card__label {
  color: var(--color-text);
  font-size: 0.94rem;
  font-weight: 600;
}

.kpi-card__hint {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

/* 数据全景 */
.panorama {
  padding: 18px;
}

.panorama .section-card__header {
  margin-bottom: 14px;
}

.panorama__groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  align-items: start;
}

.panorama__group {
  min-width: 0;
}

.panorama__group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.panorama__group-label {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panorama__group-rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--color-border) 80%, transparent), transparent);
}

.panorama__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.panorama-tile {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 52px;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  background: color-mix(in srgb, var(--color-bg) 70%, var(--color-bg-secondary));
  text-decoration: none;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard);
}

.panorama-tile:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary));
  box-shadow: var(--shadow-md);
}

.panorama-tile__icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
}

.panorama-tile__body {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.panorama-tile__value {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text);
}

.panorama-tile__label {
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  line-height: 1.2;
}

/* 两列布局 */
.dashboard__split {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 20px;
}

.dashboard__split .section-card {
  margin-bottom: 0;
}

/* 分类分布 */
.dist {
  display: grid;
  gap: 13px;
}

.dist__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
}

.dist__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 600;
}

.dist__count {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 700;
}

.dist__track {
  height: 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-border) 60%, transparent);
  overflow: hidden;
}

.dist__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
  transition: width var(--transition-slow) var(--ease-emphasis);
}

/* 快捷工作区 */
.quick-section .section-card__header {
  margin-bottom: 14px;
}

.quick-actions {
  display: grid;
  gap: 9px;
}

.quick-action {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 64px;
  padding: 11px 12px;
  border-radius: 13px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg) 80%, var(--color-bg-secondary));
  text-decoration: none;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard);
}

.quick-action:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
  box-shadow: var(--shadow-md);
}

.quick-action__icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
}

.quick-action__body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}

.quick-action__body strong {
  color: var(--color-text);
  font-size: 0.9rem;
  line-height: 1.2;
}

.quick-action__body small {
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  line-height: 1.35;
}

.quick-action__arrow {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard);
}

.quick-action:hover .quick-action__arrow {
  transform: translateX(4px);
  color: var(--color-primary);
}

/* 运维入口 */
.ops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}

.ops-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 11px 13px;
  border-radius: 13px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  background: color-mix(in srgb, var(--color-bg) 78%, var(--color-bg-secondary));
  text-decoration: none;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard);
}

.ops-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary));
  box-shadow: var(--shadow-md);
}

.ops-card__icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  color: var(--color-info);
  background: var(--color-info-muted);
}

.ops-card__body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}

.ops-card__body strong {
  color: var(--color-text);
  font-size: 0.9rem;
  line-height: 1.2;
}

.ops-card__body small {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  line-height: 1.4;
}

.ops-card__arrow {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard);
}

.ops-card:hover .ops-card__arrow {
  transform: translateX(4px);
  color: var(--color-primary);
}

/* 最近动态 */
.dashboard__recent {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}

.dashboard__recent .section-card {
  margin-bottom: 0;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 13px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  text-align: left;
  vertical-align: middle;
}

.data-table th {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.data-table tbody tr {
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--ease-standard);
}

.data-table tbody tr:hover {
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary));
}

.article-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.article-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 14px;
  border-radius: 13px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  background: color-mix(in srgb, var(--color-bg) 76%, var(--color-bg-secondary));
  text-decoration: none;
  transition:
    border-color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard);
}

.article-row:hover {
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary));
}

.article-row__body {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.article-row__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: 0.92rem;
  font-weight: 600;
}

.article-row__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.article-row__metric {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.article-row__date {
  color: var(--color-text-muted);
}

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
}

.tag--info { background: color-mix(in srgb, var(--color-info) 12%, var(--color-bg-secondary)); color: color-mix(in srgb, var(--color-info) 60%, var(--color-text)); }
.tag--slate { background: color-mix(in srgb, var(--color-secondary) 12%, var(--color-bg-secondary)); color: color-mix(in srgb, var(--color-secondary) 60%, var(--color-text)); }
.tag--emerald { background: color-mix(in srgb, var(--color-success) 12%, var(--color-bg-secondary)); color: color-mix(in srgb, var(--color-success) 60%, var(--color-text)); }
.tag--sky { background: color-mix(in srgb, var(--color-info) 12%, var(--color-bg-secondary)); color: color-mix(in srgb, var(--color-info) 60%, var(--color-text)); }
.tag--violet { background: #ede9fe; color: #6d28d9; }
.tag--amber { background: color-mix(in srgb, var(--color-warning) 12%, var(--color-bg-secondary)); color: color-mix(in srgb, var(--color-warning) 60%, var(--color-text)); }
.tag--fuchsia { background: #fae8ff; color: #a21caf; }
.tag--rose { background: #ffe4e6; color: #be123c; }
.tag--orange { background: #ffedd5; color: #c2410c; }
.tag--cyan { background: #cffafe; color: #0e7490; }
.tag--red { background: color-mix(in srgb, var(--color-danger) 12%, var(--color-bg-secondary)); color: color-mix(in srgb, var(--color-danger) 60%, var(--color-text)); }

.loading-placeholder,
.empty-text {
  padding: 28px 4px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  text-align: center;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard__split,
  .dashboard__recent {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .dashboard__hero-actions {
    width: 100%;
  }

  .dashboard__hero-actions .btn {
    flex: 1 1 calc(50% - 6px);
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .data-table {
    min-width: 520px;
  }
}
</style>
