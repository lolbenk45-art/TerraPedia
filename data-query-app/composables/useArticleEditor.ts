import { useDebounceFn } from '@vueuse/core'
import { showToast } from '~/composables/useToast'
import type { AdminArticle, ArticlePayload } from '~/stores/articles'
import {
  buildArticlePresentation,
  encodeAttributeValue,
  escapeHtml,
  extractPlainText,
  isSafeBlobImage,
  isSafeDataImage,
  mimeTypeToExtension,
  sanitizeArticleHtml,
  sanitizeImageAlt,
} from '~/utils/articleEditor'

type EditorPanel = 'preview' | 'outline' | 'quality'
type SaveStatus = 'idle' | 'dirty' | 'autosaved' | 'saving' | 'saved' | 'error'
type EditorBlockStyle = 'p' | 'h1' | 'h2' | 'h3' | 'blockquote'
type EditorLineHeight = '1.5' | '1.75' | '2'
type EditorTextIndent = '0' | '2em' | '4em'

type LocalDraftSnapshot = Pick<ArticlePayload, 'title' | 'slug' | 'summary' | 'coverImage' | 'contentHtml' | 'status'>

type LocalDraftPayload = {
  articleId: number | null
  savedAt: string
  data: LocalDraftSnapshot
}

const MAX_COVER_FILE_SIZE = 5 * 1024 * 1024
const MAX_EDITOR_IMAGE_FILE_SIZE = 5 * 1024 * 1024
const CROP_VIEWPORT_WIDTH = 560
const CROP_VIEWPORT_HEIGHT = 315
const CROP_OUTPUT_WIDTH = 1280
const CROP_OUTPUT_HEIGHT = 720
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,blockquote,li'

const normalizeSnapshot = (snapshot: LocalDraftSnapshot) => ({
  title: snapshot.title.trim(),
  slug: (snapshot.slug || '').trim(),
  summary: (snapshot.summary || '').trim(),
  coverImage: (snapshot.coverImage || '').trim(),
  contentHtml: (snapshot.contentHtml || '').trim(),
  status: snapshot.status || 'DRAFT',
})

const serializeSnapshot = (snapshot: LocalDraftSnapshot) => JSON.stringify(normalizeSnapshot(snapshot))

const toLocalDraftSnapshot = (form: LocalDraftSnapshot): LocalDraftSnapshot => ({
  title: form.title,
  slug: form.slug || '',
  summary: form.summary || '',
  coverImage: form.coverImage || '',
  contentHtml: form.contentHtml,
  status: form.status || 'DRAFT',
})

const formatEditorTime = (value?: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatEditorStatusTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  return formatEditorTime(value)
}

export const useArticleEditor = (initialArticleId: number | null) => {
  const router = useRouter()
  const articlesStore = useArticlesStore()

  const resolvedArticleId = ref<number | null>(initialArticleId)
  const loading = ref(true)
  const saving = ref(false)
  const editorRef = ref<HTMLDivElement | null>(null)
  const previewRef = ref<HTMLDivElement | null>(null)
  const inlineImageInput = ref<HTMLInputElement | null>(null)
  const coverFileInput = ref<HTMLInputElement | null>(null)
  const savedSelection = ref<Range | null>(null)
  const sidePanel = ref<EditorPanel>('preview')
  const sidePanelCollapsed = ref(false)
  const saveStatus = ref<SaveStatus>('idle')
  const submittingReview = ref(false)
  const pendingRecovery = ref<LocalDraftPayload | null>(null)
  const lastServerSavedAt = ref<string | null>(null)
  const lastLocalSavedAt = ref<string | null>(null)
  const linkDialogVisible = ref(false)
  const linkUrl = ref('')
  const linkText = ref('')
  const article = ref<AdminArticle | null>(null)
  const syncingState = ref(false)
  const persistedSnapshot = ref('')
  const isDirty = ref(false)

  const coverDragActive = ref(false)
  const coverDragDepth = ref(0)
  const pendingCoverFile = ref<File | null>(null)
  const pendingCoverPreviewUrl = ref('')
  const cropVisible = ref(false)
  const cropSourceFile = ref<File | null>(null)
  const cropSourceUrl = ref('')
  const cropNaturalWidth = ref(0)
  const cropNaturalHeight = ref(0)
  const cropScale = ref(1)
  const cropOffsetX = ref(0)
  const cropOffsetY = ref(0)
  const cropDragActive = ref(false)
  const cropDragPointerId = ref<number | null>(null)
  const cropDragStartX = ref(0)
  const cropDragStartY = ref(0)
  const cropDragOriginOffsetX = ref(0)
  const cropDragOriginOffsetY = ref(0)

  const form = reactive<ArticlePayload>({
    title: '',
    slug: '',
    summary: '',
    coverImage: '',
    contentHtml: '',
    status: 'DRAFT',
  })

  const fontSizeOptions = [14, 16, 18, 20, 24, 28] as const
  const lineHeightOptions = [
    { value: '1.5', label: '1.5x' },
    { value: '1.75', label: '1.75x' },
    { value: '2', label: '2.0x' },
  ] as const
  const textIndentOptions = [
    { value: '0', label: '无' },
    { value: '2em', label: '2字' },
    { value: '4em', label: '4字' },
  ] as const
  const textColorOptions = [
    { value: '#111827', label: '默认色' },
    { value: '#0f766e', label: '青绿' },
    { value: '#1d4ed8', label: '蓝色' },
    { value: '#b45309', label: '橙棕' },
    { value: '#b91c1c', label: '红色' },
    { value: '#6d28d9', label: '紫色' },
  ] as const
  const defaultFontSize = 16
  const fontSizePx = ref(defaultFontSize)
  const lineHeightValue = ref<EditorLineHeight>('1.75')
  const textIndentValue = ref<EditorTextIndent>('0')
  const textColorValue = ref('#111827')
  const toolbarState = reactive({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    justifyLeft: false,
    justifyCenter: false,
    justifyRight: false,
    justifyFull: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    blockStyle: 'p' as EditorBlockStyle,
  })

  const draftStorageKey = computed(() => {
    return resolvedArticleId.value == null
      ? 'tp_article_editor:new'
      : `tp_article_editor:${resolvedArticleId.value}`
  })

  const coverPreviewSrc = computed(() => pendingCoverPreviewUrl.value || form.coverImage || '')
  const cropBaseScale = computed(() => {
    if (!cropNaturalWidth.value || !cropNaturalHeight.value) return 1
    return Math.max(
      CROP_VIEWPORT_WIDTH / cropNaturalWidth.value,
      CROP_VIEWPORT_HEIGHT / cropNaturalHeight.value,
    )
  })
  const cropRenderedWidth = computed(() => cropNaturalWidth.value * cropBaseScale.value * cropScale.value)
  const cropRenderedHeight = computed(() => cropNaturalHeight.value * cropBaseScale.value * cropScale.value)
  const cropImageStyle = computed(() => ({
    width: `${cropNaturalWidth.value * cropBaseScale.value}px`,
    height: `${cropNaturalHeight.value * cropBaseScale.value}px`,
    transform: `translate(-50%, -50%) translate(${cropOffsetX.value}px, ${cropOffsetY.value}px) scale(${cropScale.value})`,
  }))

  const currentSnapshot = computed(() => serializeSnapshot(toLocalDraftSnapshot(form)))
  const presentation = computed(() => buildArticlePresentation(form.contentHtml))
  const previewHtml = computed(() => presentation.value.html)
  const outline = computed(() => presentation.value.outline)
  const wordCount = computed(() => presentation.value.wordCount)
  const imageCount = computed(() => presentation.value.imageCount)
  const paragraphCount = computed(() => presentation.value.paragraphCount)
  const hasBodyContent = computed(() => Boolean(presentation.value.plainText))
  const isReadOnly = computed(() => article.value?.reviewStatus === 'PENDING_REVIEW')
  const canSubmitReview = computed(() => {
    if (!resolvedArticleId.value) return false
    if (saving.value || submittingReview.value || isReadOnly.value || isDirty.value) return false
    const reviewStatus = article.value?.reviewStatus
    return reviewStatus === 'DRAFT' || reviewStatus === 'REJECTED'
  })
  const editorTitle = computed(() => form.title.trim() || (resolvedArticleId.value ? '未命名文章' : '新文章'))
  const editorCaption = computed(() => {
    if (isReadOnly.value) return '审核中，当前仅可查看内容'
    return resolvedArticleId.value ? '文章工作台' : '新建文章工作台'
  })
  const statusLabel = computed(() => {
    if (saving.value) return '保存中...'
    if (saveStatus.value === 'error') return '保存失败'
    if (saveStatus.value === 'autosaved') return `本地草稿已更新 ${formatEditorStatusTime(lastLocalSavedAt.value)}`
    if (saveStatus.value === 'saved') return `已保存 ${formatEditorStatusTime(lastServerSavedAt.value)}`
    if (isDirty.value) return '有未保存修改'
    return resolvedArticleId.value ? '已同步' : '未保存'
  })
  const checklist = computed(() => {
    return [
      { id: 'title', label: '标题', done: Boolean(form.title.trim()), hint: form.title.trim() ? `${form.title.trim().length} 字` : '建议明确主题' },
      { id: 'cover', label: '封面', done: Boolean(coverPreviewSrc.value), hint: coverPreviewSrc.value ? '封面已准备' : '建议添加 16:9 封面图' },
      { id: 'summary', label: '摘要', done: Boolean((form.summary || '').trim()), hint: (form.summary || '').trim() ? `${(form.summary || '').trim().length} 字` : '建议补充导语' },
      { id: 'body', label: '正文', done: hasBodyContent.value, hint: hasBodyContent.value ? `共 ${wordCount.value} 字` : '请开始写正文' },
      { id: 'structure', label: '结构', done: outline.value.length > 0 || wordCount.value < 300, hint: outline.value.length > 0 ? `识别到 ${outline.value.length} 个小标题` : '长文建议加入小标题' },
    ]
  })

  const applyFormSnapshot = (snapshot: LocalDraftSnapshot) => {
    syncingState.value = true
    form.title = snapshot.title || ''
    form.slug = snapshot.slug || ''
    form.summary = snapshot.summary || ''
    form.coverImage = snapshot.coverImage || ''
    form.contentHtml = snapshot.contentHtml || ''
    form.status = snapshot.status || 'DRAFT'
  }

  const syncFormFromEditor = () => {
    const editor = editorRef.value
    if (!editor) return
    form.contentHtml = editor.innerHTML
  }

  const syncEditorFromForm = () => {
    const editor = editorRef.value
    if (!editor) return
    editor.innerHTML = form.contentHtml || '<p><br></p>'
    syncToolbarState()
  }

  const saveSelection = () => {
    const editor = editorRef.value
    if (!editor) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      syncToolbarState()
      return
    }
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) {
      syncToolbarState()
      return
    }
    savedSelection.value = range.cloneRange()
    syncToolbarState()
  }

  const restoreSelection = () => {
    const editor = editorRef.value
    const range = savedSelection.value
    if (!editor || !range) return false
    if (!editor.contains(range.commonAncestorContainer)) return false
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }

  const resetToolbarState = () => {
    toolbarState.bold = false
    toolbarState.italic = false
    toolbarState.underline = false
    toolbarState.strikeThrough = false
    toolbarState.justifyLeft = false
    toolbarState.justifyCenter = false
    toolbarState.justifyRight = false
    toolbarState.justifyFull = false
    toolbarState.insertUnorderedList = false
    toolbarState.insertOrderedList = false
    toolbarState.blockStyle = 'p'
    lineHeightValue.value = '1.75'
    textIndentValue.value = '0'
    textColorValue.value = '#111827'
  }

  const getSelectionAnchorElement = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const node = selection.anchorNode
    if (!node) return null
    return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  }

  const readCommandState = (command: string) => {
    try {
      return document.queryCommandState(command)
    } catch {
      return false
    }
  }

  const resolveBlockStyle = (element: Element | null): EditorBlockStyle => {
    const editor = editorRef.value
    let current = element
    while (editor && current && current !== editor) {
      const tagName = current.tagName.toLowerCase()
      if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'blockquote' || tagName === 'p') {
        return tagName as EditorBlockStyle
      }
      current = current.parentElement
    }
    return 'p'
  }

  const resolveNearestFontSize = (element: Element | null) => {
    const editor = editorRef.value
    let current = element
    while (editor && current && current !== editor) {
      if (current instanceof HTMLElement) {
        const parsed = Number.parseFloat(window.getComputedStyle(current).fontSize)
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed
        }
      }
      current = current.parentElement
    }
    return fontSizePx.value
  }

  const resolveNearestLineHeight = (element: Element | null) => {
    const editor = editorRef.value
    let current = element
    while (editor && current && current !== editor) {
      if (current instanceof HTMLElement) {
        const computedStyle = window.getComputedStyle(current)
        const fontSize = Number.parseFloat(computedStyle.fontSize)
        const lineHeight = Number.parseFloat(computedStyle.lineHeight)
        if (Number.isFinite(fontSize) && fontSize > 0 && Number.isFinite(lineHeight) && lineHeight > 0) {
          return lineHeight / fontSize
        }
      }
      current = current.parentElement
    }
    return Number(lineHeightValue.value)
  }

  const resolveNearestTextIndent = (element: Element | null) => {
    const editor = editorRef.value
    let current = element
    while (editor && current && current !== editor) {
      if (current instanceof HTMLElement) {
        const computedStyle = window.getComputedStyle(current)
        const fontSize = Number.parseFloat(computedStyle.fontSize)
        const textIndent = Number.parseFloat(computedStyle.textIndent)
        if (Number.isFinite(fontSize) && fontSize > 0 && Number.isFinite(textIndent) && textIndent >= 0) {
          return textIndent / fontSize
        }
      }
      current = current.parentElement
    }
    return 0
  }

  const rgbToHex = (value: string) => {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
    if (!match) return null
    return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`.toLowerCase()
  }

  const resolveNearestTextColor = (element: Element | null) => {
    const editor = editorRef.value
    let current = element
    while (editor && current && current !== editor) {
      if (current instanceof HTMLElement) {
        const colorHex = rgbToHex(window.getComputedStyle(current).color)
        if (colorHex) return colorHex
      }
      current = current.parentElement
    }
    return textColorValue.value
  }

  const snapFontSize = (size: number): number => {
    const initial = fontSizeOptions[0] ?? defaultFontSize
    return fontSizeOptions.reduce((closest, option) => {
      return Math.abs(option - size) < Math.abs(closest - size) ? option : closest
    }, initial)
  }

  const snapLineHeight = (value: number): EditorLineHeight => {
    const initial = lineHeightOptions[0]
    return lineHeightOptions.reduce((closest, option) => {
      return Math.abs(Number(option.value) - value) < Math.abs(Number(closest.value) - value) ? option : closest
    }, initial).value
  }

  const snapTextIndent = (value: number): EditorTextIndent => {
    if (value >= 3) return '4em'
    if (value >= 1) return '2em'
    return '0'
  }

  const syncToolbarState = () => {
    const editor = editorRef.value
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) {
      resetToolbarState()
      return
    }

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) {
      resetToolbarState()
      return
    }

    const anchorElement = getSelectionAnchorElement()
    toolbarState.bold = readCommandState('bold')
    toolbarState.italic = readCommandState('italic')
    toolbarState.underline = readCommandState('underline')
    toolbarState.strikeThrough = readCommandState('strikeThrough')
    toolbarState.justifyLeft = readCommandState('justifyLeft')
    toolbarState.justifyCenter = readCommandState('justifyCenter')
    toolbarState.justifyRight = readCommandState('justifyRight')
    toolbarState.justifyFull = readCommandState('justifyFull')
    toolbarState.insertUnorderedList = readCommandState('insertUnorderedList')
    toolbarState.insertOrderedList = readCommandState('insertOrderedList')
    toolbarState.blockStyle = resolveBlockStyle(anchorElement)
    fontSizePx.value = snapFontSize(resolveNearestFontSize(anchorElement))
    lineHeightValue.value = snapLineHeight(resolveNearestLineHeight(anchorElement))
    textIndentValue.value = snapTextIndent(resolveNearestTextIndent(anchorElement))
    textColorValue.value = resolveNearestTextColor(anchorElement)
  }

  const handleDocumentSelectionChange = () => {
    const editor = editorRef.value
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) {
      syncToolbarState()
      return
    }
    const range = selection.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      saveSelection()
      return
    }
    syncToolbarState()
  }

  const insertHtmlAtCaret = (html: string) => {
    const editor = editorRef.value
    if (!editor) return
    editor.focus()
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    saveSelection()
    syncFormFromEditor()
  }

  const normalizeEditorFontTags = (targetPx: number) => {
    const editor = editorRef.value
    if (!editor) return
    const fontNodes = Array.from(editor.querySelectorAll('font[size="7"]'))
    for (const node of fontNodes) {
      const span = document.createElement('span')
      span.style.fontSize = `${targetPx}px`
      span.innerHTML = node.innerHTML
      node.replaceWith(span)
    }
  }

  const execEditorCommand = (command: string, value?: string) => {
    const editor = editorRef.value
    if (!editor || isReadOnly.value) return
    editor.focus()
    restoreSelection()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    saveSelection()
    syncFormFromEditor()
  }

  const applyFontSize = () => {
    const nextPx = Number(fontSizePx.value)
    if (!Number.isFinite(nextPx) || nextPx <= 0) return
    execEditorCommand('fontSize', '7')
    normalizeEditorFontTags(nextPx)
    syncFormFromEditor()
  }

  const applyBlockStyle = (tag: EditorBlockStyle) => {
    execEditorCommand('formatBlock', `<${tag}>`)
  }

  const collectSelectedBlocks = () => {
    const editor = editorRef.value
    if (!editor) return [] as HTMLElement[]

    const selection = window.getSelection()
    const activeRange = (
      selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    )
      ? selection.getRangeAt(0)
      : savedSelection.value

    if (!activeRange || !editor.contains(activeRange.commonAncestorContainer)) {
      return [] as HTMLElement[]
    }

    const blocks = new Set<HTMLElement>()
    const startElement = (
      activeRange.startContainer.nodeType === Node.ELEMENT_NODE
        ? activeRange.startContainer as Element
        : activeRange.startContainer.parentElement
    )?.closest(BLOCK_SELECTOR) as HTMLElement | null
    const endElement = (
      activeRange.endContainer.nodeType === Node.ELEMENT_NODE
        ? activeRange.endContainer as Element
        : activeRange.endContainer.parentElement
    )?.closest(BLOCK_SELECTOR) as HTMLElement | null

    if (startElement) blocks.add(startElement)
    if (endElement) blocks.add(endElement)

    const candidates = Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
    for (const candidate of candidates) {
      try {
        if (activeRange.intersectsNode(candidate)) {
          blocks.add(candidate)
        }
      } catch {
        continue
      }
    }

    return Array.from(blocks)
  }

  const applyStyleToSelectedBlocks = (property: 'line-height' | 'text-indent', value: string) => {
    if (isReadOnly.value) return
    const blocks = collectSelectedBlocks()
    if (!blocks.length) return

    blocks.forEach(block => {
      if (!value || value === '0') {
        block.style.removeProperty(property)
        return
      }
      block.style.setProperty(property, value)
    })

    saveSelection()
    syncFormFromEditor()
    syncToolbarState()
  }

  const applyLineHeight = () => {
    applyStyleToSelectedBlocks('line-height', lineHeightValue.value)
  }

  const applyTextIndent = () => {
    applyStyleToSelectedBlocks('text-indent', textIndentValue.value)
  }

  const applyTextColor = () => {
    execEditorCommand('foreColor', textColorValue.value)
  }

  const clearFormatting = () => {
    execEditorCommand('removeFormat')
    execEditorCommand('unlink')
    applyStyleToSelectedBlocks('line-height', '')
    applyStyleToSelectedBlocks('text-indent', '')
  }

  const openInlineImageDialog = () => {
    inlineImageInput.value?.click()
  }

  const getActiveAnchor = () => {
    const editor = editorRef.value
    if (!editor) return null

    if (savedSelection.value && editor.contains(savedSelection.value.commonAncestorContainer)) {
      const node = savedSelection.value.commonAncestorContainer
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
      return element?.closest('a')
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return null
    const node = range.commonAncestorContainer
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
    return element?.closest('a')
  }

  const openLinkDialog = () => {
    saveSelection()
    const selectedText = window.getSelection?.()?.toString().trim() || ''
    const anchor = getActiveAnchor()
    linkText.value = selectedText || (anchor?.textContent || '').trim()
    linkUrl.value = anchor?.getAttribute('href') || ''
    linkDialogVisible.value = true
  }

  const applyLink = () => {
    const rawUrl = linkUrl.value.trim()
    if (!rawUrl) {
      showToast('请输入链接地址', 'warning')
      return
    }

    const normalizedUrl = /^(https?:)?\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const selectedText = window.getSelection?.()?.toString().trim() || ''
    const anchor = getActiveAnchor()
    if (anchor) {
      anchor.setAttribute('href', normalizedUrl)
      if (linkText.value.trim()) {
        anchor.textContent = linkText.value.trim()
      }
      syncFormFromEditor()
      saveSelection()
      linkDialogVisible.value = false
      linkUrl.value = ''
      linkText.value = ''
      return
    }
    if (selectedText) {
      execEditorCommand('createLink', normalizedUrl)
    } else {
      const text = linkText.value.trim() || normalizedUrl
      insertHtmlAtCaret(`<a href="${encodeAttributeValue(normalizedUrl)}">${escapeHtml(text)}</a>`)
    }
    linkDialogVisible.value = false
    linkUrl.value = ''
    linkText.value = ''
  }

  const removeLink = () => {
    const anchor = getActiveAnchor()
    if (anchor) {
      const textNode = document.createTextNode(anchor.textContent || anchor.getAttribute('href') || '')
      anchor.replaceWith(textNode)
      syncFormFromEditor()
      saveSelection()
      return
    }
    execEditorCommand('unlink')
  }

  const insertCodeBlock = () => {
    const selectedText = window.getSelection?.()?.toString().trim() || ''
    const codeText = escapeHtml(selectedText || 'code')
    insertHtmlAtCaret(`<pre><code>${codeText}</code></pre><p><br></p>`)
  }

  const insertInlineCode = () => {
    const selectedText = window.getSelection?.()?.toString().trim() || ''
    const codeText = escapeHtml(selectedText || 'code')
    insertHtmlAtCaret(`<code>${codeText}</code>`)
  }

  const insertTable = (rows = 3, cols = 3) => {
    const safeRows = Math.max(1, Math.min(12, Math.floor(rows || 1)))
    const safeCols = Math.max(1, Math.min(8, Math.floor(cols || 1)))
    const headerHtml = Array.from({ length: safeCols }, (_, index) => `<th>列 ${index + 1}</th>`).join('')
    const bodyHtml = Array.from({ length: Math.max(1, safeRows - 1) }, () => (
      `<tr>${Array.from({ length: safeCols }, () => '<td><br></td>').join('')}</tr>`
    )).join('')
    insertHtmlAtCaret(`<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table><p><br></p>`)
  }

  const insertDivider = () => {
    execEditorCommand('insertHorizontalRule')
  }

  const handleToolbarMouseDown = () => {
    saveSelection()
  }

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })

  const readDataTransferImageFiles = (event: DragEvent): File[] => {
    const files = Array.from(event.dataTransfer?.files || [])
    return files.filter(file => file.type.startsWith('image/'))
  }

  const readClipboardImageFiles = (event: ClipboardEvent): File[] => {
    const items = Array.from(event.clipboardData?.items || [])
    return items
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((item): item is File => Boolean(item))
  }

  const insertLocalEditorImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > MAX_EDITOR_IMAGE_FILE_SIZE) {
      showToast('正文图片不能超过 5MB', 'warning')
      return
    }

    const dataUrl = await fileToDataUrl(file)
    if (!isSafeDataImage(dataUrl)) {
      showToast('当前图片格式暂不支持预览', 'warning')
      return
    }

    const safeAlt = sanitizeImageAlt(file.name || 'article-image')
    insertHtmlAtCaret(`<p><img src="${dataUrl}" alt="${encodeAttributeValue(safeAlt)}" loading="lazy" /></p>`)
  }

  const handleEditorInput = () => {
    syncFormFromEditor()
  }

  const handleEditorPaste = async (event: ClipboardEvent) => {
    const imageFiles = readClipboardImageFiles(event)
    if (!imageFiles.length) return

    event.preventDefault()
    for (const file of imageFiles) {
      try {
        await insertLocalEditorImage(file)
      } catch {
        showToast('粘贴图片预览失败', 'error')
      }
    }
  }

  const handleEditorDragOver = (event: DragEvent) => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const setCaretFromPoint = (clientX: number, clientY: number) => {
    const editor = editorRef.value
    if (!editor) return

    let range: Range | null = null
    const legacyDocument = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    }

    if (typeof legacyDocument.caretRangeFromPoint === 'function') {
      range = legacyDocument.caretRangeFromPoint(clientX, clientY)
    } else if (typeof legacyDocument.caretPositionFromPoint === 'function') {
      const position = legacyDocument.caretPositionFromPoint(clientX, clientY)
      if (position?.offsetNode) {
        range = document.createRange()
        range.setStart(position.offsetNode, position.offset)
        range.collapse(true)
      }
    }

    if (!range || !editor.contains(range.commonAncestorContainer)) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
    savedSelection.value = range.cloneRange()
  }

  const handleEditorDrop = async (event: DragEvent) => {
    const imageFiles = readDataTransferImageFiles(event)
    if (!imageFiles.length) return

    event.preventDefault()
    setCaretFromPoint(event.clientX, event.clientY)
    for (const file of imageFiles) {
      try {
        await insertLocalEditorImage(file)
      } catch {
        showToast('拖拽图片预览失败', 'error')
      }
    }
  }

  const handleInlineImageSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const imageFiles = Array.from(input.files || []).filter(file => file.type.startsWith('image/'))
    if (!imageFiles.length) {
      input.value = ''
      return
    }

    for (const file of imageFiles) {
      try {
        await insertLocalEditorImage(file)
      } catch {
        showToast('插入图片失败', 'error')
      }
    }

    input.value = ''
  }

  const clearPendingCoverSelection = () => {
    pendingCoverFile.value = null
    if (pendingCoverPreviewUrl.value) {
      URL.revokeObjectURL(pendingCoverPreviewUrl.value)
    }
    pendingCoverPreviewUrl.value = ''
  }

  const clearCropSource = () => {
    cropSourceFile.value = null
    if (cropSourceUrl.value) {
      URL.revokeObjectURL(cropSourceUrl.value)
    }
    cropSourceUrl.value = ''
    cropNaturalWidth.value = 0
    cropNaturalHeight.value = 0
    cropScale.value = 1
    cropOffsetX.value = 0
    cropOffsetY.value = 0
    cropDragActive.value = false
    cropDragPointerId.value = null
  }

  const clampCropOffsets = () => {
    const limitX = Math.max(0, (cropRenderedWidth.value - CROP_VIEWPORT_WIDTH) / 2)
    const limitY = Math.max(0, (cropRenderedHeight.value - CROP_VIEWPORT_HEIGHT) / 2)
    cropOffsetX.value = Math.min(limitX, Math.max(-limitX, cropOffsetX.value))
    cropOffsetY.value = Math.min(limitY, Math.max(-limitY, cropOffsetY.value))
  }

  const resetCropTransform = () => {
    cropScale.value = 1
    cropOffsetX.value = 0
    cropOffsetY.value = 0
  }

  const ensureImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'warning')
      return false
    }
    if (file.size > MAX_COVER_FILE_SIZE) {
      showToast('封面图片不能超过 5MB', 'warning')
      return false
    }
    return true
  }

  const loadImageMeta = (fileUrl: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Failed to read image metadata'))
    image.src = fileUrl
  })

  const beginCropFromFile = async (file: File) => {
    if (!ensureImageFile(file)) return

    const nextUrl = URL.createObjectURL(file)
    try {
      const meta = await loadImageMeta(nextUrl)
      clearCropSource()
      cropSourceFile.value = file
      cropSourceUrl.value = nextUrl
      cropNaturalWidth.value = meta.width
      cropNaturalHeight.value = meta.height
      resetCropTransform()
      cropVisible.value = true
    } catch {
      URL.revokeObjectURL(nextUrl)
      showToast('封面图片读取失败', 'error')
    }
  }

  const extractFirstFile = (dataTransfer: DataTransfer | null): File | null => {
    return dataTransfer?.files?.[0] ?? null
  }

  const openCoverFileDialog = () => {
    coverFileInput.value?.click()
  }

  const handleCoverSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      await beginCropFromFile(file)
    }
    input.value = ''
  }

  const handleCoverDragEnter = () => {
    coverDragDepth.value += 1
    coverDragActive.value = true
  }

  const handleCoverDragOver = () => {
    coverDragActive.value = true
  }

  const handleCoverDragLeave = () => {
    coverDragDepth.value = Math.max(0, coverDragDepth.value - 1)
    coverDragActive.value = coverDragDepth.value > 0
  }

  const handleCoverDrop = async (event: DragEvent) => {
    coverDragDepth.value = 0
    coverDragActive.value = false
    const file = extractFirstFile(event.dataTransfer)
    if (!file) return
    await beginCropFromFile(file)
  }

  const startCropDrag = (event: PointerEvent) => {
    if (cropDragActive.value) return
    cropDragActive.value = true
    cropDragPointerId.value = event.pointerId
    cropDragStartX.value = event.clientX
    cropDragStartY.value = event.clientY
    cropDragOriginOffsetX.value = cropOffsetX.value
    cropDragOriginOffsetY.value = cropOffsetY.value
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handleCropDragMove = (event: PointerEvent) => {
    if (!cropDragActive.value || cropDragPointerId.value !== event.pointerId) return
    const deltaX = event.clientX - cropDragStartX.value
    const deltaY = event.clientY - cropDragStartY.value
    cropOffsetX.value = cropDragOriginOffsetX.value + deltaX
    cropOffsetY.value = cropDragOriginOffsetY.value + deltaY
    clampCropOffsets()
  }

  const endCropDrag = (event: PointerEvent) => {
    if (cropDragPointerId.value !== event.pointerId) return
    cropDragActive.value = false
    cropDragPointerId.value = null
  }

  const cancelCrop = () => {
    cropVisible.value = false
    clearCropSource()
  }

  const renderCroppedBlob = (sourceUrl: string) => new Promise<Blob>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = CROP_OUTPUT_WIDTH
      canvas.height = CROP_OUTPUT_HEIGHT

      const drawWidth = cropRenderedWidth.value
      const drawHeight = cropRenderedHeight.value
      const left = CROP_VIEWPORT_WIDTH / 2 + cropOffsetX.value - drawWidth / 2
      const top = CROP_VIEWPORT_HEIGHT / 2 + cropOffsetY.value - drawHeight / 2

      const sx = ((0 - left) / drawWidth) * image.naturalWidth
      const sy = ((0 - top) / drawHeight) * image.naturalHeight
      const sWidth = (CROP_VIEWPORT_WIDTH / drawWidth) * image.naturalWidth
      const sHeight = (CROP_VIEWPORT_HEIGHT / drawHeight) * image.naturalHeight

      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas context unavailable'))
        return
      }

      context.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('Failed to generate cropped image'))
          return
        }
        resolve(blob)
      }, 'image/jpeg', 0.92)
    }
    image.onerror = () => reject(new Error('Failed to load source image'))
    image.src = sourceUrl
  })

  const confirmCrop = async () => {
    if (!cropSourceFile.value || !cropSourceUrl.value) {
      showToast('未选择封面图片', 'warning')
      return
    }

    try {
      const blob = await renderCroppedBlob(cropSourceUrl.value)
      const filenameBase = cropSourceFile.value.name.replace(/\.[^.]+$/, '') || 'cover'
      const croppedFile = new File([blob], `${filenameBase}-cropped.jpg`, { type: 'image/jpeg' })

      clearPendingCoverSelection()
      pendingCoverFile.value = croppedFile
      pendingCoverPreviewUrl.value = URL.createObjectURL(blob)
      form.coverImage = ''
      cropVisible.value = false
      clearCropSource()
      showToast('封面裁剪已应用，保存草稿时会自动上传', 'success')
    } catch {
      showToast('封面裁剪失败', 'error')
    }
  }

  const dataUrlToFile = (dataUrl: string, index: number) => {
    const [meta, payload] = dataUrl.split(',', 2)
    const match = meta?.match(/^data:(image\/[a-z0-9.+-]+);base64$/i)
    if (!match || payload == null) {
      throw new Error('Invalid embedded image data')
    }

    const mimeType = String(match[1] || '').toLowerCase()
    const binary = atob(payload.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const extension = mimeTypeToExtension(mimeType)
    return new File([bytes], `article-inline-${Date.now()}-${index}${extension}`, { type: mimeType })
  }

  const blobUrlToFile = async (blobUrl: string, index: number) => {
    const response = await fetch(blobUrl)
    if (!response.ok) {
      throw new Error('Failed to read local blob image')
    }

    const blob = await response.blob()
    const mimeType = (blob.type || '').toLowerCase()
    if (!mimeType.startsWith('image/')) {
      throw new Error('Dropped image is not supported')
    }

    const extension = mimeTypeToExtension(mimeType)
    return new File([blob], `article-inline-${Date.now()}-${index}${extension}`, { type: mimeType })
  }

  const uploadEmbeddedImagesOnSave = async (contentHtml: string) => {
    const parser = new DOMParser()
    const documentNode = parser.parseFromString(`<div>${contentHtml}</div>`, 'text/html')
    const root = documentNode.body.firstElementChild as HTMLElement | null
    if (!root) return contentHtml

    const imageNodes = Array.from(root.querySelectorAll('img[src]'))
    if (!imageNodes.length) return root.innerHTML

    const uploadedUrlMap = new Map<string, string>()
    let uploadIndex = 0

    for (const imageNode of imageNodes) {
      const src = String(imageNode.getAttribute('src') || '').trim()
      if (!isSafeDataImage(src) && !isSafeBlobImage(src)) continue

      let uploadedUrl = uploadedUrlMap.get(src)
      if (!uploadedUrl) {
        const uploadFile = isSafeDataImage(src)
          ? dataUrlToFile(src, uploadIndex)
          : await blobUrlToFile(src, uploadIndex)
        uploadIndex += 1

        if (uploadFile.size > MAX_EDITOR_IMAGE_FILE_SIZE) {
          throw new Error('正文图片不能超过 5MB')
        }

        const uploaded = await articlesStore.uploadArticleImage(uploadFile, { silent: true })
        if (!uploaded?.url) {
          throw new Error('正文图片上传失败')
        }
        uploadedUrl = uploaded.url
        uploadedUrlMap.set(src, uploadedUrl)
      }

      imageNode.setAttribute('src', uploadedUrl)
      imageNode.setAttribute('loading', 'lazy')
    }

    return root.innerHTML
  }

  const clearLocalDraftByKey = (key: string) => {
    if (!import.meta.client) return
    localStorage.removeItem(key)
  }

  const writeLocalDraft = useDebounceFn(() => {
    if (!import.meta.client || loading.value || syncingState.value) return
    const payload: LocalDraftPayload = {
      articleId: resolvedArticleId.value,
      savedAt: new Date().toISOString(),
      data: toLocalDraftSnapshot(form),
    }
    localStorage.setItem(draftStorageKey.value, JSON.stringify(payload))
    lastLocalSavedAt.value = payload.savedAt
    if (isDirty.value && !saving.value) {
      saveStatus.value = 'autosaved'
    }
  }, 800)

  const clearLocalDraft = () => {
    clearLocalDraftByKey(draftStorageKey.value)
    lastLocalSavedAt.value = null
    pendingRecovery.value = null
  }

  const hydratePersistedState = (snapshot: LocalDraftSnapshot, savedAt?: string | null) => {
    applyFormSnapshot(snapshot)
    persistedSnapshot.value = serializeSnapshot(snapshot)
    isDirty.value = false
    lastServerSavedAt.value = savedAt || null
    saveStatus.value = resolvedArticleId.value ? 'saved' : 'idle'
    nextTick(() => {
      syncEditorFromForm()
      saveSelection()
      syncingState.value = false
    })
  }

  const resolveRecoveryDraft = () => {
    if (!import.meta.client) return
    const raw = localStorage.getItem(draftStorageKey.value)
    if (!raw) return

    try {
      const localDraft = JSON.parse(raw) as LocalDraftPayload
      if (!localDraft?.data) {
        clearLocalDraftByKey(draftStorageKey.value)
        return
      }
      if (serializeSnapshot(localDraft.data) === persistedSnapshot.value) {
        clearLocalDraftByKey(draftStorageKey.value)
        return
      }
      pendingRecovery.value = localDraft
      lastLocalSavedAt.value = localDraft.savedAt
      saveStatus.value = 'autosaved'
    } catch {
      clearLocalDraftByKey(draftStorageKey.value)
    }
  }

  const restorePendingRecovery = () => {
    if (!pendingRecovery.value) return
    applyFormSnapshot(pendingRecovery.value.data)
    nextTick(() => {
      syncEditorFromForm()
      saveSelection()
      syncingState.value = false
      isDirty.value = currentSnapshot.value !== persistedSnapshot.value
      saveStatus.value = 'autosaved'
    })
    showToast('已恢复本地草稿', 'success')
    pendingRecovery.value = null
  }

  const discardPendingRecovery = () => {
    clearLocalDraft()
    pendingRecovery.value = null
    if (!saving.value) {
      saveStatus.value = resolvedArticleId.value ? 'saved' : 'idle'
    }
  }

  const goBack = async () => {
    if (isDirty.value && !window.confirm('当前修改尚未保存，确定返回文章列表吗？')) {
      return
    }
    await router.push('/articles')
  }

  const saveDraft = async () => {
    if (saving.value || isReadOnly.value) return

    const sanitizedContent = sanitizeArticleHtml(form.contentHtml)
    const plainText = extractPlainText(sanitizedContent)
    if (!form.title.trim() || !plainText) {
      showToast('标题和正文不能为空', 'warning')
      return
    }

    saving.value = true
    saveStatus.value = 'saving'
    const previousDraftKey = draftStorageKey.value

    try {
      let nextCoverImage = form.coverImage?.trim() || ''
      if (pendingCoverFile.value) {
        const uploaded = await articlesStore.uploadArticleImage(pendingCoverFile.value, { silent: true })
        if (!uploaded?.url) {
          throw new Error('封面上传失败')
        }
        nextCoverImage = uploaded.url
      }

      const contentHtmlWithUploadedImages = await uploadEmbeddedImagesOnSave(sanitizedContent)
      const payload: ArticlePayload = {
        title: form.title.trim(),
        slug: form.slug?.trim() || '',
        summary: form.summary?.trim() || '',
        coverImage: nextCoverImage,
        contentHtml: contentHtmlWithUploadedImages,
        status: form.status || 'DRAFT',
      }

      let savedArticle: AdminArticle
      if (resolvedArticleId.value) {
        savedArticle = await articlesStore.updateArticle(resolvedArticleId.value, payload, {
          silent: true,
          refreshList: false,
        })
      } else {
        savedArticle = await articlesStore.createArticle({ ...payload, status: 'DRAFT' }, {
          silent: true,
          refreshList: false,
        })
      }

      article.value = savedArticle
      resolvedArticleId.value = savedArticle.id
      form.coverImage = savedArticle.coverImage ?? payload.coverImage
      form.contentHtml = savedArticle.contentHtml ?? payload.contentHtml
      form.status = savedArticle.status
      clearPendingCoverSelection()
      clearCropSource()
      clearLocalDraftByKey(previousDraftKey)
      persistedSnapshot.value = serializeSnapshot(toLocalDraftSnapshot(form))
      isDirty.value = false
      lastServerSavedAt.value = savedArticle.updatedAt || savedArticle.createdAt || new Date().toISOString()
      saveStatus.value = 'saved'
      pendingRecovery.value = null
      showToast('草稿已保存', 'success')

      await nextTick()
      syncEditorFromForm()
      if (initialArticleId == null && savedArticle.id) {
        await router.replace(`/article-editor/${savedArticle.id}`)
      }
    } catch (error: any) {
      saveStatus.value = 'error'
      showToast(error?.message || '保存草稿失败', 'error')
    } finally {
      saving.value = false
    }
  }

  const submitForReview = async () => {
    if (!resolvedArticleId.value) {
      showToast('请先保存草稿再提交审核', 'warning')
      return
    }
    if (isDirty.value) {
      showToast('请先保存最新修改后再提交审核', 'warning')
      return
    }
    if (!canSubmitReview.value) {
      return
    }

    submittingReview.value = true
    try {
      const updated = await articlesStore.submitReview(resolvedArticleId.value)
      article.value = updated
      form.status = updated.status
      lastServerSavedAt.value = updated.updatedAt || new Date().toISOString()
      saveStatus.value = 'saved'
    } catch (error: any) {
      showToast(error?.data?.message || error?.message || '提交审核失败', 'error')
    } finally {
      submittingReview.value = false
    }
  }

  const scrollToOutlineItem = async (id: string) => {
    sidePanel.value = 'preview'
    await nextTick()
    const preview = previewRef.value
    const target = preview?.querySelector<HTMLElement>(`#${id}`)
    if (!preview || !target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const loadEditor = async () => {
    loading.value = true
    try {
      if (resolvedArticleId.value) {
        const detail = await articlesStore.fetchArticleById(resolvedArticleId.value)
        article.value = detail
        hydratePersistedState({
          title: detail.title ?? '',
          slug: detail.slug ?? '',
          summary: detail.summary ?? '',
          coverImage: detail.coverImage ?? '',
          contentHtml: detail.contentHtml ?? detail.contentMarkdown ?? '',
          status: detail.status,
        }, detail.updatedAt || detail.createdAt || null)
      } else {
        article.value = null
        hydratePersistedState(toLocalDraftSnapshot(form), null)
      }
    } catch {
      showToast('加载文章失败', 'error')
      await router.replace('/articles')
    } finally {
      loading.value = false
      resolveRecoveryDraft()
    }
  }

  const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  watch(currentSnapshot, () => {
    if (loading.value || syncingState.value) return
    isDirty.value = currentSnapshot.value !== persistedSnapshot.value
    saveStatus.value = isDirty.value ? 'dirty' : 'saved'
    writeLocalDraft()
  })

  watch(cropScale, () => {
    clampCropOffsets()
  })

  onMounted(async () => {
    window.addEventListener('beforeunload', beforeUnloadHandler)
    document.addEventListener('selectionchange', handleDocumentSelectionChange)
    await loadEditor()
  })

  onUnmounted(() => {
    window.removeEventListener('beforeunload', beforeUnloadHandler)
    document.removeEventListener('selectionchange', handleDocumentSelectionChange)
    clearCropSource()
    clearPendingCoverSelection()
  })

  onBeforeRouteLeave(() => {
    if (!isDirty.value) return true
    return window.confirm('当前修改尚未保存，确定离开编辑器吗？')
  })

  return {
    article,
    articleId: resolvedArticleId,
    loading,
    saving,
    editorRef,
    previewRef,
    inlineImageInput,
    coverFileInput,
    fontSizeOptions,
    lineHeightOptions,
    textIndentOptions,
    textColorOptions,
    fontSizePx,
    lineHeightValue,
    textIndentValue,
    textColorValue,
    sidePanel,
    sidePanelCollapsed,
    statusLabel,
    saveStatus,
    submittingReview,
    toolbarState,
    editorTitle,
    editorCaption,
    form,
    previewHtml,
    outline,
    wordCount,
    imageCount,
    paragraphCount,
    checklist,
    hasBodyContent,
    isDirty,
    isReadOnly,
    canSubmitReview,
    pendingRecovery,
    lastServerSavedAt,
    lastLocalSavedAt,
    coverPreviewSrc,
    coverDragActive,
    cropVisible,
    cropSourceUrl,
    cropScale,
    cropImageStyle,
    linkDialogVisible,
    linkUrl,
    linkText,
    formatEditorTime,
    formatEditorStatusTime,
    goBack,
    saveDraft,
    submitForReview,
    restorePendingRecovery,
    discardPendingRecovery,
    handleToolbarMouseDown,
    saveSelection,
    applyFontSize,
    applyLineHeight,
    applyTextIndent,
    applyTextColor,
    execEditorCommand,
    applyBlockStyle,
    clearFormatting,
    openInlineImageDialog,
    openLinkDialog,
    applyLink,
    removeLink,
    insertDivider,
    insertCodeBlock,
    insertInlineCode,
    insertTable,
    handleEditorInput,
    handleEditorPaste,
    handleEditorDragOver,
    handleEditorDrop,
    handleInlineImageSelected,
    openCoverFileDialog,
    handleCoverSelected,
    handleCoverDragEnter,
    handleCoverDragOver,
    handleCoverDragLeave,
    handleCoverDrop,
    startCropDrag,
    handleCropDragMove,
    endCropDrag,
    resetCropTransform,
    cancelCrop,
    confirmCrop,
    scrollToOutlineItem,
  }
}
