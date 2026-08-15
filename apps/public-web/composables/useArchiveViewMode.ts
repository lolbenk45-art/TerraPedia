import { ARCHIVE_VIEW_COOKIE, normalizeArchiveViewMode, type ArchiveViewMode } from '~/utils/articleArchive'

// 与 stores/theme.ts 的 terrapedia-theme 同机制：cookie 在服务端就能读到，
// SSR 首屏直出正确正文，避免先渲染卡片再跳列表的水合闪烁。
export const useArchiveViewMode = () => {
  const storedView = useCookie<ArchiveViewMode>(ARCHIVE_VIEW_COOKIE, {
    default: () => 'card',
    sameSite: 'lax',
  })

  const viewMode = computed<ArchiveViewMode>(() => normalizeArchiveViewMode(storedView.value))

  const setViewMode = (nextView: ArchiveViewMode) => {
    const normalizedView = normalizeArchiveViewMode(nextView)

    if (normalizedView === viewMode.value) {
      return
    }

    storedView.value = normalizedView
  }

  return { viewMode, setViewMode }
}
