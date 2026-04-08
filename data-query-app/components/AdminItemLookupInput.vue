<template>
  <div ref="rootRef" class="lookup">
    <div ref="controlRef" class="lookup__control">
      <span class="lookup__icon" aria-hidden="true">Go</span>
      <input
        ref="inputRef"
        v-model.trim="query"
        type="text"
        class="input"
        :placeholder="placeholder"
        @focus="handleFocus"
        @input="handleInput"
        @compositionstart="isComposing = true"
        @compositionend="handleCompositionEnd"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="pickActive"
        @keydown.esc.prevent="closeMenu"
      />
      <button v-if="modelValue || query" type="button" class="lookup__clear" @click="clearSelection">清空</button>
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen && (loading || suggestions.length || hasSearched)"
        ref="menuRef"
        class="lookup__menu"
        :style="menuStyle"
      >
        <div v-if="loading" class="lookup__status">搜索中...</div>
        <div v-else-if="hasSearched && !suggestions.length" class="lookup__status">没有匹配物品</div>
        <button
          v-for="item in suggestions"
          :key="item.id"
          type="button"
          class="lookup__option"
          :class="{ 'lookup__option--active': activeId === item.id }"
          @mouseenter="setActive(item.id)"
          @mousedown.prevent
          @click="pick(item)"
        >
          <div class="lookup__option-main">{{ item.nameZh || item.name }}</div>
          <div class="lookup__option-sub">
            <span v-if="item.nameZh && item.name">{{ item.name }}</span>
            <span v-if="item.internalName">{{ item.internalName }}</span>
            <span>#{{ item.id }}</span>
          </div>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { get } from '~/composables/useApi'

interface SuggestionItem {
  id: number
  name: string
  nameZh?: string
  internalName?: string
  image?: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  updateOnInput?: boolean
}>(), {
  modelValue: '',
  placeholder: '',
  updateOnInput: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  pick: [item: SuggestionItem]
}>()

const rootRef = ref<HTMLElement | null>(null)
const controlRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const query = ref(props.modelValue)
const suggestions = ref<SuggestionItem[]>([])
const isOpen = ref(false)
const isComposing = ref(false)
const loading = ref(false)
const hasSearched = ref(false)
const activeId = ref<number | null>(null)
const hasExplicitNavigation = ref(false)
const isFocused = ref(false)
const menuStyle = ref<Record<string, string>>({})

const LOOKUP_DEBOUNCE_MS = 180

let timer: ReturnType<typeof setTimeout> | null = null
let requestSerial = 0
let suppressNextLookup = false

watch(() => props.modelValue, (value) => {
  if (props.updateOnInput === false && isFocused.value && value) {
    return
  }
  query.value = value ?? ''
})

watch(query, (value) => {
  if (props.updateOnInput) {
    emit('update:modelValue', value)
  }

  if (suppressNextLookup) {
    return
  }

  scheduleLookup(value)
})

function clearLookupTimer() {
  if (!timer) return
  clearTimeout(timer)
  timer = null
}

function invalidateLookupState(options: { close?: boolean } = {}) {
  requestSerial += 1
  suggestions.value = []
  activeId.value = null
  loading.value = false
  hasSearched.value = false
  hasExplicitNavigation.value = false

  if (options.close) {
    closeMenu()
  }
}

function normalizeSuggestionItem(item: any): SuggestionItem | null {
  const normalized = {
    id: Number(item?.id ?? 0),
    name: String(item?.name ?? ''),
    nameZh: String(item?.nameZh ?? item?.name_zh ?? ''),
    internalName: String(item?.internalName ?? item?.internal_name ?? ''),
    image: String(item?.image ?? item?.imageUrl ?? item?.image_url ?? ''),
  }

  return normalized.id > 0 ? normalized : null
}

async function runLookup(trimmed: string) {
  const serial = ++requestSerial
  loading.value = true
  hasSearched.value = false
  activeId.value = null
  hasExplicitNavigation.value = false
  openMenu()

  try {
    const response: any = await get('/items/suggestions', { keyword: trimmed, limit: 8 })
    if (serial !== requestSerial) return

    const list = response?.data ?? response ?? []
    suggestions.value = Array.isArray(list)
      ? list.map(normalizeSuggestionItem).filter((item: SuggestionItem | null): item is SuggestionItem => item !== null)
      : []
    hasSearched.value = true
    openMenu()
  } catch (error) {
    if (serial !== requestSerial) return
    console.error('lookup suggestions failed', error)
    suggestions.value = []
    hasSearched.value = true
    activeId.value = null
    hasExplicitNavigation.value = false
    openMenu()
  } finally {
    if (serial === requestSerial) {
      loading.value = false
      updateMenuPosition()
    }
  }
}

function scheduleLookup(value: string) {
  clearLookupTimer()
  if (isComposing.value) return

  const trimmed = value.trim()
  if (!trimmed) {
    invalidateLookupState({ close: true })
    return
  }

  timer = setTimeout(() => {
    void runLookup(trimmed)
  }, LOOKUP_DEBOUNCE_MS)
}

function suppressUpcomingLookup() {
  suppressNextLookup = true
  nextTick(() => {
    suppressNextLookup = false
  })
}

function handleFocus() {
  isFocused.value = true
  if (loading.value || suggestions.value.length > 0 || (hasSearched.value && query.value.trim())) {
    openMenu()
  }
}

function handleInput() {
  if (!props.updateOnInput) {
    hasSearched.value = false
  }
}

function handleCompositionEnd(event: CompositionEvent) {
  isComposing.value = false
  const nextValue = String((event.target as HTMLInputElement)?.value ?? query.value)
  if (query.value !== nextValue) {
    query.value = nextValue
  }
  scheduleLookup(nextValue)
}

function moveActive(direction: 1 | -1) {
  if (!suggestions.value.length) return
  openMenu()
  hasExplicitNavigation.value = true
  const currentIndex = suggestions.value.findIndex((item) => item.id === activeId.value)
  const nextIndex = currentIndex < 0
    ? (direction === 1 ? 0 : suggestions.value.length - 1)
    : (currentIndex + direction + suggestions.value.length) % suggestions.value.length
  activeId.value = suggestions.value[nextIndex]?.id ?? null
}

function setActive(id: number) {
  activeId.value = id
  hasExplicitNavigation.value = true
}

function pickActive() {
  if (!isOpen.value || !suggestions.value.length || !hasExplicitNavigation.value || activeId.value == null) return
  const active = suggestions.value.find((item) => item.id === activeId.value)
  if (active) {
    pick(active)
  }
}

function pick(item: SuggestionItem) {
  suppressUpcomingLookup()
  clearLookupTimer()
  query.value = item.nameZh || item.name
  emit('update:modelValue', query.value)
  emit('pick', item)
  activeId.value = item.id
  hasExplicitNavigation.value = false
  hasSearched.value = false
  closeMenu()
}

function clearSelection() {
  clearLookupTimer()
  query.value = ''
  invalidateLookupState({ close: true })
  emit('update:modelValue', '')
  emit('pick', { id: 0, name: '', nameZh: '', internalName: '', image: '' })
}

function openMenu() {
  isOpen.value = true
  nextTick(() => updateMenuPosition())
}

function closeMenu() {
  isOpen.value = false
}

function updateMenuPosition() {
  const control = controlRef.value
  if (!control || !isOpen.value) return

  const rect = control.getBoundingClientRect()
  const viewportPadding = 12
  const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2)
  const maxHeight = 280
  const belowSpace = window.innerHeight - rect.bottom - viewportPadding
  const aboveSpace = rect.top - viewportPadding
  const placeAbove = belowSpace < 220 && aboveSpace > belowSpace
  const top = placeAbove
    ? Math.max(viewportPadding, rect.top - Math.min(maxHeight, aboveSpace) - 8)
    : Math.max(viewportPadding, Math.min(rect.bottom + 8, window.innerHeight - viewportPadding - maxHeight))
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - viewportPadding - width),
  )

  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (rootRef.value?.contains(target)) return
  if (menuRef.value?.contains(target)) return
  isFocused.value = false
  closeMenu()
}

function handleWindowLayoutChange() {
  updateMenuPosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('resize', handleWindowLayoutChange)
  window.addEventListener('scroll', handleWindowLayoutChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('resize', handleWindowLayoutChange)
  window.removeEventListener('scroll', handleWindowLayoutChange, true)
  clearLookupTimer()
})
</script>

<style scoped>
.lookup { position: relative; width: 100%; min-width: 0; }

.lookup__control {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.lookup__icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: color-mix(in srgb, var(--color-primary) 50%, var(--color-text-secondary));
  font-size: 0.72rem;
  text-transform: uppercase;
  font-weight: 700;
  pointer-events: none;
}

.lookup :deep(.input) {
  min-height: 50px;
  padding: 12px 84px 12px 44px;
  border-radius: 16px;
  border-color: color-mix(in srgb, var(--color-border) 88%, var(--color-primary-muted));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 94%, transparent), color-mix(in srgb, var(--color-bg-secondary) 96%, transparent));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 10%, transparent),
    0 0 0 0 transparent;
  transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
}

.lookup__control:focus-within :deep(.input) {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 12%, transparent),
    0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.lookup__clear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, var(--color-bg));
  color: var(--color-text-secondary);
  font-size: .76rem;
  font-weight: 700;
  cursor: pointer;
  transition: color .18s ease, border-color .18s ease, background-color .18s ease;
}

.lookup__clear:hover {
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
}

.lookup__menu {
  z-index: 1200;
  max-height: 280px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-primary-muted));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg) 94%, transparent));
  box-shadow:
    0 22px 46px color-mix(in srgb, #000 24%, transparent),
    0 2px 10px color-mix(in srgb, var(--color-primary) 10%, transparent);
  backdrop-filter: blur(14px);
}

.lookup__status {
  padding: 14px 16px;
  color: var(--color-text-secondary);
  font-size: .84rem;
}

.lookup__option {
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, transform .18s ease;
}

.lookup__option--active,
.lookup__option:hover {
  border-color: color-mix(in srgb, var(--color-primary) 34%, transparent);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
  transform: translateY(-1px);
}

.lookup__option-main {
  color: var(--color-text);
  font-weight: 700;
}

.lookup__option-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: .78rem;
}

:global(.dark) .lookup :deep(.input) {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, #091015), color-mix(in srgb, var(--color-bg) 94%, #060a0d));
  border-color: color-mix(in srgb, var(--color-border) 74%, var(--color-primary-muted));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18);
}

:global(.dark) .lookup__menu {
  background:
    linear-gradient(180deg, rgba(20, 27, 33, 0.96), rgba(14, 19, 24, 0.98));
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
}
</style>
