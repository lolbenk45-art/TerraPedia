import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pagePath = resolve(__dirname, '../pages/armor-sets/[id].vue')
const source = readFileSync(pagePath, 'utf8')

const requiredMarkers = [
  'armor-build-board',
  'armor-build-matrix',
  'armor-build-row',
  'armor-build-cell',
  'armor-build-icons',
  'armorSetBuildCards',
  'armorBuildVariantStats',
  'armorFixedBonusLines',
  'armorBuildDefenseSummary',
  'armorDefenseRoleGroups',
  'armor-build-defense-formula',
  'effectBelongsToItem',
  'uniqueArmorItems',
  'hasStructuredArmorEffects',
  'dedupeEffectLines',
  'armorFallbackBenefitLines',
  'armor-structured-build-board',
  'effectVariantLabel',
  'effectMatchesItemIdentity',
  'armorItemIdentityAliases',
  'armorIdentityAliases',
  'armorVariantBuildGroups',
  'armorVariantBuildGroups(uniqueItems).map',
  'armorBuildVariantStats(buildGroup)',
  'armorBuildVariantEffectGroups',
  'armor-build-effect-groups',
  'armorBuildSetBonusLines',
  'armorCombinedBuildTotals',
  'armorBuildTotalEntries',
  'armor-build-total-entries',
  'armor-build-total-entry',
  'armorHasVariantBuilds',
  'armorBuildDefenseTotalValue',
  'armorAddDefenseBonusToValue',
  'armorSetBuildCards.value.length > 1',
  "v-if=\"armorHasVariantBuilds && armorFixedBonusLines.length\"",
  "label: '防御'",
  'armorFullSetBuildGroup',
  'armorVariantRoles',
  'armorFixedEffects',
  'armorEffectNumericValue',
  'default-full-set',
  '完整套装',
  '合计加成',
  'armor-set-bonus-lines',
  'armor-set-bonus-line',
  'armorHighlightedTextSegments',
  'armor-highlight-number',
  'armorLineLooksLikePlainAttribute',
  '构筑差异',
  'buildGroup.variantItems',
  '...buildGroup.variantItems',
  'armor-fixed-bonus-row',
  'armorFixedBonusGroups',
  'armorFixedBonusEntry',
  'armor-fixed-bonus-lines',
  'armor-fixed-bonus-line',
  'armor-fixed-bonus-group-title',
  'is-attribute',
  'is-description',
  'effectVariantAliases.some',
  'effectRawText',
  'if (rawText) return rawText',
]

const missing = requiredMarkers.filter((marker) => !source.includes(marker))
const forbiddenMarkers = [
  'armor-stat-source-images',
  'armorStatPreviewItems',
  'statVisualMeta(effect).icon',
  'sprite-icon compact',
  'armor-variant-sprite',
  'armor-variant-card',
  'armor-summary-lines',
  'armor-equipment-board',
  'class="armor-benefit"',
  'armorBenefitLines.length',
  'armorBuildCardStats(headItem, commonItems)',
  'armorBuildCardStats',
  'armor-build-card',
  'armor-build-piece-strip',
  'armor-build-defense-panel',
  'armor-build-defense-parts',
  'headItems',
  'headItem',
  'headItems.some',
  "armorPieceRole(item) !== '头部'",
  '胸甲 / 腿部 / 套装',
  'buildGroup.headItems',
  '...buildGroup.headItems',
  '头部差异',
  '暂无头部差异属性',
  'armor-fixed-bonus-strip',
  'parts.reduce((sum, part)',
  'valueDecimal: Number.isFinite(numeric) ? numeric : null',
  'return items.some((item) => effectBelongsToItem(effect, item))',
  'totalLines.map((line) => `合计加成：${line}`)',
  'return armorVariantRoles(uniqueItems).size > 0',
  'Number(defense.total)',
]
const presentForbidden = forbiddenMarkers.filter((marker) => source.includes(marker))

if (missing.length) {
  console.error(`Armor stat visuals missing markers: ${missing.join(', ')}`)
  process.exit(1)
}

if (presentForbidden.length) {
  console.error(`Armor stat visuals should not show repeated equipment thumbnails: ${presentForbidden.join(', ')}`)
  process.exit(1)
}

console.log('Armor stat visuals contract passed.')
