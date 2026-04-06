import type { Category } from '@/types'

type BuildCategoryTreeOptions = {
  excludeRootCodes?: string[]
}

export const flattenCategories = (nodes: Category[]): Category[] => {
  const result: Category[] = []

  const visit = (categories: Category[]) => {
    categories.forEach((category) => {
      result.push(category)
      if (category.children?.length) {
        visit(category.children)
      }
    })
  }

  visit(nodes)
  return result
}

export const buildCategoryTree = (
  categories: Category[],
  options: BuildCategoryTreeOptions = {}
): Category[] => {
  const rootExcludedCodes = new Set(options.excludeRootCodes || [])

  const build = (parentId: number | null = null, level = 0): Category[] => {
    const parentValue = parentId ?? 0

    return categories
      .filter((category) => {
        const categoryParentId = category.parentId ?? 0
        if (categoryParentId !== parentValue) {
          return false
        }

        if (parentId === null && category.code && rootExcludedCodes.has(category.code)) {
          return false
        }

        return true
      })
      .sort((left, right) => (left.sort || 0) - (right.sort || 0))
      .map((category) => ({
        ...category,
        level,
        children: build(category.id, level + 1),
      }))
  }

  return build()
}
