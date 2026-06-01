<script setup lang="ts">
import type { CompactRecipeMaterial } from '~/utils/craftingRecipeCompact'

defineProps<{
  materials: CompactRecipeMaterial[]
}>()
</script>

<template>
  <div class="armor-crafting-material-list">
    <div v-for="material in materials" :key="material.key" class="armor-crafting-material-row">
      <span v-if="!material.alternatives.length" class="armor-crafting-chip-compact">
        <span class="armor-crafting-chip-art">
          <CommonPreviewImage
            :src="material.image"
            :alt="material.name"
            :fallback="material.fallback"
            fallback-icon="icon-items"
            width="18"
            height="18"
          />
        </span>
        <span class="armor-crafting-chip-copy"><b>{{ material.name }}</b><small>{{ material.quantity }}</small></span>
      </span>
      <div v-else class="armor-crafting-any-material" aria-label="任意可替换材料">
        <span v-for="option in material.alternatives" :key="`${material.key}-option-${option.key}`" class="armor-crafting-any-option">
          <span class="armor-crafting-chip-art">
            <CommonPreviewImage
              :src="option.image"
              :alt="option.name"
              :fallback="option.fallback"
              fallback-icon="icon-items"
              width="18"
              height="18"
            />
          </span>
          <b>{{ option.name }}</b>
        </span>
        <span class="armor-crafting-any-label">
          <b>{{ material.name }}</b>
          <small>{{ material.quantity }}</small>
        </span>
      </div>
    </div>
  </div>
</template>
