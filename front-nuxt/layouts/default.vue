<script setup lang="ts">
const props = defineProps<{
  publicScreenClass?: string
}>()

const route = useRoute()
const { itemTotalLabel } = usePublicLayoutState()

const routeScreenClass = computed(() => String(
  props.publicScreenClass
  ?? route.meta.publicScreenClass
  ?? 'entity-screen',
).trim())

// tp-ground：统一的深色底与栅格，挂在布局层所以全站一致。
// 它同时在子树内重定义 --tp-color-page，因此所有由底推导的面自动跟上；
// 凹陷面读的是 --tp-color-recess，不随底走（见 tokens.css）。
const screenClasses = computed(() => [
  'screen',
  'tp-ground',
  ...routeScreenClass.value.split(/\s+/).filter(Boolean),
  'active',
])

const isHomeScreen = computed(() => routeScreenClass.value.split(/\s+/).includes('home-screen'))
</script>

<template>
  <section :class="screenClasses">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <TerraNav />
    <div id="main-content" tabindex="-1">
      <slot />
    </div>
    <div
      class="public-layout-footer-shell"
      :class="{ 'home-layout-footer-shell': isHomeScreen }"
    >
      <TerraFooter :item-total-label="itemTotalLabel" />
    </div>
  </section>
</template>
