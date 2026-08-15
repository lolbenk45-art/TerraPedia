<script setup lang="ts">
import type { CraftingRecipeVariantView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  variants: CraftingRecipeVariantView[]
  activeKey: string
}>()

defineEmits<{
  select: [key: string]
}>()
</script>

<template>
  <section class="recipe-variant-selector tp-toolbar" data-crafting-role="variant-selector" aria-label="配方版本">
    <button
      v-for="variant in variants"
      :key="variant.key"
      class="tp-control recipe-selector-button"
      :class="{ active: variant.key === activeKey }"
      type="button"
      :aria-pressed="variant.key === activeKey"
      @click="$emit('select', variant.key)"
    >
      <b>{{ variant.label }}</b>
      <span>{{ variant.meta }}</span>
    </button>
  </section>
</template>
