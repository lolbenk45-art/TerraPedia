import assert from 'node:assert/strict'
import test from 'node:test'

import * as articleArchive from '../../utils/articleArchive.ts'

const { buildArticleArchive } = articleArchive

const articles = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }))

test('projects twelve rows into a six-entry fold and positions seven through twelve', () => {
  const result = buildArticleArchive(articles(12))

  assert.deepEqual(result.featured, { id: 1 })
  assert.deepEqual(result.readingList.map((article) => article.id), [2, 3, 4, 5, 6])
  assert.deepEqual(result.discoveryLatest.map((article) => article.id), [7, 8, 9, 10, 11, 12])
  assert.deepEqual(result.archive.map((article) => article.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('uses only positions seven and eight as latest rows for eight records', () => {
  const result = buildArticleArchive(articles(8))

  assert.deepEqual(result.discoveryLatest.map((article) => article.id), [7, 8])
})

test('renders no latest rows when exactly six records fill the fold', () => {
  const result = buildArticleArchive(articles(6))

  assert.deepEqual(result.discoveryLatest, [])
})

test('degrades fewer than six records to archive-only discovery exactly once', () => {
  const result = buildArticleArchive(articles(5))

  assert.equal(result.featured, null)
  assert.deepEqual(result.readingList, [])
  assert.deepEqual(result.discoveryLatest.map((article) => article.id), [1, 2, 3, 4, 5])
  assert.deepEqual(result.archive.map((article) => article.id), [1, 2, 3, 4, 5])
})

test('preserves every real API-page record for the dedicated archive', () => {
  assert.deepEqual(buildArticleArchive(articles(12)).archive, articles(12))
})

// 阅读时长已按产品决定从所有发现路由移除，其推导函数与用例随之删除，避免留下死代码。
test('no longer exposes a reading-duration estimator', () => {
  assert.equal(articleArchive.estimateArticleReadingMinutes, undefined)
})

test('normalizes the archive view preference to card unless list is explicitly stored', () => {
  const { ARCHIVE_VIEW_COOKIE, normalizeArchiveViewMode } = articleArchive

  assert.equal(ARCHIVE_VIEW_COOKIE, 'terrapedia-archive-view')
  assert.equal(normalizeArchiveViewMode('list'), 'list')
  assert.equal(normalizeArchiveViewMode('card'), 'card')
  assert.equal(normalizeArchiveViewMode(''), 'card')
  assert.equal(normalizeArchiveViewMode(undefined), 'card')
  assert.equal(normalizeArchiveViewMode('grid'), 'card')
  assert.equal(normalizeArchiveViewMode({ view: 'list' }), 'card')
})
