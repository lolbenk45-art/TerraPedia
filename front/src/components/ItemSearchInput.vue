<template>
  <div ref="rootRef" class="item-search" :class="[`item-search--${variant}`]">
    <div class="item-search__control">
      <svg
        class="item-search__icon"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        :value="modelValue"
        :placeholder="placeholder"
        class="item-search__input"
        :class="{ 'item-search__input--active': modelValue.trim().length > 0 }"
        type="text"
        @focus="handleFocus"
        @input="handleInput"
        @keydown="handleKeydown"
      />
      <button
        v-if="modelValue"
        type="button"
        class="item-search__clear"
        :class="{ 'item-search__clear--with-submit': showSubmitButton }"
        @click="clearInput"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <button
        v-if="showSubmitButton"
        type="button"
        class="item-search__submit"
        @click="handleSubmit"
      >
        {{ submitText }}
      </button>
    </div>

    <div v-if="shouldShowDropdown" class="item-search__dropdown">
      <div v-if="loading" class="item-search__state">联想加载中...</div>
      <template v-else>
        <button
          v-for="(suggestion, index) in suggestions"
          :key="suggestion.id"
          type="button"
          class="item-search__suggestion"
          :class="{ 'item-search__suggestion--active': index === highlightedIndex }"
          @mouseenter="highlightedIndex = index"
          @mousedown.prevent="selectSuggestion(suggestion)"
        >
          <div class="item-search__suggestion-main">
            <span class="item-search__suggestion-icon">📦</span>
            <div class="item-search__suggestion-text">
              <span class="item-search__suggestion-name">{{ suggestion.name }}</span>
              <span class="item-search__suggestion-meta">
                {{ suggestion.categoryName || suggestion.category || '未分类' }}
                <template v-if="suggestion.rarity || suggestion.rare">
                  · {{ suggestion.rarity || suggestion.rare }}
                </template>
              </span>
            </div>
          </div>
          <span class="item-search__suggestion-action">详情</span>
        </button>

        <div v-if="suggestions.length === 0" class="item-search__state">
          未找到匹配物品
        </div>

        <button
          v-if="trimmedValue"
          type="button"
          class="item-search__search-all"
          @mousedown.prevent="handleSubmit"
        >
          搜索“{{ trimmedValue }}”的全部结果
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchItemSuggestions } from '@/api'
import type { ItemSuggestion } from '@/types'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  submitText?: string
  showSubmitButton?: boolean
  variant?: 'default' | 'compact' | 'hero'
}>(), {
  placeholder: '搜索物品...',
  submitText: '搜索',
  showSubmitButton: false,
  variant: 'default',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'pick', suggestion: ItemSuggestion): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const suggestions = ref<ItemSuggestion[]>([])
const loading = ref(false)
const highlightedIndex = ref(-1)
const open = ref(false)
const trimmedValue = computed(() => props.modelValue.trim())
const shouldShowDropdown = computed(() => open.value && trimmedValue.value.length > 0)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let activeRequestId = 0

const closeDropdown = () => {
  open.value = false
  highlightedIndex.value = -1
}

const handleDocumentPointerDown = (event: PointerEvent) => {
  if (!rootRef.value?.contains(event.target as Node)) {
    closeDropdown()
  }
}

const loadSuggestions = async (keyword: string) => {
  const requestId = ++activeRequestId
  loading.value = true

  try {
    const data = await fetchItemSuggestions(keyword)
    if (requestId !== activeRequestId) {
      return
    }
    suggestions.value = data
    highlightedIndex.value = -1
    open.value = true
  } finally {
    if (requestId === activeRequestId) {
      loading.value = false
    }
  }
}

const clearInput = () => {
  emit('update:modelValue', '')
  suggestions.value = []
  closeDropdown()
}

const handleInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

const handleFocus = () => {
  if (trimmedValue.value && (loading.value || suggestions.value.length > 0)) {
    open.value = true
  }
}

const handleSubmit = () => {
  closeDropdown()
  emit('submit')
}

const selectSuggestion = (suggestion: ItemSuggestion) => {
  emit('update:modelValue', suggestion.name)
  closeDropdown()
  emit('pick', suggestion)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeDropdown()
    return
  }

  if (!shouldShowDropdown.value) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    }
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!suggestions.value.length) {
      return
    }
    highlightedIndex.value = (highlightedIndex.value + 1 + suggestions.value.length) % suggestions.value.length
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!suggestions.value.length) {
      return
    }
    highlightedIndex.value = (highlightedIndex.value - 1 + suggestions.value.length) % suggestions.value.length
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    if (highlightedIndex.value >= 0 && suggestions.value[highlightedIndex.value]) {
      selectSuggestion(suggestions.value[highlightedIndex.value])
    } else {
      handleSubmit()
    }
  }
}

watch(() => props.modelValue, value => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  const keyword = value.trim()
  if (!keyword) {
    loading.value = false
    suggestions.value = []
    closeDropdown()
    return
  }

  debounceTimer = setTimeout(() => {
    void loadSuggestions(keyword)
  }, 180)
})

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<style scoped>
.item-search {
  position: relative;
}

.item-search__control {
  position: relative;
  display: flex;
  align-items: center;
}

.item-search__icon {
  position: absolute;
  top: 50%;
  left: 0.875rem;
  z-index: 1;
  width: 1rem;
  height: 1rem;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.item-search__input {
  width: 100%;
  border: 1px solid var(--border-color);
  background-color: color-mix(in srgb, white 70%, var(--bg-secondary));
  color: var(--text-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.item-search__input:focus {
  outline: none;
  border-color: var(--accent-primary);
  background-color: color-mix(in srgb, white 82%, var(--bg-secondary));
}

.item-search__input--active {
  border-color: var(--accent-primary);
}

.item-search__clear,
.item-search__submit,
.item-search__suggestion,
.item-search__search-all {
  border: none;
  background: none;
}

.item-search__clear {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  transform: translateY(-50%);
  border-radius: 999px;
  color: var(--text-muted);
}

.item-search__clear:hover {
  background: color-mix(in srgb, var(--bg-tertiary) 72%, white 28%);
}

.item-search__clear--with-submit {
  right: 4.25rem;
}

.item-search__clear svg {
  width: 0.875rem;
  height: 0.875rem;
}

.item-search__submit {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  z-index: 1;
  transform: translateY(-50%);
  border-radius: 0.75rem;
  background: linear-gradient(135deg, var(--accent-primary), color-mix(in srgb, var(--accent-primary) 84%, var(--accent-secondary)));
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  box-shadow: 0 8px 18px rgba(93, 138, 110, 0.12);
}

.item-search__dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  z-index: 40;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  background: color-mix(in srgb, white 76%, var(--bg-secondary));
  box-shadow: 0 18px 36px rgba(42, 61, 49, 0.1);
  backdrop-filter: blur(10px);
}

.item-search__state {
  padding: 0.875rem 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.item-search__suggestion {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  text-align: left;
  transition: background-color 0.15s ease;
}

.item-search__suggestion:hover,
.item-search__suggestion--active {
  background: color-mix(in srgb, var(--bg-tertiary) 68%, white 32%);
}

.item-search__suggestion + .item-search__suggestion,
.item-search__search-all {
  border-top: 1px solid var(--border-color);
}

.item-search__suggestion-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.item-search__suggestion-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--bg-tertiary) 60%, white 40%);
  color: var(--accent-primary);
}

.item-search__suggestion-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.item-search__suggestion-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text-primary);
}

.item-search__suggestion-meta,
.item-search__suggestion-action {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.item-search__search-all {
  display: block;
  width: 100%;
  padding: 0.875rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--accent-primary);
}

.item-search--default .item-search__input {
  border-radius: 0.75rem;
  padding: 0.5rem 2.5rem 0.5rem 2.5rem;
  font-size: 0.875rem;
}

.item-search--compact .item-search__icon {
  left: 0.625rem;
  width: 1rem;
  height: 1rem;
}

.item-search--compact .item-search__input {
  border-radius: 0.75rem;
  padding: 0.5rem 2rem 0.5rem 2rem;
  font-size: 0.875rem;
}

.item-search--hero .item-search__icon {
  left: 1rem;
  width: 1.25rem;
  height: 1.25rem;
}

.item-search--hero .item-search__input {
  border-radius: 1rem;
  padding: 0.875rem 5rem 0.875rem 3rem;
  font-size: 1rem;
  box-shadow: 0 14px 28px rgba(42, 61, 49, 0.08);
}

.item-search--hero .item-search__clear--with-submit {
  right: 5rem;
}

.item-search--hero .item-search__submit {
  right: 0.5rem;
  padding: 0.625rem 1rem;
}

@media (max-width: 768px) {
  .item-search__dropdown {
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
  }

  .item-search__suggestion {
    padding: 0.75rem 0.875rem;
  }
}
</style>
