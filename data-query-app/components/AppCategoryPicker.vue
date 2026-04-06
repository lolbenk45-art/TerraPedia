<template>
  <div class="category-cascader">
    <div class="category-cascader__head">
      <div class="category-cascader__path" :class="{ 'category-cascader__path--placeholder': !selectedPath }">
        {{ selectedPath || placeholder }}
      </div>
      <button
        v-if="allowClear"
        type="button"
        class="category-cascader__clear"
        :disabled="modelValue == null"
        @click="clearSelection"
      >
        {{ clearText }}
      </button>
    </div>

    <div class="category-cascader__levels" :class="{ 'category-cascader__levels--compact': compact }">
      <label
        v-for="(options, index) in levelOptions"
        :key="`level-${index}`"
        class="category-cascader__level"
      >
        <span class="category-cascader__level-label">第 {{ index + 1 }} 级</span>
        <select
          class="category-cascader__select"
          :value="selectedPathIds[index] ?? ''"
          @change="handleLevelChange(index, $event)"
        >
          <option value="">{{ getLevelPlaceholder(index) }}</option>
          <option
            v-for="option in options"
            :key="option.id"
            :value="option.id"
            :disabled="disabledIds.includes(option.id)"
          >
            {{ option.name }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="title && !compact" class="category-cascader__hint">
      {{ title }}：按层级依次选择，最后停留的层级就是当前分类。
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Category } from '~/stores/categories'

const props = withDefaults(defineProps<{
  modelValue: number | null
  categories: Category[]
  placeholder?: string
  title?: string
  clearText?: string
  allowClear?: boolean
  disabledIds?: number[]
  compact?: boolean
}>(), {
  placeholder: '请选择分类',
  title: '选择分类',
  clearText: '清空选择',
  allowClear: true,
  disabledIds: () => [],
  compact: false
})

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

const selectedPathIds = ref<number[]>([])

const selectedPath = computed(() => {
  const labels = getSelectedNodes(selectedPathIds.value).map(node => node.name)
  return labels.join(' / ')
})

const levelOptions = computed<Category[][]>(() => {
  const levels: Category[][] = []
  let currentNodes = props.categories
  let level = 0

  while (currentNodes.length) {
    levels.push(currentNodes)
    const selectedId = selectedPathIds.value[level]
    const selectedNode = currentNodes.find(node => node.id === selectedId)
    if (!selectedNode?.children?.length) {
      break
    }
    currentNodes = selectedNode.children
    level += 1
  }

  if (!levels.length) {
    levels.push([])
  }

  return levels
})

watch(
  [() => props.modelValue, () => props.categories],
  () => {
    selectedPathIds.value = resolvePathIds(props.modelValue, props.categories)
  },
  { immediate: true, deep: true }
)

function resolvePathIds(targetId: number | null, nodes: Category[]): number[] {
  if (targetId == null) return []

  const walk = (currentNodes: Category[], trail: number[]): number[] | null => {
    for (const node of currentNodes) {
      const nextTrail = [...trail, node.id]
      if (node.id === targetId) {
        return nextTrail
      }
      if (node.children?.length) {
        const found = walk(node.children, nextTrail)
        if (found) return found
      }
    }
    return null
  }

  return walk(nodes, []) ?? []
}

function getSelectedNodes(pathIds: number[]) {
  const nodes: Category[] = []
  let currentNodes = props.categories

  pathIds.forEach((id) => {
    const matched = currentNodes.find(node => node.id === id)
    if (!matched) return
    nodes.push(matched)
    currentNodes = matched.children ?? []
  })

  return nodes
}

function getLevelPlaceholder(index: number) {
  if (index === 0) return '选择顶级分类'
  return `选择第 ${index + 1} 级分类`
}

function handleLevelChange(index: number, event: Event) {
  const target = event.target as HTMLSelectElement
  const rawValue = target.value

  if (!rawValue) {
    const nextPath = selectedPathIds.value.slice(0, index)
    selectedPathIds.value = nextPath
    emit('update:modelValue', nextPath.at(-1) ?? null)
    return
  }

  const nextId = Number(rawValue)
  const nextPath = [...selectedPathIds.value.slice(0, index), nextId]
  selectedPathIds.value = nextPath
  emit('update:modelValue', nextId)
}

function clearSelection() {
  selectedPathIds.value = []
  emit('update:modelValue', null)
}
</script>

<style scoped>
.category-cascader {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-cascader__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.category-cascader__path {
  flex: 1;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  display: flex;
  align-items: center;
  line-height: 1.5;
}

.category-cascader__path--placeholder {
  color: var(--color-text-muted);
}

.category-cascader__clear {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}

.category-cascader__clear:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.category-cascader__levels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.category-cascader__levels--compact {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.category-cascader__level {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.category-cascader__level-label,
.category-cascader__hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.category-cascader__select {
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.category-cascader__select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-muted);
}

.category-cascader__levels--compact .category-cascader__level-label {
  font-size: 0.6875rem;
}

.category-cascader__levels--compact .category-cascader__select {
  min-height: 38px;
  padding: 6px 10px;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .category-cascader__head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
