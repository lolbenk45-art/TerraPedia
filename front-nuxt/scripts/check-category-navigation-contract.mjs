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

const routeSyncComposable = requireFile('composables/useCatalogRouteSync.ts')
const searchInputWatcher = itemsPage.match(/watch\(searchQuery, \(\) => \{[\s\S]*?\n\}\, \{ flush: 'sync' \}\)/)?.[0]
  ?? (itemsPage.includes('search: { input: searchQuery, debounced: debouncedSearchQuery, page: currentPage }')
    ? routeSyncComposable.match(/watch\(search\.input, \(\) => \{[\s\S]*?\}\, \{ flush: 'sync' \}\)/)?.[0]
    : undefined)
  ?? ''
if (!searchInputWatcher) {
  violations.push('pages/items/index.vue: must keep an identifiable raw search input debounce watcher')
}

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
requireIncludes('pages/categories/[id].vue', categoryDetail, ':href="child.itemPath"', 'every child card must use its backend-owned item path')
requireIncludes('pages/categories/[id].vue', categoryDetail, '<CommonPreviewImage', 'every child card must render its managed image or semantic fallback')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'child.itemCount', 'every child card must render its relation-aware item total')
requireIncludes('pages/categories/[id].vue', categoryDetail, '查看图鉴', 'every child card must expose a visible navigation affordance')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'watch(unknownCategory', 'detail must react when a reused route changes to an unknown slug')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'role="alert"', 'detail errors must be announced accessibly')
requireIncludes('pages/categories/index.vue', categoryIndex, 'role="alert"', 'index errors must be announced accessibly')
requireIncludes('pages/items/index.vue', itemsPage, 'navigationSlug', 'six public filters must identify navigation entries')
requireIncludes('pages/items/index.vue', itemsPage, 'route.query.category', 'item deep links must read the exact child category code')
requireIncludes('pages/items/index.vue', itemsPage, 'resolvePublicCategoryNavigationSelection', 'item scope must use the shared exact child and parent resolver')
requireIncludes('pages/items/index.vue', itemsPage, 'navigationScopeRequired', 'parent and child navigation must share one request gate')
requireIncludes('pages/items/index.vue', itemsPage, 'allowFallback: () => !navigationScopeRequired.value', 'required navigation scopes must disable sample fallback')
requireIncludes('pages/items/index.vue', itemsPage, 'enabled: () => navigationScopeReady.value', 'required navigation scopes must disable requests until resolved')
requireIncludes('pages/items/index.vue', itemsPage, 'category: selectedCategoryCode.value ?? undefined', 'search and paging must preserve the stable child category query')
requireIncludes('pages/items/index.vue', itemsPage, 'selectedCategoryCode.value = null', 'ordinary quick filters must clear the child category query')
requireIncludes('pages/items/index.vue', itemsPage, 'href="/items"', 'unknown child categories must offer a complete-catalog recovery link')
requireIncludes('pages/items/index.vue', itemsPage, 'if (navigationScopeReady.value)', 'retry must not request items after a failed navigation refresh')
forbidIncludes('pages/items/index.vue', searchInputWatcher, 'currentPage.value = 1', 'raw search input must not reset paging before its debounced route query is ready')
forbidIncludes('composables/useCatalogRouteSync.ts', searchInputWatcher.split('setTimeout')[0], 'page.value = 1', 'raw search input must not reset paging synchronously before the debounce fires')
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
