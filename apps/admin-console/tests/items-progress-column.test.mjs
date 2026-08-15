import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const readPage = (...segments) => fs.readFileSync(path.join(repoRoot, 'pages', ...segments), 'utf8')
const articleCommentsPage = readPage('article-comments.vue')
const entitiesPage = readPage('entities', '[type].vue')
const itemsPage = readPage('items.vue')
const queryPage = readPage('query.vue')
const usersPage = readPage('users.vue')
const itemsStoreSource = fs.readFileSync(path.join(repoRoot, 'stores', 'items.ts'), 'utf8')

const ITEM_FORM_FIELDS = [
  'name',
  'nameZh',
  'internalName',
  'categoryId',
  'relatedCategoryIds',
  'rarity',
  'status',
  'gamePeriodId',
  'gameModelId',
  'isStackable',
  'stackSize',
  'damage',
  'defense',
  'knockback',
  'useTime',
  'width',
  'height',
  'buy',
  'sell',
  'description',
  'descriptionZh',
  'tooltip',
  'tooltipZh',
  'imageUrl',
]

const getCssRule = (source, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

const getDeclaration = (rule, property) => {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return rule.match(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+)`))?.[1]?.trim() ?? ''
}

const splitGridTracks = (value) => {
  const tracks = []
  let current = ''
  let depth = 0

  for (const character of value) {
    if (/\s/.test(character) && depth === 0) {
      if (current) tracks.push(current)
      current = ''
      continue
    }

    current += character
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
  }

  if (current) tracks.push(current)
  return tracks
}

const getBalancedBlock = (source, openingBraceIndex) => {
  let depth = 0

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue

    depth -= 1
    if (depth === 0) return source.slice(openingBraceIndex + 1, index)
  }

  return ''
}

const getFunctionBody = (source, name) => {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\([^)]*\\)\\s*\\{`).exec(source)
  assert.notEqual(match, null, `missing function ${name}`)
  const openingBraceIndex = source.indexOf('{', match.index)
  return getBalancedBlock(source, openingBraceIndex)
}

const getObjectLiteral = (source, constantName) => {
  const match = new RegExp(`const\\s+${constantName}\\s*=\\s*\\{`).exec(source)
  assert.notEqual(match, null, `missing constant ${constantName}`)
  const openingBraceIndex = source.indexOf('{', match.index)
  return `{${getBalancedBlock(source, openingBraceIndex)}}`
}

const getStoreActionBody = (source, name) => {
  const arrowMatch = new RegExp(`const\\s+${name}(?:\\s*:[^=]+)?\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`).exec(source)
  if (arrowMatch) {
    const openingBraceIndex = arrowMatch.index + arrowMatch[0].lastIndexOf('{')
    return getBalancedBlock(source, openingBraceIndex)
  }

  const functionPattern = new RegExp(`async\\s+function\\s+${name}\\([^)]*\\)(?:\\s*:\\s*[^\\n{]+)?\\s*\\{`, 'g')
  const matches = Array.from(source.matchAll(functionPattern))
  assert.ok(matches.length > 0, `missing store action ${name}`)
  const implementation = matches.at(-1)
  const openingBraceIndex = implementation.index + implementation[0].lastIndexOf('{')
  return getBalancedBlock(source, openingBraceIndex)
}

const deferred = () => {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const createItemsPageHarness = ({ fetchItemRecipes = async () => [] } = {}) => {
  const defaults = new Function(`return (${getObjectLiteral(itemsPage, 'FORM_DEFAULTS')})`)()
  const createFormDefaults = new Function('FORM_DEFAULTS', getFunctionBody(itemsPage, 'createFormDefaults')).bind(null, defaults)
  const form = createFormDefaults()
  const recipeDrafts = { value: [] }
  const editingId = { value: null }
  const isEdit = { value: false }
  const selectedItem = { value: null }
  const formVisible = { value: false }
  const recipeLoading = { value: false }
  const recipeLoadFailed = { value: false }
  const submitting = { value: false }
  const calls = { fetchItemRecipes: [], updateItem: [], createItem: [], updateItemRecipes: [], toasts: [] }
  const itemsStore = {
    fetchItemRecipes(...args) {
      calls.fetchItemRecipes.push(args)
      return fetchItemRecipes(...args)
    },
    async updateItem(id, payload) {
      calls.updateItem.push({ id, payload })
      return { id, ...payload }
    },
    async createItem(payload) {
      calls.createItem.push(payload)
      return { id: 999, ...payload }
    },
    async updateItemRecipes(id, recipes) {
      calls.updateItemRecipes.push({ id, recipes })
      return recipes
    },
  }
  const resetForm = new Function(
    'form',
    'createFormDefaults',
    'recipeDrafts',
    'editingId',
    `return function resetForm() {${getFunctionBody(itemsPage, 'resetForm')}}`,
  )(form, createFormDefaults, recipeDrafts, editingId)
  const handlers = new Function(
    'resetForm',
    'isEdit',
    'editingId',
    'selectedItem',
    'FORM_FIELDS',
    'form',
    'getRarityInfo',
    'formVisible',
    'recipeDrafts',
    'itemsStore',
    'toRecipeDrafts',
    'recipeLoading',
    'recipeLoadFailed',
    'submitting',
    'showToast',
    `
      let editRequestGeneration = 0
      return {
        handleAdd: function handleAdd() {${getFunctionBody(itemsPage, 'handleAdd')}},
        handleEdit: async function handleEdit(item) {${getFunctionBody(itemsPage, 'handleEdit')}},
        handleFormSubmit: async function handleFormSubmit() {${getFunctionBody(itemsPage, 'handleFormSubmit')}},
      }
    `,
  )(
    resetForm,
    isEdit,
    editingId,
    selectedItem,
    Object.keys(defaults),
    form,
    item => ({ label: `rarity:${item.rarityId ?? item.rarity}` }),
    formVisible,
    recipeDrafts,
    itemsStore,
    recipes => (Array.isArray(recipes) ? recipes : []).map(recipe => ({ ...recipe })),
    recipeLoading,
    recipeLoadFailed,
    submitting,
    (message, tone) => calls.toasts.push({ message, tone }),
  )

  return {
    ...handlers,
    calls,
    editingId,
    form,
    formVisible,
    isEdit,
    recipeDrafts,
    recipeLoadFailed,
    recipeLoading,
    selectedItem,
    submitting,
  }
}

test('item recipe store action preserves array callers and exposes failure to explicit callers', async () => {
  const toasts = []
  const fetchItemRecipes = new Function(
    'get',
    'normalizeItemRecipe',
    'showToast',
    'console',
    `return async function fetchItemRecipes(id, options) {${getStoreActionBody(itemsStoreSource, 'fetchItemRecipes')}}`,
  )(
    async () => { throw new Error('recipe request failed') },
    recipe => recipe,
    (message, tone) => toasts.push({ message, tone }),
    { error() {} },
  )

  assert.deepEqual(await fetchItemRecipes(1), [])
  assert.equal(await fetchItemRecipes(1, { nullOnError: true }), null)
  assert.deepEqual(toasts, [
    { message: '获取物品配方失败', tone: 'error' },
    { message: '获取物品配方失败', tone: 'error' },
  ])
})

const getMediaBlock = (source, maxWidth) => {
  const mediaPattern = new RegExp(`@media\\s*\\(\\s*max-width\\s*:\\s*${maxWidth}px\\s*\\)\\s*\\{`)
  const match = mediaPattern.exec(source)
  if (!match) return ''

  const openingBraceIndex = source.indexOf('{', match.index)
  return getBalancedBlock(source, openingBraceIndex)
}

const getReadableFractionTrackMinimum = (track) => {
  const match = track.match(/^minmax\(\s*(\d+(?:\.\d+)?)px\s*,\s*(\d+(?:\.\d+)?|\.\d+)fr\s*\)$/)
  if (!match || Number.parseFloat(match[2]) <= 0) return null
  return Number.parseFloat(match[1])
}

test('items list progress column only renders game period', () => {
  const progressCell = itemsPage.match(/<td>\{\{ getGamePeriodLabel[\s\S]*?<\/td>/)?.[0] ?? ''

  assert.match(progressCell, /getGamePeriodLabel/)
  assert.doesNotMatch(progressCell, /getGameModelLabel/)
})

test('game model label does not treat missing value as normal mode', () => {
  assert.match(itemsPage, /gameModelId == null \? '未设置'/)
})

test('items form defines the complete field whitelist and creates fresh array defaults', () => {
  const defaults = new Function(`return (${getObjectLiteral(itemsPage, 'FORM_DEFAULTS')})`)()
  const createDefaultsBody = getFunctionBody(itemsPage, 'createFormDefaults')
  const createDefaults = new Function('FORM_DEFAULTS', createDefaultsBody)
  const first = createDefaults(defaults)
  const second = createDefaults(defaults)

  assert.deepEqual(Object.keys(defaults), ITEM_FORM_FIELDS)
  assert.deepEqual(defaults, {
    name: '',
    nameZh: '',
    internalName: '',
    categoryId: null,
    relatedCategoryIds: [],
    rarity: '白色',
    status: 1,
    gamePeriodId: 0,
    gameModelId: 0,
    isStackable: true,
    stackSize: 1,
    damage: null,
    defense: null,
    knockback: null,
    useTime: null,
    width: null,
    height: null,
    buy: null,
    sell: null,
    description: '',
    descriptionZh: '',
    tooltip: '',
    tooltipZh: '',
    imageUrl: '',
  })
  assert.match(itemsPage, /const\s+FORM_FIELDS\s*=\s*Object\.keys\(FORM_DEFAULTS\)\s+as\s+\(keyof typeof FORM_DEFAULTS\)\[\]/)
  assert.match(itemsPage, /const\s+form\s*=\s*reactive<ItemPayload>\(createFormDefaults\(\)\)/)
  assert.match(getFunctionBody(itemsPage, 'resetForm'), /Object\.assign\(form,\s*createFormDefaults\(\)\)/)
  assert.deepEqual(first, defaults)
  assert.deepEqual(second, defaults)
  assert.notEqual(first.relatedCategoryIds, defaults.relatedCategoryIds)
  assert.notEqual(second.relatedCategoryIds, defaults.relatedCategoryIds)
  assert.notEqual(first.relatedCategoryIds, second.relatedCategoryIds)
  assert.equal('id' in defaults, false)
  assert.equal('createdAt' in defaults, false)
  assert.equal('updatedAt' in defaults, false)
})

test('items edit form executes reset and whitelisted presentation mapping without aliases', async () => {
  const editBody = getFunctionBody(itemsPage, 'handleEdit')
  const harness = createItemsPageHarness()
  const relatedCategoryIds = [7, 9]
  Object.assign(harness.form, {
    description: '上一项描述',
    tooltip: '上一项提示',
    damage: 123,
    relatedCategoryIds: [88],
  })

  await harness.handleEdit({
    id: 42,
    name: 'New Item',
    categoryId: 7,
    relatedCategoryIds,
    rarity: '旧展示值',
    rarityId: 5,
    imageUrl: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
  })

  assert.equal(harness.form.description, '')
  assert.equal(harness.form.tooltip, '')
  assert.equal(harness.form.damage, null)
  assert.equal(harness.form.rarity, 'rarity:5')
  assert.deepEqual(harness.form.relatedCategoryIds, [9])
  assert.notEqual(harness.form.relatedCategoryIds, relatedCategoryIds)
  assert.equal(harness.form.imageUrl, '')
  assert.equal('id' in harness.form, false)
  assert.equal('createdAt' in harness.form, false)
  assert.equal('updatedAt' in harness.form, false)

  const loopIndex = editBody.indexOf('for (const key of FORM_FIELDS)')
  const rarityIndex = editBody.indexOf('form.rarity = getRarityInfo(item).label')
  const relatedCategoryIdsIndex = editBody.indexOf('form.relatedCategoryIds = (item.relatedCategoryIds ?? []).filter((id) => id !== item.categoryId)')
  const imageUrlIndex = editBody.indexOf("form.imageUrl = item.imageUrl ?? ''")

  assert.ok(loopIndex >= 0)
  assert.match(editBody, /for\s*\(const key of FORM_FIELDS\)\s*\{[\s\S]*if\s*\(key in item\)\s*\{[\s\S]*Reflect\.set\(form,\s*key,\s*item\[key\]\)/)
  assert.doesNotMatch(editBody, /\.\.\.item\b|Object\.assign\(form/)
  assert.doesNotMatch(editBody, /form\.(?:id|createdAt|updatedAt)\s*=/)
  assert.ok(rarityIndex > loopIndex)
  assert.ok(relatedCategoryIdsIndex > rarityIndex)
  assert.ok(imageUrlIndex > relatedCategoryIdsIndex)
})

test('items edit blocks destructive submit while recipes are loading', async () => {
  const recipes = deferred()
  const harness = createItemsPageHarness({ fetchItemRecipes: () => recipes.promise })
  const editPromise = harness.handleEdit({ id: 11, name: 'Item A', categoryId: 3, rarity: '白色' })

  await harness.handleFormSubmit()
  recipes.resolve([])
  await editPromise

  assert.equal(harness.calls.updateItem.length, 0)
  assert.equal(harness.calls.createItem.length, 0)
  assert.equal(harness.calls.updateItemRecipes.length, 0)
  assert.match(itemsPage, /:disabled="submitting \|\| recipeLoading \|\| recipeLoadFailed"/)
  assert.match(getFunctionBody(itemsPage, 'handleFormSubmit'), /if\s*\(recipeLoading\.value \|\| recipeLoadFailed\.value\)\s*return/)
})

test('items edit keeps save blocked after recipe failure but unlocks for legitimate empty recipes', async () => {
  const failedHarness = createItemsPageHarness({ fetchItemRecipes: async () => null })
  await failedHarness.handleEdit({ id: 12, name: 'Failed Item', categoryId: 3, rarity: '白色' })
  await failedHarness.handleFormSubmit()

  assert.deepEqual(failedHarness.calls.fetchItemRecipes, [[12, { nullOnError: true }]])
  assert.equal(failedHarness.recipeLoading.value, false)
  assert.equal(failedHarness.recipeLoadFailed.value, true)
  assert.equal(failedHarness.calls.updateItem.length, 0)
  assert.equal(failedHarness.calls.createItem.length, 0)
  assert.equal(failedHarness.calls.updateItemRecipes.length, 0)

  const emptyHarness = createItemsPageHarness({ fetchItemRecipes: async () => [] })
  await emptyHarness.handleEdit({ id: 13, name: 'Empty Item', categoryId: 4, rarity: '白色' })
  await emptyHarness.handleFormSubmit()

  assert.deepEqual(emptyHarness.calls.fetchItemRecipes, [[13, { nullOnError: true }]])
  assert.equal(emptyHarness.recipeLoading.value, false)
  assert.equal(emptyHarness.recipeLoadFailed.value, false)
  assert.equal(emptyHarness.calls.updateItem.length, 1)
  assert.equal(emptyHarness.calls.updateItemRecipes.length, 1)
  assert.deepEqual(emptyHarness.calls.updateItemRecipes[0].recipes, [])
})

test('stale recipe completion cannot unlock save while the current edit is pending', async () => {
  const requests = new Map()
  const harness = createItemsPageHarness({
    fetchItemRecipes(id) {
      const request = deferred()
      requests.set(id, request)
      return request.promise
    },
  })

  const editA = harness.handleEdit({ id: 31, name: 'Item A', categoryId: 3, rarity: '白色' })
  const editB = harness.handleEdit({ id: 32, name: 'Item B', categoryId: 4, rarity: '蓝色' })
  requests.get(31).resolve(null)
  await editA

  assert.equal(harness.editingId.value, 32)
  assert.equal(harness.recipeLoading.value, true)
  assert.equal(harness.recipeLoadFailed.value, false)
  await harness.handleFormSubmit()
  assert.equal(harness.calls.updateItem.length, 0)
  assert.equal(harness.calls.updateItemRecipes.length, 0)

  requests.get(32).resolve([{ recipe: 'B' }])
  await editB
  assert.equal(harness.recipeLoading.value, false)
  assert.equal(harness.recipeLoadFailed.value, false)
  assert.deepEqual(harness.recipeDrafts.value, [{ recipe: 'B' }])
})

test('items edit keeps the newest recipes when requests resolve out of order and invalidates on add', async () => {
  const requests = new Map()
  const harness = createItemsPageHarness({
    fetchItemRecipes(id) {
      const request = deferred()
      requests.set(id, request)
      return request.promise
    },
  })

  const editA = harness.handleEdit({ id: 21, name: 'Item A', categoryId: 3, rarity: '白色' })
  const editB = harness.handleEdit({ id: 22, name: 'Item B', categoryId: 4, rarity: '蓝色' })
  requests.get(22).resolve([{ recipe: 'B' }])
  await editB
  requests.get(21).resolve([{ recipe: 'A' }])
  await editA

  assert.equal(harness.editingId.value, 22)
  assert.equal(harness.form.name, 'Item B')
  assert.deepEqual(harness.recipeDrafts.value, [{ recipe: 'B' }])
  assert.equal(harness.recipeLoading.value, false)

  const editC = harness.handleEdit({ id: 23, name: 'Item C', categoryId: 5, rarity: '绿色' })
  harness.handleAdd()
  requests.get(23).resolve([{ recipe: 'C' }])
  await editC

  assert.equal(harness.isEdit.value, false)
  assert.equal(harness.editingId.value, null)
  assert.equal(harness.form.name, '')
  assert.deepEqual(harness.recipeDrafts.value, [])
  assert.equal(harness.recipeLoading.value, false)
})

test('items page uses Chinese-first catalog operator copy', () => {
  assert.match(itemsPage, /物品目录/)
  assert.match(itemsPage, /物品总数/)
  assert.match(itemsPage, /当前可见/)
  assert.match(itemsPage, /已选择/)
  assert.match(itemsPage, /关键词/)
  assert.match(itemsPage, /品质/)
  assert.match(itemsPage, /时期/)
  assert.match(itemsPage, /分类/)
  assert.match(itemsPage, /收藏/)

  assert.doesNotMatch(itemsPage, />ITEM CATALOG</)
  assert.doesNotMatch(itemsPage, />Total Items</)
  assert.doesNotMatch(itemsPage, />Visible</)
  assert.doesNotMatch(itemsPage, />Selection</)
  assert.doesNotMatch(itemsPage, />Keyword</)
  assert.doesNotMatch(itemsPage, />Rarity</)
  assert.doesNotMatch(itemsPage, />Period</)
  assert.doesNotMatch(itemsPage, />Category</)
  assert.doesNotMatch(itemsPage, />Collection</)
})

test('query results scroll locally when runtime columns exceed the result card', () => {
  const tableWrapRule = getCssRule(queryPage, '.data-table-wrap')

  assert.equal(getDeclaration(tableWrapRule, 'overflow-x'), 'auto')
})

for (const { name, page, minimumActionWidth } of [
  { name: 'entities', page: entitiesPage, minimumActionWidth: 150 },
  { name: 'items', page: itemsPage, minimumActionWidth: 220 },
  { name: 'users', page: usersPage, minimumActionWidth: 210 },
]) {
  test(`${name} action column keeps its controls on one horizontally scrollable row`, () => {
    const rowActionsRule = getCssRule(page, '.row-actions')
    const actionCellRule = getCssRule(page, '.data-table td:last-child')
    const tableWrapRule = getCssRule(page, '.table-wrap')
    const actionCellWidthValue = getDeclaration(actionCellRule, 'min-width')
    const actionCellWidth = Number.parseFloat(actionCellWidthValue)

    assert.equal(getDeclaration(rowActionsRule, 'flex-wrap'), 'nowrap')
    assert.match(actionCellWidthValue, /^\d+(?:\.\d+)?px$/)
    assert.ok(actionCellWidth >= minimumActionWidth, `expected action column width >= ${minimumActionWidth}px, received ${actionCellWidth}`)
    assert.equal(getDeclaration(tableWrapRule, 'overflow-x'), 'auto')
  })
}

test('article list command bar stacks a readable six-track toolbar by default', () => {
  const commandBarRule = getCssRule(articleCommentsPage, '.article-list-command-bar')
  const toolbarRule = getCssRule(articleCommentsPage, '.article-list-toolbar')
  const commandBarTracks = splitGridTracks(getDeclaration(commandBarRule, 'grid-template-columns'))
  const toolbarTracks = splitGridTracks(getDeclaration(toolbarRule, 'grid-template-columns'))

  assert.deepEqual(commandBarTracks, ['1fr'])
  assert.equal(toolbarTracks.length, 6)
  assert.ok((getReadableFractionTrackMinimum(toolbarTracks[0]) ?? 0) >= 220)
  assert.deepEqual(toolbarTracks.slice(1, 4), ['150px', '130px', '100px'])
  assert.deepEqual(toolbarTracks.slice(4), ['max-content', 'max-content'])
})

test('article list toolbar uses a higher-specificity accessible control height override', () => {
  const controlRule = articleCommentsPage.match(/\.article-list-toolbar\s+\.comment-input\s*,\s*\.article-list-toolbar\s+\.page-btn\s*\{([^}]*)\}/)?.[1] ?? ''
  const controlHeightValue = getDeclaration(controlRule, 'min-height')

  assert.notEqual(controlRule, '')
  assert.match(controlHeightValue, /^\d+(?:\.\d+)?px$/)
  assert.ok(Number.parseFloat(controlHeightValue) >= 44)
  assert.doesNotMatch(articleCommentsPage, /\.article-list-toolbar\s+:where\(\.comment-input,\s*\.page-btn\)\s*\{[^}]*min-height/)
})

test('article list toolbar uses four readable filter tracks at the intermediate breakpoint', () => {
  const intermediateBlock = getMediaBlock(articleCommentsPage, 1200)
  const commandBarRule = getCssRule(intermediateBlock, '.article-list-command-bar')
  const toolbarRule = getCssRule(intermediateBlock, '.article-list-toolbar')
  const commandBarTracks = splitGridTracks(getDeclaration(commandBarRule, 'grid-template-columns'))
  const toolbarTracks = splitGridTracks(getDeclaration(toolbarRule, 'grid-template-columns'))
  const minimumWidths = toolbarTracks.map(getReadableFractionTrackMinimum)
  const intermediateIndex = articleCommentsPage.search(/@media\s*\(\s*max-width\s*:\s*1200px\s*\)/)
  const mobileIndex = articleCommentsPage.search(/@media\s*\(\s*max-width\s*:\s*760px\s*\)/)

  assert.notEqual(intermediateBlock, '')
  assert.ok(intermediateIndex >= 0 && intermediateIndex < mobileIndex)
  assert.deepEqual(commandBarTracks, ['1fr'])
  assert.equal(toolbarTracks.length, 4)
  assert.deepEqual(minimumWidths, [220, 130, 120, 100])
})

test('article list command and toolbar stay single-column inside the bounded mobile media block', () => {
  const mobileBlock = getMediaBlock(articleCommentsPage, 760)
  const commandBarRule = getCssRule(mobileBlock, '.article-list-command-bar')
  const toolbarRule = getCssRule(mobileBlock, '.article-list-toolbar')

  assert.notEqual(mobileBlock, '')
  assert.deepEqual(splitGridTracks(getDeclaration(commandBarRule, 'grid-template-columns')), ['1fr'])
  assert.deepEqual(splitGridTracks(getDeclaration(toolbarRule, 'grid-template-columns')), ['1fr'])
})
