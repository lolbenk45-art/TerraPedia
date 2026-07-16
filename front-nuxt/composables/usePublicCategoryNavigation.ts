import type { PublicCategoryNavigationEntry } from '~/types/public-api'
import { normalizePublicCategoryNavigation } from '~/utils/publicCategoryNavigation'

export const usePublicCategoryNavigation = () => useAsyncData(
  'public-category-navigation',
  async () => {
    const response = await usePublicApiFetch<PublicCategoryNavigationEntry[]>('/categories/navigation')
    if (response.success === false) {
      throw new Error(response.message || '分类资料暂不可用')
    }

    const entries = normalizePublicCategoryNavigation(unwrapApiResponse(response))
    if (!entries) {
      throw new Error('分类导航返回了无效的数据')
    }

    return entries
  },
  { default: () => [] },
)
