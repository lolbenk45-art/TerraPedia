import assert from 'node:assert/strict'
import test from 'node:test'

import { createPublicApiFetcher } from '../../composables/usePublicApi.ts'

const runtimeConfig = {
  apiServerBase: 'http://server.test/api',
  public: { apiBase: '/api' },
}

test('uses the server API base after an async boundary when its client was captured first', async () => {
  const requests = []
  const fetchPublicApi = createPublicApiFetcher(runtimeConfig, async (url) => {
    requests.push(url)
    return { success: true, data: { variants: [] } }
  }, true)

  await Promise.resolve()
  await fetchPublicApi('/public/items/757/recipe-tree')

  assert.deepEqual(requests, ['http://server.test/api/public/items/757/recipe-tree'])
})

test('uses the public API base in the browser', async () => {
  const requests = []
  const fetchPublicApi = createPublicApiFetcher(runtimeConfig, async (url) => {
    requests.push(url)
    return { success: true, data: [] }
  }, false)

  await fetchPublicApi('articles')

  assert.deepEqual(requests, ['/api/articles'])
})
