export type ArticleArchiveOptions = {
  keyword?: string
}

const FEATURE_FOLD_MINIMUM = 6
const READING_LIST_SIZE = 5

export const buildArticleArchive = <T>(articles: readonly T[], options: ArticleArchiveOptions = {}) => {
  const entries = Array.isArray(articles) ? [...articles] : []
  const hasKeywordFilter = Boolean(String(options.keyword ?? '').trim())

  if (hasKeywordFilter || entries.length < FEATURE_FOLD_MINIMUM) {
    return {
      featured: null,
      readingList: [] as T[],
      archive: entries,
    }
  }

  return {
    featured: entries[0] ?? null,
    readingList: entries.slice(1, READING_LIST_SIZE + 1),
    archive: entries.slice(READING_LIST_SIZE + 1),
  }
}
