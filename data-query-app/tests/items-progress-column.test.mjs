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
