<template>
  <div class="category-drawer">
    <header class="drawer-header">
      <div class="flex items-center gap-2">
        <button
          @click="$emit('close')"
          class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="关闭分类菜单"
        >
          <svg class="w-5 h-5" style="color: var(--text-secondary);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2>物品分类</h2>
      </div>
      <button @click="$emit('close')" class="close-btn lg:hidden" aria-label="关闭分类菜单">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div class="search-box">
      <svg class="w-4 h-4 flex-shrink-0" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索分类..."
        class="flex-1 bg-transparent border-none outline-none text-sm"
        style="color: var(--text-primary);"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
        style="color: var(--text-muted);"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="stats">
      <span>{{ rootCategories.length }} 个分类</span>
      <span>{{ totalItems }} 个物品</span>
    </div>

    <div class="quick-actions">
      <button
        @click="toggleAllCategories"
        class="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all border hover:shadow-sm"
        :class="allExpanded ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-transparent'"
      >
        <svg
          class="w-3.5 h-3.5 transition-transform duration-200"
          :class="allExpanded ? 'rotate-90' : ''"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </button>
    </div>

    <nav class="category-list">
      <button
        @click="selectCategory(null)"
        class="category-item all-items"
        :class="{ selected: selectedCategory === null }"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <span class="truncate">全部物品</span>
        <span class="count">{{ totalItems }}</span>
      </button>

      <template v-for="(category, index) in rootCategories" :key="category.id">
        <div class="category-group">
          <button
            @click="selectCategory(category.id)"
            class="category-item parent"
            :class="{ selected: selectedCategory === category.id }"
          >
            <span
              v-if="category.children.length > 0"
              @click.stop="toggleExpand(category.id)"
              class="w-4 h-4 flex items-center justify-center rounded transition-colors flex-shrink-0 hover:bg-[var(--bg-tertiary)]"
              :class="expandedIds.has(category.id) ? 'rotate-90' : ''"
              style="color: var(--text-muted);"
            >
              <svg class="w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </span>
            <span v-else class="w-4 flex-shrink-0"></span>

            <span class="w-5 h-5 flex items-center justify-center text-[10px] font-semibold tracking-[0.08em] flex-shrink-0">
              {{ getCategoryGlyph(category.name) }}
            </span>

            <span class="truncate">{{ category.name }}</span>
            <span v-if="categoryCountMap.has(category.id)" class="count">
              {{ categoryCountMap.get(category.id) }}
            </span>
          </button>

          <Transition name="collapse">
            <div v-show="expandedIds.has(category.id)" class="children">
              <button
                v-for="child in category.children"
                :key="child.id"
                @click="selectCategory(child.id)"
                class="category-item child"
                :class="{ selected: selectedCategory === child.id }"
              >
                <span class="indent" />
                <span class="w-5 h-5 flex items-center justify-center text-[10px] font-semibold tracking-[0.08em] flex-shrink-0">
                  {{ getCategoryGlyph(child.name) }}
                </span>
                <span class="truncate">{{ child.name }}</span>
                <span v-if="categoryCountMap.has(child.id)" class="count">
                  {{ categoryCountMap.get(child.id) }}
                </span>
              </button>
            </div>
          </Transition>
        </div>

        <div v-if="index < rootCategories.length - 1" class="divider" style="border-color: var(--border-color);"></div>
      </template>

      <div v-if="rootCategories.length === 0 && searchQuery" class="no-results" style="color: var(--text-muted);">
        未找到匹配的分类
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Category } from '@/types'
import { getCategoryGlyph } from '@/utils/categoryGlyph'

interface DrawerCategory extends Category {
  children: DrawerCategory[]
}

interface Props {
  categories: Category[]
  selectedCategory: number | null
  totalItems: number
  categoryCountMap?: Map<number, number>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [categoryId: number | null]
  close: []
}>()

const searchQuery = ref('')
const expandedIds = ref<Set<number>>(new Set())

const buildCategoryTree = (categories: Category[]): DrawerCategory[] => {
  const map = new Map<number, DrawerCategory>()
  const roots: DrawerCategory[] = []

  categories
    .filter(cat => cat.code !== 'CATEGORY_NPC' && cat.code !== 'CATEGORY_BUFF')
    .forEach(cat => {
      map.set(cat.id, { ...cat, children: [] })
    })

  map.forEach(category => {
    const parentId = category.parentId ?? 0
    if (parentId > 0 && map.has(parentId)) {
      map.get(parentId)!.children.push(category)
    } else {
      roots.push(category)
    }
  })

  const sortTree = (nodes: DrawerCategory[]) => {
    nodes.sort((left, right) => (left.sort || 0) - (right.sort || 0))
    nodes.forEach(node => sortTree(node.children))
  }

  sortTree(roots)
  return roots
}

const filterTree = (nodes: DrawerCategory[], query: string): DrawerCategory[] => {
  if (!query) return nodes

  const keyword = query.toLowerCase().trim()
  return nodes
    .map(node => ({
      ...node,
      children: filterTree(node.children, query),
    }))
    .filter(node => node.name.toLowerCase().includes(keyword) || node.children.length > 0)
}

const rootCategories = computed(() => filterTree(buildCategoryTree(props.categories), searchQuery.value))

const categoryCountMap = computed(() => props.categoryCountMap ?? new Map<number, number>())

const allExpanded = computed(() => {
  if (rootCategories.value.length === 0) return false
  return rootCategories.value.every(cat => cat.children.length === 0 || expandedIds.value.has(cat.id))
})

const selectCategory = (categoryId: number | null) => {
  emit('select', categoryId)
  emit('close')
}

const toggleExpand = (categoryId: number) => {
  if (expandedIds.value.has(categoryId)) {
    expandedIds.value.delete(categoryId)
  } else {
    expandedIds.value.add(categoryId)
  }
}

const toggleAllCategories = () => {
  if (allExpanded.value) {
    expandedIds.value = new Set()
    return
  }

  const ids = new Set<number>()
  const collect = (nodes: DrawerCategory[]) => {
    nodes.forEach(node => {
      if (node.children.length > 0) {
        ids.add(node.id)
        collect(node.children)
      }
    })
  }
  collect(rootCategories.value)
  expandedIds.value = ids
}

watch(
  () => props.categories,
  () => {
    const ids = new Set<number>()
    buildCategoryTree(props.categories).forEach(node => {
      if (node.children.length > 0) {
        ids.add(node.id)
      }
    })
    expandedIds.value = ids
  },
  { immediate: true },
)
</script>

<style scoped>
.category-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.drawer-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  padding: 8px;
  border-radius: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.2s;
}

.close-btn:hover {
  background: var(--bg-tertiary);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  flex-shrink: 0;
}

.stats {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.quick-actions {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
}

.category-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
}

.category-group {
  display: grid;
  gap: 4px;
}

.category-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  text-align: left;
  color: var(--text-primary);
  transition: background-color 0.2s ease, color 0.2s ease;
}

.category-item:hover {
  background: var(--bg-tertiary);
}

.category-item.selected {
  background: var(--accent-primary);
  color: white;
}

.category-item.child {
  padding-left: 20px;
}

.count {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-size: 10px;
  color: var(--text-secondary);
}

.category-item.selected .count {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.children {
  display: grid;
  gap: 4px;
}

.indent {
  width: 12px;
  flex-shrink: 0;
}

.divider {
  border-top: 1px solid var(--border-color);
  margin: 8px 0;
}

.no-results {
  padding: 16px 0;
  text-align: center;
  font-size: 13px;
}
</style>
