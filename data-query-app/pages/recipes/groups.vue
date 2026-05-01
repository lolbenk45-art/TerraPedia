<template>
  <div class="page-wrap recipe-groups-redirect">
    <section class="section-card workspace-panel redirect-panel">
      <AppEmptyState
        icon="GR"
        title="正在打开统一任意物品组管理"
        description="配方作用域会在新页面中自动选中。"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ title: '任意物品组管理', navSection: '/item-groups', headerVariant: 'compact' })

onMounted(() => {
  void navigateTo({
    path: '/item-groups',
    query: { domain: 'recipe' },
  }, { replace: true })
})
</script>

<style scoped>
.redirect-panel {
  min-height: 360px;
  display: grid;
  place-items: center;
}
</style>
