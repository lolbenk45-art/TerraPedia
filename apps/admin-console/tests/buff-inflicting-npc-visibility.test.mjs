import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')

test('buff detail displays NPCs that inflict the selected buff separately from immune NPCs', () => {
  const buffDetailSection = entitiesPage.match(/<div v-else-if="detailRow && entityType === 'buffs'"[\s\S]*?<\/AppModal>/)?.[0] ?? ''
  assert.match(buffDetailSection, /detailInflictingNpcSamples/)
  assert.match(buffDetailSection, /formatNpcBuffDurationText\(npc\.durationText\)/)
  assert.match(entitiesPage, /inflictingNpcCount/)
  assert.match(entitiesPage, /immuneNpcCount/)
})

test('buff detail reads inflictingNpcSamples from admin buff detail payload', () => {
  assert.match(entitiesPage, /const detailInflictingNpcSamples = computed/)
  assert.match(entitiesPage, /detailRow\.value\.inflictingNpcSamples/)
  assert.match(entitiesPage, /inflictingNpcCount/)
})

test('buff detail formats inflicting npc duration instead of rendering wiki templates directly', () => {
  assert.match(entitiesPage, /function formatNpcBuffDurationText/)
  assert.match(entitiesPage, /formatNpcBuffDurationText\(npc\.durationText\)/)
  assert.doesNotMatch(entitiesPage, /`持续 \$\{npc\.durationText\}`/)
})

test('npc detail renders structured buff relations as readable cards', () => {
  const npcDetailSection = entitiesPage.match(/<div v-else-if="detailRow && entityType === 'npcs'"[\s\S]*?<div v-else-if="detailRow && entityType === 'projectiles'"/)?.[0] ?? ''
  assert.match(npcDetailSection, /npcBuffRelations/)
  assert.match(npcDetailSection, /formatNpcBuffRelationDuration\(entry\)/)
  assert.match(npcDetailSection, /formatNpcBuffRelationTitle\(entry/)
  assert.match(npcDetailSection, /entry\.buffImage/)
})

test('buff detail hides empty source json blocks instead of rendering blank arrays', () => {
  assert.match(entitiesPage, /detailBuffSourceJsonBlocks/)
  assert.doesNotMatch(entitiesPage, /detailRow\.sourceItemsJson \|\| detailRow\.immuneNpcSampleJson/)
})

test('buff detail cards resolve compatible item and npc image fields without raw wiki priority', () => {
  const buffSourceItemSection = entitiesPage.match(/<section v-if="detailSourceItems\.length"[\s\S]*?<\/section>/)?.[0] ?? ''
  const getBuffFactImageBody = entitiesPage.match(/function getBuffFactImage\(entry: Record<string, any>\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(entitiesPage, /function getBuffFactImage/)
  assert.match(buffSourceItemSection, /getBuffFactImage\(item\)/)
  assert.doesNotMatch(buffSourceItemSection, /getProjectileSourceImage\(item\)/)
  assert.match(entitiesPage, /entry\.npcImageUrl/)
  assert.match(entitiesPage, /entry\.itemImageUrl/)
  assert.match(entitiesPage, /entry\.image_url/)
  assert.match(entitiesPage, /isRawWikiImageUrl/)
  assert.doesNotMatch(getBuffFactImageBody, /fallbackRawWikiImages/)
  assert.doesNotMatch(getBuffFactImageBody, /return\s+fallbackRawWikiImages\[0\]/)
})

test('buff detail truncates large immune npc arrays and shows empty evidence state', () => {
  assert.match(entitiesPage, /visibleImmuneNpcSamples/)
  assert.match(entitiesPage, /BUFF_IMMUNE_NPC_PREVIEW_LIMIT/)
  assert.match(entitiesPage, /detailBuffEvidenceEmptyState/)
})
