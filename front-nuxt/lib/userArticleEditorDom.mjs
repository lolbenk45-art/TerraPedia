export const USER_ARTICLE_EDITOR_PLACEHOLDER = '\u200b'

export const sanitizeUserArticleEditorColor = (value, fallback = '#f5e6b8') => {
  const next = String(value || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(next)) return next.toLowerCase()
  return fallback
}

export const buildUserArticleInlineStyle = ({ fontSizePx, textColor }) => {
  const declarations = []
  const nextFontSize = Number(fontSizePx)
  if (Number.isFinite(nextFontSize) && nextFontSize > 0) {
    declarations.push(`font-size:${nextFontSize}px`)
  }
  const nextColor = sanitizeUserArticleEditorColor(textColor, '')
  if (nextColor) {
    declarations.push(`color:${nextColor}`)
  }
  return declarations.join(';')
}

export const buildUserArticleTypingSpanHtml = (styleText) => {
  const style = String(styleText || '').trim()
  return style
    ? `<span style="${style}">${USER_ARTICLE_EDITOR_PLACEHOLDER}</span>`
    : USER_ARTICLE_EDITOR_PLACEHOLDER
}

export const unwrapUserArticleTypingPlaceholders = (html) => {
  return String(html || '').replaceAll(USER_ARTICLE_EDITOR_PLACEHOLDER, '')
}

export const normalizeUserArticleLinkHref = (value) => {
  const raw = String(value || '').trim().replace(/&amp;/g, '&')
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('/') || raw.startsWith('#')) {
    return raw
  }
  if (/^[^\s/]+\.[^\s]+(?:\/.*)?$/i.test(raw)) {
    return `https://${raw}`
  }
  return raw
}

export const isSafeUserArticleLinkHref = (value) => {
  const normalized = normalizeUserArticleLinkHref(value)
  if (!normalized) return false
  const lower = normalized.toLowerCase()
  if (lower.startsWith('file:') || lower.startsWith('blob:') || lower.startsWith('javascript:')) return false
  return /^(https?:|mailto:|tel:|\/|#)/i.test(normalized) && !normalized.startsWith('//')
}

export const buildUserArticleLinkHtml = ({ href, title }) => {
  const normalizedHref = normalizeUserArticleLinkHref(href)
  const text = String(title || '').trim() || normalizedHref
  if (!text || !isSafeUserArticleLinkHref(normalizedHref) || !globalThis.document) return ''
  const anchor = globalThis.document.createElement('a')
  anchor.setAttribute('href', normalizedHref)
  anchor.setAttribute('title', text)
  anchor.setAttribute('rel', 'noopener noreferrer')
  anchor.setAttribute('target', '_blank')
  anchor.textContent = text
  return anchor.outerHTML
}

export const normalizeUserArticleReferenceImage = (value) => {
  const imageUrl = String(value || '').trim()
  if (!imageUrl) return ''
  if (imageUrl.startsWith('/preview-assets/') || imageUrl.startsWith('/terrapedia-images/') || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageUrl)) return imageUrl
  return ''
}

export const normalizeUserArticleReferenceDisplayMode = (value) => {
  const mode = String(value || '').trim().toLowerCase()
  return mode === 'text' ? 'text' : mode === 'image' || !mode ? 'image' : ''
}

export const isSafeUserArticleReferenceElement = ({ type, id, label, imageUrl, displayMode }) => {
  const nextType = String(type || '').trim().toLowerCase()
  const nextId = String(id || '').trim()
  const nextLabel = String(label || '').trim()
  const nextImageUrl = normalizeUserArticleReferenceImage(imageUrl)
  const nextDisplayMode = normalizeUserArticleReferenceDisplayMode(displayMode)
  return ['item', 'npc'].includes(nextType)
    && /^\d{1,12}$/.test(nextId)
    && nextLabel.length > 0
    && nextLabel.length <= 80
    && (!imageUrl || Boolean(nextImageUrl))
    && Boolean(nextDisplayMode)
}

const escapeUserArticleReferenceAttribute = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeUserArticleReferenceText = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export const buildUserArticleReferenceHtml = ({ type, id, label, imageUrl, displayMode }) => {
  const nextType = String(type || '').trim().toLowerCase()
  const nextId = String(id || '').trim()
  const nextLabel = String(label || '').trim()
  const nextImageUrl = normalizeUserArticleReferenceImage(imageUrl)
  const nextDisplayMode = normalizeUserArticleReferenceDisplayMode(displayMode)
  if (!isSafeUserArticleReferenceElement({ type: nextType, id: nextId, label: nextLabel, imageUrl: nextImageUrl, displayMode: nextDisplayMode })) return ''
  const imageAttribute = nextImageUrl ? ` data-tp-ref-image="${escapeUserArticleReferenceAttribute(nextImageUrl)}"` : ''
  const displayAttribute = ` data-tp-ref-display="${escapeUserArticleReferenceAttribute(nextDisplayMode)}"`
  const innerHtml = nextDisplayMode === 'text'
    ? escapeUserArticleReferenceText(nextLabel)
    : nextImageUrl
      ? `<img src="${escapeUserArticleReferenceAttribute(nextImageUrl)}" alt="" loading="lazy" decoding="async" aria-hidden="true">`
      : '<span class="tp-content-ref-fallback" aria-hidden="true">图</span>'
  if (!globalThis.document) {
    return `<span class="tp-content-ref" contenteditable="false" draggable="true" data-tp-ref-type="${escapeUserArticleReferenceAttribute(nextType)}" data-tp-ref-id="${escapeUserArticleReferenceAttribute(nextId)}" data-tp-ref-label="${escapeUserArticleReferenceAttribute(nextLabel)}"${imageAttribute}${displayAttribute}>${innerHtml}</span>`
  }
  const span = globalThis.document.createElement('span')
  span.className = 'tp-content-ref'
  span.contentEditable = 'false'
  span.draggable = true
  span.setAttribute('data-tp-ref-type', nextType)
  span.setAttribute('data-tp-ref-id', nextId)
  span.setAttribute('data-tp-ref-label', nextLabel)
  if (nextImageUrl) span.setAttribute('data-tp-ref-image', nextImageUrl)
  span.setAttribute('data-tp-ref-display', nextDisplayMode)
  if (nextDisplayMode === 'text') {
    span.textContent = nextLabel
  } else if (nextImageUrl) {
    const img = globalThis.document.createElement('img')
    img.src = nextImageUrl
    img.alt = ''
    img.loading = 'lazy'
    img.decoding = 'async'
    img.setAttribute('aria-hidden', 'true')
    span.replaceChildren(img)
  } else {
    const fallback = globalThis.document.createElement('span')
    fallback.className = 'tp-content-ref-fallback'
    fallback.textContent = '图'
    fallback.setAttribute('aria-hidden', 'true')
    span.replaceChildren(fallback)
  }
  return span.outerHTML
}

const USER_ARTICLE_INLINE_STYLE_TARGETS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'li',
  'figcaption',
  'span',
  'a',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'code',
].join(',')

const rangeIntersectsElement = (range, element) => {
  try {
    return range.intersectsNode(element)
  } catch {
    return false
  }
}

const setUserArticleInlineStyleOnElement = (element, { fontSizePx, textColor }) => {
  if (!element || !element.style) return
  const nextPx = Number(fontSizePx)
  if (Number.isFinite(nextPx) && nextPx > 0) {
    element.style.fontSize = `${nextPx}px`
  }
  const nextColor = sanitizeUserArticleEditorColor(textColor, '')
  if (nextColor) {
    element.style.color = nextColor
  }
}

export const applyUserArticleStyleToReference = (element, options) => {
  setUserArticleInlineStyleOnElement(element, options)
  if (element?.dataset?.tpRefDisplay !== 'text') {
    element.style.lineHeight = '1'
  }
}

export const applyUserArticleInlineStyleToRange = ({ editor, range, fontSizePx, textColor }) => {
  if (!editor || !range || range.collapsed) return false
  const references = new Set()

  for (const element of Array.from(editor.querySelectorAll(USER_ARTICLE_INLINE_STYLE_TARGETS))) {
    if (!rangeIntersectsElement(range, element)) continue
    if (element.classList?.contains('tp-content-ref')) {
      references.add(element)
      continue
    }
    if (element.closest?.('.tp-content-ref')) continue
    setUserArticleInlineStyleOnElement(element, { fontSizePx, textColor })
  }

  for (const reference of Array.from(editor.querySelectorAll('.tp-content-ref'))) {
    if (rangeIntersectsElement(range, reference)) references.add(reference)
  }

  for (const reference of references) {
    applyUserArticleStyleToReference(reference, { fontSizePx, textColor })
  }

  return true
}

export const sanitizeUserArticleEditorLoadedHtml = (html) => {
  const source = String(html || '').trim()
  if (!globalThis.document || !source) return source
  const root = globalThis.document.createElement('div')
  root.innerHTML = source

  for (const element of Array.from(root.querySelectorAll('.tp-content-ref'))) {
    const safeHtml = buildUserArticleReferenceHtml({
      type: element.getAttribute('data-tp-ref-type'),
      id: element.getAttribute('data-tp-ref-id'),
      label: element.getAttribute('data-tp-ref-label'),
      imageUrl: element.getAttribute('data-tp-ref-image'),
      displayMode: element.getAttribute('data-tp-ref-display') || 'image',
    })
    if (safeHtml) {
      const template = globalThis.document.createElement('template')
      template.innerHTML = safeHtml
      const safeElement = template.content.firstElementChild
      if (safeElement) element.replaceWith(safeElement)
      continue
    }
    element.classList.remove('tp-content-ref')
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('data-tp-')) element.removeAttribute(attribute.name)
    }
  }

  return root.innerHTML.trim()
}

export const sanitizeUserArticlePastedHtml = (html) => {
  if (!globalThis.document) return ''
  const root = globalThis.document.createElement('div')
  root.innerHTML = String(html || '')

  for (const link of Array.from(root.querySelectorAll('a'))) {
    const href = link.getAttribute('href') || ''
    const title = normalizeUserArticleLinkHref(href)
    const safeHtml = buildUserArticleLinkHtml({ href, title })
    if (!safeHtml) {
      link.replaceWith(globalThis.document.createTextNode((link.textContent || link.getAttribute('title') || href).trim()))
      continue
    }
    const template = globalThis.document.createElement('template')
    template.innerHTML = safeHtml
    const safeLink = template.content.firstElementChild
    if (safeLink) link.replaceWith(safeLink)
  }

  for (const element of Array.from(root.querySelectorAll('*'))) {
    const tagName = element.tagName.toLowerCase()
    if (!['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'span', 'div'].includes(tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      if (tagName === 'a' && ['href', 'title', 'rel', 'target'].includes(attribute.name.toLowerCase())) continue
      element.removeAttribute(attribute.name)
    }
  }

  return root.innerHTML.trim()
}

export const setUserArticleBlockTag = (html, tagName) => {
  const tag = String(tagName || 'p').toLowerCase()
  if (!['p', 'h2', 'h3', 'blockquote'].includes(tag)) return html
  const source = String(html || '').trim() || '<p><br></p>'
  const match = source.match(/^<(p|h2|h3|blockquote)(\s[^>]*)?>([\s\S]*)<\/\1>$/i)
  const content = match ? match[3] : source
  return `<${tag}>${content}</${tag}>`
}

export const setUserArticleOrderedList = (html) => {
  const source = String(html || '').trim()
  const text = source
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?(p|h2|h3|blockquote|div|span)[^>]*>/gi, '')
    .trim()
  return `<ol><li>${text || '<br>'}</li></ol>`
}

export const setUserArticleUnorderedList = (html) => {
  const source = String(html || '').trim()
  const text = source
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?(p|h2|h3|blockquote|div|span)[^>]*>/gi, '')
    .trim()
  return `<ul><li>${text || '<br>'}</li></ul>`
}
