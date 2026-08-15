import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearStoredArticleDraft,
  formatArticleDraftSavedAt,
  parseStoredArticleDraft,
  persistStoredArticleDraft,
  readStoredArticleDraft,
  serializeArticleDraftFields,
} from '../../composables/useArticleDraftGuard.ts'

const createMockStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
  }
}

const sampleFields = () => ({
  title: '近战推进',
  slug: 'melee',
  summary: '摘要',
  coverImage: 'https://img/cover.png',
  contentHtml: '<p>正文</p>',
})

test('serializeArticleDraftFields ignores non-form keys and is order-stable', () => {
  const a = serializeArticleDraftFields({ ...sampleFields(), savedAt: 'x', extra: 1 })
  const b = serializeArticleDraftFields(sampleFields())
  assert.equal(a, b)
})

test('parseStoredArticleDraft rejects empty and malformed payloads', () => {
  assert.equal(parseStoredArticleDraft(null), null)
  assert.equal(parseStoredArticleDraft('not json'), null)
  assert.equal(parseStoredArticleDraft('"a string"'), null)
  // Neither title nor content -> treated as no draft.
  assert.equal(parseStoredArticleDraft(JSON.stringify({ slug: 's' })), null)
})

test('parseStoredArticleDraft coerces fields and keeps drafts with title or content', () => {
  const draft = parseStoredArticleDraft(JSON.stringify({ savedAt: '2026-01-01', title: 'T' }))
  assert.deepEqual(draft, {
    savedAt: '2026-01-01',
    title: 'T',
    slug: '',
    summary: '',
    coverImage: '',
    contentHtml: '',
  })
  const contentOnly = parseStoredArticleDraft(JSON.stringify({ contentHtml: '<p>x</p>' }))
  assert.equal(contentOnly?.contentHtml, '<p>x</p>')
})

test('formatArticleDraftSavedAt handles missing and invalid timestamps', () => {
  assert.equal(formatArticleDraftSavedAt(undefined), '')
  assert.equal(formatArticleDraftSavedAt(''), '')
  assert.equal(formatArticleDraftSavedAt('not-a-date'), '')
  const label = formatArticleDraftSavedAt('2026-03-04T05:06:00')
  assert.match(label, /^2026-03-04 05:06$/)
})

test('persist/read/clear round-trip through a storage-like object', () => {
  const storage = createMockStorage()
  const key = 'terrapedia:article-draft:new'
  persistStoredArticleDraft(storage, key, sampleFields())
  const draft = readStoredArticleDraft(storage, key)
  assert.equal(draft?.title, '近战推进')
  assert.equal(draft?.contentHtml, '<p>正文</p>')
  assert.ok(draft?.savedAt, 'persisted draft records a savedAt timestamp')

  clearStoredArticleDraft(storage, key)
  assert.equal(readStoredArticleDraft(storage, key), null)
})

test('storage helpers are no-ops without a storage backend', () => {
  assert.equal(readStoredArticleDraft(undefined, 'k'), null)
  assert.doesNotThrow(() => clearStoredArticleDraft(undefined, 'k'))
  assert.doesNotThrow(() => persistStoredArticleDraft(undefined, 'k', sampleFields()))
})

test('storage failures are swallowed so the draft stays best-effort', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
    removeItem: () => { throw new Error('blocked') },
  }
  assert.equal(readStoredArticleDraft(throwing, 'k'), null)
  assert.doesNotThrow(() => persistStoredArticleDraft(throwing, 'k', sampleFields()))
  assert.doesNotThrow(() => clearStoredArticleDraft(throwing, 'k'))
})
