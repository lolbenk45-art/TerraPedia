import type {
  NpcBaseDomain,
  NpcBuffRelationDomain,
  NpcLootEntryDomain,
  NpcPublicAggregateDomain,
  NpcShopEntryDomain,
} from '@/types/npcDomain'

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

const nullableString = (value: unknown): string | null => typeof value === 'string' ? value : null

const nullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const normalizeTraceableItemSummary = (entry: Record<string, unknown>) => ({
  ...entry,
  itemId: nullableNumber(entry.itemId ?? entry.item_id),
  itemName: nullableString(entry.itemName ?? entry.item_name),
  itemNameZh: nullableString(entry.itemNameZh ?? entry.item_name_zh),
  itemInternalName: nullableString(entry.itemInternalName ?? entry.item_internal_name),
  relationType: nullableString(entry.relationType ?? entry.relation_type),
  quantityText: nullableString(entry.quantityText ?? entry.quantity_text),
  chanceText: nullableString(entry.chanceText ?? entry.chance_text),
  priceText: nullableString(entry.priceText ?? entry.price_text),
  sourceFactKey: nullableString(entry.sourceFactKey ?? entry.source_fact_key),
  sourceProvider: nullableString(entry.sourceProvider ?? entry.source_provider),
  sourcePage: nullableString(entry.sourcePage ?? entry.source_page),
  sourceRevisionTimestamp: nullableString(entry.sourceRevisionTimestamp ?? entry.source_revision_timestamp),
})

const parseTraceableItemSummaries = (directValue: unknown, jsonValue: unknown) => {
  const directRows = parseJsonArray(directValue)
  return (directRows.length ? directRows : parseJsonArray(jsonValue)).map(normalizeTraceableItemSummary)
}

export const normalizeNpcBase = <T extends Partial<NpcBaseDomain>>(npc: T): T & NpcBaseDomain => {
  const lootItemsJson = npc.lootItemsJson ?? (npc as any).loot_items_json ?? null
  const shopItemsJson = npc.shopItemsJson ?? (npc as any).shop_items_json ?? null
  const sourceItemsJson = npc.sourceItemsJson ?? (npc as any).source_items_json ?? null

  return {
    ...npc,
    id: Number(npc.id),
    gameId: npc.gameId ?? (npc as any).game_id ?? null,
    internalName: npc.internalName ?? (npc as any).internal_name ?? null,
    name: npc.name ?? (npc as any).displayName ?? (npc as any).internal_name ?? 'Unknown NPC',
    nameZh: npc.nameZh ?? (npc as any).name_zh ?? null,
    subName: npc.subName ?? (npc as any).sub_name ?? null,
    subNameZh: npc.subNameZh ?? (npc as any).sub_name_zh ?? null,
    categoryId: npc.categoryId ?? (npc as any).category_id ?? null,
    categoryName: npc.categoryName ?? (npc as any).category_name ?? null,
    isBoss: npc.isBoss ?? (npc as any).is_boss ?? false,
    isFriendly: npc.isFriendly ?? (npc as any).is_friendly ?? false,
    isTownNpc: npc.isTownNpc ?? (npc as any).is_town_npc ?? false,
    imageUrl: npc.imageUrl ?? (npc as any).image_url ?? null,
    behaviorNotes: (npc as any).behaviorNotes ?? (npc as any).behavior_notes ?? null,
    status: (npc as any).status ?? null,
    lootItemsJson,
    shopItemsJson,
    sourceItemsJson,
    lootItems: parseTraceableItemSummaries(npc.lootItems, lootItemsJson),
    shopItems: parseTraceableItemSummaries(npc.shopItems, shopItemsJson),
    sourceItems: parseTraceableItemSummaries(npc.sourceItems, sourceItemsJson),
  }
}

export const normalizeNpcLootEntry = (loot: NpcLootEntryDomain): NpcLootEntryDomain => ({
  ...loot,
  itemId: loot.itemId ?? (loot as any).item_id ?? null,
  itemName: loot.itemName ?? (loot as any).item_name ?? null,
  itemNameZh: loot.itemNameZh ?? (loot as any).item_name_zh ?? null,
  itemInternalName: loot.itemInternalName ?? (loot as any).item_internal_name ?? null,
  itemImage: loot.itemImage ?? (loot as any).item_image ?? null,
  imageUrl: loot.imageUrl ?? (loot as any).image_url ?? loot.itemImage ?? (loot as any).item_image ?? null,
  quantityText: loot.quantityText ?? (loot as any).quantity_text ?? null,
  quantityMin: loot.quantityMin ?? (loot as any).quantity_min ?? null,
  quantityMax: loot.quantityMax ?? (loot as any).quantity_max ?? null,
  chanceText: loot.chanceText ?? (loot as any).chance_text ?? null,
  chanceValue: loot.chanceValue ?? (loot as any).chance_value ?? null,
  conditions: loot.conditions ?? null,
  notes: loot.notes ?? null,
})

export const normalizeNpcShopEntry = (entry: NpcShopEntryDomain): NpcShopEntryDomain => ({
  ...entry,
  itemId: entry.itemId ?? (entry as any).item_id ?? null,
  itemName: entry.itemName ?? (entry as any).item_name ?? null,
  itemNameZh: entry.itemNameZh ?? (entry as any).item_name_zh ?? null,
  itemInternalName: entry.itemInternalName ?? (entry as any).item_internal_name ?? null,
  itemImage: entry.itemImage ?? (entry as any).item_image ?? null,
  imageUrl: entry.imageUrl ?? (entry as any).image_url ?? entry.itemImage ?? (entry as any).item_image ?? null,
  priceText: entry.priceText ?? (entry as any).price_text ?? null,
  buyPriceText: entry.buyPriceText ?? (entry as any).buy_price_text ?? null,
  currencyText: entry.currencyText ?? (entry as any).currency_text ?? null,
  conditions: Array.isArray(entry.conditions)
    ? entry.conditions.map((condition: any) => ({
        ...condition,
        id: condition?.id ?? null,
        refType: condition?.refType ?? condition?.ref_type ?? null,
        refId: condition?.refId ?? condition?.ref_id ?? null,
        conditionRole: condition?.conditionRole ?? condition?.condition_role ?? null,
        label: condition?.label
          ?? condition?.contextNameZh
          ?? condition?.context_name_zh
          ?? condition?.contextNameEn
          ?? condition?.context_name_en
          ?? condition?.gamePeriodNameZh
          ?? condition?.game_period_name_zh
          ?? condition?.gamePeriodNameEn
          ?? condition?.game_period_name_en
          ?? condition?.refNpcNameZh
          ?? condition?.ref_npc_name_zh
          ?? condition?.refNpcName
          ?? condition?.ref_npc_name
          ?? condition?.refNpcInternalName
          ?? condition?.ref_npc_internal_name
          ?? condition?.refItemNameZh
          ?? condition?.ref_item_name_zh
          ?? condition?.refItemName
          ?? condition?.ref_item_name
          ?? condition?.biomeNameZh
          ?? condition?.biome_name_zh
          ?? condition?.biomeNameEn
          ?? condition?.biome_name_en
          ?? null,
        notes: condition?.notes ?? null,
        sortOrder: condition?.sortOrder ?? condition?.sort_order ?? null,
        biomeCode: condition?.biomeCode ?? condition?.biome_code ?? null,
        biomeNameEn: condition?.biomeNameEn ?? condition?.biome_name_en ?? null,
        biomeNameZh: condition?.biomeNameZh ?? condition?.biome_name_zh ?? null,
        contextCode: condition?.contextCode ?? condition?.context_code ?? null,
        contextNameEn: condition?.contextNameEn ?? condition?.context_name_en ?? null,
        contextNameZh: condition?.contextNameZh ?? condition?.context_name_zh ?? null,
        contextType: condition?.contextType ?? condition?.context_type ?? null,
        gamePeriodCode: condition?.gamePeriodCode ?? condition?.game_period_code ?? null,
        gamePeriodNameEn: condition?.gamePeriodNameEn ?? condition?.game_period_name_en ?? null,
        gamePeriodNameZh: condition?.gamePeriodNameZh ?? condition?.game_period_name_zh ?? null,
        refItemName: condition?.refItemName ?? condition?.ref_item_name ?? null,
        refItemNameZh: condition?.refItemNameZh ?? condition?.ref_item_name_zh ?? null,
        refItemInternalName: condition?.refItemInternalName ?? condition?.ref_item_internal_name ?? null,
        refNpcName: condition?.refNpcName ?? condition?.ref_npc_name ?? null,
        refNpcNameZh: condition?.refNpcNameZh ?? condition?.ref_npc_name_zh ?? null,
        refNpcInternalName: condition?.refNpcInternalName ?? condition?.ref_npc_internal_name ?? null,
      }))
    : entry.conditions ?? null,
  notes: entry.notes ?? null,
})

export const normalizeNpcBuffRelation = (relation: NpcBuffRelationDomain): NpcBuffRelationDomain => ({
  ...relation,
  buffId: relation.buffId ?? (relation as any).buff_id ?? null,
  relationType: relation.relationType ?? (relation as any).relation_type ?? null,
  buffName: relation.buffName ?? (relation as any).buff_name ?? null,
  buffNameZh: relation.buffNameZh ?? (relation as any).buff_name_zh ?? null,
  buffInternalName: relation.buffInternalName ?? (relation as any).buff_internal_name ?? null,
  buffImage: relation.buffImage ?? (relation as any).buff_image ?? null,
  imageUrl: relation.imageUrl ?? (relation as any).image_url ?? relation.buffImage ?? (relation as any).buff_image ?? null,
  sourceText: relation.sourceText ?? (relation as any).source_text ?? null,
  durationText: relation.durationText ?? (relation as any).duration_text ?? null,
  durationSeconds: relation.durationSeconds ?? (relation as any).duration_seconds ?? null,
  chanceText: relation.chanceText ?? (relation as any).chance_text ?? null,
  chanceValue: relation.chanceValue ?? (relation as any).chance_value ?? null,
  conditions: relation.conditions ?? null,
  notes: relation.notes ?? null,
})

export const normalizeNpcPublicAggregate = (payload: NpcPublicAggregateDomain): NpcPublicAggregateDomain => ({
  npc: normalizeNpcBase(payload.npc),
  loot: (payload.loot || []).map(normalizeNpcLootEntry),
  shopEntries: (payload.shopEntries || []).map(normalizeNpcShopEntry),
  buffRelations: (payload.buffRelations || []).map(normalizeNpcBuffRelation),
  moduleStatus: payload.moduleStatus || {},
  aggregatedAt: payload.aggregatedAt,
})
