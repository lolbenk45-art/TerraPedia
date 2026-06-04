import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const page = read('pages/articles.vue')

test('admin articles page exposes content preview from article detail', () => {
  assert.match(page, /@click="openContentPreview\(row\)"/)
  assert.match(page, />\s*View Content\s*</)
  assert.match(page, /articlesStore\.fetchArticleById\(row\.id\)/)
  assert.match(page, /contentPreviewVisible/)
  assert.match(page, /contentPreviewLoading/)
  assert.match(page, /contentPreviewArticle/)
  assert.match(page, /contentPreviewText/)
  assert.match(page, /contentHtml/)
  assert.match(page, /contentMarkdown/)
  assert.match(page, /stripArticleContentMarkup/)
  assert.match(page, /article-content-preview/)
  assert.match(page, /white-space:\s*pre-wrap/)
})

test('admin articles page keeps review operations and pending rows editor-accessible', () => {
  assert.doesNotMatch(page, /:disabled="row\.reviewStatus === 'PENDING_REVIEW'"/)
  assert.match(page, /editorActionLabel\(row\)/)
  assert.match(page, /row\.reviewStatus === 'PENDING_REVIEW'\s*\?\s*'Read-only Editor'\s*:\s*'Continue Writing'/)
  assert.match(page, /canSubmitReview\(row\)/)
  assert.match(page, /canReview\(row\)/)
  assert.match(page, /canPublish\(row\)/)
  assert.match(page, /canOffline\(row\)/)
  assert.match(page, /openReviewLogs\(row\)/)
})

test('admin articles page labels offline action as unpublish', () => {
  assert.match(page, /isActionLoading\(row\.id,\s*'offline'\)\s*\?\s*'Unpublishing\.\.\.'\s*:\s*'Unpublish'/)
  assert.doesNotMatch(page, /Offlining\.\.\./)
  assert.doesNotMatch(page, /isActionLoading\(row\.id,\s*'offline'\)\s*\?\s*'Offlining\.\.\.'\s*:\s*'Offline'/)
})
