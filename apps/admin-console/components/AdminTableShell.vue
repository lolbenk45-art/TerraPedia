<template>
  <section class="section-card table-card admin-table-shell">
    <div class="section-card__header admin-table-shell__header">
      <div>
        <h2 class="section-card__title">{{ title }}</h2>
        <p v-if="subtitle" class="section-card__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.meta" class="table-meta admin-table-shell__meta">
        <slot name="meta" />
      </div>
    </div>

    <div v-if="error" class="admin-table-state admin-table-state--error" role="alert">{{ error }}</div>
    <div v-else-if="loading" class="admin-table-state" role="status" aria-live="polite">{{ loadingText }}</div>
    <AppEmptyState
      v-else-if="empty"
      :title="emptyTitle"
      :description="emptyDescription"
    />
    <slot v-else />

    <div v-if="$slots.pagination && !loading && !error && !empty" class="admin-table-shell__pagination">
      <slot name="pagination" />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  subtitle?: string
  loading?: boolean
  loadingText?: string
  error?: string
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  subtitle: '',
  loading: false,
  loadingText: '加载中...',
  error: '',
  empty: false,
  emptyTitle: '暂无数据',
  emptyDescription: '调整筛选条件后再试。'
})
</script>
