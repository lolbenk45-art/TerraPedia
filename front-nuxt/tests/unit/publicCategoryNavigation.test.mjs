import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasResolvedNavigationScope,
  isUnknownCategorySlug,
  normalizePublicCategoryNavigation,
  resolvePublicCategoryNavigationChild,
  resolvePublicCategoryNavigationSelection,
} from '../../utils/publicCategoryNavigation.ts'

const definitions = [
  ['weapons', 'weapon', 'WEAPON'],
  ['armor', 'armor', 'ARMOR'],
  ['potions', 'potion', 'CONSUMABLE_POTION'],
  ['materials', 'material', 'MATERIAL'],
  ['furniture', 'furniture', 'FURNITURE'],
  ['tools', 'tool', 'TOOL'],
]

const validNavigation = () => definitions.map(([slug, filterKey, code], index) => ({
  slug,
  filterKey,
  name: `分类 ${index + 1}`,
  description: null,
  icon: null,
  categoryPath: `/categories/${slug}`,
  itemPath: `/items?filter=${filterKey}`,
  categoryCodes: [code],
  categoryIds: [index + 1, index + 11],
  itemCount: index * 10,
  children: [],
}))

const materialKeyChild = () => ({
  id: 316,
  code: 'MATERIAL_KEY',
  name: '钥匙',
  categoryIds: [316, 342, 341],
  itemPath: '/items?category=MATERIAL_KEY',
  itemCount: 36,
  image: '/terrapedia-images/items/material-key.png',
})

const navigationWithMaterialKey = () => {
  const navigation = validNavigation()
  navigation[3].children = [materialKeyChild()]
  return navigation
}

test('normalizes the complete ordered public navigation contract', () => {
  const result = normalizePublicCategoryNavigation(navigationWithMaterialKey())

  assert.ok(result)
  assert.deepEqual(result.map((entry) => entry.slug), definitions.map(([slug]) => slug))
  assert.deepEqual(result[0].categoryIds, [1, 11])
  assert.equal(hasResolvedNavigationScope(result[0]), true)
  assert.deepEqual(result[3].children[0], materialKeyChild())
})

test('rejects a six-entry response when one navigation scope is empty or invalid', () => {
  const emptyScope = validNavigation()
  emptyScope[0].categoryIds = []
  const invalidScope = validNavigation()
  invalidScope[0].categoryIds = [0, Number.NaN]
  const partiallyInvalidScope = validNavigation()
  partiallyInvalidScope[0].categoryIds = [1, 0]

  assert.equal(normalizePublicCategoryNavigation(emptyScope), null)
  assert.equal(normalizePublicCategoryNavigation(invalidScope), null)
  assert.equal(normalizePublicCategoryNavigation(partiallyInvalidScope), null)
  assert.equal(hasResolvedNavigationScope({ categoryIds: [] }), false)
  assert.equal(hasResolvedNavigationScope({ categoryIds: [1, 0] }), false)
})

test('rejects incomplete, reordered, or malformed navigation fields', () => {
  const reordered = validNavigation()
  ;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
  const malformedPath = validNavigation()
  malformedPath[0].itemPath = '/items'
  const nullCount = validNavigation()
  nullCount[0].itemCount = null

  assert.equal(normalizePublicCategoryNavigation(validNavigation().slice(0, 5)), null)
  assert.equal(normalizePublicCategoryNavigation(reordered), null)
  assert.equal(normalizePublicCategoryNavigation(malformedPath), null)
  assert.equal(normalizePublicCategoryNavigation(nullCount), null)
})

test('rejects incomplete child scopes, paths, counts, and unmanaged images', () => {
  const emptyScope = navigationWithMaterialKey()
  emptyScope[3].children[0].categoryIds = []
  const malformedPath = navigationWithMaterialKey()
  malformedPath[3].children[0].itemPath = '/items?category=MATERIAL'
  const invalidCount = navigationWithMaterialKey()
  invalidCount[3].children[0].itemCount = -1
  const unmanagedImage = navigationWithMaterialKey()
  unmanagedImage[3].children[0].image = 'https://example.com/material-key.png'

  assert.equal(normalizePublicCategoryNavigation(emptyScope), null)
  assert.equal(normalizePublicCategoryNavigation(malformedPath), null)
  assert.equal(normalizePublicCategoryNavigation(invalidCount), null)
  assert.equal(normalizePublicCategoryNavigation(unmanagedImage), null)
})

test('resolves child codes exactly and preserves backend descendant scopes', () => {
  const navigation = normalizePublicCategoryNavigation(navigationWithMaterialKey())
  assert.ok(navigation)

  const resolved = resolvePublicCategoryNavigationChild(navigation, 'MATERIAL_KEY')

  assert.equal(resolved?.parent.slug, 'materials')
  assert.equal(resolved?.child.name, '钥匙')
  assert.deepEqual(resolved?.child.categoryIds, [316, 342, 341])
  assert.equal(resolvePublicCategoryNavigationChild(navigation, 'material_key'), null)
})

test('does not trim child codes while normalizing or resolving routes', () => {
  const navigationPayload = navigationWithMaterialKey()
  navigationPayload[3].children[0].code = ' MATERIAL_KEY '
  navigationPayload[3].children[0].itemPath = '/items?category= MATERIAL_KEY '

  const navigation = normalizePublicCategoryNavigation(navigationPayload)
  assert.ok(navigation)
  assert.equal(navigation[3].children[0].code, ' MATERIAL_KEY ')
  assert.equal(resolvePublicCategoryNavigationChild(navigation, 'MATERIAL_KEY'), null)
  assert.equal(resolvePublicCategoryNavigationChild(navigation, ' MATERIAL_KEY ')?.child.name, '钥匙')
})

test('prioritizes child category state and fails closed until an exact scope resolves', () => {
  const navigation = normalizePublicCategoryNavigation(navigationWithMaterialKey())
  assert.ok(navigation)

  const resolvedChild = resolvePublicCategoryNavigationSelection(
    navigation,
    'MATERIAL_KEY',
    'weapons',
    false,
    false,
  )
  const pendingChild = resolvePublicCategoryNavigationSelection(
    navigation,
    'MATERIAL_KEY',
    'weapons',
    true,
    false,
  )
  const unknownChild = resolvePublicCategoryNavigationSelection(
    navigation,
    'material_key',
    'weapons',
    false,
    false,
  )
  const resolvedParent = resolvePublicCategoryNavigationSelection(
    navigation,
    null,
    'weapons',
    false,
    false,
  )

  assert.equal(resolvedChild.mode, 'child')
  assert.equal(resolvedChild.parent?.slug, 'materials')
  assert.deepEqual(resolvedChild.categoryIds, [316, 342, 341])
  assert.equal(resolvedChild.ready, true)
  assert.equal(resolvedChild.unavailable, false)
  assert.equal(pendingChild.required, true)
  assert.equal(pendingChild.ready, false)
  assert.equal(pendingChild.unavailable, false)
  assert.equal(unknownChild.required, true)
  assert.equal(unknownChild.ready, false)
  assert.equal(unknownChild.unavailable, true)
  assert.deepEqual(unknownChild.categoryIds, [])
  assert.equal(resolvedParent.mode, 'parent')
  assert.equal(resolvedParent.parent?.slug, 'weapons')
  assert.deepEqual(resolvedParent.categoryIds, [1, 11])
})

test('marks an unknown slug only after navigation has settled successfully', () => {
  const navigation = normalizePublicCategoryNavigation(validNavigation())
  assert.ok(navigation)

  assert.equal(isUnknownCategorySlug(navigation, 'weapons', false, false), false)
  assert.equal(isUnknownCategorySlug(navigation, 'unknown', false, false), true)
  assert.equal(isUnknownCategorySlug(navigation, 'unknown', true, false), false)
  assert.equal(isUnknownCategorySlug(navigation, 'unknown', false, true), false)
})
