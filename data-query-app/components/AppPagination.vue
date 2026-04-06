<template>
  <div v-if="normalizedTotalPages > 0" class="app-pagination">
    <div class="app-pagination__meta">
      <span class="app-pagination__total">共 {{ total }} 条</span>
      <span class="app-pagination__summary">第 {{ currentPage }} / {{ normalizedTotalPages }} 页</span>
    </div>

    <div class="app-pagination__controls">
      <button
        type="button"
        class="app-pagination__btn"
        :disabled="currentPage <= 1"
        @click="emitChange(1)"
      >
        首页
      </button>
      <button
        type="button"
        class="app-pagination__btn"
        :disabled="currentPage <= 1"
        @click="emitChange(currentPage - 1)"
      >
        上一页
      </button>

      <div class="app-pagination__pages" aria-label="页码导航">
        <button
          v-for="token in pageTokens"
          :key="token.key"
          type="button"
          class="app-pagination__page"
          :class="{ 'app-pagination__page--active': token.type === 'page' && token.value === currentPage }"
          :disabled="token.type === 'ellipsis'"
          @click="token.type === 'page' && emitChange(token.value)"
        >
          {{ token.type === 'page' ? token.value : '...' }}
        </button>
      </div>

      <button
        type="button"
        class="app-pagination__btn"
        :disabled="currentPage >= normalizedTotalPages"
        @click="emitChange(currentPage + 1)"
      >
        下一页
      </button>
      <button
        type="button"
        class="app-pagination__btn"
        :disabled="currentPage >= normalizedTotalPages"
        @click="emitChange(normalizedTotalPages)"
      >
        末页
      </button>
    </div>

    <form class="app-pagination__jump" @submit.prevent="submitJump">
      <label class="app-pagination__jump-label" for="pagination-jump">跳至</label>
      <input
        id="pagination-jump"
        v-model="jumpInput"
        type="number"
        min="1"
        :max="String(normalizedTotalPages)"
        class="app-pagination__jump-input"
        placeholder="页码"
      />
      <span class="app-pagination__jump-suffix">页</span>
      <button type="submit" class="app-pagination__jump-btn">确定</button>
    </form>
  </div>
</template>

<script setup lang="ts">
type PageToken =
  | { key: string; type: 'page'; value: number }
  | { key: string; type: 'ellipsis' }

const props = withDefaults(defineProps<{
  page: number
  total: number
  totalPages: number
  windowSize?: number
}>(), {
  windowSize: 2
})

const emit = defineEmits<{
  (e: 'change', page: number): void
}>()

const jumpInput = ref('')

const normalizedTotalPages = computed(() => Math.max(0, props.totalPages || 0))
const currentPage = computed(() => {
  if (!normalizedTotalPages.value) return 1
  return Math.min(Math.max(props.page || 1, 1), normalizedTotalPages.value)
})

const pageTokens = computed<PageToken[]>(() => {
  const total = normalizedTotalPages.value
  const current = currentPage.value
  const windowSize = Math.max(props.windowSize, 1)
  if (total <= 0) return []

  const pages = new Set<number>([1, total])
  for (let page = current - windowSize; page <= current + windowSize; page += 1) {
    if (page >= 1 && page <= total) {
      pages.add(page)
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b)
  const tokens: PageToken[] = []

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1]
    if (index > 0 && previous && page - previous > 1) {
      tokens.push({ key: `ellipsis-${previous}-${page}`, type: 'ellipsis' })
    }
    tokens.push({ key: `page-${page}`, type: 'page', value: page })
  })

  return tokens
})

watch(
  () => props.page,
  (page) => {
    jumpInput.value = String(page || '')
  },
  { immediate: true }
)

function clampPage(page: number) {
  return Math.min(Math.max(page, 1), Math.max(normalizedTotalPages.value, 1))
}

function emitChange(page: number) {
  if (!normalizedTotalPages.value) return
  const nextPage = clampPage(page)
  if (nextPage === currentPage.value) return
  emit('change', nextPage)
}

function submitJump() {
  if (!jumpInput.value.trim()) return
  const target = Number(jumpInput.value)
  if (!Number.isFinite(target)) {
    jumpInput.value = String(currentPage.value)
    return
  }
  emitChange(target)
  jumpInput.value = String(clampPage(target))
}
</script>

<style scoped>
.app-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.app-pagination__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.app-pagination__total,
.app-pagination__summary,
.app-pagination__jump-label,
.app-pagination__jump-suffix {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.app-pagination__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.app-pagination__pages {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.app-pagination__btn,
.app-pagination__page,
.app-pagination__jump-btn {
  min-width: 40px;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.app-pagination__btn:hover:not(:disabled),
.app-pagination__page:hover:not(:disabled),
.app-pagination__jump-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
}

.app-pagination__btn:disabled,
.app-pagination__page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-pagination__page--active {
  border-color: transparent;
  background: var(--color-primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
}

.app-pagination__jump {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.app-pagination__jump-input {
  width: 76px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  text-align: center;
}

.app-pagination__jump-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-muted);
}

@media (max-width: 960px) {
  .app-pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .app-pagination__controls,
  .app-pagination__pages {
    width: 100%;
  }
}
</style>
