import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const repoRoot = path.resolve(import.meta.dirname, '..')

function loadArticlesStore(mockGet) {
  const source = fs.readFileSync(path.join(repoRoot, 'stores/articles.ts'), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replaceAll('import.meta.client', 'false')

  const toastMessages = []
  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    console,
    URL,
    import: { meta: { client: false } },
    ref: value => ({ value }),
    require: id => {
      if (id === 'pinia') {
        return { defineStore: (_id, setup) => () => setup() }
      }
      if (id === '~/composables/useApi') {
        return {
          get: mockGet,
          patch: async () => ({}),
          post: async () => ({}),
          put: async () => ({}),
        }
      }
      if (id === '~/composables/useToast') {
        return { showToast: (message, type) => toastMessages.push({ message, type }) }
      }
      throw new Error(`Unexpected module ${id}`)
    },
  }

  vm.runInNewContext(code, sandbox, { filename: 'stores/articles.ts' })
  return {
    useArticlesStore: module.exports.useArticlesStore,
    toastMessages,
  }
}

test('articles store uses admin list commentCount values without any per-article comments request', async () => {
  const calls = []
  const { useArticlesStore } = loadArticlesStore(async (url, params) => {
    calls.push({ url, params })
    if (url === '/admin/articles') {
      return {
        data: {
          records: [
            { id: 11, title: '蜂后攻略', status: 'PUBLISHED', reviewStatus: 'APPROVED', commentCount: 7 },
            { id: 12, title: '史莱姆王', status: 'PUBLISHED', reviewStatus: 'APPROVED', commentCount: 3 },
          ],
          pagination: { total: 2, page: 1, limit: 10 },
        },
      }
    }
    throw new Error(`Unexpected URL ${url}`)
  })

  const store = useArticlesStore()
  await store.fetchArticles(1, 10)

  assert.deepEqual(store.articles.value.map(row => [row.id, row.commentCount]), [
    [11, 7],
    [12, 3],
  ])
  assert.equal(store.refreshArticleCommentCounts, undefined)
  assert.equal(calls.filter(call => call.url.endsWith('/comments')).length, 0)
})

test('articles store keeps the list-provided zero commentCount without a comment-count refresh state', async () => {
  const { useArticlesStore, toastMessages } = loadArticlesStore(async (url) => {
    if (url === '/admin/articles') {
      return {
        data: [
          { id: 21, title: '月总攻略', status: 'PUBLISHED', reviewStatus: 'APPROVED', commentCount: 0 },
        ],
        pagination: { total: 1, page: 1, limit: 10 },
      }
    }
    throw new Error('comment endpoint unavailable')
  })

  const store = useArticlesStore()
  await store.fetchArticles(1, 10)

  assert.equal(store.articles.value[0].commentCount, 0)
  assert.equal(store.commentCountRefreshing, undefined)
  assert.equal(store.commentCountRefreshFailed, undefined)
  assert.equal(store.commentCountRefreshFailedArticleIds, undefined)
  assert.equal(toastMessages.length, 0)
})
