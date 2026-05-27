<script setup lang="ts">
import type { CraftingRecipeOptionView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  recipe: CraftingRecipeOptionView | null
  compact?: boolean
}>()
</script>

<template>
  <section
    class="recipe-sheet"
    :class="compact ? 'recipe-sheet-compact' : 'tp-panel'"
    data-crafting-role="recipe-sheet"
    aria-label="配方表"
  >
    <template v-if="recipe">
      <header class="recipe-sheet-head">
        <div>
          <span class="eyebrow">当前方案</span>
          <h2>{{ recipe.label }}</h2>
          <p>{{ recipe.summary || '材料、制作站和产出如下。' }}</p>
        </div>
      </header>

      <div class="recipe-sheet-grid">
        <section class="recipe-sheet-section recipe-materials" data-crafting-role="recipe-materials">
          <span class="recipe-section-label">材料</span>
          <div v-if="recipe.materials.length" class="recipe-material-list">
            <template v-for="material in recipe.materials" :key="material.key">
              <CraftingAnyMaterialGroupDisclosure v-if="material.isAnyGroup" :material="material" />
              <CraftingMaterialSlot v-else :material="material" />
            </template>
          </div>
          <p v-else class="crafting-muted">没有材料记录。</p>
        </section>

        <span class="recipe-flow-arrow" aria-hidden="true">→</span>

        <section class="recipe-sheet-section recipe-stations" data-crafting-role="recipe-stations">
          <CraftingStationRequirementGroup :stations="recipe.stations" />
          <div v-if="recipe.conditions.length" class="recipe-conditions" data-crafting-role="recipe-conditions">
            <span class="recipe-section-label">条件</span>
            <CraftingStationRequirementGroup :stations="recipe.conditions" title="条件选项" />
          </div>
        </section>

        <span class="recipe-flow-arrow" aria-hidden="true">→</span>

        <section class="recipe-sheet-section recipe-output" data-crafting-role="recipe-output">
          <span class="recipe-section-label">产出</span>
          <component :is="recipe.output.href ? 'a' : 'span'" class="recipe-output-inline" :href="recipe.output.href || undefined">
            <CommonPreviewImage
              :src="recipe.output.image"
              :alt="recipe.output.title"
              :fallback="recipe.output.fallback"
              :fallback-icon="recipe.output.fallbackIcon"
              width="52"
              height="52"
            />
            <span>
              <b>{{ recipe.output.title }}</b>
              <small>{{ recipe.output.quantity }}</small>
            </span>
          </component>
        </section>
      </div>
    </template>

    <div v-else class="crafting-empty-state">
      <b>请选择目标物品</b>
      <span>载入公开配方后会显示材料、制作站和产出。</span>
    </div>
  </section>
</template>
