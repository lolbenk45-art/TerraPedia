import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const violations = []

const requireFile = (path) => {
  const absolutePath = join(root, path)
  if (!existsSync(absolutePath)) {
    violations.push(`${path}: file is required`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

const requireIncludes = (path, source, marker, message) => {
  if (!source.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const forbidIncludes = (path, source, marker, message) => {
  if (source.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const publicTypes = requireFile('types/public-api.ts')
const navigationComposable = requireFile('composables/usePublicCategoryNavigation.ts')
const publicItemsComposable = requireFile('composables/usePublicItems.ts')
const categoryIndex = requireFile('pages/categories/index.vue')
const categoryDetail = requireFile('pages/categories/[id].vue')
const itemsPage = requireFile('pages/items/index.vue')
const packageJson = requireFile('package.json')

requireIncludes('types/public-api.ts', publicTypes, 'PublicCategoryNavigationEntry', 'must define the navigation response type')
requireIncludes('types/public-api.ts', publicTypes, "source: 'api' | 'fallback' | 'unavailable'", 'must model fail-closed item results')
requireIncludes('composables/usePublicCategoryNavigation.ts', navigationComposable, "'/categories/navigation'", 'must fetch the backend navigation endpoint')
requireIncludes('composables/usePublicCategoryNavigation.ts', navigationComposable, 'normalizePublicCategoryNavigation', 'must validate complete navigation fields and scopes')
requireIncludes('composables/usePublicItems.ts', publicItemsComposable, 'unavailablePublicItemsResult', 'must support disabled item loading')
requireIncludes('pages/categories/index.vue', categoryIndex, 'entry.itemCount', 'category index must render backend totals')
requireIncludes('pages/categories/index.vue', categoryIndex, 'entry.categoryPath', 'category index must use backend category paths')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'route.params.id', 'detail must resolve the semantic route slug')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'category.itemPath', 'detail action must use the backend item path')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'category.children', 'detail must render real immediate children')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'watch(unknownCategory', 'detail must react when a reused route changes to an unknown slug')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'role="alert"', 'detail errors must be announced accessibly')
forbidIncludes('pages/categories/[id].vue', categoryDetail, 'navigateTo(', 'detail must remain an intermediate page')
requireIncludes('pages/categories/index.vue', categoryIndex, 'role="alert"', 'index errors must be announced accessibly')
requireIncludes('pages/items/index.vue', itemsPage, 'navigationSlug', 'six public filters must identify navigation entries')
requireIncludes('pages/items/index.vue', itemsPage, 'selectedNavigationEntry', 'item scope must resolve from backend navigation')
requireIncludes('pages/items/index.vue', itemsPage, 'allowFallback: () => !navigationFilterRequired.value', 'navigation filters must disable sample fallback')
requireIncludes('pages/items/index.vue', itemsPage, 'enabled: () => navigationFilterReady.value', 'navigation filters must disable requests until resolved')
requireIncludes(
  'pages/items/index.vue',
  itemsPage,
  '&& !categoryNavigationError.value\n  && selectedCategoryIds.value.length > 0',
  'navigation readiness must require a settled successful response and non-empty ID scope',
)
requireIncludes('pages/items/index.vue', itemsPage, 'if (navigationFilterReady.value)', 'retry must not request items after a failed navigation refresh')
requireIncludes('package.json', packageJson, 'check:category-navigation', 'main frontend gate must run the navigation contract check')

for (const total of ['932', '684', '122', '1186', '1408', '318']) {
  forbidIncludes('pages/categories/index.vue', categoryIndex, total, `must remove hard-coded total ${total}`)
}

for (const path of [
  'href="/categories/weapons"',
  'href="/categories/armor"',
  'href="/categories/potions"',
  'href="/categories/materials"',
  'href="/categories/furniture"',
  'href="/categories/tools"',
]) {
  forbidIncludes('pages/categories/index.vue', categoryIndex, path, `must remove hard-coded category link ${path}`)
}

if (violations.length > 0) {
  console.error(violations.map((violation) => `- ${violation}`).join('\n'))
  process.exit(1)
}

console.log('Category navigation contract check passed.')
