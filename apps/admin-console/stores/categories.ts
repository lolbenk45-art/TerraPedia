import { defineStore } from 'pinia'
import { del, get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export interface Category {
  id: number
  name: string
  code?: string
  topType?: string
  parentId: number | null
  level: number
  sortOrder: number
  status?: number
  description?: string
  icon?: string
  createdAt?: string
  updatedAt?: string
  children?: Category[]
}

export interface CategoryPayload {
  name: string
  code?: string
  topType?: string
  parentId: number | null
  sortOrder?: number
  status?: number
  description?: string
  icon?: string
}

export interface CategoryOption {
  value: number
  label: string
  level: number
  treeLabel: string
  pathLabel: string
}

export interface GroupedCategoryOption {
  groupLabel: string
  options: CategoryOption[]
}

const normalizeCategory = (raw: any): Category => ({
  id: Number(raw?.id ?? 0),
  name: String(raw?.name ?? ''),
  code: raw?.code ?? '',
  topType: raw?.topType ?? raw?.top_type ?? '',
  parentId: raw?.parentId === 0 || raw?.parent_id === 0 ? null : (raw?.parentId ?? raw?.parent_id ?? null),
  level: Number(raw?.level ?? 1),
  sortOrder: Number(raw?.sortOrder ?? raw?.sort ?? raw?.sort_order ?? 1),
  status: raw?.status ?? raw?.state ?? 1,
  description: raw?.description ?? '',
  icon: raw?.icon ?? '',
  createdAt: raw?.createdAt ?? raw?.created_at,
  updatedAt: raw?.updatedAt ?? raw?.updated_at,
  children: Array.isArray(raw?.children) ? raw.children.map(normalizeCategory) : undefined
})

function buildNameMap(nodes: Category[]) {
  const map = new Map<number, string>()
  const traverse = (cats: Category[]) => {
    cats.forEach(cat => {
      map.set(cat.id, cat.name)
      if (cat.children?.length) traverse(cat.children)
    })
  }
  traverse(nodes)
  return map
}

function buildPathMap(nodes: Category[]) {
  const map = new Map<number, string>()
  const traverse = (cats: Category[], parents: string[] = []) => {
    cats.forEach(cat => {
      const pathNames = [...parents, cat.name]
      map.set(cat.id, pathNames.join(' / '))
      if (cat.children?.length) traverse(cat.children, pathNames)
    })
  }
  traverse(nodes)
  return map
}

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])
  const loading = ref(false)
  const categoryTree = ref<Category[]>([])
  const itemCategoryTree = ref<Category[]>([])

  const categoryOptions = computed<CategoryOption[]>(() => {
    const flatten = (cats: Category[], level = 0, parents: string[] = []): CategoryOption[] => {
      return cats.reduce((acc: CategoryOption[], cat) => {
        const pathNames = [...parents, cat.name]
        const treePrefix = level > 0 ? `${'  '.repeat(level)}|- ` : ''
        acc.push({
          value: cat.id,
          label: cat.name,
          level,
          treeLabel: `${treePrefix}${cat.name}`,
          pathLabel: pathNames.join(' / ')
        })
        if (cat.children?.length) {
          acc.push(...flatten(cat.children, level + 1, pathNames))
        }
        return acc
      }, [])
    }
    return flatten(categoryTree.value)
  })

  const categoryMap = computed(() => buildNameMap(categoryTree.value))
  const itemCategoryMap = computed(() => buildNameMap(itemCategoryTree.value))

  const groupedCategoryOptions = computed<GroupedCategoryOption[]>(() => {
    const groups = new Map<string, CategoryOption[]>()

    categoryOptions.value.forEach((option) => {
      const rootLabel = option.pathLabel.split(' / ')[0] || option.label
      if (!groups.has(rootLabel)) {
        groups.set(rootLabel, [])
      }
      groups.get(rootLabel)!.push(option)
    })

    return Array.from(groups.entries()).map(([groupLabel, options]) => ({
      groupLabel,
      options
    }))
  })

  const categoryPathMap = computed(() => buildPathMap(categoryTree.value))
  const itemCategoryPathMap = computed(() => buildPathMap(itemCategoryTree.value))

  const findCategoryNodeByCode = (code: string, nodes: Category[] = categoryTree.value): Category | null => {
    for (const node of nodes) {
      if (node.code === code) {
        return node
      }
      if (node.children?.length) {
        const found = findCategoryNodeByCode(code, node.children)
        if (found) return found
      }
    }
    return null
  }

  const fetchCategoryTree = async (endpoint: string) => {
    const response: any = await get(endpoint)
    if (response && response.success === false) {
      throw new Error(response.message || 'API returned failure')
    }
    const list = response?.data ?? response
    return Array.isArray(list) ? list.map(normalizeCategory) : []
  }

  const fetchCategories = async () => {
    loading.value = true
    try {
      const normalized = await fetchCategoryTree('/categories')
      categoryTree.value.splice(0, categoryTree.value.length, ...normalized)
      categories.value.splice(0, categories.value.length, ...normalized)
    } catch (e: any) {
      console.error('[Categories Store] fetch error:', e.message)
      showToast(e?.data?.message || e?.message || '获取分类列表失败', 'error')
      categoryTree.value = []
      categories.value = []
    } finally {
      loading.value = false
    }
  }

  const fetchItemCategories = async () => {
    loading.value = true
    try {
      const normalized = await fetchCategoryTree('/categories/items')
      itemCategoryTree.value.splice(0, itemCategoryTree.value.length, ...normalized)
    } catch (e: any) {
      console.error('[Categories Store] item-only fetch error:', e.message)
      showToast(e?.data?.message || e?.message || '获取物品分类列表失败', 'error')
      itemCategoryTree.value = []
    } finally {
      loading.value = false
    }
  }

  const fetchCategoryById = async (id: number) => {
    try {
      const response: any = await get(`/categories/${id}`)
      const raw = response?.data ?? response
      return raw ? normalizeCategory(raw) : null
    } catch (e: any) {
      showToast(e?.data?.message || e?.message || '获取分类详情失败', 'error')
      return null
    }
  }

  const createCategory = async (payload: CategoryPayload) => {
    try {
      const response: any = await post('/categories', {
        name: payload.name.trim(),
        code: payload.code?.trim() ?? '',
        topType: payload.topType?.trim() ?? '',
        parentId: payload.parentId,
        sortOrder: Math.max(1, Number(payload.sortOrder ?? 1)),
        status: payload.status ?? 1,
        description: payload.description?.trim() ?? '',
        icon: payload.icon?.trim() ?? ''
      })
      const raw = response?.data ?? response
      if (!raw) {
        throw new Error(response?.message || '创建分类失败')
      }
      showToast('创建分类成功', 'success')
      await fetchCategories()
      return normalizeCategory(raw)
    } catch (e: any) {
      showToast(e?.data?.message || e?.message || '创建分类失败', 'error')
      return null
    }
  }

  const updateCategory = async (id: number, payload: CategoryPayload) => {
    try {
      const response: any = await put(`/categories/${id}`, {
        name: payload.name.trim(),
        code: payload.code?.trim() ?? '',
        topType: payload.topType?.trim() ?? '',
        parentId: payload.parentId,
        sortOrder: Math.max(1, Number(payload.sortOrder ?? 1)),
        status: payload.status ?? 1,
        description: payload.description?.trim() ?? '',
        icon: payload.icon?.trim() ?? ''
      })
      const raw = response?.data ?? response
      if (!raw) {
        throw new Error(response?.message || '更新分类失败')
      }
      showToast('更新分类成功', 'success')
      await fetchCategories()
      return normalizeCategory(raw)
    } catch (e: any) {
      showToast(e?.data?.message || e?.message || '更新分类失败', 'error')
      return null
    }
  }

  const deleteCategory = async (id: number) => {
    try {
      await del(`/categories/${id}`)
      showToast('删除分类成功', 'success')
      await fetchCategories()
      return true
    } catch (e: any) {
      const msg = e?.data?.message || e?.data?.statusMessage || e?.statusMessage || '删除分类失败'
      showToast(msg, 'error')
      return false
    }
  }

  const getCategoryNameById = (id: number): string => {
    return categoryMap.value.get(id) || itemCategoryMap.value.get(id) || '未知分类'
  }

  const getCategoryPathById = (id: number): string => {
    return categoryPathMap.value.get(id) || itemCategoryPathMap.value.get(id) || getCategoryNameById(id)
  }

  const buildTree = (flatCategories: Category[]): Category[] => {
    const map = new Map<number, Category>()
    const roots: Category[] = []
    flatCategories.forEach(cat => map.set(cat.id, { ...cat, children: [] }))
    flatCategories.forEach(cat => {
      const node = map.get(cat.id)!
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children!.push(node)
      } else {
        roots.push(node)
      }
    })
    return roots
  }

  return {
    categories,
    categoryTree,
    itemCategoryTree,
    loading,
    categoryOptions,
    groupedCategoryOptions,
    categoryMap,
    categoryPathMap,
    fetchCategories,
    fetchItemCategories,
    fetchCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoryNameById,
    getCategoryPathById,
    buildTree,
    findCategoryNodeByCode
  }
})
