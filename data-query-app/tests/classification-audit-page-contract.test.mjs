import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const pagePath = 'data-query-app/pages/operations/classification-audit.vue'
const auditSectionKeys = [
  'uncategorizedItems',
  'uncategorizedNpcs',
  'unknownDropSourceKinds',
  'missingReferences',
  'itemCategoryConflicts',
]

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('classification audit route page exists and consumes only the read-only endpoint', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, pagePath)))

  const page = read(pagePath)

  assert.match(page, /definePageMeta\(\{\s*title:\s*'分类审计'/)
  assert.match(page, /navSection:\s*'\/operations\/classification-audit'/)
  assert.match(page, /get<.*ClassificationAuditResponse>/)
  assert.match(page, /\/admin\/operations\/classification-audit/)
  assert.doesNotMatch(page, /\/admin\/items/)
  assert.doesNotMatch(page, /\/admin\/npcs/)
  assert.doesNotMatch(page, /\/admin\/entities/)
})

test('classification audit page is explicitly read-only and exposes no write actions', () => {
  const page = read(pagePath)
  const lowerPage = page.toLowerCase()

  assert.match(page, /只读/)
  assert.match(page, /仅展示后端审计结果，不写入数据/)
  assert.doesNotMatch(page, /\b(post|put|delete|patch)\s*\(/i)
  assert.doesNotMatch(lowerPage, /\b(apply|sync|repair|bulk|materialize|rollback)\b/)
  assert.doesNotMatch(page, />(?:[^<]*(?:修复|应用|同步|批量|物化|回滚)[^<]*)</)
  assert.doesNotMatch(page, /<button[\s\S]*?(修复|应用|同步|批量|物化|回滚)[\s\S]*?<\/button>/)
})

test('classification audit page defines the five backend audit sections', () => {
  const page = read(pagePath)

  assert.deepEqual(readSectionKeys(page), [
    'uncategorizedItems',
    'uncategorizedNpcs',
    'unknownDropSourceKinds',
    'missingReferences',
    'itemCategoryConflicts',
  ])
  assert.match(page, /未分类物品/)
  assert.match(page, /未分类 NPC/)
  assert.match(page, /未知掉落来源类型/)
  assert.match(page, /缺失引用/)
  assert.match(page, /物品主分类与关联冲突/)
})

test('classification audit page has one zero-result empty state per section', () => {
  const page = read(pagePath)

  assert.equal((page.match(/emptyText:/g) || []).length, 5)
  assert.match(page, /当前没有未分类物品。/)
  assert.match(page, /当前没有未分类 NPC。/)
  assert.match(page, /当前没有未知掉落来源类型。/)
  assert.match(page, /当前没有缺失引用。/)
  assert.match(page, /当前没有物品主分类与关联冲突。/)
  assert.match(page, /v-else\s+class="audit-empty"/)
})

test('classification audit page uses the maintained semantic color tokens', () => {
  const page = read(pagePath)
  const style = page.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1]

  assert.ok(style, 'scoped style block should be present')
  assert.doesNotMatch(style, /var\(--(?:text|text-muted|border|surface-muted)\)/)
  assert.equal((style.match(/var\(--color-text\)/g) || []).length, 3)
  assert.equal((style.match(/var\(--color-text-muted\)/g) || []).length, 2)
  assert.equal((style.match(/var\(--color-border\)/g) || []).length, 1)
  assert.equal((style.match(/var\(--color-surface-muted\)/g) || []).length, 1)
})

test('classification audit requests the current shared page with a fixed page size', () => {
  const page = read(pagePath)

  assert.match(page, /const PAGE_SIZE = 20/)
  assert.match(page, /const page = ref\(1\)/)
  assert.match(page, /async function loadAudit\(targetPage = page\.value\)/)
  assert.match(page, /@click="loadAudit\(\)"/)
  assert.match(
    page,
    /get<ClassificationAuditResponse>\(\s*'\/admin\/operations\/classification-audit',\s*\{\s*page:\s*requestPage,\s*limit:\s*PAGE_SIZE,?\s*\}\s*\)/
  )
})

test('classification audit aggregates section pagination into one disabled shared pager', () => {
  const page = read(pagePath)
  const gridPosition = page.indexOf('</section>', page.indexOf('<section class="audit-section-grid"'))
  const paginationPosition = page.indexOf('<AppPagination')
  const handler = page.match(/async function handlePageChange\(nextPage: number\) \{([\s\S]*?)\n\}/)?.[1]

  assert.match(page, /const auditPagination = computed\(\(\) =>/)
  assert.match(page, /section\.pagination\.totalPages/)
  assert.match(page, /Math\.ceil\([^\n]+ \/ PAGE_SIZE\)/)
  assert.ok(paginationPosition > gridPosition, 'shared pagination should follow the five-section grid')
  assert.match(page, /<AppPagination\s+v-if="auditPagination\.totalPages > 1"/)
  assert.match(page, /:page="auditPagination\.page"/)
  assert.match(page, /:total="auditPagination\.total"/)
  assert.match(page, /:total-pages="auditPagination\.totalPages"/)
  assert.match(page, /:disabled="loading"/)
  assert.match(page, /@change="handlePageChange"/)
  assert.ok(handler, 'async page change handler should be present')
  assert.match(handler, /Number\.isInteger\(nextPage\)/)
  assert.match(handler, /nextPage < 1/)
  assert.match(handler, /nextPage > auditPagination\.value\.totalPages/)
  assert.match(handler, /nextPage === page\.value/)
  assert.doesNotMatch(handler, /page\.value = nextPage/)
  assert.match(handler, /await loadAudit\(nextPage\)/)
})

test('classification audit pagination helper executes five-section totals and page maxima', () => {
  const page = read(pagePath)
  const buildSource = extractFunction(page, 'buildAuditSections')
  const aggregateSource = extractFunction(page, 'aggregateAuditPagination')

  assert.ok(buildSource, 'buildAuditSections helper should be present')
  assert.ok(aggregateSource, 'aggregateAuditPagination helper should be present')

  const createHelpers = new Function('sectionConfigs', 'PAGE_SIZE', `
    ${toRunnableJavaScript(buildSource)}
    ${toRunnableJavaScript(aggregateSource)}
    return { buildAuditSections, aggregateAuditPagination }
  `)
  const helpers = createHelpers(makeSectionConfigs(), 20)
  const overview = makeOverview({
    page: 3,
    counts: [1, 2, 21, 0, 6],
    totalPages: [2, 5, null, 0, 1],
    marker: 'aggregate',
  })

  assert.deepEqual(helpers.aggregateAuditPagination(helpers.buildAuditSections(overview), 9), {
    page: 3,
    total: 30,
    totalPages: 5,
  })
  assert.deepEqual(helpers.aggregateAuditPagination(helpers.buildAuditSections(null), 1), {
    page: 1,
    total: 0,
    totalPages: 0,
  })
})

test('classification audit commits neither page nor data until a page request succeeds', async () => {
  const pageSource = read(pagePath)
  const oldData = makeOverview({ page: 1, counts: [1, 1, 1, 1, 1], totalPages: 2, marker: 'old' })
  const nextData = makeOverview({ page: 2, counts: [1, 1, 1, 1, 1], totalPages: 2, marker: 'next' })
  const requests = []
  let resolveRequest
  const runtime = createPageRuntime(pageSource, {
    initialPage: 1,
    initialData: oldData,
    get: (_url, params) => {
      requests.push(params.page)
      return new Promise((resolve) => {
        resolveRequest = resolve
      })
    },
  })

  const pending = runtime.handlePageChange(2)
  const pageBeforeResponse = runtime.page.value
  const dataBeforeResponse = runtime.auditData.value
  resolveRequest({ success: true, data: nextData })
  await pending

  assert.equal(pageBeforeResponse, 1)
  assert.strictEqual(dataBeforeResponse, oldData)
  assert.deepEqual(requests, [2])
  assert.equal(runtime.page.value, 2)
  assert.strictEqual(runtime.auditData.value, nextData)
})

test('classification audit retries the same target after a failed page request', async () => {
  const pageSource = read(pagePath)
  const oldData = makeOverview({ page: 1, counts: [1, 1, 1, 1, 1], totalPages: 2, marker: 'old' })
  const nextData = makeOverview({ page: 2, counts: [1, 1, 1, 1, 1], totalPages: 2, marker: 'retry' })
  const requests = []
  let attempt = 0
  const runtime = createPageRuntime(pageSource, {
    initialPage: 1,
    initialData: oldData,
    get: async (_url, params) => {
      requests.push(params.page)
      attempt += 1
      if (attempt === 1) throw new Error('page request failed')
      return { success: true, data: nextData }
    },
  })

  await runtime.handlePageChange(2)
  await runtime.handlePageChange(2)

  assert.deepEqual(requests, [2, 2])
  assert.equal(runtime.page.value, 2)
  assert.strictEqual(runtime.auditData.value, nextData)
  assert.equal(runtime.loadError.value, '')
})

test('classification audit refetches a clamped page before committing contracted data', async () => {
  const pageSource = read(pagePath)
  const oldData = makeOverview({ page: 1, counts: [21, 0, 0, 0, 0], totalPages: 2, marker: 'old' })
  const outOfRangeData = makeOverview({ page: 2, counts: [1, 0, 0, 0, 0], totalPages: 1, marker: 'discarded' })
  const validData = makeOverview({ page: 1, counts: [1, 0, 0, 0, 0], totalPages: 1, marker: 'valid' })
  const requests = []
  let resolveValidRequest
  const runtime = createPageRuntime(pageSource, {
    initialPage: 1,
    initialData: oldData,
    get: async (_url, params) => {
      requests.push(params.page)
      if (params.page === 2) return { success: true, data: outOfRangeData }
      return new Promise((resolve) => {
        resolveValidRequest = resolve
      })
    },
  })

  const pending = runtime.handlePageChange(2)
  await Promise.resolve()

  assert.deepEqual(requests, [2, 1])
  assert.equal(runtime.page.value, 1)
  assert.strictEqual(runtime.auditData.value, oldData)

  resolveValidRequest({ success: true, data: validData })
  await pending

  assert.deepEqual(requests, [2, 1])
  assert.equal(runtime.page.value, 1)
  assert.strictEqual(runtime.auditData.value, validData)
})

test('classification audit stabilizes an empty contracted result on page one', async () => {
  const pageSource = read(pagePath)
  const oldData = makeOverview({ page: 2, counts: [21, 0, 0, 0, 0], totalPages: 2, marker: 'old' })
  const emptyPageTwo = makeOverview({ page: 2, counts: [0, 0, 0, 0, 0], totalPages: 0, marker: 'empty-2' })
  const emptyPageOne = makeOverview({ page: 1, counts: [0, 0, 0, 0, 0], totalPages: 0, marker: 'empty-1' })
  const requests = []
  const runtime = createPageRuntime(pageSource, {
    initialPage: 2,
    initialData: oldData,
    get: async (_url, params) => {
      requests.push(params.page)
      return { success: true, data: params.page === 2 ? emptyPageTwo : emptyPageOne }
    },
  })

  await runtime.loadAudit()

  assert.deepEqual(requests, [2, 1])
  assert.equal(runtime.page.value, 1)
  assert.strictEqual(runtime.auditData.value, emptyPageOne)
})

test('operations navigation includes the classification audit route', () => {
  const layout = read('data-query-app/layouts/default.vue')

  assert.match(layout, /path:\s*'\/operations\/classification-audit'/)
  assert.match(layout, /name:\s*'分类审计'/)
})

function readSectionKeys(page) {
  const match = page.match(/const sectionConfigs = \[([\s\S]*?)\] as const/)
  assert.ok(match, 'sectionConfigs array should be present')
  return [...match[1].matchAll(/key:\s*'([^']+)'/g)].map((item) => item[1])
}

function extractFunction(source, functionName) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`).exec(source)
  if (!match) return null

  const bodyStart = source.indexOf('{', match.index)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(match.index, index + 1)
  }

  return null
}

function toRunnableJavaScript(source) {
  return source
    .replaceAll('get<ClassificationAuditResponse>', 'get')
    .replace('overview: ClassificationAuditOverview | null', 'overview')
    .replace('sections: ReturnType<typeof buildAuditSections>, fallbackPage: number', 'sections, fallbackPage')
    .replace('nextPage: number', 'nextPage')
}

function createPageRuntime(source, { get, initialPage, initialData }) {
  const buildSource = extractFunction(source, 'buildAuditSections')
  const aggregateSource = extractFunction(source, 'aggregateAuditPagination')
  const loadSource = extractFunction(source, 'loadAudit')
  const handlerSource = extractFunction(source, 'handlePageChange')

  assert.ok(buildSource, 'buildAuditSections should be present')
  assert.ok(aggregateSource, 'aggregateAuditPagination should be present')
  assert.ok(loadSource, 'loadAudit should be present')
  assert.ok(handlerSource, 'handlePageChange should be present')

  const createRuntime = new Function('get', 'sectionConfigs', 'initialPage', 'initialData', `
    const PAGE_SIZE = 20
    const page = { value: initialPage }
    const auditData = { value: initialData }
    const loading = { value: false }
    const hasLoaded = { value: true }
    const loadError = { value: '' }
    ${toRunnableJavaScript(buildSource)}
    ${toRunnableJavaScript(aggregateSource)}
    const auditSections = {
      get value() { return buildAuditSections(auditData.value) }
    }
    const auditPagination = {
      get value() { return aggregateAuditPagination(auditSections.value, page.value) }
    }
    ${toRunnableJavaScript(loadSource)}
    ${toRunnableJavaScript(handlerSource)}
    return { page, auditData, loading, hasLoaded, loadError, loadAudit, handlePageChange }
  `)

  return createRuntime(get, makeSectionConfigs(), initialPage, initialData)
}

function makeSectionConfigs() {
  return auditSectionKeys.map(key => ({ key, title: key, description: key, emptyText: key }))
}

function makeOverview({ page, counts, totalPages, marker }) {
  return Object.fromEntries(auditSectionKeys.map((key, index) => {
    const count = counts[index] ?? 0
    const sectionTotalPages = Array.isArray(totalPages) ? totalPages[index] : totalPages
    return [key, {
      key,
      label: key,
      count,
      pagination: {
        total: count,
        page,
        limit: 20,
        size: 20,
        totalPages: sectionTotalPages,
      },
      rows: count > 0 ? [{ marker, key }] : [],
    }]
  }))
}
