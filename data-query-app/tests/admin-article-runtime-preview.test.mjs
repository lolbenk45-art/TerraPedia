import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { Window } from 'happy-dom'
import { renderRecipeHierarchyGraph } from '../../shared/article-runtime/recipeHierarchyGraphRenderer.ts'
import { sanitizeArticleHtml } from '../utils/articleEditor.ts'
import { createRecipeTreeRequestQueue } from '../utils/articleRuntimePreview.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
const readRepositoryFile = relativePath => fs.readFileSync(path.join(repoRoot, '..', relativePath), 'utf8')

test('admin graph exposes a themed keyboard popover', () => {
  const window = new Window()
  globalThis.window = window
  globalThis.document = window.document
  globalThis.requestAnimationFrame = callback => callback()

  const graph = renderRecipeHierarchyGraph({
    roots: [{ itemId: 1, displayName: '测试物品', children: [] }],
    maxDepth: 3,
    availableWidth: 600,
    resolveImageUrl: value => value,
    popoverOwner: 'admin',
    popoverThemeClass: 'tp-article-runtime-popover--admin',
  })
  document.body.append(graph)
  const node = graph.querySelector('.recipe-overview-node')
  node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  assert.equal(document.body.querySelector('.tp-article-runtime-popover--admin')?.classList.contains('is-visible'), true)
  node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(document.body.querySelector('.tp-article-runtime-popover--admin')?.classList.contains('is-visible'), false)
})

test('both admin article hosts delegate preview rendering to one runtime component', () => {
  const preview = read('components/article/AdminArticleRuntimePreview.vue')
  const editor = read('components/article/ArticleEditorWorkspace.vue')
  const review = read('components/article/ArticleReviewWorkspace.vue')
  assert.match(preview, /tp-article-runtime--admin/)
  assert.match(preview, /fetchItemRecipeTree/)
  assert.match(preview, /content-references\/resolve/)
  assert.match(editor, /AdminArticleRuntimePreview/)
  assert.match(editor, /v-show="editor\.sidePanel === 'preview'"/)
  assert.match(review, /AdminArticleRuntimePreview/)
  assert.doesNotMatch(preview, /iframe|\/articles\//)
})

test('admin preview preserves shared graph image dimensions after generic article image styling', () => {
  const preview = read('components/article/AdminArticleRuntimePreview.vue')
  const genericImageRule = preview.indexOf(':deep(img) { width: auto; max-width: 100%; height: auto; }')
  const graphImageRule = preview.indexOf(':deep(.tp-preview-image img) { width: 100%; max-width: none; height: 100%;')

  assert.ok(genericImageRule >= 0, 'admin preview must retain generic article image sizing')
  assert.ok(graphImageRule > genericImageRule, 'admin preview must restore explicit shared graph image dimensions after generic article image sizing')
  assert.match(preview, /:deep\(\.tp-preview-image img\) \{ width: 100%; max-width: none; height: 100%; aspect-ratio: 1 \/ 1; object-fit: contain; \}/)
})

test('shared graph preview frames contain their absolutely positioned images in every host', () => {
  const graphStyles = readRepositoryFile('shared/article-runtime/recipeHierarchyGraph.css')

  assert.match(graphStyles, /\.tp-article-runtime \.tp-preview-image \{(?=[^}]*position: relative;)(?=[^}]*display: grid;)(?=[^}]*place-items: center;)(?=[^}]*width: 48px;)(?=[^}]*height: 48px;)(?=[^}]*min-width: 0;)(?=[^}]*min-height: 0;)(?=[^}]*overflow: hidden;)[^}]*\}/)
})

test('sanitizer canonicalizes only valid recipe-tree embed attributes', () => {
  const window = new Window()
  globalThis.window = window
  globalThis.document = window.document
  globalThis.DOMParser = window.DOMParser
  globalThis.Node = window.Node

  const html = sanitizeArticleHtml([
    '<div class="tp-recipe-tree stray" data-tp-embed-type="recipe-tree" data-tp-item-id="42" data-tp-max-depth="3" data-tp-label="  测试树  " data-untrusted="no">placeholder</div>',
    '<div class="tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="bad" data-tp-max-depth="9">bad tree</div>',
  ].join(''))

  assert.match(html, /<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="42" data-tp-max-depth="3" data-tp-label="测试树">placeholder<\/div>/)
  assert.doesNotMatch(html, /stray|data-untrusted/)
  assert.doesNotMatch(html, /data-tp-item-id="bad"|data-tp-max-depth="9"/)
})

test('sanitizer produces inert text when SSR has no DOM parser', () => {
  const previousDOMParser = globalThis.DOMParser
  globalThis.DOMParser = undefined
  try {
    assert.equal(sanitizeArticleHtml('<img src=x onerror=alert(1)><strong>安全</strong>'), '安全')
  } finally {
    globalThis.DOMParser = previousDOMParser
  }
})

test('runtime preview preserves matching embeds and marks local tree failures', () => {
  const preview = read('components/article/AdminArticleRuntimePreview.vue')
  assert.match(preview, /recipeTreeEmbedIdentity/)
  assert.match(preview, /preservedRecipeGraphs/)
  assert.match(preview, /tp-recipe-tree--failed/)
  assert.match(preview, /ResizeObserver/)
  assert.match(preview, /nextPreviewInstance/)
  assert.match(preview, /dataset\.tpEmbedType/)
  assert.match(preview, /content-references\/resolve', \{ refs: inputs \}/)
  assert.match(preview, /entry\.label \|\| entry\.name/)
})

test('content-reference request and response fields match the backend DTO contract', () => {
  const preview = read('components/article/AdminArticleRuntimePreview.vue')
  const requestDto = readRepositoryFile('back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveRequestDTO.java')
  const responseDto = readRepositoryFile('back/src/main/java/com/terraria/skills/dto/PublicContentReferenceDTO.java')

  assert.match(requestDto, /List<PublicContentReferenceResolveItemDTO> refs/)
  assert.match(responseDto, /private String label/)
  assert.match(responseDto, /private String name/)
  assert.match(preview, /\{ refs: inputs \}/)
  assert.match(preview, /entry\.label \|\| entry\.name/)
})

test('recipe tree queue dedupes requests and starts no more than three loads', async () => {
  const loaders = []
  const queueTree = createRecipeTreeRequestQueue((itemId, maxDepth) => new Promise(resolve => {
    loaders.push({ itemId, maxDepth, resolve })
  }))

  const first = queueTree(1, 3)
  const duplicate = queueTree(1, 3)
  const second = queueTree(2, 3)
  const third = queueTree(3, 3)
  const fourth = queueTree(4, 3)

  assert.equal(first, duplicate)
  assert.deepEqual(loaders.map(entry => entry.itemId), [1, 2, 3])
  loaders[0].resolve({ id: 1 })
  await first
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(loaders.map(entry => entry.itemId), [1, 2, 3, 4])

  loaders.slice(1).forEach(entry => entry.resolve({ id: entry.itemId }))
  await Promise.all([second, third, fourth])
})
