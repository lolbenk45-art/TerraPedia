import type { ArmorSetCatalogItem, EquipmentEffectAttribute } from '~/types/public-api'

// 套装列表卡片与聚焦区共享的纯展示函数(WP-9 去重):卡片抽成 ArmorSetCard.vue 后,
// 这些 helper 由页面(spotlight)与卡片组件共同引用,避免逻辑复制两份。

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

export const armorSecondaryLabel = (armor: ArmorSetCatalogItem) => (
  armor.englishName || '防具套装'
)

const numberLabel = (value: number | null | undefined) => (
  value == null ? '未标记' : value.toLocaleString('zh-CN')
)

export const formatEffectValue = (effect: EquipmentEffectAttribute) => {
  const numeric = Number(effect.valueDecimal)
  if (!Number.isFinite(numeric)) {
    return effect.unit === 'boolean' ? '' : ''
  }

  if (effect.unit === 'percent') return `${numeric > 0 ? '+' : ''}${numeric}%`
  if (effect.unit === 'multiplier') return `×${numeric}`
  return `${numeric > 0 ? '+' : ''}${numeric}`
}

export const effectLabel = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  const label = statLabels[key] ?? effect.statLabelZh ?? key
  const value = formatEffectValue(effect)
  const scope = effect.classScope && effect.classScope !== 'all' ? ` · ${effect.classScope}` : ''
  return `${label}${value ? ` ${value}` : ''}${scope}`
}

export const effectToneClass = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/damage|crit|melee|summon|ammo/.test(key)) return 'is-offense'
  if (/move|speed|dash|acceleration/.test(key)) return 'is-mobility'
  if (/defense|immunity/.test(key)) return 'is-defense'
  return 'is-special'
}

export const shownEffects = (armor: ArmorSetCatalogItem, limit = 6) => {
  const parsed = armor.parsedEffects.length ? armor.parsedEffects : armor.effects
  return parsed.slice(0, limit)
}

export const benefitLines = (armor: ArmorSetCatalogItem, limit = 4) => (
  armor.benefitZh
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
)

export const armorSummary = (armor: ArmorSetCatalogItem) => {
  const parsedCount = armor.parsedEffects.length
  const totalCount = armor.effects.length
  return `${numberLabel(armor.uniqueItemCount)} 个部件 · ${parsedCount}/${totalCount} 条效果`
}
