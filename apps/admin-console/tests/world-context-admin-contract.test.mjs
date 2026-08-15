import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('world context admin exposes backend context type filtering', () => {
  for (const token of [
    'type WorldContextTypeFilter',
    'selectedWorldContextType',
    'worldContextTypeOptions',
    'handleWorldContextTypeChange',
    '世界条件类型',
    'MOON_PHASE',
  ]) {
    assert.match(entitiesPage, new RegExp(escapeRegExp(token)))
  }

  assert.doesNotMatch(entitiesPage, /value: 'LOCAL_CONDITION'/)

  assert.match(
    entitiesPage,
    /if \(entityType\.value === 'world-contexts' && selectedWorldContextType\.value !== 'all'\) \{[\s\S]*?params\.contextType = selectedWorldContextType\.value[\s\S]*?\}/,
  )
  assert.match(
    entitiesPage,
    /async function handleWorldContextTypeChange\(value: WorldContextTypeFilter\) \{[\s\S]*?selectedWorldContextType\.value = value[\s\S]*?await syncRouteQuery\(1\)[\s\S]*?await fetchRows\(1\)[\s\S]*?\}/,
  )
})

test('world context admin renders traceability fields and raw evidence editor', () => {
  const worldContextConfig = entitiesPage.match(/'world-contexts': \{[\s\S]*?\n  \},\n\}/)?.[0] ?? ''

  for (const token of [
    "{ key: '__imageUrl', label: '预览' }",
    "{ key: 'sourceProvider', label: '来源提供方 sourceProvider'",
    "{ key: 'sourcePage', label: '来源页 sourcePage'",
    "{ key: 'sourceRevisionTimestamp', label: '来源修订时间 sourceRevisionTimestamp'",
    "{ key: 'lastSyncedAt', label: '最后同步时间 lastSyncedAt'",
    "{ key: 'rawJson', label: '原始 JSON rawJson'",
    "format: 'json'",
  ]) {
    assert.match(worldContextConfig, new RegExp(escapeRegExp(token)))
  }
})

test('entity workspace operator copy is Chinese-first for JSON and source controls', () => {
  for (const token of [
    '保留英文名',
    '保留内部标识',
    '格式化 JSON',
    '原始 JSON rawJson',
    'JSON 格式无效',
    '提交失败',
    '确认删除 #',
    '删除失败',
    '可预览',
    '来源页 sourcePage',
    '来源提供方 sourceProvider',
    '来源修订时间 sourceRevisionTimestamp',
    'AI 样式 aiStyle',
    '来源物品 JSON sourceItemsJson',
  ]) {
    assert.match(entitiesPage, new RegExp(escapeRegExp(token)))
  }
})

test('world context admin surfaces source and quality cues in preview and detail', () => {
  for (const token of [
    'worldContextPreviewWarnings',
    'worldContextDetailWarnings',
    'buildWorldContextDataQualityWarnings',
    'worldContextSourceMetadata',
    '世界条件详情',
    '来源信息',
    '数据质量提示',
    '缺少来源页面',
    '缺少同步时间',
    '缺少英文名',
    '缺少条件类型',
    '缺少描述',
  ]) {
    assert.match(entitiesPage, new RegExp(escapeRegExp(token)))
  }

  assert.match(entitiesPage, /buildWorldContextDataQualityWarnings\(previewRow\.value\)/)
  assert.match(entitiesPage, /buildWorldContextDataQualityWarnings\(detailRow\.value\)/)
  assert.match(entitiesPage, /formatWorldContextTypeLabel\(previewRow\.value\.contextType\)/)
  assert.match(entitiesPage, /formatWorldContextTypeLabel\(detailRow\.value\.contextType\)/)
})

test('condition terms admin is separated from world contexts', () => {
  for (const token of [
    "'condition-terms': {",
    "endpoint: '/admin/condition-terms'",
    'CONDITION TERM',
    '本地条件词汇',
    'termType',
    'MOON_PHASE_RANGE',
    'EVENT_COMPLETED',
    'BOSS_PROGRESS',
  ]) {
    assert.match(entitiesPage, new RegExp(escapeRegExp(token)))
  }
})
