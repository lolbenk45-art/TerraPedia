import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { resolveArmorAggregateOrFallback } from '../utils/armorSetAggregate.mjs'

const typesSource = readFileSync(new URL('../types/public-api.ts', import.meta.url), 'utf8')
const detailComposableSource = readFileSync(new URL('../composables/usePublicArmorSetDetail.ts', import.meta.url), 'utf8')
const armorDetailSource = readFileSync(new URL('../pages/armor-sets/[id].vue', import.meta.url), 'utf8')

assert.match(typesSource, /pieceEffects\?: Record<string, PublicItemEquipmentEffect\[\] \| null> \| null/)
assert.match(typesSource, /pieceRecipes\?: Record<string, PublicItemRecipeTree \| null> \| null/)
assert.match(detailComposableSource, /include:\s*'piece-effects,recipes'/)
assert.match(armorDetailSource, /Object\.prototype\.hasOwnProperty\.call\(\s*armorRaw\.value \?\? \{\},\s*'pieceEffects'/)
assert.match(armorDetailSource, /Object\.prototype\.hasOwnProperty\.call\(\s*armorRaw\.value \?\? \{\},\s*'pieceRecipes'/)
assert.match(armorDetailSource, /field:\s*'pieceEffects'/)
assert.match(armorDetailSource, /field:\s*'pieceRecipes'/)
assert.ok(armorDetailSource.includes('/equipment-effects'), 'piece effects must retain the legacy endpoint fallback')
assert.ok(armorDetailSource.includes('/recipe-tree'), 'piece recipes must retain the legacy endpoint fallback')
assert.match(armorDetailSource, /armorUniqueItemKey\(item\)/, 'aggregate effects must preserve build-record keys')
assert.match(armorDetailSource, /armorBuildRecipeSummary\(item, tree\)/, 'aggregate recipes must reuse the existing display normalizer')

let aggregateCalls = 0
let fallbackCalls = 0
const aggregateResult = await resolveArmorAggregateOrFallback({
  raw: { pieceEffects: {} },
  field: 'pieceEffects',
  aggregate: () => {
    aggregateCalls += 1
    return 'aggregate'
  },
  fallback: () => {
    fallbackCalls += 1
    return 'fallback'
  },
})
assert.equal(aggregateResult, 'aggregate')
assert.equal(aggregateCalls, 1)
assert.equal(fallbackCalls, 0, 'present empty aggregate maps must suppress legacy requests')

const fallbackResult = await resolveArmorAggregateOrFallback({
  raw: {},
  field: 'pieceEffects',
  aggregate: () => 'aggregate',
  fallback: () => {
    fallbackCalls += 1
    return 'fallback'
  },
})
assert.equal(fallbackResult, 'fallback')
assert.equal(fallbackCalls, 1, 'absent aggregate maps must execute the legacy request family')

console.log('Armor aggregate contract passed.')
