import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pagePath = 'pages/articles/[slug].vue'
const componentPath = 'components/article/ArticleComments.vue'
const replyFormPath = 'components/article/ArticleCommentReplyForm.vue'
const composablePath = 'composables/useArticleComments.ts'
const page = readFileSync(join(root, pagePath), 'utf8')
const component = readFileSync(join(root, componentPath), 'utf8')
const replyForm = readFileSync(join(root, replyFormPath), 'utf8')
const composable = readFileSync(join(root, composablePath), 'utf8')
const violations = []

const assertIncludes = (path, source, marker, message) => {
  if (!source.includes(marker)) violations.push(`${path}: ${message}`)
}

const assertNotPattern = (path, source, pattern, message) => {
  if (pattern.test(source)) violations.push(`${path}: ${message}`)
}

// The comment section is extracted into components/article + a composable; the
// page keeps only the mount point.
assertIncludes(pagePath, page, '<ArticleComments :article="article" />', 'article detail must mount the extracted comments component')
assertNotPattern(pagePath, page, /articleComment/, 'article detail must not keep inline comment state after extraction')

assertNotPattern(componentPath, component, /<\/?ArticleComment(?:\s|>|\/)|<component[^>]+:is=["']ArticleComment(?:\s|>|["'])/i, 'article comments must not use recursive comment components')
assertIncludes(componentPath, component, 'aria-pressed', 'comment like buttons must expose pressed state')
assertIncludes(composablePath, composable, '#article-comments', 'login redirect must preserve the article comments anchor')
assertIncludes(replyFormPath, replyForm, 'article-comment-reply-form', 'reply form class must be present')
assertIncludes(componentPath, component, 'loadMoreArticleComments', 'root comment load more handler must be present')
assertIncludes(componentPath, component, 'article-comment-load-more', 'load more button class must be present')
assertIncludes(composablePath, composable, 'articleCommentTargetId', 'article detail must read notification comment target query')
assertIncludes(composablePath, composable, 'focusArticleCommentTarget', 'article detail must focus comment targets from notifications')
assertIncludes(componentPath, component, 'article-comment-item--targeted', 'article detail must highlight the targeted comment')
assertIncludes(composablePath, composable, 'nextArticleCommentRepliesPage', 'reply load-more must start from page 1 before any replies are loaded')
assertIncludes(composablePath, composable, 'articleCommentReplyPagination.value[String(comment.id)]', 'reply load-more must distinguish preloaded replies from loaded reply pagination')
assertIncludes(composablePath, composable, 'if (!pagination) return 1', 'reply load-more must not skip the first reply page when only preview replies are present')
assertIncludes(replyFormPath, replyForm, 'article-comment-reply-form--inline', 'reply form must open inline under the selected comment or reply')
assertIncludes(componentPath, component, 'articleCommentReplyTarget.replyToCommentId === reply.id', 'reply form must target the selected reply instead of only the root comment')
assertIncludes(componentPath, component, 'articleCommentRepliesLoadedLabel', 'reply list must show loaded/total count so pagination is visible')
assertIncludes(composablePath, composable, 'shouldShowArticleCommentReplyTarget', 'reply target labels must suppress implicit root-comment mentions')
assertIncludes(componentPath, component, 'v-if="shouldShowArticleCommentReplyTarget(comment, reply)"', 'reply target labels must only show for explicit nested reply targets')
assertNotPattern(componentPath, component, /回复 @\{\{ commentAuthorLabel\(comment\) \}\}|回复 @\$\{commentAuthorLabel\(comment\)\}/, 'direct root comment reply form must not mention the root author with @')
assertNotPattern(componentPath, component, /v-if="reply\.replyToDisplayName"/, 'reply target labels must not display every backend reply target name unconditionally')
assertNotPattern(componentPath, component, /v-for="comment in sortedArticleComments"/, 'root comments must keep backend pagination order so load-more appends predictably')
assertIncludes(pagePath, page, 'article-cover-figure', 'article detail must give the article cover a first-class visual slot')
assertIncludes(pagePath, page, 'article-related-cover', 'recommended articles must include cover imagery')
assertNotPattern(pagePath, page, /<span class="eyebrow">文章状态<\/span>/, 'public article detail must not show an article status sidebar')
assertNotPattern(pagePath, page, /<span class="eyebrow">推荐跳转<\/span>/, 'public article detail must not use recommendation jump-page wording')

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Article comments runtime contract checks passed.')
