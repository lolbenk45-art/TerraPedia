<script setup lang="ts">
import type { CraftingStationView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  stations: CraftingStationView[]
  title?: string
}>()
</script>

<template>
  <section class="station-options" data-crafting-role="station-options">
    <span class="recipe-section-label">{{ title || '制作站选项' }}</span>
    <div v-if="stations.length" class="station-option-list">
      <span v-if="stations.length > 1" class="station-option-summary">
        {{ stations.map((station) => station.title).join('/') }}
      </span>
      <template v-for="station in stations" :key="station.key">
        <component :is="station.href ? 'a' : 'span'" class="station-option" :href="station.href || undefined">
          <CommonPreviewImage
            :src="station.image"
            :alt="station.title"
            :fallback="station.fallback"
            :fallback-icon="station.fallbackIcon"
            width="38"
            height="38"
          />
          <span>{{ station.title }}</span>
        </component>
      </template>
    </div>
    <p v-else class="crafting-muted">无需制作站。</p>
  </section>
</template>
