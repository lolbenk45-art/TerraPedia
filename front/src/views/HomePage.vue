<template>
  <div class="home-page min-h-screen" style="background-color: var(--bg-primary);">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center min-h-screen">
      <div class="w-16 h-16 border-2 rounded-full animate-spin" style="border-color: var(--bg-tertiary); border-top-color: var(--accent-primary);"></div>
      <p class="mt-4 text-lg" style="color: var(--text-secondary);">加载中...</p>
    </div>
    
    <!-- Offline State -->
    <OfflineState
      v-else-if="isOfflineMode && hasCachedData"
      @retry="retryConnection"
      @viewCached="() => {}"
    />
    
    <!-- Error State -->
    <ErrorState
      v-else-if="error"
      :error="error"
      title="页面加载失败"
      message="无法加载页面数据，请检查网络连接后重试"
      @retry="loadData"
    />
    
    <!-- Main Content -->
    <div v-else>
      <!-- Hero Section -->
      <section class="home-hero relative py-20 lg:py-28 overflow-hidden">
      <!-- Animated Background -->
      <div class="absolute inset-0 overflow-hidden">
        <div class="absolute -top-1/2 -left-1/2 w-full h-full opacity-20 animate-pulse"
             style="background: radial-gradient(circle, var(--accent-primary) 0%, transparent 70%);"></div>
        <div class="absolute -bottom-1/2 -right-1/2 w-full h-full opacity-10 animate-pulse"
             style="background: radial-gradient(circle, var(--accent-secondary) 0%, transparent 70%); animation-delay: 1s;"></div>
      </div>
      
      <!-- Floating Items Background -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div v-for="(item, index) in floatingItems" :key="index"
             class="absolute floating-item"
             :class="{ 'is-loaded': imagesLoaded }"
             :style="{
               left: item.x + '%',
               top: item.y + '%',
               transitionDelay: item.delay + 's'
             }">
          <img v-if="item.image" 
               :src="getImageUrl(item.image)" 
               class="w-12 h-12 object-contain floating-img"
               @load="onImageLoad"
               loading="lazy" />
          <span v-else class="text-4xl">{{ item.icon }}</span>
        </div>
      </div>
      
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <!-- Badge -->
          <div class="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8 border backdrop-blur-sm"
               style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-secondary);">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background-color: var(--accent-success);"></span>
            已收录 <span class="font-semibold" style="color: var(--accent-primary);">{{ totalItems.toLocaleString() }}</span> 个物品
          </div>
          
          <!-- Title -->
          <h1 class="hero-title text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-extrabold mb-6 tracking-tight font-heading">
            <span class="text-primary-block" style="color: var(--text-primary);">泰拉瑞亚</span>
            <span class="relative inline-block mt-2 block lg:inline-block lg:mt-0">
              <span class="hero-title-accent gradient-text">物品百科</span>
              <svg class="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 200 6" preserveAspectRatio="none">
                <path d="M0 3 Q50 0, 100 3 T200 3" stroke="var(--accent-primary)" stroke-width="2.5" fill="none" opacity="0.6"/>
              </svg>
            </span>
          </h1>
          
          <!-- Description -->
          <p class="text-base sm:text-lg lg:text-xl mb-10 max-w-2xl mx-auto leading-relaxed" style="color: var(--text-secondary);">
            最全面的泰拉瑞亚物品数据库，包含武器、装备、材料、家具等全品类物品信息，
            <br class="hidden lg:block">助你轻松探索游戏世界
          </p>
          
          <!-- CTA Buttons -->
          <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <router-link
              to="/items"
              class="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-all hover:scale-105 hover:shadow-lg"
              style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));"
            >
              <svg class="w-5 h-5 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              开始探索
              <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </router-link>
            
            <button
              @click="scrollToFeatures"
              class="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold border-2 transition-all hover:scale-105"
              style="border-color: var(--border-color); color: var(--text-primary); background-color: var(--bg-secondary);"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              了解更多
            </button>
          </div>
          
          <!-- Search Bar in Hero -->
          <div class="max-w-2xl mx-auto mb-12">
            <div class="relative">
              <div class="absolute -inset-1 rounded-2xl blur opacity-40" style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));"></div>
              <div class="relative">
                <ItemSearchInput
                  v-model="quickSearch"
                  placeholder="搜索物品名称..."
                  show-submit-button
                  submit-text="搜索"
                  variant="hero"
                  @submit="goToSearch"
                  @pick="handleQuickSuggestionPick"
                />
              </div>
            </div>
            
            <!-- Quick Tags -->
            <div class="quick-tags mt-3 flex flex-wrap justify-center gap-2">
              <button
                v-for="tag in quickTags"
                :key="tag.name"
                @click="quickSearch = tag.name; goToSearch()"
                class="quick-tag px-3 py-1 rounded-full text-xs border transition-all hover:scale-105 flex items-center gap-1"
                style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-secondary);"
              >
                <span class="quick-tag__icon">{{ tag.icon }}</span>
                <span>{{ tag.name }}</span>
              </button>
            </div>
          </div>
          
          <!-- Featured Items Carousel -->
          <div class="relative max-w-4xl mx-auto">
            <div class="flex items-center justify-center gap-4 flex-wrap">
              <div v-for="item in featuredItems" :key="item.id"
                   class="group relative w-20 h-20 lg:w-24 lg:h-24 rounded-2xl p-3 border-2 transition-all duration-300 hover:scale-125 hover:z-10 cursor-pointer"
                   :style="{
                     backgroundColor: 'var(--bg-secondary)',
                     borderColor: 'var(--border-color)',
                     transform: `rotate(${item.rotation}deg)`
                   }"
                   :title="item.name"
                   @click="openItemDetail(item)">
                <img v-if="item.image" 
                     :src="getImageUrl(item.image)" 
                     :alt="item.name" 
                     class="w-full h-full object-contain transition-transform group-hover:scale-110"
                     @error="item.image = ''" />
                <div v-else class="w-full h-full flex items-center justify-center text-3xl">
                  {{ categoryIcon(item.category || '其他') }}
                </div>
                <!-- Tooltip -->
                <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
                     style="background-color: var(--bg-tertiary); color: var(--text-primary);">
                  {{ item.name }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Stats Section -->
    <section class="home-stats py-14 relative overflow-hidden" style="background-color: var(--bg-primary);">
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          <div v-for="stat in stats" :key="stat.label" 
               class="stat-block text-center group py-4 px-4 rounded-2xl border transition-all duration-300 hover:shadow-lg"
               style="background-color: var(--bg-secondary); border-color: var(--border-color);">
            <div class="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-1 font-heading transition-transform group-hover:scale-105" 
                 style="color: var(--accent-primary);">
              {{ stat.value }}
            </div>
            <div class="text-xs sm:text-sm font-medium" style="color: var(--text-secondary);">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Network Status Banner -->
    <div v-if="!isOnline && hasCachedData" class="network-banner text-center py-2 px-4 text-sm">
      <div class="flex items-center justify-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.828-2.828m2.828 2.828L21 21M15.556 3a9 9 0 010 12.728m-2.828-2.828L15.556 3M3 3l18 18M3 3l18 18" />
        </svg>
        <span>离线模式 - 正在使用缓存数据</span>
      </div>
    </div>
    
    <!-- Features Section - Bento-style grid -->
    <section id="features" class="py-20 lg:py-24 relative">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12 lg:mb-16">
          <span class="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4 font-heading"
                style="background-color: var(--bg-tertiary); color: var(--accent-primary);">
            功能特色
          </span>
          <h2 class="text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 font-heading" style="color: var(--text-primary);">
            为玩家打造的专业工具
          </h2>
          <p class="max-w-2xl mx-auto text-base lg:text-lg" style="color: var(--text-secondary);">
            强大的功能，简洁的界面，让物品查询变得轻松愉快
          </p>
        </div>
        
        <div class="features-bento grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          <div v-for="feature in features" :key="feature.title" 
               class="group relative p-5 lg:p-6 rounded-2xl border transition-all duration-300 hover:shadow-xl cursor-pointer feature-card"
               :style="{ 
                 backgroundColor: 'var(--bg-secondary)', 
                 borderColor: 'var(--border-color)'
               }">
            <div class="relative h-full flex flex-col">
              <div class="w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center mb-4 text-2xl lg:text-3xl transition-transform group-hover:scale-110 group-hover:rotate-6"
                   style="background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary)); box-shadow: var(--shadow-sm);">
                {{ feature.icon }}
              </div>
              <h3 class="text-lg lg:text-xl font-bold mb-2 font-heading" style="color: var(--text-primary);">{{ feature.title }}</h3>
              <p class="text-sm leading-relaxed flex-1" style="color: var(--text-secondary);">{{ feature.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Categories Preview -->
    <section class="py-20 lg:py-24 relative overflow-hidden" style="background-color: var(--bg-secondary);">
      <div class="absolute top-0 left-0 w-full h-px" style="background: linear-gradient(90deg, transparent, var(--border-color), transparent);"></div>
      <div class="absolute bottom-0 left-0 w-full h-px" style="background: linear-gradient(90deg, transparent, var(--border-color), transparent);"></div>
      
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col md:flex-row md:items-end justify-between mb-10 lg:mb-12 gap-4">
          <div>
            <span class="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-3 font-heading"
                  style="background-color: var(--bg-tertiary); color: var(--accent-primary);">
              分类浏览
            </span>
            <h2 class="text-3xl lg:text-4xl font-bold mb-2 font-heading" style="color: var(--text-primary);">探索物品分类</h2>
            <p class="text-sm lg:text-base" style="color: var(--text-secondary);">按类别浏览，快速找到你需要的物品</p>
          </div>
          <router-link
            to="/items"
            class="group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all hover:gap-3 hover:shadow-lg"
            style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white;"
          >
            查看全部物品
            <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </router-link>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
          <router-link
            v-for="category in topCategories" 
            :key="category.id"
            :to="`/items?category=${category.id}`"
            class="group relative p-4 lg:p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg overflow-hidden category-card"
            :style="{ 
              backgroundColor: 'var(--bg-primary)', 
              borderColor: 'var(--border-color)'
            }">
            <div class="absolute right-2 top-2 text-5xl opacity-[0.07] transition-transform group-hover:scale-110"
                 style="color: var(--accent-primary);">
              {{ categoryIcon(category.name) }}
            </div>
            <div class="relative flex items-center gap-3 mb-3">
              <div class="w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center text-xl lg:text-2xl transition-transform group-hover:scale-105"
                   style="background-color: var(--bg-secondary);">
                {{ categoryIcon(category.name) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-bold text-base lg:text-lg truncate font-heading" style="color: var(--text-primary);">{{ category.name }}</div>
                <div class="text-xs" style="color: var(--text-muted);">{{ category.count }} 个物品</div>
              </div>
            </div>
            <div class="h-1.5 rounded-full overflow-hidden" style="background-color: var(--bg-secondary);">
              <div class="h-full rounded-full transition-all duration-500"
                   :style="{ 
                     width: Math.min(100, (category.count / maxCategoryCount) * 100) + '%',
                     backgroundColor: 'var(--accent-primary)'
                   }"></div>
            </div>
          </router-link>
        </div>
      </div>
    </section>
    
    <!-- Footer -->
    <footer class="home-footer py-12 lg:py-14 relative" style="background-color: var(--bg-secondary);">
      <div class="absolute top-0 left-0 w-full h-px" style="background: linear-gradient(90deg, transparent, var(--border-color), transparent);"></div>
      
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col md:flex-row items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="footer-mark w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                 style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white;">
              TP
            </div>
            <div>
              <div class="font-bold text-base lg:text-lg font-heading" style="color: var(--text-primary);">Terraria Items</div>
              <div class="text-xs lg:text-sm" style="color: var(--text-muted);">泰拉瑞亚物品百科</div>
            </div>
          </div>
          
          <div class="flex items-center gap-6 lg:gap-8">
            <router-link to="/" class="text-sm font-medium transition-colors" style="color: var(--text-secondary);" :style="$route.path === '/' ? { color: 'var(--accent-primary)' } : {}">首页</router-link>
            <router-link to="/items" class="text-sm font-medium transition-colors" style="color: var(--text-secondary);" :style="$route.path === '/items' ? { color: 'var(--accent-primary)' } : {}">浏览物品</router-link>
            <router-link to="/about" class="text-sm font-medium transition-colors" style="color: var(--text-secondary);" :style="$route.path === '/about' ? { color: 'var(--accent-primary)' } : {}">关于我们</router-link>
          </div>
          
          <div class="text-xs lg:text-sm" style="color: var(--text-muted);">
            © 2026 Terraria Items
          </div>
        </div>
      </div>
    </footer>
    
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Item, Category, ItemSuggestion, StatsOverview } from '@/types'
import { fetchItems, fetchCategories, fetchStatsOverview } from '@/api'
import ErrorState from '@/components/ErrorState.vue'
import ItemSearchInput from '@/components/ItemSearchInput.vue'
import OfflineState from '@/components/OfflineState.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { flattenCategories } from '@/utils/categoryTree'

const router = useRouter()

// Network status
const { isOnline } = useNetworkStatus()

// State
const items = ref<Item[]>([])
const categories = ref<Category[]>([])
const totalItems = ref(0)
const statsOverview = ref<StatsOverview | null>(null)
const homepageItemSampleSize = 240
const statsCategoryCountMap = computed(() => {
  const map = new Map<number, number>()
  const overview = statsOverview.value
  if (!overview) {
    return map
  }

  Object.entries(overview.categoryItemCounts || {}).forEach(([key, value]) => {
    const id = Number(key)
    if (!Number.isNaN(id)) {
      map.set(id, Number(value) || 0)
    }
  })

  overview.rootCategoryCounts.forEach(entry => {
    if (typeof entry.categoryId === 'number') {
      map.set(entry.categoryId, entry.count ?? 0)
    }
  })

  return map
})
const getRootCategoryCountByCode = (code: string): number => {
  const rootCategory = categories.value.find(cat => {
    return (cat.parentId ?? 0) === 0 && cat.code?.toUpperCase() === code
  })

  if (!rootCategory) {
    return 0
  }

  return statsCategoryCountMap.value.get(rootCategory.id) ?? 0
}
const quickSearch = ref('')
const imagesLoaded = ref(false)
const loadedImageCount = ref(0)
const totalFloatingImages = 20
const isLoading = ref(true)
const error = ref('')
const isOfflineMode = ref(false)
const hasCachedData = ref(false)

// Cached data storage
const cachedItems = ref<Item[]>([])
const cachedCategories = ref<Category[]>([])

// Generate floating items for background - random items from database
const floatingItems = computed(() => {
  // Filter items: exclude blocks/walls and low quality images
  const blockIds = getAllBlockCategoryIds()
  
  const eligibleItems = items.value.filter(item => {
    if (!item.image) return false
    
    const itemName = item.name || ''
    if (shouldExcludeBy(itemName)) return false
    
    if (blockIds.has(item.categoryId || 0)) return false
    
    if (!isHighQualityImage(item.image)) return false
    
    return true
  })
  
  // Better random shuffle
  const shuffled = [...eligibleItems]
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item)
  
  // Select 20 random items
  const selected = shuffled.slice(0, 20)
  
  // Use Poisson disk sampling-like approach for natural random distribution
  const positions: { x: number; y: number }[] = []
  const minDistance = 12 // Minimum distance between items
  
  return selected.map((item, i) => {
    let x: number, y: number
    let attempts = 0
    
    // Try to find a position with minimum distance from others
    do {
      x = 5 + Math.random() * 90
      y = 5 + Math.random() * 90
      attempts++
    } while (
      attempts < 50 &&
      positions.some(pos => {
        const dx = pos.x - x
        const dy = pos.y - y
        return Math.sqrt(dx * dx + dy * dy) < minDistance
      })
    )
    
    positions.push({ x, y })
    
    return {
      x,
      y,
      delay: (i * 0.2) + Math.random() * 1.5,
      duration: 4 + Math.random() * 3,
      icon: categoryIcon(item.category || '其他'),
      image: item.image,
      name: item.name
    }
  })
})

// Check if category is a block/wall type
const isBlockCategory = (cat: Category): boolean => {
  const blockKeywords = ['方块', '墙', '砖', '平台', '物块', '背景墙', '砖墙']
  return blockKeywords.some(keyword => cat.name.includes(keyword))
}

// Get all block category IDs including children
const getAllBlockCategoryIds = (): Set<number> => {
  const blockIds = new Set<number>()
  
  // First pass: find direct block categories
  categories.value.forEach(cat => {
    if (isBlockCategory(cat)) {
      blockIds.add(cat.id)
    }
  })
  
  // Second pass: find children of block categories
  let changed = true
  while (changed) {
    changed = false
    categories.value.forEach(cat => {
      if (cat.parentId && blockIds.has(cat.parentId) && !blockIds.has(cat.id)) {
        blockIds.add(cat.id)
        changed = true
      }
    })
  }
  
  return blockIds
}

// Check if image URL indicates high quality (not low pixel)
const isHighQualityImage = (imageUrl: string): boolean => {
  // Filter out low quality images based on naming patterns
  const lowQualityPatterns = [
    'Small', 'tiny', 'mini', 'icon', '16x16', '32x32',
    'wall', 'brick', 'block' // 排除墙、砖、块类低像素物品
  ]
  
  // 排除包含低像素关键词的图片
  if (lowQualityPatterns.some(pattern => 
    imageUrl.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return false
  }
  
  // 额外检查中文关键词
  const chineseKeywords = ['墙', '砖', '块', '平台']
  if (chineseKeywords.some(keyword => imageUrl.includes(keyword))) {
    return false
  }
  
  return true
}

// Check if item should be excluded based on name
const shouldExcludeBy = (itemName: string): boolean => {
  const excludeKeywords = [
    '墙', '砖', '块', '平台', 'Wall', 'Brick', 'Block', 'Platform',
    'Background' // 排除背景墙
  ]
  return excludeKeywords.some(keyword => itemName.includes(keyword))
}

// Featured items for hero section - filter out blocks and walls, show weapons/accessories
const featuredItems = computed(() => {
  const blockIds = getAllBlockCategoryIds()
  
  // Filter items: exclude blocks/walls, prefer weapons, accessories, armors, tools
  const filtered = items.value
    .filter(item => {
      // Must have image
      if (!item.image) return false
      
      const itemName = item.name || ''
      
      // Exclude by item name first (more accurate)
      if (shouldExcludeBy(itemName)) return false
      
      // Exclude blocks and walls by category
      if (blockIds.has(item.categoryId || 0)) return false
      
      // Exclude low quality images
      if (!isHighQualityImage(item.image)) return false
      
      return true
    })
  
  // Random shuffle with better randomness
  const shuffled = [...filtered]
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item)
  
  // Take first 14 and add rotation
  return shuffled
    .slice(0, 14)
    .map((item, index) => ({
      ...item,
      rotation: (index - 7) * 3 + (Math.random() - 0.5) * 10
    }))
})

// Stats
const stats = computed(() => {
  const overview = statsOverview.value
  const totalItemsCount = overview?.totalItems ?? totalItems.value
  const totalCategoriesCount = overview?.totalCategories ?? categories.value.length
  const weaponCount = getRootCategoryCountByCode('WEAPON')
  const armorCount = getRootCategoryCountByCode('ARMOR')

  return [
    { label: '物品总数', value: totalItemsCount.toLocaleString() },
    { label: '分类数量', value: totalCategoriesCount.toString() },
    { label: '武器数量', value: weaponCount.toLocaleString() },
    { label: '\u76d4\u7532\u6570\u91cf', value: armorCount.toLocaleString() },
  ]
})

// Features
const features = [
  { icon: '🔍', title: '智能搜索', description: '支持按名称、描述、ID等多维度搜索，快速定位目标物品' },
  { icon: '📂', title: '分类浏览', description: '树形分类结构，清晰展示物品层级关系，支持展开收起' },
  { icon: '🎨', title: '主题切换', description: '多种配色主题，适配不同使用场景和个人喜好' },
  { icon: '⚡', title: '极速加载', description: '前端分页加载，流畅浏览5000+物品数据' },
  { icon: '📱', title: '响应式设计', description: '完美适配桌面端和移动端，随时随地查询物品' },
  { icon: '🔧', title: '详细属性', description: '展示物品完整属性，包括伤害、防御、稀有度等' }
]

// Top categories
const topCategories = computed(() => {
  const overview = statsOverview.value
  if (overview?.rootCategoryCounts?.length) {
    return overview.rootCategoryCounts
      .map(entry => {
        const category = categories.value.find(cat => cat.id === entry.categoryId)
        if (!category) {
          return null
        }

        return {
          ...category,
          count: entry.count,
        }
      })
      .filter((category): category is Category & { count: number } => category !== null)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }

  const rootCategories = categories.value
    .filter(cat => (cat.parentId || 0) === 0)
    .filter(cat => cat.code !== 'CATEGORY_NPC' && cat.code !== 'CATEGORY_BUFF')

  return rootCategories
    .map(cat => ({
      ...cat,
      count: statsCategoryCountMap.value.get(cat.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

const maxCategoryCount = computed(() => {
  return Math.max(...topCategories.value.map(c => c.count), 1)
})

// Quick tags
const quickTags = [
  { name: '剑', icon: '⚔️' },
  { name: '弓', icon: '🏹' },
  { name: '法杖', icon: '✨' },
  { name: '盔甲', icon: '🛡️' },
  { name: '药水', icon: '🧪' },
  { name: '材料', icon: '📦' }
]

// 模拟数据
const mockItems: Item[] = [
  {
    id: 1,
    name: '铜剑',
    internalName: 'CopperSword',
    image: 'https://via.placeholder.com/100x100?text=铜剑',
    categoryId: 39,
    category: '武器',
    rarityId: 1,
    rare: '白色',
    isStackable: false,
    damage: 8,
    useTime: 20
  },
  {
    id: 2,
    name: '铁镐',
    internalName: 'IronPickaxe',
    image: 'https://via.placeholder.com/100x100?text=铁镐',
    categoryId: 40,
    category: '工具',
    rarityId: 1,
    rare: '白色',
    isStackable: false,
    damage: 5,
    useTime: 25
  },
  {
    id: 3,
    name: '木盔甲',
    internalName: 'WoodenArmor',
    image: 'https://via.placeholder.com/100x100?text=木盔甲',
    categoryId: 82,
    category: '盔甲',
    rarityId: 1,
    rare: '白色',
    isStackable: false,
    defense: 3
  },
  {
    id: 4,
    name: '生命药水',
    internalName: 'HealingPotion',
    image: 'https://via.placeholder.com/100x100?text=生命药水',
    categoryId: 93,
    category: '消耗品',
    rarityId: 1,
    rare: '白色',
    isStackable: true,
    stackSize: 30
  },
  {
    id: 5,
    name: '铜锭',
    internalName: 'CopperBar',
    image: 'https://via.placeholder.com/100x100?text=铜锭',
    categoryId: 102,
    category: '材料',
    rarityId: 1,
    rare: '白色',
    isStackable: true,
    stackSize: 999
  },
  {
    id: 6,
    name: '木椅',
    internalName: 'WoodenChair',
    image: 'https://via.placeholder.com/100x100?text=木椅',
    categoryId: 112,
    category: '家具',
    rarityId: 1,
    rare: '白色',
    isStackable: false
  },
  {
    id: 7,
    name: '泥土方块',
    internalName: 'DirtBlock',
    image: 'https://via.placeholder.com/100x100?text=泥土方块',
    categoryId: 122,
    category: '方块',
    rarityId: 0,
    rare: '灰色',
    isStackable: true,
    stackSize: 999
  },
  {
    id: 8,
    name: '木门',
    internalName: 'WoodenDoor',
    image: 'https://via.placeholder.com/100x100?text=木门',
    categoryId: 132,
    category: '家具',
    rarityId: 1,
    rare: '白色',
    isStackable: false
  },
  {
    id: 9,
    name: '火把',
    internalName: 'Torch',
    image: 'https://via.placeholder.com/100x100?text=火把',
    categoryId: 142,
    category: '照明',
    rarityId: 1,
    rare: '白色',
    isStackable: true,
    stackSize: 999
  },
  {
    id: 10,
    name: '铜箭',
    internalName: 'CopperArrow',
    image: 'https://via.placeholder.com/100x100?text=铜箭',
    categoryId: 152,
    category: '弹药',
    rarityId: 1,
    rare: '白色',
    isStackable: true,
    stackSize: 999
  }
]

const mockCategories: Category[] = [
  { id: 39, parentId: null, name: '武器', code: 'weapon', sort: 1 },
  { id: 40, parentId: null, name: '工具', code: 'tool', sort: 2 },
  { id: 82, parentId: null, name: '盔甲', code: 'armor', sort: 3 },
  { id: 93, parentId: null, name: '消耗品', code: 'consumable', sort: 4 },
  { id: 102, parentId: null, name: '材料', code: 'material', sort: 5 },
  { id: 112, parentId: null, name: '家具', code: 'furniture', sort: 6 },
  { id: 122, parentId: null, name: '方块', code: 'block', sort: 7 },
  { id: 132, parentId: null, name: '墙壁', code: 'wall', sort: 8 },
  { id: 142, parentId: null, name: '照明', code: 'lighting', sort: 9 },
  { id: 152, parentId: null, name: '弹药', code: 'ammo', sort: 10 }
]

// Methods
const getImageUrl = (image: string) => {
  if (!image) return ''
  if (image.startsWith('http')) return image
  // 图片路径已经是 localhost:9000 格式，添加 http:// 前缀
  if (image.startsWith('localhost:')) {
    return 'http://' + image
  }
  return image.startsWith('/') ? image : '/' + image
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

  const map: Record<string, string> = {
    '武器': '⚔️', '工具': '⛏️', '护甲': '🛡️', '盔甲': '🛡️', '饰品': '💍',
    '消耗品': '🧪', '材料': '📦', '家具': '🪑', '方块': '🧱',
    '墙壁': '🏗️', '照明': '💡', '弹药': '🏹', '鱼饵': '🪱',
    '宠物': '🐾', '坐骑': '🦄', '时装': '👕', '染料': '🎨',
    '油漆': '🖌️', '电线': '🔌', '机械': '⚙️', '植物': '🌱',
    '种子': '🌰', '鱼': '🐟', '宝匣': '📭', '宝藏': '💎',
    '钱币': '💰', '音乐': '🎵', '雕像': '🗿', '旗帜': '🚩',
    '画': '🖼️', 'NPC': '👤', 'BUFF': '✨', '增益': '⬆️',
    '减益': '⬇️', '其他': '📁'
  }
  for (const key in map) {
    if (name.includes(key)) return map[key]
  }
  return '📁'
}

const scrollToFeatures = () => {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
}

const goToSearch = () => {
  if (quickSearch.value.trim()) {
    router.push({
      path: '/items',
      query: { search: quickSearch.value.trim() }
    })
  }
}

const handleQuickSuggestionPick = (suggestion: ItemSuggestion) => {
  void router.push({
    path: `/items/${suggestion.id}`,
  })
}

const openItemDetail = (item: Item) => {
  try {
    if (!item || !item.id) {
      throw new Error('物品信息不完整')
    }
    router.push({
      path: `/items/${item.id}`,
    })
  } catch (err) {
    console.error('跳转失败:', err)
    // 可以添加一个全局的错误提示组件，这里暂时使用 alert
    alert('跳转失败，请稍后重试')
  }
}

// Preload images to prevent animation stutter
const preloadImages = (imageUrls: string[]): Promise<void> => {
  // Limit the number of images to preload at once to avoid browser throttling
  const batchSize = 10
  const batches = []
  
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize)
    batches.push(
      Promise.all(
        batch.map(url => {
          return new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => resolve()
            img.onerror = () => resolve() // Continue even if image fails
            img.src = url
          })
        })
      )
    )
  }
  
  return Promise.all(batches).then(() => {})
}

const loadData = async () => {
  try {
      error.value = ''
      isOfflineMode.value = false

      console.log('========== HomePage 开始加载数据 ==========')

      const [itemsRes, categoriesRes, statsRes] = await Promise.all([
        fetchItems(1, homepageItemSampleSize, undefined, undefined, undefined, 'id', 'desc'),
        fetchCategories(),
        fetchStatsOverview(),
      ])

      if (!itemsRes.success) {
        throw new Error(itemsRes.message || '获取物品列表失败')
      }

      items.value = itemsRes.data || []
      statsOverview.value = statsRes.success ? statsRes.data : null

      const flatCats = flattenCategories(categoriesRes.data || [])
      console.log('展平后的分类数据:', flatCats.length, '个')
      categories.value = flatCats

      console.log('分类数据:', categories.value)
      console.log('分类数量:', categories.value.length)
      if (categories.value.length > 0) {
        console.log('第一个分类:', categories.value[0])
        console.log('根分类:', categories.value.filter(c => c.parentId === 0 || c.parentId === null))
      }

      totalItems.value = statsOverview.value?.totalItems ?? itemsRes.pagination?.total ?? items.value.length

      cachedItems.value = [...items.value]
      cachedCategories.value = [...categories.value]
      hasCachedData.value = true

      const imagesToPreload = items.value
        .filter(item => item.image)
        .slice(0, 50)
        .map(item => getImageUrl(item.image!))
      await preloadImages(imagesToPreload)

      setTimeout(() => {
        imagesLoaded.value = true
      }, 500)
    } catch (err) {
      console.error('加载数据失败:', err)

      if (hasCachedData.value && cachedItems.value.length > 0) {
        items.value = cachedItems.value
        categories.value = cachedCategories.value
        isOfflineMode.value = true
        error.value = ''
        console.log('使用缓存数据展示')
      } else {
        error.value = '网络错误，请稍后重试'
        items.value = mockItems
        categories.value = mockCategories
        totalItems.value = mockItems.length
        error.value = ''
      }
    } finally {
      isLoading.value = false
    }
}

// Retry connection
const retryConnection = async () => {
  isLoading.value = true
  isOfflineMode.value = false
  await loadData()
}

// Handle individual image load
const onImageLoad = () => {
  loadedImageCount.value++
  if (loadedImageCount.value >= Math.min(totalFloatingImages, floatingItems.value.length)) {
    imagesLoaded.value = true
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
/* Floating items fade-in animation */
.floating-item {
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.8s ease-out, transform 0.8s ease-out;
}

.floating-item.is-loaded {
  opacity: 0.09;
  transform: scale(1);
}

/* Subtle floating animation after fade-in */
.floating-item.is-loaded .floating-img {
  animation: gentleFloat 6s ease-in-out infinite;
}

@keyframes gentleFloat {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(3deg);
  }
}

/* Stagger animation delays for each item */
.floating-item:nth-child(1) { transition-delay: 0.1s; }
.floating-item:nth-child(2) { transition-delay: 0.2s; }
.floating-item:nth-child(3) { transition-delay: 0.3s; }
.floating-item:nth-child(4) { transition-delay: 0.4s; }
.floating-item:nth-child(5) { transition-delay: 0.5s; }
.floating-item:nth-child(6) { transition-delay: 0.6s; }
.floating-item:nth-child(7) { transition-delay: 0.7s; }
.floating-item:nth-child(8) { transition-delay: 0.8s; }
.floating-item:nth-child(9) { transition-delay: 0.9s; }
.floating-item:nth-child(10) { transition-delay: 1s; }
.floating-item:nth-child(11) { transition-delay: 1.1s; }
.floating-item:nth-child(12) { transition-delay: 1.2s; }
.floating-item:nth-child(13) { transition-delay: 1.3s; }
.floating-item:nth-child(14) { transition-delay: 1.4s; }
.floating-item:nth-child(15) { transition-delay: 1.5s; }
.floating-item:nth-child(16) { transition-delay: 1.6s; }
.floating-item:nth-child(17) { transition-delay: 1.7s; }
.floating-item:nth-child(18) { transition-delay: 1.8s; }
.floating-item:nth-child(19) { transition-delay: 1.9s; }
.floating-item:nth-child(20) { transition-delay: 2s; }

.home-page :deep(.hero-title) {
  font-size: clamp(2.8rem, 8vw, 5.4rem) !important;
  line-height: 1.02;
  font-weight: 700;
  text-shadow: 0 4px 14px rgb(35 53 43 / 0.05);
}

.home-hero {
  background:
    radial-gradient(circle at top, rgb(255 255 255 / 0.28), transparent 46%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 20%, transparent), transparent 60%);
}

.home-hero::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-color), transparent);
}

.hero-badge {
  box-shadow: 0 8px 22px rgb(35 53 43 / 0.06);
  background-color: color-mix(in srgb, white 72%, var(--bg-secondary)) !important;
}

.home-page :deep(.hero-title + p) {
  max-width: 42rem;
  color: var(--text-secondary) !important;
  font-size: 1rem !important;
}

.quick-tag {
  min-height: 2rem;
  padding-inline: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--bg-secondary) 78%, white 22%) !important;
  box-shadow: none;
}

.quick-tag__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.55rem;
  min-height: 1.55rem;
  padding: 0 0.38rem;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, white 90%);
}

.stat-block,
.feature-card,
.category-card {
  background: var(--surface-elevated) !important;
  border-color: var(--border-color) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-sm);
}

.stat-block:hover,
.feature-card:hover,
.category-card:hover {
  border-color: var(--border-color) !important;
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(42, 61, 49, 0.07);
}

.feature-card::before,
.category-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, rgb(255 255 255 / 0.12), transparent 34%);
  pointer-events: none;
}

.network-banner {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 74%, #314336), color-mix(in srgb, var(--accent-secondary) 64%, #42534a));
  color: #fbf9f4;
}

.home-footer {
  display: none;
}

.home-footer .footer-mark {
  font-family: 'Cinzel', 'Noto Sans SC', serif;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  box-shadow: 0 18px 30px color-mix(in srgb, var(--accent-primary) 22%, transparent);
}

@media (max-width: 640px) {
  .home-page :deep(.hero-title) {
    text-wrap: balance;
  }

  .quick-tag {
    padding-inline: 0.72rem;
  }
}
</style>
