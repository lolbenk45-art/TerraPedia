<script setup lang="ts">
import { classifyCoverMode, type ArticleCoverMode } from '~/utils/articleCoverMode'

const props = defineProps<{
  src: string
  alt: string
  fallbackText: string
}>()

const coverFailed = ref(false)
// 服务端量不到原生尺寸，先按 sprite（contain）渲染：永不裁切，是最安全的首帧。
const coverMode = ref<ArticleCoverMode>('sprite')

const hasLiveCover = computed(() => Boolean(props.src) && !coverFailed.value)

const markCoverFailed = () => {
  coverFailed.value = true
}

const measureCover = (event: Event) => {
  const image = event.target as HTMLImageElement | null
  coverMode.value = classifyCoverMode(image?.naturalWidth, image?.naturalHeight)
}

watch(() => props.src, () => {
  coverFailed.value = false
  coverMode.value = 'sprite'
})
</script>

<template>
  <img
    v-if="hasLiveCover"
    class="article-archive-cover-art"
    :class="coverMode === 'photo' ? 'is-photo' : 'is-sprite'"
    :src="src"
    :alt="alt"
    loading="lazy"
    @load="measureCover"
    @error="markCoverFailed"
  />
  <span v-else class="public-article-cover-fallback" aria-hidden="true">
    <b>{{ fallbackText }}</b>
    <em>TerraPedia</em>
  </span>
</template>
