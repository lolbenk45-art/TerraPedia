import assert from 'node:assert/strict'
import test from 'node:test'

import * as npcPresentation from '../../utils/npcShopBands.ts'
import { createSafeDisplayText } from '../../utils/publicCopy.ts'

const safeText = createSafeDisplayText()
const {
  buildNpcShopBands,
  filterNpcShopBands,
  resolveNpcArchiveModules,
} = npcPresentation

const entry = (id, conditions = [], notes = '') => ({ id, conditions, notes })

test('orders shop bands by always, period, biome, unlock, then other conditions', () => {
  const bands = buildNpcShopBands([
    entry('other', [{ label: '仅在特殊事件期间' }]),
    entry('unlock', [{ refNpcNameZh: '向导' }]),
    entry('biome', [{ biomeNameZh: '雪原' }]),
    entry('period', [{ gamePeriodNameZh: '困难模式' }]),
    entry('always'),
  ], safeText)

  assert.deepEqual(bands.map((band) => [band.key, band.entries.map((item) => item.id)]), [
    ['always', ['always']],
    ['period', ['period']],
    ['biome', ['biome']],
    ['unlock', ['unlock']],
    ['other', ['other']],
  ])
  assert.equal(bands[1].meta, '随进度解锁')
  assert.equal(bands[4].conditionSummary(bands[4].entries[0]), '仅在特殊事件期间')
})

test('summarizes multiple safe conditions and falls back without exposing raw source strings', () => {
  const bands = buildNpcShopBands([
    entry('many', [{ label: '夜晚' }, { label: '下雨' }, { label: '血月' }]),
    entry('raw', [{ label: 'https://terraria.wiki.gg/raw-condition' }]),
  ], safeText)
  const other = bands.find((band) => band.key === 'other')

  assert.equal(other?.conditionSummary(other.entries.find((item) => item.id === 'many')), '夜晚 / 下雨 / 另有 1 个条件')
  assert.equal(other?.conditionSummary(other.entries.find((item) => item.id === 'raw')), '特殊条件')
})

test('filters a selected condition band without changing its stable ordering', () => {
  const bands = buildNpcShopBands([
    entry('always'),
    entry('period', [{ gamePeriodNameZh: '困难模式' }]),
  ], safeText)

  assert.deepEqual(filterNpcShopBands(bands, 'all').map((band) => band.key), ['always', 'period'])
  assert.deepEqual(filterNpcShopBands(bands, 'period').map((band) => band.key), ['period'])
})

test('keeps temporary merchants scoped to arrival and current shop data', () => {
  assert.deepEqual(resolveNpcArchiveModules({ isTownNpc: true, shopCount: 3 }), ['shop', 'residence'])
  assert.deepEqual(resolveNpcArchiveModules({ name: '旅商', shopCount: 3 }), ['arrival', 'shop'])
  assert.deepEqual(resolveNpcArchiveModules({ isTownNpc: true, name: '旅商', shopCount: 3 }), ['arrival', 'shop'])
  assert.deepEqual(resolveNpcArchiveModules({ lootCount: 1 }), ['loot'])
})

test('derives NPC completeness from eight live data capabilities', () => {
  assert.equal(typeof npcPresentation.buildNpcCoverage, 'function')

  const coverage = npcPresentation.buildNpcCoverage({
    hasIdentity: true,
    combatStatCount: 4,
    assetCount: 3,
    hasBehavior: true,
    shopCount: 31,
    lootCount: 0,
    preferenceCount: 7,
    buffCount: 0,
  })

  assert.deepEqual(
    { available: coverage.availableCount, total: coverage.totalCount, percentage: coverage.percentage },
    { available: 6, total: 8, percentage: 75 },
  )
  assert.deepEqual(coverage.summaryRows.map((row) => row.state), ['complete', 'complete', 'partial', 'partial'])
})

test('keeps zero-count NPC capabilities visibly missing instead of padding completeness', () => {
  assert.equal(typeof npcPresentation.buildNpcCoverage, 'function')

  const coverage = npcPresentation.buildNpcCoverage({
    hasIdentity: true,
    combatStatCount: 0,
    assetCount: 0,
    hasBehavior: false,
    shopCount: 0,
    lootCount: 0,
    preferenceCount: 0,
    buffCount: 0,
  })

  assert.equal(coverage.percentage, 13)
  assert.deepEqual(coverage.summaryRows.map((row) => row.state), ['partial', 'missing', 'missing', 'missing'])
  assert.equal(coverage.summaryRows[2].detail, '商店 0 项 · 掉落 0 条')
})
