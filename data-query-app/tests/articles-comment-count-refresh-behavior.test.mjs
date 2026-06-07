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

test('articles store refreshes visible article comment counts from admin comment pagination totals', async () => {
  const calls = []
  const { useArticlesStore } = loadArticlesStore(async (url, params) => {
    calls.push({ url, params })
    if (url === '/admin/articles') {
      return {
        data: {
          records: [
            { id: 11, title: '蜂后攻略', status: 'PUBLISHED', reviewStatus: 'APPROVED', commentCount: 0 },
            { id: 12, title: '史莱姆王', status: 'PUBLISHED', reviewStatus: 'APPROVED' },
          ],
          pagination: { total: 2, page: 1, limit: 10 },
        },
      }
    }
    if (url === '/admin/articles/11/comments') {
      return { data: [], pagination: { total: 7, page: 1, limit: 1 } }
    }
    if (url === '/admin/articles/12/comments') {
      return { data: { records: [] }, dataTotal: 3, pagination: { total: 3, page: 1, limit: 1 } }
    }
    throw new Error(`Unexpected URL ${url}`)
  })

  const store = useArticlesStore()
  await store.fetchArticles(1, 10)
  await store.refreshArticleCommentCounts(store.articles.value.map(row => row.id))

  assert.deepEqual(store.articles.value.map(row => [row.id, row.commentCount]), [
    [11, 7],
    [12, 3],
  ])
  assert.equal(calls.filter(call => call.url.endsWith('/comments')).length, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(call => call.url === '/admin/articles/11/comments')?.params)), { page: 1, limit: 1 })
})

test('articles store exposes comment count refresh failures instead of silently keeping zero', async () => {
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
  await store.refreshArticleCommentCounts()

  assert.equal(store.commentCountRefreshing.value, false)
  assert.equal(store.commentCountRefreshFailed.value, true)
  assert.equal(store.articles.value[0].commentCount, undefined)
  assert.ok(toastMessages.some(item => item.type === 'warning' && item.message.includes('评论数校准失败')))
})
