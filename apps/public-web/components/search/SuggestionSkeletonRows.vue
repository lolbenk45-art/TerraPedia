<script setup lang="ts">
defineOptions({ name: 'SuggestionSkeletonRows' })

const props = withDefaults(defineProps<{
  rows?: number
}>(), {
  rows: 5,
})

const rowItems = computed(() => {
  const rowCount = Number(props.rows)
  const safeCount = Number.isFinite(rowCount) && rowCount > 0 ? Math.floor(rowCount) : 5
  return Array.from({ length: Math.min(safeCount, 8) }, (_, index) => index + 1)
})
</script>

<template>
  <span
    v-for="row in rowItems"
    :key="`suggestion-loading-${row}`"
    class="home-suggestion-row is-loading"
    aria-hidden="true"
  >
    <CommonTpSkeleton type="icon" />
    <span class="suggestion-loading-copy">
      <CommonTpSkeleton type="line" />
      <CommonTpSkeleton type="line" short />
    </span>
  </span>
</template>
