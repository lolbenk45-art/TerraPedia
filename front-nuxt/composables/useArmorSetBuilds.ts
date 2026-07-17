import type { ComputedRef, Ref } from 'vue'
import type { EquipmentEffectAttribute, PublicArmorSetRelatedItem } from '~/types/public-api'
import { createArmorSetBuildGroups } from '~/utils/armorSetBuilds.mjs'
import {
  armorBenefitLineIsAttributeSummary,
  armorEffectFromLine,
  armorEffectLineNumericMatch,
  armorEffectLinesFromLine,
  armorIdentityAliases,
  armorLineLooksLikeNumericSetAttribute,
  armorLineLooksLikePlainAttribute,
  dedupeEffectLines,
  fallbackStatKey,
  normalizeEffectLine,
  normalizeMatchText,
  statLabels,
} from '~/utils/armorEffectParsing'

// armor-sets 详情页 build 计算引擎：从 pages/armor-sets/[id].vue 迁出。
// 模块级为纯函数(仅依赖入参)，useArmorSetBuilds 闭包持有页面注入的响应式依赖。


export type ArmorBuildTotalEntry = {
  key: string
  statKey: string
  label: string
  value: string
  rawValue: number
  isVariable?: boolean
}

export type ArmorBuildGroup = {
  key: string
  title: string
  variantRole: string
  variantItems: PublicArmorSetRelatedItem[]
  displayItems?: PublicArmorSetRelatedItem[]
  partGroups?: ArmorBuildPartGroup[]
}

export type ArmorBuildDisplayItem = PublicArmorSetRelatedItem & {
  displayName?: string
}

export type ArmorBuildPartGroup = {
  key: string
  partIndex: number | null
  role: string
  item: PublicArmorSetRelatedItem
  alternatives: PublicArmorSetRelatedItem[]
}

export const formatEffectValue = (effect: EquipmentEffectAttribute) => {
  const numeric = Number(effect.valueDecimal)
  if (!Number.isFinite(numeric)) return ''
  if (effect.unit === 'percent') return `${numeric > 0 ? '+' : ''}${numeric}%`
  if (effect.unit === 'multiplier') return `×${numeric}`
  return `${numeric > 0 ? '+' : ''}${numeric}`
}

export const formatArmorTotalValue = (value: number, unit: string | null | undefined) => {
  if (unit === 'percent') return `${value > 0 ? '+' : ''}${value}%`
  if (unit === 'multiplier') return `×${value}`
  return `${value > 0 ? '+' : ''}${value}`
}

export const statName = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  return statLabels[key] ?? effect.statLabelZh ?? (key || '未归类')
}

export const effectReadableStatName = (effect: EquipmentEffectAttribute) => {
  const label = String(effect.statLabelZh ?? '').trim()
  if (String(effect.statKey ?? '') === 'crit_chance' && (!label || label === '暴击率' || label === '暴击')) {
    const sourceLine = String((effect as { sourceLine?: string | null, source_line?: string | null }).sourceLine ?? (effect as { source_line?: string | null }).source_line ?? '')
    const classScope = String(effect.classScope ?? '').trim()
    if (/meleeCritChance/i.test(sourceLine) || classScope === 'melee') return '近战暴击率'
    if (/rangedCritChance/i.test(sourceLine) || classScope === 'ranged') return '远程暴击率'
    if (/magicCritChance/i.test(sourceLine) || classScope === 'magic') return '魔法暴击率'
  }
  if (label) return label
  return statName(effect)
}

export const playerEffectDescription = (effect: EquipmentEffectAttribute) => (
  String(effect.conditionText ?? effect.variantLabel ?? effect.rawText ?? '').trim() || '套装效果'
)

export const effectSourceKind = (effect: EquipmentEffectAttribute) => {
  const applyScope = String(effect.applyScope ?? '').trim().toLowerCase()
  if (effect.variantLabel) return 'piece'
  if (effect.itemInternalName || effect.slotType) return 'piece'
  if (/item|piece|part|head|body|chest|leg|helmet|mask|shirt|pants/.test(applyScope)) return 'piece'
  return 'set'
}

export const effectVariantLabel = (effect: EquipmentEffectAttribute) => String(effect.variantLabel ?? '').trim()

export const effectRawText = (effect: EquipmentEffectAttribute) => String(effect.rawText ?? '').trim()

export const armorItemIdentityAliases = (item: PublicArmorSetRelatedItem) => dedupeEffectLines([
  ...armorIdentityAliases(String(item.internalName ?? '')),
  ...armorIdentityAliases(String(item.nameZh ?? '')),
  ...armorIdentityAliases(String(item.name ?? '')),
])

export const armorPieceName = (item: PublicArmorSetRelatedItem) => (
  (item as ArmorBuildDisplayItem).displayName || item.nameZh || item.name || '套装部件'
)

export const armorPieceRole = (item: PublicArmorSetRelatedItem) => {
  const value = String(item.partRole ?? item.slotType ?? '').trim()
  if (/head/i.test(value)) return '头部'
  if (/body|shirt|chest/i.test(value)) return '胸甲'
  if (/leg|legs|pants/i.test(value)) return '腿部'
  return '防具部件'
}

export const armorPieceRoleOrder = (role: string) => {
  if (role === '头部') return 0
  if (role === '胸甲') return 1
  if (role === '腿部') return 2
  return 3
}

export const armorDomIdFragment = (value: string) => normalizeEffectLine(value) || 'part'

const armorHeadVariantOrder = (item: PublicArmorSetRelatedItem) => {
  const text = `${item.nameZh ?? ''} ${item.name ?? ''} ${item.internalName ?? ''}`.toLowerCase()
  if (/头饰|headgear/.test(text)) return 0
  if (/面具|mask/.test(text)) return 1
  if (/头盔|helmet/.test(text)) return 2
  if (/兜帽|hood/.test(text)) return 3
  return 10
}

export const armorPieceDefense = (item: PublicArmorSetRelatedItem) => {
  const value = Number(item.defenseValue ?? item.defense_value)
  return Number.isFinite(value) ? value : null
}

export const armorPieceDefenseLabel = (item: PublicArmorSetRelatedItem) => {
  const value = armorPieceDefense(item)
  return value == null ? '' : `${value} 防御`
}

export const armorSetVariantIndex = (item: PublicArmorSetRelatedItem) => {
  const value = Number(item.setVariantIndex)
  return Number.isFinite(value) ? value : null
}

export const armorPartIndex = (item: PublicArmorSetRelatedItem) => {
  const value = Number(item.partIndex)
  return Number.isFinite(value) ? value : null
}

export const armorDefenseValueLabel = (values: number[]) => {
  const uniqueValues = [...new Set(values)].sort((left, right) => left - right)
  if (!uniqueValues.length) return ''
  if (uniqueValues.length === 1) return String(uniqueValues[0])
  return `${uniqueValues[0]}-${uniqueValues[uniqueValues.length - 1]}`
}

export const armorItemKey = (item: PublicArmorSetRelatedItem) => String(
  item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item),
).trim()

export const armorUniqueItemKey = (item: PublicArmorSetRelatedItem) => [
  armorPieceRole(item),
  armorItemKey(item),
].join(':')

const armorEquivalentItemKey = (item: PublicArmorSetRelatedItem) => normalizeMatchText(
  armorPieceName(item).replace(/^远古/, '').replace(/^Ancient\s*/i, ''),
)

const armorItemLooksAncient = (item: PublicArmorSetRelatedItem) => (
  /^远古/.test(armorPieceName(item)) || /^Ancient/i.test(String(item.name ?? item.internalName ?? ''))
)

export const effectSummaryLine = (effect: EquipmentEffectAttribute) => {
  if (String(effect.applyScope ?? '').trim() === 'item_bonus' && Number.isFinite(Number(effect.valueDecimal))) {
    const value = formatEffectValue(effect)
    const label = effectReadableStatName(effect)
    return `${value ? `${value} ` : ''}${label}`.trim()
  }

  const rawText = effectRawText(effect)
  if (rawText) return rawText

  const value = formatEffectValue(effect)
  const label = effectReadableStatName(effect)
  const description = playerEffectDescription(effect)
  if (description && description !== '套装效果' && description !== label) return `${description}${value ? `：${value}` : ''}`
  return `${value ? `${value} ` : ''}${label}`.trim()
}

export const mergeEffectLines = (effects: EquipmentEffectAttribute[]) => dedupeEffectLines(
  effects.map(effectSummaryLine),
)

const armorFixedBonusEntry = (effect: EquipmentEffectAttribute, index: number) => {
  const value = formatEffectValue(effect)
  const label = statName(effect)
  const statKey = String(effect.statKey ?? '')
  const description = String(effect.conditionText ?? '').trim()
  const isPlainAttribute = Boolean(value && statKey !== 'special_effect')
  const hasPlainDescription = Boolean(description && description !== label)

  return {
    key: `${normalizeEffectLine(effectSummaryLine(effect))}-${index}`,
    type: isPlainAttribute ? 'attribute' : 'description',
    value,
    label,
    text: isPlainAttribute ? label : effectSummaryLine(effect),
    description: isPlainAttribute && hasPlainDescription ? description : '',
  }
}

export const uniqueArmorItems = (items: PublicArmorSetRelatedItem[]) => {
  const seen = new Set<string>()
  const result: PublicArmorSetRelatedItem[] = []

  for (const item of items) {
    const key = armorUniqueItemKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

type ArmorSetBuildsDeps = {
  armorShownEffects: ComputedRef<EquipmentEffectAttribute[]>
  armorRelatedItems: ComputedRef<PublicArmorSetRelatedItem[]>
  armorBenefitLines: ComputedRef<string[]>
  armorPieceEquipmentEffectsByKey: Ref<Record<string, EquipmentEffectAttribute[]> | null | undefined>
  expandedArmorPartKeys: Ref<Set<string>>
  armorTitle: ComputedRef<string>
}

export function useArmorSetBuilds(deps: ArmorSetBuildsDeps) {
  const {
    armorShownEffects,
    armorRelatedItems,
    armorBenefitLines,
    armorPieceEquipmentEffectsByKey,
    expandedArmorPartKeys,
    armorTitle,
  } = deps

  const armorCurrentSetPrefersAncient = () => /^远古|^Ancient/i.test(armorTitle.value)

  const armorEquivalentDisplayName = (item: PublicArmorSetRelatedItem, candidates: PublicArmorSetRelatedItem[]) => {
    const sameEquivalentItems = candidates.filter((candidate) => (
      armorPieceRole(candidate) === armorPieceRole(item)
      && armorEquivalentItemKey(candidate) === armorEquivalentItemKey(item)
      && armorPieceDefense(candidate) === armorPieceDefense(item)
    ))
    if (sameEquivalentItems.length <= 1) return armorPieceName(item)

    const ancientItems = sameEquivalentItems.filter(armorItemLooksAncient)
    const normalItems = sameEquivalentItems.filter((candidate) => !armorItemLooksAncient(candidate))
    const orderedItems = armorCurrentSetPrefersAncient()
      ? [...ancientItems, ...normalItems]
      : [...normalItems, ...ancientItems]
    return dedupeEffectLines(orderedItems.map(armorPieceName)).join(' / ') || armorPieceName(item)
  }

  const statLinkedItem = (effect: EquipmentEffectAttribute) => {
    const haystack = normalizeMatchText([
      effect.rawText,
      effect.conditionText,
      effect.variantLabel,
    ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' '))

    if (!haystack) return null

    return armorRelatedItems.value.find((item) => {
      const image = String(item.image ?? '').trim()
      if (!image) return false

      return [
        item.nameZh,
        item.name,
        item.internalName,
      ]
        .map((value) => normalizeMatchText(String(value ?? '').trim()))
        .filter((value) => value.length >= 2)
        .some((name) => haystack.includes(name))
    }) ?? null
  }

  // Regression marker: 挖矿头盔和超亮头盔可以互换 stays visible as source evidence when maint variants are merged.

  const effectBelongsToItem = (effect: EquipmentEffectAttribute, item: PublicArmorSetRelatedItem) => {
    if (effectSourceKind(effect) !== 'piece') return false

    return effectMatchesItemIdentity(effect, item)
  }

  const effectMatchesItemIdentity = (effect: EquipmentEffectAttribute, item: PublicArmorSetRelatedItem) => {
    const itemNames = armorItemIdentityAliases(item)

    const variantLabel = effectVariantLabel(effect)
    if (variantLabel) {
      const effectVariantAliases = armorIdentityAliases(variantLabel)
      return effectVariantAliases.some((alias) => itemNames.includes(alias))
    }

    const linkedItem = statLinkedItem(effect)
    if (linkedItem) {
      const linkedKey = String(linkedItem.itemId ?? linkedItem.sourceId ?? linkedItem.internalName ?? armorPieceName(linkedItem)).trim()
      const itemKey = String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)).trim()
      return linkedKey === itemKey
    }

    const text = normalizeMatchText([
      effect.rawText,
      effect.conditionText,
      effect.variantLabel,
      effect.itemInternalName,
    ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' '))

    return [
      ...itemNames,
    ]
      .some((name) => text.includes(name))
  }

  const armorVariantLabels = (uniqueItems: PublicArmorSetRelatedItem[]) => dedupeEffectLines(armorShownEffects.value
    .map(effectVariantLabel)
    .filter(Boolean))
    .filter((label) => uniqueItems.some((item) => effectMatchesItemIdentity({ variantLabel: label } as EquipmentEffectAttribute, item)))

  const armorVariantRoles = (uniqueItems: PublicArmorSetRelatedItem[]) => {
    const roles = new Set<string>()
    for (const label of armorVariantLabels(uniqueItems)) {
      for (const item of uniqueItems) {
        if (effectMatchesItemIdentity({ variantLabel: label } as EquipmentEffectAttribute, item)) roles.add(armorPieceRole(item))
      }
    }
    for (const group of armorPieceGroups.value) {
      if (group.items.length > 1) roles.add(group.role)
    }
    return roles
  }

  const armorVariantBuildGroups = (uniqueItems: PublicArmorSetRelatedItem[], relatedItems: PublicArmorSetRelatedItem[] = uniqueItems): ArmorBuildGroup[] => {
    const explicitVariantGroups = armorExplicitVariantBuildGroups(relatedItems)
    if (explicitVariantGroups.length) return explicitVariantGroups

    const variantLabels = armorVariantLabels(uniqueItems)

    if (!variantLabels.length) {
      const variantGroups = armorPieceGroups.value
        .filter((group) => group.items.length > 1)
        .flatMap((group) => group.items.map((item) => ({
          key: String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)),
          title: armorPieceName(item),
          variantRole: group.role,
          variantItems: [item],
        })))
      if (variantGroups.length) return variantGroups
      return armorFullSetBuildGroup(uniqueItems)
    }

    return variantLabels.map((variantLabel) => {
      const variantItems = uniqueItems.filter((item) => effectMatchesItemIdentity({ variantLabel } as EquipmentEffectAttribute, item))
      const primaryItem = variantItems[0]

      return {
        key: normalizeMatchText(variantLabel),
        title: primaryItem ? armorPieceName(primaryItem) : variantLabel,
        variantRole: primaryItem ? armorPieceRole(primaryItem) : '可替换部件',
        variantItems,
      }
    }).filter((buildGroup) => buildGroup.variantItems.length)
  }

  const armorExplicitVariantBuildGroupKey = (items: PublicArmorSetRelatedItem[]) => items
    .slice()
    .sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)))
    .map((item) => [
      armorPieceRole(item),
      armorEquivalentItemKey(item),
      armorPieceDefense(item) ?? '',
    ].join(':'))
    .join('||')

  const armorRepresentativeEquivalentItem = (
    item: PublicArmorSetRelatedItem,
    candidates: PublicArmorSetRelatedItem[],
  ) => {
    const sameEquivalentItems = candidates.filter((candidate) => (
      armorPieceRole(candidate) === armorPieceRole(item)
      && armorEquivalentItemKey(candidate) === armorEquivalentItemKey(item)
      && armorPieceDefense(candidate) === armorPieceDefense(item)
    ))
    return sameEquivalentItems
      .slice()
      .sort((left, right) => {
        if (armorPieceRole(left) === '头部' && armorItemLooksAncient(left) !== armorItemLooksAncient(right)) {
          return armorCurrentSetPrefersAncient() === armorItemLooksAncient(left) ? -1 : 1
        }
        const leftEffectCount = armorBuildPieceEffectLines(left).length
        const rightEffectCount = armorBuildPieceEffectLines(right).length
        if (leftEffectCount !== rightEffectCount) return rightEffectCount - leftEffectCount
        if (armorItemLooksAncient(left) !== armorItemLooksAncient(right)) return armorItemLooksAncient(left) ? 1 : -1
        return armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN')
      })[0] ?? item
  }

  const armorMergeEquivalentBuildGroups = (buildGroups: ArmorBuildGroup[]) => {
    const allItems = buildGroups.flatMap((buildGroup) => buildGroup.variantItems)
    const groups = new Map<string, ArmorBuildGroup[]>()
    for (const buildGroup of buildGroups) {
      const key = armorExplicitVariantBuildGroupKey(buildGroup.variantItems)
      groups.set(key, [...(groups.get(key) ?? []), buildGroup])
    }

    return [...groups.values()].map((group) => {
      const primary = group[0]
      if (!primary || group.length === 1) return primary
      const variantItems = primary.variantItems.map((item) => {
        const representative = armorRepresentativeEquivalentItem(item, allItems)
        const displayName = armorPieceRole(item) === '头部'
          ? armorPieceName(representative)
          : armorEquivalentDisplayName(item, allItems)
        return {
          ...representative,
          displayName,
        } as ArmorBuildDisplayItem
      })
      const variantItem = variantItems.find((item) => armorPieceRole(item) === primary.variantRole) ?? variantItems[0]
      return {
        ...primary,
        key: `merged-${primary.key}`,
        title: `${variantItem ? armorPieceName(variantItem) : primary.title}（可互换）`,
        variantItems,
      }
    }).filter((group): group is ArmorBuildGroup => Boolean(group))
  }

  const armorExplicitVariantBuildGroups = (uniqueItems: PublicArmorSetRelatedItem[]): ArmorBuildGroup[] => {
    const buildGroups = createArmorSetBuildGroups(uniqueItems) as ArmorBuildGroup[]
    return buildGroups
  }

  const armorFullSetBuildGroup = (uniqueItems: PublicArmorSetRelatedItem[]) => [{
    key: 'default-full-set',
    title: '完整套装',
    variantRole: '套装',
    variantItems: uniqueItems,
  }]

  const armorLineIsSetBonusHeading = (line: string) => /^套装(?:奖励|效果)?[：:]/.test(line)

  const armorReadableSetBonusLine = (line: string) => (
    // Regression marker: set bonus text strips total parentheses because 最终汇总 owns totals.
    String(line ?? '').replace(/[（(]\s*(?:总计|总共)\s*[+\-−]?\d+(?:\.\d+)?\s*%?\s*[）)]/g, '').trim()
  )

  const armorComparableSetBonusLine = (line: string) => normalizeEffectLine(
    armorReadableSetBonusLine(line).replace(/^.*?套装(?:奖励|效果)?[：:]\s*/, ''),
  )

  const armorReadableSetBonusLines = (lines: string[]) => dedupeEffectLines(lines.map(armorReadableSetBonusLine))

  const armorPublicTrailingSetBonusLines = () => {
    // Regression marker: trailing public set bonus applies to every build instead of the final variant only.
    const lines = armorBenefitLines.value
    const lastVariantIndex = lines.reduce((lastIndex, line, index) => (
      armorLineStartsKnownVariant(line) ? index : lastIndex
    ), -1)
    if (lastVariantIndex < 0) return []
    return armorReadableSetBonusLines(lines.slice(lastVariantIndex + 1)
      .filter(armorLineIsSetBonusHeading)
      .filter((line) => !armorBenefitLineIsAttributeSummary(line)))
  }

  const armorBenefitVariantLines = (variantItems: PublicArmorSetRelatedItem[]) => {
    const lines = armorBenefitLines.value
    if (!lines.length || !variantItems.length) return []

    const variantMatches = variantItems
      .map((item) => ({
        item,
        aliases: armorItemIdentityAliases(item),
      }))
    const allVariantAliases = armorKnownVariantAliases.value
    const result: string[] = []
    let collecting = false

    for (const line of lines) {
      const normalizedLine = normalizeMatchText(line)
      const startsMatchedVariant = variantMatches.some((match) => match.aliases.some((alias) => normalizedLine.startsWith(alias)))
      const startsOtherVariant = !startsMatchedVariant && allVariantAliases.some((alias) => normalizedLine.startsWith(alias))

      if (startsMatchedVariant) {
        collecting = true
        const variantLine = line.replace(/^.*?[：:]\s*/, '').trim()
        if (variantLine) result.push(variantLine)
        continue
      }

      if (startsOtherVariant) {
        collecting = false
        continue
      }

      if (collecting) result.push(line)
    }

    return armorReadableSetBonusLines(result)
  }

  const armorKnownVariantAliases = computed(() => dedupeEffectLines([
    ...uniqueArmorItems(armorRelatedItems.value).flatMap(armorItemIdentityAliases),
    ...armorShownEffects.value.flatMap((effect) => armorIdentityAliases(effectVariantLabel(effect))),
  ].filter(Boolean)))

  const armorLineStartsKnownVariant = (line: string) => {
    const normalizedLine = normalizeMatchText(line)
    if (!normalizedLine) return false
    return armorKnownVariantAliases.value
      .some((alias) => normalizedLine.startsWith(alias))
  }

  const armorBenefitLinesWithoutVariantBlocks = () => {
    const result: string[] = []
    let skippingVariantBlock = false

    for (const line of armorBenefitLines.value) {
      const startsVariant = armorLineStartsKnownVariant(line)
      if (startsVariant) {
        skippingVariantBlock = true
        continue
      }

      if (skippingVariantBlock) {
        continue
      }

      skippingVariantBlock = false
      result.push(line)
    }

    return result
  }

  // Regression marker: 蜘蛛盔甲 keeps "套装奖励：+12% 召唤伤害" as readable text while dropping "总计 +25%" style suffixes.

  const armorDefaultBenefitSetBonusLines = () => armorBenefitLinesWithoutVariantBlocks()
    .filter((line) => !armorBenefitLineIsAttributeSummary(line))
    .map(armorReadableSetBonusLine)

  const armorCommonSetBonusLines = () => {
    const publicTrailingLines = armorPublicTrailingSetBonusLines()
    const effectLines = armorShownEffects.value
      .filter((effect) => {
        if (effectVariantLabel(effect)) return false
        if (armorCommonSetEffectBelongsToVariantBlock(effect)) return false
        if (armorEffectBelongsToPublicTrailingSetBonus(effect, publicTrailingLines)) return false
        if (effectSourceKind(effect) === 'set') return true
        return false
      })
      .filter((effect) => {
        const value = armorEffectNumericValue(effect)
        const statKey = armorEffectTotalStatKey(effect)
        return value == null || !statKey || statKey === 'special_effect'
      })
    return dedupeEffectLines([
      ...armorDefaultBenefitSetBonusLines(),
      ...publicTrailingLines,
      ...mergeEffectLines(effectLines),
    ].map(armorReadableSetBonusLine))
  }

  const armorEffectBelongsToPublicTrailingSetBonus = (effect: EquipmentEffectAttribute, publicTrailingLines: string[]) => {
    const normalizedEffectLine = armorComparableSetBonusLine(effectSummaryLine(effect))
    if (!normalizedEffectLine) return false
    return publicTrailingLines.some((line) => {
      const normalizedLine = armorComparableSetBonusLine(line)
      return normalizedLine === normalizedEffectLine
        || normalizedLine.includes(normalizedEffectLine)
        || normalizedEffectLine.includes(normalizedLine)
    })
  }

  const armorCommonSetEffectBelongsToVariantBlock = (effect: EquipmentEffectAttribute) => {
    // Regression marker: Spectre Hood healing bonus stays out of Spectre Mask bonus text.
    if (effectSourceKind(effect) !== 'set') return false
    if (armorLineStartsKnownVariant(effectSummaryLine(effect))) return true
    const normalizedEffectLine = armorComparableSetBonusLine(effectSummaryLine(effect))
    if (!normalizedEffectLine) return false
    return uniqueArmorItems(armorRelatedItems.value)
      .some((item) => armorBenefitVariantLines([item])
        .some((line) => {
          const normalizedLine = armorComparableSetBonusLine(line)
          return normalizedLine === normalizedEffectLine
            || normalizedLine.includes(normalizedEffectLine)
            || normalizedEffectLine.includes(normalizedLine)
        }))
  }

  const armorBuildSetBonusLines = (variantItems: PublicArmorSetRelatedItem[]) => armorReadableSetBonusLines([
    ...armorCommonSetBonusLines(),
    ...armorBenefitVariantLines(variantItems)
      .filter((line) => !armorBenefitLineIsAttributeSummary(line)),
  ])

  const armorShownSetBonusLines = (variantItems: PublicArmorSetRelatedItem[]) => armorReadableSetBonusLines([
    ...armorCommonSetBonusLines(),
    // Regression marker: numeric set bonus remains readable in 套装效果 after contributing to 最终汇总.
    ...armorBenefitVariantLines(variantItems)
      .filter((line) => armorLineIsSetBonusHeading(line) || !armorBenefitLineIsAttributeSummary(line)),
  ])

  const armorBuildVariantSetBonusEffects = (variantItems: PublicArmorSetRelatedItem[]) => {
    const variantAttributeLines = armorBenefitVariantLines(variantItems)
      .filter((line) => armorLineIsSetBonusHeading(line))
      .flatMap(armorEffectLinesFromLine)
    if (!variantAttributeLines.length) return []

    return variantAttributeLines.map((line) => ({
      ...armorEffectFromLine(line),
      applyScope: 'set_bonus',
      rawText: line,
    } as EquipmentEffectAttribute))
  }

  const armorSetEffectBelongsToVariantBlock = (effect: EquipmentEffectAttribute) => {
    if (effectSourceKind(effect) !== 'set') return false
    const normalizedEffectLine = armorComparableSetBonusLine(effectSummaryLine(effect))
    if (!normalizedEffectLine) return false
    return armorBenefitVariantLines(uniqueArmorItems(armorRelatedItems.value))
      .some((line) => {
        const normalizedLine = armorComparableSetBonusLine(line)
        return normalizedLine === normalizedEffectLine
          || normalizedLine.includes(normalizedEffectLine)
          || normalizedEffectLine.includes(normalizedLine)
      })
  }

  const armorDefaultBuildSetBonusLines = (buildItems: PublicArmorSetRelatedItem[]) => {
    const pieceEffectLines = mergeEffectLines(armorShownEffects.value
      .filter((effect) => {
        if (effectVariantLabel(effect)) return false
        if (effectSourceKind(effect) === 'piece') return buildItems.some((item) => effectBelongsToItem(effect, item))
        return false
      })
      .filter((effect) => {
        const value = armorEffectNumericValue(effect)
        const statKey = armorEffectTotalStatKey(effect)
        return value == null || !statKey || statKey === 'special_effect'
      }))
    return dedupeEffectLines([
      ...armorCommonSetBonusLines(),
      ...pieceEffectLines,
    ])
  }

  const armorVariantBenefitLineKeys = computed(() => {
    const keys = new Set<string>()
    for (const item of uniqueArmorItems(armorRelatedItems.value)) {
      for (const line of armorBenefitVariantLines([item])) {
        keys.add(normalizeEffectLine(line))
      }
    }
    return keys
  })

  const armorLineBelongsToVariantBenefit = (line: string) => {
    const normalizedLine = normalizeEffectLine(line)
    if (!normalizedLine) return false
    return [...armorVariantBenefitLineKeys.value].some((variantLine) => (
      variantLine === normalizedLine
      || variantLine.includes(normalizedLine)
      || normalizedLine.includes(variantLine)
    ))
  }

  const armorBuildVariantStats = (buildGroup: { variantItems: PublicArmorSetRelatedItem[] }) => {
    const structuredLines = mergeEffectLines(armorShownEffects.value.filter((effect) => {
      const variantLabel = effectVariantLabel(effect)
      return variantLabel && buildGroup.variantItems.some((variantItem) => effectBelongsToItem(effect, variantItem))
    }))
    const benefitLines = armorBenefitVariantLines(buildGroup.variantItems)
      .filter((line) => armorBenefitLineIsAttributeSummary(line))
    return dedupeEffectLines([...structuredLines, ...benefitLines])
  }

  const armorBuildVariantEffectGroups = (lines: string[]) => {
    const entries = lines
      .map((line, index) => armorFixedBonusEntry(armorEffectFromLine(line), index))
      .filter((entry) => entry.text)
    const attributeEntries = entries.filter((entry) => entry.type === 'attribute')
    const descriptionEntries = entries.filter((entry) => entry.type === 'description')

    return [
      { key: 'attribute', label: '属性加成', tone: 'is-attribute', entries: attributeEntries },
      { key: 'description', label: '效果说明', tone: 'is-description', entries: descriptionEntries },
    ].filter((group) => group.entries.length)
  }

  const armorLineLooksLikeLeadingPieceAttribute = (line: string) => (
    /^\s*[+\-−]?\d+(?:\.\d+)?\s*%?\s*[^，、；;（）()]*/.test(line)
    && !/套装|奖励|效果|增益|提供|触发|获得|免疫|闪避|不受|击中|每级|最高|降低/.test(line)
  )

  const armorLeadingAttributeLines = () => {
    const result: string[] = []
    for (const line of armorBenefitLines.value) {
      if (!armorLineLooksLikeLeadingPieceAttribute(line)) break
      result.push(line)
    }
    return result
  }

  const armorBenefitNamedPieceEffectLines = (item: PublicArmorSetRelatedItem) => {
    const itemAliases = armorItemIdentityAliases(item)
    const result: string[] = []

    for (const line of armorBenefitLines.value) {
      const normalizedLine = normalizeMatchText(line)
      const matchedAlias = itemAliases.find((alias) => normalizedLine.startsWith(alias))
      if (!matchedAlias) continue

      const lineWithoutName = line.replace(/^.*?[：:]\s*/, '').trim()
      for (const segment of lineWithoutName.split(/[、，；;]/).map((entry) => entry.trim()).filter(Boolean)) {
        result.push(segment)
      }
    }

    return dedupeEffectLines(result)
  }

  const armorCompactPieceEffectLines = (lines: string[]) => {
    const dedupedLines = dedupeEffectLines(lines)
    const critGroups = new Map<string, string[]>()
    for (const line of dedupedLines) {
      const match = line.match(/^\s*([+\-−]?\d+(?:\.\d+)?\s*%?)\s*(近战|远程|魔法)?暴击率\s*$/)
      if (!match) continue
      const value = normalizeEffectLine(match[1] ?? '')
      if (!value) continue
      critGroups.set(value, [...(critGroups.get(value) ?? []), line])
    }

    const dropLines = new Set<string>()
    const addLines: string[] = []
    for (const linesForValue of critGroups.values()) {
      const specificLines = linesForValue.filter((line) => /近战|远程|魔法/.test(line))
      const genericLines = linesForValue.filter((line) => !/近战|远程|魔法/.test(line))
      if (specificLines.length >= 3) {
        for (const line of linesForValue) dropLines.add(line)
        const fallbackLine = specificLines[0]
        if (fallbackLine) addLines.push(genericLines[0] ?? fallbackLine.replace(/(近战|远程|魔法)/, ''))
        continue
      }
      if (specificLines.length && genericLines.length) {
        for (const line of genericLines) dropLines.add(line)
      }
    }

    return dedupeEffectLines([
      ...dedupedLines.filter((line) => !dropLines.has(line)),
      ...addLines,
    ])
  }

  const armorCompactPieceEffectEntries = (lines: string[]) => {
    // Regression marker: four class damage lines collapse to generic damage only when all source lines exist.
    const dedupedLines = armorCompactPieceEffectLines(lines)
    const damageGroups = new Map<string, string[]>()
    const entry = (text: string, title = '') => ({
      key: `${normalizeEffectLine(text)}-${normalizeEffectLine(title)}`,
      text,
      title,
    })

    for (const line of dedupedLines) {
      const match = line.match(/^\s*([+\-−]?\d+(?:\.\d+)?\s*%?)\s*(近战|远程|魔法|召唤)伤害\s*$/)
      if (!match) continue
      const value = normalizeEffectLine(match[1] ?? '')
      if (!value) continue
      damageGroups.set(value, [...(damageGroups.get(value) ?? []), line])
    }

    const dropLines = new Set<string>()
    const addEntries: ReturnType<typeof entry>[] = []

    for (const linesForValue of damageGroups.values()) {
      const specificLines = linesForValue.filter((line) => /近战|远程|魔法|召唤/.test(line))
      if (specificLines.length !== 4) continue
      for (const line of linesForValue) dropLines.add(line)
      const genericLine = specificLines[0]?.replace(/(近战|远程|魔法|召唤)伤害/, '伤害')
      if (!genericLine) continue
      addEntries.push(entry(genericLine, specificLines.join(' · ')))
    }

    return [
      ...dedupedLines
        .filter((line) => !dropLines.has(line))
        .map((text) => entry(text)),
      ...addEntries,
    ]
  }

  const armorFallbackLeadingFixedPieceEffectLines = (item: PublicArmorSetRelatedItem) => {
    if (armorHasVariantBuilds.value) return []
    const uniqueItems = uniqueArmorItems(armorRelatedItems.value)
      .sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)))
    if (uniqueItems.length !== 3) return []
    const itemIndex = uniqueItems.findIndex((candidate) => (
      armorItemKey(candidate) === armorItemKey(item)
    ))
    if (itemIndex < 0) return []

    const lines = armorLeadingAttributeLines()
    if (lines.length < uniqueItems.length) return []
    if (itemIndex === 0) return lines.slice(0, 1)
    if (itemIndex === uniqueItems.length - 1) return lines.slice(-1)
    return lines.slice(1, -1)
  }

  const armorBuildPieceEffectLines = (item: PublicArmorSetRelatedItem) => {
    const itemEffectLines = mergeEffectLines(
      armorPieceEquipmentEffectsByKey.value?.[armorUniqueItemKey(item)] ?? [],
    )
    const linkedLines = mergeEffectLines(
      armorShownEffects.value.filter((effect) => effectSourceKind(effect) === 'piece' && effectBelongsToItem(effect, item)),
    )
    return armorCompactPieceEffectLines([
      ...itemEffectLines,
      ...linkedLines,
      ...armorBenefitNamedPieceEffectLines(item),
      ...armorFallbackLeadingFixedPieceEffectLines(item),
    ])
  }

  // armor-build-piece-summary-joined-names: collapsed groups show names like "神圣兜帽 / 远古神圣兜帽".

  const armorPartSummaryName = (items: PublicArmorSetRelatedItem[]) => dedupeEffectLines(items.map(armorPieceName)).join(' / ')

  // armor-build-piece-summary-numeric-tooltip: hover/focus text is derived from real piece values only.

  const armorPartSummaryTooltip = (items: Array<{
    name: string
    defense: string
    effects: ReturnType<typeof armorCompactPieceEffectEntries>
  }>) => items
    .map((item) => [
      item.name,
      item.defense,
      item.effects.map((effect) => effect.title ? `${effect.text}（${effect.title}）` : effect.text).join('，'),
    ].filter(Boolean).join('：'))
    .filter(Boolean)
    .join('；')

  const armorEffectNumericValue = (effect: EquipmentEffectAttribute) => {
    const value = Number(effect.valueDecimal)
    if (Number.isFinite(value)) return value
    const rawText = effectRawText(effect)
    if (!armorLineLooksLikePlainAttribute(rawText) && !armorLineLooksLikeNumericSetAttribute(rawText)) return null
    const match = armorEffectLineNumericMatch(rawText)
    const rawValue = Number(match?.[1]?.replace('−', '-') ?? '')
    return Number.isFinite(rawValue) ? rawValue : null
  }

  const armorEffectTotalSignedValue = (effect: EquipmentEffectAttribute) => {
    const value = armorEffectNumericValue(effect)
    if (value == null) return null
    const rawText = effectRawText(effect)
    const statKey = armorEffectTotalStatKey(effect)
    return statKey === 'mana_cost' && /(?:降低|减少|减免)/.test(rawText) && !/^\s*[-−]/.test(rawText)
      ? -Math.abs(value)
      : value
  }

  const armorEffectTotalStatKey = (effect: EquipmentEffectAttribute) => {
    const statKey = String(effect.statKey ?? '')
    if (statKey && statKey !== 'special_effect') return statKey
    const rawText = effectRawText(effect)
    return (armorLineLooksLikePlainAttribute(rawText) || armorLineLooksLikeNumericSetAttribute(rawText))
      ? fallbackStatKey(rawText)
      : statKey
  }

  const armorEffectTotalLabel = (effect: EquipmentEffectAttribute) => {
    const rawText = effectRawText(effect)
    const statKey = armorEffectTotalStatKey(effect)
    const rawLabel = rawText
      .replace(/^.*?套装(?:奖励|效果)?[：:]\s*/, '')
      .replace(/(?:降低|减少|减免|增加|提高)\s*[+\-−]?\d+(?:\.\d+)?\s*%?\s*/, '')
      .replace(/^[+\-−]?\d+(?:\.\d+)?\s*%?\s*/, '')
      .replace(/[+\-−]?\d+(?:\.\d+)?\s*%?\s*/, '')
      .replace(/(?:降低|减少|减免|增加|提高|的几率不消耗|减少)/g, '')
      .replace(/[（(].*?[）)]/g, '')
      .trim()
    if (statKey === 'ammo_conservation' && /弹药|ammo/i.test(rawText)) return statLabels.ammo_conservation ?? '弹药节省'
    if (statKey === 'mana_cost' && /魔力|魔耗|mana/i.test(rawText)) return statLabels.mana_cost ?? '魔耗'
    if (statKey === 'sentry_capacity' && /哨兵|sentry/i.test(rawText)) return statLabels.sentry_capacity ?? '哨兵'
    if (statKey === 'minion_capacity' && /仆从|minion/i.test(rawText)) return statLabels.minion_capacity ?? '仆从'
    return rawLabel || statName(effect) || '未归类'
  }

  const armorCombinedBuildTotals = (buildItems: PublicArmorSetRelatedItem[], variantItems: PublicArmorSetRelatedItem[]): ArmorBuildTotalEntry[] => {
    const relevantEffects = armorShownEffects.value.filter((effect) => {
      const variantLabel = effectVariantLabel(effect)
      if (variantLabel) return variantItems.some((item) => effectBelongsToItem(effect, item))
      if (effectSourceKind(effect) === 'set') return true
      return buildItems.some((item) => effectBelongsToItem(effect, item))
    })
    const totals = new Map<string, { key: string, statKey: string, label: string, unit: string | null | undefined, value: number }>()

    for (const effect of relevantEffects) {
      const value = armorEffectTotalSignedValue(effect)
      if (value == null) continue
      const statKey = armorEffectTotalStatKey(effect)
      if (!statKey || statKey === 'special_effect') continue
      const unit = effect.unit
      const label = armorEffectTotalLabel(effect)
      const key = `${statKey}:${unit ?? ''}:${normalizeEffectLine(label)}`
      const current = totals.get(key)
      totals.set(key, {
        key,
        statKey,
        label,
        unit,
        value: (current?.value ?? 0) + value,
      })
    }

    return [...totals.values()]
      .filter((entry) => entry.value !== 0)
      .map((entry) => ({
        key: entry.key,
        statKey: entry.statKey,
        label: entry.label,
        value: formatArmorTotalValue(entry.value, entry.unit),
        rawValue: entry.value,
      }))
  }

  const armorBuildTotalValueLabel = (values: number[], unit: string | null | undefined) => {
    const uniqueValues = [...new Set(values)].sort((left, right) => left - right)
    if (!uniqueValues.length) return ''
    const minValue = uniqueValues[0]
    const maxValue = uniqueValues[uniqueValues.length - 1]
    if (minValue == null || maxValue == null) return ''
    if (minValue === maxValue) return formatArmorTotalValue(minValue, unit)
    return `${formatArmorTotalValue(minValue, unit)} - ${formatArmorTotalValue(maxValue, unit)}`
  }

  const armorBuildEffectTotalsForItems = (items: PublicArmorSetRelatedItem[], options: { includeSetEffects?: boolean } = {}) => {
    const includeSetEffects = options.includeSetEffects !== false
    const relevantEffects = armorShownEffects.value.filter((effect) => {
      const variantLabel = effectVariantLabel(effect)
      if (variantLabel) return items.some((item) => effectBelongsToItem(effect, item))
      if (effectSourceKind(effect) === 'set') return includeSetEffects && !armorSetEffectBelongsToVariantBlock(effect)
      return items.some((item) => effectBelongsToItem(effect, item))
    })
    const totals = new Map<string, {
      key: string
      statKey: string
      label: string
      unit: string | null | undefined
      value: number
    }>()

    for (const effect of relevantEffects) {
      const value = armorEffectTotalSignedValue(effect)
      if (value == null) continue
      const statKey = armorEffectTotalStatKey(effect)
      if (!statKey || statKey === 'special_effect') continue
      const unit = effect.unit
      const label = armorEffectTotalLabel(effect)
      const key = `${statKey}:${unit ?? ''}:${normalizeEffectLine(label)}`
      const current = totals.get(key)
      totals.set(key, {
        key,
        statKey,
        label,
        unit,
        value: (current?.value ?? 0) + value,
      })
    }

    return totals
  }

  const armorBuildEffectTotalsFromEffects = (effects: EquipmentEffectAttribute[]) => {
    const totals = new Map<string, {
      key: string
      statKey: string
      label: string
      unit: string | null | undefined
      value: number
    }>()

    for (const effect of effects) {
      const value = armorEffectTotalSignedValue(effect)
      if (value == null) continue
      const statKey = armorEffectTotalStatKey(effect)
      if (!statKey || statKey === 'special_effect') continue
      const unit = effect.unit
      const label = armorEffectTotalLabel(effect)
      const key = `${statKey}:${unit ?? ''}:${normalizeEffectLine(label)}`
      const current = totals.get(key)
      totals.set(key, {
        key,
        statKey,
        label,
        unit,
        value: (current?.value ?? 0) + value,
      })
    }

    return totals
  }

  const armorBuildAddTotalsFromEntries = (
    target: ArmorBuildTotalEntry[],
    source: Map<string, {
      key: string
      statKey: string
      label: string
      unit: string | null | undefined
      value: number
    }>,
  ) => {
    for (const total of source.values()) {
      const current = target.find((entry) => entry.key === total.key)
      if (current) {
        const rawValue = current.rawValue + total.value
        current.rawValue = rawValue
        current.value = formatArmorTotalValue(rawValue, total.unit)
        continue
      }
      target.push({
        key: total.key,
        statKey: total.statKey,
        label: total.label,
        value: formatArmorTotalValue(total.value, total.unit),
        rawValue: total.value,
      })
    }
  }

  const armorBuildAddTotals = (
    target: Map<string, {
      key: string
      statKey: string
      label: string
      unit: string | null | undefined
      min: number
      max: number
    }>,
    source: Map<string, {
      key: string
      statKey: string
      label: string
      unit: string | null | undefined
      value: number
    }>,
  ) => {
    for (const total of source.values()) {
      const current = target.get(total.key)
      target.set(total.key, {
        key: total.key,
        statKey: total.statKey,
        label: total.label,
        unit: total.unit,
        min: (current?.min ?? 0) + total.value,
        max: (current?.max ?? 0) + total.value,
      })
    }
  }

  const armorBuildPartGroupTotalEntries = (
    buildItems: PublicArmorSetRelatedItem[],
    partGroups: ArmorBuildPartGroup[] | undefined,
  ) => {
    if (!partGroups?.length) return armorCombinedBuildTotals(buildItems, buildItems)

    const alternativeKeys = new Set(partGroups
      .flatMap((part) => part.alternatives)
      .map(armorUniqueItemKey))
    const fixedItems = buildItems.filter((item) => !alternativeKeys.has(armorUniqueItemKey(item)))
    const slotGroups = partGroups
      .map((part) => uniqueArmorItems(part.alternatives))
      .filter((alternatives) => alternatives.length)
    if (!slotGroups.length) return armorCombinedBuildTotals(buildItems, buildItems)

    const aggregate = new Map<string, {
      key: string
      statKey: string
      label: string
      unit: string | null | undefined
      min: number
      max: number
    }>()

    armorBuildAddTotals(aggregate, armorBuildEffectTotalsForItems(fixedItems, { includeSetEffects: true }))

    for (const alternatives of slotGroups) {
      const slotAggregate = new Map<string, {
        key: string
        statKey: string
        label: string
        unit: string | null | undefined
        values: number[]
      }>()
      for (const item of alternatives) {
        for (const total of armorBuildEffectTotalsForItems([item], { includeSetEffects: false }).values()) {
          const current = slotAggregate.get(total.key)
          slotAggregate.set(total.key, {
            key: total.key,
            statKey: total.statKey,
            label: total.label,
            unit: total.unit,
            values: [...(current?.values ?? []), total.value],
          })
        }
      }
      for (const total of slotAggregate.values()) {
        const current = aggregate.get(total.key)
        const uniqueValues = [...new Set(total.values)].sort((left, right) => left - right)
        const minValue = uniqueValues[0] ?? 0
        const maxValue = uniqueValues[uniqueValues.length - 1] ?? 0
        aggregate.set(total.key, {
          key: total.key,
          statKey: total.statKey,
          label: total.label,
          unit: total.unit,
          min: (current?.min ?? 0) + minValue,
          max: (current?.max ?? 0) + maxValue,
        })
      }
    }

    return [...aggregate.values()]
      .map((entry) => {
        const values = entry.min === entry.max ? [entry.min] : [entry.min, entry.max]
        return {
          key: entry.key,
          statKey: entry.statKey,
          label: entry.label,
          value: armorBuildTotalValueLabel(values, entry.unit),
          rawValue: entry.max,
          isVariable: entry.min !== entry.max,
        }
      })
      .filter((entry) => entry.rawValue !== 0 || entry.value !== formatArmorTotalValue(0, null))
  }

  const armorBuildSlotTotalEntries = (
    buildItems: PublicArmorSetRelatedItem[],
    partGroups: ArmorBuildPartGroup[] | undefined,
  ) => armorBuildPartGroupTotalEntries(buildItems, partGroups)

  const formatArmorTotalValueLikeEntry = (value: number, entry: ArmorBuildTotalEntry) => (
    /%/.test(entry.value) ? formatArmorTotalValue(value, 'percent') : formatArmorTotalValue(value, null)
  )

  const armorBuildMergeGenericCombatTotals = (entries: ArmorBuildTotalEntry[]) => {
    // Regression marker: generic damage/crit folds into variant class totals for wiki-style final summaries.
    const result = [...entries]
    const mergeForStat = (statKey: string, genericPattern: RegExp, specificPattern: RegExp) => {
      const genericIndex = result.findIndex((entry) => entry.statKey === statKey && genericPattern.test(entry.label))
      if (genericIndex < 0) return
      const specificIndexes = result
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.statKey === statKey && specificPattern.test(entry.label))
        .map(({ index }) => index)
      if (specificIndexes.length !== 1) return
      const specificIndex = specificIndexes[0]
      if (specificIndex == null) return
      const genericEntry = result[genericIndex]
      const specificEntry = result[specificIndex]
      if (!genericEntry || !specificEntry || genericIndex === specificIndex) return
      const rawValue = specificEntry.rawValue + genericEntry.rawValue
      result[specificIndex] = {
        ...specificEntry,
        value: formatArmorTotalValueLikeEntry(rawValue, specificEntry),
        rawValue,
        isVariable: specificEntry.isVariable || genericEntry.isVariable,
      }
      result.splice(genericIndex, 1)
    }

    mergeForStat('damage_bonus', /^伤害(?:加成)?$/, /(?:近战|远程|魔法|召唤).*伤害/)
    mergeForStat('crit_chance', /^暴击(?:率)?$/, /(?:近战|远程|魔法|召唤).*暴击/)
    return result
  }

  const armorBuildTotalEntries = (
    buildItems: PublicArmorSetRelatedItem[],
    partGroups: ArmorBuildPartGroup[] | undefined,
    defense: ReturnType<typeof armorBuildDefenseSummary>,
    variantItems: PublicArmorSetRelatedItem[] = buildItems,
  ) => {
    const combinedEntries = armorBuildSlotTotalEntries(buildItems, partGroups)
    const variantSetTotals = armorBuildEffectTotalsFromEffects(armorBuildVariantSetBonusEffects(variantItems))
    armorBuildAddTotalsFromEntries(combinedEntries, variantSetTotals)
    const totalEntries = armorBuildMergeGenericCombatTotals(combinedEntries.filter((entry) => entry.statKey !== 'defense'))
    const defenseBonus = combinedEntries
      .filter((entry) => entry.statKey === 'defense')
      .reduce((sum, entry) => sum + entry.rawValue, 0)
    const pieceDefenseTotal = armorBuildDefenseTotalValue(defense.total)
    if (pieceDefenseTotal) {
      const finalDefenseTotal = armorAddDefenseBonusToValue(pieceDefenseTotal, defenseBonus)
      totalEntries.unshift({
        key: 'defense:flat:total',
        statKey: 'defense',
        label: '防御',
        value: finalDefenseTotal.label,
        rawValue: finalDefenseTotal.rawValue,
        isVariable: finalDefenseTotal.values.length > 1 || totalEntries.some((entry) => entry.isVariable),
      })
    }
    return totalEntries
  }

  const armorBuildDefenseTotalValue = (value: string | null) => {
    const rawValue = String(value ?? '').trim()
    if (!rawValue) return null
    const values = rawValue.split('-').map((entry) => Number(entry.trim())).filter(Number.isFinite)
    if (!values.length) return null
    return {
      values,
      rawValue: values[values.length - 1] ?? 0,
    }
  }

  const armorAddDefenseBonusToValue = (
    defense: { values: number[], rawValue: number },
    bonus: number,
  ) => {
    const values = defense.values.map((entry) => entry + bonus)
    return {
      values,
      label: armorDefenseValueLabel(values),
      rawValue: defense.rawValue + bonus,
    }
  }

  const armorFixedEffects = (uniqueItems: PublicArmorSetRelatedItem[], variantRoles: Set<string>) => {
    const fixedItems = uniqueItems.filter((item) => !variantRoles.has(armorPieceRole(item)))
    return armorShownEffects.value.filter((effect) => {
      if (effectSourceKind(effect) === 'set') return false
      if (effectVariantLabel(effect)) return false
      return fixedItems.some((item) => effectBelongsToItem(effect, item))
    })
  }

  const armorFixedBonusLines = computed(() => {
    const uniqueItems = uniqueArmorItems(armorRelatedItems.value)
    const fixedEffects = armorFixedEffects(uniqueItems, armorVariantRoles(uniqueItems))
    return mergeEffectLines(fixedEffects)
      .filter((line) => !armorLineBelongsToVariantBenefit(line))
  })

  const armorFixedBonusGroups = computed(() => {
    const uniqueItems = uniqueArmorItems(armorRelatedItems.value)
    const fixedEffects = armorFixedEffects(uniqueItems, armorVariantRoles(uniqueItems))
    const entries = fixedEffects
      .map(armorFixedBonusEntry)
      .filter((entry) => entry.text)
      .filter((entry) => !armorLineBelongsToVariantBenefit(entry.text))
    const seen = new Set<string>()
    const uniqueEntries = entries.filter((entry) => {
      const key = normalizeEffectLine(`${entry.type}-${entry.value}-${entry.text}-${entry.description}`)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    const attributeEntries = uniqueEntries.filter((entry) => entry.type === 'attribute')
    const descriptionEntries = uniqueEntries.filter((entry) => entry.type === 'description')

    return [
      { key: 'attribute', label: '属性加成', tone: 'is-attribute', entries: attributeEntries },
      { key: 'description', label: '效果说明', tone: 'is-description', entries: descriptionEntries },
    ].filter((group) => group.entries.length)
  })

  const armorHasVariantBuilds = computed(() => {
    return armorSetBuildCards.value.length > 1
  })

  const armorBuildDefenseSummary = (buildItems: PublicArmorSetRelatedItem[]) => {
    const groups = new Map<string, number[]>()

    for (const item of buildItems) {
      const value = armorPieceDefense(item)
      if (value == null) continue
      const role = armorPieceRole(item)
      groups.set(role, [...(groups.get(role) ?? []), value])
    }

    const armorDefenseRoleGroups = [...groups.entries()]
      .map(([role, values]) => {
        const uniqueValues = [...new Set(values)].sort((left, right) => left - right)
        const min = uniqueValues[0]
        const max = uniqueValues[uniqueValues.length - 1]
        if (min == null || max == null) return null
        return {
          key: role,
          role,
          min,
          max,
          label: armorDefenseValueLabel(uniqueValues),
        }
      })
      .filter((part): part is { key: string, role: string, min: number, max: number, label: string } => Boolean(part?.label))
      .sort((left, right) => armorPieceRoleOrder(left.role) - armorPieceRoleOrder(right.role))
    const minTotal = armorDefenseRoleGroups.reduce((sum, part) => sum + part.min, 0)
    const maxTotal = armorDefenseRoleGroups.reduce((sum, part) => sum + part.max, 0)
    const total = armorDefenseValueLabel(minTotal === maxTotal ? [minTotal] : [minTotal, maxTotal])
    return {
      total: armorDefenseRoleGroups.length ? total : null,
      parts: armorDefenseRoleGroups,
      formula: armorDefenseRoleGroups.map((part) => part.label).join(' + '),
    }
  }

  const armorBuildDefenseSummaryFromPartGroups = (partGroups: ArmorBuildPartGroup[] | undefined, fallbackItems: PublicArmorSetRelatedItem[]) => {
    if (!partGroups?.length) return armorBuildDefenseSummary(fallbackItems)
    return armorBuildDefenseSummary(partGroups.flatMap((part) => part.alternatives))
  }

  const armorSetBuildCards = computed(() => {
    const relatedItems = armorRelatedItems.value
    const uniqueItems = uniqueArmorItems(relatedItems)
      .sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))

    return armorVariantBuildGroups(uniqueItems, relatedItems).map((buildGroup) => {
      const variantRoles = new Set(buildGroup.variantItems.map(armorPieceRole))
      const items = [
        ...(buildGroup.displayItems ?? buildGroup.variantItems),
        ...uniqueItems.filter((item) => !variantRoles.has(armorPieceRole(item))),
      ].sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))
      const stats = armorBuildVariantStats(buildGroup)
      const bonusLines = buildGroup.key === 'default-full-set'
        ? armorDefaultBuildSetBonusLines(items)
        : armorShownSetBonusLines(buildGroup.variantItems)
      const defense = armorBuildDefenseSummaryFromPartGroups(buildGroup.partGroups, items)
      return {
        key: buildGroup.key,
        title: buildGroup.title,
        variantRole: buildGroup.variantRole,
        items,
        pieceEvidence: items.map((item) => ({
          key: String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)),
          item,
          name: armorPieceName(item),
          role: armorPieceRole(item),
          defense: armorPieceDefenseLabel(item),
        effects: armorCompactPieceEffectEntries(armorBuildPieceEffectLines(item)),
        })),
        partGroups: (buildGroup.partGroups ?? items.map((item) => ({
          key: armorUniqueItemKey(item),
          partIndex: armorPartIndex(item),
          role: armorPieceRole(item),
          item,
          alternatives: [item],
        }))).map((part) => ({
          key: part.key,
          role: part.role,
          expanded: expandedArmorPartKeys.value.has(`${buildGroup.key}-${part.key}`),
          summary: armorPartSummaryName(part.alternatives),
          tooltipId: `armor-part-summary-tooltip-${armorDomIdFragment(buildGroup.key)}-${armorDomIdFragment(part.key)}`,
          alternatives: part.alternatives.map((item) => ({
            key: String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)),
            item,
            name: armorPieceName(item),
            defense: armorPieceDefenseLabel(item),
            effects: armorCompactPieceEffectEntries(armorBuildPieceEffectLines(item)),
          })),
          tooltip: armorPartSummaryTooltip(part.alternatives.map((item) => ({
            name: armorPieceName(item),
            defense: armorPieceDefenseLabel(item),
            effects: armorCompactPieceEffectEntries(armorBuildPieceEffectLines(item)),
          }))),
        })),
        defense,
        stats,
        statGroups: armorBuildVariantEffectGroups(stats),
        totalEntries: armorBuildTotalEntries(items, buildGroup.partGroups, defense, buildGroup.variantItems),
        bonusLines,
      }
    })
  })

  const armorPieceGroups = computed(() => {
    const groups = new Map<string, PublicArmorSetRelatedItem[]>()
    const seen = new Set<string>()

    for (const item of armorRelatedItems.value) {
      const role = armorPieceRole(item)
      const itemKey = String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)).trim()
      const uniqueKey = `${role}:${itemKey}`
      if (seen.has(uniqueKey)) continue
      seen.add(uniqueKey)
      groups.set(role, [...(groups.get(role) ?? []), item])
    }

    return [...groups.entries()]
      .map(([role, items]) => ({ role, items }))
      .sort((left, right) => armorPieceRoleOrder(left.role) - armorPieceRoleOrder(right.role))
  })

  return {
    statLinkedItem,
    armorPieceGroups,
    armorFixedBonusLines,
    armorFixedBonusGroups,
    armorHasVariantBuilds,
    armorSetBuildCards,
  }
}
