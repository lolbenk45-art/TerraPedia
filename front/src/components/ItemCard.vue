<template>
  <div
    class="group relative cursor-pointer overflow-hidden rounded-lg border animate-fade-in card-hover"
    :class="`stagger-${(index % 8) + 1}`"
    style="background-color: var(--bg-secondary); border-color: var(--border-color);"
    @click="$emit('click', item)"
  >
    <div class="relative h-20 overflow-hidden sm:h-24" style="background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary));">
      <div class="absolute inset-0 flex items-center justify-center p-2">
        <img
          v-if="itemImage"
          :src="itemImage"
          :alt="displayName"
          class="h-auto max-h-full w-auto max-w-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
          @error="handleImageError"
        />
        <div v-else class="flex h-8 w-8 items-center justify-center rounded-md text-lg sm:h-10 sm:w-10" style="background-color: var(--bg-primary);">
          {{ itemIcon }}
        </div>
      </div>

      <div v-if="showRarityBadge" class="absolute right-1.5 top-1.5">
        <span
          class="rounded border px-1 py-0.5 text-[9px] font-medium backdrop-blur-sm"
          :style="rarityStyle"
        >
          {{ rarityLabel }}
        </span>
      </div>

      <div class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style="background: linear-gradient(to top, rgba(0,0,0,0.15), transparent);"></div>
    </div>

    <div class="p-2">
      <h3 class="mb-0.5 line-clamp-1 text-xs font-medium transition-colors" style="color: var(--text-primary);">
        {{ displayName }}
      </h3>
      <p v-if="secondaryName" class="line-clamp-1 text-[9px]" style="color: var(--text-muted);">
        {{ secondaryName }}
      </p>

      <div class="mt-1 flex items-center gap-1.5">
        <span v-if="item.stackSize && item.stackSize > 1" class="flex items-center gap-0.5 text-[9px]" style="color: var(--text-secondary);">
          <svg class="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          x{{ item.stackSize }}
        </span>
        <span class="text-[9px]" style="color: var(--text-muted);">
          #{{ item.id }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Item } from '@/types'
import { getRarityPresentation } from '@/utils/rarity'

interface Props {
  item: Item
  index: number
}

const props = defineProps<Props>()
defineEmits<{
  click: [item: Item]
}>()

const imageError = ref(false)

const itemImage = computed(() => {
  if (imageError.value) return null
  const img = props.item.image
  if (!img) return null
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')) {
    return img
  }
  if (img.startsWith('localhost:')) {
    return `http://${img}`
  }
  if (img.startsWith('/')) {
    return img
  }
  return `/${img}`
})
const displayName = computed(() => props.item.nameZh?.trim() || props.item.name)
const secondaryName = computed(() => props.item.nameZh?.trim() ? (props.item.name || props.item.internalName || '') : (props.item.internalName || ''))

const itemIcon = computed(() => {
  const icons = ['🗡️', '🛡️', '🏹', '🪓', '🔭', '💵', '🧪', '📐', '🧱', '⚙️', '📜', '🎵', '🔮', '✨', '🔥', '🦠', '⛏️', '🎲', '🏍']
  const id = props.item.id || 0
  return icons[id % icons.length]
})

const rarityInfo = computed(() => getRarityPresentation(props.item))
const showRarityBadge = computed(() => props.item.rarityId !== undefined || Boolean(props.item.rarity || props.item.rare))
const rarityLabel = computed(() => rarityInfo.value.label)
const rarityStyle = computed(() => rarityInfo.value.badgeStyle)

const handleImageError = () => {
  imageError.value = true
}
</script>

<style scoped>
.group {
  border-color: color-mix(in srgb, var(--border-color) 76%, transparent) !important;
  background-color: color-mix(in srgb, white 58%, var(--bg-secondary)) !important;
  box-shadow: 0 10px 22px rgba(42, 61, 49, 0.05);
}

.group > div:first-child {
  background: linear-gradient(180deg, color-mix(in srgb, white 18%, var(--bg-tertiary)), color-mix(in srgb, var(--bg-secondary) 90%, transparent)) !important;
}

.group img {
  filter: drop-shadow(0 6px 12px rgba(42, 61, 49, 0.12));
}

.group:hover {
  border-color: color-mix(in srgb, var(--accent-primary) 16%, var(--border-color)) !important;
  box-shadow: 0 16px 28px rgba(42, 61, 49, 0.08);
}

.group:hover::after {
  opacity: 1;
}

.group:hover h3 {
  color: var(--accent-primary) !important;
}
</style>
