import type { PublicCategoryNavigationEntry } from '~/types/public-api'

export const usePublicCategoryNavigation = () => useAsyncData(
  'public-category-navigation',
  async () => {
    const response = await usePublicApiFetch<PublicCategoryNavigationEntry[]>('/categories/navigation')
    if (response.success === false) {
      throw new Error(response.message || '分类资料暂不可用')
    }

    const entries = unwrapApiResponse(response)
    if (!Array.isArray(entries) || entries.length !== 6) {
      throw new Error('分类导航返回了无效的数据')
    }

    return entries
  },
  { default: () => [] },
)
