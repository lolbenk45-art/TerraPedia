import type {
  PublicCategoryNavigationChild,
  PublicCategoryNavigationEntry,
} from '~/types/public-api'

const NAVIGATION_DEFINITIONS = [
  { slug: 'weapons', filterKey: 'weapon' },
  { slug: 'armor', filterKey: 'armor' },
  { slug: 'potions', filterKey: 'potion' },
  { slug: 'materials', filterKey: 'material' },
  { slug: 'furniture', filterKey: 'furniture' },
  { slug: 'tools', filterKey: 'tool' },
] as const

type NavigationScopeLike = {
  categoryIds?: unknown
}

const nonEmptyString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const exactNonEmptyString = (value: unknown) => typeof value === 'string' && value.trim() ? value : null

export const normalizeNavigationCategoryIds = (value: unknown): number[] => {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0)
  ) {
    return []
  }

  return Array.from(new Set(value))
}

export const hasResolvedNavigationScope = (entry: NavigationScopeLike | null | undefined) => (
  normalizeNavigationCategoryIds(entry?.categoryIds).length > 0
)

const normalizeChildren = (value: unknown): PublicCategoryNavigationChild[] | null => {
  if (!Array.isArray(value)) return null

  const children: PublicCategoryNavigationChild[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null

    const child = candidate as Record<string, unknown>
    const id = child.id
    const code = exactNonEmptyString(child.code)
    const name = nonEmptyString(child.name)
    const categoryIds = normalizeNavigationCategoryIds(child.categoryIds)
    const itemPath = exactNonEmptyString(child.itemPath)
    const itemCount = child.itemCount
    const image = child.image
    const imageValid = image == null
      || (typeof image === 'string' && image.startsWith('/terrapedia-images/items/'))
    if (
      typeof id !== 'number'
      || !Number.isInteger(id)
      || id <= 0
      || !code
      || !name
      || categoryIds.length === 0
      || itemPath !== `/items?category=${code}`
      || typeof itemCount !== 'number'
      || !Number.isInteger(itemCount)
      || itemCount < 0
      || !imageValid
    ) return null
    children.push({
      id,
      code,
      name,
      categoryIds,
      itemPath,
      itemCount,
      image: typeof image === 'string' ? image : null,
    })
  }
  return children
}

export const normalizePublicCategoryNavigation = (value: unknown): PublicCategoryNavigationEntry[] | null => {
  if (!Array.isArray(value) || value.length !== NAVIGATION_DEFINITIONS.length) return null

  const entries: PublicCategoryNavigationEntry[] = []
  for (const [index, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== 'object') return null

    const definition = NAVIGATION_DEFINITIONS[index]!
    const entry = candidate as Record<string, unknown>
    const name = nonEmptyString(entry.name)
    const rawCategoryCodes = entry.categoryCodes
    const categoryCodes = Array.isArray(rawCategoryCodes)
      && rawCategoryCodes.length > 0
      && rawCategoryCodes.every((code) => nonEmptyString(code) != null)
      ? rawCategoryCodes.map((code) => String(code).trim())
      : []
    const categoryIds = normalizeNavigationCategoryIds(entry.categoryIds)
    const itemCount = entry.itemCount
    const children = normalizeChildren(entry.children)
    const descriptionValid = entry.description == null || typeof entry.description === 'string'
    const iconValid = entry.icon == null || typeof entry.icon === 'string'

    if (
      entry.slug !== definition.slug
      || entry.filterKey !== definition.filterKey
      || entry.categoryPath !== `/categories/${definition.slug}`
      || entry.itemPath !== `/items?filter=${definition.filterKey}`
      || !name
      || categoryCodes.length === 0
      || categoryIds.length === 0
      || typeof itemCount !== 'number'
      || !Number.isInteger(itemCount)
      || itemCount < 0
      || children == null
      || !descriptionValid
      || !iconValid
    ) {
      return null
    }

    entries.push({
      slug: definition.slug,
      filterKey: definition.filterKey,
      name,
      description: typeof entry.description === 'string' ? entry.description : null,
      icon: typeof entry.icon === 'string' ? entry.icon : null,
      categoryPath: `/categories/${definition.slug}`,
      itemPath: `/items?filter=${definition.filterKey}`,
      categoryCodes,
      categoryIds,
      itemCount,
      children,
    })
  }

  return entries
}

export const isUnknownCategorySlug = (
  entries: readonly PublicCategoryNavigationEntry[],
  slug: string,
  pending: boolean,
  failed: boolean,
) => !pending && !failed && !entries.some((entry) => entry.slug === slug)

export type ResolvedPublicCategoryNavigationChild = {
  parent: PublicCategoryNavigationEntry
  child: PublicCategoryNavigationChild
}

export const resolvePublicCategoryNavigationChild = (
  entries: readonly PublicCategoryNavigationEntry[],
  categoryCode: string,
): ResolvedPublicCategoryNavigationChild | null => {
  for (const parent of entries) {
    const child = parent.children.find((candidate) => candidate.code === categoryCode)
    if (child) return { parent, child }
  }
  return null
}

export type PublicCategoryNavigationSelection = {
  mode: 'none' | 'parent' | 'child'
  required: boolean
  ready: boolean
  unavailable: boolean
  parent: PublicCategoryNavigationEntry | null
  child: PublicCategoryNavigationChild | null
  categoryIds: number[]
}

export const resolvePublicCategoryNavigationSelection = (
  entries: readonly PublicCategoryNavigationEntry[],
  categoryCode: string | null,
  parentSlug: string | null,
  pending: boolean,
  failed: boolean,
): PublicCategoryNavigationSelection => {
  const required = categoryCode != null || parentSlug != null
  if (!required) {
    return {
      mode: 'none',
      required: false,
      ready: true,
      unavailable: false,
      parent: null,
      child: null,
      categoryIds: [],
    }
  }

  const resolvedChild = categoryCode == null
    ? null
    : resolvePublicCategoryNavigationChild(entries, categoryCode)
  const resolvedParent = categoryCode == null && parentSlug != null
    ? entries.find((entry) => entry.slug === parentSlug) ?? null
    : resolvedChild?.parent ?? null
  const child = resolvedChild?.child ?? null
  const categoryIds = child?.categoryIds ?? resolvedParent?.categoryIds ?? []
  const resolved = hasResolvedNavigationScope({ categoryIds })

  return {
    mode: child ? 'child' : resolvedParent ? 'parent' : categoryCode != null ? 'child' : 'parent',
    required: true,
    ready: !pending && !failed && resolved,
    unavailable: !pending && (failed || !resolved),
    parent: resolvedParent,
    child,
    categoryIds,
  }
}
