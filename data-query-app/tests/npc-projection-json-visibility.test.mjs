import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')
const itemDetail = fs.readFileSync(path.join(repoRoot, 'components', 'ItemDetail.vue'), 'utf8')
const townNpcWorkbench = fs.readFileSync(path.join(repoRoot, 'components', 'TownNpcWorkbenchModal.vue'), 'utf8')
const townNpcIndex = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', 'town-npcs', 'index.vue'), 'utf8')
const townNpcDetail = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', 'town-npcs', '[id]', 'index.vue'), 'utf8')
const townNpcEdit = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', 'town-npcs', '[id]', 'edit.vue'), 'utf8')
const townNpcComposable = fs.readFileSync(path.join(repoRoot, 'composables', 'useTownNpcMaintenance.ts'), 'utf8')

test('generic NPC admin config exposes projection JSON fields', () => {
  const npcConfig = entitiesPage.match(/npcs:\s*\{[\s\S]*?\n\s*bosses:/)?.[0] ?? ''

  assert.match(npcConfig, /key: 'lootItemsJson'/)
  assert.match(npcConfig, /key: 'shopItemsJson'/)
  assert.match(npcConfig, /key: 'sourceItemsJson'/)
})

test('town NPC shop cards use shared image resolver for itemImageUrl fallbacks', () => {
  assert.match(townNpcComposable, /resolveTownNpcShopItemImage/)
  assert.match(townNpcComposable, /itemImageUrl/)
  for (const source of [townNpcWorkbench, townNpcIndex, townNpcDetail, townNpcEdit]) {
    assert.match(source, /resolveTownNpcShopItemImage/)
  }
})

test('town NPC main image resolver falls back through managed wiki assets', () => {
  assert.match(townNpcComposable, /export const resolveTownNpcMainImage/)
  assert.match(
    townNpcComposable,
    /imageUrl[\s\S]*?wikiAssets\?\.spriteImage[\s\S]*?wikiDetails\?\.spriteImage[\s\S]*?wikiAssets\?\.dialogPortraitImage[\s\S]*?wikiDetails\?\.dialogPortraitImage[\s\S]*?wikiAssets\?\.mapIconImage[\s\S]*?wikiDetails\?\.mapIconImage/
  )
  assert.match(townNpcComposable, /\.trim\(\)/)
})

test('town NPC detail portrait uses shared main image resolver', () => {
  assert.match(townNpcDetail, /resolveTownNpcMainImage/)
  assert.match(townNpcDetail, /const mainImageUrl = computed\(\(\) => resolveTownNpcMainImage\(selectedRow\.value\)\)/)
  assert.match(townNpcDetail, /v-if="mainImageUrl"/)
  assert.match(townNpcDetail, /:src="mainImageUrl"/)
  assert.doesNotMatch(townNpcDetail, /v-if="selectedRow\.imageUrl"/)
  assert.doesNotMatch(townNpcDetail, /:src="selectedRow\.imageUrl"/)
})

test('town NPC overview and workbench portraits use shared main image resolver', () => {
  for (const source of [townNpcIndex, townNpcWorkbench]) {
    assert.match(source, /resolveTownNpcMainImage/)
    assert.match(source, /v-if="resolveTownNpcMainImage\(row\)"/)
    assert.match(source, /:src="resolveTownNpcMainImage\(row\)"/)
    assert.doesNotMatch(source, /v-if="row\.imageUrl"\s*:src="row\.imageUrl"/)
  }
})

test('generic NPC admin detail displays parsed projection relation summaries', () => {
  assert.match(entitiesPage, /npcProjectionRelationGroups/)
  assert.match(entitiesPage, /投影关系/)
  assert.match(entitiesPage, /sourceFactKey/)
})

test('generic NPC admin projection cards render every relation row with item thumbnails', () => {
  assert.doesNotMatch(entitiesPage, /rows\.slice\(0,\s*8\)/)
  assert.match(entitiesPage, /getNpcProjectionImage/)
  assert.match(entitiesPage, /trustedNpcShopImageByItemKey/)
  assert.match(entitiesPage, /itemImageUrl/)
  assert.match(entitiesPage, /npc-projection-entry__image/)
  assert.match(entitiesPage, /openLinkedItemDetail\(entry\)/)
})

test('generic NPC shop projection cards prefer trusted backend images over projection JSON images', () => {
  assert.match(entitiesPage, /function isTrustedWikiImageUrl/)
  assert.match(entitiesPage, /terrapedia-images/)
  assert.match(entitiesPage, /demo/)
  assert.match(entitiesPage, /placed/)
  assert.match(entitiesPage, /function pickTrustedNpcProjectionImage/)
  assert.match(entitiesPage, /if \(key === 'shop'\) return getTrustedNpcShopImage\(entry\) \|\| getNpcProjectionImage\(entry\)/)
})

test('generic NPC loot projection cards prefer trusted structured loot images', () => {
  const lootLookupBlock = entitiesPage.match(/const trustedNpcLootImageByItemKey = computed[\s\S]*?\n\}\)/)?.[0] ?? ''
  const lootResolverBlock = entitiesPage.match(/function getTrustedNpcLootImage[\s\S]*?\n\}/)?.[0] ?? ''

  assert.match(entitiesPage, /trustedNpcLootImageByItemKey/)
  assert.match(entitiesPage, /function getTrustedNpcLootImage/)
  assert.match(entitiesPage, /isManagedTerrapediaImageUrl/)
  assert.match(lootLookupBlock, /for \(const key of \[entry\.itemId, entry\.itemInternalName, entry\.internalName\]\)/)
  assert.match(lootResolverBlock, /for \(const key of \[entry\.itemId, entry\.itemInternalName, entry\.internalName\]\)/)
  assert.doesNotMatch(lootLookupBlock, /sourceItemId|itemSourceId/)
  assert.doesNotMatch(lootResolverBlock, /sourceItemId|itemSourceId/)
  assert.match(entitiesPage, /if \(key === 'loot'\) return getTrustedNpcLootImage\(entry\) \|\| getNpcProjectionImage\(entry\)/)
})

test('generic NPC admin marks inherited prototype loot separately', () => {
  assert.match(entitiesPage, /inheritedLootEntryCount/)
  assert.match(entitiesPage, /原型掉落/)
  assert.match(entitiesPage, /getNpcLootProvenanceLabel/)
  assert.match(entitiesPage, /trustedStructured/)
  assert.match(entitiesPage, /lootSourceMode/)
})

test('generic NPC admin keeps untrusted fallback loot out of trusted structured section', () => {
  assert.match(entitiesPage, /可信结构化掉落/)
  assert.match(entitiesPage, /filter\(isTrustedDirectNpcLoot\)/)
  assert.match(entitiesPage, /mode === 'direct' && trustedStructured === true/)
  assert.match(entitiesPage, /trustedStructured=true 且 lootSourceMode=direct/)
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
