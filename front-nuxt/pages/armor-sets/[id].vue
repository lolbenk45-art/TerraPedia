<script setup lang="ts">
import { usePublicArmorSetDetail } from '~/composables/usePublicArmorSetDetail'
import type { EquipmentEffectAttribute, PublicArmorSetListItem, PublicArmorSetRelatedItem } from '~/types/public-api'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'armor-set', density: 'readable' })
const armorClientReady = ref(false)

const armorSetId = computed(() => String(route.params.id ?? '').trim())
const { data: armorDetailResult, pending: armorDetailPending, error: armorDetailError } = await usePublicArmorSetDetail(armorSetId)

const armorDetail = computed(() => armorDetailResult.value?.detail ?? null)
const armorRaw = computed<PublicArmorSetListItem | null>(() => armorDetailResult.value?.raw ?? null)
const armorDetailVisualLoading = computed(() => !armorClientReady.value || (armorDetailPending.value && !armorDetail.value))
const armorNotFound = computed(() => armorClientReady.value && !armorDetailPending.value && !armorDetail.value)

const armorTitle = computed(() => armorDetail.value?.displayName || `套装 ${armorSetId.value || '详情'}`)
const armorSubtitle = computed(() => armorDetail.value?.englishName || '公开套装资料')

useSeoMeta({
  title: () => `TerraPedia · ${armorTitle.value}`,
  description: () => `${armorTitle.value} 的公开套装详情，包含套装效果、词条解析与图片分组。`,
})

const statLabels: Record<string, string> = {
  damage_bonus: '伤害',
  crit_chance: '暴击',
  move_speed: '移速',
  melee_speed: '近战速度',
  summon_damage: '召唤伤害',
  minion_capacity: '仆从',
  ammo_conservation: '弹药节省',
  defense: '防御',
  mana_max: '魔力',
  mana_cost: '魔耗',
  mining_speed: '挖矿',
  special_effect: '特效',
}

const statVisuals: Record<string, { label: string, tone: string }> = {
  damage_bonus: { label: '伤害加成', tone: 'is-offense' },
  crit_chance: { label: '暴击率', tone: 'is-offense' },
  move_speed: { label: '移动速度', tone: 'is-mobility' },
  melee_speed: { label: '近战速度', tone: 'is-mobility' },
  summon_damage: { label: '召唤伤害', tone: 'is-summon' },
  minion_capacity: { label: '仆从容量', tone: 'is-summon' },
  ammo_conservation: { label: '弹药节省', tone: 'is-offense' },
  defense: { label: '防御', tone: 'is-defense' },
  mana_max: { label: '魔力上限', tone: 'is-resource' },
  mana_cost: { label: '魔力消耗', tone: 'is-resource' },
  mining_speed: { label: '挖矿速度', tone: 'is-mobility' },
  special_effect: { label: '特殊效果', tone: 'is-special' },
}

const statVisualMeta = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  return statVisuals[key] ?? { label: statName(effect), tone: effectToneClass(effect) }
}

const formatEffectValue = (effect: EquipmentEffectAttribute) => {
  const numeric = Number(effect.valueDecimal)
  if (!Number.isFinite(numeric)) return ''
  if (effect.unit === 'percent') return `${numeric > 0 ? '+' : ''}${numeric}%`
  if (effect.unit === 'multiplier') return `×${numeric}`
  return `${numeric > 0 ? '+' : ''}${numeric}`
}

const effectToneClass = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/damage|crit|melee|summon|ammo/.test(key)) return 'is-offense'
  if (/move|speed|dash|acceleration/.test(key)) return 'is-mobility'
  if (/defense|immunity/.test(key)) return 'is-defense'
  return 'is-special'
}

const statGroupLabels: Record<string, string> = {
  offense: '攻击数值',
  defense: '防御数值',
  mobility: '移动与速度',
  resource: '资源与消耗',
  summon: '召唤与仆从',
  special: '特殊效果',
}

const statGroupOrder = ['offense', 'defense', 'mobility', 'resource', 'summon', 'special']

const effectStatGroup = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/summon|minion/.test(key)) return 'summon'
  if (/damage|crit|melee|ammo/.test(key)) return 'offense'
  if (/defense|immunity|regen|life/.test(key)) return 'defense'
  if (/move|speed|dash|acceleration|flight/.test(key)) return 'mobility'
  if (/mana|cost|resource/.test(key)) return 'resource'
  return 'special'
}

const statName = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  return statLabels[key] ?? effect.statLabelZh ?? (key || '未归类')
}

const effectScopeLabel = (effect: EquipmentEffectAttribute) => {
  const classScope = String(effect.classScope ?? '').trim()
  const applyScope = String(effect.applyScope ?? '').trim()
  return [
    classScope && classScope !== 'all' ? classScope : '全职业',
    applyScope || '套装效果',
  ].join(' / ')
}

const effectSourceKind = (effect: EquipmentEffectAttribute) => {
  const applyScope = String(effect.applyScope ?? '').trim().toLowerCase()
  if (effect.variantLabel) return 'piece'
  if (effect.itemInternalName || effect.slotType) return 'piece'
  if (/item|piece|part|head|body|chest|leg|helmet|mask|shirt|pants/.test(applyScope)) return 'piece'
  return 'set'
}

const effectSourceLabel = (effect: EquipmentEffectAttribute) => (
  effectSourceKind(effect) === 'piece' ? '单件效果' : '套装效果'
)

const playerEffectDescription = (effect: EquipmentEffectAttribute) => (
  String(effect.conditionText ?? effect.variantLabel ?? effect.rawText ?? '').trim() || '套装效果'
)

const effectVariantLabel = (effect: EquipmentEffectAttribute) => String(effect.variantLabel ?? '').trim()
const effectRawText = (effect: EquipmentEffectAttribute) => String(effect.rawText ?? '').trim()

const armorIdentityAliases = (value: string) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return []

  const aliases = [
    trimmed,
  ]

  aliases.push(trimmed.replace(/^Ancient\s*/i, ''))
  aliases.push(trimmed.replace(/^远古/, ''))
  if (!/^Ancient/i.test(trimmed) && /^[A-Z]/.test(trimmed)) aliases.push(`${trimmed.includes(' ') ? 'Ancient ' : 'Ancient'}${trimmed}`)
  if (!/^远古/.test(trimmed) && /[\u4e00-\u9fff]/.test(trimmed)) aliases.push(`远古${trimmed}`)

  return aliases
    .map((value) => normalizeMatchText(String(value ?? '').trim()))
    .filter((value) => value.length >= 2)
}

const armorItemIdentityAliases = (item: PublicArmorSetRelatedItem) => dedupeEffectLines([
  ...armorIdentityAliases(String(item.internalName ?? '')),
  ...armorIdentityAliases(String(item.nameZh ?? '')),
  ...armorIdentityAliases(String(item.name ?? '')),
])

const armorPieceName = (item: PublicArmorSetRelatedItem) => (
  item.nameZh || item.name || '套装部件'
)

const armorPieceRole = (item: PublicArmorSetRelatedItem) => {
  const value = String(item.partRole ?? item.slotType ?? '').trim()
  if (/head/i.test(value)) return '头部'
  if (/body|shirt|chest/i.test(value)) return '胸甲'
  if (/leg|legs|pants/i.test(value)) return '腿部'
  return '防具部件'
}

const armorPieceRoleOrder = (role: string) => {
  if (role === '头部') return 0
  if (role === '胸甲') return 1
  if (role === '腿部') return 2
  return 3
}

const armorHeadVariantOrder = (item: PublicArmorSetRelatedItem) => {
  const text = `${item.nameZh ?? ''} ${item.name ?? ''} ${item.internalName ?? ''}`.toLowerCase()
  if (/头饰|headgear/.test(text)) return 0
  if (/面具|mask/.test(text)) return 1
  if (/头盔|helmet/.test(text)) return 2
  if (/兜帽|hood/.test(text)) return 3
  return 10
}

const armorPieceDefense = (item: PublicArmorSetRelatedItem) => {
  const value = Number(item.defenseValue ?? item.defense_value)
  return Number.isFinite(value) ? value : null
}

const armorDefenseValueLabel = (values: number[]) => {
  const uniqueValues = [...new Set(values)].sort((left, right) => left - right)
  if (!uniqueValues.length) return ''
  if (uniqueValues.length === 1) return String(uniqueValues[0])
  return `${uniqueValues[0]}-${uniqueValues[uniqueValues.length - 1]}`
}

const armorBenefitLines = computed(() => {
  const benefit = String(armorRaw.value?.benefitZh ?? armorRaw.value?.benefitEn ?? '').trim()
  if (!benefit) return []
  return benefit.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20)
})

const fallbackStatKey = (line: string) => {
  if (/防御/.test(line)) return 'defense'
  if (/暴击/.test(line)) return 'crit_chance'
  if (/移动|速度/.test(line)) return 'move_speed'
  if (/召唤|仆从|哨兵/.test(line)) return 'summon_damage'
  if (/魔力|魔耗|消耗/.test(line)) return 'mana_cost'
  if (/伤害/.test(line)) return 'damage_bonus'
  return 'special_effect'
}

const fallbackStatLabel = (line: string) => statLabels[fallbackStatKey(line)] ?? '特效'

const armorBenefitFallbackEffects = computed<EquipmentEffectAttribute[]>(() => armorBenefitLines.value
  .map((line) => {
    const match = line.match(/([+\-−]?\d+(?:\.\d+)?)\s*(%?)\s*([^，、；;（）()]*)/)
    const normalizedValue = match?.[1]?.replace('−', '-') ?? ''
    const numeric = Number(normalizedValue)
    return {
      statKey: fallbackStatKey(line),
      statLabelZh: fallbackStatLabel(line),
      valueDecimal: Number.isFinite(numeric) ? numeric : null,
      unit: match?.[2] === '%' ? 'percent' : 'flat',
      classScope: 'all',
      applyScope: 'set_bonus',
      rawText: line,
      parseStatus: match ? 'fallback' : 'unparsed',
    }
  })
  .filter((effect) => effect.rawText))

const armorParsedEffects = computed(() => (armorDetail.value?.parsedEffects ?? []).slice(0, 12))
const hasStructuredArmorEffects = computed(() => Boolean(armorDetail.value?.effects?.length))
const armorShownEffects = computed(() => {
  if (hasStructuredArmorEffects.value) return (armorDetail.value?.effects ?? []).slice(0, 40)
  return armorBenefitFallbackEffects.value
})

const armorStatGroups = computed(() => {
  const effects = armorShownEffects.value
  const grouped = new Map<string, EquipmentEffectAttribute[]>()
  for (const effect of effects) {
    const groupKey = effectStatGroup(effect)
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), effect])
  }

  return statGroupOrder
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: statGroupLabels[key] ?? key,
      effects: grouped.get(key) ?? [],
    }))
})

const groupEffectsByStat = (effects: EquipmentEffectAttribute[]) => {
  const grouped = new Map<string, EquipmentEffectAttribute[]>()
  for (const effect of effects) {
    const groupKey = effectStatGroup(effect)
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), effect])
  }

  return statGroupOrder
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: statGroupLabels[key] ?? key,
      effects: grouped.get(key) ?? [],
    }))
}

const armorEffectSections = computed(() => {
  const setEffects = armorShownEffects.value.filter((effect) => effectSourceKind(effect) === 'set')

  if (!setEffects.length) return []

  return [{
    key: 'set',
    label: '套装效果',
    description: '穿齐套装后触发的整体加成。',
    effects: setEffects,
    groups: groupEffectsByStat(setEffects),
  }]
})

const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
const asRelatedItems = (value: unknown): PublicArmorSetRelatedItem[] => Array.isArray(value)
  ? value.filter((entry): entry is PublicArmorSetRelatedItem => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  : []
const armorRelatedItems = computed(() => asRelatedItems(armorRaw.value?.relatedItems ?? armorRaw.value?.related_items))

const normalizeMatchText = (value: string) => value
  .toLowerCase()
  .replace(/[()\[\]（）【】·・.'"]/g, '')
  .replace(/\s+/g, '')

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

const armorPieceEffectGroups = computed(() => {
  const groups = new Map<string, { item: PublicArmorSetRelatedItem | null, effects: EquipmentEffectAttribute[] }>()
  const unmatchedKey = 'unmatched-piece-effects'

  for (const effect of armorShownEffects.value.filter((entry) => effectSourceKind(entry) === 'piece')) {
    const item = statLinkedItem(effect)
    const key = item
      ? String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)).trim()
      : unmatchedKey
    const safeKey = key || unmatchedKey
    const current = groups.get(safeKey) ?? { item, effects: [] }
    current.effects.push(effect)
    groups.set(safeKey, current)
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      item: group.item,
      title: group.item ? armorPieceName(group.item) : '未匹配部件',
      subtitle: group.item ? armorPieceRole(group.item) : '需要补充来源物品',
      effects: group.effects,
    }))
    .sort((left, right) => {
      const leftOrder = left.item ? armorPieceRoleOrder(armorPieceRole(left.item)) : 99
      const rightOrder = right.item ? armorPieceRoleOrder(armorPieceRole(right.item)) : 99
      return leftOrder - rightOrder || left.title.localeCompare(right.title, 'zh-Hans-CN')
    })
})

const armorVariantBuilds = computed(() => {
  const headItems = armorRelatedItems.value
    .filter((item) => armorPieceRole(item) === '头部')
    .sort((left, right) => armorHeadVariantOrder(left) - armorHeadVariantOrder(right) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))
  const bodyItems = armorRelatedItems.value.filter((item) => armorPieceRole(item) === '胸甲')
  const legItems = armorRelatedItems.value.filter((item) => armorPieceRole(item) === '腿部')
  const setEffects = armorShownEffects.value.filter((effect) => effectSourceKind(effect) === 'set')
  const spriteImage = asStringArray(armorRaw.value?.maleImages ?? armorRaw.value?.male_images)[0] ?? armorPrimaryPreview.value
  const total = Math.max(headItems.length, 1)

  return headItems.map((headItem, index) => {
    const linkedItems = [
      headItem,
      ...bodyItems,
      ...legItems,
    ]
    const itemKeys = linkedItems.map((item) => normalizeMatchText([
      item.nameZh,
      item.name,
      item.internalName,
    ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' '))).filter(Boolean)
    const pieceEffects = armorShownEffects.value.filter((effect) => {
      if (effectSourceKind(effect) !== 'piece') return false
      const linkedItem = statLinkedItem(effect)
      if (linkedItem && linkedItems.some((item) => item === linkedItem)) return true
      const text = normalizeMatchText([
        effect.rawText,
        effect.conditionText,
        effect.variantLabel,
        effect.itemInternalName,
      ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' '))
      return itemKeys.some((key) => text.includes(key))
    })

    return {
      key: String(headItem.itemId ?? headItem.sourceId ?? headItem.internalName ?? armorPieceName(headItem)),
      title: armorPieceName(headItem),
      subtitle: linkedItems.map(armorPieceName).join(' / '),
      spriteImage,
      spriteIndex: index,
      spriteTotal: total,
      items: linkedItems,
      effects: [...pieceEffects, ...setEffects],
      pieceEffects,
      setEffects,
    }
  })
})

const effectSummaryLine = (effect: EquipmentEffectAttribute) => {
  const rawText = effectRawText(effect)
  if (rawText) return rawText

  const value = formatEffectValue(effect)
  const label = statName(effect)
  const description = playerEffectDescription(effect)
  if (description && description !== '套装效果' && description !== label) return `${description}${value ? `：${value}` : ''}`
  return `${value ? `${value} ` : ''}${label}`.trim()
}

const normalizeEffectLine = (line: string) => line
  .toLowerCase()
  .replace(/[+\s:：，、；;（）()[\]·・.'"]/g, '')
  .replace(/−/g, '-')

const dedupeEffectLines = (lines: string[]) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines.map((entry) => String(entry ?? '').trim()).filter(Boolean)) {
    const key = normalizeEffectLine(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(line)
  }

  return result
}

const mergeEffectLines = (effects: EquipmentEffectAttribute[]) => dedupeEffectLines(
  effects.map(effectSummaryLine),
)

const armorCommonPieceLines = computed(() => {
  const commonItems = armorRelatedItems.value.filter((item) => armorPieceRole(item) !== '头部')
  const commonKeys = commonItems.map((item) => normalizeMatchText([
    item.nameZh,
    item.name,
    item.internalName,
  ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' '))).filter(Boolean)

  return mergeEffectLines(armorShownEffects.value.filter((effect) => {
    if (effectSourceKind(effect) !== 'piece') return false
    const linkedItem = statLinkedItem(effect)
    if (linkedItem && commonItems.some((item) => item === linkedItem)) return true
    const text = normalizeMatchText([
      effect.rawText,
      effect.conditionText,
      effect.variantLabel,
      effect.itemInternalName,
    ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' '))
    return commonKeys.some((key) => text.includes(key))
  }))
})

const armorVariantSummary = computed(() => armorVariantBuilds.value.map((build) => ({
  key: build.key,
  title: build.title,
  lines: mergeEffectLines(build.pieceEffects),
})))

const armorSetRewardLines = computed(() => mergeEffectLines(armorShownEffects.value.filter((effect) => effectSourceKind(effect) === 'set')))
const armorSetEffectLines = computed(() => armorBenefitLines.value.filter((line) => /套装|奖励|效果|bonus/i.test(line)))
const armorFallbackBenefitLines = computed(() => {
  if (hasStructuredArmorEffects.value) return []
  const effectLines = new Set(mergeEffectLines(armorBenefitFallbackEffects.value).map(normalizeEffectLine))
  return armorBenefitLines.value.filter((line) => !effectLines.has(normalizeEffectLine(line)))
})

const armorHeroSummary = computed(() => {
  const effectLines = mergeEffectLines(armorShownEffects.value).slice(0, 3)
  if (effectLines.length) return effectLines.join(' · ')
  return armorFallbackBenefitLines.value[0] || '该套装的数值资料正在整理中。'
})

const armorEquipmentCardStats = (item: PublicArmorSetRelatedItem) => {
  const effects = armorShownEffects.value.filter((effect) => statLinkedItem(effect) === item)
  const lines = mergeEffectLines(effects)
  return lines.length ? lines : ['暂无独立属性']
}

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

const armorEquipmentGroups = computed(() => {
  const commonItems = armorRelatedItems.value
    .filter((item) => armorPieceRole(item) !== '头部')
    .sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))
  const headItems = armorRelatedItems.value
    .filter((item) => armorPieceRole(item) === '头部')
    .sort((left, right) => armorHeadVariantOrder(left) - armorHeadVariantOrder(right) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))

  return [
    { key: 'set', label: '套装', items: commonItems },
    { key: 'head', label: '头盔种类', items: headItems },
  ].filter((group) => group.items.length)
})

const uniqueArmorItems = (items: PublicArmorSetRelatedItem[]) => {
  const seen = new Set<string>()
  const result: PublicArmorSetRelatedItem[] = []

  for (const item of items) {
    const key = [
      armorPieceRole(item),
      String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)).trim(),
    ].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

const armorVariantBuildGroups = (headItems: PublicArmorSetRelatedItem[]) => {
  const variantLabels = dedupeEffectLines(armorShownEffects.value
    .map(effectVariantLabel)
    .filter(Boolean))
    .filter((label) => headItems.some((item) => effectMatchesItemIdentity({ variantLabel: label } as EquipmentEffectAttribute, item)))

  if (!variantLabels.length) {
    return headItems.map((headItem) => ({
      key: String(headItem.itemId ?? headItem.sourceId ?? headItem.internalName ?? armorPieceName(headItem)),
      title: armorPieceName(headItem),
      headItems: [headItem],
    }))
  }

  return variantLabels.map((variantLabel) => {
    const matchingHeads = headItems.filter((item) => effectMatchesItemIdentity({ variantLabel } as EquipmentEffectAttribute, item))
    const primaryHead = matchingHeads[0]

    return {
      key: normalizeMatchText(variantLabel),
      title: primaryHead ? armorPieceName(primaryHead) : variantLabel,
      headItems: matchingHeads,
    }
  }).filter((buildGroup) => buildGroup.headItems.length)
}

const armorBuildVariantStats = (buildGroup: { headItems: PublicArmorSetRelatedItem[] }) => {
  const itemEffects = armorShownEffects.value.filter((effect) => {
    const variantLabel = effectVariantLabel(effect)
    return variantLabel && buildGroup.headItems.some((headItem) => effectBelongsToItem(effect, headItem))
  })
  const merged = mergeEffectLines(itemEffects)
  return merged.length ? merged : ['暂无头部差异属性']
}

const armorFixedBonusLines = computed(() => {
  const commonItems = uniqueArmorItems(armorRelatedItems.value
    .filter((item) => armorPieceRole(item) !== '头部'))
  const fixedEffects = armorShownEffects.value.filter((effect) => {
    if (effectSourceKind(effect) === 'set') return true
    if (effectVariantLabel(effect)) return false
    return commonItems.some((item) => effectBelongsToItem(effect, item))
  })
  return mergeEffectLines(fixedEffects)
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

const armorSetBuildCards = computed(() => {
  const commonItems = uniqueArmorItems(armorRelatedItems.value
    .filter((item) => armorPieceRole(item) !== '头部'))
    .sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))
  const headItems = uniqueArmorItems(armorRelatedItems.value
    .filter((item) => armorPieceRole(item) === '头部'))
    .sort((left, right) => armorHeadVariantOrder(left) - armorHeadVariantOrder(right) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))

  return armorVariantBuildGroups(headItems).map((buildGroup) => {
    const items = [...buildGroup.headItems, ...commonItems]
    return {
      key: buildGroup.key,
      title: buildGroup.title,
      items,
      defense: armorBuildDefenseSummary(items),
      stats: armorBuildVariantStats(buildGroup),
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
const imageGroups = computed(() => ([
  { key: 'male', label: '男', icon: 'icon-armor', images: asStringArray(armorRaw.value?.maleImages ?? armorRaw.value?.male_images) },
  { key: 'female', label: '女', icon: 'icon-armor', images: asStringArray(armorRaw.value?.femaleImages ?? armorRaw.value?.female_images) },
  { key: 'special', label: '特殊', icon: 'icon-armor', images: asStringArray(armorRaw.value?.specialImages ?? armorRaw.value?.special_images) },
  { key: 'fallback', label: '部件图', icon: 'icon-items', images: asStringArray(armorRaw.value?.fallbackImages ?? armorRaw.value?.fallback_images) },
]).filter((group) => group.images.length))
const armorPrimaryPreview = computed(() => imageGroups.value[0]?.images[0] ?? '')
const armorPrimaryPreviewIcon = computed(() => imageGroups.value[0]?.icon ?? 'icon-armor')

const factCards = computed(() => ([
  { label: '部件数', value: armorDetail.value?.uniqueItemCount == null ? '未标记' : String(armorDetail.value.uniqueItemCount), meta: '可用部件数量' },
  { label: '套装组', value: armorDetail.value?.setCount == null ? '未标记' : String(armorDetail.value.setCount), meta: '套装部件组数' },
  { label: '解析数', value: String(armorParsedEffects.value.length), meta: '已解析效果词条' },
]))

onMounted(() => {
  armorClientReady.value = true
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout" :class="detailLayout.detailShellClass" :aria-busy="armorDetailVisualLoading">
      <section v-if="armorDetailVisualLoading" class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
          <component :is="'h1'" class="detail-missing-title"><CommonTpSkeleton type="line" /></component>
          <p><CommonTpSkeleton type="line" /></p>
          <div class="tag-row">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
        </div>
      </section>

      <section v-else-if="armorNotFound" class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow">套装资料</span>
          <component :is="'h1'" class="detail-missing-title">没有找到这个套装</component>
          <p>当前详情资料还没有可渲染内容。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="armorDetailError" class="tag moss">加载异常</span>
          </div>
          <a class="primary-button" href="/armor-sets">返回套装路线</a>
        </div>
      </section>

      <section v-else class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow">数值总览 · {{ armorSubtitle }}</span>
          <h1>{{ armorTitle }}</h1>
          <p>{{ armorHeroSummary }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ armorDetail?.primaryPart || 'set' }}</span>
            <span class="tag moss">{{ armorDetail?.uniqueItemCount ?? 0 }} 个部件</span>
            <span class="tag paper">{{ armorShownEffects.length }} 条数值</span>
          </div>
        </div>
      </section>

      <section v-if="armorPieceGroups.length" class="support-panel armor-module" :class="detailLayout.detailModuleClass">
        <div class="armor-module-head">
          <div>
            <h2>套装部件</h2>
            <p>按装备部位展示，可替换部件收在同一组。</p>
          </div>
        </div>
        <div class="armor-pieces-layout">
          <div class="armor-piece-grid">
            <article v-for="group in armorPieceGroups" :key="group.role" class="armor-piece-card">
              <div class="armor-piece-card-head">
                <b>{{ group.role }}</b>
                <span>{{ group.items.length > 1 ? `${group.items.length} 件可替换` : '固定部件' }}</span>
              </div>
              <div class="armor-piece-options">
                <div v-for="item in group.items" :key="`${group.role}-${item.itemId}-${armorPieceName(item)}`" class="armor-piece-option">
                  <CommonPreviewImage
                    :src="resolvePreviewImageUrl(item.image || '')"
                    :alt="armorPieceName(item)"
                    :fallback="armorPieceName(item).slice(0, 1)"
                    fallback-icon="icon-items"
                    width="44"
                    height="44"
                  />
                  <span>{{ armorPieceName(item) }}</span>
                </div>
              </div>
            </article>
          </div>
          <aside class="armor-fact-panel">
            <div v-for="card in factCards" :key="card.label" class="armor-fact-row">
              <span>{{ card.label }}</span>
              <strong>{{ armorDetailVisualLoading ? '...' : card.value }}</strong>
              <small>{{ card.meta }}</small>
            </div>
          </aside>
        </div>
      </section>

      <div class="armor-analysis-layout">
        <section class="support-panel armor-module armor-stat-module" :class="detailLayout.detailModuleClass">
          <div class="armor-module-head">
            <div>
              <h2>数值总览</h2>
              <p>先区分套装效果与单件效果，再按属性分组展示。</p>
            </div>
            <a class="small-button" href="/armor-sets">返回列表</a>
          </div>

          <div v-if="armorStatGroups.length" class="armor-effect-sections">
            <!-- detail layout contract legacy marker: v-for="group in armorStatGroups" -->
            <!-- detail layout contract legacy marker: class="armor-stat-card-grid" class="armor-effect-card" class="armor-effect-card-value" -->
            <!-- visual contract marker: armorEffectSections armor-piece-effect-groups armor-effect-card-head.has-stat-art -->
            <div class="armor-build-board armor-structured-build-board armor-build-matrix">
              <div class="armor-build-row armor-build-row-head">
                <b>构筑</b>
                <b>部件</b>
                <b>防御</b>
                <b>头部差异</b>
              </div>
              <section v-if="armorFixedBonusLines.length" class="armor-build-row armor-fixed-bonus-row">
                <div class="armor-build-cell armor-build-title-cell">
                  <strong>全套固定</strong>
                </div>
                <div class="armor-build-cell">
                  <span>胸甲 / 腿部 / 套装</span>
                </div>
                <div class="armor-build-cell armor-build-defense-formula">
                  <span>公共</span>
                </div>
                <div class="armor-build-cell armor-build-stat-lines">
                  <span v-for="line in armorFixedBonusLines" :key="`fixed-${line}`">{{ line }}</span>
                </div>
              </section>
              <article v-for="build in armorSetBuildCards" :key="build.key" class="armor-build-row">
                <div class="armor-build-cell armor-build-title-cell">
                  <strong>{{ build.title }}</strong>
                </div>
                <div class="armor-build-cell armor-build-icons">
                  <span v-for="item in build.items" :key="`${build.key}-${armorPieceName(item)}`" :title="armorPieceName(item)">
                    <CommonPreviewImage
                      :src="resolvePreviewImageUrl(item.image || '')"
                      :alt="armorPieceName(item)"
                      :fallback="armorPieceName(item).slice(0, 1)"
                      fallback-icon="icon-items"
                      width="28"
                      height="28"
                    />
                    <small>{{ armorPieceRole(item) }}</small>
                  </span>
                </div>
                <div class="armor-build-cell armor-build-defense-formula">
                  <strong v-if="build.defense.total != null">{{ build.defense.total }}</strong>
                  <small v-if="build.defense.formula">{{ build.defense.formula }}</small>
                  <span v-else>--</span>
                </div>
                <div class="armor-build-cell armor-build-stat-lines">
                  <span v-for="line in build.stats" :key="`${build.key}-${line}`">{{ line }}</span>
                </div>
              </article>
            </div>
          </div>
          <p v-else class="tp-detail-empty">暂无可展示的解析数值。</p>

          <div v-if="armorFallbackBenefitLines.length" class="armor-source-context">
            <span v-for="line in armorFallbackBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
          </div>
        </section>

        <section v-if="imageGroups.length" class="support-panel armor-module armor-preview-module" :class="detailLayout.detailModuleClass">
          <div class="armor-module-head">
            <div>
              <h2>展示图</h2>
              <p>套装外观与部件图片。</p>
            </div>
          </div>

          <div class="armor-preview-strip">
            <section v-for="group in imageGroups" :key="group.key" class="armor-preview-group">
              <div class="armor-preview-group-head">
                <b>{{ group.label }}</b>
                <span class="tag paper">{{ group.images.length }} 张</span>
              </div>
              <div class="armor-preview-images">
                <CommonPreviewImage
                  v-for="image in group.images.slice(0, 12)"
                  :key="`${group.key}-${image}`"
                  :src="resolvePreviewImageUrl(image)"
                  :alt="`${armorTitle} ${group.label}`"
                  :fallback="armorDetail?.fallback || '?'"
                  :fallback-icon="group.icon"
                  width="92"
                  height="92"
                  class="armor-preview-tile"
                />
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.armor-detail-hero {
  display: block;
}

.armor-module-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: start;
  justify-content: space-between;
}

.armor-module-head > div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.armor-module-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  line-height: 1.25;
}

.armor-module-head p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.armor-source-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(244, 234, 208, 0.1);
  color: var(--text);
  font-size: 13px;
  line-height: 1.7;
}

.armor-source-context span {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 6px 10px;
  border: 1px solid rgba(244, 234, 208, 0.09);
  border-radius: 999px;
  background: rgba(244, 234, 208, 0.03);
  overflow-wrap: anywhere;
}

.armor-analysis-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.75fr);
  gap: 14px;
  align-items: start;
}

.armor-stat-module,
.armor-preview-module {
  min-width: 0;
  align-content: start;
}

.armor-stat-groups {
  display: grid;
  gap: 18px;
}

.armor-effect-sections {
  display: grid;
  gap: 18px;
}

.armor-effect-section {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(244, 234, 208, 0.08);
  border-radius: 8px;
  background: rgba(12, 15, 11, 0.16);
}

.armor-effect-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(244, 234, 208, 0.08);
}

.armor-effect-section-head h3 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  line-height: 1.35;
}

.armor-effect-section-head span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-piece-effect-groups {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.armor-piece-effect-group {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(244, 234, 208, 0.09);
  border-radius: 8px;
  background: rgba(244, 234, 208, 0.025);
}

.armor-effect-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(244, 234, 208, 0.08);
  border-radius: 8px;
  background: rgba(244, 234, 208, 0.025);
}

.armor-build-board {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-build-matrix {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.armor-build-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.7fr) minmax(132px, 0.85fr) minmax(92px, 0.48fr) minmax(220px, 1.45fr);
  gap: 8px;
  align-items: stretch;
  min-width: 0;
  padding: 7px;
  border: 1px solid rgba(244, 234, 208, 0.12);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(244, 234, 208, 0.04), rgba(100, 154, 118, 0.02)),
    rgba(12, 15, 11, 0.16);
}

.armor-build-row-head {
  padding: 4px 7px;
  border-color: rgba(244, 234, 208, 0.08);
  background: rgba(244, 234, 208, 0.025);
}

.armor-build-row-head b {
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.25;
}

.armor-fixed-bonus-row {
  border-color: rgba(219, 179, 93, 0.28);
  background:
    linear-gradient(135deg, rgba(219, 179, 93, 0.09), rgba(100, 154, 118, 0.025)),
    rgba(12, 15, 11, 0.2);
}

.armor-fixed-bonus-row .armor-build-title-cell strong {
  color: var(--gold);
}

.armor-build-cell {
  display: flex;
  min-width: 0;
  align-items: center;
}

.armor-build-cell > span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.armor-build-title-cell strong {
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.armor-equipment-section {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.armor-equipment-section h3 {
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(244, 234, 208, 0.12);
  color: var(--text);
  font-size: 20px;
  line-height: 1.25;
}

.armor-equipment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  min-width: 0;
}

.armor-equipment-card {
  display: grid;
  gap: 10px;
  align-content: start;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(244, 234, 208, 0.14);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(244, 234, 208, 0.055), rgba(100, 154, 118, 0.025)),
    rgba(12, 15, 11, 0.18);
}

.armor-equipment-card-title {
  display: grid;
  place-items: center;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid rgba(244, 234, 208, 0.13);
  border-radius: 7px;
  background: rgba(12, 15, 11, 0.36);
}

.armor-equipment-card-title h4 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  line-height: 1.25;
  text-align: center;
  overflow-wrap: anywhere;
}

.armor-equipment-card-image {
  justify-self: center;
}

.armor-equipment-card-image :deep(.item-art) {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
}

.armor-build-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.armor-build-icons span {
  display: grid;
  justify-items: center;
  gap: 2px;
}

.armor-build-icons :deep(.item-art) {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  overflow: hidden;
}

.armor-build-icons small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.armor-build-defense-formula {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-defense-formula strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-build-defense-formula small,
.armor-build-defense-formula span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-build-stat-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
}

.armor-build-stat-lines span {
  color: var(--text);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-equipment-card-panel {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(244, 234, 208, 0.11);
  border-radius: 7px;
  background: rgba(12, 15, 11, 0.2);
}

.armor-equipment-card-panel b {
  justify-self: stretch;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(244, 234, 208, 0.1);
  color: var(--text);
  font-size: 13px;
  text-align: center;
}

.armor-equipment-card-panel p {
  margin: 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-equipment-card-panel strong {
  color: var(--muted);
  font-weight: 900;
}

.armor-stat-group {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.armor-stat-group h3,
.armor-stat-group h4 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  line-height: 1.35;
}

.armor-stat-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}

.armor-effect-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(244, 234, 208, 0.09);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(244, 234, 208, 0.06), rgba(100, 154, 118, 0.035)),
    rgba(244, 234, 208, 0.025);
}

.armor-effect-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.armor-effect-card-head.has-stat-art {
  grid-template-columns: 42px minmax(0, 1fr) auto;
}

.armor-stat-art {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(244, 234, 208, 0.14);
  border-radius: 8px;
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.12), transparent 34%),
    rgba(12, 15, 11, 0.58);
  color: var(--text);
  box-shadow: inset 0 0 0 1px rgba(12, 15, 11, 0.45);
}

.armor-stat-art :deep(.item-art) {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.armor-stat-art.is-offense {
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 238, 194, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(150, 58, 42, 0.48), rgba(174, 132, 61, 0.18));
}

.armor-stat-art.is-mobility {
  background:
    radial-gradient(circle at 34% 28%, rgba(236, 255, 220, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(59, 127, 101, 0.48), rgba(171, 180, 92, 0.16));
}

.armor-stat-art.is-defense {
  background:
    radial-gradient(circle at 34% 28%, rgba(230, 245, 255, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(67, 89, 112, 0.5), rgba(176, 182, 160, 0.14));
}

.armor-stat-art.is-resource {
  background:
    radial-gradient(circle at 34% 28%, rgba(235, 232, 255, 0.2), transparent 34%),
    linear-gradient(135deg, rgba(82, 76, 146, 0.5), rgba(165, 117, 179, 0.16));
}

.armor-stat-art.is-summon,
.armor-stat-art.is-special {
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 243, 214, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(113, 91, 52, 0.5), rgba(79, 124, 103, 0.16));
}

.armor-stat-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.armor-stat-name {
  display: inline-flex;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-stat-title small {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-effect-card-value {
  color: var(--text);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.armor-effect-card p {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.armor-effect-scope {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-pieces-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, 220px);
  gap: 14px;
  align-items: start;
}

.armor-fact-panel {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-fact-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 10px;
  align-items: baseline;
  padding: 10px;
  border: 1px solid rgba(244, 234, 208, 0.09);
  border-radius: 8px;
  background: rgba(244, 234, 208, 0.025);
}

.armor-fact-row span,
.armor-fact-row small {
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fact-row strong {
  color: var(--text);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
}

.armor-fact-row small {
  grid-column: 1 / -1;
}

.armor-piece-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.armor-piece-card {
  display: grid;
  gap: 14px;
  align-content: start;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(244, 234, 208, 0.09);
  border-radius: 8px;
}

.armor-piece-card-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
}

.armor-piece-card-head b {
  color: var(--text);
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-piece-card-head span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.armor-piece-options {
  display: grid;
  gap: 9px;
}

.armor-piece-option {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-top: 1px solid rgba(244, 234, 208, 0.07);
}

.armor-piece-option:first-child {
  padding-top: 0;
  border-top: 0;
}

.armor-piece-option span {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-preview-strip {
  display: grid;
  align-content: start;
  gap: 14px;
}

.armor-preview-group {
  display: grid;
  gap: 10px;
  min-width: 0;
  align-content: start;
}

.armor-preview-group-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  align-items: center;
  justify-content: space-between;
}

.armor-preview-group-head b {
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
}

.armor-preview-images {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(188px, 188px));
  justify-content: start;
  gap: 14px;
}

.armor-preview-tile :deep(.item-art) {
  width: 188px;
  height: 188px;
  border-radius: 14px;
  overflow: hidden;
}

@media (max-width: 980px) {
  .armor-analysis-layout {
    grid-template-columns: 1fr;
  }
  .armor-pieces-layout {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 520px) {
  .armor-effect-card-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .armor-effect-card-head.has-stat-art {
    grid-template-columns: 38px minmax(0, 1fr);
  }

  .armor-stat-art {
    width: 38px;
    height: 38px;
  }

  .armor-effect-card-value {
    grid-column: 1 / -1;
    justify-self: start;
    font-size: 20px;
  }
}
</style>
