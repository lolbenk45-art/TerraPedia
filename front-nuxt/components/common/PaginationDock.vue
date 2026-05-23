<script setup lang="ts">
type PageWindowItem = number | 'gap'

const props = withDefaults(defineProps<{
  currentPage: number
  totalPages: number
  disabled?: boolean
  ariaLabel?: string
  summarySuffix?: string
  jumpId?: string
  showBoundaryControls?: boolean
  showJump?: boolean
  pageSize?: number
  pageSizeOptions?: readonly number[]
  pageSizeLabel?: string
}>(), {
  disabled: false,
  ariaLabel: '分页',
  summarySuffix: '',
  jumpId: 'pagination-page-jump',
  showBoundaryControls: false,
  showJump: true,
  pageSizeLabel: '每页',
})

const emit = defineEmits<{
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()

const jumpPageInput = ref('')

const normalizedTotalPages = computed(() => {
  const pages = Number(props.totalPages)
  return Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 1
})

const normalizedCurrentPage = computed(() => {
  const page = Number(props.currentPage)
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  return Math.min(Math.max(1, safePage), normalizedTotalPages.value)
})

const canGoPrevious = computed(() => !props.disabled && normalizedCurrentPage.value > 1)
const canGoNext = computed(() => !props.disabled && normalizedCurrentPage.value < normalizedTotalPages.value)
const hasPageSizeOptions = computed(() => (
  Number.isFinite(Number(props.pageSize))
  && Array.isArray(props.pageSizeOptions)
  && props.pageSizeOptions.length > 0
))

const pageWindowItems = computed<PageWindowItem[]>(() => {
  if (props.disabled) return [1]

  const pages = normalizedTotalPages.value
  const page = normalizedCurrentPage.value
  const candidates = new Set([1, pages])

  for (let index = page - 2; index <= page + 2; index += 1) {
    if (index >= 1 && index <= pages) {
      candidates.add(index)
    }
  }

  return [...candidates].sort((left, right) => left - right).reduce<PageWindowItem[]>((items, item) => {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && item - previous > 1) {
      items.push('gap')
    }
    items.push(item)
    return items
  }, [])
})

const summaryLabel = computed(() => {
  const suffix = props.summarySuffix.trim()
  const base = `第 ${normalizedCurrentPage.value} / ${normalizedTotalPages.value} 页`
  return suffix ? `${base} · ${suffix}` : base
})

const pageButtonLabel = (page: number) => `第 ${page} 页`

const emitPageChange = (page: number) => {
  if (props.disabled) return

  const nextPage = Math.min(Math.max(1, page), normalizedTotalPages.value)
  if (nextPage === normalizedCurrentPage.value) return

  jumpPageInput.value = ''
  emit('page-change', nextPage)
}

const goToJumpPage = () => {
  const page = Number(jumpPageInput.value)
  emitPageChange(Number.isFinite(page) && page > 0 ? Math.floor(page) : normalizedCurrentPage.value)
}
</script>

<template>
  <nav class="catalog-page-dock" :aria-label="ariaLabel">
    <span class="catalog-page-dock-summary">{{ summaryLabel }}</span>

    <div class="catalog-page-dock-core">
      <button
        v-if="showBoundaryControls"
        class="catalog-dock-button"
        type="button"
        :disabled="!canGoPrevious"
        @click="emitPageChange(1)"
      >
        首页
      </button>
      <button
        class="catalog-dock-icon-button"
        type="button"
        aria-label="上一页"
        :disabled="!canGoPrevious"
        @click="emitPageChange(normalizedCurrentPage - 1)"
      >
        ‹
      </button>

      <template v-for="(pageItem, index) in pageWindowItems" :key="`${pageItem}-${index}`">
        <span v-if="pageItem === 'gap'" class="catalog-page-gap">…</span>
        <button
          v-else
          class="catalog-dock-page-button"
          type="button"
          :class="{ active: pageItem === normalizedCurrentPage }"
          :aria-current="!disabled && pageItem === normalizedCurrentPage ? 'page' : undefined"
          :aria-label="pageButtonLabel(pageItem)"
          :disabled="disabled"
          @click="emitPageChange(pageItem)"
        >
          {{ pageItem }}
        </button>
      </template>

      <button
        class="catalog-dock-icon-button"
        type="button"
        aria-label="下一页"
        :disabled="!canGoNext"
        @click="emitPageChange(normalizedCurrentPage + 1)"
      >
        ›
      </button>
      <button
        v-if="showBoundaryControls"
        class="catalog-dock-button"
        type="button"
        :disabled="!canGoNext"
        @click="emitPageChange(normalizedTotalPages)"
      >
        末页
      </button>
    </div>

    <form v-if="showJump" class="catalog-dock-jump-form" aria-label="跳页" @submit.prevent="goToJumpPage">
      <label :for="jumpId">跳至</label>
      <input
        :id="jumpId"
        v-model="jumpPageInput"
        type="number"
        inputmode="numeric"
        min="1"
        :max="normalizedTotalPages"
        :placeholder="String(normalizedCurrentPage)"
        :disabled="disabled"
      />
      <span>/ {{ normalizedTotalPages }}</span>
      <button class="catalog-dock-button" type="submit" :disabled="disabled">前往</button>
    </form>

    <div v-if="hasPageSizeOptions" class="catalog-density-picker" aria-label="每页数量">
      <span>{{ pageSizeLabel }}</span>
      <button
        v-for="option in pageSizeOptions"
        :key="option"
        class="catalog-density-chip"
        :class="{ active: option === pageSize }"
        type="button"
        :aria-pressed="option === pageSize"
        :disabled="disabled"
        @click="emit('page-size-change', option)"
      >
        {{ option }}
      </button>
    </div>
  </nav>
</template>
