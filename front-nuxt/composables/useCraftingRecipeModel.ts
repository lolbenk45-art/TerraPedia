import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type {
  PublicItemRecipeTree,
  PublicItemRecipeTreeGroupMember,
  PublicItemRecipeTreeNode,
  PublicItemRecipeTreeStation,
  PublicItemRecipeTreeVariant,
} from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

export type CraftingEntityView = {
  key: string
  itemId?: string | null
  title: string
  subtitle: string
  quantity: string
  image: string
  fallback: string
  fallbackIcon: string
  href: string
}

export type CraftingStationView = {
  key: string
  title: string
  meta: string
  image: string
  fallback: string
  fallbackIcon: string
  href: string
  isCondition: boolean
}

export type CraftingNodeState = {
  expandable: boolean
  cycleDetected: boolean
  isReference: boolean
  referenceKey: string
}

export type CraftingMaterialView = CraftingEntityView & CraftingNodeState & {
  isAnyGroup: boolean
  members: CraftingEntityView[]
  childRecipe: CraftingRecipeOptionView | null
}

export type CraftingRecipeOptionView = {
  key: string
  label: string
  summary: string
  recipeId: string
  output: CraftingEntityView
  materials: CraftingMaterialView[]
  stations: CraftingStationView[]
  conditions: CraftingStationView[]
} & CraftingNodeState

export type CraftingRecipeVariantView = {
  key: string
  label: string
  meta: string
  options: CraftingRecipeOptionView[]
}

export type CraftingRecipeModel = {
  target: CraftingEntityView | null
  variants: CraftingRecipeVariantView[]
  activeVariant: CraftingRecipeVariantView | null
  activeRecipe: CraftingRecipeOptionView | null
}

const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const normalizeKey = (...values: unknown[]) => displayText(...values).replace(/\s+/g, '-').toLowerCase()
const truthyFlag = (value: unknown) => value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'

const nodeState = (node: PublicItemRecipeTreeNode): CraftingNodeState => ({
  expandable: truthyFlag(node.expandable),
  cycleDetected: truthyFlag(node.cycleDetected),
  isReference: truthyFlag(node.isReference),
  referenceKey: displayText(node.referenceKey),
})

const quantityText = (node: PublicItemRecipeTreeNode, isOutput = false) => {
  if (node.quantityText) return `x${String(node.quantityText).replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) {
    return `x${node.quantityMin}-${node.quantityMax}`
  }

  const directQuantity = displayText(node.quantityMin, node.quantity, node.amount, node.count)
  if (directQuantity) return `x${directQuantity.replace(/^x/i, '')}`

  const resultQuantity = Number(node.resultQuantity)
  if (isOutput && Number.isFinite(resultQuantity) && resultQuantity > 0 && resultQuantity <= 99) {
    return `x${resultQuantity}`
  }

  return 'x1'
}

const nodeTitle = (node: PublicItemRecipeTreeNode) => displayText(
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.name,
  node.itemInternalName,
  '配方节点',
)

const nodeImage = (node: PublicItemRecipeTreeNode) => resolvePreviewImageUrl(
  node.itemImage || node.itemImageUrl || node.image || node.previewImage || '',
)

const memberTitle = (member: PublicItemRecipeTreeGroupMember) => displayText(
  member.nameZh,
  member.name,
  member.internalName,
  '可选材料',
)

const memberView = (member: PublicItemRecipeTreeGroupMember, index: number): CraftingEntityView => {
  const title = memberTitle(member)
  const itemId = displayText(member.itemId)

  return {
    key: normalizeKey(member.itemId, member.internalName, title, index) || `member-${index}`,
    itemId: itemId || null,
    title,
    subtitle: displayText(member.internalName),
    quantity: '',
    image: resolvePreviewImageUrl(member.image || member.imageUrl || ''),
    fallback: firstGlyph(title),
    fallbackIcon: 'icon-items',
    href: itemId ? `/items/${itemId}` : '',
  }
}

const entityView = (node: PublicItemRecipeTreeNode, index = 0, isOutput = false): CraftingEntityView => {
  const title = nodeTitle(node)
  const itemId = displayText(node.itemId, node.id)

  return {
    key: normalizeKey(node.recipeId, node.itemId, node.itemInternalName, title, index) || `node-${index}`,
    itemId: itemId || null,
    title,
    subtitle: displayText(node.itemInternalName, node.itemName),
    quantity: quantityText(node, isOutput),
    image: nodeImage(node),
    fallback: firstGlyph(title),
    fallbackIcon: 'icon-items',
    href: itemId ? `/items/${itemId}` : '',
  }
}

const stationTitle = (station: PublicItemRecipeTreeStation) => displayText(
  station.displayName,
  station.stationNameZh,
  station.stationName,
  station.name,
  station.stationNameRaw,
  station.stationInternalName,
  '制作站',
)

const stationView = (station: PublicItemRecipeTreeStation, index: number): CraftingStationView => {
  const title = stationTitle(station)
  const itemId = displayText(station.stationItemId)
  const isCondition = station.stationType === 'condition'

  return {
    key: normalizeKey(station.stationItemId, station.stationInternalName, title, index) || `station-${index}`,
    title,
    meta: isCondition ? '条件' : '制作站选项',
    image: resolvePreviewImageUrl(station.stationImage || station.itemImage || station.itemImageUrl || station.image || ''),
    fallback: firstGlyph(title),
    fallbackIcon: isCondition ? 'icon-settings' : 'icon-crafting',
    href: itemId ? `/items/${itemId}` : '',
    isCondition,
  }
}

const formatMaterialSummary = (material: CraftingMaterialView) => {
  const quantity = material.quantity === 'x1' ? '' : ` ${material.quantity}`
  if (!material.isAnyGroup) return `${material.title}${quantity}`

  const memberSummary = material.members.map((member) => member.title).join('/')
  return memberSummary ? `${material.title}${quantity}（任选其一：${memberSummary}）` : `${material.title}${quantity}（任选其一）`
}

const summarizeMaterials = (materials: CraftingMaterialView[]) =>
  materials.slice(0, 4).map(formatMaterialSummary).join(' / ')

const canExpandChildRecipe = (node: PublicItemRecipeTreeNode) => {
  const state = nodeState(node)
  const childHasRecipe = Boolean((Array.isArray(node.children) && node.children.length) || (Array.isArray(node.stations) && node.stations.length))
  return childHasRecipe && !state.cycleDetected && !state.isReference
}

const buildRecipeOption = (root: PublicItemRecipeTreeNode, index = 0): CraftingRecipeOptionView => {
  const materials = (Array.isArray(root.children) ? root.children : []).map((child, childIndex) => {
    const members = (Array.isArray(child.groupMembers) ? child.groupMembers : []).map(memberView)
    const title = nodeTitle(child)
    const representative = members[0]
    const base = entityView(child, childIndex)
    const childCanExpandRecipe = canExpandChildRecipe(child)

	    return {
	      ...base,
	      title,
	      image: base.image || representative?.image || '',
	      fallback: firstGlyph(title),
	      isAnyGroup: members.length > 0,
	      members,
	      childRecipe: childCanExpandRecipe ? buildRecipeOption(child, childIndex) : null,
	      ...nodeState(child),
	    }
	  })
  const stationViews = (Array.isArray(root.stations) ? root.stations : []).map(stationView)
  const stations = stationViews.filter((station) => !station.isCondition)
  const conditions = stationViews.filter((station) => station.isCondition)
  const output = entityView(root, index, true)
  const recipeId = displayText(root.recipeId)
  const label = recipeId ? `配方 ${index + 1} · #${recipeId}` : `配方 ${index + 1}`
  const materialSummary = summarizeMaterials(materials)
  const stationSummary = stations.map((station) => station.title).join(' / ')

  return {
    key: normalizeKey(root.recipeId, root.itemId, output.title, index) || `recipe-${index}`,
    label,
    summary: [materialSummary, stationSummary, output.quantity !== 'x1' ? `产出 ${output.quantity}` : ''].filter(Boolean).join('；'),
    recipeId,
    output,
    materials,
	    stations,
	    conditions,
	    ...nodeState(root),
	  }
	}

const variantView = (variant: PublicItemRecipeTreeVariant, index: number): CraftingRecipeVariantView => {
  const key = displayText(variant.variantKey, variant.variantLabel, index) || `variant-${index}`
  const options = (Array.isArray(variant.roots) ? variant.roots : []).map(buildRecipeOption)

  return {
    key,
    label: displayText(variant.variantLabel, variant.variantKey, '默认变体'),
    meta: `${variant.recipeCount ?? options.length} 条配方 · ${variant.versionScope || '版本未标注'}`,
    options,
  }
}

const targetView = (tree: PublicItemRecipeTree | null | undefined): CraftingEntityView | null => {
  const item = tree?.item
  if (!item && !tree) return null
  const title = displayText(item?.nameZh, item?.name, item?.internalName, tree?.displayName, tree?.name, tree?.resultName, '目标物品')
  const itemId = displayText(item?.id)

  return {
    key: normalizeKey(item?.id, item?.internalName, title) || 'target',
    itemId: itemId || null,
    title,
    subtitle: displayText(item?.internalName, item?.name),
    quantity: '',
    image: resolvePreviewImageUrl(item?.imageUrl || item?.previewImage || item?.image || ''),
    fallback: firstGlyph(title),
    fallbackIcon: 'icon-items',
    href: itemId ? `/items/${itemId}` : '',
  }
}

export const buildCraftingRecipeModel = (
  tree: PublicItemRecipeTree | null | undefined,
  selectedVariantKey = '',
  selectedRecipeKey = '',
): CraftingRecipeModel => {
  const variants = (Array.isArray(tree?.variants) ? tree?.variants : []).map(variantView)
  const activeVariant = variants.find((variant) => variant.key === selectedVariantKey) ?? variants[0] ?? null
  const activeRecipe = activeVariant?.options.find((option) => option.key === selectedRecipeKey) ?? activeVariant?.options[0] ?? null

  return {
    target: targetView(tree),
    variants,
    activeVariant,
    activeRecipe,
  }
}

export const useCraftingRecipeModel = (
  tree: MaybeRefOrGetter<PublicItemRecipeTree | null | undefined>,
  selectedVariantKey: MaybeRefOrGetter<string>,
  selectedRecipeKey: MaybeRefOrGetter<string>,
) => computed(() => buildCraftingRecipeModel(
  toValue(tree),
  toValue(selectedVariantKey),
  toValue(selectedRecipeKey),
))
