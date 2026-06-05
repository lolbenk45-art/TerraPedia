import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pagePath = 'pages/articles/[slug].vue'
const page = readFileSync(join(root, pagePath), 'utf8')
const violations = []

const assertIncludes = (marker, message) => {
  if (!page.includes(marker)) violations.push(`${pagePath}: ${message}`)
}

const assertNotPattern = (pattern, message) => {
  if (pattern.test(page)) violations.push(`${pagePath}: ${message}`)
}

assertNotPattern(/<\/?ArticleComment(?:\s|>|\/)|<component[^>]+:is=["']ArticleComment/i, 'article comments must not use recursive comment components')
assertIncludes('aria-pressed', 'comment like buttons must expose pressed state')
assertIncludes('#article-comments', 'login redirect must preserve the article comments anchor')
assertIncludes('article-comment-reply-form', 'reply form class must be present')
assertIncludes('loadMoreArticleComments', 'root comment load more handler must be present')
assertIncludes('article-comment-load-more', 'load more button class must be present')

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Article comments runtime contract checks passed.')
