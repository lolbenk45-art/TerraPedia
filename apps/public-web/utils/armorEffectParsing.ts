import type { EquipmentEffectAttribute } from '~/types/public-api'

// 中文防具效果文案解析引擎:纯函数集合,从 pages/armor-sets/[id].vue 迁出。
// 这些函数只依赖入参文本,不触碰任何响应式页面状态,便于单测与复用。

export const statLabels: Record<string, string> = {
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

export const normalizeMatchText = (value: string) => value
  .toLowerCase()
  .replace(/[()\[\]（）【】·・.'"]/g, '')
  .replace(/\s+/g, '')

export const normalizeEffectLine = (line: string) => line
  .toLowerCase()
  .replace(/[+\s:：，、；;（）()[\]·・.'"]/g, '')
  .replace(/−/g, '-')

export const dedupeEffectLines = (lines: string[]) => {
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

export const fallbackStatKey = (line: string) => {
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

export const fallbackStatLabel = (line: string) => statLabels[fallbackStatKey(line)] ?? '特效'

export const armorLineLooksLikePlainAttribute = (line: string) => (
  /^\s*[+\-−]?\d+(?:\.\d+)?\s*%?\s*[^，、；;（）()]*/.test(line)
  && !/套装|奖励|效果|增益|提供|触发|获得|召唤|免疫|闪避|不受|击中|每级|最高|降低/.test(line)
)

export const armorLineLooksLikeNumericSetAttribute = (line: string) => (
  // Regression marker: "套装奖励：魔力消耗降低 17%" contributes "-17% 魔力消耗" to 最终汇总.
  !/(?:每级|最高|持续|造成|召唤|生成|提供不断累积|基础伤害)/.test(line)
  && (
  /(?:降低|减少|减免|增加|提高)\s*[+\-−]?\d+(?:\.\d+)?\s*%?/.test(line)
  || /[+\-−]?\d+(?:\.\d+)?\s*%?\s*[^，、；;（）()]*(?:降低|减少|减免|增加|提高|不消耗弹药|减少弹药消耗|哨兵容量|仆从容量|召唤伤害|近战伤害|远程伤害|魔法伤害|伤害|暴击|移动速度|移速|近战(?:攻击)?速度|仇恨|击退|魔力花费|魔力消耗|魔力上限|最大魔力|melee damage|melee speed|damage|crit|speed|mana|ammo|minion|sentry|knockback)/i.test(line)
  )
)

export const armorEffectLineNumericMatch = (line: string) => (
  line.match(/^\s*([+\-−]?\d+(?:\.\d+)?)\s*(%?)/)
  ?? line.match(/(?:降低|减少|减免|增加|提高)\s*([+\-−]?\d+(?:\.\d+)?)\s*(%?)/)
  ?? line.match(/([+\-−]?\d+(?:\.\d+)?)\s*(%?)\s*[^，、；;（）()]*(?:降低|减少|减免|增加|提高|不消耗弹药|减少弹药消耗|哨兵容量|仆从容量|召唤伤害|近战伤害|远程伤害|魔法伤害|伤害|暴击|移动速度|移速|近战(?:攻击)?速度|仇恨|击退|魔力花费|魔力消耗|魔力上限|最大魔力|melee damage|melee speed|damage|crit|speed|mana|ammo|minion|sentry|knockback)/i)
)

export const armorHighlightedTextSegments = (line: string) => {
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

export const armorEffectFromLine = (line: string): EquipmentEffectAttribute => {
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

export const armorEffectLinesFromLine = (line: string) => {
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

export const armorBenefitLineIsAttributeSummary = (line: string) => (
  armorLineLooksLikePlainAttribute(line) || armorLineLooksLikeNumericSetAttribute(line) || armorEffectLinesFromLine(line).length > 0
)

export const armorIdentityAliases = (value: string) => {
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
