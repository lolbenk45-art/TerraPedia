<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background-color: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);"
        @click.self="$emit('close')"
      >
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            class="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
            style="background-color: var(--bg-primary);"
          >
            <button
              class="absolute right-3 top-3 z-10 rounded-full p-2 transition-colors"
              style="background-color: rgba(0,0,0,0.3); color: white;"
              @click="$emit('close')"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div class="relative flex h-40 items-center justify-center overflow-hidden p-4 sm:h-48" style="background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary));">
              <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(circle at 2px 2px, var(--text-muted) 1px, transparent 0); background-size: 20px 20px;"></div>

              <div class="relative z-10 flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
                <img
                  v-if="itemImage"
                  :src="itemImage"
                  :alt="displayName"
                  class="h-full w-full object-contain drop-shadow-xl"
                  style="image-rendering: pixelated; image-rendering: crisp-edges;"
                  @error="imageError = true"
                />
                <div v-else class="flex h-20 w-20 items-center justify-center rounded-xl text-sm font-semibold tracking-[0.12em]" style="background-color: var(--bg-primary);">
                  {{ itemIcon }}
                </div>
              </div>
            </div>

            <div class="p-4">
              <div class="mb-3">
                <h2 class="mb-1.5 text-lg font-bold" style="color: var(--text-primary);">
                  {{ displayName }}
                </h2>
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    v-if="showRarityBadge"
                    class="rounded border px-2 py-0.5 text-xs font-medium"
                    :style="rarityStyle"
                  >
                    {{ rarityLabel }}
                  </span>
                  <span class="text-xs font-mono" style="color: var(--text-muted);">
                    ID: {{ item.id }}
                  </span>
                </div>
                <p v-if="secondaryName" class="mt-1.5 text-xs font-mono" style="color: var(--text-secondary);">
                  {{ secondaryName }}
                </p>
              </div>

              <div v-if="item.descriptionZh || item.description || item.tooltipZh || item.tooltip" class="mb-3 rounded-lg border p-2.5" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
                <p class="text-xs leading-relaxed" style="color: var(--text-secondary);">
                  {{ item.descriptionZh || item.description || item.tooltipZh || item.tooltip }}
                </p>
              </div>

              <div v-if="Object.keys(itemStats).length > 0" class="mb-3">
                <h3 class="mb-1.5 text-[10px] font-medium uppercase tracking-wider" style="color: var(--text-muted);">
                  物品属性
                </h3>
                <div class="grid grid-cols-2 gap-1.5">
                  <div
                    v-for="(value, key) in itemStats"
                    :key="key"
                    class="rounded-lg border p-2"
                    style="background-color: var(--bg-secondary); border-color: var(--border-color);"
                  >
                    <span class="text-[9px] uppercase tracking-wider" style="color: var(--text-muted);">
                      {{ formatStatLabel(key) }}
                    </span>
                    <p class="mt-0.5 text-xs font-semibold" style="color: var(--text-primary);">
                      {{ formatStatValue(value) }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="space-y-1 border-t pt-2.5" style="border-color: var(--border-color);">
                <div v-if="item.categoryId" class="flex items-center justify-between text-xs">
                  <span style="color: var(--text-muted);">分类</span>
                  <span style="color: var(--text-primary);">{{ categoryName }}</span>
                </div>
                <div v-if="item.createdAt" class="flex items-center justify-between text-xs">
                  <span style="color: var(--text-muted);">创建时间</span>
                  <span style="color: var(--text-primary);">{{ formatDate(item.createdAt) }}</span>
                </div>
                <div v-if="item.updatedAt && item.updatedAt !== item.createdAt" class="flex items-center justify-between text-xs">
                  <span style="color: var(--text-muted);">更新时间</span>
                  <span style="color: var(--text-primary);">{{ formatDate(item.updatedAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores'
import type { Item } from '@/types'
import { getRarityPresentation } from '@/utils/rarity'
import { getItemFallbackMark } from '@/utils/itemFallbackMark'

interface Props {
  item: Item
}

const props = defineProps<Props>()
defineEmits<{
  close: []
}>()

const store = useAppStore()
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
  return getItemFallbackMark({
    id: props.item.id,
    name: displayName.value,
    category: props.item.categoryName || props.item.category,
  })
})

const rarityInfo = computed(() => getRarityPresentation(props.item))
const showRarityBadge = computed(() => props.item.rarityId !== undefined || Boolean(props.item.rarity || props.item.rare))
const rarityLabel = computed(() => rarityInfo.value.label)
const rarityStyle = computed(() => rarityInfo.value.badgeStyle)

const categoryName = computed(() => {
  const category = store.categories.find(c => c.id === props.item.categoryId)
  return category?.name || `分类 ${props.item.categoryId}`
})

const itemStats = computed(() => {
  const stats: Record<string, unknown> = {}

  if (props.item.stackSize && props.item.stackSize > 1) {
    stats.stackSize = props.item.stackSize
  }
  if (props.item.damage) {
    stats.damage = props.item.damage
  }
  if (props.item.defense) {
    stats.defense = props.item.defense
  }
  if (props.item.knockback) {
    stats.knockback = props.item.knockback
  }
  if (props.item.useTime) {
    stats.useTime = props.item.useTime
  }
  if (props.item.gamePeriodId) {
    stats.period = `时期 ${props.item.gamePeriodId}`
  }
  if (props.item.isStackable !== undefined) {
    stats.stackable = props.item.isStackable ? '可堆叠' : '不可堆叠'
  }

  return stats
})

const formatStatLabel = (key: string): string => {
  const labels: Record<string, string> = {
    stackSize: '堆叠数量',
    damage: '伤害',
    defense: '防御',
    knockback: '击退',
    useTime: '使用时间',
    period: '游戏时期',
    stackable: '堆叠',
  }
  return labels[key] || key
}

const formatStatValue = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  return String(value)
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>
