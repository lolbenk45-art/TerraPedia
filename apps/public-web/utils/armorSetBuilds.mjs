export const armorBuildPieceName = (item) => (
  item?.displayName || item?.nameZh || item?.name || item?.internalName || '套装部件'
)

export const armorBuildPieceRole = (item) => {
  const value = String(item?.partRole ?? item?.slotType ?? '').trim()
  if (/头部|head/i.test(value)) return '头部'
  if (/胸甲|身体|body|shirt|chest/i.test(value)) return '胸甲'
  if (/腿部|leg|legs|pants/i.test(value)) return '腿部'
  return '防具部件'
}

export const armorBuildPieceRoleOrder = (role) => {
  if (role === '头部') return 0
  if (role === '胸甲') return 1
  if (role === '腿部') return 2
  return 3
}

export const armorBuildVariantIndex = (item) => {
  const value = Number(item?.setVariantIndex)
  return Number.isFinite(value) ? value : null
}

export const armorBuildPartIndex = (item) => {
  const value = Number(item?.partIndex)
  return Number.isFinite(value) ? value : null
}

const armorBuildItemKey = (item) => String(
  item?.itemId ?? item?.sourceId ?? item?.internalName ?? armorBuildPieceName(item),
).trim()

const armorBuildUniqueItemKey = (item) => [
  armorBuildPieceRole(item),
  armorBuildItemKey(item),
].join(':')

const armorBuildPartKey = (item) => {
  const partIndex = armorBuildPartIndex(item)
  if (partIndex != null) return `part:${partIndex}`
  return `role:${armorBuildPieceRole(item)}`
}

export const uniqueArmorBuildItems = (items) => {
  const seen = new Set()
  const result = []

  for (const item of items) {
    const key = armorBuildUniqueItemKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

const sortArmorBuildItems = (items) => items.slice().sort((left, right) => {
  const roleDelta = armorBuildPieceRoleOrder(armorBuildPieceRole(left)) - armorBuildPieceRoleOrder(armorBuildPieceRole(right))
  if (roleDelta !== 0) return roleDelta
  const partDelta = (armorBuildPartIndex(left) ?? 99) - (armorBuildPartIndex(right) ?? 99)
  if (partDelta !== 0) return partDelta
  return armorBuildPieceName(left).localeCompare(armorBuildPieceName(right), 'zh-Hans-CN')
})

const createPartGroups = (items) => {
  const groups = new Map()
  for (const item of items) {
    const key = armorBuildPartKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  return [...groups.entries()]
    .map(([key, alternatives]) => {
      const sortedAlternatives = sortArmorBuildItems(uniqueArmorBuildItems(alternatives))
      const representative = sortedAlternatives[0]
      return {
        key,
        partIndex: representative ? armorBuildPartIndex(representative) : null,
        role: representative ? armorBuildPieceRole(representative) : '防具部件',
        item: representative,
        alternatives: sortedAlternatives,
      }
    })
    .filter((group) => group.item)
    .sort((left, right) => {
      const roleDelta = armorBuildPieceRoleOrder(left.role) - armorBuildPieceRoleOrder(right.role)
      if (roleDelta !== 0) return roleDelta
      return (left.partIndex ?? 99) - (right.partIndex ?? 99)
    })
}

export const createArmorSetBuildGroups = (items) => {
  const groups = new Map()
  for (const item of items) {
    const variantIndex = armorBuildVariantIndex(item)
    if (variantIndex == null) return []
    groups.set(variantIndex, [...(groups.get(variantIndex) ?? []), item])
  }
  if (groups.size <= 1) {
    const onlyGroup = groups.entries().next().value
    if (!onlyGroup) return []
    const [variantIndex, variantItems] = onlyGroup
    const partGroups = createPartGroups(variantItems)
    const hasAlternatives = partGroups.some((part) => part.alternatives.length > 1)
    if (!hasAlternatives) return []
    const displayItems = partGroups.map((part) => part.item)
    return [{
      key: `variant-${variantIndex}`,
      variantIndex,
      title: '完整套装',
      variantRole: '套装',
      variantItems: sortArmorBuildItems(uniqueArmorBuildItems(variantItems)),
      displayItems,
      partGroups,
    }]
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([variantIndex, variantItems]) => {
      const partGroups = createPartGroups(variantItems)
      const displayItems = partGroups.map((part) => part.item)
      const variantItem = displayItems.find((item) => {
        const sameRoleItems = items.filter((candidate) => armorBuildPieceRole(candidate) === armorBuildPieceRole(item))
        return sameRoleItems.length > 1
      }) ?? displayItems[0]
      return {
        key: `variant-${variantIndex}`,
        variantIndex,
        title: variantItem ? armorBuildPieceName(variantItem) : `构筑 ${variantIndex + 1}`,
        variantRole: variantItem ? armorBuildPieceRole(variantItem) : '套装',
        variantItems: sortArmorBuildItems(uniqueArmorBuildItems(variantItems)),
        displayItems,
        partGroups,
      }
    })
}
