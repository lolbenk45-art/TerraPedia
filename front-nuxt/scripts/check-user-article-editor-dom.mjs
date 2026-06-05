import assert from 'node:assert/strict'
import {
  USER_ARTICLE_EDITOR_PLACEHOLDER,
  buildUserArticleInlineStyle,
  buildUserArticleTypingSpanHtml,
  sanitizeUserArticleEditorColor,
  setUserArticleBlockTag,
  setUserArticleOrderedList,
  setUserArticleUnorderedList,
  unwrapUserArticleTypingPlaceholders,
} from '../lib/userArticleEditorDom.mjs'

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

console.log('user article editor DOM checks passed')
