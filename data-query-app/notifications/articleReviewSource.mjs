import { get } from '~/composables/useApi'

function extractArticleList(response) {
  const raw = response?.data?.records
    ?? response?.data?.list
    ?? response?.data
    ?? response?.records
    ?? response?.list
    ?? response
    ?? []
  return Array.isArray(raw) ? raw : []
}

export function diffArticleReviewEvents(prevPendingIds, articles) {
  const prevIds = new Set(prevPendingIds)
  const nextState = []
  const events = []

  for (const article of articles) {
    if (article?.id === null || article?.id === undefined) continue
    const id = Number(article.id)
    if (!Number.isFinite(id)) continue

    nextState.push(id)

    if (!prevIds.has(id)) {
      events.push({
        id: `article:${id}:pending_review`,
        source: 'article-review',
        level: 'warning',
        title: `《${article?.title || '未命名文章'}》提交审核`,
        detail: article?.authorDisplayName ? `作者：${article.authorDisplayName}` : '',
        link: `/articles?reviewId=${id}`,
        createdAt: Date.now(),
      })
    }
  }

  return { events, nextState }
}

export const articleReviewSource = {
  key: 'article-review',
  intervalMs: 30000,
  async fetch() {
    // No server-side reviewStatus filter exists on this endpoint, so we fetch the
    // max page size and filter client-side. Sorted by updatedAt desc so a newly
    // submitted article stays near the front — once total articles exceed 100,
    // an old pending-review article could fall outside this page and silently
    // never notify.
    const response = await get('/admin/articles', {
      page: 1,
      limit: 100,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    })
    return extractArticleList(response).filter((article) => article?.reviewStatus === 'PENDING_REVIEW')
  },
  diff: diffArticleReviewEvents,
}
