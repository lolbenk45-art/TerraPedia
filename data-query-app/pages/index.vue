<template>
  <div class="page-wrap dashboard">
    <section class="page-head dashboard__head">
      <div class="dashboard__head-copy">
        <p class="dashboard__eyebrow">Overview</p>
        <h1 class="page-head__title">仪表盘</h1>
        <p class="page-head__subtitle">欢迎使用数据管理后台，快速查看词条、分类与制作流的最新状态。</p>
      </div>

      <div class="dashboard__actions">
        <NuxtLink to="/items" class="btn btn-secondary">
          <Package :size="16" />
          <span>物品管理</span>
        </NuxtLink>
        <NuxtLink to="/recipes" class="btn btn-primary">
          <Hammer :size="16" />
          <span>配方工作区</span>
        </NuxtLink>
      </div>
    </section>

    <div class="stats-grid">
      <article v-for="stat in dashboardStats" :key="stat.label" class="stat-card">
        <div class="stat-card__icon" :style="{ '--stat-gradient': stat.gradient }">
          <component :is="stat.icon" :size="24" />
        </div>
        <strong class="stat-card__value">{{ stat.value }}</strong>
        <span class="stat-card__label">{{ stat.label }}</span>
      </article>
    </div>

    <section class="section-card quick-section">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">快捷工作区</h3>
          <p class="section-card__subtitle">把高频维护动作收拢到一处，减少在导航里来回切换。</p>
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

    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">最近物品</h3>
          <p class="section-card__subtitle">最新录入的物品会优先显示，便于立即检查图片、分类和稀有度。</p>
        </div>
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
              <th>操作</th>
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
              <td>
                <button type="button" class="btn-link" @click.stop="viewItem(row)">查看</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-text">暂无数据</p>
      </template>
    </section>

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
import { ArrowRight, CheckCircle2, FolderTree, GitBranchPlus, Hammer, Package } from 'lucide-vue-next'
import { getRarityPresentation } from '~/utils/rarity'

type DashboardStat = {
  label: string
  value: number | string
  gradient: string
  icon: Component
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

const detailVisible = ref(false)
const selectedItem = ref<any>(null)

const recentItems = computed(() => itemsStore.items?.slice(0, 5) ?? [])
const totalItemCount = computed(() => statisticsStore.overview.totalItems || itemsStore.totalItems)
const totalCategoryCount = computed(() => statisticsStore.overview.totalCategories || categoriesStore.categoryOptions.length)
const rootCategoryCount = computed(() => statisticsStore.rootCategoryCount || categoriesStore.categoryTree.length)
const activeRootCategoryCount = computed(() => statisticsStore.nonEmptyRootCategoryCount)

const dashboardStats = computed<DashboardStat[]>(() => [
  {
    icon: Package,
    value: totalItemCount.value,
    label: '物品总数',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
  },
  {
    icon: FolderTree,
    value: totalCategoryCount.value,
    label: '分类总数',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
  },
  {
    icon: GitBranchPlus,
    value: rootCategoryCount.value,
    label: '根分类数量',
    gradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  },
  {
    icon: CheckCircle2,
    value: activeRootCategoryCount.value,
    label: '已收录根分类',
    gradient: 'linear-gradient(135deg, #059669 0%, #34d399 100%)',
  },
])

const quickActions: QuickAction[] = [
  {
    to: '/items',
    label: '物品管理',
    description: '维护名称、图片、分类与展示状态。',
    icon: Package,
  },
  {
    to: '/categories',
    label: '分类管理',
    description: '快速定位树节点并维护层级结构。',
    icon: FolderTree,
  },
  {
    to: '/recipes',
    label: '配方管理',
    description: '集中编辑配方与制作路径。',
    icon: Hammer,
  },
]

function viewItem(item: any) {
  selectedItem.value = item
  detailVisible.value = true
}

onMounted(async () => {
  await Promise.all([
    itemsStore.fetchItems(1, 5),
    categoriesStore.fetchCategories(),
    statisticsStore.fetchOverview(),
  ])
})
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 4px;
}

.dashboard__head {
  align-items: end;
}

.dashboard__eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 14px;
  border-radius: var(--radius-full);
  border: 1px solid color-mix(in srgb, var(--color-primary) 16%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
  color: var(--color-primary-dark);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.dashboard__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 24px;
}

.stat-card {
  display: grid;
  gap: 12px;
  min-height: 188px;
  padding: 22px;
  border-radius: calc(var(--radius-lg) + 2px);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 92%, transparent), color-mix(in srgb, var(--color-bg) 74%, var(--color-bg-secondary)));
  box-shadow: var(--shadow-card);
  transition:
    transform var(--transition-base) var(--ease-standard),
    box-shadow var(--transition-base) var(--ease-standard),
    border-color var(--transition-base) var(--ease-standard);
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  box-shadow: var(--shadow-lg);
}

.stat-card__icon {
  width: 54px;
  height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  color: #fff;
  background: var(--stat-gradient);
  box-shadow: 0 24px 32px -24px color-mix(in srgb, var(--color-primary) 60%, transparent);
}

.stat-card__value {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 1.4rem + 0.4vw, 2rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.stat-card__label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.quick-section .section-card__header {
  margin-bottom: 20px;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.quick-action {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 92px;
  padding: 18px;
  border-radius: 18px;
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
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
}

.quick-action__body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}

.quick-action__body strong {
  color: var(--color-text);
  font-size: 0.98rem;
  line-height: 1.2;
}

.quick-action__body small {
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  line-height: 1.55;
}

.quick-action__arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard);
}

.quick-action:hover .quick-action__arrow {
  transform: translateX(4px);
  color: var(--color-primary);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  text-align: left;
  vertical-align: middle;
}

.data-table th {
  color: var(--color-text-secondary);
  font-size: 0.82rem;
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

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
}

.tag--info {
  background: #dff5ff;
  color: #075985;
}

.tag--slate {
  background: #e2e8f0;
  color: #475569;
}

.tag--emerald {
  background: #dcfce7;
  color: #15803d;
}

.tag--sky {
  background: #e0f2fe;
  color: #0369a1;
}

.tag--violet {
  background: #ede9fe;
  color: #6d28d9;
}

.tag--amber {
  background: #fef3c7;
  color: #b45309;
}

.tag--fuchsia {
  background: #fae8ff;
  color: #a21caf;
}

.tag--rose {
  background: #ffe4e6;
  color: #be123c;
}

.tag--orange {
  background: #ffedd5;
  color: #c2410c;
}

.tag--cyan {
  background: #cffafe;
  color: #0e7490;
}

.tag--red {
  background: #fee2e2;
  color: #b91c1c;
}

@media (max-width: 1100px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .dashboard__actions {
    width: 100%;
  }

  .dashboard__actions :deep(.btn),
  .dashboard__actions .btn {
    flex: 1 1 calc(50% - 6px);
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .data-table {
    min-width: 640px;
  }
}
</style>
