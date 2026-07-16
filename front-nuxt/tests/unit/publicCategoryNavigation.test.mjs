import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasResolvedNavigationScope,
  isUnknownCategorySlug,
  normalizePublicCategoryNavigation,
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

test('normalizes the complete ordered public navigation contract', () => {
  const result = normalizePublicCategoryNavigation(validNavigation())

  assert.ok(result)
  assert.deepEqual(result.map((entry) => entry.slug), definitions.map(([slug]) => slug))
  assert.deepEqual(result[0].categoryIds, [1, 11])
  assert.equal(hasResolvedNavigationScope(result[0]), true)
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

test('marks an unknown slug only after navigation has settled successfully', () => {
  const navigation = normalizePublicCategoryNavigation(validNavigation())
  assert.ok(navigation)

  assert.equal(isUnknownCategorySlug(navigation, 'weapons', false, false), false)
  assert.equal(isUnknownCategorySlug(navigation, 'unknown', false, false), true)
  assert.equal(isUnknownCategorySlug(navigation, 'unknown', true, false), false)
  assert.equal(isUnknownCategorySlug(navigation, 'unknown', false, true), false)
})
