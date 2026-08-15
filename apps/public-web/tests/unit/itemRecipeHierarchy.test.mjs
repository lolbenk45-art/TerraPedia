import assert from 'node:assert/strict'
import test from 'node:test'

import { buildItemRecipeHierarchy } from '../../utils/itemRecipeHierarchy.ts'

const entity = (key, title, quantity = 'x1') => ({
  key,
  itemId: key,
  title,
  subtitle: '',
  quantity,
  image: '',
  fallback: title.slice(0, 1),
  fallbackIcon: 'icon-items',
  href: `/items/${key}`,
})

const material = (key, title, options = {}) => ({
  ...entity(key, title, options.quantity),
  expandable: Boolean(options.childRecipe || options.childRecipes?.length),
  cycleDetected: false,
  isReference: false,
  referenceKey: '',
  isAnyGroup: Array.isArray(options.members) && options.members.length > 0,
  members: options.members ?? [],
  childRecipe: options.childRecipe ?? options.childRecipes?.[0] ?? null,
  childRecipes: options.childRecipes ?? (options.childRecipe ? [options.childRecipe] : []),
})

const station = (key, title) => ({
  key,
  title,
  meta: '制作站选项',
  image: '',
  fallback: title.slice(0, 1),
  fallbackIcon: 'icon-crafting',
  href: '',
  isCondition: false,
})

const recipe = (key, recipeId, output, materials, stations = [], summary = '') => ({
  key,
  label: `配方 · #${recipeId}`,
  summary,
  recipeId,
  output,
  materials,
  stations,
  conditions: [],
  expandable: false,
  cycleDetected: false,
  isReference: false,
  referenceKey: '',
})

const redBase = material('red-base', '赤色矿砂', { quantity: 'x2' })
const blueBase = material('blue-base', '蓝色矿砂')
const commonBase = material('common-base', '共享矿砂')
const commonFiber = material('common-fiber', '纤维束', { quantity: 'x4' })
const commonBinder = material('common-binder', '固化液', { quantity: 'x3' })
const redPartRecipe = recipe('red-part-recipe', 'red-part-recipe', entity('red-part', '赤色刃胚'), [redBase], [station('base-station', '基础锻台')], '赤色矿砂 x2；基础锻台')
const bluePartRecipe = recipe('blue-part-recipe', 'blue-part-recipe', entity('blue-part', '蓝色刃胚'), [blueBase], [station('base-station', '基础锻台')], '蓝色矿砂；基础锻台')
const commonPartRecipe = recipe('common-part-recipe', 'common-part-recipe', entity('common-part', '共享护芯'), [commonBase, commonFiber, commonBinder], [station('base-station', '基础锻台')], '共享矿砂 / 纤维束 x4 / 固化液 x3；基础锻台')
const redPart = material('red-part', '赤色刃胚', { childRecipe: redPartRecipe })
const bluePart = material('blue-part', '蓝色刃胚', { childRecipe: bluePartRecipe })
const commonPart = material('common-part', '共享护芯', { childRecipe: commonPartRecipe })
const redRoute = recipe('red-route', 'red-route', entity('bridge', '复合胚'), [redPart, commonPart], [station('branch-station', '分支锻台')])
const blueRoute = recipe('blue-route', 'blue-route', entity('bridge', '复合胚'), [bluePart, commonPart], [station('branch-station', '分支锻台')])
const bridge = material('bridge', '复合胚', { childRecipes: [redRoute, blueRoute] })
const catalyst = material('catalyst', '催化晶体')
const coreRecipe = recipe('core-recipe', 'core-recipe', entity('core', '淬火核心'), [bridge, catalyst])
const core = material('core', '淬火核心', { childRecipe: coreRecipe })
const directLeaf = material('direct-leaf', '遗迹碎片')
const archiveTarget = recipe('archive-target', 'archive-target', entity('target-x', '档案终端'), [core, directLeaf], [station('terminal', '终端锻台')])

const hierarchyModel = {
  target: entity('target-x', '档案终端'),
  variants: [{ key: 'current', label: '当前版本', meta: '1 条配方', options: [archiveTarget] }],
  activeVariant: { key: 'current', label: '当前版本', meta: '1 条配方', options: [archiveTarget] },
  activeRecipe: archiveTarget,
}

test('projects crafting roles instead of raw recursion depth into the approved stages', () => {
  const result = buildItemRecipeHierarchy(hierarchyModel)

  assert.equal(result.hasData, true)
  assert.deepEqual(result.stages.map((stage) => [stage.key, stage.entries.map((entry) => entry.title)]), [
    ['L3', ['赤色矿砂', '共享矿砂', '纤维束', '固化液', '蓝色矿砂']],
    ['L2', ['复合胚', '共享护芯']],
    ['L1', ['淬火核心', '遗迹碎片']],
    ['OUT', ['档案终端']],
  ])
  assert.deepEqual(result.stages.find((stage) => stage.key === 'L1')?.stations.map((entry) => entry.title), ['终端锻台'])
  assert.deepEqual(result.stages.find((stage) => stage.key === 'L2')?.stations.map((entry) => entry.title), ['分支锻台'])
  assert.deepEqual(result.stages.find((stage) => stage.key === 'L3')?.stations.map((entry) => entry.title), ['基础锻台'])
})

test('turns normalized child recipe options into an explicit one-to-one fork', () => {
  const result = buildItemRecipeHierarchy(hierarchyModel)
  const fork = result.stages.find((stage) => stage.key === 'L2')?.entries[0]

  assert.equal(fork?.isAlternativeGroup, true)
  assert.equal(fork?.title, '复合胚')
  assert.deepEqual(fork?.alternatives.map((entry) => entry.title), ['赤色刃胚', '蓝色刃胚'])
})

test('uses normalized material copy without station labels for node metadata', () => {
  const result = buildItemRecipeHierarchy(hierarchyModel)
  const fork = result.stages.find((stage) => stage.key === 'L2')?.entries[0]
  const common = result.stages.find((stage) => stage.key === 'L2')?.entries[1]

  assert.equal(fork?.alternatives[0]?.subtitle, '赤色矿砂 ×2')
  assert.equal(fork?.alternatives[1]?.subtitle, '蓝色矿砂')
  assert.equal(common?.subtitle, '共享矿砂 / 纤维束 / 固化液')
})

test('keeps every real branch leaf in procurement while deduplicating common leaves', () => {
  const result = buildItemRecipeHierarchy(hierarchyModel)

  assert.deepEqual(result.procurement.map((entry) => entry.title), [
    '赤色矿砂',
    '共享矿砂',
    '纤维束',
    '固化液',
    '蓝色矿砂',
    '催化晶体',
    '遗迹碎片',
  ])
  assert.equal(result.procurement.some((entry) => ['复合胚', '赤色刃胚', '蓝色刃胚', '共享护芯', '淬火核心'].includes(entry.title)), false)
})

test('keeps the selected variant and recipe option supplied by the shared crafting model', () => {
  const legacyRecipe = recipe('legacy-target', 'legacy-target', entity('target-x', '档案终端（旧版）'), [])
  const legacyVariant = { key: 'legacy', label: 'Old-gen console', meta: '1 条配方', options: [legacyRecipe] }
  const result = buildItemRecipeHierarchy({
    target: entity('target-x', '档案终端'),
    variants: [hierarchyModel.variants[0], legacyVariant],
    activeVariant: legacyVariant,
    activeRecipe: legacyRecipe,
  })

  assert.equal(result.activeVariant?.key, 'legacy')
  assert.equal(result.activeRecipe?.recipeId, 'legacy-target')
  assert.equal(result.stages.find((stage) => stage.key === 'OUT')?.entries[0]?.title, '档案终端（旧版）')
})

test('returns an explicit empty presentation when the shared crafting model has no recipe', () => {
  const result = buildItemRecipeHierarchy(null)

  assert.equal(result.hasData, false)
  assert.equal(result.activeVariant, null)
  assert.deepEqual(result.procurement, [])
  assert.deepEqual(result.stages.map((stage) => stage.entries), [[], [], [], []])
})
