const FEATURE_FOLD_MINIMUM = 6
const READING_LIST_SIZE = 5
const DISCOVERY_LATEST_SIZE = 6

export const buildArticleArchive = <T>(articles: readonly T[]) => {
  const entries = Array.isArray(articles) ? [...articles] : []

  if (entries.length < FEATURE_FOLD_MINIMUM) {
    return {
      featured: null,
      readingList: [] as T[],
      discoveryLatest: entries,
      archive: entries,
    }
  }

  return {
    featured: entries[0] ?? null,
    readingList: entries.slice(1, READING_LIST_SIZE + 1),
    discoveryLatest: entries.slice(
      READING_LIST_SIZE + 1,
      READING_LIST_SIZE + 1 + DISCOVERY_LATEST_SIZE,
    ),
    archive: entries,
  }
}
