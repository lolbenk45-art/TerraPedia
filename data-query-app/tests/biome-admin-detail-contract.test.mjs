import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')
const nuxtConfig = fs.readFileSync(path.join(repoRoot, 'nuxt.config.ts'), 'utf8')
const itemsStore = fs.readFileSync(path.join(repoRoot, 'stores', 'items.ts'), 'utf8')

test('generic biome admin rows expose the same detail action as other managed entities', () => {
  const rowActions = entitiesPage.match(/<div class="row-actions">[\s\S]*?<\/div>/)?.[0] ?? ''

  assert.match(rowActions, /entityType === 'biomes'/)
  assert.match(rowActions, /openDetailDialog\(row\)[\s\S]*>详情<\/button>/)
})

test('generic biome admin detail renders structured description relations and resources', () => {
  const biomeDetailSection = entitiesPage.match(/<div v-else-if="detailRow && entityType === 'biomes'"[\s\S]*?<div v-else-if="detailRow && entityType === 'projectiles'"/)?.[0] ?? ''

  assert.match(biomeDetailSection, /detailBiomeDescription/)
  assert.match(biomeDetailSection, /biomeRelationCards/)
  assert.match(biomeDetailSection, /biomeResourceCards/)
  assert.match(biomeDetailSection, /getBiomeResourceImage\(resource\)/)
  assert.match(biomeDetailSection, /getBiomeResourceRawFallback\(resource\)/)
  assert.match(entitiesPage, /const biomeRelationCards = computed/)
  assert.match(entitiesPage, /const biomeResourceCards = computed/)
})

test('biome admin detail renders item relations npc appearances and source evidence sections', () => {
  const biomeDetailSection = entitiesPage.match(/<div v-else-if="detailRow && entityType === 'biomes'"[\s\S]*?<div v-else-if="detailRow && entityType === 'projectiles'"/)?.[0] ?? ''

  for (const heading of ['相关群系', '资源与物品', '物品关系', 'NPC 出现', '来源证据']) {
    assert.match(biomeDetailSection, new RegExp(heading))
  }

  assert.match(biomeDetailSection, /biomeItemRelationCards\.length/)
  assert.match(biomeDetailSection, /biomeNpcRelationCards\.length/)
  assert.match(biomeDetailSection, /biomeItemSourceCards\.length/)
  assert.match(biomeDetailSection, /v-for="relation in biomeItemRelationCards"/)
  assert.match(biomeDetailSection, /v-for="npc in biomeNpcRelationCards"/)
  assert.match(biomeDetailSection, /v-for="source in biomeItemSourceCards"/)
  assert.match(biomeDetailSection, /getBiomeResourceImage\(relation\)/)
  assert.match(biomeDetailSection, /getBiomeResourceRawFallback\(relation\)/)
  assert.match(biomeDetailSection, /canOpenLinkedItemDetail\(relation\.raw\)/)
  assert.match(biomeDetailSection, /getBiomeResourceImage\(npc\)/)
  assert.match(biomeDetailSection, /getBiomeNpcRawFallback\(npc\)/)
  assert.match(biomeDetailSection, /getBiomeResourceImage\(source\)/)
  assert.match(biomeDetailSection, /getBiomeResourceRawFallback\(source\)/)
  assert.match(biomeDetailSection, /canOpenLinkedItemDetail\(source\.raw\)/)
  assert.match(biomeDetailSection, /暂无物品关系数据。/)
  assert.match(biomeDetailSection, /暂无 NPC 出现数据。/)
  assert.match(biomeDetailSection, /暂无来源证据数据。/)
  assert.match(entitiesPage, /const biomeItemRelationCards = computed/)
  assert.match(entitiesPage, /const biomeNpcRelationCards = computed/)
  assert.match(entitiesPage, /const biomeItemSourceCards = computed/)
  assert.match(entitiesPage, /function normalizeBiomeItemRelationCard/)
  assert.match(entitiesPage, /function normalizeBiomeNpcRelationCard/)
  assert.match(entitiesPage, /function normalizeBiomeItemSourceCard/)
  assert.match(entitiesPage, /function getBiomeNpcRawFallback/)
  assert.match(entitiesPage, /\.biome-detail \.armor-detail__item-body strong,\s*\.biome-detail \.armor-detail__item-body span,\s*\.biome-detail \.preview-note p\s*\{[^}]*overflow-wrap:\s*anywhere/)
})

test('biome admin detail localizes relation source and spawn evidence labels', () => {
  assert.match(entitiesPage, /function formatBiomeRelationTypeLabel/)
  assert.match(entitiesPage, /function formatBiomeSourceTypeLabel/)
  assert.match(entitiesPage, /function formatBiomeSourceRefTypeLabel/)
  assert.match(entitiesPage, /function formatBiomeSpawnContextLabel/)
  assert.match(entitiesPage, /function formatBiomeSourceRefNameLabel/)
  assert.match(entitiesPage, /found_in:\s*'发现于'/)
  assert.match(entitiesPage, /appears_in:\s*'出现于'/)
  assert.match(entitiesPage, /biome_wikitext:\s*'群系 Wiki 详情'/)
  assert.match(entitiesPage, /During the day['"]?:\s*'白天'/)
  assert.match(entitiesPage, /From Goblin Scouts['"]?:\s*'来自哥布林侦察兵'/)
  assert.match(entitiesPage, /formatBiomeRelationTypeLabel\(raw\.relationType\)/)
  assert.match(entitiesPage, /formatBiomeSourceRefTypeLabel\(raw\.sourceRefType\)/)
  assert.match(entitiesPage, /formatBiomeSpawnContextLabel\(raw\.spawnContext\)/)
  assert.match(entitiesPage, /formatBiomeSourceRefNameLabel\(raw\.sourceRefName\)/)
})

test('biome list preview uses a landscape thumbnail instead of a square icon slot', () => {
  assert.match(entitiesPage, /thumb-wrap--biome/)
  assert.match(entitiesPage, /thumb--biome/)
  assert.match(entitiesPage, /\.thumb-wrap--biome\s*\{[^}]*width:\s*128px/)
  assert.match(entitiesPage, /\.thumb--biome\s*\{[^}]*width:\s*128px[^}]*height:\s*44px/)
})

test('managed biome images render through the admin same-origin proxy', () => {
  assert.match(entitiesPage, /function normalizeManagedImagePath/)
  assert.match(entitiesPage, /\/terrapedia-images\//)
  assert.match(entitiesPage, /normalizeManagedImagePath\(normalized\)/)
  assert.match(nuxtConfig, /TERRAPEDIA_MINIO_PUBLIC_ENDPOINT/)
  assert.match(nuxtConfig, /['"]\/terrapedia-images['"]/)
})

test('managed item images render through the admin same-origin proxy', () => {
  assert.match(itemsStore, /function normalizeManagedImagePath/)
  assert.match(itemsStore, /\/terrapedia-images\//)
  assert.match(itemsStore, /normalizeManagedImagePath\(imgUrl\)/)
  assert.match(itemsStore, /normalizeManagedImagePath\(`http:\/\/\$\{imgUrl\}`\)/)
  assert.match(itemsStore, /raw\?\.cachedUrl \?\? raw\?\.originalUrl/)
  assert.match(itemsStore, /imageUrl: normalizeAssetUrl\(raw\)/)
})

test('biome admin separates wiki categories with Chinese labels and a server-side group filter', () => {
  assert.match(entitiesPage, /selectedBiomeWikiGroup/)
  assert.match(entitiesPage, /biomeWikiGroupOptions/)
  assert.match(entitiesPage, /handleBiomeWikiGroupSelectChange/)
  assert.match(entitiesPage, /getBiomeGroupLabel/)
  assert.match(entitiesPage, /getBiomeTypeLabel/)
  assert.match(entitiesPage, /getBiomeLayerLabel/)
  assert.match(entitiesPage, /params\.wikiGroupCode = selectedBiomeWikiGroup\.value/)
  assert.match(entitiesPage, /nextQuery\.biomeWikiGroup = selectedBiomeWikiGroup\.value/)
  assert.match(entitiesPage, /地表和地下/)
  assert.match(entitiesPage, /小型群系/)
  assert.match(entitiesPage, /微型群系/)
  assert.match(entitiesPage, /宝藏房/)
  assert.match(entitiesPage, /getBiomeTypeLabel\(row\.biomeType\)/)
  assert.match(entitiesPage, /getBiomeLayerLabel\(row\.layerType\)/)
})

test('biome admin uses wiki taxonomy hierarchy instead of flattened layer chips', () => {
  assert.match(entitiesPage, /biomeWikiGroupOptions/)
  assert.match(entitiesPage, /selectedBiomeWikiGroup/)
  assert.match(entitiesPage, /<select[\s\S]*v-model="selectedBiomeWikiGroup"[\s\S]*@change="handleBiomeWikiGroupSelectChange"/)
  assert.match(entitiesPage, /biome-taxonomy-select/)
  assert.doesNotMatch(entitiesPage, /v-for="option in biomeWikiGroupOptions"[\s\S]*class="filter-chip biome-taxonomy-filter__chip"/)
  assert.match(entitiesPage, /params\.wikiGroupCode = selectedBiomeWikiGroup\.value/)
  assert.match(entitiesPage, /nextQuery\.biomeWikiGroup = selectedBiomeWikiGroup\.value/)

  for (const label of ['太空', '地表和地下', '森林', '洞穴', '困难模式', '微型群系', '尖刺洞穴', '宝藏房']) {
    assert.match(entitiesPage, new RegExp(label))
  }

  assert.match(entitiesPage, /getBiomeWikiCategoryPath\(row\)/)
  assert.match(entitiesPage, /wikiCategoryPathZh/)
})
