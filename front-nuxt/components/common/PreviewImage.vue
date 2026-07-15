<script setup lang="ts">
import { resetPreviewImageVisibleCenter, syncPreviewImageVisibleCenter } from '~/utils/previewImageVisibleCenter'

const props = withDefaults(defineProps<{
  src?: string | null
  alt?: string
  fallback?: string | null
  fallbackIcon?: string | null
  loading?: 'lazy' | 'eager'
  width?: number | string
  height?: number | string
  sourceImage?: string | null
  decorative?: boolean
  autoCenterVisible?: boolean
}>(), {
  alt: '',
  fallback: '?',
  loading: 'lazy',
  decorative: false,
  autoCenterVisible: true,
})

const failed = ref(false)

const normalizedSrc = computed(() => resolvePreviewImageUrl(props.src))
const hasImage = computed(() => Boolean(normalizedSrc.value) && !failed.value)
const fallbackIconClass = computed(() => {
  const icon = String(props.fallbackIcon ?? '').trim()
  if (!icon) return []

  return icon
    .split(/\s+/)
    .filter((entry) => /^icon-[a-z0-9-]+$/i.test(entry))
})
const fallbackGlyph = computed(() => {
  const text = String(props.fallback || props.alt || 'TP').trim()
  return Array.from(text)[0] ?? '?'
})
const sourceMarker = computed(() => normalizedSrc.value || resolvePreviewImageUrl(props.sourceImage) || undefined)
const accessibleLabel = computed(() => {
  if (props.decorative) {
    return ''
  }

  return String(props.alt || props.fallback || 'TerraPedia 图像').trim() || 'TerraPedia 图像'
})
const renderedAlt = computed(() => props.decorative ? '' : accessibleLabel.value)
const imageElement = ref<HTMLImageElement | null>(null)
const rootElement = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const resetVisibleCenter = () => resetPreviewImageVisibleCenter(rootElement.value)
const syncVisibleCenter = () => syncPreviewImageVisibleCenter(
  imageElement.value,
  rootElement.value,
  props.autoCenterVisible,
)

const markFailed = () => {
  failed.value = true
  resetVisibleCenter()
}

watch(normalizedSrc, () => {
  failed.value = false
  resetVisibleCenter()
})

watch(() => props.autoCenterVisible, (enabled) => {
  if (!enabled) {
    resetVisibleCenter()
  } else {
    requestAnimationFrame(syncVisibleCenter)
  }
})

onMounted(() => {
  if (!import.meta.client) return

  resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(syncVisibleCenter)
  })

  if (rootElement.value) {
    resizeObserver.observe(rootElement.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <span
    ref="rootElement"
    class="item-art tp-preview-image"
    :class="{ 'is-fallback': !hasImage, 'has-fallback-icon': !hasImage && fallbackIconClass.length > 0 }"
    :data-fallback="fallbackGlyph"
    :data-source-image="sourceMarker"
    :aria-hidden="decorative ? 'true' : undefined"
    :role="!decorative && !hasImage ? 'img' : undefined"
    :aria-label="!decorative && !hasImage ? accessibleLabel : undefined"
  >
    <img
      v-if="hasImage"
      ref="imageElement"
      :src="normalizedSrc"
      :alt="renderedAlt"
      :width="width"
      :height="height"
      :loading="loading"
      decoding="async"
      @load="syncVisibleCenter"
      @error="markFailed"
    />
    <span
      v-else-if="fallbackIconClass.length"
      :class="['sprite-icon', 'preview-fallback-icon', ...fallbackIconClass]"
      aria-hidden="true"
    ></span>
  </span>
</template>
