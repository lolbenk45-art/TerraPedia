import { defineStore } from 'pinia'
import { del, get, post, put } from '~/composables/useApi'
import { usePagedCollectionSync } from '~/composables/usePagedCollectionSync'
import { showToast } from '~/composables/useToast'
import { normalizeRarityLabel, RARITY_FILTER_OPTIONS } from '~/utils/rarity'

export interface Item {
  id: number
  name: string
  nameZh?: string
  internalName?: string
  categoryId: number | null
  relatedCategoryIds?: number[]
  categoryName?: string
  categoryPaths?: string[]
  rarity: string
  rarityId?: number | null
  gamePeriod?: string | null
  gamePeriodId?: number | null
  gameModelId?: number | null
  isStackable?: boolean
  stackSize?: number | null
  status?: number | null
  damage?: number
  defense?: number
  knockback?: number | null
  useTime?: number | null
  width?: number | null
  height?: number | null
  buy?: number | null
  sell?: number | null
  description?: string
  descriptionZh?: string
  tooltip?: string
  tooltipZh?: string
  imageUrl?: string
  sourceNpcsJson?: string | null
  sourceNpcs?: TraceableNpcRelationSummary[]
  createdAt?: string
  updatedAt?: string
}

export interface TraceableNpcRelationSummary {
  npcId?: number | null
  npcName?: string | null
  npcNameZh?: string | null
  npcInternalName?: string | null
  relationType?: string | null
  sourceFactKey?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sourceRevisionTimestamp?: string | null
  [key: string]: unknown
}

export interface Pagination {
  page: number
  size: number
  total: number
  totalPages: number
}

export interface ItemPayload {
  name: string
  nameZh?: string
  categoryId: number | null
  relatedCategoryIds?: number[]
  rarity: string
  status?: number | null
  internalName?: string
  gamePeriodId?: number | null
  gameModelId?: number | null
  isStackable?: boolean
  stackSize?: number | null
  damage?: number | null
  defense?: number | null
  knockback?: number | null
  useTime?: number | null
  width?: number | null
  height?: number | null
  buy?: number | null
  sell?: number | null
  description?: string
  descriptionZh?: string
  tooltip?: string
  tooltipZh?: string
  imageUrl?: string
}

export interface UploadedImage {
  bucket: string
  objectKey: string
  url: string
  originalFilename?: string
  contentType?: string
  size: number
}

export interface BatchOperationResult {
  successIds: number[]
  failedIds: number[]
}

export interface ItemImageRelation {
  id?: number | null
  itemId?: number | null
  role?: string
  provider?: string
  sourceFileTitle?: string
  sourcePage?: string
  sourceRevisionTimestamp?: string
  originalUrl?: string
  cachedUrl?: string
  width?: number | null
  height?: number | null
  contentType?: string
  isPrimary?: boolean
  sortOrder?: number | null
  lastVerifiedAt?: string
  imageUrl: string
}

export interface ItemRecipeIngredientRelation {
  id?: number | null
  ingredientItemId?: number | null
  ingredientNameRaw?: string
  ingredientGroupType?: string
  quantityMin?: number | null
  quantityMax?: number | null
  quantityText?: string
  sortOrder?: number | null
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
  itemImageUrl?: string
}

export interface ItemRecipeStationRelation {
  id?: number | null
  stationId?: number | null
  stationItemId?: number | null
  stationNameRaw?: string
  stationType?: string
  isAlternative?: boolean
  sortOrder?: number | null
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
  itemImageUrl?: string
}

export interface ItemRecipeConditionRelation {
  id?: number | null
  recipeId?: number | null
  refType?: string
  refId?: number | null
  requirementRole?: string
  notes?: string
  sortOrder?: number | null
  refCode?: string
  refNameEn?: string
  refNameZh?: string
  refContextType?: string
}

export interface ItemRecipeRelation {
  id?: number | null
  resultItemId?: number | null
  resultItemName?: string
  resultItemNameZh?: string
  resultItemInternalName?: string
  resultItemImage?: string
  resultItemImageUrl?: string
  resultQuantity?: number | null
  versionScope?: string
  notes?: string
  sourceProvider?: string
  sourcePage?: string
  sourceRevisionTimestamp?: string
  ingredients: ItemRecipeIngredientRelation[]
  stations: ItemRecipeStationRelation[]
  conditions: ItemRecipeConditionRelation[]
}

export interface ItemRecipeTreeItem {
  id: number
  name: string
  nameZh?: string
  internalName?: string
  image?: string
  imageUrl: string
}

export interface ItemRecipeTreeMeta {
  maxDepth?: number | null
  mode?: string
  generatedAt?: string
}

export interface ItemRecipeTreeStation {
  stationItemId?: number | null
  stationInternalName?: string
  stationName?: string
  stationNameZh?: string
  stationNameRaw?: string
  itemImage?: string
  itemImageUrl?: string
  isAlternative?: boolean
  stationType?: string
  requirementRole?: string
  notes?: string
  sortOrder?: number | null
}

export interface ItemRecipeTreeGroupMember {
  itemId?: number | null
  internalName?: string
  name?: string
  nameZh?: string
  image?: string
  imageUrl?: string
}

export interface RecipeGroupMember {
  itemId?: number | null
  internalName?: string
  name?: string
  nameZh?: string
  image?: string
  imageUrl?: string
}

export interface RecipeGroup {
  canonicalName: string
  displayNameEn?: string
  displayNameZh?: string
  members: RecipeGroupMember[]
}

export interface ItemRecipeTreeNode {
  nodeType?: string
  recipeId?: number | null
  itemId?: number | null
  itemInternalName?: string
  itemName?: string
  itemNameZh?: string
  itemImage?: string
  itemImageUrl?: string
  displayName?: string
  secondaryName?: string
  groupCanonicalName?: string
  groupMemberNames?: string[]
  groupMembers?: ItemRecipeTreeGroupMember[]
  resultQuantity?: number | null
  quantityText?: string
  quantityMin?: number | null
  quantityMax?: number | null
  ingredientGroupType?: string
  variantKey?: string
  variantLabel?: string
  versionScope?: string
  sourcePage?: string
  notes?: string
  expandable?: boolean
  cycleDetected?: boolean
  reference?: boolean
  depth?: number | null
  stations: ItemRecipeTreeStation[]
  children: ItemRecipeTreeNode[]
}

export interface ItemRecipeTreeVariant {
  variantKey?: string
  variantLabel?: string
  versionScope?: string
  recipeCount?: number | null
  roots: ItemRecipeTreeNode[]
}

export interface ItemRecipeTreeResponse {
  item: ItemRecipeTreeItem | null
  treeMeta: ItemRecipeTreeMeta | null
  variants: ItemRecipeTreeVariant[]
}

export interface ItemRecipeIngredientPayload {
  ingredientItemId?: number | null
  ingredientNameRaw?: string
  ingredientGroupType?: string
  quantityMin?: number | null
  quantityMax?: number | null
  quantityText?: string
  sortOrder?: number | null
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
  itemImageUrl?: string
}

export interface ItemRecipeStationPayload {
  stationId?: number | null
  stationItemId?: number | null
  stationNameRaw?: string
  stationType?: string
  isAlternative?: boolean
  sortOrder?: number | null
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
  itemImageUrl?: string
}

export interface ItemRecipeConditionPayload {
  refType?: string
  refId?: number | null
  requirementRole?: string
  notes?: string
  sortOrder?: number | null
  refCode?: string
  refNameEn?: string
  refNameZh?: string
  refContextType?: string
}

export interface ItemRecipePayload {
  resultItemId?: number | null
  resultItemName?: string
  resultItemNameZh?: string
  resultItemInternalName?: string
  resultItemImage?: string
  resultItemImageUrl?: string
  resultQuantity?: number | null
  versionScope?: string
  notes?: string
  sourceProvider?: string
  sourcePage?: string
  sourceRevisionTimestamp?: string
  ingredients: ItemRecipeIngredientPayload[]
  stations: ItemRecipeStationPayload[]
  conditions: ItemRecipeConditionPayload[]
}

export interface CraftingStation {
  id: number
  itemId?: number | null
  internalName?: string
  nameEn?: string
  nameZh?: string
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
  itemImageUrl?: string
  stationType?: string
  notes?: string
  imageUrl?: string
  sortOrder?: number | null
  status?: number | null
  usageRecipeCount?: number | null
  usageItemCount?: number | null
  usageItems?: CraftingStationUsageItem[]
}

export interface CraftingStationUsageItem {
  resultItemId?: number | null
  resultItemName?: string
  resultItemNameZh?: string
  resultItemInternalName?: string
  resultItemImage?: string
  resultItemImageUrl?: string
  recipeCount?: number | null
  versionScope?: string
  recipeIds?: number[]
}

export interface ItemSourceRelation {
  id?: number | null
  itemId?: number | null
  sourceType?: string
  sourceRefType?: string
  sourceRefId?: number | null
  sourceRefName?: string
  sourceRefNameZh?: string
  biomeId?: number | null
  quantityMin?: number | null
  quantityMax?: number | null
  quantityText?: string
  chanceValue?: number | null
  chanceText?: string
  conditions?: string
  notes?: string
  sourceProvider?: string
  sourcePage?: string
  sourceRevisionTimestamp?: string
  sortOrder?: number | null
  biomeCode?: string
  biomeNameEn?: string
  biomeNameZh?: string
}

function normalizeImageUrl(raw: any) {
  let imgUrl = String(raw?.image ?? raw?.imageUrl ?? raw?.image_url ?? '')
  if (!imgUrl) return ''
  if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://') || imgUrl.startsWith('data:')) return imgUrl
  if (imgUrl.startsWith('localhost:') || imgUrl.startsWith('127.0.0.1:')) return `http://${imgUrl}`
  if (imgUrl.startsWith('/')) return imgUrl
  return ''
}

function normalizeAssetUrl(raw: any) {
  return normalizeImageUrl({
    image: raw?.cachedUrl ?? raw?.originalUrl ?? raw?.itemImage ?? raw?.url ?? raw?.image,
  })
}

function normalizeNumberArray(raw: any) {
  if (Array.isArray(raw)) {
    return raw
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isFinite(value) && value > 0)
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
  }
  return []
}

function normalizeJsonArray(raw: any): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
      : []
  } catch {
    return []
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeTraceableNpcRelation(raw: Record<string, unknown>): TraceableNpcRelationSummary {
  return {
    ...raw,
    npcId: nullableNumber(raw.npcId ?? raw.npc_id),
    npcName: nullableString(raw.npcName ?? raw.npc_name),
    npcNameZh: nullableString(raw.npcNameZh ?? raw.npc_name_zh),
    npcInternalName: nullableString(raw.npcInternalName ?? raw.npc_internal_name),
    relationType: nullableString(raw.relationType ?? raw.relation_type),
    sourceFactKey: nullableString(raw.sourceFactKey ?? raw.source_fact_key),
    sourceProvider: nullableString(raw.sourceProvider ?? raw.source_provider),
    sourcePage: nullableString(raw.sourcePage ?? raw.source_page),
    sourceRevisionTimestamp: nullableString(raw.sourceRevisionTimestamp ?? raw.source_revision_timestamp),
  }
}

function normalizeTraceableNpcRelations(directValue: any, jsonValue: any): TraceableNpcRelationSummary[] {
  const directRows = normalizeJsonArray(directValue)
  return (directRows.length ? directRows : normalizeJsonArray(jsonValue)).map(normalizeTraceableNpcRelation)
}

function resolvePreferredRecipeIngredientNameRaw(ingredient: ItemRecipeIngredientPayload) {
  return ingredient.itemNameZh?.trim()
    || ingredient.itemName?.trim()
    || ingredient.ingredientNameRaw?.trim()
    || undefined
}

function resolvePreferredRecipeStationNameRaw(station: ItemRecipeStationPayload) {
  return station.itemNameZh?.trim()
    || station.itemName?.trim()
    || station.stationNameRaw?.trim()
    || undefined
}

export const useItemsStore = defineStore('items', () => {
  const normalizeItem = (raw: any): Item => ({
    id: Number(raw?.id ?? 0),
    name: String(raw?.name ?? ''),
    nameZh: String(raw?.nameZh ?? raw?.name_zh ?? ''),
    internalName: String(raw?.internalName ?? raw?.internal_name ?? ''),
    categoryId: raw?.categoryId ?? raw?.category_id ?? null,
    relatedCategoryIds: normalizeNumberArray(raw?.relatedCategoryIds ?? raw?.related_category_ids ?? raw?.relatedCategoryIdsRaw ?? raw?.related_category_ids_raw),
    categoryName: raw?.categoryName ?? raw?.category_name ?? raw?.category,
    categoryPaths: Array.isArray(raw?.categoryPaths) ? raw.categoryPaths.map((value: any) => String(value)) : [],
    rarity: normalizeRarityLabel({
      rarityId: raw?.rarityId ?? raw?.rarity_id ?? null,
      rarity: raw?.rarity ?? raw?.rare ?? '白色',
    }),
    rarityId: raw?.rarityId ?? raw?.rarity_id ?? null,
    gamePeriod: raw?.gamePeriod ?? raw?.game_period ?? null,
    gamePeriodId: raw?.gamePeriodId ?? raw?.game_period_id ?? null,
    gameModelId: raw?.gameModelId ?? raw?.game_model_id ?? null,
    isStackable: raw?.isStackable ?? raw?.is_stackable ?? undefined,
    stackSize: raw?.stackSize ?? raw?.stack_size ?? null,
    status: raw?.status ?? null,
    damage: raw?.damage ?? undefined,
    defense: raw?.defense ?? undefined,
    knockback: raw?.knockback ?? null,
    useTime: raw?.useTime ?? raw?.use_time ?? null,
    width: raw?.width ?? null,
    height: raw?.height ?? null,
    buy: raw?.buy ?? null,
    sell: raw?.sell ?? null,
    description: raw?.description ?? '',
    descriptionZh: raw?.descriptionZh ?? raw?.description_zh ?? '',
    tooltip: raw?.tooltip ?? '',
    tooltipZh: raw?.tooltipZh ?? raw?.tooltip_zh ?? '',
    imageUrl: normalizeImageUrl(raw),
    sourceNpcsJson: raw?.sourceNpcsJson ?? raw?.source_npcs_json ?? null,
    sourceNpcs: normalizeTraceableNpcRelations(raw?.sourceNpcs, raw?.sourceNpcsJson ?? raw?.source_npcs_json),
    createdAt: raw?.createdAt ?? raw?.created_at,
    updatedAt: raw?.updatedAt ?? raw?.updated_at,
  })

  const extractItemList = (response: any): Item[] => {
    const source = response?.data ?? response?.items ?? response?.list ?? response
    return Array.isArray(source) ? source.map(normalizeItem) : []
  }

  const extractSingleItem = (response: any): Item | null => {
    const source = response?.data ?? response?.item ?? response
    if (!source || Array.isArray(source) || typeof source !== 'object') {
      return null
    }
    return normalizeItem(source)
  }

  const buildPagination = (response: any, page: number, size: number, total: number): Pagination => {
    const meta = response?.pagination ?? response?.page ?? response?.meta ?? {}
    const currentPage = Number(meta.page ?? meta.current ?? page)
    const currentSize = Number(meta.limit ?? meta.size ?? meta.pageSize ?? size)
    const totalCount = Number(meta.total ?? total)
    const totalPages = Number(meta.totalPages ?? Math.ceil(totalCount / Math.max(currentSize, 1)))

    return {
      page: currentPage,
      size: currentSize,
      total: totalCount,
      totalPages: Number.isFinite(totalPages) ? totalPages : 0,
    }
  }

  const buildPayload = (payload: ItemPayload) => ({
    name: payload.name.trim(),
    nameZh: payload.nameZh?.trim() || '',
    internalName: payload.internalName?.trim() ?? '',
    categoryId: payload.categoryId,
    relatedCategoryIds: normalizeNumberArray(payload.relatedCategoryIds),
    rarity: payload.rarity || '白色',
    status: payload.status ?? 1,
    gamePeriodId: payload.gamePeriodId ?? null,
    gameModelId: payload.gameModelId ?? null,
    isStackable: payload.isStackable ?? true,
    stackSize: payload.stackSize ?? null,
    damage: payload.damage ?? null,
    defense: payload.defense ?? null,
    knockback: payload.knockback ?? null,
    useTime: payload.useTime ?? null,
    width: payload.width ?? null,
    height: payload.height ?? null,
    buy: payload.buy ?? null,
    sell: payload.sell ?? null,
    description: payload.description?.trim() ?? '',
    descriptionZh: payload.descriptionZh?.trim() ?? '',
    tooltip: payload.tooltip?.trim() ?? '',
    tooltipZh: payload.tooltipZh?.trim() ?? '',
    imageUrl: payload.imageUrl?.trim() ?? '',
  })

  const buildPayloadFromItem = (item: Item, overrides: Partial<ItemPayload> = {}) =>
    buildPayload({
      name: item.name,
      nameZh: item.nameZh,
      internalName: item.internalName,
      categoryId: item.categoryId,
      relatedCategoryIds: item.relatedCategoryIds ?? [],
      rarity: item.rarity,
      status: item.status ?? 1,
      gamePeriodId: item.gamePeriodId ?? null,
      gameModelId: item.gameModelId ?? null,
      isStackable: item.isStackable ?? true,
      stackSize: item.stackSize ?? null,
      damage: item.damage ?? null,
      defense: item.defense ?? null,
      knockback: item.knockback ?? null,
      useTime: item.useTime ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      buy: item.buy ?? null,
      sell: item.sell ?? null,
      description: item.description ?? '',
      descriptionZh: item.descriptionZh ?? '',
      tooltip: item.tooltip ?? '',
      tooltipZh: item.tooltipZh ?? '',
      imageUrl: item.imageUrl ?? '',
      ...overrides,
    })

  const normalizeItemImageRelation = (raw: any): ItemImageRelation => ({
    id: raw?.id ?? null,
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    role: raw?.role ?? '',
    provider: raw?.provider ?? '',
    sourceFileTitle: raw?.sourceFileTitle ?? raw?.source_file_title ?? '',
    sourcePage: raw?.sourcePage ?? raw?.source_page ?? '',
    sourceRevisionTimestamp: raw?.sourceRevisionTimestamp ?? raw?.source_revision_timestamp ?? '',
    originalUrl: raw?.originalUrl ?? raw?.original_url ?? '',
    cachedUrl: raw?.cachedUrl ?? raw?.cached_url ?? '',
    width: raw?.width ?? null,
    height: raw?.height ?? null,
    contentType: raw?.contentType ?? raw?.content_type ?? '',
    isPrimary: raw?.isPrimary ?? raw?.is_primary ?? false,
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
    lastVerifiedAt: raw?.lastVerifiedAt ?? raw?.last_verified_at ?? '',
    imageUrl: normalizeAssetUrl(raw),
  })

  const normalizeItemRecipeIngredient = (raw: any): ItemRecipeIngredientRelation => ({
    id: raw?.id ?? null,
    ingredientItemId: raw?.ingredientItemId ?? raw?.ingredient_item_id ?? null,
    ingredientNameRaw: raw?.ingredientNameRaw ?? raw?.ingredient_name_raw ?? '',
    ingredientGroupType: raw?.ingredientGroupType ?? raw?.ingredient_group_type ?? '',
    quantityMin: raw?.quantityMin ?? raw?.quantity_min ?? null,
    quantityMax: raw?.quantityMax ?? raw?.quantity_max ?? null,
    quantityText: raw?.quantityText ?? raw?.quantity_text ?? '',
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
    itemName: raw?.itemName ?? raw?.item_name ?? '',
    itemNameZh: raw?.itemNameZh ?? raw?.item_name_zh ?? '',
    itemInternalName: raw?.itemInternalName ?? raw?.item_internal_name ?? '',
    itemImage: raw?.itemImage ?? raw?.item_image ?? '',
    itemImageUrl: normalizeAssetUrl(raw),
  })

  const normalizeItemRecipeStation = (raw: any): ItemRecipeStationRelation => ({
    id: raw?.id ?? null,
    stationId: raw?.stationId ?? raw?.station_id ?? null,
    stationItemId: raw?.stationItemId ?? raw?.station_item_id ?? null,
    stationNameRaw: raw?.stationNameRaw ?? raw?.station_name_raw ?? '',
    stationType: raw?.stationType ?? raw?.station_type ?? 'crafting_station',
    isAlternative: raw?.isAlternative ?? raw?.is_alternative ?? false,
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
    itemName: raw?.itemName ?? raw?.item_name ?? '',
    itemNameZh: raw?.itemNameZh ?? raw?.item_name_zh ?? '',
    itemInternalName: raw?.itemInternalName ?? raw?.item_internal_name ?? '',
    itemImage: raw?.itemImage ?? raw?.item_image ?? '',
    itemImageUrl: normalizeAssetUrl(raw),
  })

  const normalizeItemRecipeCondition = (raw: any): ItemRecipeConditionRelation => ({
    id: raw?.id ?? null,
    recipeId: raw?.recipeId ?? raw?.recipe_id ?? null,
    refType: raw?.refType ?? raw?.ref_type ?? '',
    refId: raw?.refId ?? raw?.ref_id ?? null,
    requirementRole: raw?.requirementRole ?? raw?.requirement_role ?? '',
    notes: raw?.notes ?? '',
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
    refCode: raw?.refCode ?? raw?.ref_code ?? '',
    refNameEn: raw?.refNameEn ?? raw?.ref_name_en ?? '',
    refNameZh: raw?.refNameZh ?? raw?.ref_name_zh ?? '',
    refContextType: raw?.refContextType ?? raw?.ref_context_type ?? '',
  })

  const normalizeCraftingStation = (raw: any): CraftingStation => ({
    id: Number(raw?.id ?? 0),
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    internalName: raw?.internalName ?? raw?.internal_name ?? '',
    nameEn: raw?.nameEn ?? raw?.name_en ?? '',
    nameZh: raw?.nameZh ?? raw?.name_zh ?? '',
    itemName: raw?.itemName ?? raw?.item_name ?? '',
    itemNameZh: raw?.itemNameZh ?? raw?.item_name_zh ?? '',
    itemInternalName: raw?.itemInternalName ?? raw?.item_internal_name ?? '',
    itemImage: raw?.itemImage ?? raw?.item_image ?? '',
    itemImageUrl: normalizeImageUrl({ image: raw?.itemImage ?? raw?.item_image }),
    stationType: raw?.stationType ?? raw?.station_type ?? 'crafting_station',
    notes: raw?.notes ?? '',
    imageUrl: normalizeImageUrl({ image: raw?.imageUrl ?? raw?.image_url ?? raw?.image }),
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
    status: raw?.status ?? null,
    usageRecipeCount: raw?.usageRecipeCount ?? raw?.usage_recipe_count ?? 0,
    usageItemCount: raw?.usageItemCount ?? raw?.usage_item_count ?? 0,
    usageItems: Array.isArray(raw?.usageItems ?? raw?.usage_items)
      ? (raw?.usageItems ?? raw?.usage_items).map((item: any) => ({
          resultItemId: item?.resultItemId ?? item?.result_item_id ?? null,
          resultItemName: item?.resultItemName ?? item?.result_item_name ?? '',
          resultItemNameZh: item?.resultItemNameZh ?? item?.result_item_name_zh ?? '',
          resultItemInternalName: item?.resultItemInternalName ?? item?.result_item_internal_name ?? '',
          resultItemImage: item?.resultItemImage ?? item?.result_item_image ?? '',
          resultItemImageUrl: normalizeImageUrl({ image: item?.resultItemImage ?? item?.result_item_image }),
          recipeCount: item?.recipeCount ?? item?.recipe_count ?? 0,
          versionScope: item?.versionScope ?? item?.version_scope ?? '',
          recipeIds: Array.isArray(item?.recipeIds ?? item?.recipe_ids) ? (item?.recipeIds ?? item?.recipe_ids).map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0) : [],
        }))
      : [],
  })

  const normalizeItemRecipe = (raw: any): ItemRecipeRelation => ({
    id: raw?.id ?? null,
    resultItemId: raw?.resultItemId ?? raw?.result_item_id ?? null,
    resultItemName: raw?.resultItemName ?? raw?.result_item_name ?? '',
    resultItemNameZh: raw?.resultItemNameZh ?? raw?.result_item_name_zh ?? '',
    resultItemInternalName: raw?.resultItemInternalName ?? raw?.result_item_internal_name ?? '',
    resultItemImage: raw?.resultItemImage ?? raw?.result_item_image ?? '',
    resultItemImageUrl: normalizeAssetUrl({ itemImage: raw?.resultItemImage ?? raw?.result_item_image }),
    resultQuantity: raw?.resultQuantity ?? raw?.result_quantity ?? null,
    versionScope: raw?.versionScope ?? raw?.version_scope ?? '',
    notes: raw?.notes ?? '',
    sourceProvider: raw?.sourceProvider ?? raw?.source_provider ?? '',
    sourcePage: raw?.sourcePage ?? raw?.source_page ?? '',
    sourceRevisionTimestamp: raw?.sourceRevisionTimestamp ?? raw?.source_revision_timestamp ?? '',
    ingredients: Array.isArray(raw?.ingredients) ? raw.ingredients.map(normalizeItemRecipeIngredient) : [],
    stations: Array.isArray(raw?.stations) ? raw.stations.map(normalizeItemRecipeStation) : [],
    conditions: Array.isArray(raw?.conditions) ? raw.conditions.map(normalizeItemRecipeCondition) : [],
  })

  const normalizeItemRecipeTreeItem = (raw: any): ItemRecipeTreeItem => ({
    id: Number(raw?.id ?? 0),
    name: String(raw?.name ?? ''),
    nameZh: String(raw?.nameZh ?? raw?.name_zh ?? ''),
    internalName: String(raw?.internalName ?? raw?.internal_name ?? ''),
    image: String(raw?.image ?? raw?.image_url ?? ''),
    imageUrl: normalizeImageUrl(raw),
  })

  const normalizeItemRecipeTreeStation = (raw: any): ItemRecipeTreeStation => ({
    stationItemId: raw?.stationItemId ?? raw?.station_item_id ?? null,
    stationInternalName: raw?.stationInternalName ?? raw?.station_internal_name ?? '',
    stationName: raw?.stationName ?? raw?.station_name ?? '',
    stationNameZh: raw?.stationNameZh ?? raw?.station_name_zh ?? '',
    stationNameRaw: raw?.stationNameRaw ?? raw?.station_name_raw ?? '',
    itemImage: raw?.itemImage ?? raw?.item_image ?? raw?.stationImage ?? raw?.station_image ?? '',
    itemImageUrl: normalizeAssetUrl({ itemImage: raw?.itemImage ?? raw?.item_image ?? raw?.stationImage ?? raw?.station_image }),
    isAlternative: raw?.isAlternative ?? raw?.is_alternative ?? false,
    stationType: raw?.stationType ?? raw?.station_type ?? '',
    requirementRole: raw?.requirementRole ?? raw?.requirement_role ?? '',
    notes: raw?.notes ?? '',
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
  })

  const normalizeItemRecipeTreeGroupMember = (raw: any): ItemRecipeTreeGroupMember => ({
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    internalName: raw?.internalName ?? raw?.internal_name ?? '',
    name: raw?.name ?? '',
    nameZh: raw?.nameZh ?? raw?.name_zh ?? '',
    image: raw?.image ?? '',
    imageUrl: normalizeAssetUrl({ itemImage: raw?.image }),
  })

  const normalizeRecipeGroupMember = (raw: any): RecipeGroupMember => ({
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    internalName: raw?.internalName ?? raw?.internal_name ?? '',
    name: raw?.name ?? '',
    nameZh: raw?.nameZh ?? raw?.name_zh ?? '',
    image: raw?.image ?? '',
    imageUrl: normalizeAssetUrl({ itemImage: raw?.image }),
  })

  const normalizeRecipeGroup = (raw: any): RecipeGroup => ({
    canonicalName: raw?.canonicalName ?? raw?.canonical_name ?? '',
    displayNameEn: raw?.displayNameEn ?? raw?.display_name_en ?? '',
    displayNameZh: raw?.displayNameZh ?? raw?.display_name_zh ?? '',
    members: Array.isArray(raw?.members) ? raw.members.map(normalizeRecipeGroupMember) : [],
  })

  const normalizeItemRecipeTreeNode = (raw: any): ItemRecipeTreeNode => ({
    nodeType: raw?.nodeType ?? raw?.node_type ?? '',
    recipeId: raw?.recipeId ?? raw?.recipe_id ?? null,
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    itemInternalName: raw?.itemInternalName ?? raw?.item_internal_name ?? '',
    itemName: raw?.itemName ?? raw?.item_name ?? '',
    itemNameZh: raw?.itemNameZh ?? raw?.item_name_zh ?? '',
    itemImage: raw?.itemImage ?? raw?.item_image ?? '',
    itemImageUrl: normalizeAssetUrl({ itemImage: raw?.itemImage ?? raw?.item_image }),
    displayName: raw?.displayName ?? raw?.display_name ?? '',
    secondaryName: raw?.secondaryName ?? raw?.secondary_name ?? '',
    groupCanonicalName: raw?.groupCanonicalName ?? raw?.group_canonical_name ?? '',
    groupMemberNames: Array.isArray(raw?.groupMemberNames) ? raw.groupMemberNames : [],
    groupMembers: Array.isArray(raw?.groupMembers) ? raw.groupMembers.map(normalizeItemRecipeTreeGroupMember) : [],
    resultQuantity: raw?.resultQuantity ?? raw?.result_quantity ?? null,
    quantityText: raw?.quantityText ?? raw?.quantity_text ?? '',
    quantityMin: raw?.quantityMin ?? raw?.quantity_min ?? null,
    quantityMax: raw?.quantityMax ?? raw?.quantity_max ?? null,
    ingredientGroupType: raw?.ingredientGroupType ?? raw?.ingredient_group_type ?? '',
    variantKey: raw?.variantKey ?? raw?.variant_key ?? '',
    variantLabel: raw?.variantLabel ?? raw?.variant_label ?? '',
    versionScope: raw?.versionScope ?? raw?.version_scope ?? '',
    sourcePage: raw?.sourcePage ?? raw?.source_page ?? '',
    notes: raw?.notes ?? '',
    expandable: raw?.expandable ?? false,
    cycleDetected: raw?.cycleDetected ?? raw?.cycle_detected ?? false,
    reference: raw?.reference ?? raw?.isReference ?? raw?.is_reference ?? false,
    depth: raw?.depth ?? null,
    stations: Array.isArray(raw?.stations) ? raw.stations.map(normalizeItemRecipeTreeStation) : [],
    children: Array.isArray(raw?.children) ? raw.children.map(normalizeItemRecipeTreeNode) : [],
  })

  const normalizeItemRecipeTreeVariant = (raw: any): ItemRecipeTreeVariant => ({
    variantKey: raw?.variantKey ?? raw?.variant_key ?? '',
    variantLabel: raw?.variantLabel ?? raw?.variant_label ?? '',
    versionScope: raw?.versionScope ?? raw?.version_scope ?? '',
    recipeCount: raw?.recipeCount ?? raw?.recipe_count ?? null,
    roots: Array.isArray(raw?.roots) ? raw.roots.map(normalizeItemRecipeTreeNode) : [],
  })

  const normalizeItemSource = (raw: any): ItemSourceRelation => ({
    id: raw?.id ?? null,
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    sourceType: raw?.sourceType ?? raw?.source_type ?? '',
    sourceRefType: raw?.sourceRefType ?? raw?.source_ref_type ?? '',
    sourceRefId: raw?.sourceRefId ?? raw?.source_ref_id ?? null,
    sourceRefName: raw?.sourceRefName ?? raw?.source_ref_name ?? '',
    sourceRefNameZh: raw?.sourceRefNameZh ?? raw?.source_ref_name_zh ?? '',
    biomeId: raw?.biomeId ?? raw?.biome_id ?? null,
    quantityMin: raw?.quantityMin ?? raw?.quantity_min ?? null,
    quantityMax: raw?.quantityMax ?? raw?.quantity_max ?? null,
    quantityText: raw?.quantityText ?? raw?.quantity_text ?? '',
    chanceValue: raw?.chanceValue ?? raw?.chance_value ?? null,
    chanceText: raw?.chanceText ?? raw?.chance_text ?? '',
    conditions: raw?.conditions ?? '',
    notes: raw?.notes ?? '',
    sourceProvider: raw?.sourceProvider ?? raw?.source_provider ?? '',
    sourcePage: raw?.sourcePage ?? raw?.source_page ?? '',
    sourceRevisionTimestamp: raw?.sourceRevisionTimestamp ?? raw?.source_revision_timestamp ?? '',
    sortOrder: raw?.sortOrder ?? raw?.sort_order ?? null,
    biomeCode: raw?.biomeCode ?? raw?.biome_code ?? '',
    biomeNameEn: raw?.biomeNameEn ?? raw?.biome_name_en ?? '',
    biomeNameZh: raw?.biomeNameZh ?? raw?.biome_name_zh ?? '',
  })

  const items = ref<Item[]>([])
  const loading = ref(false)
  const pagination = ref<Pagination>({
    page: 1,
    size: 10,
    total: 0,
    totalPages: 0,
  })
  const searchQuery = ref('')
  const selectedCategory = ref<number | null>(null)
  const selectedRarity = ref('')
  const selectedGamePeriodId = ref<number | null>(null)
  const collectionSync = usePagedCollectionSync(items, pagination)

  const totalItems = computed(() => pagination.value.total)

  const fetchItems = async (page = 1, size = 10) => {
    loading.value = true
    try {
      const params: Record<string, any> = { page, limit: size }
      if (searchQuery.value) {
        params.search = searchQuery.value
      }
      if (selectedCategory.value) {
        params.categoryId = selectedCategory.value
      }
      if (selectedRarity.value) {
        params.rarity = selectedRarity.value
      }
      if (selectedGamePeriodId.value != null) {
        params.gamePeriodId = selectedGamePeriodId.value
      }

      const response = await get('/items', params)
      if (response && response.success === false) {
        throw new Error(response.message || 'API 返回失败')
      }

      const list = extractItemList(response)
      items.value.splice(0, items.value.length, ...list)
      pagination.value = buildPagination(response, page, size, list.length)
    } catch (error: any) {
      console.error('[Items Store] fetch error:', error?.message)
      showToast(error?.data?.message || error?.message || '获取物品列表失败', 'error')
      items.value = []
      pagination.value = { page: 1, size: 10, total: 0, totalPages: 0 }
    } finally {
      loading.value = false
    }
  }

  const fetchItemById = async (id: number) => {
    try {
      const response = await get(`/items/${id}`)
      return extractSingleItem(response)
    } catch (error) {
      console.error('Failed to fetch item:', error)
      showToast('获取物品详情失败', 'error')
      return items.value.find(item => item.id === id) ?? null
    }
  }

  const fetchItemImages = async (id: number) => {
    try {
      const response = await get(`/items/${id}/images`)
      const source = response?.data ?? response
      return Array.isArray(source) ? source.map(normalizeItemImageRelation) : []
    } catch (error) {
      console.error('Failed to fetch item images:', error)
      showToast('获取物品图片失败', 'error')
      return []
    }
  }

  const fetchItemRecipes = async (id: number) => {
    try {
      const response = await get(`/items/${id}/recipes`)
      const source = response?.data ?? response
      return Array.isArray(source) ? source.map(normalizeItemRecipe) : []
    } catch (error) {
      console.error('Failed to fetch item recipes:', error)
      showToast('获取物品配方失败', 'error')
      return []
    }
  }

  const fetchItemRecipeTree = async (id: number, maxDepth = 3): Promise<ItemRecipeTreeResponse | null> => {
    try {
      const response = await get(`/admin/items/${id}/recipe-tree`, { maxDepth })
      const source = response?.data ?? response
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return null
      }
      return {
        item: source?.item ? normalizeItemRecipeTreeItem(source.item) : null,
        treeMeta: source?.treeMeta ?? source?.tree_meta ?? null,
        variants: Array.isArray(source?.variants) ? source.variants.map(normalizeItemRecipeTreeVariant) : [],
      }
    } catch (error: any) {
      console.error('Failed to fetch item recipe tree:', error)
      showToast(error?.data?.message || error?.message || '获取物品配方树失败', 'error')
      return null
    }
  }

  const fetchCraftingStations = async (
    page = 1,
    size = 100,
    search = '',
    usageState: 'all' | 'used' | 'unused' = 'all',
  ): Promise<{ records: CraftingStation[]; pagination: Pagination | null }> => {
    try {
      const response = await get('/admin/crafting-stations', {
        page,
        limit: size,
        search: search || undefined,
        usageState: usageState === 'all' ? undefined : usageState,
      })
      const source = response?.data ?? response
      const records = Array.isArray(source) ? source.map(normalizeCraftingStation) : []
      return {
        records,
        pagination: response?.pagination ?? null,
      }
    } catch (error: any) {
      console.error('Failed to fetch crafting stations:', error)
      showToast(error?.data?.message || error?.message || '获取制作站失败', 'error')
      return { records: [], pagination: null }
    }
  }

  const createCraftingStation = async (payload: Partial<CraftingStation>) => {
    try {
      const response = await post('/admin/crafting-stations', payload as any)
      const source = response?.data ?? response
      showToast('制作站已创建', 'success')
      return source ? normalizeCraftingStation(source) : null
    } catch (error: any) {
      console.error('Failed to create crafting station:', error)
      showToast(error?.data?.message || error?.message || '创建制作站失败', 'error')
      return null
    }
  }

  const fetchRecipeGroups = async (keyword = ''): Promise<RecipeGroup[]> => {
    try {
      const response = await get('/admin/recipe-groups', { keyword: keyword || undefined })
      const source = response?.data ?? response
      return Array.isArray(source) ? source.map(normalizeRecipeGroup) : []
    } catch (error: any) {
      console.error('Failed to fetch recipe groups:', error)
      showToast(error?.data?.message || error?.message || '获取任意物品组失败', 'error')
      return []
    }
  }

  const fetchRecipeGroupDetail = async (canonicalName: string): Promise<RecipeGroup | null> => {
    try {
      const response = await get(`/admin/recipe-groups/${encodeURIComponent(canonicalName)}`)
      const source = response?.data ?? response
      return source ? normalizeRecipeGroup(source) : null
    } catch (error: any) {
      console.error('Failed to fetch recipe group detail:', error)
      showToast(error?.data?.message || error?.message || '获取任意物品组详情失败', 'error')
      return null
    }
  }

  const createRecipeGroup = async (payload: RecipeGroup): Promise<RecipeGroup | null> => {
    try {
      const response = await post('/admin/recipe-groups', payload as any)
      const source = response?.data ?? response
      showToast('任意物品组已创建', 'success')
      return source ? normalizeRecipeGroup(source) : null
    } catch (error: any) {
      console.error('Failed to create recipe group:', error)
      showToast(error?.data?.message || error?.message || '创建任意物品组失败', 'error')
      return null
    }
  }

  const updateRecipeGroup = async (canonicalName: string, payload: RecipeGroup): Promise<RecipeGroup | null> => {
    try {
      const response = await put(`/admin/recipe-groups/${encodeURIComponent(canonicalName)}`, payload as any)
      const source = response?.data ?? response
      showToast('任意物品组已更新', 'success')
      return source ? normalizeRecipeGroup(source) : null
    } catch (error: any) {
      console.error('Failed to update recipe group:', error)
      showToast(error?.data?.message || error?.message || '更新任意物品组失败', 'error')
      return null
    }
  }

  const deleteRecipeGroup = async (canonicalName: string): Promise<boolean> => {
    try {
      await del(`/admin/recipe-groups/${encodeURIComponent(canonicalName)}`)
      showToast('任意物品组已删除', 'success')
      return true
    } catch (error: any) {
      console.error('Failed to delete recipe group:', error)
      showToast(error?.data?.message || error?.message || '删除任意物品组失败', 'error')
      return false
    }
  }

  const updateCraftingStation = async (id: number, payload: Partial<CraftingStation>) => {
    try {
      const response = await put(`/admin/crafting-stations/${id}`, payload as any)
      const source = response?.data ?? response
      showToast('制作站已更新', 'success')
      return source ? normalizeCraftingStation(source) : null
    } catch (error: any) {
      console.error('Failed to update crafting station:', error)
      showToast(error?.data?.message || error?.message || '更新制作站失败', 'error')
      return null
    }
  }

  const deleteCraftingStation = async (id: number) => {
    try {
      await del(`/admin/crafting-stations/${id}`)
      showToast('制作站已删除', 'success')
      return true
    } catch (error: any) {
      console.error('Failed to delete crafting station:', error)
      showToast(error?.data?.message || error?.message || '删除制作站失败', 'error')
      return false
    }
  }

  const fetchCraftingStationUsageItems = async (id: number, page = 1, size = 20): Promise<{ records: CraftingStationUsageItem[]; pagination: Pagination | null }> => {
    try {
      const response = await get(`/admin/crafting-stations/${id}/usage-items`, { page, limit: size })
      const source = response?.data ?? response
      const records = Array.isArray(source)
        ? source.map((item: any) => ({
            resultItemId: item?.resultItemId ?? item?.result_item_id ?? null,
            resultItemName: item?.resultItemName ?? item?.result_item_name ?? '',
            resultItemNameZh: item?.resultItemNameZh ?? item?.result_item_name_zh ?? '',
            resultItemInternalName: item?.resultItemInternalName ?? item?.result_item_internal_name ?? '',
            resultItemImage: item?.resultItemImage ?? item?.result_item_image ?? '',
            resultItemImageUrl: normalizeImageUrl({ image: item?.resultItemImage ?? item?.result_item_image }),
            recipeCount: item?.recipeCount ?? item?.recipe_count ?? 0,
            versionScope: item?.versionScope ?? item?.version_scope ?? '',
            recipeIds: Array.isArray(item?.recipeIds ?? item?.recipe_ids) ? (item?.recipeIds ?? item?.recipe_ids).map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry) && entry > 0) : [],
          }))
        : []
      return {
        records,
        pagination: response?.pagination ?? null,
      }
    } catch (error: any) {
      console.error('Failed to fetch crafting station usage items:', error)
      showToast(error?.data?.message || error?.message || '获取制作站关联配方失败', 'error')
      return { records: [], pagination: null }
    }
  }

  const updateItemRecipes = async (id: number, recipes: ItemRecipePayload[], scopeMode?: 'desktop' | 'full') => {
    try {
      const payload = (Array.isArray(recipes) ? recipes : []).map((recipe, recipeIndex) => ({
        resultQuantity: recipe.resultQuantity ?? 1,
        versionScope: recipe.versionScope?.trim() || undefined,
        notes: recipe.notes?.trim() || undefined,
        sourceProvider: recipe.sourceProvider?.trim() || undefined,
        sourcePage: recipe.sourcePage?.trim() || undefined,
        sourceRevisionTimestamp: recipe.sourceRevisionTimestamp?.trim() || undefined,
        ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((ingredient, ingredientIndex) => ({
          ingredientItemId: ingredient.ingredientItemId ?? null,
          ingredientNameRaw: resolvePreferredRecipeIngredientNameRaw(ingredient),
          ingredientGroupType: ingredient.ingredientGroupType?.trim() || undefined,
          quantityMin: ingredient.quantityMin ?? null,
          quantityMax: ingredient.quantityMax ?? null,
          quantityText: ingredient.quantityText?.trim() || undefined,
          sortOrder: ingredient.sortOrder ?? ingredientIndex + 1,
        })),
        stations: (Array.isArray(recipe.stations) ? recipe.stations : []).map((station, stationIndex) => ({
          stationId: station.stationId ?? null,
          stationItemId: station.stationItemId ?? null,
          stationNameRaw: resolvePreferredRecipeStationNameRaw(station),
          isAlternative: station.isAlternative ?? false,
          sortOrder: station.sortOrder ?? stationIndex + 1,
        })),
        conditions: (Array.isArray(recipe.conditions) ? recipe.conditions : []).map((condition, conditionIndex) => ({
          refType: condition.refType?.trim() || undefined,
          refId: condition.refId ?? null,
          requirementRole: condition.requirementRole?.trim() || undefined,
          notes: condition.notes?.trim() || undefined,
          sortOrder: condition.sortOrder ?? conditionIndex + 1,
        })),
        sortOrder: recipeIndex + 1,
      }))

      const suffix = scopeMode ? `?scopeMode=${encodeURIComponent(scopeMode)}` : ''
      const response = await put(`/admin/items/${id}/recipes${suffix}`, payload)
      const source = response?.data ?? response
      showToast('物品配方已保存', 'success')
      return Array.isArray(source) ? source.map(normalizeItemRecipe) : []
    } catch (error: any) {
      console.error('Failed to update item recipes:', error)
      showToast(error?.data?.message || error?.message || '保存物品配方失败', 'error')
      return null
    }
  }

  const fetchItemSources = async (id: number) => {
    try {
      const response = await get(`/items/${id}/sources`)
      const source = response?.data ?? response
      return Array.isArray(source) ? source.map(normalizeItemSource) : []
    } catch (error) {
      console.error('Failed to fetch item sources:', error)
      showToast('获取物品来源失败', 'error')
      return []
    }
  }

  const setSearchQuery = (query: string) => {
    searchQuery.value = query
  }

  const setSelectedCategory = (categoryId: number | null) => {
    selectedCategory.value = categoryId
  }

  const setSelectedRarity = (rarity: string) => {
    selectedRarity.value = RARITY_FILTER_OPTIONS.includes(rarity) ? rarity : ''
  }

  const setSelectedGamePeriodId = (gamePeriodId: number | null) => {
    selectedGamePeriodId.value = gamePeriodId
  }

  const resetFilters = () => {
    searchQuery.value = ''
    selectedCategory.value = null
    selectedRarity.value = ''
    selectedGamePeriodId.value = null
  }

  const createItem = async (payload: ItemPayload) => {
    try {
      const response = await post('/items', buildPayload(payload))
      const created = extractSingleItem(response)
      if (!created) {
        throw new Error(response?.message || '新增物品失败')
      }
      showToast('新增物品成功', 'success')
      collectionSync.syncCreated(created)
      return created
    } catch (error: any) {
      console.error('Failed to create item:', error)
      showToast(error?.data?.message || error?.message || '新增物品失败', 'error')
      return null
    }
  }

  const updateItem = async (id: number, payload: ItemPayload) => {
    try {
      const response = await put(`/items/${id}`, buildPayload(payload))
      const updated = extractSingleItem(response)
      if (!updated) {
        throw new Error(response?.message || '更新物品失败')
      }
      showToast('更新物品成功', 'success')
      collectionSync.syncUpdated(updated)
      return updated
    } catch (error: any) {
      console.error('Failed to update item:', error)
      showToast(error?.data?.message || error?.message || '更新物品失败', 'error')
      return null
    }
  }

  const deleteItem = async (id: number) => {
    try {
      await del(`/items/${id}`)
      showToast('删除物品成功', 'success')
      const shouldLoadPreviousPage = items.value.length === 1 && pagination.value.page > 1
      collectionSync.syncDeleted(id)
      if (shouldLoadPreviousPage) {
        await fetchItems(pagination.value.page - 1, pagination.value.size)
      }
      return true
    } catch (error: any) {
      console.error('Failed to delete item:', error)
      showToast(error?.data?.message || error?.message || '删除物品失败', 'error')
      return false
    }
  }

  const toggleItemStatus = async (item: Item) => {
    const nextStatus = item.status === 1 ? 0 : 1
    collectionSync.syncUpdated({ ...item, status: nextStatus })

    try {
      const response = await put(`/items/${item.id}`, buildPayloadFromItem(item, { status: nextStatus }))
      const updated = extractSingleItem(response)
      if (!updated) {
        throw new Error(response?.message || '切换物品状态失败')
      }
      showToast(`物品已${nextStatus === 1 ? '启用' : '禁用'}`, 'success')
      collectionSync.syncUpdated(updated)
      return updated
    } catch (error: any) {
      collectionSync.syncUpdated(item)
      console.error('Failed to toggle item status:', error)
      showToast(error?.data?.message || error?.message || '切换物品状态失败', 'error')
      return null
    }
  }

  const batchUpdateStatus = async (targetItems: Item[], status: number): Promise<BatchOperationResult> => {
    const successIds: number[] = []
    const failedIds: number[] = []

    for (const item of targetItems) {
      try {
        const response = await put(`/items/${item.id}`, buildPayloadFromItem(item, { status }))
        const updated = extractSingleItem(response)
        if (!updated) {
          throw new Error(response?.message || '批量状态更新失败')
        }
        collectionSync.syncUpdated(updated)
        successIds.push(item.id)
      } catch (error) {
        console.error('Failed to batch update item status:', error)
        failedIds.push(item.id)
      }
    }

    if (successIds.length > 0) {
      showToast(`已批量${status === 1 ? '启用' : '禁用'} ${successIds.length} 个物品`, 'success')
    }
    if (failedIds.length > 0) {
      showToast(`${failedIds.length} 个物品状态更新失败`, 'warning')
    }

    return { successIds, failedIds }
  }

  const batchDeleteItems = async (ids: number[]): Promise<BatchOperationResult> => {
    const successIds: number[] = []
    const failedIds: number[] = []

    for (const id of ids) {
      try {
        await del(`/items/${id}`)
        collectionSync.syncDeleted(id)
        successIds.push(id)
      } catch (error) {
        console.error('Failed to batch delete item:', error)
        failedIds.push(id)
      }
    }

    if (successIds.length > 0) {
      showToast(`已批量删除 ${successIds.length} 个物品`, 'success')
    }
    if (failedIds.length > 0) {
      showToast(`${failedIds.length} 个物品删除失败`, 'warning')
    }

    if (items.value.length === 0 && pagination.value.page > 1) {
      await fetchItems(pagination.value.page - 1, pagination.value.size)
    }

    return { successIds, failedIds }
  }

  const uploadItemImage = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response: any = await post('/files/images', formData as any)
      const raw = response?.data ?? response
      if (!raw?.url) {
        throw new Error(response?.message || '图片上传失败')
      }

      showToast('图片上传成功', 'success')
      return {
        bucket: String(raw.bucket ?? ''),
        objectKey: String(raw.objectKey ?? ''),
        url: String(raw.url),
        originalFilename: raw.originalFilename ? String(raw.originalFilename) : undefined,
        contentType: raw.contentType ? String(raw.contentType) : undefined,
        size: Number(raw.size ?? 0),
      } as UploadedImage
    } catch (error: any) {
      console.error('Failed to upload image:', error)
      showToast(error?.data?.message || error?.message || '图片上传失败', 'error')
      return null
    }
  }

  return {
    items,
    loading,
    pagination,
    searchQuery,
    selectedCategory,
    selectedRarity,
    selectedGamePeriodId,
    totalItems,
    fetchItems,
    fetchItemById,
    fetchItemImages,
    fetchItemRecipes,
    fetchItemRecipeTree,
    fetchRecipeGroups,
    fetchRecipeGroupDetail,
    fetchCraftingStations,
    fetchCraftingStationUsageItems,
    createRecipeGroup,
    updateRecipeGroup,
    deleteRecipeGroup,
    createCraftingStation,
    updateCraftingStation,
    deleteCraftingStation,
    updateItemRecipes,
    fetchItemSources,
    createItem,
    updateItem,
    deleteItem,
    toggleItemStatus,
    batchUpdateStatus,
    batchDeleteItems,
    uploadItemImage,
    setSearchQuery,
    setSelectedCategory,
    setSelectedRarity,
    setSelectedGamePeriodId,
    resetFilters,
  }
})
