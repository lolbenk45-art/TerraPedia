<script setup lang="ts">
import { usePublicArmorSetDetail } from '~/composables/usePublicArmorSetDetail'
import type { EquipmentEffectAttribute, PublicArmorSetListItem, PublicArmorSetRelatedItem, PublicItemRecipeTree } from '~/types/public-api'
import { createArmorSetBuildGroups } from '~/utils/armorSetBuilds.mjs'
import { buildCompactRecipeMaterial, buildCompactRecipeStation, compactRecipeNodeChildren, compactRecipeNodeStations, compactRecipeRootNodes, type CompactRecipeMaterial, type CompactRecipeStation } from '~/utils/craftingRecipeCompact'

type ArmorBuildTotalEntry = {
  key: string
  statKey: string
  label: string
  value: string
  rawValue: number
  isVariable?: boolean
}

type ArmorPieceEffectRecord = Record<string, EquipmentEffectAttribute[]>
type ArmorBuildGroup = {
  key: string
  title: string
  variantRole: string
  variantItems: PublicArmorSetRelatedItem[]
  displayItems?: PublicArmorSetRelatedItem[]
  partGroups?: ArmorBuildPartGroup[]
}
type ArmorBuildDisplayItem = PublicArmorSetRelatedItem & {
  displayName?: string
}
type ArmorBuildPartGroup = {
  key: string
  partIndex: number | null
  role: string
  item: PublicArmorSetRelatedItem
  alternatives: PublicArmorSetRelatedItem[]
}
type ArmorSetRecipeSummary = {
  key: string
  itemId: string
  name: string
  role: string
  image: string
  fallback: string
  href: string
  recipeCount: number
  materials: CompactRecipeMaterial[]
  stations: CompactRecipeStation[]
}
type ArmorSetRecipeTableRow = ArmorSetRecipeSummary & {
  stationGroupKey: string
  stationRowspan: number
  showStationCell: boolean
}

const ARMOR_VISIBLE_RECIPE_LIMIT = 8

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'armor-set', density: 'readable' })
const armorClientReady = ref(false)
const expandedArmorPartKeys = ref(new Set<string>())

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
  sentry_capacity: '哨兵',
  ammo_conservation: '弹药节省',
  knockback: '击退',
  defense: '防御',
  threat: '仇恨',
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
  sentry_capacity: { label: '哨兵容量', tone: 'is-summon' },
  ammo_conservation: { label: '弹药节省', tone: 'is-offense' },
  knockback: { label: '击退', tone: 'is-offense' },
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

const formatArmorTotalValue = (value: number, unit: string | null | undefined) => {
  if (unit === 'percent') return `${value > 0 ? '+' : ''}${value}%`
  if (unit === 'multiplier') return `×${value}`
  return `${value > 0 ? '+' : ''}${value}`
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
  if (/summon|minion|sentry/.test(key)) return 'summon'
  if (/damage|crit|melee|ammo|knockback/.test(key)) return 'offense'
  if (/defense|immunity|regen|life/.test(key)) return 'defense'
  if (/move|speed|dash|acceleration|flight/.test(key)) return 'mobility'
  if (/mana|cost|resource/.test(key)) return 'resource'
  return 'special'
}

const statName = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  return statLabels[key] ?? effect.statLabelZh ?? (key || '未归类')
}

const effectReadableStatName = (effect: EquipmentEffectAttribute) => {
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

const armorSourceEffectLabel = (effect: EquipmentEffectAttribute) => {
  const applyScope = String(effect.applyScope ?? '').trim()
  const variantLabel = effectVariantLabel(effect)
  if (variantLabel) return variantLabel
  if (applyScope === 'set_bonus') return '套装奖励'
  if (effectSourceKind(effect) === 'piece') return '单件效果'
  return '基础来源'
}

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
  (item as ArmorBuildDisplayItem).displayName || item.nameZh || item.name || '套装部件'
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

const toggleArmorPieceEvidence = (key: string) => {
  const next = new Set(expandedArmorPartKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedArmorPartKeys.value = next
}

const armorDomIdFragment = (value: string) => normalizeEffectLine(value) || 'part'

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

const armorPieceDefenseLabel = (item: PublicArmorSetRelatedItem) => {
  const value = armorPieceDefense(item)
  return value == null ? '' : `${value} 防御`
}

const armorSetVariantIndex = (item: PublicArmorSetRelatedItem) => {
  const value = Number(item.setVariantIndex)
  return Number.isFinite(value) ? value : null
}

const armorPartIndex = (item: PublicArmorSetRelatedItem) => {
  const value = Number(item.partIndex)
  return Number.isFinite(value) ? value : null
}

const armorRecipeItemId = (item: PublicArmorSetRelatedItem) => String(item.itemId ?? item.sourceId ?? '').trim()

const armorFirstGlyph = (value: string) => Array.from(String(value ?? '').trim())[0] ?? '?'

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
  if (/哨兵容量|sentry/i.test(line)) return 'sentry_capacity'
  if (/仆从容量|仆从|minion/i.test(line)) return 'minion_capacity'
  if (/召唤伤害/.test(line)) return 'summon_damage'
  if (/弹药|ammo/i.test(line)) return 'ammo_conservation'
  if (/击退|knockback/i.test(line)) return 'knockback'
  if (/防御/.test(line)) return 'defense'
  if (/暴击/.test(line)) return 'crit_chance'
  if (/近战(?:攻击)?速度|melee speed/i.test(line)) return 'melee_speed'
  if (/挖矿|采矿|mining/i.test(line)) return 'mining_speed'
  if (/移动|移速|加速度|减速度|move|movement|speed/i.test(line)) return 'move_speed'
  if (/最大魔力|魔力上限|max mana/i.test(line)) return 'mana_max'
  if (/魔力花费|魔力消耗|魔耗|mana cost|消耗/.test(line)) return 'mana_cost'
  if (/仇恨/.test(line)) return 'threat'
  if (/伤害|damage/i.test(line)) return 'damage_bonus'
  return 'special_effect'
}

const fallbackStatLabel = (line: string) => statLabels[fallbackStatKey(line)] ?? '特效'

const armorLineLooksLikePlainAttribute = (line: string) => (
  /^\s*[+\-−]?\d+(?:\.\d+)?\s*%?\s*[^，、；;（）()]*/.test(line)
  && !/套装|奖励|效果|增益|提供|触发|获得|召唤|免疫|闪避|不受|击中|每级|最高|降低/.test(line)
)

const armorLineLooksLikeNumericSetAttribute = (line: string) => (
  // Regression marker: "套装奖励：魔力消耗降低 17%" contributes "-17% 魔力消耗" to 最终汇总.
  !/(?:每级|最高|持续|造成|召唤|生成|提供不断累积|基础伤害)/.test(line)
  && (
  /(?:降低|减少|减免|增加|提高)\s*[+\-−]?\d+(?:\.\d+)?\s*%?/.test(line)
  || /[+\-−]?\d+(?:\.\d+)?\s*%?\s*[^，、；;（）()]*(?:降低|减少|减免|增加|提高|不消耗弹药|减少弹药消耗|哨兵容量|仆从容量|召唤伤害|近战伤害|远程伤害|魔法伤害|伤害|暴击|移动速度|移速|近战(?:攻击)?速度|仇恨|击退|魔力花费|魔力消耗|魔力上限|最大魔力|melee damage|melee speed|damage|crit|speed|mana|ammo|minion|sentry|knockback)/i.test(line)
  )
)

const armorEffectLineNumericMatch = (line: string) => (
  line.match(/^\s*([+\-−]?\d+(?:\.\d+)?)\s*(%?)/)
  ?? line.match(/(?:降低|减少|减免|增加|提高)\s*([+\-−]?\d+(?:\.\d+)?)\s*(%?)/)
  ?? line.match(/([+\-−]?\d+(?:\.\d+)?)\s*(%?)\s*[^，、；;（）()]*(?:降低|减少|减免|增加|提高|不消耗弹药|减少弹药消耗|哨兵容量|仆从容量|召唤伤害|近战伤害|远程伤害|魔法伤害|伤害|暴击|移动速度|移速|近战(?:攻击)?速度|仇恨|击退|魔力花费|魔力消耗|魔力上限|最大魔力|melee damage|melee speed|damage|crit|speed|mana|ammo|minion|sentry|knockback)/i)
)

const armorHighlightedTextSegments = (line: string) => {
  const segments: Array<{ key: string, text: string, highlight: boolean }> = []
  const pattern = /([+\-−]?\d+(?:\.\d+)?\s*%?)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ key: `${lastIndex}-text`, text: line.slice(lastIndex, match.index), highlight: false })
    }
    segments.push({ key: `${match.index}-number`, text: match[0], highlight: true })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < line.length) segments.push({ key: `${lastIndex}-text`, text: line.slice(lastIndex), highlight: false })
  return segments.length ? segments : [{ key: 'plain', text: line, highlight: false }]
}

const armorBenefitFallbackEffects = computed<EquipmentEffectAttribute[]>(() => armorBenefitLines.value
  .flatMap((line) => {
    const attributeLines = armorEffectLinesFromLine(line)
    if (attributeLines.length) {
      return attributeLines.map((attributeLine) => ({
        ...armorEffectFromLine(attributeLine),
        classScope: 'all',
        applyScope: 'set_bonus',
      }))
    }
    return [{
      statKey: fallbackStatKey(line),
      statLabelZh: fallbackStatLabel(line),
      valueDecimal: null,
      unit: 'flat',
      classScope: 'all',
      applyScope: 'set_bonus',
      rawText: line,
      parseStatus: 'unparsed',
    } as EquipmentEffectAttribute]
  })
  .filter((effect) => effect.rawText))

const armorEffectFromLine = (line: string): EquipmentEffectAttribute => {
  const match = (armorLineLooksLikePlainAttribute(line) || armorLineLooksLikeNumericSetAttribute(line))
    ? armorEffectLineNumericMatch(line)
    : null
  const normalizedValue = match?.[1]?.replace('−', '-') ?? ''
  const numeric = Number(normalizedValue)
  return {
    statKey: fallbackStatKey(line),
    statLabelZh: fallbackStatLabel(line),
    valueDecimal: match && Number.isFinite(numeric) ? numeric : null,
    unit: match?.[2] === '%' ? 'percent' : 'flat',
    rawText: line,
    parseStatus: match ? 'fallback' : 'unparsed',
  }
}

const armorEffectLinesFromLine = (line: string) => {
  const normalizedLine = String(line ?? '').trim()
  if (!normalizedLine) return []
  const prefixMatch = normalizedLine.match(/^(.*?套装(?:奖励|效果)?[：:]\s*)(.+)$/)
  const prefix = prefixMatch?.[1] ?? ''
  const body = prefixMatch?.[2] ?? normalizedLine
  const segments = body
    .split(/[、，；;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  const candidateLines = segments.length > 1 ? segments.map((segment) => `${prefix}${segment}`) : [normalizedLine]
  // Regression marker: "套装奖励：+20% 近战速度、+20% 移动速度" contributes two totals.
  return candidateLines.filter((candidate) => (
    armorLineLooksLikePlainAttribute(candidate) || armorLineLooksLikeNumericSetAttribute(candidate)
  ))
}

const armorBenefitLineIsAttributeSummary = (line: string) => (
  armorLineLooksLikePlainAttribute(line) || armorLineLooksLikeNumericSetAttribute(line) || armorEffectLinesFromLine(line).length > 0
)

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
const asEquipmentEffects = (value: unknown): EquipmentEffectAttribute[] => Array.isArray(value)
  ? value.filter((entry): entry is EquipmentEffectAttribute => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  : []
const armorRelatedItems = computed(() => asRelatedItems(armorRaw.value?.relatedItems ?? armorRaw.value?.related_items))

const armorItemKey = (item: PublicArmorSetRelatedItem) => String(
  item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item),
).trim()

const armorUniqueItemKey = (item: PublicArmorSetRelatedItem) => [
  armorPieceRole(item),
  armorItemKey(item),
].join(':')

const armorItemEffectFetchKey = (item: PublicArmorSetRelatedItem) => String(
  item.itemId ?? item.sourceId ?? item.internalName ?? '',
).trim()

const armorUniqueRecipeItems = computed(() => {
  // armor-crafting-deduped-by-unique-item: recipe summaries are fetched once per unique armor piece, not once per build.
  const seen = new Set<string>()
  const result: PublicArmorSetRelatedItem[] = []
  for (const item of armorRelatedItems.value) {
    const itemId = armorRecipeItemId(item)
    if (!itemId || seen.has(itemId)) continue
    seen.add(itemId)
    result.push(item)
  }
  return result.sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))
})

const armorRecipeFetchKey = computed(() => armorUniqueRecipeItems.value.map(armorRecipeItemId).join(','))

const armorEquivalentItemKey = (item: PublicArmorSetRelatedItem) => normalizeMatchText(
  armorPieceName(item).replace(/^远古/, '').replace(/^Ancient\s*/i, ''),
)

const armorItemLooksAncient = (item: PublicArmorSetRelatedItem) => (
  /^远古/.test(armorPieceName(item)) || /^Ancient/i.test(String(item.name ?? item.internalName ?? ''))
)

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

const effectSummaryLine = (effect: EquipmentEffectAttribute) => {
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

const armorSourceEffectGroups = computed(() => {
  const entries = armorShownEffects.value
    .map((effect, index) => ({
      key: `${index}-${normalizeEffectLine(effectSummaryLine(effect))}`,
      label: armorSourceEffectLabel(effect),
      line: effectSummaryLine(effect),
      effect,
    }))
    .filter((entry) => entry.line)

  const grouped = new Map<string, typeof entries>()
  for (const entry of entries) {
    grouped.set(entry.label, [...(grouped.get(entry.label) ?? []), entry])
  }

  return [...grouped.entries()].map(([label, groupEntries]) => ({
    key: normalizeEffectLine(label) || label,
    label,
    entries: groupEntries,
  }))
})

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

const uniqueArmorItems = (items: PublicArmorSetRelatedItem[]) => {
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

const armorUniqueRelatedItems = computed(() => uniqueArmorItems(armorRelatedItems.value))

const armorPieceEffectRequestKeys = computed(() => dedupeEffectLines(
  armorUniqueRelatedItems.value
    .map(armorItemEffectFetchKey)
    .filter(Boolean),
))

const fetchArmorPieceEquipmentEffects = async (items: PublicArmorSetRelatedItem[]) => {
  const entries = await Promise.all(items.map(async (item) => {
    const normalizedItemId = armorItemEffectFetchKey(item)
    if (!normalizedItemId) return null

    try {
      const response = await usePublicApiFetch<EquipmentEffectAttribute[]>(
        `/public/items/${normalizedItemId}/equipment-effects`,
      )
      return {
        key: armorUniqueItemKey(item),
        effects: asEquipmentEffects(unwrapApiResponse(response)),
      }
    } catch {
      return {
        key: armorUniqueItemKey(item),
        effects: [],
      }
    }
  }))

  const result: ArmorPieceEffectRecord = {}
  for (const entry of entries) {
    if (!entry) continue
    result[entry.key] = entry.effects
  }
  return result
}

const { data: armorPieceEquipmentEffectsByKey } = await useAsyncData(
  () => `public-armor-set-piece-effects:${armorSetId.value || 'missing'}:${armorPieceEffectRequestKeys.value.join(',')}`,
  () => fetchArmorPieceEquipmentEffects(armorUniqueRelatedItems.value),
  {
    server: false,
    watch: [armorPieceEffectRequestKeys],
    default: (): ArmorPieceEffectRecord => ({}),
  },
)

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

const armorBuildRecipeSummary = (item: PublicArmorSetRelatedItem, tree: PublicItemRecipeTree | null | undefined): ArmorSetRecipeSummary | null => {
  const itemId = armorRecipeItemId(item)
  if (!itemId) return null
  const roots = compactRecipeRootNodes(tree)
  const root = roots[0]
  if (!root) return null
  const name = armorPieceName(item)
  const materials = compactRecipeNodeChildren(root).slice(0, 6).map((node, index) => buildCompactRecipeMaterial(node, index))
  const stationSeen = new Set<string>()
  const stations = compactRecipeNodeStations(root).map((station, index) => buildCompactRecipeStation(station, index)).filter((station) => {
    const key = normalizeEffectLine(`${station.name}-${station.meta}`)
    if (!key || stationSeen.has(key)) return false
    stationSeen.add(key)
    return true
  }).slice(0, 4)
  return {
    key: itemId,
    itemId,
    name,
    role: armorPieceRole(item),
    image: resolvePreviewImageUrl(item.image || ''),
    fallback: armorFirstGlyph(name),
    href: `/crafting?itemId=${itemId}&maxDepth=3`,
    recipeCount: roots.length,
    materials,
    stations,
  }
}

const fetchArmorSetRecipeSummaries = async (items: PublicArmorSetRelatedItem[]) => {
  const entries = await Promise.all(items.map(async (item) => {
    const itemId = armorRecipeItemId(item)
    if (!itemId) return null
    try {
      const response = await usePublicApiFetch<PublicItemRecipeTree>(`/public/items/${itemId}/recipe-tree`, {
        query: { maxDepth: 1 },
      })
      return armorBuildRecipeSummary(item, unwrapApiResponse(response))
    } catch {
      return null
    }
  }))
  return entries.filter((entry): entry is ArmorSetRecipeSummary => Boolean(entry))
}

const { data: armorSetRecipeSummaries } = await useAsyncData(
  () => `public-armor-set-recipes:${armorSetId.value || 'missing'}:${armorRecipeFetchKey.value}`,
  () => fetchArmorSetRecipeSummaries(armorUniqueRecipeItems.value),
  {
    server: false,
    watch: [armorRecipeFetchKey],
    default: (): ArmorSetRecipeSummary[] => [],
  },
)

const armorVisibleRecipeSummaries = computed(() => armorSetRecipeSummaries.value.slice(0, ARMOR_VISIBLE_RECIPE_LIMIT))
const armorHiddenRecipeSummaries = computed(() => armorSetRecipeSummaries.value.slice(ARMOR_VISIBLE_RECIPE_LIMIT))

const armorRecipeStationGroupKey = (recipe: ArmorSetRecipeSummary) => {
  const stationKey = recipe.stations
    .map((station) => normalizeEffectLine(`${station.name}-${station.meta}`))
    .filter(Boolean)
    .join('|')
  return stationKey || 'no-station'
}

const armorRecipeTableRows = (recipes: ArmorSetRecipeSummary[]): ArmorSetRecipeTableRow[] => {
  return recipes.map((recipe, index) => {
    const stationGroupKey = armorRecipeStationGroupKey(recipe)
    const previousRecipe = recipes[index - 1]
    const previousStationGroupKey = previousRecipe ? armorRecipeStationGroupKey(previousRecipe) : ''
    let stationRowspan = 1
    if (previousStationGroupKey !== stationGroupKey) {
      for (let nextIndex = index + 1; nextIndex < recipes.length; nextIndex += 1) {
        const nextRecipe = recipes[nextIndex]
        if (!nextRecipe || armorRecipeStationGroupKey(nextRecipe) !== stationGroupKey) break
        stationRowspan += 1
      }
    }
    return {
      ...recipe,
      stationGroupKey,
      stationRowspan,
      showStationCell: previousStationGroupKey !== stationGroupKey,
    }
  })
}

const armorVisibleRecipeRows = computed(() => armorRecipeTableRows(armorVisibleRecipeSummaries.value))
const armorHiddenRecipeRows = computed(() => armorRecipeTableRows(armorHiddenRecipeSummaries.value))

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
      <div v-if="armorDetailVisualLoading" class="armor-detail-loading-skeleton">
        <section class="support-panel armor-detail-hero armor-detail-loading-hero">
          <div>
            <CommonTpSkeleton type="pill" class="armor-detail-loading-kicker" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-title" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-copy" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-copy short" short />
            <div class="tag-row" aria-hidden="true">
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="pill" />
            </div>
          </div>
        </section>

        <div class="armor-analysis-layout armor-detail-loading-modules">
          <section class="support-panel armor-module armor-stat-module" :class="detailLayout.detailModuleClass">
            <div class="armor-module-head">
              <div>
                <CommonTpSkeleton type="line" class="armor-detail-loading-heading" />
                <CommonTpSkeleton type="line" class="armor-detail-loading-subheading" />
              </div>
            </div>
            <div class="armor-build-board armor-build-matrix">
              <article v-for="slot in 3" :key="`armor-detail-loading-stat-${slot}`" class="armor-build-row armor-build-mobile-card-layout armor-detail-loading-stat">
                <div class="armor-build-cell armor-build-title-cell">
                  <CommonTpSkeleton type="line" />
                </div>
                <div class="armor-build-cell armor-build-icons">
                  <span v-for="piece in 3" :key="`armor-detail-loading-stat-${slot}-${piece}`" class="armor-build-piece">
                    <CommonTpSkeleton type="icon" />
                    <CommonTpSkeleton type="line" />
                  </span>
                </div>
                <div class="armor-build-cell armor-build-defense-formula">
                  <CommonTpSkeleton type="line" />
                </div>
                <div class="armor-build-cell armor-build-difference-cell">
                  <CommonTpSkeleton type="line" />
                  <CommonTpSkeleton type="line" />
                  <CommonTpSkeleton type="line" short />
                </div>
              </article>
            </div>
          </section>

          <section class="support-panel armor-module armor-crafting-module" :class="detailLayout.detailModuleClass">
            <div class="armor-module-head">
              <div>
                <CommonTpSkeleton type="line" class="armor-detail-loading-heading" />
                <CommonTpSkeleton type="line" class="armor-detail-loading-subheading" />
              </div>
            </div>
            <div class="armor-crafting-summary-list">
              <div v-for="slot in 3" :key="`armor-detail-loading-recipe-${slot}`" class="armor-detail-loading-recipe-row">
                <CommonTpSkeleton type="icon" />
                <CommonTpSkeleton type="line" />
                <CommonTpSkeleton type="line" />
              </div>
            </div>
          </section>
        </div>
      </div>

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
        <div class="armor-hero-shell">
          <div class="armor-hero-main">
            <span class="armor-hero-eyebrow">数值总览 · {{ armorSubtitle }}</span>
            <h1>{{ armorTitle }}</h1>
            <p>{{ armorHeroSummary }}</p>
            <div class="tag-row armor-hero-tags">
              <span class="tag gold">{{ armorDetail?.primaryPart || 'set' }}</span>
              <span class="tag moss">{{ armorDetail?.uniqueItemCount ?? 0 }} 个部件</span>
              <span class="tag paper">{{ armorShownEffects.length }} 条数值</span>
            </div>
          </div>
          <div v-if="armorPrimaryPreview" class="armor-hero-preview" aria-label="套装预览">
            <CommonPreviewImage
              :src="resolvePreviewImageUrl(armorPrimaryPreview)"
              :alt="`${armorTitle} 预览`"
              :fallback="armorDetail?.fallback || armorTitle.slice(0, 1)"
              :fallback-icon="armorPrimaryPreviewIcon"
              width="76"
              height="76"
            />
            <span>展示预览</span>
          </div>
        </div>
      </section>

      <div class="armor-analysis-layout">
        <div class="armor-primary-layout">
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
            <!-- armor-build-comparison-first-order: this comparison section is rendered before the full piece catalog. -->
            <div class="armor-build-board armor-structured-build-board armor-build-matrix" role="table" aria-label="套装构筑对比">
              <div class="armor-build-row armor-build-row-head armor-build-mobile-hidden-header" role="row">
                <b>构筑</b>
                <b>部件</b>
                <b>防御</b>
                <b>构筑差异</b>
              </div>
              <section v-if="armorHasVariantBuilds && armorFixedBonusLines.length" class="armor-build-row armor-fixed-bonus-row" role="row">
                <div class="armor-build-cell armor-build-title-cell" role="cell">
                  <strong>全套固定</strong>
                </div>
                <div class="armor-build-cell" role="cell">
                  <span>固定部件 / 套装</span>
                </div>
                <div class="armor-build-cell armor-build-defense-formula" role="cell">
                  <span>公共</span>
                </div>
                <div class="armor-build-cell armor-fixed-bonus-lines" role="cell">
                  <div v-for="group in armorFixedBonusGroups" :key="`fixed-${group.key}`" class="armor-fixed-bonus-group" :class="group.tone">
                    <strong class="armor-fixed-bonus-group-title">{{ group.label }}</strong>
                    <span v-for="entry in group.entries" :key="`fixed-${group.key}-${entry.key}`" class="armor-fixed-bonus-line">
                      <small v-if="entry.value">{{ entry.value }}</small>
                      <b>{{ entry.text }}</b>
                      <em v-if="entry.description">{{ entry.description }}</em>
                    </span>
                  </div>
                </div>
              </section>
              <article v-for="build in armorSetBuildCards" :key="build.key" class="armor-build-row armor-build-mobile-card-layout" role="row">
                <div class="armor-build-cell armor-build-title-cell" role="cell">
                  <strong>{{ build.title }}</strong>
                </div>
                <div class="armor-build-cell armor-build-icons" role="cell">
                  <section v-for="part in build.partGroups" :key="`${build.key}-${part.key}`" class="armor-build-part-group">
                    <div class="armor-build-part-head">
                      <b>{{ part.role }}</b>
                      <small>{{ part.alternatives.length > 1 ? `${part.alternatives.length} 件可互换` : '固定' }}</small>
                    </div>
                    <div class="armor-build-part-alternatives">
                      <div
                        class="armor-build-piece-evidence armor-build-piece-evidence-compact armor-build-piece-evidence-collapsible"
                        :class="{ 'has-alternatives': part.alternatives.length > 1, 'is-expanded': part.expanded }"
                      >
                        <!-- armor-build-piece-group-summary-collapsible: each slot starts as one joined-name row and expands on demand. -->
                        <button
                          type="button"
                          class="armor-build-piece-summary"
                          :aria-describedby="part.tooltip ? part.tooltipId : undefined"
                          :aria-expanded="part.expanded ? 'true' : 'false'"
                          @click="toggleArmorPieceEvidence(`${build.key}-${part.key}`)"
                        >
                          <CommonPreviewImage
                            :src="resolvePreviewImageUrl(part.alternatives[0]?.item.image || '')"
                            :alt="part.summary"
                            :fallback="part.summary.slice(0, 1)"
                            fallback-icon="icon-items"
                            width="42"
                            height="42"
                          />
                          <span class="armor-build-piece-summary-text">
                            <b>{{ part.summary }}</b>
                            <small>{{ part.alternatives.length > 1 ? `${part.alternatives.length} 件可互换` : (part.alternatives[0]?.defense || '固定') }}</small>
                          </span>
                          <span class="armor-build-piece-summary-toggle" aria-hidden="true">
                            {{ part.expanded ? '收起' : '展开' }}
                          </span>
                          <span
                            v-if="part.tooltip"
                            :id="part.tooltipId"
                            class="armor-build-piece-summary-tooltip"
                            role="tooltip"
                          >
                            {{ part.tooltip }}
                          </span>
                        </button>
                        <!-- armor-build-piece-details-expandable: detailed per-piece data is hidden until the summary is expanded. -->
                        <div v-if="part.expanded" class="armor-build-piece-details">
                          <div v-for="piece in part.alternatives" :key="`${build.key}-${part.key}-${piece.key}`" class="armor-build-piece-detail-row">
                            <strong>{{ piece.name }}</strong>
                            <small v-if="piece.defense">{{ piece.defense }}</small>
                            <em
                              v-for="effect in piece.effects"
                              :key="`${build.key}-${part.key}-${piece.key}-${effect.key}`"
                              class="armor-build-piece-effect"
                              :class="{ 'has-tooltip armor-build-tooltip-visible-affordance armor-build-tooltip-touch-affordance': effect.title }"
                              tabindex="0"
                            >
                              {{ effect.text }}
                              <span v-if="effect.title" class="armor-build-piece-effect-info" aria-hidden="true">i</span>
                              <span v-if="effect.title" class="armor-build-piece-effect-tooltip" role="tooltip">
                                {{ effect.title }}
                              </span>
                            </em>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
                <div class="armor-build-cell armor-build-defense-formula armor-build-defense-emphasis" role="cell">
                  <strong v-if="build.defense.total != null">{{ build.defense.total }}</strong>
                  <small v-if="build.defense.formula">{{ build.defense.formula }}</small>
                  <span v-else>--</span>
                </div>
                <div class="armor-build-cell armor-build-difference-cell" role="cell">
                  <div v-if="build.statGroups.length" class="armor-build-effect-groups">
                    <div v-for="group in build.statGroups" :key="`${build.key}-${group.key}`" class="armor-fixed-bonus-group" :class="group.tone">
                      <strong class="armor-fixed-bonus-group-title">{{ group.label }}</strong>
                      <span v-for="entry in group.entries" :key="`${build.key}-${group.key}-${entry.key}`" class="armor-fixed-bonus-line">
                        <small v-if="entry.value">{{ entry.value }}</small>
                        <b>{{ entry.text }}</b>
                        <em v-if="entry.description">{{ entry.description }}</em>
                      </span>
                    </div>
                  </div>
                  <div v-if="build.totalEntries.length || build.bonusLines.length" class="armor-build-summary-stack">
                    <div v-if="build.totalEntries.length" class="armor-build-total-strip" aria-label="最终汇总">
                      <span class="armor-build-total-label armor-build-summary-title">最终汇总</span>
                      <div class="armor-build-total-entries">
                        <span
                          v-for="entry in build.totalEntries"
                          :key="`${build.key}-total-${entry.key}`"
                          class="armor-build-total-entry"
                          :class="{ 'is-variable': entry.isVariable }"
                        >
                          <mark class="armor-highlight-number">{{ entry.value }}</mark>
                          <b>{{ entry.label }}</b>
                          <em v-if="entry.isVariable">可变合计</em>
                        </span>
                      </div>
                    </div>
                    <div v-if="build.bonusLines.length" class="armor-set-bonus-lines">
                      <strong class="armor-set-bonus-heading">套装效果</strong>
                      <div class="armor-set-bonus-list">
                        <p v-for="line in build.bonusLines" :key="`${build.key}-bonus-${line}`" class="armor-set-bonus-line">
                          <template v-for="segment in armorHighlightedTextSegments(line)" :key="`${build.key}-${line}-${segment.key}`">
                            <mark v-if="segment.highlight" class="armor-highlight-number">{{ segment.text }}</mark>
                            <span v-else>{{ segment.text }}</span>
                          </template>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            </div>
            <p v-else class="tp-detail-empty">暂无可展示的解析数值。</p>

            <div v-if="armorFallbackBenefitLines.length" class="armor-source-context">
              <span v-for="line in armorFallbackBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
            </div>
          </section>

          <!-- armor-detail-right-fact-panel-not-primary: low-value fact cards are removed from the right rail. -->
          <section v-if="armorSetRecipeSummaries.length" class="support-panel armor-module armor-crafting-module" :class="detailLayout.detailModuleClass">
            <div class="armor-module-head">
              <div>
                <h2>制作配方</h2>
                <p>相同制作站合并显示；不同制作站保留逐行归属。</p>
              </div>
              <span class="tag paper">{{ armorSetRecipeSummaries.length }} 个部件</span>
            </div>

            <div class="armor-crafting-summary-list">
              <table class="armor-crafting-table">
                <thead class="armor-crafting-table-head">
                  <tr>
                    <th>部件</th>
                    <th>材料</th>
                    <th>制作站</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="recipe in armorVisibleRecipeRows" :key="recipe.key" class="armor-crafting-summary-row">
                    <td class="armor-crafting-piece-cell">
                      <div class="armor-crafting-piece">
                        <CommonPreviewImage
                          :src="recipe.image"
                          :alt="recipe.name"
                          :fallback="recipe.fallback"
                          fallback-icon="icon-items"
                          width="32"
                          height="32"
                        />
                        <span>
                          <b>{{ recipe.name }}</b>
                          <small>{{ recipe.role }} · {{ recipe.recipeCount }} 条</small>
                        </span>
                      </div>
                    </td>

                    <td class="armor-crafting-chip-line" aria-label="材料摘要">
                      <CraftingCompactRecipeMaterials :materials="recipe.materials" />
                    </td>

                    <td
                      v-if="recipe.showStationCell"
                      class="armor-crafting-station-cell is-merged"
                      :rowspan="recipe.stationRowspan"
                    >
                      <template v-if="recipe.stations.length">
                        <span v-for="(station, index) in recipe.stations" :key="`${recipe.key}-station-${station.key}`" class="armor-crafting-station-text">
                          <CommonPreviewImage
                            :src="station.image"
                            :alt="station.name"
                            :fallback="station.fallback"
                            fallback-icon="icon-crafting"
                            width="18"
                            height="18"
                          />
                          <b>{{ station.name }}</b>
                          <em v-if="index < recipe.stations.length - 1">或</em>
                        </span>
                      </template>
                      <span v-else class="armor-crafting-station is-empty">无需制作站</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <details v-if="armorHiddenRecipeSummaries.length" class="armor-crafting-overflow armor-crafting-overflow-collapsed">
                <summary>展开其余 {{ armorHiddenRecipeSummaries.length }} 个部件配方</summary>
                <div class="armor-crafting-overflow-list">
                  <table class="armor-crafting-table">
                    <thead class="armor-crafting-table-head">
                      <tr>
                        <th>部件</th>
                        <th>材料</th>
                        <th>制作站</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="recipe in armorHiddenRecipeRows" :key="`hidden-${recipe.key}`" class="armor-crafting-summary-row">
                        <td class="armor-crafting-piece-cell">
                          <div class="armor-crafting-piece">
                            <CommonPreviewImage
                              :src="recipe.image"
                              :alt="recipe.name"
                              :fallback="recipe.fallback"
                              fallback-icon="icon-items"
                              width="32"
                              height="32"
                            />
                            <span>
                              <b>{{ recipe.name }}</b>
                              <small>{{ recipe.role }} · {{ recipe.recipeCount }} 条</small>
                            </span>
                          </div>
                        </td>

                        <td class="armor-crafting-chip-line" aria-label="材料摘要">
                          <CraftingCompactRecipeMaterials :materials="recipe.materials" />
                        </td>

                        <td
                          v-if="recipe.showStationCell"
                          class="armor-crafting-station-cell is-merged"
                          :rowspan="recipe.stationRowspan"
                        >
                          <template v-if="recipe.stations.length">
                            <span v-for="(station, index) in recipe.stations" :key="`${recipe.key}-hidden-station-${station.key}`" class="armor-crafting-station-text">
                              <CommonPreviewImage
                                :src="station.image"
                                :alt="station.name"
                                :fallback="station.fallback"
                                fallback-icon="icon-crafting"
                                width="18"
                                height="18"
                              />
                              <b>{{ station.name }}</b>
                              <em v-if="index < recipe.stations.length - 1">或</em>
                            </span>
                          </template>
                          <span v-else class="armor-crafting-station is-empty">无需制作站</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </section>
        </div>

        <!-- armor-preview-promoted-after-stats: display images now sit immediately after build comparison. -->
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
  padding: 18px 20px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(219, 179, 93, 0.11), rgba(100, 154, 118, 0.045) 42%, transparent),
    var(--index-grid-x),
    var(--index-grid-y),
    rgba(11, 18, 13, 0.88);
}

.armor-hero-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-width: 0;
}

.armor-detail-loading-skeleton {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.armor-detail-loading-hero {
  min-height: 176px;
}

.armor-detail-loading-hero > div,
.armor-detail-loading-modules {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.armor-detail-loading-kicker {
  width: min(180px, 58%);
}

.armor-detail-loading-title {
  width: min(360px, 78%);
  height: 30px;
}

.armor-detail-loading-copy {
  width: min(560px, 100%);
}

.armor-detail-loading-copy.short,
.armor-detail-loading-subheading {
  width: min(360px, 72%);
}

.armor-detail-loading-heading {
  width: min(220px, 66%);
}

.armor-detail-loading-stat,
.armor-detail-loading-recipe-row {
  pointer-events: none;
}

.armor-detail-loading-stat .armor-build-piece {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.armor-detail-loading-stat .tp-skeleton-icon {
  width: 38px;
  height: 38px;
}

.armor-detail-loading-recipe-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(92px, 0.42fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid rgba(244, 234, 208, 0.08);
}

.armor-detail-loading-recipe-row .tp-skeleton-icon {
  width: 32px;
  height: 32px;
}

.armor-hero-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  color: rgba(242, 211, 132, 0.95);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-hero-eyebrow::before {
  content: "";
  width: 28px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  flex: 0 0 auto;
}

.armor-detail-hero h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(26px, 3vw, 38px);
  font-weight: 950;
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.armor-detail-hero p {
  max-width: 900px;
  margin: 0;
  color: rgba(255, 248, 224, 0.94);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.armor-hero-tags {
  margin-top: 2px;
}

.armor-hero-tags .tag {
  min-height: 26px;
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 11px;
}

.armor-hero-preview {
  display: grid;
  gap: 7px;
  justify-items: center;
  min-width: 96px;
  padding: 10px;
  border: 1px solid rgba(244, 234, 208, 0.11);
  border-radius: 8px;
  background: rgba(244, 234, 208, 0.04);
}

.armor-hero-preview :deep(.item-art) {
  width: 76px;
  height: 76px;
  border-radius: 10px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-hero-preview span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
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

.armor-crafting-summary-list {
  display: grid;
  min-width: 0;
  border: 1px solid rgba(244, 234, 208, 0.13);
  border-radius: 7px;
  background: rgba(12, 15, 11, 0.2);
  overflow-x: visible;
  overflow-y: visible;
}

.armor-crafting-table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.armor-crafting-table th,
.armor-crafting-table td {
  min-width: 0;
  padding: 5px 4px;
  border-top: 1px solid rgba(244, 234, 208, 0.08);
  border-left: 1px solid rgba(244, 234, 208, 0.11);
  vertical-align: middle;
  text-align: center;
}

.armor-crafting-table th:first-child,
.armor-crafting-table td:first-child {
  border-left: 0;
}

.armor-crafting-table tbody tr:first-child td {
  border-top: 0;
}

.armor-crafting-table th:nth-child(1),
.armor-crafting-table td:nth-child(1) {
  width: 38%;
}

.armor-crafting-table th:nth-child(2),
.armor-crafting-table td:nth-child(2) {
  width: 32%;
}

.armor-crafting-table th:nth-child(3),
.armor-crafting-table td:nth-child(3) {
  width: 30%;
}

.armor-crafting-table-head {
  border-bottom: 1px solid rgba(244, 234, 208, 0.13);
  background: rgba(244, 234, 208, 0.045);
}

.armor-crafting-table-head th {
  min-width: 0;
  color: rgba(242, 211, 132, 0.96);
  font-size: 10px;
  font-weight: 950;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-crafting-summary-row {
  background: rgba(244, 234, 208, 0.026);
}

.armor-crafting-piece-cell {
  text-align: left;
}

.armor-crafting-piece {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.armor-crafting-piece :deep(.item-art),
.armor-crafting-chip :deep(.item-art),
.armor-crafting-station-text :deep(.item-art) {
  border-radius: 7px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-crafting-piece span {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.armor-crafting-piece b,
.armor-crafting-chip-compact b {
  min-width: 0;
  color: var(--text);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: normal;
  word-break: keep-all;
}

.armor-crafting-piece small,
.armor-crafting-chip-compact small {
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  line-height: 1.2;
}

.armor-crafting-chip-line {
  min-width: 0;
  text-align: center;
}

.armor-crafting-material-list {
  display: grid;
  gap: 5px;
  justify-items: center;
  min-width: 0;
}

.armor-crafting-material-row {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
}

.armor-crafting-any-material {
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  padding: 3px 4px;
  border-radius: 6px;
  background: rgba(125, 229, 220, 0.045);
}

.armor-crafting-any-option {
  display: inline-grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 3px;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.armor-crafting-any-option b {
  min-width: 0;
  color: var(--text);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.armor-crafting-any-label {
  display: grid;
  justify-items: center;
  gap: 0;
  min-width: 0;
  padding: 2px 0;
  color: var(--muted);
  font-size: 9px;
  font-weight: 850;
  line-height: 1.15;
}

.armor-crafting-any-label b,
.armor-crafting-any-label small {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.armor-crafting-chip-compact {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: center;
}

.armor-crafting-chip-art {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  overflow: hidden;
}

.armor-crafting-chip-compact :deep(.item-art) {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 5px;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
}

.armor-crafting-chip-compact :deep(.item-art img),
.armor-crafting-station-text :deep(.item-art img) {
  width: 18px;
  height: 18px;
  max-width: 18px;
  max-height: 18px;
}

.armor-crafting-chip-copy {
  display: grid;
  gap: 0;
  min-width: 48px;
  max-width: 76px;
}

.armor-crafting-chip-compact b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}

.armor-crafting-chip-compact small {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.armor-crafting-chip-line em {
  color: var(--muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 850;
}

.armor-crafting-station-cell {
  min-width: 0;
  background: rgba(125, 229, 220, 0.025);
}

.armor-crafting-station-cell.is-merged {
  text-align: center;
  vertical-align: middle;
}

.armor-crafting-station-text {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
}

.armor-crafting-station-text + .armor-crafting-station-text {
  margin-top: 4px;
}

.armor-crafting-station-text :deep(.item-art) {
  width: 18px;
  height: 18px;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
}

.armor-crafting-station-text b {
  min-width: 0;
  color: rgba(125, 229, 220, 0.95);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: normal;
  word-break: keep-all;
}

.armor-crafting-station-text em {
  display: block;
  width: 100%;
  grid-column: 1 / -1;
  color: rgba(242, 211, 132, 0.95);
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
  line-height: 1;
}

.armor-crafting-station.is-empty {
  color: var(--muted);
  font-size: 12px;
  font-weight: 850;
}

.armor-crafting-overflow {
  display: grid;
  gap: 0;
  min-width: 0;
  border-top: 1px solid rgba(244, 234, 208, 0.08);
}

.armor-crafting-overflow summary {
  width: fit-content;
  max-width: 100%;
  margin: 8px 10px;
  padding: 7px 9px;
  border: 1px solid rgba(219, 179, 93, 0.18);
  border-radius: 6px;
  background: rgba(219, 179, 93, 0.055);
  color: rgba(242, 211, 132, 0.95);
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
  list-style: none;
}

.armor-crafting-overflow summary::-webkit-details-marker {
  display: none;
}

.armor-crafting-overflow-list {
  display: grid;
  gap: 0;
  min-width: 0;
}

.armor-analysis-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.armor-primary-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.35fr) minmax(300px, 1fr);
  gap: 14px;
  align-items: start;
  min-width: 0;
}

.armor-stat-module,
.armor-preview-module,
.armor-crafting-module {
  min-width: 0;
  align-content: start;
}

.armor-crafting-module {
  position: sticky;
  top: 14px;
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
  grid-template-columns: minmax(96px, 0.65fr) minmax(210px, 1.1fr) minmax(92px, 0.44fr) minmax(220px, 1.35fr);
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
  display: grid;
  gap: 7px;
  min-width: 0;
}

.armor-build-part-group {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.armor-build-part-head {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.armor-build-part-head b {
  color: rgba(219, 179, 93, 0.95);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.2;
}

.armor-build-part-head small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.2;
}

.armor-build-part-alternatives {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.armor-build-piece-evidence {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(244, 234, 208, 0.08);
  border-radius: 6px;
  background: rgba(244, 234, 208, 0.025);
}

.armor-build-piece-evidence.has-alternatives {
  border-color: rgba(219, 179, 93, 0.16);
  background: rgba(219, 179, 93, 0.04);
}

.armor-build-piece-summary {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 3px 9px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.armor-build-icons :deep(.item-art) {
  justify-self: center;
  width: 42px;
  height: 42px;
  border-radius: 7px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-build-piece-summary-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.armor-build-piece-summary-text b {
  min-width: 0;
  color: var(--text);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-summary-text small,
.armor-build-icons small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.armor-build-piece-summary-toggle {
  justify-self: end;
  padding: 2px 6px;
  border: 1px solid rgba(219, 179, 93, 0.2);
  border-radius: 999px;
  color: rgba(219, 179, 93, 0.96);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.1;
}

.armor-build-piece-summary-tooltip {
  position: absolute;
  z-index: 24;
  left: 0;
  bottom: calc(100% + 7px);
  display: none;
  width: max-content;
  max-width: min(360px, 74vw);
  padding: 8px 10px;
  border: 1px solid rgba(245, 193, 92, 0.36);
  border-radius: 6px;
  background: rgba(13, 16, 12, 0.97);
  color: rgba(255, 248, 224, 0.95);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.38);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
  white-space: normal;
  pointer-events: none;
}

/* armor-build-piece-summary-tooltip-hover-focus: summary hover/focus reveals concrete values from real piece data. */
.armor-build-piece-summary:hover .armor-build-piece-summary-tooltip,
.armor-build-piece-summary:focus-visible .armor-build-piece-summary-tooltip {
  display: block;
}

.armor-build-piece-details {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding-top: 5px;
  border-top: 1px solid rgba(244, 234, 208, 0.08);
}

.armor-build-piece-detail-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  min-width: 0;
}

.armor-build-piece-detail-row strong {
  min-width: 0;
  color: var(--text);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-detail-row small {
  justify-self: end;
}

.armor-build-piece-evidence em {
  position: relative;
  grid-column: 1 / -1;
  min-width: 0;
  color: rgba(226, 236, 224, 0.82);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-effect.has-tooltip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  cursor: help;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.armor-build-piece-effect-info {
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  border: 1px solid rgba(219, 179, 93, 0.38);
  border-radius: 999px;
  color: rgba(242, 211, 132, 0.96);
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  flex: 0 0 auto;
}

.armor-build-piece-effect-tooltip {
  position: absolute;
  z-index: 20;
  left: 0;
  bottom: calc(100% + 6px);
  display: none;
  width: max-content;
  max-width: min(320px, 70vw);
  padding: 7px 9px;
  border: 1px solid rgba(245, 193, 92, 0.36);
  border-radius: 6px;
  background: rgba(13, 16, 12, 0.96);
  color: rgba(255, 248, 224, 0.95);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.36);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
  white-space: normal;
  pointer-events: none;
}

.armor-build-piece-effect.has-tooltip:hover .armor-build-piece-effect-tooltip,
.armor-build-piece-effect.has-tooltip:focus-visible .armor-build-piece-effect-tooltip {
  display: block;
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
  font-size: 24px;
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

.armor-fixed-bonus-lines {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px 10px;
  align-content: center;
  align-items: stretch;
}

.armor-build-difference-cell {
  display: grid;
  gap: 8px;
  align-content: start;
  align-items: stretch;
  min-width: 0;
}

.armor-build-effect-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 10px;
  align-content: center;
  align-items: stretch;
}

.armor-build-summary-stack {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.armor-build-total-strip {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(100, 154, 118, 0.32);
  border-radius: 7px;
  background:
    linear-gradient(135deg, rgba(100, 154, 118, 0.12), rgba(219, 179, 93, 0.045)),
    rgba(100, 154, 118, 0.055);
}

.armor-build-total-label,
.armor-set-bonus-heading {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  color: rgba(166, 200, 176, 0.95);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
}

.armor-set-bonus-lines {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 0 1px;
}

.armor-set-bonus-list {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.armor-set-bonus-heading {
  color: rgba(166, 200, 176, 0.95);
}

.armor-build-total-entries {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-total-entry {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: rgba(226, 236, 224, 0.95);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.24;
}

.armor-build-total-entry.is-variable {
  color: rgba(244, 234, 208, 0.98);
}

.armor-build-total-entry em {
  color: rgba(219, 179, 93, 0.92);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  line-height: 1.2;
}

.armor-set-bonus-line {
  position: relative;
  margin: 0;
  padding-left: 10px;
  color: rgba(226, 236, 224, 0.94);
  font-size: 12px;
  font-weight: 730;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.armor-set-bonus-line::before {
  position: absolute;
  top: 0.72em;
  left: 1px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(166, 200, 176, 0.68);
  content: '';
}

.armor-highlight-number {
  padding: 0 3px;
  border-radius: 4px;
  background: rgba(219, 179, 93, 0.16);
  color: rgba(242, 211, 132, 0.98);
  font-weight: 930;
}

.armor-fixed-bonus-group {
  display: grid;
  gap: 3px;
  min-width: 0;
  align-content: start;
}

.armor-fixed-bonus-group-title {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  margin-bottom: 2px;
  padding: 2px 7px;
  border: 1px solid rgba(244, 234, 208, 0.1);
  border-radius: 999px;
  background: rgba(244, 234, 208, 0.04);
  color: var(--muted);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.25;
}

.armor-fixed-bonus-group.is-attribute .armor-fixed-bonus-group-title {
  color: rgba(219, 179, 93, 0.95);
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-group-title {
  color: rgba(166, 200, 176, 0.95);
}

.armor-fixed-bonus-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 5px 8px;
  align-items: start;
  min-width: 0;
  padding: 5px 0;
  border-bottom: 1px solid rgba(244, 234, 208, 0.08);
}

.armor-fixed-bonus-line small {
  display: inline-grid;
  place-items: center;
  min-width: 36px;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid rgba(219, 179, 93, 0.22);
  border-radius: 999px;
  background: rgba(219, 179, 93, 0.08);
  color: rgba(219, 179, 93, 0.9);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-fixed-bonus-line b {
  min-width: 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 760;
  line-height: 1.42;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-line em {
  grid-column: 2;
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-line {
  grid-template-columns: minmax(0, 1fr);
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-line b {
  color: rgba(226, 236, 224, 0.92);
  font-weight: 720;
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
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-top: 1px solid rgba(244, 234, 208, 0.07);
}

.armor-piece-option :deep(.item-art) {
  justify-self: center;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
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
  .armor-primary-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .armor-crafting-module {
    position: static;
  }

  .armor-analysis-layout {
    grid-template-columns: 1fr;
  }
  .armor-pieces-layout {
    grid-template-columns: 1fr;
  }

  .armor-build-row {
    grid-template-columns: minmax(0, 0.74fr) minmax(0, 1.26fr);
  }

  .armor-build-row-head {
    display: none;
  }
}

@media (max-width: 520px) {
  .armor-detail-hero {
    padding: 14px;
  }

  .armor-hero-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .armor-hero-preview {
    grid-template-columns: 52px minmax(0, 1fr);
    justify-items: start;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 8px;
  }

  .armor-hero-preview :deep(.item-art) {
    width: 52px;
    height: 52px;
    border-radius: 8px;
  }

  .armor-detail-hero h1 {
    font-size: 24px;
  }

  .armor-detail-hero p {
    font-size: 14px;
    line-height: 1.55;
  }

  .armor-crafting-summary-list {
    overflow-x: auto;
  }

  .armor-crafting-table {
    min-width: 420px;
  }

  .armor-crafting-table th,
  .armor-crafting-table td {
    padding: 7px 6px;
  }

  .armor-crafting-piece {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .armor-crafting-piece :deep(.item-art) {
    width: 22px;
    height: 22px;
  }

  .armor-build-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
  }

  .armor-build-title-cell {
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(244, 234, 208, 0.1);
  }

  .armor-build-title-cell strong {
    font-size: 15px;
  }

  .armor-build-defense-formula {
    order: 1;
    align-items: baseline;
  }

  .armor-build-difference-cell {
    order: 2;
  }

  .armor-build-icons {
    order: 3;
  }

  .armor-build-total-strip {
    padding: 10px;
  }

  .armor-build-total-entry {
    font-size: 12.5px;
  }

  .armor-build-part-alternatives {
    grid-template-columns: 1fr;
  }

  .armor-build-piece-evidence {
    grid-template-columns: 1fr;
    padding: 6px 7px;
  }

  .armor-build-piece-evidence .armor-build-piece-effect {
    display: none;
  }

  .armor-build-piece-evidence:focus-within .armor-build-piece-effect,
  .armor-build-piece-evidence:hover .armor-build-piece-effect,
  .armor-build-piece-evidence.is-expanded .armor-build-piece-effect {
    display: inline-flex;
  }

  .armor-build-icons :deep(.item-art) {
    width: 34px;
    height: 34px;
  }

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

@media (hover: none), (pointer: coarse) {
  .armor-build-piece-effect.has-tooltip {
    display: grid;
    gap: 3px;
    text-decoration: none;
  }

  .armor-build-piece-effect-info {
    display: none;
  }

  .armor-build-piece-effect-tooltip {
    position: static;
    display: block;
    width: auto;
    max-width: 100%;
    padding: 4px 6px;
    border-color: rgba(219, 179, 93, 0.22);
    background: rgba(219, 179, 93, 0.06);
    box-shadow: none;
    color: rgba(244, 234, 208, 0.9);
    font-size: 10px;
    line-height: 1.35;
  }

  .armor-build-piece-evidence .armor-build-piece-effect.has-tooltip {
    display: none;
  }

  .armor-build-piece-evidence:focus-within .armor-build-piece-effect.has-tooltip,
  .armor-build-piece-evidence:hover .armor-build-piece-effect.has-tooltip,
  .armor-build-piece-evidence.is-expanded .armor-build-piece-effect.has-tooltip {
    display: grid;
  }
}
</style>
