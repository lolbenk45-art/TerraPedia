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

export type ArchiveViewMode = 'card' | 'list'

// 与 terrapedia-theme 同机制：cookie 存视图偏好，SSR 首屏直出正确正文，无水合闪烁。
export const ARCHIVE_VIEW_COOKIE = 'terrapedia-archive-view'

export const normalizeArchiveViewMode = (value: unknown): ArchiveViewMode => (
  value === 'list' ? 'list' : 'card'
)
