<script setup lang="ts">
import type { ArmorSetCatalogItem } from '~/types/public-api'
import {
  armorSecondaryLabel,
  armorSummary,
  benefitLines,
  effectLabel,
  effectToneClass,
  shownEffects,
} from '~/utils/armorSetPresentation'

// 套装列表卡片(WP-9 去重):armor-sets/index.vue 里 NuxtLink 版与 <article> 版
// ~65 行近逐字重复。抽为单组件后内容只渲染一份——有 armorSetId 时用 NuxtLink 壳
// 并链接详情,无时降级为 <article> 壳。页面据此收敛为单个 v-for,消除对 pieces
// 的两次 .filter()。视觉零变化。
const props = defineProps<{
  armor: ArmorSetCatalogItem
  active?: boolean
}>()

const hasDetail = computed(() => Boolean(props.armor.armorSetId))
</script>

<template>
  <component
    :is="hasDetail ? resolveComponent('NuxtLink') : 'article'"
    class="armor-card armor-card-live"
    :class="{ 'armor-card-link': hasDetail, active }"
    :to="hasDetail ? `/armor-sets/${armor.armorSetId}` : undefined"
    :aria-label="hasDetail ? `查看套装 ${armor.displayName}` : undefined"
  >
    <CommonPreviewImage
      :src="armor.image"
      :alt="armor.displayName"
      :fallback="armor.fallback"
      fallback-icon="icon-armor"
      :source-image="armor.sourceImage"
      width="88"
      height="92"
    />
    <div class="armor-card-body">
      <span>{{ armorSecondaryLabel(armor) }}</span>
      <h3>{{ armor.displayName }}</h3>
      <p>{{ armorSummary(armor) }}</p>
      <div v-if="armor.benefitZh" class="armor-benefit-lines" aria-label="套装效果">
        <span v-for="line in benefitLines(armor)" :key="`${armor.id}-${line}`">{{ line }}</span>
      </div>
      <div v-if="shownEffects(armor).length" class="armor-effect-row">
        <span
          v-for="effect in shownEffects(armor)"
          :key="`${armor.id}-${effect.statKey}-${effect.rawText}`"
          :class="effectToneClass(effect)"
        >
          {{ effectLabel(effect) }}
        </span>
      </div>
    </div>
    <em>{{ armor.setCount ?? 1 }} 组</em>
  </component>
</template>
