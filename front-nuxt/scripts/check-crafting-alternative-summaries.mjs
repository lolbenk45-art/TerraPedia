import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const files = [
  'pages/crafting/index.vue',
  'components/crafting/RecipeTreeNode.vue',
]

const violations = []

for (const path of files) {
  const source = read(path)

  if (!source.includes('recipeSummaryParts')) {
    violations.push(`${path}: alternative recipe labels must compose material/station/output differences together`)
  }

  if (!/recipeSummaryParts[\s\S]*\.filter\(Boolean\)[\s\S]*\.join\('；'\)/.test(source)) {
    violations.push(`${path}: alternative recipe labels must join available difference fields instead of choosing the first one`)
  }

  if (/recipe(?:Alternative|Difference)Summary\s*=\s*\([^)]*\)\s*=>\s*displayText\(/.test(source)) {
    violations.push(`${path}: alternative recipe summary must not use displayText(...) because it hides station/output differences when materials exist`)
  }
}

const craftingPage = read('pages/crafting/index.vue')
const recipeTreeNode = read('components/crafting/RecipeTreeNode.vue')

for (const marker of [
  'selectedRootKey',
  'activeRoot',
  'recipe-root-option-tabs',
  'recipe-root-option-tab',
  'visibleRecipeRoots',
  'v-for="root in visibleRecipeRoots"',
  ':aria-pressed="recipeRootKey(root, index) === selectedRootKey"',
]) {
  if (!craftingPage.includes(marker)) {
    violations.push(`pages/crafting/index.vue: root-level alternative recipes must use selectable option tabs via marker ${marker}`)
  }
}

if (/v-for="[^"]*activeRoots[^"]*"[\s\S]{0,500}<CraftingRecipeTreeNode/m.test(craftingPage)) {
  violations.push('pages/crafting/index.vue: full recipe tree must render the selected root only instead of expanding every activeRoot')
}

for (const marker of [
  'selectedAlternativeKey',
  'activeAlternativeOption',
  'visibleAlternativeOptions',
  'v-for="entry in visibleAlternativeOptions"',
  ':aria-pressed="recipeAlternativeKey(option, index) === selectedAlternativeKey"',
]) {
  if (!recipeTreeNode.includes(marker)) {
    violations.push(`components/crafting/RecipeTreeNode.vue: nested alternative recipes must render only the selected option via marker ${marker}`)
  }
}

if (/v-for="\([^)]*option[^)]*index[^)]*\) in recipeAlternativeOptions"[\s\S]{0,500}<CraftingRecipeTreeNode/m.test(recipeTreeNode)) {
  violations.push('components/crafting/RecipeTreeNode.vue: nested alternative recipes must not recursively render every recipeAlternativeOption')
}

if (violations.length > 0) {
  console.error(`Crafting alternative summary contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Crafting alternative summary contract passed.')
