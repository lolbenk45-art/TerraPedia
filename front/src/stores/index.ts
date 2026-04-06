import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Item, Category, Theme } from '@/types'
import { fetchItems, fetchCategories } from '@/api'

export const useAppStore = defineStore('app', () => {
  // State
  const theme = ref<Theme>('light')
  const items = ref<Item[]>([])
  const categories = ref<Category[]>([])
  const selectedCategory = ref<number | null>(null)
  const searchQuery = ref('')
  const currentPage = ref(1)
  const totalPages = ref(1)
  const totalItems = ref(0)
  const itemsPerPage = ref(42)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const categoryTree = computed(() => {
    const buildTree = (categories: Category[], parentId: number | null = null): Category[] => {
      return categories
        .filter(cat => cat.parentId === parentId)
        .map(cat => ({
          ...cat,
          children: buildTree(categories, cat.id)
        }))
    }
    return buildTree(categories.value)
  })

  // Get all descendant category IDs
  const getDescendantIds = (categoryId: number): number[] => {
    const ids: number[] = [categoryId]
    const findChildren = (cats: Category[], parentId: number) => {
      cats.forEach(cat => {
        if (cat.parentId === parentId) {
          ids.push(cat.id)
          findChildren(categories.value, cat.id)
        }
      })
    }
    findChildren(categories.value, categoryId)
    return ids
  }

  const filteredItems = computed(() => {
    let result = items.value
    
    // 按分类筛选（包括子分类）
    if (selectedCategory.value) {
      const categoryIds = getDescendantIds(selectedCategory.value)
      result = result.filter(item => categoryIds.includes(item.categoryId || 0))
    }
    
    return result
  })

  const themeClasses = computed(() => {
    const themeMap: Record<Theme, string> = {
      light: '',
      dark: 'dark',
      ocean: 'ocean',
      forest: 'forest',
      sunset: 'sunset'
    }
    return themeMap[theme.value]
  })

  // Actions
  const setTheme = (newTheme: Theme) => {
    theme.value = newTheme
    document.documentElement.className = themeClasses.value
    localStorage.setItem('theme', newTheme)
  }

  const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') as Theme
    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      // 检测系统主题
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }
  }

  const loadItems = async (page = 1) => {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetchItems(page, itemsPerPage.value, searchQuery.value || undefined)
      items.value = response.data || []
      currentPage.value = response.pagination?.page || page
      totalPages.value = response.pagination?.totalPages || 1
      totalItems.value = response.pagination?.total || 0
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败'
      console.error('加载物品失败:', err)
    } finally {
      isLoading.value = false
    }
  }

  const loadCategories = async () => {
    try {
      const response = await fetchCategories()
      categories.value = response.data || []
    } catch (err) {
      console.error('加载分类失败:', err)
    }
  }

  const setCategory = (categoryId: number | null) => {
    selectedCategory.value = categoryId
    currentPage.value = 1
    // 注意：这里不重新加载物品，因为后端可能不支持按分类筛选
    // 而是在前端进行筛选
  }

  const setSearchQuery = (query: string) => {
    searchQuery.value = query
    currentPage.value = 1
    loadItems(1)
  }

  const changePage = (page: number) => {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
      loadItems(page)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return {
    // State
    theme,
    items,
    categories,
    selectedCategory,
    searchQuery,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    isLoading,
    error,
    // Getters
    filteredItems,
    themeClasses,
    categoryTree,
    // Actions
    setTheme,
    initTheme,
    loadItems,
    loadCategories,
    setCategory,
    setSearchQuery,
    changePage,
  }
})
