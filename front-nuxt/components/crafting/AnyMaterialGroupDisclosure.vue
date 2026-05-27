<script setup lang="ts">
import type { CraftingMaterialView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  material: CraftingMaterialView
}>()
</script>

<template>
  <details class="any-material-group" data-crafting-role="any-material-group">
    <summary>
      <CraftingMaterialSlot :material="material" />
      <span class="tp-chip">任选其一</span>
    </summary>

    <div class="any-material-members" aria-label="可选材料">
      <template v-for="(member, index) in material.members" :key="member.key">
        <component :is="member.href ? 'a' : 'span'" class="tp-token any-material-member" :href="member.href || undefined">
          <CommonPreviewImage
            :src="member.image"
            :alt="member.title"
            :fallback="member.fallback"
            :fallback-icon="member.fallbackIcon"
            width="24"
            height="24"
          />
          <span>{{ member.title }}</span>
        </component>
        <span v-if="index < material.members.length - 1" class="any-material-separator">/</span>
      </template>
    </div>
  </details>
</template>
