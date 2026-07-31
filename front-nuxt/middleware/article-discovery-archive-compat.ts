export default defineNuxtRouteMiddleware((to) => {
  const rawKeyword = Array.isArray(to.query.keyword) ? to.query.keyword[0] : to.query.keyword
  const rawPage = Array.isArray(to.query.page) ? to.query.page[0] : to.query.page
  const legacyKeyword = String(rawKeyword ?? '').trim()
  const hasPageQuery = rawPage !== undefined && rawPage !== null && String(rawPage).trim() !== ''
  const pageCandidate = Number(rawPage ?? 1)
  const legacyPage = Number.isFinite(pageCandidate) && pageCandidate > 0 ? Math.floor(pageCandidate) : 1

  if (!legacyKeyword && legacyPage <= 1) return

  return navigateTo({
    path: '/articles/archive',
    query: {
      ...(legacyKeyword ? { keyword: legacyKeyword } : {}),
      ...(hasPageQuery ? { page: String(legacyPage) } : {}),
    },
  }, { redirectCode: 302, replace: true })
})
