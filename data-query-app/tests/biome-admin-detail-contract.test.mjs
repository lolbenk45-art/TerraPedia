import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')
const nuxtConfig = fs.readFileSync(path.join(repoRoot, 'nuxt.config.ts'), 'utf8')

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

test('biome admin separates wiki categories with Chinese labels and a server-side group filter', () => {
  assert.match(entitiesPage, /selectedBiomeGroup/)
  assert.match(entitiesPage, /biomeGroupOptions/)
  assert.match(entitiesPage, /handleBiomeGroupChange/)
  assert.match(entitiesPage, /getBiomeGroupLabel/)
  assert.match(entitiesPage, /getBiomeTypeLabel/)
  assert.match(entitiesPage, /getBiomeLayerLabel/)
  assert.match(entitiesPage, /params\.group = selectedBiomeGroup\.value/)
  assert.match(entitiesPage, /nextQuery\.biomeGroup = selectedBiomeGroup\.value/)
  assert.match(entitiesPage, /生物群落/)
  assert.match(entitiesPage, /小型群系/)
  assert.match(entitiesPage, /微型群系/)
  assert.match(entitiesPage, /宝藏房/)
  assert.match(entitiesPage, /getBiomeTypeLabel\(row\.biomeType\)/)
  assert.match(entitiesPage, /getBiomeLayerLabel\(row\.layerType\)/)
})
