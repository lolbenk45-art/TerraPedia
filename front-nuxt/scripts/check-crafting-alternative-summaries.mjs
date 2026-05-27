import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const files = [
  'composables/useCraftingRecipeModel.ts',
  'components/crafting/RecipeOptionSelector.vue',
  'components/crafting/RecipeCompareTable.vue',
]

const violations = []

for (const path of files) {
  const source = read(path)

  if (/recipe(?:Alternative|Difference)Summary\s*=\s*\([^)]*\)\s*=>\s*displayText\(/.test(source)) {
    violations.push(`${path}: alternative recipe summary must not use displayText(...) because it hides station/output differences when materials exist`)
  }
}

const model = read('composables/useCraftingRecipeModel.ts')
const optionSelector = read('components/crafting/RecipeOptionSelector.vue')
const compareTable = read('components/crafting/RecipeCompareTable.vue')

for (const marker of [
  'summarizeMaterials',
  'formatMaterialSummary',
  'material.isAnyGroup',
  '任选其一',
  'material.members.map((member) => member.title).join(\'/\')',
  'const stationSummary = stations.map((station) => station.title).join(\' / \')',
  'summary: [materialSummary, stationSummary, output.quantity !== \'x1\' ? `产出 ${output.quantity}` : \'\'].filter(Boolean).join(\'；\')',
]) {
  if (!model.includes(marker)) {
    violations.push(`composables/useCraftingRecipeModel.ts: option summaries must compose material/station/output differences via marker ${marker}`)
  }
}

for (const marker of [
  '<b>{{ option.label }}</b>',
  '<span>{{ option.summary || option.output.title }}</span>',
  ':aria-pressed="option.key === activeKey"',
]) {
  if (!optionSelector.includes(marker)) {
    violations.push(`components/crafting/RecipeOptionSelector.vue: root-level alternatives must show selectable composed summaries via marker ${marker}`)
  }
}

for (const marker of [
  'data-crafting-role="compare-material"',
  'data-crafting-role="compare-station"',
  'data-crafting-role="compare-output"',
  'material.isAnyGroup',
  'material.members',
  'compare-any-members',
  '<CommonPreviewImage',
]) {
  if (!compareTable.includes(marker)) {
    violations.push(`components/crafting/RecipeCompareTable.vue: compare table must preserve material/station/output differences with images and any-material semantics via marker ${marker}`)
  }
}

if (model.includes('recipeSummaryParts') || optionSelector.includes('recipe-root-option-tabs')) {
  violations.push('crafting alternative contract: legacy tree/tab markers must not return in the new recipe option model')
}

if (violations.length > 0) {
  console.error(`Crafting alternative summary contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Crafting alternative summary contract passed.')
