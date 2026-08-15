export type BiomePackGroup<T> = {
  key: string
  title: string
  items: T[]
}

export type BiomeGroupSegment<T> = {
  key: string
  title: string
  continuationLabel?: string
  part: number
  items: T[]
  cost: number
}

export type BiomePage<T> = {
  page: number
  segments: BiomeGroupSegment<T>[]
  cost: number
}

/** Justified by measured mobile /biomes height 25350px / 47 tiles ≈ 540px/tile; page1 also carries 3 featured cards so budget 10. */
export const BIOME_PAGE_ITEM_BUDGET = 10

/**
 * Pack complete biome groups by item-count cost. Oversized groups split into
 * stable continuation segments of at most `budget` items.
 */
export const packBiomePages = <T,>(
  groups: BiomePackGroup<T>[],
  budget: number = BIOME_PAGE_ITEM_BUDGET,
): BiomePage<T>[] => {
  const safeBudget = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : BIOME_PAGE_ITEM_BUDGET
  const pages: BiomePage<T>[] = []
  let pageIndex = 1
  let segments: BiomeGroupSegment<T>[] = []
  let cost = 0

  const flush = () => {
    if (!segments.length) {
      return
    }
    pages.push({ page: pageIndex, segments, cost })
    pageIndex += 1
    segments = []
    cost = 0
  }

  const placeChunk = (
    group: BiomePackGroup<T>,
    chunk: T[],
    part: number,
  ) => {
    if (!chunk.length) {
      return
    }
    if (cost + chunk.length > safeBudget && segments.length) {
      flush()
    }
    // Still too large for an empty page: should not happen if callers split to budget.
    if (chunk.length > safeBudget) {
      // Defensive: split further
      for (let offset = 0; offset < chunk.length; offset += safeBudget) {
        placeChunk(group, chunk.slice(offset, offset + safeBudget), part + Math.floor(offset / safeBudget))
      }
      return
    }
    segments.push({
      key: part === 1 ? group.key : `${group.key}__part-${part}`,
      title: group.title,
      continuationLabel: part > 1 ? `${group.title}（续 ${part}）` : undefined,
      part,
      items: chunk,
      cost: chunk.length,
    })
    cost += chunk.length
    if (cost >= safeBudget) {
      flush()
    }
  }

  for (const group of groups) {
    const items = Array.isArray(group.items) ? group.items : []
    if (!items.length) {
      continue
    }

    if (items.length <= safeBudget) {
      // Whole group: new page if it does not fit remaining room.
      if (cost > 0 && cost + items.length > safeBudget) {
        flush()
      }
      placeChunk(group, items, 1)
      continue
    }

    // Oversized: emit budget-sized continuation segments.
    let part = 1
    for (let offset = 0; offset < items.length; offset += safeBudget) {
      const chunk = items.slice(offset, offset + safeBudget)
      if (cost > 0 && cost + chunk.length > safeBudget) {
        flush()
      }
      placeChunk(group, chunk, part)
      part += 1
    }
  }

  flush()

  if (!pages.length) {
    return [{ page: 1, segments: [], cost: 0 }]
  }

  return pages
}

export const clampBiomePage = (page: number, pageCount: number) => {
  const count = Math.max(1, pageCount)
  if (!Number.isFinite(page)) {
    return 1
  }
  return Math.min(count, Math.max(1, Math.floor(page)))
}

export const groupBiomesByParent = <T extends { parentGroupLabel?: string }>(
  items: T[],
): BiomePackGroup<T>[] => {
  const order: string[] = []
  const map = new Map<string, T[]>()

  for (const item of items) {
    const title = String(item.parentGroupLabel || '未分组').trim() || '未分组'
    if (!map.has(title)) {
      map.set(title, [])
      order.push(title)
    }
    map.get(title)!.push(item)
  }

  return order.map((title) => ({
    key: title,
    title,
    items: map.get(title) || [],
  }))
}
