import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const appRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const dateTimeConsumers = [
  'pages/users.vue',
  'pages/articles.vue',
  'pages/article-comments.vue',
  'pages/item-rarities.vue',
  'components/article/ArticleReviewWorkspace.vue',
  'pages/entities/[type].vue',
]

test('admin date formatting has one shared implementation while preserving the recipe-tree variant', async () => {
  const utilityPath = path.join(appRoot, 'utils/adminFormat.ts')
  assert.ok(fs.existsSync(utilityPath), 'expected shared admin format utility')

  const { formatDateTime } = await import(pathToFileURL(utilityPath).href)
  assert.equal(formatDateTime(), '--')
  assert.equal(formatDateTime(null), '--')
  assert.equal(formatDateTime('not-a-date'), 'not-a-date')

  for (const consumer of dateTimeConsumers) {
    const source = read(consumer)
    assert.match(source, /import \{ formatDateTime \} from '~\/utils\/adminFormat'/)
    assert.doesNotMatch(source, /(?:const|function) formatDateTime\s*[=(]/)
  }

  const recipeTree = read('pages/recipes/tree.vue')
  assert.match(recipeTree, /function formatDateTime\(value\?: string\)/)
  assert.match(recipeTree, /year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'/)
})

test('acceptance pages share the approved status-tone union', async () => {
  const utilityPath = path.join(appRoot, 'utils/adminFormat.ts')
  assert.ok(fs.existsSync(utilityPath), 'expected shared admin format utility')

  const { statusTone } = await import(pathToFileURL(utilityPath).href)
  assert.equal(statusTone('ready'), 'success')
  assert.equal(statusTone('needs_confirmation'), 'warning')
  assert.equal(statusTone('blocked'), 'danger')
  assert.equal(statusTone('unknown'), 'muted')

  for (const consumer of [
    'pages/operations/domain-acceptance.vue',
    'pages/operations/data-source-acceptance.vue',
  ]) {
    const source = read(consumer)
    assert.match(source, /import \{ statusTone \} from '~\/utils\/adminFormat'/)
    assert.doesNotMatch(source, /function statusTone\s*\(/)
  }
})

test('NPC price chips are global while retaining each surface sizing', () => {
  const mainCss = read('assets/css/main.css')
  const townNpcIndex = read('pages/entities/town-npcs/index.vue')
  const workbench = read('components/TownNpcWorkbenchModal.vue')

  assert.doesNotMatch(townNpcIndex, /^\.coin-chip\s*\{/m)
  assert.doesNotMatch(workbench, /^\.coin-chip\s*\{/m)
  assert.match(mainCss, /\.town-npc-index \.coin-chip\s*\{[^}]*min-height:\s*26px;/)
  assert.match(mainCss, /\.workbench-shell \.coin-chip\s*\{[^}]*min-height:\s*28px;/)
  assert.match(mainCss, /\.town-npc-index \.coin-chip__icon\s*\{[^}]*width:\s*15px;/)
  assert.match(mainCss, /\.workbench-shell \.coin-chip__icon\s*\{[^}]*width:\s*16px;/)
  assert.match(mainCss, /\.workbench-shell \.coin-chip--soft\s*\{[^}]*border-color:\s*rgba\(20, 184, 166, 0\.22\);/)
  assert.match(mainCss, /\.workbench-shell \.price-pill--soft\s*\{[^}]*background:\s*linear-gradient\(135deg, #0f766e, #14b8a6\);/)
})
