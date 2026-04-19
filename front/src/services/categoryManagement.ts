import type { Category, ApiResponse } from '@/types'
import { createHttpClient } from '@/api/httpClient'
import { requestWithFallback } from '@/api/requestFallback'

const adminApi = createHttpClient({
  baseURL: '/api/admin',
  withCredentials: false,
  errorLabel: 'Admin API Error:',
})

const buildPathWithQuery = (
  path: string,
  params: Record<string, string | number | null | undefined>,
): string => {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      searchParams.append(key, String(value))
    }
  })

  const query = searchParams.toString()
  return query ? `${path}?${query}` : path
}

const withAdminFallback = <T>(
  request: () => Promise<T>,
  fallbackValue: T,
  errorMessage: string,
) =>
  requestWithFallback({
    request,
    fallbackValue,
    errorMessage,
  })

export const getAllCategories = async (): Promise<Category[]> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category[]>>('/categories')
      return data.data || []
    },
    [],
    'Failed to fetch categories:',
  )

export const getCategoryTree = async (): Promise<Category[]> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category[]>>('/categories/tree')
      return data.data || []
    },
    [],
    'Failed to fetch category tree:',
  )

export const getCategoryById = async (id: number): Promise<Category | null> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category>>(`/categories/${id}`)
      return data.data || null
    },
    null,
    'Failed to fetch category detail:',
  )

export const getCategoriesByParentId = async (parentId: number): Promise<Category[]> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/parent/${parentId}`)
      return data.data || []
    },
    [],
    'Failed to fetch child categories:',
  )

export const searchCategories = async (keyword: string): Promise<Category[]> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category[]>>(
        `/categories/search?keyword=${encodeURIComponent(keyword)}`
      )
      return data.data || []
    },
    [],
    'Failed to search categories:',
  )

export const getCategoryPathToRoot = async (id: number): Promise<Category[]> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/${id}/path`)
      return data.data || []
    },
    [],
    'Failed to fetch category path:',
  )

export const getCategoryDescendants = async (id: number): Promise<Category[]> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/${id}/descendants`)
      return data.data || []
    },
    [],
    'Failed to fetch category descendants:',
  )

export const countCategoryDescendants = async (id: number): Promise<number> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.get<ApiResponse<number>>(`/categories/${id}/descendants/count`)
      return data.data || 0
    },
    0,
    'Failed to count category descendants:',
  )

export const createCategory = async (category: Partial<Category>): Promise<Category | null> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.post<ApiResponse<Category>>('/categories', category)
      return data.data || null
    },
    null,
    'Failed to create category:',
  )

export const updateCategory = async (id: number, category: Partial<Category>): Promise<Category | null> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.put<ApiResponse<Category>>(`/categories/${id}`, category)
      return data.data || null
    },
    null,
    'Failed to update category:',
  )

export const updateCategoryParent = async (id: number, newParentId: number): Promise<Category | null> => {
  if (!Number.isFinite(newParentId)) {
    return null
  }

  return withAdminFallback(
    async () => {
      const path = buildPathWithQuery(`/categories/${id}/parent`, { newParentId })
      const { data } = await adminApi.put<ApiResponse<Category>>(path)
      return data.data || null
    },
    null,
    'Failed to move category:',
  )
}

export const updateCategorySort = async (id: number, newSort: number): Promise<Category | null> =>
  withAdminFallback(
    async () => {
      const { data } = await adminApi.put<ApiResponse<Category>>(
        `/categories/${id}/sort?newSort=${newSort}`
      )
      return data.data || null
    },
    null,
    'Failed to update category sort:',
  )

export const deleteCategory = async (id: number): Promise<boolean> =>
  withAdminFallback(
    async () => {
      await adminApi.delete(`/categories/${id}`)
      return true
    },
    false,
    'Failed to delete category:',
  )

export const deleteCategoryWithChildren = async (id: number): Promise<boolean> =>
  withAdminFallback(
    async () => {
      await adminApi.delete(`/categories/${id}/with-children`)
      return true
    },
    false,
    'Failed to delete category subtree:',
  )

export const validateCategoryHierarchy = async (id: number, parentId: number | null): Promise<boolean> => {
  if (!Number.isFinite(id)) {
    return false
  }

  return withAdminFallback(
    async () => {
      const path = buildPathWithQuery(`/categories/${id}/validate`, { parentId })
      const { data } = await adminApi.get<ApiResponse<boolean>>(path)
      return data.data || false
    },
    false,
    'Failed to validate category hierarchy:',
  )
}

export default {
  getAllCategories,
  getCategoryTree,
  getCategoryById,
  getCategoriesByParentId,
  searchCategories,
  getCategoryPathToRoot,
  getCategoryDescendants,
  countCategoryDescendants,
  createCategory,
  updateCategory,
  updateCategoryParent,
  updateCategorySort,
  deleteCategory,
  deleteCategoryWithChildren,
  validateCategoryHierarchy,
}
