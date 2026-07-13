import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  USER_ARTICLE_EDITOR_PLACEHOLDER,
  buildUserArticleInlineStyle,
  buildUserArticleReferenceHtml,
  buildUserArticleRecipeTreeEmbedHtml,
  buildUserArticleTypingSpanHtml,
  isSafeUserArticleReferenceElement,
  isSafeUserArticleRecipeTreeEmbed,
  sanitizeUserArticleEditorColor,
  setUserArticleBlockTag,
  setUserArticleOrderedList,
  setUserArticleUnorderedList,
  unwrapUserArticleTypingPlaceholders,
} from '../lib/userArticleEditorDom.mjs'

const editorSource = readFileSync(resolve(process.cwd(), 'components/user/UserArticleRichEditor.vue'), 'utf8')
assert.ok(editorSource.includes("from '~/utils/recipeHierarchyGraphRenderer'"), 'editor must import the shared recipe hierarchy graph renderer')
assert.ok(editorSource.includes('renderRecipeHierarchyGraph'), 'editor must render recipe graphs through the shared renderer')

const assertIncludes = (value, marker, message) => {
  assert.ok(value.includes(marker), `${message}\nactual: ${value}`)
}

const style = buildUserArticleInlineStyle({ fontSizePx: 24, textColor: '#12ABef' })
assert.equal(style, 'font-size:24px;color:#12abef')

const typingHtml = buildUserArticleTypingSpanHtml(style)
assertIncludes(typingHtml, '<span style="font-size:24px;color:#12abef">', 'collapsed caret typing span must preserve selected font size and color')
assertIncludes(typingHtml, USER_ARTICLE_EDITOR_PLACEHOLDER, 'collapsed caret typing span must include caret placeholder')
assert.equal(
  unwrapUserArticleTypingPlaceholders(`<p><span style="${style}">${USER_ARTICLE_EDITOR_PLACEHOLDER}正文</span></p>`),
  '<p><span style="font-size:24px;color:#12abef">正文</span></p>',
)

assert.equal(setUserArticleBlockTag('<p>标题文本</p>', 'h2'), '<h2>标题文本</h2>')
assert.equal(setUserArticleBlockTag('<p>三级标题</p>', 'h3'), '<h3>三级标题</h3>')
assert.equal(setUserArticleBlockTag('<p>引用内容</p>', 'blockquote'), '<blockquote>引用内容</blockquote>')
assert.equal(setUserArticleOrderedList('<p>第一条</p>'), '<ol><li>第一条</li></ol>')
assert.equal(setUserArticleUnorderedList('<p>项目</p>'), '<ul><li>项目</li></ul>')

assert.equal(sanitizeUserArticleEditorColor('#ABCDEF'), '#abcdef')
assert.equal(sanitizeUserArticleEditorColor('red', '#f5e6b8'), '#f5e6b8')

const referenceHtml = buildUserArticleReferenceHtml({
  type: 'item',
  id: 77,
  label: '泰拉刃',
  imageUrl: '/preview-assets/terrapedia-images/items/terra-blade.png',
})
assertIncludes(referenceHtml, 'class="tp-content-ref"', 'reference span must include stable class')
assertIncludes(referenceHtml, 'data-tp-ref-type="item"', 'reference span must include type')
assertIncludes(referenceHtml, 'data-tp-ref-id="77"', 'reference span must include id')
assertIncludes(referenceHtml, 'data-tp-ref-label="泰拉刃"', 'reference span must include label')
assertIncludes(referenceHtml, 'data-tp-ref-image="/preview-assets/terrapedia-images/items/terra-blade.png"', 'reference span must persist safe preview image')
assertIncludes(referenceHtml, 'data-tp-ref-display="image"', 'reference span must default to image display mode')
assertIncludes(referenceHtml, 'draggable="true"', 'reference span must be draggable as an editor reference atom')
assertIncludes(referenceHtml, '<img', 'image-mode reference must render an inline image by default')
assertIncludes(referenceHtml, 'src="/preview-assets/terrapedia-images/items/terra-blade.png"', 'image-mode reference must use the safe preview image')
assert.ok(!referenceHtml.includes('>泰拉刃</span>'), `image-mode reference must not render label text by default\nactual: ${referenceHtml}`)

const referenceTextHtml = buildUserArticleReferenceHtml({
  type: 'item',
  id: 77,
  label: '泰拉刃',
  imageUrl: '/preview-assets/terrapedia-images/items/terra-blade.png',
  displayMode: 'text',
})
assertIncludes(referenceTextHtml, 'data-tp-ref-display="text"', 'text-mode reference must persist display mode')
assertIncludes(referenceTextHtml, '>泰拉刃</span>', 'text-mode reference must render the label')
assert.ok(!referenceTextHtml.includes('<img'), `text-mode reference must not render inline image\nactual: ${referenceTextHtml}`)

assert.equal(isSafeUserArticleReferenceElement({ type: 'npc', id: '1', label: '向导' }), true)
assert.equal(isSafeUserArticleReferenceElement({ type: 'npc', id: '1', label: '向导', imageUrl: '/preview-assets/terrapedia-images/npcs/guide.gif' }), true)
assert.equal(isSafeUserArticleReferenceElement({ type: 'npc', id: '1', label: '向导', displayMode: 'text' }), true)
assert.equal(isSafeUserArticleReferenceElement({ type: 'npc', id: '1', label: '向导', displayMode: 'card' }), false)
assert.equal(isSafeUserArticleReferenceElement({ type: 'npc', id: '1', label: '向导', imageUrl: 'javascript:alert(1)' }), false)
assert.equal(isSafeUserArticleReferenceElement({ type: 'boss', id: '1', label: '克苏鲁之眼' }), true)
assert.equal(isSafeUserArticleReferenceElement({ type: 'item', id: 'bad id', label: '坏引用' }), false)
assert.equal(isSafeUserArticleReferenceElement({ type: 'item', id: '77', label: '' }), false)
assert.equal(isSafeUserArticleReferenceElement({ type: 'item', id: '77', label: 'x'.repeat(81) }), false)

const bossReferenceHtml = buildUserArticleReferenceHtml({
  type: 'boss',
  id: 34,
  label: '克苏鲁之眼',
  displayMode: 'text',
})
assertIncludes(bossReferenceHtml, 'data-tp-ref-type="boss"', 'boss reference span must include boss type')
assertIncludes(bossReferenceHtml, 'data-tp-ref-id="34"', 'boss reference span must include boss id')
assertIncludes(bossReferenceHtml, '>克苏鲁之眼</span>', 'boss text reference must render the label')

const recipeTreeHtml = buildUserArticleRecipeTreeEmbedHtml({
  itemId: 77,
  maxDepth: 5,
  label: '泰拉刃',
})
assert.equal(isSafeUserArticleRecipeTreeEmbed({ itemId: '77', maxDepth: 5, label: '泰拉刃' }), true)
assertIncludes(recipeTreeHtml, 'class="tp-article-embed tp-recipe-tree"', 'recipe tree embed must include stable classes')
assertIncludes(recipeTreeHtml, 'data-tp-embed-type="recipe-tree"', 'recipe tree embed must include embed type')
assertIncludes(recipeTreeHtml, 'data-tp-item-id="77"', 'recipe tree embed must include item id')
assertIncludes(recipeTreeHtml, 'data-tp-max-depth="5"', 'recipe tree embed must include max depth')
assertIncludes(recipeTreeHtml, 'data-tp-label="泰拉刃"', 'recipe tree embed must include label')
assert.ok(!recipeTreeHtml.includes('contenteditable'), `recipe tree embed must not persist editor runtime attrs\nactual: ${recipeTreeHtml}`)
assert.equal(buildUserArticleRecipeTreeEmbedHtml({ itemId: '77', maxDepth: 0, label: '泰拉刃' }), '')
assert.equal(buildUserArticleRecipeTreeEmbedHtml({ itemId: '77', maxDepth: 6, label: '泰拉刃' }), '')
assert.equal(buildUserArticleRecipeTreeEmbedHtml({ itemId: 'bad', maxDepth: 5, label: '泰拉刃' }), '')
assert.equal(buildUserArticleRecipeTreeEmbedHtml({ itemId: '77', maxDepth: 5, label: '' }), '')

console.log('user article editor DOM checks passed')
