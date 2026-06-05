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
