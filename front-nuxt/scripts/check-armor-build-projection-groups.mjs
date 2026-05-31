import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createArmorSetBuildGroups } from '../utils/armorSetBuilds.mjs'

const item = (name, role, variant, part, extra = {}) => ({
  itemId: `${name}-${variant}-${part}`,
  internalName: name,
  name,
  nameZh: name,
  partRole: role,
  setVariantIndex: variant,
  partIndex: part,
  defenseValue: extra.defenseValue ?? 1,
  ...extra,
})

const hallowed = [
  item('神圣头饰', '头部', 0, 0),
  item('远古神圣头饰', '头部', 0, 0),
  item('神圣板甲', '身体', 0, 1),
  item('远古神圣板甲', '身体', 0, 1),
  item('神圣护胫', '腿部', 0, 2),
  item('远古神圣护胫', '腿部', 0, 2),
  item('神圣面具', '头部', 1, 0),
  item('远古神圣面具', '头部', 1, 0),
  item('神圣板甲', '身体', 1, 1),
  item('远古神圣板甲', '身体', 1, 1),
  item('神圣护胫', '腿部', 1, 2),
  item('远古神圣护胫', '腿部', 1, 2),
  item('神圣头盔', '头部', 2, 0),
  item('远古神圣头盔', '头部', 2, 0),
  item('神圣板甲', '身体', 2, 1),
  item('远古神圣板甲', '身体', 2, 1),
  item('神圣护胫', '腿部', 2, 2),
  item('远古神圣护胫', '腿部', 2, 2),
]

const hallowedGroups = createArmorSetBuildGroups(hallowed)
assert.equal(hallowedGroups.length, 3, 'Hallowed should keep backend build count instead of expanding alternatives')
for (const group of hallowedGroups) {
  assert.equal(group.partGroups.length, 3, 'each Hallowed build should have head/body/legs slots')
  assert.deepEqual(group.partGroups.map((part) => part.alternatives.length), [2, 2, 2], 'each Hallowed slot should expose normal/ancient alternatives')
  assert.equal(group.displayItems.length, 3, 'display item list should use one representative per slot')
}

const snow = [
  item('防雪兜帽', '头部', 0, 0),
  item('粉色防雪兜帽', '头部', 0, 0),
  item('防雪大衣', '身体', 0, 1),
  item('粉色防雪大衣', '身体', 0, 1),
  item('防雪裤', '腿部', 0, 2),
  item('粉色防雪裤', '腿部', 0, 2),
]

const snowGroups = createArmorSetBuildGroups(snow)
assert.equal(snowGroups.length, 1, 'single-build equivalent families should still render as one explicit build')
assert.deepEqual(snowGroups[0].partGroups.map((part) => part.alternatives.length), [2, 2, 2], 'single-build equivalents should stay grouped by slot')

const mining = Array.from({ length: 12 }, (_, index) => ([
  item(index % 2 === 0 ? '挖矿头盔' : '超亮头盔', '头部', index, 0, { defenseValue: 1 }),
  item('挖矿衣', '身体', index, 1, { defenseValue: 2 }),
  item('挖矿裤', '腿部', index, 2, { defenseValue: 1 }),
])).flat()

const miningGroups = createArmorSetBuildGroups(mining)
assert.equal(miningGroups.length, 12, 'Mining variants should not be collapsed')
assert.deepEqual(new Set(miningGroups.map((group) => group.partGroups.length)), new Set([3]), 'Mining builds should keep complete slots')
assert.deepEqual(new Set(miningGroups.flatMap((group) => group.partGroups.map((part) => part.alternatives.length))), new Set([1]), 'Mining variants should not invent alternatives')

const armorDetailSource = readFileSync(new URL('../pages/armor-sets/[id].vue', import.meta.url), 'utf8')
assert.match(armorDetailSource, /const buildGroups = createArmorSetBuildGroups\(uniqueItems\) as ArmorBuildGroup\[\]\s+return buildGroups/, 'detail page should not merge explicit backend setVariantIndex builds after projection grouping')
assert.match(armorDetailSource, /buildGroup\.displayItems \?\? buildGroup\.variantItems/, 'detail page should render one representative item per projected slot')

console.log('Armor build projection groups contract passed.')
