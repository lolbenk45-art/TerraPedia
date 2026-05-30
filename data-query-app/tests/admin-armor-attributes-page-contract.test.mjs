import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('armor attributes admin page consumes read-only admin APIs', () => {
  const page = read('data-query-app/pages/operations/armor-attributes.vue')

  assert.match(page, /definePageMeta\(\{\s*title:\s*'盔甲属性表'/)
  assert.match(page, /navSection:\s*'\/operations\/armor-attributes'/)
  assert.match(page, /get<ArmorAttributeSummaryResponse>\('\/admin\/armor-attributes\/summary'\)/)
  assert.match(page, /get<ArmorAttributeListResponse>\('\/admin\/armor-attributes'/)
  assert.match(page, /get<ArmorAttributeDetailResponse>\(`\/admin\/armor-attributes\/\$\{row\.itemId\}`,\s*\{/)
  assert.match(page, /attributeRowId:\s*row\.id/)
  assert.doesNotMatch(page, /\b(post|put|patch|del)\s*\(/)
})

test('armor attributes admin page renders concrete fields instead of prose-only data', () => {
  const page = read('data-query-app/pages/operations/armor-attributes.vue')

  for (const token of [
    'defenseValue',
    'rawCells',
    'meleeDamage',
    'meleeCritChance',
    'classSpecific',
    'statKey',
    'classScope',
    'valueDecimal',
    'unit',
    'rawText',
    'parseStatus',
    'effectCount',
    'slotGroup',
    'sectionCode',
    'itemInternalName',
    'itemNameZh',
    'sourceRevisionTimestamp',
  ]) {
    assert.match(page, new RegExp(escapeRegExp(token)))
  }

  assert.match(page, /raw-cell-grid/)
  assert.match(page, /effect-table/)
  assert.match(page, /detail-drawer/)
  assert.match(page, /神圣面具/)
  assert.match(page, /HallowedMask/)
})

test('armor attributes admin navigation is registered under operations', () => {
  const layout = read('data-query-app/layouts/default.vue')

  assert.match(layout, /盔甲属性表/)
  assert.match(layout, /\/operations\/armor-attributes/)
  assert.match(layout, /核验单件装备字段/)
})
