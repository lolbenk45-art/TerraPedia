import axios from 'axios'
import type { Category, ApiResponse } from '@/types'

const adminApi = axios.create({
  baseURL: '/api/admin',
  timeout: 10000,
})

// Error handling interceptor
adminApi.interceptors.response.use(
  response => response,
  error => {
    console.error('Admin API Error:', error)
    return Promise.reject(error)
  }
)

/**
 * Category Management Service
 * Provides comprehensive CRUD operations for categories with hierarchical support
 */

// Query Operations

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category[]>>('/categories')
    return data.data || []
  } catch (error) {
    console.error('获取所有分类失败:', error)
    return []
  }
}

export const getCategoryTree = async (): Promise<Category[]> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category[]>>('/categories/tree')
    return data.data || []
  } catch (error) {
    console.error('获取分类树失败:', error)
    return []
  }
}

export const getCategoryById = async (id: number): Promise<Category | null> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category>>(`/categories/${id}`)
    return data.data || null
  } catch (error) {
    console.error('获取分类详情失败:', error)
    return null
  }
}

export const getCategoriesByParentId = async (parentId: number): Promise<Category[]> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/parent/${parentId}`)
    return data.data || []
  } catch (error) {
    console.error('获取子分类失败:', error)
    return []
  }
}

export const searchCategories = async (keyword: string): Promise<Category[]> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/search?keyword=${encodeURIComponent(keyword)}`)
    return data.data || []
  } catch (error) {
    console.error('搜索分类失败:', error)
    return []
  }
}

export const getCategoryPathToRoot = async (id: number): Promise<Category[]> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/${id}/path`)
    return data.data || []
  } catch (error) {
    console.error('获取分类路径失败:', error)
    return []
  }
}

export const getCategoryDescendants = async (id: number): Promise<Category[]> => {
  try {
    const { data } = await adminApi.get<ApiResponse<Category[]>>(`/categories/${id}/descendants`)
    return data.data || []
  } catch (error) {
    console.error('获取后代分类失败:', error)
    return []
  }
}

export const countCategoryDescendants = async (id: number): Promise<number> => {
  try {
    const { data } = await adminApi.get<ApiResponse<number>>(`/categories/${id}/descendants/count`)
    return data.data || 0
  } catch (error) {
    console.error('统计后代数量失败:', error)
    return 0
  }
}

// Create Operations

export const createCategory = async (category: Partial<Category>): Promise<Category | null> => {
  try {
    const { data } = await adminApi.post<ApiResponse<Category>>('/categories', category)
    return data.data || null
  } catch (error) {
    console.error('创建分类失败:', error)
    return null
  }
}

// Update Operations

export const updateCategory = async (id: number, category: Partial<Category>): Promise<Category | null> => {
  try {
    const { data } = await adminApi.put<ApiResponse<Category>>(`/categories/${id}`, category)
    return data.data || null
  } catch (error) {
    console.error('更新分类失败:', error)
    return null
  }
}

export const updateCategoryParent = async (id: number, newParentId: number | null): Promise<Category | null> => {
  try {
    const params = newParentId !== null ? `?newParentId=${newParentId}` : ''
    const { data } = await adminApi.put<ApiResponse<Category>>(`/categories/${id}/parent${params}`)
    return data.data || null
  } catch (error) {
    console.error('移动分类失败:', error)
    return null
  }
}

export const updateCategorySort = async (id: number, newSort: number): Promise<Category | null> => {
  try {
    const { data } = await adminApi.put<ApiResponse<Category>>(`/categories/${id}/sort?newSort=${newSort}`)
    return data.data || null
  } catch (error) {
    console.error('更新排序失败:', error)
    return null
  }
}

// Delete Operations

export const deleteCategory = async (id: number): Promise<boolean> => {
  try {
    await adminApi.delete(`/categories/${id}`)
    return true
  } catch (error: any) {
    console.error('删除分类失败:', error)
    if (error.response?.data?.message) {
      alert(`删除失败：${error.response.data.message}`)
    }
    return false
  }
}

export const deleteCategoryWithChildren = async (id: number): Promise<boolean> => {
  try {
    await adminApi.delete(`/categories/${id}/with-children`)
    return true
  } catch (error: any) {
    console.error('删除分类及子分类失败:', error)
    if (error.response?.data?.message) {
      alert(`删除失败：${error.response.data.message}`)
    }
    return false
  }
}

// Hierarchy Validation

export const validateCategoryHierarchy = async (id: number | null, parentId: number | null): Promise<boolean> => {
  try {
    const params = new URLSearchParams()
    if (parentId !== null) {
      params.append('parentId', parentId.toString())
    }
    const path = id !== null ? `/categories/${id}/validate?${params}` : `/categories/validate?${params}`
    const { data } = await adminApi.get<ApiResponse<boolean>>(path)
    return data.data || false
  } catch (error) {
    console.error('验证层级关系失败:', error)
    return false
  }
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
  validateCategoryHierarchy
}
