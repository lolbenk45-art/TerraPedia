<template>
  <section class="copywriting-page">
    <header class="hero">
      <p class="hero__eyebrow">Copywriting Studio</p>
      <h1>Write, Format, Preview</h1>
      <p>
        Draft your article copy directly in the browser. You can adjust font size and emphasis, then review the
        sanitized preview before publishing elsewhere.
      </p>
    </header>

    <div class="layout">
      <section class="editor-card">
        <div class="toolbar">
          <label class="toolbar__group">
            <span>Font size</span>
            <select :value="fontSizePx" @change="applyFontSize">
              <option v-for="size in fontSizeOptions" :key="size" :value="size">{{ size }}px</option>
            </select>
          </label>

          <button type="button" @click="execEditorCommand('bold')"><strong>B</strong></button>
          <button type="button" @click="execEditorCommand('italic')"><em>I</em></button>
          <button type="button" @click="execEditorCommand('underline')"><u>U</u></button>
          <button type="button" @click="execEditorCommand('insertUnorderedList')">• List</button>
          <button type="button" @click="execEditorCommand('insertOrderedList')">1. List</button>
          <button type="button" @click="clearFormatting">Clear</button>
        </div>

        <div class="editor-wrap">
          <div
            ref="editorRef"
            class="editor"
            contenteditable="true"
            role="textbox"
            aria-label="Copywriting editor"
            data-placeholder="Start writing your copy here..."
            @input="syncFromEditor"
            @paste="handleEditorPaste"
            @keyup="saveSelection"
            @mouseup="saveSelection"
            @blur="saveSelection"
          />
        </div>

        <div class="editor-actions">
          <div class="meta">
            <span>{{ characterCount }} chars</span>
            <span>{{ plainTextCount }} text chars</span>
          </div>
          <div class="buttons">
            <button type="button" @click="saveDraft">Save draft</button>
            <button type="button" @click="loadDraft">Load draft</button>
            <button type="button" class="danger" @click="resetDraft">Reset</button>
          </div>
        </div>

        <p v-if="statusMessage" class="status">{{ statusMessage }}</p>
      </section>

      <aside class="preview-card">
        <h2>Live Preview</h2>
        <div class="preview-content" v-html="previewHtml" />
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const STORAGE_KEY = 'terrapedia.copywriting.studio.draft.v1'
const defaultDraft = '<p>Start with a headline and one clear value statement.</p>'
const fontSizeOptions = [12, 14, 16, 18, 20, 24, 28, 32]

const editorRef = ref<HTMLElement | null>(null)
const draftHtml = ref(defaultDraft)
const fontSizePx = ref(16)
const statusMessage = ref('')
const selectionRange = ref<Range | null>(null)

const previewHtml = computed(() => sanitizeRichHtml(draftHtml.value))
const characterCount = computed(() => draftHtml.value.length)
const plainTextCount = computed(() => extractPlainText(draftHtml.value).length)

const setStatus = (message: string) => {
  statusMessage.value = message
  window.setTimeout(() => {
    if (statusMessage.value === message) {
      statusMessage.value = ''
    }
  }, 2200)
}

const extractPlainText = (raw: string) => {
  if (typeof window === 'undefined') return raw.replace(/<[^>]+>/g, '').trim()
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${raw || ''}</div>`, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

const isSafeDataImage = (value: string) => /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)

const normalizeUrl = (rawUrl: string) => {
  const value = rawUrl.replace(/&amp;/g, '&').trim()
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  if (isSafeDataImage(value)) {
    return value
  }
  return ''
}

const sanitizeInlineStyle = (styleText: string) => {
  const declarations = styleText
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
  const allowed: string[] = []

  for (const declaration of declarations) {
    const splitIndex = declaration.indexOf(':')
    if (splitIndex <= 0) continue
    const property = declaration.slice(0, splitIndex).trim().toLowerCase()
    const value = declaration.slice(splitIndex + 1).trim()
    if (!value) continue

    if (property === 'font-size' && /^([1-9]\d?|1\d\d)px$/.test(value)) {
      allowed.push(`font-size:${value}`)
      continue
    }
    if (property === 'font-weight' && /^(normal|bold|[1-9]00)$/.test(value)) {
      allowed.push(`font-weight:${value}`)
      continue
    }
    if (property === 'font-style' && /^(normal|italic)$/.test(value)) {
      allowed.push(`font-style:${value}`)
      continue
    }
    if (property === 'text-decoration' && /^(none|underline|line-through)$/.test(value)) {
      allowed.push(`text-decoration:${value}`)
      continue
    }
    if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) {
      allowed.push(`text-align:${value}`)
    }
  }

  return allowed.join(';')
}

const sanitizeRichHtml = (raw: string) => {
  const source = (raw || '').trim()
  if (!source) return '<p>No content.</p>'
  if (typeof window === 'undefined') return source.replace(/[<>&"]/g, '')

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${source}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return '<p>No content.</p>'

  const allowedTags = new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4',
    'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'img', 'span', 'div',
  ])

  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(['href', 'target', 'rel']),
    img: new Set(['src', 'alt', 'loading']),
    p: new Set(['style']),
    h1: new Set(['style']),
    h2: new Set(['style']),
    h3: new Set(['style']),
    h4: new Set(['style']),
    span: new Set(['style']),
    div: new Set(['style']),
    ul: new Set(['style']),
    ol: new Set(['style']),
    li: new Set(['style']),
    blockquote: new Set(['style']),
    pre: new Set(['style']),
    code: new Set(['style']),
  }

  const sanitizeElement = (element: Element) => {
    const tagName = element.tagName.toLowerCase()
    if (!allowedTags.has(tagName)) {
      const parent = element.parentNode
      if (!parent) return
      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element)
      }
      parent.removeChild(element)
      return
    }

    for (const attribute of Array.from(element.attributes)) {
      const attrName = attribute.name.toLowerCase()
      const attrValue = attribute.value
      if (attrName.startsWith('on')) {
        element.removeAttribute(attribute.name)
        continue
      }

      const tagAllowed = allowedAttrs[tagName]
      if (!tagAllowed || !tagAllowed.has(attrName)) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (attrName === 'href') {
        const safeUrl = normalizeUrl(attrValue)
        if (!safeUrl) {
          element.removeAttribute(attribute.name)
        } else {
          element.setAttribute('href', safeUrl)
          element.setAttribute('target', '_blank')
          element.setAttribute('rel', 'noopener noreferrer')
        }
        continue
      }

      if (attrName === 'src') {
        const safeUrl = normalizeUrl(attrValue)
        if (!safeUrl) {
          element.removeAttribute(attribute.name)
        } else {
          element.setAttribute('src', safeUrl)
        }
        continue
      }

      if (attrName === 'style') {
        const safeStyle = sanitizeInlineStyle(attrValue)
        if (safeStyle) {
          element.setAttribute('style', safeStyle)
        } else {
          element.removeAttribute('style')
        }
      }
    }

    if (tagName === 'img') {
      const src = element.getAttribute('src')
      if (!src || !normalizeUrl(src)) {
        element.remove()
        return
      }
      if (!element.getAttribute('alt')) {
        element.setAttribute('alt', 'pasted-image')
      }
      element.setAttribute('loading', 'lazy')
    }
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(node as Element)
    }
    const children = Array.from(node.childNodes)
    for (const child of children) {
      walk(child)
    }
  }

  walk(root)
  return root.innerHTML || '<p>No content.</p>'
}

const saveSelection = () => {
  if (typeof window === 'undefined') return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  selectionRange.value = selection.getRangeAt(0).cloneRange()
}

const restoreSelection = () => {
  if (typeof window === 'undefined' || !selectionRange.value) return
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(selectionRange.value)
}

const syncFromEditor = () => {
  const editor = editorRef.value
  if (!editor) return
  draftHtml.value = editor.innerHTML
}

const insertHtmlAtCaret = (html: string) => {
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  document.execCommand('insertHTML', false, html)
  syncFromEditor()
  saveSelection()
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read pasted image'))
    reader.readAsDataURL(file)
  })
}

const handleEditorPaste = async (event: ClipboardEvent) => {
  const items = Array.from(event.clipboardData?.items || [])
  const imageFiles = items
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (!imageFiles.length) {
    return
  }

  event.preventDefault()

  for (const file of imageFiles) {
    try {
      const dataUrl = await fileToDataUrl(file)
      if (!isSafeDataImage(dataUrl)) continue
      const safeAlt = file.name ? file.name.replace(/["<>]/g, '') : 'pasted-image'
      insertHtmlAtCaret(`<p><img src="${dataUrl}" alt="${safeAlt}" loading="lazy" /></p>`)
    } catch {
      // Continue with next image file, keeping editor usable.
    }
  }
}

const execEditorCommand = (command: string, value?: string) => {
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  document.execCommand(command, false, value)
  syncFromEditor()
  saveSelection()
}

const applyFontSize = (event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value)
  fontSizePx.value = value
  execEditorCommand('fontSize', '7')
  const editor = editorRef.value
  if (!editor) return
  editor.querySelectorAll('font[size="7"]').forEach(node => {
    const span = document.createElement('span')
    span.style.fontSize = `${value}px`
    span.innerHTML = node.innerHTML
    node.parentNode?.replaceChild(span, node)
  })
  syncFromEditor()
}

const clearFormatting = () => {
  execEditorCommand('removeFormat')
  execEditorCommand('unlink')
}

const saveDraft = () => {
  const sanitized = sanitizeRichHtml(draftHtml.value)
  localStorage.setItem(STORAGE_KEY, sanitized)
  draftHtml.value = sanitized
  if (editorRef.value) {
    editorRef.value.innerHTML = sanitized
  }
  setStatus('Draft saved locally.')
}

const loadDraft = () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    setStatus('No local draft found.')
    return
  }
  const sanitized = sanitizeRichHtml(stored)
  draftHtml.value = sanitized
  if (editorRef.value) {
    editorRef.value.innerHTML = sanitized
  }
  setStatus('Draft loaded.')
}

const resetDraft = () => {
  localStorage.removeItem(STORAGE_KEY)
  draftHtml.value = defaultDraft
  if (editorRef.value) {
    editorRef.value.innerHTML = defaultDraft
  }
  setStatus('Draft reset.')
}

onMounted(() => {
  const initial = sanitizeRichHtml(localStorage.getItem(STORAGE_KEY) || defaultDraft)
  draftHtml.value = initial
  if (editorRef.value) {
    editorRef.value.innerHTML = initial
  }
})
</script>

<style scoped>
.copywriting-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 20px 40px;
  color: var(--text-primary);
}

.hero {
  margin-bottom: 18px;
}

.hero__eyebrow {
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-primary);
  margin-bottom: 6px;
}

.hero h1 {
  font-size: clamp(1.7rem, 2.8vw, 2.4rem);
  line-height: 1.2;
  margin-bottom: 8px;
}

.hero p {
  color: var(--text-secondary);
  max-width: 72ch;
}

.layout {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 16px;
}

.editor-card,
.preview-card {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding: 12px;
}

.toolbar__group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
  margin-right: 2px;
  border-right: 1px dashed var(--border-color);
}

.toolbar__group span {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.toolbar select,
.toolbar button {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 7px 10px;
  font-size: 0.86rem;
  cursor: pointer;
}

.toolbar button:hover,
.toolbar select:hover {
  border-color: var(--accent-primary);
}

.editor-wrap {
  padding: 12px;
}

.editor {
  min-height: 360px;
  padding: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  line-height: 1.6;
  outline: none;
}

.editor:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent);
}

.editor[contenteditable='true']:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
}

.editor-actions {
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
}

.meta {
  display: inline-flex;
  gap: 10px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.buttons {
  display: inline-flex;
  gap: 8px;
}

.buttons button {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 7px 12px;
  cursor: pointer;
}

.buttons .danger {
  border-color: color-mix(in srgb, var(--accent-error) 45%, var(--border-color));
  color: var(--accent-error);
}

.status {
  border-top: 1px dashed var(--border-color);
  margin: 0;
  padding: 10px 12px 12px;
  color: var(--accent-success);
  font-size: 0.86rem;
}

.preview-card {
  padding: 14px;
}

.preview-card h2 {
  font-size: 1rem;
  margin-bottom: 10px;
}

.preview-content {
  min-height: 440px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-primary);
  padding: 16px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.preview-content :deep(p) {
  margin: 0 0 0.8rem;
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
  margin: 0 0 0.8rem 1.2rem;
}

.preview-content :deep(h1),
.preview-content :deep(h2),
.preview-content :deep(h3),
.preview-content :deep(h4) {
  margin: 0.2rem 0 0.8rem;
  line-height: 1.3;
}

.preview-content :deep(blockquote) {
  margin: 0 0 0.8rem;
  padding: 0.4rem 0.8rem;
  border-left: 3px solid var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
}

.preview-content :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  margin: 0.4rem 0 0.9rem;
}

@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .preview-content {
    min-height: 260px;
  }
}

@media (max-width: 640px) {
  .copywriting-page {
    padding: 20px 14px 28px;
  }

  .editor {
    min-height: 280px;
  }

  .editor-actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
