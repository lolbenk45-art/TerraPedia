import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const pagePath = 'data-query-app/pages/operations/classification-audit.vue'

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('classification audit route page exists and consumes only the read-only endpoint', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, pagePath)))

  const page = read(pagePath)

  assert.match(page, /definePageMeta\(\{\s*title:\s*'分类审计'/)
  assert.match(page, /navSection:\s*'\/operations\/classification-audit'/)
  assert.match(page, /get<.*ClassificationAuditResponse>/)
  assert.match(page, /\/admin\/operations\/classification-audit/)
  assert.doesNotMatch(page, /\/admin\/items/)
  assert.doesNotMatch(page, /\/admin\/npcs/)
  assert.doesNotMatch(page, /\/admin\/entities/)
})

test('classification audit page is explicitly read-only and exposes no write actions', () => {
  const page = read(pagePath)
  const lowerPage = page.toLowerCase()

  assert.match(page, /只读/)
  assert.match(page, /仅展示后端审计结果，不写入数据/)
  assert.doesNotMatch(page, /\b(post|put|delete|patch)\s*\(/i)
  assert.doesNotMatch(lowerPage, /\b(apply|sync|repair|bulk|materialize|rollback)\b/)
  assert.doesNotMatch(page, />(?:[^<]*(?:修复|应用|同步|批量|物化|回滚)[^<]*)</)
  assert.doesNotMatch(page, /<button[\s\S]*?(修复|应用|同步|批量|物化|回滚)[\s\S]*?<\/button>/)
})

test('classification audit page defines the five backend audit sections', () => {
  const page = read(pagePath)

  assert.deepEqual(readSectionKeys(page), [
    'uncategorizedItems',
    'uncategorizedNpcs',
    'unknownDropSourceKinds',
    'missingReferences',
    'itemCategoryConflicts',
  ])
  assert.match(page, /未分类物品/)
  assert.match(page, /未分类 NPC/)
  assert.match(page, /未知掉落来源类型/)
  assert.match(page, /缺失引用/)
  assert.match(page, /物品主分类与关联冲突/)
})

test('classification audit page has one zero-result empty state per section', () => {
  const page = read(pagePath)

  assert.equal((page.match(/emptyText:/g) || []).length, 5)
  assert.match(page, /当前没有未分类物品。/)
  assert.match(page, /当前没有未分类 NPC。/)
  assert.match(page, /当前没有未知掉落来源类型。/)
  assert.match(page, /当前没有缺失引用。/)
  assert.match(page, /当前没有物品主分类与关联冲突。/)
  assert.match(page, /v-else\s+class="audit-empty"/)
})

test('operations navigation includes the classification audit route', () => {
  const layout = read('data-query-app/layouts/default.vue')

  assert.match(layout, /path:\s*'\/operations\/classification-audit'/)
  assert.match(layout, /name:\s*'分类审计'/)
})

function readSectionKeys(page) {
  const match = page.match(/const sectionConfigs = \[([\s\S]*?)\] as const/)
  assert.ok(match, 'sectionConfigs array should be present')
  return [...match[1].matchAll(/key:\s*'([^']+)'/g)].map((item) => item[1])
}
