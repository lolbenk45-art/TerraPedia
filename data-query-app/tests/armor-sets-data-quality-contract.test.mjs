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

test('armor set admin page renders backend data quality warnings', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  for (const token of [
    'armorSetPreviewWarnings',
    'armorSetDetailWarnings',
    'imagePipelineStatus',
    'sourceImageCount',
    'managedImageCount',
    'dataSourceMode',
    'dataQualityWarnings',
    '数据质量提示',
    '图片管线',
  ]) {
    assert.match(page, new RegExp(escapeRegExp(token)))
  }

  assert.match(page, /buildArmorSetDataQualityWarnings\(previewRow\.value\)/)
  assert.match(page, /buildArmorSetDataQualityWarnings\(detailRow\.value\)/)
  assert.doesNotMatch(page, /v-for="warning in armorSetPreviewWarnings" :key="warning\.label"/)
  assert.doesNotMatch(page, /v-for="warning in armorSetDetailWarnings" :key="warning\.label"/)
})

test('armor set admin preview resolver keeps backend image fallback chain', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  assert.match(page, /fallbackImages/)
  assert.match(page, /relatedItems/)
  assert.match(page, /equipmentItems/)
  assert.doesNotMatch(page, /if \(entityType\.value === 'armor-sets'\) return ''/)
})

test('armor set admin detail offers item detail actions for composition and replacement equipment', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  assert.match(
    page,
    /<section v-if="armorSetReplacementGroups\.length"[\s\S]*?<button v-if="canOpenLinkedItemDetail\(item\)" type="button" class="btn-link" @click="openLinkedItemDetail\(item\)">物品详情<\/button>[\s\S]*?<section v-if="armorSetDetailImageGroups\.length"/,
  )
  assert.match(
    page,
    /<section v-if="detailRelatedItemGroups\.length"[\s\S]*?<button v-if="canOpenLinkedItemDetail\(item\)" type="button" class="btn-link" @click="openLinkedItemDetail\(item\)">物品详情<\/button>[\s\S]*?<div v-else-if="detailRow && entityType === 'bosses'"/,
  )
})

test('armor set admin item detail actions use backend item detail refs before raw item ids', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  assert.match(page, /function getLinkedItemDetailId\(entry: Record<string, any>\)/)
  assert.match(page, /entry\?\.itemDetailRef\?\.canOpenItemDetail/)
  assert.match(page, /entry\?\.itemDetailRef\?\.itemId/)
  assert.match(page, /@click="openLinkedItemDetail\(item\)"/)
  assert.match(page, /v-if="canOpenLinkedItemDetail\(item\)"/)
  assert.match(page, /const rawId = getLinkedItemDetailId\(entry\)/)
})
