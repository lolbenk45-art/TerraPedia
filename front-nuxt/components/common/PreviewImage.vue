<script setup lang="ts">
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
}>(), {
  alt: '',
  fallback: '?',
  loading: 'lazy',
  decorative: false,
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
const maxVisibleCenterDrawPixels = 1_500_000
const maxVisibleCenterScanPixels = 120_000
let resizeObserver: ResizeObserver | null = null

const resetVisibleCenter = () => {
  rootElement.value?.style.setProperty('--tp-preview-visible-shift-x', '0px')
  rootElement.value?.style.setProperty('--tp-preview-visible-shift-y', '0px')
}

const syncVisibleCenter = () => {
  const image = imageElement.value
  const root = rootElement.value

  if (!image || !root || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    resetVisibleCenter()
    return
  }

  const naturalPixels = image.naturalWidth * image.naturalHeight
  if (naturalPixels > maxVisibleCenterDrawPixels) {
    resetVisibleCenter()
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    resetVisibleCenter()
    return
  }

  try {
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const sampleStride = Math.max(1, Math.ceil(Math.sqrt(naturalPixels / maxVisibleCenterScanPixels)))
    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < canvas.height; y += sampleStride) {
      for (let x = 0; x < canvas.width; x += sampleStride) {
        const alpha = data[(y * canvas.width + x) * 4 + 3] ?? 0

        if (alpha > 8) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      resetVisibleCenter()
      return
    }

    const imageRect = image.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    const currentShiftX = Number.parseFloat(style.getPropertyValue('--tp-preview-visible-shift-x')) || 0
    const currentShiftY = Number.parseFloat(style.getPropertyValue('--tp-preview-visible-shift-y')) || 0
    const scaleX = imageRect.width / image.naturalWidth
    const scaleY = imageRect.height / image.naturalHeight
    const visibleCenterX = imageRect.left - currentShiftX + ((minX + maxX + 1) / 2) * scaleX
    const visibleCenterY = imageRect.top - currentShiftY + ((minY + maxY + 1) / 2) * scaleY
    const rootCenterX = rootRect.left + rootRect.width / 2
    const rootCenterY = rootRect.top + rootRect.height / 2
    const shiftX = Math.round((rootCenterX - visibleCenterX) * 100) / 100
    const shiftY = Math.round((rootCenterY - visibleCenterY) * 100) / 100

    root.style.setProperty('--tp-preview-visible-shift-x', `${shiftX}px`)
    root.style.setProperty('--tp-preview-visible-shift-y', `${shiftY}px`)
  } catch {
    resetVisibleCenter()
  }
}

const markFailed = () => {
  failed.value = true
  resetVisibleCenter()
}

watch(normalizedSrc, () => {
  failed.value = false
  resetVisibleCenter()
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
