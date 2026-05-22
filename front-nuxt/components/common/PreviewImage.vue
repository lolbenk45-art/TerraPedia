<script setup lang="ts">
const props = withDefaults(defineProps<{
  src?: string | null
  alt?: string
  fallback?: string | null
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
const fallbackGlyph = computed(() => {
  const text = String(props.fallback || props.alt || 'TP').trim()
  return Array.from(text)[0] ?? '?'
})
const sourceMarker = computed(() => props.sourceImage || props.src || undefined)
const renderedAlt = computed(() => props.decorative ? '' : props.alt)

const markFailed = () => {
  failed.value = true
}

watch(normalizedSrc, () => {
  failed.value = false
})
</script>

<template>
  <span
    class="item-art tp-preview-image"
    :class="{ 'is-fallback': !hasImage }"
    :data-fallback="fallbackGlyph"
    :data-source-image="sourceMarker"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <img
      v-if="hasImage"
      :src="normalizedSrc"
      :alt="renderedAlt"
      :width="width"
      :height="height"
      :loading="loading"
      decoding="async"
      @error="markFailed"
    />
  </span>
</template>
