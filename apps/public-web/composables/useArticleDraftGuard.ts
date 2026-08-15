import type { MaybeRefOrGetter } from 'vue'

// Shared local draft safety net for the user article editors. Both the "new"
// and "edit" pages debounce the form into localStorage, surface a restore
// banner, and guard against losing unsaved edits when leaving the page. The
// pure helpers below hold no Vue state so they can be unit tested with a mock
// storage; the composable wires them into the editor pages' reactivity.

export interface ArticleDraftFields {
  title: string
  slug: string
  summary: string
  coverImage: string
  contentHtml: string
}

export interface StoredArticleDraft extends ArticleDraftFields {
  savedAt: string
}

export interface ArticleDraftStorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const serializeArticleDraftFields = (fields: ArticleDraftFields): string => JSON.stringify({
  title: fields.title,
  slug: fields.slug,
  summary: fields.summary,
  coverImage: fields.coverImage,
  contentHtml: fields.contentHtml,
})

export const parseStoredArticleDraft = (raw: string | null): StoredArticleDraft | null => {
  if (!raw) return null
  let parsed: Partial<StoredArticleDraft> | null
  try {
    parsed = JSON.parse(raw) as Partial<StoredArticleDraft> | null
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const draft: StoredArticleDraft = {
    savedAt: String(parsed.savedAt || ''),
    title: String(parsed.title || ''),
    slug: String(parsed.slug || ''),
    summary: String(parsed.summary || ''),
    coverImage: String(parsed.coverImage || ''),
    contentHtml: String(parsed.contentHtml || ''),
  }
  if (!draft.title.trim() && !draft.contentHtml.trim()) return null
  return draft
}

export const formatArticleDraftSavedAt = (savedAt: string | undefined): string => {
  if (!savedAt) return ''
  const savedDate = new Date(savedAt)
  if (Number.isNaN(savedDate.getTime())) return ''
  const twoDigits = (part: number) => String(part).padStart(2, '0')
  return `${savedDate.getFullYear()}-${twoDigits(savedDate.getMonth() + 1)}-${twoDigits(savedDate.getDate())} ${twoDigits(savedDate.getHours())}:${twoDigits(savedDate.getMinutes())}`
}

export const readStoredArticleDraft = (
  storage: ArticleDraftStorageLike | undefined,
  key: string,
): StoredArticleDraft | null => {
  // localStorage can throw in private mode; the local draft is best-effort.
  if (!storage) return null
  try {
    return parseStoredArticleDraft(storage.getItem(key))
  } catch {
    return null
  }
}

export const clearStoredArticleDraft = (
  storage: ArticleDraftStorageLike | undefined,
  key: string,
): void => {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage failures; the local draft is an extra safety net only.
  }
}

export const persistStoredArticleDraft = (
  storage: ArticleDraftStorageLike | undefined,
  key: string,
  fields: ArticleDraftFields,
): void => {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify({
      savedAt: new Date().toISOString(),
      title: fields.title,
      slug: fields.slug,
      summary: fields.summary,
      coverImage: fields.coverImage,
      contentHtml: fields.contentHtml,
    } satisfies StoredArticleDraft))
  } catch {
    // Ignore storage failures; the local draft is an extra safety net only.
  }
}

export interface UseArticleDraftGuardOptions {
  // Key under which the draft is stored; a getter/ref so the edit page can key
  // by article id while the new page uses a fixed key.
  storageKey: MaybeRefOrGetter<string>
  // The reactive editor form. Watched to debounce local saves.
  form: ArticleDraftFields
  // Confirmation shown when leaving with unsaved changes.
  leaveConfirmMessage?: string
  // Called after a stored draft is restored into the form (e.g. to reset any
  // pending cover selection so the preview mirrors the restored coverImage).
  onRestore?: () => void
}

const DEFAULT_LEAVE_CONFIRM_MESSAGE = '文章还有未保存的修改，确定离开吗？最新内容已自动暂存到本地草稿。'

export const useArticleDraftGuard = (options: UseArticleDraftGuardOptions) => {
  const { form } = options
  const leaveConfirmMessage = options.leaveConfirmMessage ?? DEFAULT_LEAVE_CONFIRM_MESSAGE

  const resolveStorage = (): ArticleDraftStorageLike | undefined => {
    if (!import.meta.client) return undefined
    try {
      return window.localStorage
    } catch {
      return undefined
    }
  }
  const resolveKey = () => toValue(options.storageKey)

  const articleDraftBaseline = ref(serializeArticleDraftFields(form))
  const restorableDraft = ref<StoredArticleDraft | null>(null)
  let articleDraftSaveTimer: ReturnType<typeof setTimeout> | null = null

  const hasUnsavedArticleChanges = computed(() => serializeArticleDraftFields(form) !== articleDraftBaseline.value)

  const restorableDraftSavedAtLabel = computed(() => formatArticleDraftSavedAt(restorableDraft.value?.savedAt))

  const clearDraft = () => {
    clearStoredArticleDraft(resolveStorage(), resolveKey())
  }

  const resetBaseline = () => {
    articleDraftBaseline.value = serializeArticleDraftFields(form)
  }

  // The server now owns this content: drop the local safety copy and treat the
  // editor as clean before navigation.
  const markSaved = () => {
    clearDraft()
    resetBaseline()
  }

  const persistArticleDraft = () => {
    if (!hasUnsavedArticleChanges.value) return
    persistStoredArticleDraft(resolveStorage(), resolveKey(), form)
  }

  const flushPendingDraftSave = () => {
    if (!articleDraftSaveTimer) return
    clearTimeout(articleDraftSaveTimer)
    articleDraftSaveTimer = null
    // Flush the pending debounce so a confirmed leave keeps the newest copy.
    persistArticleDraft()
  }

  const scheduleArticleDraftSave = () => {
    if (!import.meta.client) return
    if (articleDraftSaveTimer) clearTimeout(articleDraftSaveTimer)
    articleDraftSaveTimer = setTimeout(() => {
      articleDraftSaveTimer = null
      persistArticleDraft()
    }, 3000)
  }

  watch(form, scheduleArticleDraftSave)

  const detectRestorableArticleDraft = (detectOptions: { canEdit?: boolean } = {}) => {
    if (detectOptions.canEdit === false) return
    const draft = readStoredArticleDraft(resolveStorage(), resolveKey())
    if (!draft) return
    if (serializeArticleDraftFields(draft) === serializeArticleDraftFields(form)) {
      // The stored copy matches the server content, so it was already consumed.
      clearDraft()
      return
    }
    restorableDraft.value = draft
  }

  const restoreArticleDraft = () => {
    const draft = restorableDraft.value
    if (!draft) return
    form.title = draft.title
    form.slug = draft.slug
    form.summary = draft.summary
    form.coverImage = draft.coverImage
    form.contentHtml = draft.contentHtml
    options.onRestore?.()
    restorableDraft.value = null
  }

  const discardArticleDraft = () => {
    clearDraft()
    restorableDraft.value = null
  }

  const handleArticleEditorBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedArticleChanges.value) return
    // Persist synchronously before the tab closes so the 3s debounce window
    // can never drop the newest input, then prompt the native confirm dialog.
    flushPendingDraftSave()
    persistArticleDraft()
    // Chromium only shows the native confirm dialog when returnValue is set.
    event.preventDefault()
    event.returnValue = ''
  }

  onBeforeRouteLeave(() => {
    if (!hasUnsavedArticleChanges.value) return true
    return window.confirm(leaveConfirmMessage)
  })

  onMounted(() => {
    window.addEventListener('beforeunload', handleArticleEditorBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleArticleEditorBeforeUnload)
    flushPendingDraftSave()
  })

  return {
    restorableDraft,
    restorableDraftSavedAtLabel,
    hasUnsavedArticleChanges,
    detectRestorableArticleDraft,
    restoreArticleDraft,
    discardArticleDraft,
    persistArticleDraft,
    clearDraft,
    resetBaseline,
    markSaved,
  }
}

