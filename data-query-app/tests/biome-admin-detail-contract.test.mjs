import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')

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
