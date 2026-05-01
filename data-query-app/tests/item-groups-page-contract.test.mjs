import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('item groups page exists as an independent source-backed management route', () => {
  const page = read('data-query-app/pages/item-groups.vue')

  assert.match(page, /definePageMeta\(\{\s*title:\s*'任意物品组管理'/)
  assert.match(page, /fetchItemGroups/)
  assert.match(page, /sourceProvider/)
  assert.match(page, /sourcePage/)
  assert.match(page, /domains/)
  assert.match(page, /AdminItemLookupInput/)
})

test('item group store uses the unified admin item-groups API', () => {
  const store = read('data-query-app/stores/itemGroups.ts')

  assert.match(store, /export interface ItemGroup/)
  assert.match(store, /get\('\/admin\/item-groups'/)
  assert.match(store, /post\('\/admin\/item-groups'/)
  assert.match(store, /put\(`\/admin\/item-groups\/\$\{encodeURIComponent\(canonicalName\)\}`/)
  assert.match(store, /sourceUrls/)
})

test('recipe group navigation points at the unified item group page in recipe scope', () => {
  const layout = read('data-query-app/layouts/default.vue')
  const recipeIndex = read('data-query-app/pages/recipes/index.vue')
  const recipeGroups = read('data-query-app/pages/recipes/groups.vue')

  assert.match(layout, /path:\s*'\/item-groups'/)
  assert.match(recipeIndex, /path:\s*'\/item-groups'[\s\S]*domain:\s*'recipe'/)
  assert.match(recipeGroups, /navigateTo\(\{\s*path:\s*'\/item-groups'/)
})
