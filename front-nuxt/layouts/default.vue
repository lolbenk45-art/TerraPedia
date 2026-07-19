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

const screenClasses = computed(() => [
  'screen',
  ...routeScreenClass.value.split(/\s+/).filter(Boolean),
  'active',
])

const isHomeScreen = computed(() => routeScreenClass.value.split(/\s+/).includes('home-screen'))
</script>

<template>
  <section :class="screenClasses">
    <TerraNav />
    <slot />
    <div
      class="public-layout-footer-shell"
      :class="{ 'home-layout-footer-shell': isHomeScreen }"
    >
      <TerraFooter :item-total-label="itemTotalLabel" />
    </div>
  </section>
</template>
