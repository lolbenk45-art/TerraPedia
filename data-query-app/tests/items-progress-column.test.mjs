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
  const controlRule = getCssRule(articleCommentsPage, '.article-list-toolbar :where(.comment-input, .page-btn)')
  const commandBarTracks = splitGridTracks(getDeclaration(commandBarRule, 'grid-template-columns'))
  const toolbarTracks = splitGridTracks(getDeclaration(toolbarRule, 'grid-template-columns'))
  const controlHeight = Number.parseFloat(getDeclaration(controlRule, 'min-height'))

  assert.deepEqual(commandBarTracks, ['1fr'])
  assert.equal(toolbarTracks.length, 6)
  assert.ok((getReadableFractionTrackMinimum(toolbarTracks[0]) ?? 0) >= 220)
  assert.deepEqual(toolbarTracks.slice(1, 4), ['150px', '130px', '100px'])
  assert.deepEqual(toolbarTracks.slice(4), ['max-content', 'max-content'])
  assert.match(getDeclaration(controlRule, 'min-height'), /^\d+(?:\.\d+)?px$/)
  assert.ok(controlHeight >= 44)
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
