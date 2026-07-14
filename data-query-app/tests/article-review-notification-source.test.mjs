import test from 'node:test'
import assert from 'node:assert/strict'

import { diffArticleReviewEvents } from '../notifications/articleReviewSource.mjs'

test('a brand-new pending article produces a submitted-for-review event', () => {
  const articles = [
    { id: 12, title: '关于史莱姆的一切', authorDisplayName: '小明' },
  ]

  const { events, nextState } = diffArticleReviewEvents([], articles)

  assert.equal(events.length, 1)
  assert.equal(events[0].id, 'article:12:pending_review')
  assert.equal(events[0].source, 'article-review')
  assert.equal(events[0].level, 'warning')
  assert.match(events[0].title, /关于史莱姆的一切/)
  assert.match(events[0].detail, /小明/)
  assert.equal(events[0].link, '/articles?reviewId=12')
  assert.equal(typeof events[0].createdAt, 'number')
  assert.deepEqual(nextState, [12])
})

test('an article already known to be pending does not produce a duplicate event', () => {
  const articles = [{ id: 12, title: '关于史莱姆的一切' }]

  const { events, nextState } = diffArticleReviewEvents([12], articles)

  assert.equal(events.length, 0)
  assert.deepEqual(nextState, [12])
})

test('an article that left the pending list is simply dropped from nextState, no event', () => {
  const { events, nextState } = diffArticleReviewEvents([12, 34], [{ id: 12, title: 'x' }])

  assert.equal(events.length, 0)
  assert.deepEqual(nextState, [12])
})

test('articles missing a usable numeric id are skipped without throwing', () => {
  const articles = [{ id: null, title: 'broken' }, { title: 'no id field' }]

  const { events, nextState } = diffArticleReviewEvents([], articles)

  assert.equal(events.length, 0)
  assert.deepEqual(nextState, [])
})

test('an article without an author falls back to an empty detail', () => {
  const { events } = diffArticleReviewEvents([], [{ id: 1, title: '无作者文章' }])

  assert.equal(events[0].detail, '')
})
