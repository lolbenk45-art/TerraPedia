import assert from 'node:assert/strict'
import test from 'node:test'

import { buildArticleArchive } from '../../utils/articleArchive.ts'

const articles = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }))

test('partitions twelve rows into one feature, five reading entries, and six archive rows', () => {
  const result = buildArticleArchive(articles(12))

  assert.deepEqual(result.featured, { id: 1 })
  assert.deepEqual(result.readingList.map((article) => article.id), [2, 3, 4, 5, 6])
  assert.deepEqual(result.archive.map((article) => article.id), [7, 8, 9, 10, 11, 12])
})

test('keeps six rows in the feature fold without fabricating an archive row', () => {
  const result = buildArticleArchive(articles(6))

  assert.deepEqual(result.featured, { id: 1 })
  assert.deepEqual(result.readingList.map((article) => article.id), [2, 3, 4, 5, 6])
  assert.deepEqual(result.archive, [])
})

test('places only the remainder in the archive for the six-to-eleven range', () => {
  const result = buildArticleArchive(articles(8))

  assert.deepEqual(result.featured, { id: 1 })
  assert.deepEqual(result.readingList.map((article) => article.id), [2, 3, 4, 5, 6])
  assert.deepEqual(result.archive.map((article) => article.id), [7, 8])
})

test('uses archive-only presentation when fewer than six live articles exist', () => {
  const result = buildArticleArchive(articles(5))

  assert.equal(result.featured, null)
  assert.deepEqual(result.readingList, [])
  assert.deepEqual(result.archive.map((article) => article.id), [1, 2, 3, 4, 5])
})

test('uses archive-only presentation for a keyword-filtered page', () => {
  const result = buildArticleArchive(articles(12), { keyword: '泰拉刃' })

  assert.equal(result.featured, null)
  assert.deepEqual(result.readingList, [])
  assert.deepEqual(result.archive.map((article) => article.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})
