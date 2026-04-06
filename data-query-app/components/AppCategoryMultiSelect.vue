<template>
  <div class="multi-category">
    <div class="multi-category__head">
      <div class="multi-category__chips">
        <span v-for="option in selectedOptions" :key="option.value" class="multi-category__chip">
          {{ option.pathLabel }}
          <button type="button" class="multi-category__chip-remove" @click="toggleOption(option.value)">×</button>
        </span>
        <span v-if="selectedOptions.length === 0" class="multi-category__placeholder">{{ placeholder }}</span>
      </div>
      <button v-if="selectedOptions.length" type="button" class="multi-category__clear" @click="clearSelection">清空</button>
    </div>

    <label class="multi-category__search">
      <input v-model.trim="search" type="text" class="multi-category__input" placeholder="搜索附属分类" />
    </label>

    <div class="multi-category__list">
      <label v-for="option in visibleOptions" :key="option.value" class="multi-category__option" :class="{ 'multi-category__option--disabled': disabledIds.includes(option.value) }">
        <input
          type="checkbox"
          :checked="modelValue.includes(option.value)"
          :disabled="disabledIds.includes(option.value)"
          @change="toggleOption(option.value)"
        />
        <div class="multi-category__option-copy">
          <strong>{{ option.label }}</strong>
          <span>{{ option.pathLabel }}</span>
        </div>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Category } from '~/stores/categories'

type CategoryOption = {
  value: number
  label: string
  pathLabel: string
}

const props = withDefaults(defineProps<{
  modelValue: number[]
  categories: Category[]
  placeholder?: string
  disabledIds?: number[]
}>(), {
  placeholder: '未选择附属分类',
  disabledIds: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const search = ref('')

const options = computed<CategoryOption[]>(() => {
  const out: CategoryOption[] = []
  const walk = (nodes: Category[], parents: string[] = []) => {
    for (const node of nodes) {
      const path = [...parents, node.name]
      out.push({
        value: node.id,
        label: node.name,
        pathLabel: path.join(' / '),
      })
      if (node.children?.length) {
        walk(node.children, path)
      }
    }
  }
  walk(props.categories)
  return out
})

const visibleOptions = computed(() => {
  const keyword = search.value.toLowerCase()
  if (!keyword) return options.value
  return options.value.filter((option) => option.pathLabel.toLowerCase().includes(keyword))
})

const selectedOptions = computed(() => {
  const selected = new Set(props.modelValue)
  return options.value.filter((option) => selected.has(option.value))
})

function toggleOption(value: number) {
  if (props.disabledIds.includes(value)) return
  const next = new Set(props.modelValue)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  emit('update:modelValue', [...next])
}

function clearSelection() {
  emit('update:modelValue', [])
}
</script>

<style scoped>
.multi-category {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg) 86%, var(--color-bg-secondary));
}
.multi-category__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.multi-category__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.multi-category__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary));
  color: var(--color-text);
  font-size: .8rem;
  font-weight: 700;
}
.multi-category__chip-remove,
.multi-category__clear {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-weight: 700;
}
.multi-category__placeholder {
  color: var(--color-text-muted);
  font-size: .85rem;
}
.multi-category__input {
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}
.multi-category__list {
  max-height: 240px;
  overflow: auto;
  display: grid;
  gap: 8px;
}
.multi-category__option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
}
.multi-category__option--disabled {
  opacity: .55;
}
.multi-category__option-copy {
  display: grid;
  gap: 3px;
}
.multi-category__option-copy strong {
  color: var(--color-text);
}
.multi-category__option-copy span {
  color: var(--color-text-secondary);
  font-size: .82rem;
  line-height: 1.5;
}
</style>
