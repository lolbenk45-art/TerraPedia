<template>
  <!-- Desktop Sidebar -->
  <aside class="hidden lg:block">
    <div class="sticky top-24">
      <!-- 分类卡片 -->
      <div class="rounded-xl p-3 border" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
        <div class="flex items-center justify-between mb-3 px-2">
          <h2 class="font-semibold text-sm" style="color: var(--text-primary);">
            物品分类
          </h2>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background-color: var(--bg-tertiary); color: var(--text-muted);">
            {{ rootCategories.length }}
          </span>
        </div>
        
        <!-- Search Categories -->
        <div class="relative mb-2">
          <svg class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索分类..."
            class="w-full pl-8 pr-2 py-1.5 rounded-lg text-xs outline-none border"
            style="background-color: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"
          />
        </div>
        
        <!-- Expand/Collapse All Button -->
        <div class="flex items-center justify-between gap-2 mb-2 px-1">
          <button
            @click="toggleAllCategories"
            class="flex-1 flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg transition-all border hover:shadow-sm"
            :class="allExpanded ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-transparent'"
          >
            <svg
              class="w-3 h-3 transition-transform duration-200"
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
        
        <!-- Category Tree With Scroll -->
        <nav class="space-y-0.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1 custom-scrollbar">
          <!-- All Items -->
          <button
            @click="selectCategory(null)"
            class="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all"
            :class="selectedCategory === null ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
            :style="selectedCategory === null ? {} : { color: 'var(--text-primary)' }"
          >
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span class="truncate">全部物品</span>
            <span
              class="ml-auto px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
              :class="selectedCategory === null ? 'bg-white/20' : ''"
              :style="selectedCategory === null ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }"
            >
              {{ formatNumber(totalItems) }}
            </span>
          </button>
          
          <!-- Root Categories with Expand/Collapse -->
          <template v-for="(category, index) in rootCategories" :key="category.id">
            <!-- Parent Category Button -->
            <div class="relative">
              <button
                @click="selectCategory(category.id)"
                class="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all"
                :class="selectedCategory === category.id ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
                :style="selectedCategory === category.id ? {} : { color: 'var(--text-primary)' }"
              >
                <!-- Expand/Collapse Icon -->
                <span
                  v-if="category.children && category.children.length > 0"
                  @click.stop="toggleExpand(category.id)"
                  class="w-3.5 h-3.5 flex items-center justify-center rounded transition-colors flex-shrink-0 hover:bg-[var(--bg-tertiary)]"
                  :class="expandedIds.has(category.id) ? 'rotate-90' : ''"
                  style="color: var(--text-muted);"
                >
                  <svg class="w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
                <span v-else class="w-3.5 flex-shrink-0"></span>
                
                <!-- Category Icon -->
                <span class="w-4 h-4 flex items-center justify-center text-base flex-shrink-0">
                  {{ categoryIcon(category.name) }}
                </span>
                
                <!-- Category Name -->
                <span class="truncate">{{ category.name }}</span>
                
                <!-- Item Count -->
                <span
                  v-if="categoryCountMap.has(category.id)"
                  class="ml-auto px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                  :class="selectedCategory === category.id ? 'bg-white/20' : ''"
                  :style="selectedCategory === category.id ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }"
                >
                  {{ categoryCountMap.get(category.id) }}
                </span>
              </button>
              
              <!-- Children Categories -->
              <div
                v-show="expandedIds.has(category.id)"
                class="overflow-hidden transition-all duration-300 ease-in-out"
              >
                <div class="ml-4 mt-1 space-y-0.5 border-l-2 pl-2" style="border-color: var(--border-color);">
                  <button
                    v-for="child in category.children"
                    :key="child.id"
                    @click="selectCategory(child.id)"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                    :class="selectedCategory === child.id ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
                    :style="selectedCategory === child.id ? {} : { color: 'var(--text-primary)' }"
                  >
                    <span class="w-4 h-4 flex items-center justify-center text-base flex-shrink-0">
                      {{ categoryIcon(child.name) }}
                    </span>
                    <span class="truncate">{{ child.name }}</span>
                    <span
                      v-if="categoryCountMap.has(child.id)"
                      class="ml-auto px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                      :class="selectedCategory === child.id ? 'bg-white/20' : ''"
                      :style="selectedCategory === child.id ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }"
                    >
                      {{ categoryCountMap.get(child.id) }}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Divider between categories (except last one) -->
            <div
              v-if="index < rootCategories.length - 1"
              class="my-1 border-t"
              style="border-color: var(--border-color);"
            ></div>
          </template>
        </nav>
        
        <!-- No Results -->
        <div v-if="filteredTreeCategories.length === 0 && searchQuery" class="text-center py-3 text-xs" style="color: var(--text-muted);">
          未找到匹配的分类
        </div>
      </div>
    </div>
  </aside>
  
  <!-- Mobile Category List -->
  <div class="lg:hidden mb-4">
    <div class="rounded-xl p-3 border" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
      <!-- Header -->
      <div class="flex items-center justify-between mb-3 px-2">
        <h2 class="font-semibold text-sm" style="color: var(--text-primary);">
          物品分类
        </h2>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background-color: var(--bg-tertiary); color: var(--text-muted);">
          {{ rootCategories.length }}
        </span>
      </div>
      
      <!-- Expand/Collapse All Button -->
      <div class="flex items-center justify-between gap-2 mb-2 px-1">
        <button
          @click="toggleAllCategories"
          class="flex-1 flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg transition-all border hover:shadow-sm"
          :class="allExpanded ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-transparent'"
        >
          <svg
            class="w-3 h-3 transition-transform duration-200"
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
      
      <!-- Category List Container -->
      <div class="space-y-1 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
        <!-- All Items -->
        <button
          @click="selectCategory(null)"
          class="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all"
          :class="selectedCategory === null ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
          :style="selectedCategory === null ? {} : { color: 'var(--text-primary)' }"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span class="truncate">全部物品</span>
          <span
            class="ml-auto px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
            :class="selectedCategory === null ? 'bg-white/20' : ''"
            :style="selectedCategory === null ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }"
          >
            {{ formatNumber(totalItems) }}
          </span>
        </button>
        
        <!-- Root Categories with Expand/Collapse (Mobile) -->
        <template v-for="(category, index) in rootCategories" :key="category.id">
          <div class="relative">
            <button
              @click="selectCategory(category.id)"
              class="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all"
              :class="selectedCategory === category.id ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
              :style="selectedCategory === category.id ? {} : { color: 'var(--text-primary)' }"
            >
              <!-- Expand/Collapse Icon -->
              <span
                v-if="category.children && category.children.length > 0"
                @click.stop="toggleExpand(category.id)"
                class="w-3.5 h-3.5 flex items-center justify-center rounded transition-colors flex-shrink-0 hover:bg-[var(--bg-tertiary)]"
                :class="expandedIds.has(category.id) ? 'rotate-90' : ''"
                style="color: var(--text-muted);"
              >
                <svg class="w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </span>
              <span v-else class="w-3.5 flex-shrink-0"></span>
              
              <!-- Category Icon -->
              <span class="w-4 h-4 flex items-center justify-center text-base flex-shrink-0">
                {{ categoryIcon(category.name) }}
              </span>
              
              <!-- Category Name -->
              <span class="truncate">{{ category.name }}</span>
              
              <!-- Item Count -->
              <span
                v-if="categoryCountMap.has(category.id)"
                class="ml-auto px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                :class="selectedCategory === category.id ? 'bg-white/20' : ''"
                :style="selectedCategory === category.id ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }"
              >
                {{ categoryCountMap.get(category.id) }}
              </span>
            </button>
            
            <!-- Children Categories (Mobile) -->
            <div
              v-show="expandedIds.has(category.id)"
              class="overflow-hidden transition-all duration-300 ease-in-out"
            >
              <div class="ml-4 mt-1 space-y-0.5 border-l-2 pl-2" style="border-color: var(--border-color);">
                <button
                  v-for="child in category.children"
                  :key="child.id"
                  @click="selectCategory(child.id)"
                  class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  :class="selectedCategory === child.id ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-[var(--bg-tertiary)]'"
                  :style="selectedCategory === child.id ? {} : { color: 'var(--text-primary)' }"
                >
                  <span class="w-4 h-4 flex items-center justify-center text-base flex-shrink-0">
                    {{ categoryIcon(child.name) }}
                  </span>
                  <span class="truncate">{{ child.name }}</span>
                  <span
                    v-if="categoryCountMap.has(child.id)"
                    class="ml-auto px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                    :class="selectedCategory === child.id ? 'bg-white/20' : ''"
                    :style="selectedCategory === child.id ? {} : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }"
                  >
                    {{ categoryCountMap.get(child.id) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
          
          <!-- Divider between categories (except last one) -->
          <div
            v-if="index < rootCategories.length - 1"
            class="my-1 border-t"
            style="border-color: var(--border-color);"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Category, Item } from '@/types'

interface Props {
  categories: Category[]
  items: Item[]
  selectedCategory: number | null
  totalItems: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [categoryId: number | null]
}>()

const searchQuery = ref('')
const expandedIds = ref<Set<number>>(new Set())

// Check if all categories are expanded
const allExpanded = computed(() => {
  if (rootCategories.value.length === 0) return false
  return rootCategories.value.every(cat => expandedIds.value.has(cat.id))
})

// Toggle all categories expand/collapse
const toggleAllCategories = () => {
  if (allExpanded.value) {
    // Collapse all
    expandedIds.value = new Set()
  } else {
    // Expand all
    const idsToExpand = new Set<number>()
    rootCategories.value.forEach(cat => {
      if (cat.children && cat.children.length > 0) {
        idsToExpand.add(cat.id)
      }
    })
    expandedIds.value = idsToExpand
  }
}

// Build category tree
const buildCategoryTree = (categories: Category[]): Category[] => {
  const categoryMap = new Map<number, Category>()
  const roots: Category[] = []
  
  // First pass: create map and initialize children
  categories.forEach(cat => {
    categoryMap.set(cat.id, { ...cat, children: [] })
  })
  
  // Second pass: build tree
  categories.forEach(cat => {
    const node = categoryMap.get(cat.id)!
    const parentId = cat.parentId || 0
    if (parentId > 0 && categoryMap.has(parentId)) {
      const parent = categoryMap.get(parentId)!
      parent.children = parent.children || []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  
  // Sort by sort field
  const sortTree = (nodes: Category[]) => {
    nodes.sort((a, b) => (a.sort || 0) - (b.sort || 0))
    nodes.forEach(node => {
      if (node.children?.length) {
        sortTree(node.children)
      }
    })
  }
  sortTree(roots)
  
  return roots
}

// Calculate level for each category
const calculateLevels = (categories: Category[], level = 0): Category[] => {
  return categories.map(cat => ({
    ...cat,
    level,
    children: cat.children ? calculateLevels(cat.children, level + 1) : []
  }))
}

// Filter tree by search query
const filterTree = (categories: Category[], query: string): Category[] => {
  if (!query) return categories
  
  const lowerQuery = query.toLowerCase()
  
  return categories.filter(cat => {
    const matches = cat.name.toLowerCase().includes(lowerQuery)
    if (cat.children?.length) {
      cat.children = filterTree(cat.children, query)
      return matches || cat.children.length > 0
    }
    return matches
  })
}

const categoryTree = computed(() => {
  const tree = buildCategoryTree(props.categories)
  return calculateLevels(tree)
})

// Get root categories only (no children display) - Exclude NPC and BUFF
const rootCategories = computed(() => {
  return props.categories
    .filter(cat => (cat.parentId || 0) === 0)
    .filter(cat => cat.code !== 'CATEGORY_NPC' && cat.code !== 'CATEGORY_BUFF')
})

// Count items for each root category (including children categories)
const categoryCountMap = computed(() => {
  const countMap = new Map<number, number>()
  
  const getCategoryIds = (categoryId: number): number[] => {
    const ids: number[] = [categoryId]
    const findChildren = (parentId: number) => {
      props.categories.forEach(cat => {
        if ((cat.parentId || 0) === parentId) {
          ids.push(cat.id)
          findChildren(cat.id)
        }
      })
    }
    findChildren(categoryId)
    return ids
  }
  
  rootCategories.value.forEach(rootCat => {
    const categoryIds = getCategoryIds(rootCat.id)
    const count = props.items.filter(item => categoryIds.includes(item.categoryId || 0)).length
    countMap.set(rootCat.id, count)
  })
  
  return countMap
})

const filteredTreeCategories = computed(() => {
  if (!searchQuery.value) return categoryTree.value
  return filterTree(categoryTree.value, searchQuery.value)
})

// Auto expand root categories with children on mount
watch([categoryTree], () => {
  // 默认展开所有有子分类的根分类
  const idsToExpand = new Set<number>()
  categoryTree.value.forEach(cat => {
    if (cat.children && cat.children.length > 0) {
      idsToExpand.add(cat.id)
    }
  })
  expandedIds.value = idsToExpand
  console.log('默认展开的分类 IDs:', expandedIds.value)
}, { immediate: true })

// Auto expand when searching
watch(searchQuery, (newQuery) => {
  if (newQuery) {
    // Expand all when searching
    const allIds = new Set<number>()
    const collectIds = (cats: Category[]) => {
      cats.forEach(cat => {
        allIds.add(cat.id)
        if (cat.children?.length) {
          collectIds(cat.children)
        }
      })
    }
    collectIds(categoryTree.value)
    expandedIds.value = allIds
  }
})

const selectCategory = (categoryId: number | null) => {
  emit('select', categoryId)
}

const toggleExpand = (categoryId: number) => {
  if (expandedIds.value.has(categoryId)) {
    expandedIds.value.delete(categoryId)
  } else {
    expandedIds.value.add(categoryId)
  }
}

const formatNumber = (num: number): string => {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

const categoryIcon = (name: string): string => {
  const iconMap: Record<string, string> = {
    '武器': '⚔️',
    '工具': '⛏️',
    '护甲': '🛡️',
    '饰品': '💍',
    '消耗品': '🧪',
    '材料': '📦',
    '家具': '🪑',
    '方块': '🧱',
    '墙壁': '🏗️',
    '照明': '💡',
    '弹药': '🏹',
    '鱼饵': '🪱',
    '宠物': '🐾',
    '坐骑': '🦄',
    '照明宠物': '✨',
    '时装': '👕',
    '染料': '🎨',
    '油漆': '🖌️',
    '电线': '🔌',
    '机械': '⚙️',
    '植物': '🌱',
    '种子': '🌰',
    '鱼': '🐟',
    '任务鱼': '🎣',
    '宝匣': '📭',
    '宝藏': '💎',
    '钱币': '💰',
    '音乐': '🎵',
    '雕像': '🗿',
    '旗帜': '🚩',
    '画': '🖼️',
  }
  
  for (const key in iconMap) {
    if (name.includes(key)) return iconMap[key]
  }
  
  return '📁'
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
