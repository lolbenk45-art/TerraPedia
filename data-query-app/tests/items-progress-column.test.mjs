import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const itemsPage = fs.readFileSync(path.join(repoRoot, 'pages', 'items.vue'), 'utf8')

test('items list progress column only renders game period', () => {
  const progressCell = itemsPage.match(/<td>\{\{ getGamePeriodLabel[\s\S]*?<\/td>/)?.[0] ?? ''

  assert.match(progressCell, /getGamePeriodLabel/)
  assert.doesNotMatch(progressCell, /getGameModelLabel/)
})

test('game model label does not treat missing value as normal mode', () => {
  assert.match(itemsPage, /gameModelId == null \? '未设置'/)
})

test('items page uses Chinese-first catalog operator copy', () => {
  assert.match(itemsPage, /物品目录/)
  assert.match(itemsPage, /物品总数/)
  assert.match(itemsPage, /当前可见/)
  assert.match(itemsPage, /已选择/)
  assert.match(itemsPage, /关键词/)
  assert.match(itemsPage, /品质/)
  assert.match(itemsPage, /时期/)
  assert.match(itemsPage, /分类/)
  assert.match(itemsPage, /收藏/)

  assert.doesNotMatch(itemsPage, />ITEM CATALOG</)
  assert.doesNotMatch(itemsPage, />Total Items</)
  assert.doesNotMatch(itemsPage, />Visible</)
  assert.doesNotMatch(itemsPage, />Selection</)
  assert.doesNotMatch(itemsPage, />Keyword</)
  assert.doesNotMatch(itemsPage, />Rarity</)
  assert.doesNotMatch(itemsPage, />Period</)
  assert.doesNotMatch(itemsPage, />Category</)
  assert.doesNotMatch(itemsPage, />Collection</)
})
