import type {
  Pagination,
  NpcCatalogCard,
  PublicNpcAggregate,
  PublicNpcAggregateBundle,
  PublicNpcBuffRelation,
  PublicNpcLivingPreference,
  PublicNpcListItem,
  PublicNpcListResult,
  PublicNpcLootEntry,
  PublicNpcQuery,
  PublicNpcShopCondition,
  PublicNpcShopEntry,
  PublicNpcTraceableItemSummary,
  PublicNpcWikiAssets,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const DEFAULT_NPC_AGGREGATE_QUERY = { include: 'loot,shop,buffs' } as const

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const toBoolean = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'

const parseJsonArray = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  }

  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
      : []
  } catch {
    return []
  }
}

const normalizeTraceableItemSummary = (entry: Record<string, unknown>): PublicNpcTraceableItemSummary => ({
  ...entry,
  itemId: toNumberOrNull(entry.itemId ?? entry.item_id),
  itemName: normalizeText(entry.itemName ?? entry.item_name) || null,
  itemNameZh: normalizeText(entry.itemNameZh ?? entry.item_name_zh) || null,
  itemInternalName: normalizeText(entry.itemInternalName ?? entry.item_internal_name) || null,
  relationType: normalizeText(entry.relationType ?? entry.relation_type) || null,
  quantityText: normalizeText(entry.quantityText ?? entry.quantity_text) || null,
  chanceText: normalizeText(entry.chanceText ?? entry.chance_text) || null,
  priceText: normalizeText(entry.priceText ?? entry.price_text) || null,
  sourceFactKey: normalizeText(entry.sourceFactKey ?? entry.source_fact_key) || null,
  sourceProvider: normalizeText(entry.sourceProvider ?? entry.source_provider) || null,
  sourcePage: normalizeText(entry.sourcePage ?? entry.source_page) || null,
  sourceRevisionTimestamp: normalizeText(entry.sourceRevisionTimestamp ?? entry.source_revision_timestamp) || null,
})

const parseTraceableItemSummaries = (directValue: unknown, jsonValue: unknown) => {
  const directRows = parseJsonArray(directValue)
  return (directRows.length > 0 ? directRows : parseJsonArray(jsonValue)).map(normalizeTraceableItemSummary)
}

const normalizeNpcWikiAssets = (raw: PublicNpcWikiAssets): PublicNpcWikiAssets | null => {
  const spriteImage = normalizeText(raw.spriteImage ?? raw.sprite_image) || null
  const mapIconImage = normalizeText(raw.mapIconImage ?? raw.map_icon_image) || null
  const dialogPortraitImage = normalizeText(raw.dialogPortraitImage ?? raw.dialog_portrait_image) || null

  if (!spriteImage && !mapIconImage && !dialogPortraitImage) return null

  return {
    spriteImage,
    mapIconImage,
    dialogPortraitImage,
  }
}

const normalizeNpcLivingPreference = (raw: PublicNpcLivingPreference): PublicNpcLivingPreference => ({
  targetType: normalizeText(raw.targetType ?? raw.target_type) || null,
  preference: normalizeText(raw.preference) || null,
  targetId: toNumberOrNull(raw.targetId ?? raw.target_id),
  targetName: normalizeText(raw.targetName ?? raw.target_name) || null,
  targetNameZh: normalizeText(raw.targetNameZh ?? raw.target_name_zh) || null,
})

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: NpcCatalogCard[],
  query: PublicNpcQuery,
): Pagination => {
  const page = Number(pagination?.page ?? query.page ?? 1)
  const limit = Number(pagination?.limit ?? pagination?.size ?? query.limit ?? query.size ?? items.length)
  const total = Number(pagination?.total ?? items.length)
  const totalPages = Number(pagination?.totalPages ?? Math.ceil(total / Math.max(1, limit)))

  return {
    total: Number.isFinite(total) ? total : items.length,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length,
    size: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.ceil(totalPages) : 1,
  }
}

const resolveRequestedPage = (query: PublicNpcQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicNpcQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 24)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 24
}

const buildPublicNpcQuery = (query: PublicNpcQuery, page: number, limit: number): PublicNpcQuery => ({
  page,
  limit,
  search: normalizeText(query.search) || undefined,
  categoryId: query.categoryId,
  isTownNpc: typeof query.isTownNpc === 'boolean' ? query.isTownNpc : undefined,
  isFriendly: typeof query.isFriendly === 'boolean' ? query.isFriendly : undefined,
  isBoss: typeof query.isBoss === 'boolean' ? query.isBoss : undefined,
  hasShop: typeof query.hasShop === 'boolean' ? query.hasShop : undefined,
  hasLoot: typeof query.hasLoot === 'boolean' ? query.hasLoot : undefined,
})

export const normalizePublicNpcBase = (raw: PublicNpcListItem, index = 0): NpcCatalogCard => {
  const npcId = toNumberOrNull(raw.id) ?? index + 1
  const displayName = normalizeText(raw.nameZh ?? raw.name_zh)
    || normalizeText(raw.displayName)
    || normalizeText(raw.name)
    || normalizeText(raw.internalName ?? raw.internal_name)
    || `NPC ${index + 1}`
  const name = normalizeText(raw.name) || displayName
  const internalName = normalizeText(raw.internalName ?? raw.internal_name)
  const secondaryName = normalizeText(raw.nameZh ?? raw.name_zh) ? name || internalName : internalName
  const subtitle = normalizeText(raw.subNameZh ?? raw.sub_name_zh) || normalizeText(raw.subName ?? raw.sub_name)
  const categoryName = normalizeText(raw.categoryName ?? raw.category_name) || '未分类'
  const sourceImage = normalizeText(raw.imageUrl ?? raw.image_url)
  const image = resolvePreviewImageUrl(sourceImage)
  const gameId = toNumberOrNull(raw.gameId ?? raw.game_id)
  const npcType = toNumberOrNull(raw.npcType ?? raw.npc_type)
  const damage = toNumberOrNull(raw.damage)
  const defense = toNumberOrNull(raw.defense)
  const lifeMax = toNumberOrNull(raw.lifeMax ?? raw.life_max)
  const knockBackResist = toNumberOrNull(raw.knockBackResist ?? raw.knock_back_resist)
  const lootEntryCount = toNumberOrNull(raw.lootEntryCount ?? raw.loot_entry_count) ?? 0
  const shopEntryCount = toNumberOrNull(raw.shopEntryCount ?? raw.shop_entry_count) ?? 0
  const buffRelationCount = toNumberOrNull(raw.buffRelationCount ?? raw.buff_relation_count) ?? 0
  const id = String(npcId)
  const hasWikiAssets = raw.wikiAssets !== undefined || raw.wiki_assets !== undefined
  const wikiAssets = hasWikiAssets ? normalizeNpcWikiAssets((raw.wikiAssets ?? raw.wiki_assets ?? {}) as PublicNpcWikiAssets) : undefined
  const hasLivingPreferences = raw.livingPreferences !== undefined || raw.living_preferences !== undefined
  const livingPreferences = hasLivingPreferences && Array.isArray(raw.livingPreferences ?? raw.living_preferences)
    ? (raw.livingPreferences ?? raw.living_preferences ?? []).map(normalizeNpcLivingPreference)
    : undefined

  return {
    id,
    npcId,
    detailPath: `/npcs/${npcId}`,
    name,
    displayName,
    secondaryName,
    subtitle,
    categoryName,
    image,
    fallback: firstGlyph(displayName),
    gameId,
    internalName,
    isBoss: toBoolean(raw.isBoss ?? raw.is_boss),
    isFriendly: toBoolean(raw.isFriendly ?? raw.is_friendly),
    isTownNpc: toBoolean(raw.isTownNpc ?? raw.is_town_npc),
    npcType,
    damage,
    defense,
    lifeMax,
    knockBackResist,
    lootEntryCount,
    shopEntryCount,
    buffRelationCount,
    searchText: normalizeSearchText([displayName, name, internalName, categoryName, subtitle, gameId, npcType].join(' ')),
    raw: {
      id: npcId,
      gameId,
      internalName,
      name,
      nameZh: normalizeText(raw.nameZh ?? raw.name_zh) || null,
      subName: normalizeText(raw.subName ?? raw.sub_name) || null,
      subNameZh: normalizeText(raw.subNameZh ?? raw.sub_name_zh) || null,
      categoryId: toNumberOrNull(raw.categoryId ?? raw.category_id),
      categoryName,
      isBoss: toBoolean(raw.isBoss ?? raw.is_boss),
      isFriendly: toBoolean(raw.isFriendly ?? raw.is_friendly),
      isTownNpc: toBoolean(raw.isTownNpc ?? raw.is_town_npc),
      npcType,
      damage,
      defense,
      lifeMax,
      knockBackResist,
      lootEntryCount,
      shopEntryCount,
      buffRelationCount,
      imageUrl: sourceImage || null,
      behaviorNotes: normalizeText(raw.behaviorNotes ?? raw.behavior_notes) || null,
      status: toNumberOrNull(raw.status),
      lootItemsJson: normalizeText(raw.lootItemsJson ?? raw.loot_items_json) || null,
      shopItemsJson: normalizeText(raw.shopItemsJson ?? raw.shop_items_json) || null,
      sourceItemsJson: normalizeText(raw.sourceItemsJson ?? raw.source_items_json) || null,
      lootItems: parseTraceableItemSummaries(raw.lootItems, raw.lootItemsJson ?? raw.loot_items_json),
      shopItems: parseTraceableItemSummaries(raw.shopItems, raw.shopItemsJson ?? raw.shop_items_json),
      sourceItems: parseTraceableItemSummaries(raw.sourceItems, raw.sourceItemsJson ?? raw.source_items_json),
      ...(hasWikiAssets ? { wikiAssets } : {}),
      ...(hasLivingPreferences ? { livingPreferences } : {}),
    },
  }
}

export const normalizePublicNpcLootEntry = (raw: PublicNpcLootEntry): PublicNpcLootEntry => ({
  ...raw,
  id: toNumberOrNull(raw.id),
  itemId: toNumberOrNull(raw.itemId ?? raw.item_id),
  itemName: normalizeText(raw.itemName ?? raw.item_name) || null,
  itemNameZh: normalizeText(raw.itemNameZh ?? raw.item_name_zh) || null,
  itemInternalName: normalizeText(raw.itemInternalName ?? raw.item_internal_name) || null,
  itemImage: normalizeText(raw.itemImage ?? raw.item_image) || null,
  imageUrl: normalizeText(raw.imageUrl ?? raw.image_url ?? raw.itemImage ?? raw.item_image) || null,
  quantityText: normalizeText(raw.quantityText ?? raw.quantity_text) || null,
  quantityMin: toNumberOrNull(raw.quantityMin ?? raw.quantity_min),
  quantityMax: toNumberOrNull(raw.quantityMax ?? raw.quantity_max),
  chanceText: normalizeText(raw.chanceText ?? raw.chance_text) || null,
  chanceValue: toNumberOrNull(raw.chanceValue ?? raw.chance_value),
  conditions: normalizeText(raw.conditions) || null,
  notes: normalizeText(raw.notes) || null,
  lootSourceMode: normalizeText(raw.lootSourceMode ?? raw.loot_source_mode) || null,
  trustedStructured: toBoolean(raw.trustedStructured ?? raw.trusted_structured),
  sourceNpcId: toNumberOrNull(raw.sourceNpcId ?? raw.source_npc_id),
  sourceNpcInternalName: normalizeText(raw.sourceNpcInternalName ?? raw.source_npc_internal_name) || null,
  sourceRowKey: normalizeText(raw.sourceRowKey ?? raw.source_row_key) || null,
})

const normalizeShopCondition = (raw: PublicNpcShopCondition): PublicNpcShopCondition => {
  const label = normalizeText(raw.label)
    || normalizeText(raw.contextNameZh ?? raw.context_name_zh)
    || normalizeText(raw.contextNameEn ?? raw.context_name_en)
    || normalizeText(raw.gamePeriodNameZh ?? raw.game_period_name_zh)
    || normalizeText(raw.gamePeriodNameEn ?? raw.game_period_name_en)
    || normalizeText(raw.refNpcNameZh ?? raw.ref_npc_name_zh)
    || normalizeText(raw.refNpcName ?? raw.ref_npc_name)
    || normalizeText(raw.refItemNameZh ?? raw.ref_item_name_zh)
    || normalizeText(raw.refItemName ?? raw.ref_item_name)
    || normalizeText(raw.biomeNameZh ?? raw.biome_name_zh)
    || normalizeText(raw.biomeNameEn ?? raw.biome_name_en)
    || null

  return {
    ...raw,
    id: toNumberOrNull(raw.id),
    refType: normalizeText(raw.refType ?? raw.ref_type) || null,
    refId: toNumberOrNull(raw.refId ?? raw.ref_id),
    conditionRole: normalizeText(raw.conditionRole ?? raw.condition_role) || null,
    label,
    notes: normalizeText(raw.notes) || null,
    sortOrder: toNumberOrNull(raw.sortOrder ?? raw.sort_order),
  }
}

export const normalizePublicNpcShopEntry = (raw: PublicNpcShopEntry): PublicNpcShopEntry => ({
  ...raw,
  id: toNumberOrNull(raw.id),
  itemId: toNumberOrNull(raw.itemId ?? raw.item_id),
  itemName: normalizeText(raw.itemName ?? raw.item_name) || null,
  itemNameZh: normalizeText(raw.itemNameZh ?? raw.item_name_zh) || null,
  itemInternalName: normalizeText(raw.itemInternalName ?? raw.item_internal_name) || null,
  itemImage: normalizeText(raw.itemImage ?? raw.item_image) || null,
  imageUrl: normalizeText(raw.imageUrl ?? raw.image_url ?? raw.itemImage ?? raw.item_image) || null,
  priceText: normalizeText(raw.priceText ?? raw.price_text) || null,
  buyPriceText: normalizeText(raw.buyPriceText ?? raw.buy_price_text) || null,
  currencyText: normalizeText(raw.currencyText ?? raw.currency_text) || null,
  conditions: Array.isArray(raw.conditions) ? raw.conditions.map(normalizeShopCondition) : raw.conditions ?? null,
  notes: normalizeText(raw.notes) || null,
})

export const normalizePublicNpcBuffRelation = (raw: PublicNpcBuffRelation): PublicNpcBuffRelation => ({
  ...raw,
  id: toNumberOrNull(raw.id),
  buffId: toNumberOrNull(raw.buffId ?? raw.buff_id),
  relationType: normalizeText(raw.relationType ?? raw.relation_type) || null,
  buffName: normalizeText(raw.buffName ?? raw.buff_name) || null,
  buffNameZh: normalizeText(raw.buffNameZh ?? raw.buff_name_zh) || null,
  buffInternalName: normalizeText(raw.buffInternalName ?? raw.buff_internal_name) || null,
  buffImage: normalizeText(raw.buffImage ?? raw.buff_image) || null,
  imageUrl: normalizeText(raw.imageUrl ?? raw.image_url ?? raw.buffImage ?? raw.buff_image) || null,
  sourceText: normalizeText(raw.sourceText ?? raw.source_text) || null,
  durationText: normalizeText(raw.durationText ?? raw.duration_text) || null,
  durationSeconds: toNumberOrNull(raw.durationSeconds ?? raw.duration_seconds),
  chanceText: normalizeText(raw.chanceText ?? raw.chance_text) || null,
  chanceValue: toNumberOrNull(raw.chanceValue ?? raw.chance_value),
  conditions: normalizeText(raw.conditions) || null,
  notes: normalizeText(raw.notes) || null,
})

export const normalizePublicNpcAggregate = (raw: PublicNpcAggregate): PublicNpcAggregate => {
  const npcCard = raw.npc ? normalizePublicNpcBase(raw.npc) : null

  return {
    npc: npcCard?.raw ?? null,
    loot: Array.isArray(raw.loot) ? raw.loot.map(normalizePublicNpcLootEntry) : [],
    shopEntries: Array.isArray(raw.shopEntries ?? raw.shop_entries) ? (raw.shopEntries ?? raw.shop_entries ?? []).map(normalizePublicNpcShopEntry) : [],
    buffRelations: Array.isArray(raw.buffRelations ?? raw.buff_relations) ? (raw.buffRelations ?? raw.buff_relations ?? []).map(normalizePublicNpcBuffRelation) : [],
    moduleStatus: raw.moduleStatus ?? raw.module_status ?? {},
    aggregatedAt: normalizeText(raw.aggregatedAt ?? raw.aggregated_at) || null,
  }
}

const missingPublicNpcListResult = (query: PublicNpcQuery = {}): PublicNpcListResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)

  return {
    npcs: [],
    rawNpcs: [],
    pagination: {
      total: 0,
      page,
      limit,
      size: limit,
      totalPages: 1,
    },
    source: 'missing',
  }
}

const normalizeNpcRouteId = (id: string | number) => {
  const numberValue = Number(id)
  return Number.isInteger(numberValue) && numberValue !== 0 ? numberValue : null
}

export const fetchPublicNpcs = async (query: PublicNpcQuery = {}): Promise<PublicNpcListResult> => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)

  try {
    const response = await usePublicApiFetch<PublicNpcListItem[]>('/npcs', {
      query: buildPublicNpcQuery(query, page, limit),
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public NPC API returned an unsuccessful response')
    }

    const rawNpcs = unwrapApiResponse(response)

    if (!Array.isArray(rawNpcs)) {
      throw new Error('Public NPC API returned no usable NPC data')
    }

    const npcs = rawNpcs.map(normalizePublicNpcBase)

    return {
      npcs,
      rawNpcs,
      pagination: normalizePagination(response.pagination, npcs, { ...query, page, limit }),
      source: 'api',
    }
  } catch {}

  return missingPublicNpcListResult({ ...query, page, limit })
}

export const fetchPublicNpcAggregate = async (
  id: string | number,
  include: string = 'loot,shop,buffs',
): Promise<PublicNpcAggregateBundle> => {
  const normalizedNpcId = normalizeNpcRouteId(id)

  if (normalizedNpcId == null) {
    return { aggregate: null, source: 'missing' }
  }

  try {
    const response = await usePublicApiFetch<PublicNpcAggregate>(`/public/npcs/${normalizedNpcId}/aggregate`, {
      query: include ? { include } : DEFAULT_NPC_AGGREGATE_QUERY,
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public NPC aggregate API returned an unsuccessful response')
    }

    const aggregate = unwrapApiResponse(response)

    if (!aggregate?.npc?.id) {
      throw new Error('Public NPC aggregate API returned no usable NPC data')
    }

    return {
      aggregate: normalizePublicNpcAggregate(aggregate),
      source: 'api',
    }
  } catch {}

  return { aggregate: null, source: 'missing' }
}

export const usePublicNpcs = (query: PublicNpcQuery | (() => PublicNpcQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const value = typeof query === 'function' ? query() : query
    const limit = resolveRequestedLimit(value)

    return {
      ...value,
      page: resolveRequestedPage(value),
      limit,
      search: normalizeText(value.search),
      isTownNpc: typeof value.isTownNpc === 'boolean' ? value.isTownNpc : undefined,
      isFriendly: typeof value.isFriendly === 'boolean' ? value.isFriendly : undefined,
      isBoss: typeof value.isBoss === 'boolean' ? value.isBoss : undefined,
      hasShop: typeof value.hasShop === 'boolean' ? value.hasShop : undefined,
      hasLoot: typeof value.hasLoot === 'boolean' ? value.hasLoot : undefined,
    } satisfies PublicNpcQuery
  })

  return useAsyncData(
    () => `public-npcs:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicNpcs(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => missingPublicNpcListResult(resolvedQuery.value),
    },
  )
}

export const usePublicNpcAggregate = (
  id: MaybeRefOrGetter<string | number>,
  include: MaybeRefOrGetter<string> = 'loot,shop,buffs',
) => useAsyncData(
  () => `public-npc-aggregate:${toValue(id)}:${toValue(include)}`,
  () => fetchPublicNpcAggregate(toValue(id), toValue(include)),
  {
    server: false,
    watch: [() => toValue(id), () => toValue(include)],
    default: () => ({ aggregate: null, source: 'missing' }),
  },
)
