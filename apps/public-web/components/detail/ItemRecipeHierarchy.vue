<script setup lang="ts">
import type { ItemRecipeHierarchy, ItemRecipeHierarchyStageKey } from '~/utils/itemRecipeHierarchy'

const props = defineProps<{
  hierarchy: ItemRecipeHierarchy
  itemId: string
}>()

const emit = defineEmits<{
  'update:variant': [value: string]
}>()

const hierarchyDepthLabel = computed(() => {
  const occupied = props.hierarchy.stages.filter((stage) => stage.entries.length > 0 && stage.key !== 'OUT').length
  return occupied ? `${occupied} 层深度` : '配方资料'
})

const showStageQuantity = (stageKey: ItemRecipeHierarchyStageKey, quantity: string) => (
  Boolean(quantity) && (stageKey !== 'L2' || quantity !== 'x1')
)
</script>

<template>
  <div class="item-recipe-hierarchy">
    <div class="card-head">
      <div>
        <h2>合成链</h2>
        <div v-if="hierarchy.activeVariant" class="sub">{{ hierarchyDepthLabel }} · 制作路线 · {{ hierarchy.activeVariant.label }} · {{ hierarchy.activeVariant.meta }}</div>
        <div v-else class="sub">当前物品暂无可展示的制作路径</div>
      </div>
      <span class="badge">{{ hierarchy.activeVariant?.options.length ?? 0 }} 个配方</span>
    </div>

    <div v-if="hierarchy.variants.length > 1" class="toolbar" aria-label="配方版本">
      <div class="seg">
        <button
          v-for="variant in hierarchy.variants"
          :key="variant.key"
          type="button"
          :class="{ on: hierarchy.activeVariant?.key === variant.key }"
          :aria-pressed="hierarchy.activeVariant?.key === variant.key"
          @click="emit('update:variant', variant.key)"
        >
          {{ variant.label }}
        </button>
      </div>
      <span class="spacer"></span>
      <span class="note">{{ hierarchyDepthLabel }}</span>
    </div>

    <div v-if="hierarchy.hasData" class="chain">
      <template
        v-for="(stage, stageIndex) in hierarchy.stages.filter((entry) => entry.entries.length)"
        :key="stage.key"
      >
        <section class="band" :data-stage="stage.key">
          <div class="band-label">
            <div class="n item-recipe-level__code">{{ stage.key }}</div>
            <div class="t">{{ stage.title }}</div>
            <div class="c">{{ stage.entries.length }} 项 · {{ stage.meta }}</div>
          </div>
          <div class="band-body">
            <div class="nodes">
              <template v-for="entry in stage.entries" :key="entry.id">
                <span v-if="entry.isAlternativeGroup && entry.alternatives.length" class="fork">
                  <template v-for="(alternative, alternativeIndex) in entry.alternatives" :key="alternative.key">
                    <component
                      :is="alternative.href ? 'NuxtLink' : 'span'"
                      :to="alternative.href || undefined"
                      class="node"
                    >
                      <span class="node-img">
                        <CommonPreviewImage
                          :src="alternative.image"
                          :alt="alternative.title"
                          :fallback="alternative.fallback"
                          :fallback-icon="alternative.fallbackIcon"
                        />
                      </span>
                      <span class="node-text">
                        <span class="node-name">{{ alternative.title }}</span>
                        <span v-if="alternative.subtitle" class="node-meta">{{ alternative.subtitle }}</span>
                      </span>
                      <span v-if="showStageQuantity(stage.key, alternative.quantity)" class="qty">{{ alternative.quantity.replace(/^x/i, '×') }}</span>
                    </component>
                    <span v-if="alternativeIndex < entry.alternatives.length - 1" class="fork-or">二选一</span>
                  </template>
                  <span class="fork-tip">{{ entry.title }}</span>
                </span>

                <component
                  :is="entry.href ? 'NuxtLink' : 'span'"
                  v-else
                  :to="entry.href || undefined"
                  class="node"
                  :class="{ key: stage.key === 'L1', result: entry.isOutput }"
                >
                  <span class="node-img">
                    <CommonPreviewImage
                      :src="entry.image"
                      :alt="entry.title"
                      :fallback="entry.fallback"
                      :fallback-icon="entry.fallbackIcon"
                    />
                  </span>
                  <span class="node-text">
                    <span class="node-name">{{ entry.title }}</span>
                    <span v-if="entry.subtitle" class="node-meta">{{ entry.subtitle }}</span>
                  </span>
                  <span v-if="showStageQuantity(stage.key, entry.quantity)" class="qty">{{ entry.quantity.replace(/^x/i, '×') }}</span>
                </component>
              </template>
            </div>

            <div v-if="stage.stations.length" class="stations" aria-label="制作站">
              <span class="k">制作站</span>
              <component
                :is="station.href ? 'NuxtLink' : 'span'"
                v-for="station in stage.stations"
                :key="station.key"
                :to="station.href || undefined"
                class="station"
              >
                <span class="station-img">
                  <CommonPreviewImage
                    :src="station.image"
                    :alt="station.title"
                    :fallback="station.fallback"
                    :fallback-icon="station.fallbackIcon"
                  />
                </span>
                {{ station.title }}
              </component>
            </div>
          </div>
        </section>

        <div
          v-if="stageIndex < hierarchy.stages.filter((entry) => entry.entries.length).length - 1"
          class="band-flow"
        >
          <span>{{ stage.key === 'L1' ? stage.stations.map((station) => station.title).join(' / ') || '合成' : '合成' }}</span>
        </div>
      </template>

      <div v-if="hierarchy.procurement.length" class="tally">
        <div class="tally-head">
          <div>
            <h3>采集清单</h3>
            <div class="sub">按当前配方原始数量展示，未做跨层数量换算</div>
          </div>
          <span class="badge moss">{{ hierarchy.procurement.length }} 项</span>
        </div>
        <div class="tally-grid">
          <component
            :is="entry.href ? 'NuxtLink' : 'span'"
            v-for="entry in hierarchy.procurement"
            :key="`tally-${entry.id}`"
            :to="entry.href || undefined"
            class="tally-row"
          >
            <span class="tally-img">
              <CommonPreviewImage
                :src="entry.image"
                :alt="entry.title"
                :fallback="entry.fallback"
                :fallback-icon="entry.fallbackIcon"
              />
            </span>
            <span class="n">{{ entry.title }}</span>
            <span class="q">{{ entry.quantity.replace(/^x/i, '×') }}</span>
          </component>
        </div>
        <div class="tally-note">按当前选中的真实配方版本生成</div>
      </div>
    </div>

    <p v-else class="tp-detail-empty">资料整理中：暂时没有可展示的配方、材料或制作站记录。</p>
    <a v-if="hierarchy.hasData" class="item-recipe-hierarchy__explore" :href="`/crafting?itemId=${itemId}&maxDepth=3`">在合成图鉴中继续探索</a>
  </div>
</template>
