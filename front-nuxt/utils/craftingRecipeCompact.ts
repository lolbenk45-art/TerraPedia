import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import type { PublicItemRecipeTree, PublicItemRecipeTreeGroupMember, PublicItemRecipeTreeNode, PublicItemRecipeTreeStation } from '~/types/public-api'

export type CompactRecipeMaterialOption = {
  key: string
  name: string
  quantity: string
  image: string
  fallback: string
  href: string
}

export type CompactRecipeMaterial = {
  key: string
  name: string
  quantity: string
  image: string
  fallback: string
  href: string
  alternatives: CompactRecipeMaterialOption[]
}

export type CompactRecipeStation = {
  key: string
  name: string
  meta: string
  image: string
  fallback: string
  href: string
}

export const compactRecipeDisplayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''

export const compactRecipeFirstGlyph = (value: string) => Array.from(String(value ?? '').trim())[0] ?? '?'

export const compactRecipeNodeTitle = (node: PublicItemRecipeTreeNode) => compactRecipeDisplayText(
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.name,
  node.itemInternalName,
  '材料',
)

export const compactRecipeNodeImage = (node: PublicItemRecipeTreeNode) => resolvePreviewImageUrl(node.itemImage || node.itemImageUrl || node.image || node.previewImage || '')

export const compactRecipeNodeHref = (node: PublicItemRecipeTreeNode) => node.itemId ? `/items/${node.itemId}` : ''

export const compactRecipeNodeQuantity = (node: PublicItemRecipeTreeNode) => {
  if (node.quantityText) return `x${String(node.quantityText).replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) return `x${node.quantityMin}-${node.quantityMax}`
  const value = compactRecipeDisplayText(node.quantityMin, node.quantity, node.amount, node.count)
  return value ? `x${value.replace(/^x/i, '')}` : 'x1'
}

export const compactRecipeMemberTitle = (member: PublicItemRecipeTreeGroupMember) => compactRecipeDisplayText(
  member.nameZh,
  member.name,
  member.internalName,
  '可替换材料',
)

export const buildCompactRecipeMaterialAlternatives = (node: PublicItemRecipeTreeNode) => {
  const members = Array.isArray(node.groupMembers) ? node.groupMembers : []
  const quantity = compactRecipeNodeQuantity(node)
  return members.map((member, index) => {
    const title = compactRecipeMemberTitle(member)
    const itemId = compactRecipeDisplayText(member.itemId)
    return {
      key: compactRecipeDisplayText(member.itemId, member.internalName, title, index),
      name: title,
      quantity,
      image: resolvePreviewImageUrl(member.image || member.imageUrl || ''),
      fallback: compactRecipeFirstGlyph(title),
      href: itemId ? `/items/${itemId}` : '',
    }
  }).filter((member) => member.name)
}

export const buildCompactRecipeMaterial = (node: PublicItemRecipeTreeNode, index = 0): CompactRecipeMaterial => {
  const title = compactRecipeNodeTitle(node)
  return {
    key: compactRecipeDisplayText(node.itemId, node.itemInternalName, title, index),
    name: title,
    quantity: compactRecipeNodeQuantity(node),
    image: compactRecipeNodeImage(node),
    fallback: compactRecipeFirstGlyph(title),
    href: compactRecipeNodeHref(node),
    alternatives: buildCompactRecipeMaterialAlternatives(node),
  }
}

export const compactRecipeStationTitle = (station: PublicItemRecipeTreeStation) => compactRecipeDisplayText(
  station.displayName,
  station.stationNameZh,
  station.stationName,
  station.name,
  station.stationNameRaw,
  station.stationInternalName,
  '制作站',
)

export const compactRecipeStationImage = (station: PublicItemRecipeTreeStation) => resolvePreviewImageUrl(station.stationImage || station.itemImage || station.itemImageUrl || station.image || '')

export const compactRecipeStationHref = (station: PublicItemRecipeTreeStation) => station.stationItemId ? `/items/${station.stationItemId}` : ''

export const compactRecipeStationMeta = (station: PublicItemRecipeTreeStation) => station.stationType === 'condition'
  ? '条件'
  : station.isAlternative
    ? '可替代'
    : '制作站'

export const buildCompactRecipeStation = (station: PublicItemRecipeTreeStation, index = 0): CompactRecipeStation => {
  const title = compactRecipeStationTitle(station)
  return {
    key: compactRecipeDisplayText(station.stationItemId, station.stationInternalName, title, index),
    name: title,
    meta: compactRecipeStationMeta(station),
    image: compactRecipeStationImage(station),
    fallback: compactRecipeFirstGlyph(title),
    href: compactRecipeStationHref(station),
  }
}

export const compactRecipeNodeChildren = (node: PublicItemRecipeTreeNode | null | undefined) => Array.isArray(node?.children) ? node.children : []

export const compactRecipeNodeStations = (node: PublicItemRecipeTreeNode | null | undefined) => Array.isArray(node?.stations) ? node.stations : []

export const compactRecipeRootNodes = (tree: PublicItemRecipeTree | null | undefined) => (Array.isArray(tree?.variants) ? tree.variants : [])
  .flatMap((variant) => Array.isArray(variant.roots) ? variant.roots : [])
