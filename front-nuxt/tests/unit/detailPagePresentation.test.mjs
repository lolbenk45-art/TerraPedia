import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveNpcArchiveModules,
  splitFeaturedArticleList,
} from '../../utils/detailPagePresentation.ts'
import { createPublicApiFetcher } from '../../composables/usePublicApi.ts'

test('prioritizes a merchant shop ahead of supporting NPC modules', () => {
  assert.deepEqual(resolveNpcArchiveModules({ isTownNpc: true, shopCount: 3 }), ['shop', 'residence'])
  assert.deepEqual(resolveNpcArchiveModules({ name: '旅商', shopCount: 3 }), ['arrival', 'shop'])
  assert.deepEqual(resolveNpcArchiveModules({ isTownNpc: true, name: '旅商', shopCount: 3 }), ['arrival', 'shop'])
  assert.deepEqual(resolveNpcArchiveModules({ lootCount: 1 }), ['loot'])
})

test('splits a live article list into one feature and archive rows', () => {
  const { featured, archive } = splitFeaturedArticleList([{ id: 1 }, { id: 2 }])

  assert.deepEqual(featured, { id: 1 })
  assert.deepEqual(archive, [{ id: 2 }])
})

test('keeps a captured public API client usable after an async boundary', async () => {
  const requestedUrls = []
  const fetchPublicApi = createPublicApiFetcher(
    { apiServerBase: 'http://api.test/api', public: { apiBase: '/api' } },
    async (url) => {
      requestedUrls.push(url)
      return { success: true, data: { variants: [{ roots: [{}] }] } }
    },
    true,
  )

  await Promise.resolve()
  const response = await fetchPublicApi('/public/items/757/recipe-tree')

  assert.equal(response.success, true)
  assert.deepEqual(requestedUrls, ['http://api.test/api/public/items/757/recipe-tree'])
})
