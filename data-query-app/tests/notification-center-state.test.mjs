import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeNotificationEvents,
  computeUnreadCount,
  markEventRead,
  markAllRead,
  relativeTimeLabel,
  shouldResetForUser,
  MAX_EVENTS,
} from '../notifications/notificationCenterState.mjs'

test('mergeNotificationEvents dedupes by id and keeps the incoming (fresher) copy', () => {
  const existing = [
    { id: 'a', createdAt: 1000, title: 'old title' },
    { id: 'b', createdAt: 2000, title: 'b' },
  ]
  const incoming = [{ id: 'a', createdAt: 3000, title: 'new title' }]

  const result = mergeNotificationEvents(existing, incoming)

  assert.equal(result.length, 2)
  const merged = result.find((event) => event.id === 'a')
  assert.equal(merged.title, 'new title')
  assert.equal(merged.createdAt, 3000)
})

test('mergeNotificationEvents sorts by createdAt descending', () => {
  const existing = [{ id: 'a', createdAt: 1000 }]
  const incoming = [{ id: 'b', createdAt: 5000 }, { id: 'c', createdAt: 3000 }]

  const result = mergeNotificationEvents(existing, incoming)

  assert.deepEqual(result.map((event) => event.id), ['b', 'c', 'a'])
})

test('mergeNotificationEvents caps the list at maxEvents', () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, createdAt: i }))
  const incoming = []

  const result = mergeNotificationEvents(existing, incoming, 3)

  assert.equal(result.length, 3)
  assert.deepEqual(result.map((event) => event.id), ['e4', 'e3', 'e2'])
})

test('MAX_EVENTS default is a sane positive number', () => {
  assert.equal(MAX_EVENTS, 100)
})

test('computeUnreadCount only counts events whose id is not in readIds', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(computeUnreadCount(events, ['a']), 2)
  assert.equal(computeUnreadCount(events, ['a', 'b', 'c']), 0)
  assert.equal(computeUnreadCount(events, []), 3)
})

test('markEventRead appends without duplicating', () => {
  assert.deepEqual(markEventRead([], 'a'), ['a'])
  assert.deepEqual(markEventRead(['a'], 'a'), ['a'])
  assert.deepEqual(markEventRead(['a'], 'b'), ['a', 'b'])
})

test('markAllRead returns every current event id', () => {
  const events = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(markAllRead(events), ['a', 'b'])
})

test('relativeTimeLabel formats minutes/hours/days in Chinese', () => {
  const now = 1_000_000_000
  assert.equal(relativeTimeLabel(now - 10_000, now), '刚刚')
  assert.equal(relativeTimeLabel(now - 5 * 60_000, now), '5 分钟前')
  assert.equal(relativeTimeLabel(now - 3 * 3_600_000, now), '3 小时前')
  assert.equal(relativeTimeLabel(now - 2 * 86_400_000, now), '2 天前')
})

test('shouldResetForUser is true only when a different known user previously owned the data', () => {
  assert.equal(shouldResetForUser('', 'alice'), false)
  assert.equal(shouldResetForUser('alice', 'alice'), false)
  assert.equal(shouldResetForUser('alice', 'bob'), true)
  assert.equal(shouldResetForUser(undefined, 'bob'), false)
  assert.equal(shouldResetForUser('alice', ''), false)
  assert.equal(shouldResetForUser('alice', undefined), false)
})
