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

    <div v-if="materials.some((material) => material.childRecipe)" class="material-expansion-items">
      <details
        v-for="material in materials.filter((entry) => entry.childRecipe)"
        :key="material.key"
        class="tp-subsection material-expansion-item"
      >
        <summary>
          <CraftingMaterialSlot :material="material" />
          <span class="tp-chip">子配方</span>
        </summary>
        <CraftingRecipeSheet :recipe="material.childRecipe" compact />
      </details>
    </div>
    <p v-else class="crafting-muted">当前材料没有可展开的子配方。</p>
  </section>
</template>
