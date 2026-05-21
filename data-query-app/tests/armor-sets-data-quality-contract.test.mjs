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

test('armor set admin main previews do not promote component item images', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  assert.match(page, /function resolveArmorSetWearPreviewImage\(row: Record<string, any>\)/)
  assert.match(page, /if \(entityType\.value === 'armor-sets'\) return resolveArmorSetWearPreviewImage\(row\)/)
  assert.match(page, /relatedItems/)
  assert.match(page, /equipmentItems/)
  assert.match(page, /组成单件预览/)
  assert.match(page, /穿戴主图/)
  assert.doesNotMatch(
    page,
    /if \(entityType\.value === 'armor-sets'\) \{[\s\S]*?resolveArmorSetRelatedImage\(row\.relatedItems\)[\s\S]*?resolveArmorSetRelatedImage\(row\.equipmentItems\)[\s\S]*?\}/,
  )
  assert.doesNotMatch(page, /if \(entityType\.value === 'armor-sets'\) return ''/)
})

test('armor set admin exposes composition kind as a management category', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  assert.match(page, /selectedArmorSetCompositionKind/)
  assert.match(page, /armorSetCompositionOptions/)
  assert.match(page, /handleArmorSetCompositionChange/)
  assert.match(page, /getArmorSetCompositionKindLabel\(row\.compositionKind\)/)
  assert.match(page, /\{ key: 'compositionKind', label: '套装分类' \}/)
  assert.match(page, /getArmorSetCompositionKindLabel\(detailRow\.value\.compositionKind\)/)

  for (const token of ['完整套装', '单件成套装', '非标准组合', 'traditional_set', 'single_piece_set', 'nonstandard_piece_set']) {
    assert.match(page, new RegExp(escapeRegExp(token)))
  }
})

test('armor set admin sends composition kind filter to backend instead of filtering only the current page', () => {
  const page = read('data-query-app/pages/entities/[type].vue')

  assert.match(
    page,
    /if \(entityType\.value === 'armor-sets' && selectedArmorSetCompositionKind\.value !== 'all'\) \{[\s\S]*?params\.compositionKind = selectedArmorSetCompositionKind\.value[\s\S]*?\}/,
  )
  assert.match(
    page,
    /async function handleArmorSetCompositionChange\(value: ArmorSetCompositionKindFilter\) \{[\s\S]*?selectedArmorSetCompositionKind\.value = value[\s\S]*?await syncRouteQuery\(1\)[\s\S]*?await fetchRows\(1\)[\s\S]*?\}/,
  )
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
  assert.match(page, /entry\?\.itemDetailRef != null/)
  assert.match(page, /@click="openLinkedItemDetail\(item\)"/)
  assert.match(page, /v-if="canOpenLinkedItemDetail\(item\)"/)
  assert.match(page, /const rawId = getLinkedItemDetailId\(entry\)/)
  assert.match(
    page,
    /if \(entry\?\.itemDetailRef != null\) \{[\s\S]*?return entry\.itemDetailRef\.canOpenItemDetail \? entry\.itemDetailRef\.itemId : null[\s\S]*?\}[\s\S]*?return entry\?\.itemId/,
  )
  assert.doesNotMatch(page, /v-if="item\.itemId"/)
  assert.doesNotMatch(page, /@click="item\.itemId \? openLinkedItemDetail\(item\)/)
})
