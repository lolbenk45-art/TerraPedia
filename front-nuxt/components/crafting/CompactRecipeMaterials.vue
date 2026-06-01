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

<style scoped>
.armor-crafting-material-list {
  display: grid;
  gap: 5px;
  justify-items: center;
  min-width: 0;
}

.armor-crafting-material-row {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
}

.armor-crafting-chip-compact {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: center;
}

.armor-crafting-chip-art {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  overflow: hidden;
}

.armor-crafting-chip-art :deep(.item-art) {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 5px;
  overflow: hidden;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-crafting-chip-art :deep(.item-art img) {
  width: 18px;
  height: 18px;
  max-width: 18px;
  max-height: 18px;
  object-fit: contain;
}

.armor-crafting-chip-copy {
  display: grid;
  gap: 0;
  min-width: 48px;
  max-width: 76px;
}

.armor-crafting-chip-compact b,
.armor-crafting-any-option b,
.armor-crafting-any-label b {
  min-width: 0;
  color: var(--text);
  font-weight: 850;
  line-height: 1.2;
}

.armor-crafting-chip-compact b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  font-size: 11px;
  word-break: keep-all;
  overflow-wrap: normal;
}

.armor-crafting-chip-compact small,
.armor-crafting-any-label small {
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  line-height: 1.2;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.armor-crafting-any-material {
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  padding: 3px 4px;
  border-radius: 6px;
  background: rgba(125, 229, 220, 0.045);
}

.armor-crafting-any-option {
  display: inline-grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 3px;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.armor-crafting-any-option b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 1.15;
}

.armor-crafting-any-label {
  display: grid;
  justify-items: center;
  gap: 0;
  min-width: 0;
  padding: 2px 0;
  color: var(--muted);
  font-size: 9px;
  font-weight: 850;
  line-height: 1.15;
}

.armor-crafting-any-label b,
.armor-crafting-any-label small {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
