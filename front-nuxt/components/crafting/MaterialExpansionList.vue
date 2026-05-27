<script setup lang="ts">
import type { CraftingMaterialView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  materials: CraftingMaterialView[]
}>()
</script>

<template>
  <section class="material-expansion-list tp-panel" data-crafting-role="material-expansion-list" aria-labelledby="material-expansion-title">
    <div class="recipe-section-head">
      <span class="eyebrow">材料展开</span>
      <h3 id="material-expansion-title">材料展开</h3>
    </div>

    <div v-if="materials.some((material) => material.childRecipes.length)" class="material-expansion-items">
      <details
        v-for="material in materials.filter((entry) => entry.childRecipes.length)"
        :key="material.key"
        class="tp-subsection material-expansion-item"
      >
        <summary>
          <CraftingMaterialSlot :material="material" />
          <span class="tp-chip">{{ material.childRecipes.length > 1 ? `${material.childRecipes.length} 个子配方` : '子配方' }}</span>
        </summary>
        <div class="material-child-recipe-list">
          <CraftingRecipeSheet
            v-for="childRecipe in material.childRecipes"
            :key="childRecipe.key"
            :recipe="childRecipe"
            compact
          />
        </div>
      </details>
    </div>
    <p v-else class="crafting-muted">当前材料没有可展开的子配方。</p>
  </section>
</template>
