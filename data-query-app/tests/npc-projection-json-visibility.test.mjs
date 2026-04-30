import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')
const itemDetail = fs.readFileSync(path.join(repoRoot, 'components', 'ItemDetail.vue'), 'utf8')

test('generic NPC admin config exposes projection JSON fields', () => {
  const npcConfig = entitiesPage.match(/npcs:\s*\{[\s\S]*?\n\s*bosses:/)?.[0] ?? ''

  assert.match(npcConfig, /key: 'lootItemsJson'/)
  assert.match(npcConfig, /key: 'shopItemsJson'/)
  assert.match(npcConfig, /key: 'sourceItemsJson'/)
})

test('generic NPC admin detail displays parsed projection relation summaries', () => {
  assert.match(entitiesPage, /npcProjectionRelationGroups/)
  assert.match(entitiesPage, /投影关系/)
  assert.match(entitiesPage, /sourceFactKey/)
})

test('generic NPC admin marks inherited prototype loot separately', () => {
  assert.match(entitiesPage, /inheritedLootEntryCount/)
  assert.match(entitiesPage, /原型掉落/)
})

test('generic NPC admin exposes a structured loot edit action from detail view', () => {
  assert.match(entitiesPage, /npcLootEntries\.length/)
  assert.match(entitiesPage, /编辑结构化掉落/)
  assert.match(entitiesPage, /openEditDialog\(detailRow\)/)
})

test('admin item detail labels parsed source NPC cards as summaries, not raw JSON', () => {
  assert.match(itemDetail, /来源 NPC 摘要/)
  assert.doesNotMatch(itemDetail, /来源 NPC JSON/)
})
