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
assertIncludes('articleCommentTargetId', 'article detail must read notification comment target query')
assertIncludes('focusArticleCommentTarget', 'article detail must focus comment targets from notifications')
assertIncludes('article-comment-item--targeted', 'article detail must highlight the targeted comment')
assertIncludes('nextArticleCommentRepliesPage', 'reply load-more must start from page 1 before any replies are loaded')
assertIncludes('articleCommentReplyPagination.value[String(comment.id)]', 'reply load-more must distinguish preloaded replies from loaded reply pagination')
assertIncludes('if (!pagination) return 1', 'reply load-more must not skip the first reply page when only preview replies are present')
assertIncludes('article-comment-reply-form--inline', 'reply form must open inline under the selected comment or reply')
assertIncludes('articleCommentReplyTarget.replyToCommentId === reply.id', 'reply form must target the selected reply instead of only the root comment')
assertIncludes('articleCommentRepliesLoadedLabel', 'reply list must show loaded/total count so pagination is visible')
assertIncludes('shouldShowArticleCommentReplyTarget', 'reply target labels must suppress implicit root-comment mentions')
assertIncludes('v-if="shouldShowArticleCommentReplyTarget(comment, reply)"', 'reply target labels must only show for explicit nested reply targets')
assertNotPattern(/回复 @\{\{ commentAuthorLabel\(comment\) \}\}/, 'direct root comment reply form must not mention the root author with @')
assertNotPattern(/v-if="reply\.replyToDisplayName"/, 'reply target labels must not display every backend reply target name unconditionally')
assertNotPattern(/v-for="comment in sortedArticleComments"/, 'root comments must keep backend pagination order so load-more appends predictably')
assertIncludes('article-cover-figure', 'article detail must give the article cover a first-class visual slot')
assertIncludes('article-related-cover', 'recommended articles must include cover imagery')
assertNotPattern(/<span class="eyebrow">文章状态<\/span>/, 'public article detail must not show an article status sidebar')
assertNotPattern(/<span class="eyebrow">推荐跳转<\/span>/, 'public article detail must not use recommendation jump-page wording')

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Article comments runtime contract checks passed.')
