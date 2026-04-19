<template>
  <div>
    <!-- Category Button -->
    <div :class="(category.level || 0) === 0 ? 'mb-1' : ''">
      <button
        @click="handleClick"
        class="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
        :class="selectedCategory === category.id ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
        :style="[
          selectedCategory === category.id ? {} : { color: 'var(--text-primary)' },
          { paddingLeft: `${8 + (category.level || 0) * 12}px` }
        ]"
        :title="category.name"
      >
        <!-- Expand/Collapse Icon -->
        <span
          v-if="hasChildren"
          @click.stop="toggleExpand"
          class="w-3.5 h-3.5 flex items-center justify-center rounded transition-colors flex-shrink-0 hover:bg-[var(--bg-tertiary)]"
          :class="isExpanded ? 'rotate-90' : ''"
          style="color: var(--text-muted);"
        >
          <svg class="w-3 h-3 transition-transform duration-200" :class="isExpanded ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </span>
        <span v-else class="w-3.5 flex-shrink-0"></span>
        
        <!-- Category Icon -->
        <span class="w-4 h-4 flex items-center justify-center text-[9px] font-semibold tracking-[0.08em] flex-shrink-0">
          {{ categoryIcon(category.name) }}
        </span>
        
        <!-- Category Name -->
        <span class="truncate text-left flex-1">{{ category.name }}</span>
        
        <!-- Category Count -->
        <span
          v-if="displayCount !== null"
          class="px-1 py-0 rounded text-[9px] flex-shrink-0"
          :class="selectedCategory === category.id ? 'bg-white/20' : ''"
          :style="selectedCategory === category.id ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }"
        >
          {{ displayCount }}
        </span>
      </button>
    </div>
    
    <!-- Children -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-[1000px]"
      leave-active-class="transition-all duration-300 ease-in"
      leave-from-class="opacity-100 max-h-[1000px]"
      leave-to-class="opacity-0 max-h-0"
    >
      <div
        v-show="isExpanded && hasChildren"
        class="overflow-hidden"
      >
        <div
          v-if="(category.level || 0) === 0"
          class="ml-3 border-l-2 pl-2 space-y-0.5"
          style="border-color: var(--border-color);"
        >
          <CategoryTreeItem
            v-for="child in category.children"
            :key="child.id"
            :category="child"
            :selected-category="selectedCategory"
            :expanded-ids="expandedIds"
            :category-count-map="categoryCountMap"
            @select="$emit('select', $event)"
            @toggle="$emit('toggle', $event)"
          />
        </div>
        <div v-else class="space-y-0.5">
          <CategoryTreeItem
            v-for="child in category.children"
            :key="child.id"
            :category="child"
            :selected-category="selectedCategory"
            :expanded-ids="expandedIds"
            :category-count-map="categoryCountMap"
            @select="$emit('select', $event)"
            @toggle="$emit('toggle', $event)"
          />
        </div>
      </div>
    </Transition>
    
    <!-- Divider for root level categories -->
    <div
      v-if="(category.level || 0) === 0"
      class="my-1 border-t"
      style="border-color: var(--border-color);"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Category } from '@/types'
import { getCategoryGlyph } from '@/utils/categoryGlyph'

interface Props {
  category: Category
  selectedCategory: number | null
  expandedIds: Set<number>
  categoryCountMap: Map<number, number>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [categoryId: number]
  toggle: [categoryId: number]
}>()

const hasChildren = computed(() => {
  return props.category.children && props.category.children.length > 0
})

const isExpanded = computed(() => {
  return props.expandedIds.has(props.category.id)
})

const displayCount = computed(() => {
  if (!props.categoryCountMap.has(props.category.id)) {
    return null
  }

  return props.categoryCountMap.get(props.category.id) ?? 0
})

const handleClick = () => {
  emit('select', props.category.id)
}

const toggleExpand = () => {
  emit('toggle', props.category.id)
}

const categoryIcon = (name: string): string => getCategoryGlyph(name)

</script>
