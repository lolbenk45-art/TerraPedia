<script setup lang="ts">
import type { CraftingRecipeOptionView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  options: CraftingRecipeOptionView[]
}>()
</script>

<template>
  <section class="recipe-compare-table tp-panel" data-crafting-role="compare-table" aria-labelledby="recipe-compare-title">
    <div class="recipe-section-head">
      <span class="eyebrow">配方对比</span>
      <h3 id="recipe-compare-title">配方对比</h3>
    </div>
    <div class="tp-scroll-region">
      <table>
        <thead>
          <tr>
            <th>方案</th>
            <th>材料</th>
            <th>制作站</th>
            <th>产出</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="option in options" :key="option.key">
            <th>{{ option.label }}</th>
            <td>
              <div v-if="option.materials.length" class="compare-cell-stack">
                <article
                  v-for="material in option.materials"
                  :key="material.key"
                  class="compare-entity"
                  data-crafting-role="compare-material"
                >
                  <CommonPreviewImage
                    :src="material.image"
                    :alt="material.title"
                    :fallback="material.fallback"
                    :fallback-icon="material.fallbackIcon"
                    width="32"
                    height="32"
                  />
                  <span>
                    <b>{{ material.title }}</b>
                    <small>
                      {{ material.quantity }}
                      <template v-if="material.isAnyGroup"> · 任选其一</template>
                    </small>
                    <small v-if="material.isAnyGroup && material.members.length" class="compare-any-members">
                      {{ material.members.map((member) => member.title).join('/') }}
                    </small>
                  </span>
                </article>
              </div>
              <span v-else>无</span>
            </td>
            <td>
              <div v-if="option.stations.length" class="compare-cell-stack">
                <component
                  :is="station.href ? 'a' : 'span'"
                  v-for="station in option.stations"
                  :key="station.key"
                  class="compare-entity"
                  data-crafting-role="compare-station"
                  :href="station.href || undefined"
                >
                  <CommonPreviewImage
                    :src="station.image"
                    :alt="station.title"
                    :fallback="station.fallback"
                    :fallback-icon="station.fallbackIcon"
                    width="32"
                    height="32"
                  />
                  <span>
                    <b>{{ station.title }}</b>
                    <small>{{ station.meta }}</small>
                  </span>
                </component>
              </div>
              <span v-else>无需制作站</span>
            </td>
            <td>
              <component
                :is="option.output.href ? 'a' : 'span'"
                class="compare-entity"
                data-crafting-role="compare-output"
                :href="option.output.href || undefined"
              >
                <CommonPreviewImage
                  :src="option.output.image"
                  :alt="option.output.title"
                  :fallback="option.output.fallback"
                  :fallback-icon="option.output.fallbackIcon"
                  width="32"
                  height="32"
                />
                <span>
                  <b>{{ option.output.title }}</b>
                  <small>{{ option.output.quantity }}</small>
                </span>
              </component>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
