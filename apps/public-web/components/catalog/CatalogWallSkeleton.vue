<script setup lang="ts">
defineOptions({ name: 'CatalogWallSkeleton' })

const props = withDefaults(defineProps<{
  slots?: number
}>(), {
  slots: 24,
})

const skeletonSlots = computed(() => {
  const slotCount = Number(props.slots)
  const safeCount = Number.isFinite(slotCount) && slotCount > 0 ? Math.floor(slotCount) : 24
  return Array.from({ length: Math.min(safeCount, 50) }, (_, index) => index + 1)
})
</script>

<template>
  <div
    class="catalog-wall-grid catalog-loading-skeleton"
    aria-label="物品图标墙加载中"
  >
    <span
      v-for="slot in skeletonSlots"
      :key="`catalog-loading-${slot}`"
      class="catalog-wall-cell catalog-wall-cell-loading"
      aria-hidden="true"
    >
      <CommonTpSkeleton type="line" class="catalog-loading-index" />
      <span class="catalog-wall-icon-slot catalog-loading-icon-slot">
        <CommonTpSkeleton type="icon" class="catalog-loading-icon" />
      </span>
      <CommonTpSkeleton type="line" class="catalog-loading-line" />
    </span>
  </div>
</template>
