<template>
  <div class="category-drawer">
    <!-- 头部 -->
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

    <!-- 搜索框 -->
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

    <!-- 统计信息 -->
    <div class="stats">
      <span>{{ categories.length }} 个分类</span>
      <span>{{ totalItems }} 个物品</span>
    </div>

    <!-- 快速操作 -->
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

    <!-- 分类列表 -->
    <nav class="category-list">
      <!-- 全部物品 -->
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

      <!-- 根分类 -->
      <template v-for="(category, index) in filteredCategories" :key="category.id">
        <div class="category-group">
          <button
            @click="selectCategory(category.id)"
            class="category-item parent"
            :class="{ selected: selectedCategory === category.id }"
          >
            <span
              v-if="category.children && category.children.length > 0"
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
            
            <span class="w-5 h-5 flex items-center justify-center text-base flex-shrink-0">
              {{ categoryIcon(category.name) }}
            </span>
            
            <span class="truncate">{{ category.name }}</span>
            
            <span
              v-if="categoryCountMap.has(category.id)"
              class="count"
            >
              {{ categoryCountMap.get(category.id) }}
            </span>
          </button>

          <!-- 子分类 -->
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
                <span class="w-5 h-5 flex items-center justify-center text-base flex-shrink-0">
                  {{ categoryIcon(child.name) }}
                </span>
                <span class="truncate">{{ child.name }}</span>
                <span
                  v-if="categoryCountMap.has(child.id)"
                  class="count"
                >
                  {{ categoryCountMap.get(child.id) }}
                </span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- 分隔线 -->
        <div
          v-if="index < filteredCategories.length - 1"
          class="divider"
          style="border-color: var(--border-color);"
        ></div>
      </template>

      <!-- 无结果 -->
      <div
        v-if="filteredCategories.length === 0 && searchQuery"
        class="no-results"
        style="color: var(--text-muted);"
      >
        未找到匹配的分类
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Category } from '@/types'

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

// 默认展开所有根分类（排除 NPC 和 BUFF）
watch([() => props.categories], () => {
  const idsToExpand = new Set<number>()
  props.categories
    .filter(cat => (cat.parentId || 0) === 0)
    .filter(cat => cat.code !== 'CATEGORY_NPC' && cat.code !== 'CATEGORY_BUFF')
    .forEach(cat => {
      if (cat.children && cat.children.length > 0) {
        idsToExpand.add(cat.id)
      }
    })
  expandedIds.value = idsToExpand
}, { immediate: true })

// 检查是否全部展开
const allExpanded = computed(() => {
  if (props.categories.length === 0) return false
  return props.categories
    .filter(cat => (cat.parentId || 0) === 0)
    .every(cat => !cat.children?.length || expandedIds.value.has(cat.id))
})

// 切换全部展开/收起
const toggleAllCategories = () => {
  if (allExpanded.value) {
    expandedIds.value = new Set()
  } else {
    const idsToExpand = new Set<number>()
    props.categories.forEach(cat => {
      if (cat.children && cat.children.length > 0) {
        idsToExpand.add(cat.id)
      }
    })
    expandedIds.value = idsToExpand
  }
}

// 过滤分类（排除 NPC 和 BUFF）
const filteredCategories = computed(() => {
  const rootCats = props.categories.filter(cat => 
    (cat.parentId || 0) === 0 && 
    cat.code !== 'CATEGORY_NPC' && 
    cat.code !== 'CATEGORY_BUFF'
  )
  
  if (!searchQuery.value) {
    return rootCats
  }
  
  const query = searchQuery.value.toLowerCase().trim()
  const result: Category[] = []
  
  rootCats.forEach(cat => {
    if (cat.name.toLowerCase().includes(query)) {
      result.push(cat)
    } else if (cat.children) {
      const matchingChildren = cat.children.filter(child => 
        child.name.toLowerCase().includes(query)
      )
      if (matchingChildren.length > 0) {
        result.push({ ...cat, children: matchingChildren })
      }
    }
  })
  
  return result
})

// 计算每个分类的物品数量（包括子分类）
const categoryCountMap = computed(() => {
  return props.categoryCountMap ?? new Map<number, number>()
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

const categoryIcon = (name: string): string => {
  const normalizedName = name.toLowerCase()
  if (normalizedName.includes('weapon') || normalizedName.includes('sword')) return '⚔️'
  if (normalizedName.includes('bow') || normalizedName.includes('ammo')) return '🏹'
  if (normalizedName.includes('staff')) return '✨'
  if (normalizedName.includes('tool') || normalizedName.includes('pickaxe')) return '⛏️'
  if (normalizedName.includes('axe')) return '🪓'
  if (normalizedName.includes('armor') || normalizedName.includes('chestplate')) return '🛡️'
  if (normalizedName.includes('helmet')) return '🪖'
  if (normalizedName.includes('leggings')) return '🥾'
  if (normalizedName.includes('accessory')) return '💍'
  if (normalizedName.includes('consumable')) return '🧪'
  if (normalizedName.includes('material')) return '📦'
  if (normalizedName.includes('furniture')) return '🪑'
  if (normalizedName.includes('block')) return '🧱'
  if (normalizedName.includes('wall')) return '🏗️'
  if (normalizedName.includes('light')) return '💡'
  if (normalizedName.includes('bait')) return '🪱'
  if (normalizedName.includes('pet')) return '🐥'
  if (normalizedName.includes('mount')) return '🦄'
  if (normalizedName.includes('vanity')) return '👔'
  if (normalizedName.includes('dye')) return '🎨'
  if (normalizedName.includes('paint')) return '🖌️'
  if (normalizedName.includes('wire')) return '🔌'
  if (normalizedName.includes('mechanism')) return '⚙️'
  if (normalizedName.includes('plant')) return '🌱'
  if (normalizedName.includes('seed')) return '🌰'
  if (normalizedName.includes('fish')) return '🐟'
  if (normalizedName.includes('crate')) return '📭'
  if (normalizedName.includes('treasure')) return '💎'
  if (normalizedName.includes('coin')) return '💰'
  if (normalizedName.includes('music')) return '🎵'
  if (normalizedName.includes('statue')) return '🗿'
  if (normalizedName.includes('banner')) return '🚩'
  if (normalizedName.includes('painting')) return '🖼️'

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
.category-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}

/* 头部 */
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

/* 搜索框 */
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

/* 统计信息 */
.stats {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* 快速操作 */
.quick-actions {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* 分类列表 */
.category-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* 分类项 */
.category-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-primary);
}

.category-item:hover {
  background: var(--bg-tertiary);
}

.category-item.selected {
  background: var(--accent-primary);
  color: white;
}

.category-item .count {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.7;
  white-space: nowrap;
}

.category-item.selected .count {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 子分类 */
.children {
  background: var(--bg-primary);
}

.category-item.child {
  padding-left: 48px;
}

.category-item.child .indent {
  width: 16px;
  height: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}

/* 分隔线 */
.divider {
  border-top: 1px solid var(--border-color);
  margin: 4px 0;
}

/* 折叠动画 */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* 无结果 */
.no-results {
  padding: 24px 16px;
  text-align: center;
  font-size: 14px;
}
</style>
