import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const entitiesPage = fs.readFileSync(path.join(repoRoot, 'pages', 'entities', '[type].vue'), 'utf8')

test('boss admin detail consumes P2 structured contract without summon text inference', () => {
  assert.match(entitiesPage, /summonMethodResolved/)
  assert.match(entitiesPage, /summonItems/)
  assert.match(entitiesPage, /summonConditions/)
  assert.match(entitiesPage, /mechanicNotes/)
  assert.match(entitiesPage, /difficultyNotes/)

  assert.doesNotMatch(entitiesPage, /collectBossSummonCandidates/)
  assert.doesNotMatch(entitiesPage, /resolveBossSummonCandidate/)
  assert.doesNotMatch(entitiesPage, /loadBossSummonItems/)
  assert.doesNotMatch(entitiesPage, /\/items\/suggestions/)
})

test('boss admin P2 fact groups render display whitelist only', () => {
  const factGroups = entitiesPage.match(/const bossSummonFactGroups = computed\(\(\) => \{[\s\S]*?\n\}\)\nconst bossSummonContractEmpty/)
  assert.ok(factGroups, 'bossSummonFactGroups computed block should exist')
  const block = factGroups[0]

  for (const displayKey of ['nameZh', 'name', 'itemId', 'label', 'value', 'title', 'description']) {
    assert.match(block, new RegExp(`key: '${displayKey}'`))
  }

  for (const rawKey of ['internalName', 'sourceText', 'role', 'kind', 'mode', 'conditionType', 'derived', 'confidence']) {
    assert.doesNotMatch(block, new RegExp(`key: '${rawKey}'`))
  }
})
