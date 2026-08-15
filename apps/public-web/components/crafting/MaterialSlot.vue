<script setup lang="ts">
import type { CraftingMaterialView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  material: CraftingMaterialView
}>()
</script>

<template>
  <article class="material-slot tp-dense-row" data-crafting-role="material-slot">
    <component :is="material.href ? 'a' : 'span'" class="material-slot-main" :href="material.href || undefined">
      <CommonPreviewImage
        :src="material.image"
        :alt="material.title"
        :fallback="material.fallback"
        :fallback-icon="material.fallbackIcon"
        width="48"
        height="48"
      />
      <span class="material-slot-copy">
        <b>{{ material.title }}</b>
        <small v-if="material.subtitle">{{ material.subtitle }}</small>
      </span>
    </component>
    <span class="tp-token material-quantity">{{ material.quantity }}</span>
  </article>
</template>
