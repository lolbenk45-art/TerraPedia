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
const flexibleTrackPattern = /^minmax\(\s*0(?:px)?\s*,\s*(\d+(?:\.\d+)?|\.\d+)fr\s*\)$/

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

test('article list toolbar uses shrinkable control tracks before its intrinsic action buttons', () => {
  const toolbarRule = getCssRule(articleCommentsPage, '.article-list-toolbar')
  const tracks = splitGridTracks(getDeclaration(toolbarRule, 'grid-template-columns'))

  assert.equal(tracks.length, 6)
  assert.ok(tracks.slice(0, 4).every((track) => {
    const match = track.match(flexibleTrackPattern)
    return match && Number.parseFloat(match[1]) > 0
  }))
  assert.deepEqual(tracks.slice(4), ['max-content', 'max-content'])
  assert.match(articleCommentsPage, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.article-list-command-bar\s*\{\s*grid-template-columns:\s*1fr;/)
  assert.match(articleCommentsPage, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.comment-toolbar\s*\{\s*grid-template-columns:\s*1fr;/)
})

test('article list command bar keeps both desktop tracks shrinkable above its mobile breakpoint', () => {
  const commandBarRule = getCssRule(articleCommentsPage, '.article-list-command-bar')
  const tracks = splitGridTracks(getDeclaration(commandBarRule, 'grid-template-columns'))

  assert.equal(tracks.length, 2)
  assert.ok(tracks.every((track) => {
    const match = track.match(flexibleTrackPattern)
    return match && Number.parseFloat(match[1]) > 0
  }))
  assert.match(articleCommentsPage, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.article-list-command-bar\s*\{\s*grid-template-columns:\s*1fr;/)
})
