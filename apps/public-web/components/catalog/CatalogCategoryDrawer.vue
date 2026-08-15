<script setup lang="ts">
// 物品图鉴分类抽屉主体(WP-9 去重):移动端 <details> 壳与桌面版 <aside> 壳
// 曾在 items/index.vue 里逐字复制两份。抽为单组件后主体只渲染一份,外层壳仍由
// 页面区分(details vs 桌面 div),桌面态通过附加 class 保留原视觉。视觉零变化。
type CatalogCategoryFilterLike = {
  key: string
  label: string
}

type CatalogCategoryGroupLike = {
  key: string
  label: string
  caption: string
  filters: readonly CatalogCategoryFilterLike[]
}

defineProps<{
  groups: readonly CatalogCategoryGroupLike[]
  activeFilter: string
  activeFilterLabel: string
  pageSizeOptions: readonly number[]
  selectedPageSize: number
}>()

defineEmits<{
  (event: 'select-filter', filterKey: string): void
  (event: 'select-page-size', pageSize: number): void
}>()
</script>

<template>
  <div class="catalog-category-drawer">
    <header class="catalog-category-head">
      <span>分类</span>
      <b>{{ activeFilterLabel }}</b>
    </header>

    <div
      v-for="group in groups"
      :key="group.key"
      class="catalog-category-group"
    >
      <div class="catalog-category-group-head">
        <strong>{{ group.label }}</strong>
        <span>{{ group.caption }}</span>
      </div>
      <button
        v-for="filter in group.filters"
        :key="filter.key"
        class="catalog-category-chip"
        :class="{ active: filter.key === activeFilter }"
        type="button"
        :aria-pressed="filter.key === activeFilter"
        @click="$emit('select-filter', filter.key)"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="catalog-density-picker" aria-label="每页数量">
      <span>每页</span>
      <button
        v-for="pageSize in pageSizeOptions"
        :key="pageSize"
        class="catalog-density-chip"
        :class="{ active: pageSize === selectedPageSize }"
        type="button"
        :aria-pressed="pageSize === selectedPageSize"
        @click="$emit('select-page-size', pageSize)"
      >
        {{ pageSize }}
      </button>
    </div>
  </div>
</template>
