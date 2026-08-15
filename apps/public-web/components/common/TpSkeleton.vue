<script setup lang="ts">
const props = withDefaults(defineProps<{
  type?: 'icon' | 'line' | 'pill' | 'row'
  short?: boolean
}>(), {
  type: 'line',
  short: false,
})

const classes = computed(() => [
  'tp-skeleton',
  `tp-skeleton-${props.type}`,
  { 'is-short': props.short },
])
</script>

<template>
  <span :class="classes" aria-hidden="true"></span>
</template>
