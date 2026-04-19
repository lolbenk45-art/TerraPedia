const ENGLISH_RULES: Array<[RegExp, string]> = [
  [/(weapon|sword|gun|bow|ammo)/i, 'WP'],
  [/(tool|pickaxe|axe|hammer)/i, 'TL'],
  [/(armor|helmet|leggings|chestplate|vanity)/i, 'AR'],
  [/(accessory)/i, 'AC'],
  [/(consumable|potion|food|bait)/i, 'AL'],
  [/(material|ore|bar|gem)/i, 'MT'],
  [/(furniture|wall|block|platform|painting|banner|statue)/i, 'HB'],
  [/(wire|mechanism|light|music)/i, 'MC'],
]

const CHINESE_RULES: Array<[RegExp, string]> = [
  [/(武器|弹药)/, 'WP'],
  [/(工具)/, 'TL'],
  [/(护甲|盔甲|时装)/, 'AR'],
  [/(饰品)/, 'AC'],
  [/(消耗品|药|鱼饵)/, 'AL'],
  [/(材料|矿|锭|宝石)/, 'MT'],
  [/(家具|方块|墙壁|画|旗帜|雕像)/, 'HB'],
  [/(电线|机械|照明|音乐)/, 'MC'],
]

export function getCategoryGlyph(name?: string | null): string {
  const value = name?.trim() || ''

  for (const [pattern, glyph] of ENGLISH_RULES) {
    if (pattern.test(value)) {
      return glyph
    }
  }

  for (const [pattern, glyph] of CHINESE_RULES) {
    if (pattern.test(value)) {
      return glyph
    }
  }

  return 'AT'
}
