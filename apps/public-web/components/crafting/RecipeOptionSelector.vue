<script setup lang="ts">
import type { CraftingRecipeOptionView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  options: CraftingRecipeOptionView[]
  activeKey: string
}>()

defineEmits<{
  select: [key: string]
}>()
</script>

<template>
  <section class="recipe-option-selector tp-toolbar" data-crafting-role="recipe-option-selector" aria-label="配方方案">
    <button
      v-for="option in options"
      :key="option.key"
      class="tp-control recipe-selector-button"
      :class="{ active: option.key === activeKey }"
      type="button"
      :aria-pressed="option.key === activeKey"
      @click="$emit('select', option.key)"
    >
      <b>{{ option.label }}</b>
      <span>{{ option.summary || option.output.title }}</span>
    </button>
  </section>
</template>
