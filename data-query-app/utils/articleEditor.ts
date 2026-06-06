export interface ArticleOutlineItem {
  id: string
  text: string
  level: number
}

export interface ArticlePresentation {
  html: string
  plainText: string
  outline: ArticleOutlineItem[]
  wordCount: number
  imageCount: number
  paragraphCount: number
}

const allowedTags = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'span', 'div',
])

const allowedAttrs: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'loading', 'decoding', 'aria-hidden']),
  p: new Set(['style']),
  h1: new Set(['style']),
  h2: new Set(['style']),
  h3: new Set(['style']),
  h4: new Set(['style']),
  h5: new Set(['style']),
  h6: new Set(['style']),
  span: new Set(['style', 'class', 'aria-hidden', 'contenteditable', 'data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label', 'data-tp-ref-image', 'data-tp-ref-display']),
  div: new Set(['style']),
  pre: new Set(['style']),
  code: new Set(['style']),
  ul: new Set(['style']),
  ol: new Set(['style']),
  li: new Set(['style']),
  blockquote: new Set(['style']),
}

const contentReferenceDataAttrs = new Set([
  'data-tp-ref-type',
  'data-tp-ref-id',
  'data-tp-ref-label',
  'data-tp-ref-image',
  'data-tp-ref-display',
])

export const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export const encodeAttributeValue = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const stripTags = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const hasDomParser = () => typeof DOMParser !== 'undefined'

const isSafeUrl = (value: string) => {
  const next = value.trim().replace(/&amp;/g, '&')
  return /^https?:\/\//i.test(next)
    || /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(next)
    || /^blob:/i.test(next)
    || next.startsWith('/terrapedia-images/')
    || next.startsWith('/preview-assets/terrapedia-images/')
}

const isSafeContentReferenceImageUrl = (value: string) => {
  const next = value.trim().replace(/&amp;/g, '&')
  return /^https?:\/\//i.test(next)
    || /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(next)
    || next.startsWith('/terrapedia-images/')
    || next.startsWith('/preview-assets/terrapedia-images/')
}

const sanitizeInlineStyle = (styleText: string) => {
  const styleMap = styleText
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
  const allowed: string[] = []

  for (const item of styleMap) {
    const dividerIndex = item.indexOf(':')
    if (dividerIndex <= 0) continue
    const property = item.slice(0, dividerIndex).trim().toLowerCase()
    const value = item.slice(dividerIndex + 1).trim()
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
      continue
    }
    if (property === 'line-height' && /^(\d+(\.\d+)?|[1-9]\d?px)$/.test(value)) {
      allowed.push(`line-height:${value}`)
      continue
    }
    if (property === 'text-indent' && /^(0|[1-9]\d*(\.\d+)?(px|em|rem))$/.test(value)) {
      allowed.push(`text-indent:${value}`)
      continue
    }
    if ((property === 'color' || property === 'background-color') && /^(#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|[a-z]+)$/i.test(value)) {
      allowed.push(`${property}:${value}`)
    }
  }

  return allowed.join(';')
}

const createRichRoot = (source: string) => {
  if (!hasDomParser()) return null
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(`<div>${source}</div>`, 'text/html')
  return documentNode.body.firstElementChild as HTMLElement | null
}

const normalizeReferenceDisplayMode = (value: string | null) => {
  const next = (value || 'image').trim().toLowerCase()
  return next === 'text' ? 'text' : 'image'
}

const stripContentReferenceAttributes = (element: Element) => {
  element.removeAttribute('class')
  element.removeAttribute('contenteditable')
  for (const attribute of Array.from(element.attributes)) {
    const attrName = attribute.name.toLowerCase()
    if (attrName.startsWith('data-tp-ref-')) {
      element.removeAttribute(attribute.name)
    }
  }
}

const normalizeContentReferenceElement = (element: Element) => {
  const classes = (element.getAttribute('class') || '').split(/\s+/).filter(Boolean)
  if (!classes.includes('tp-content-ref')) return false

  const type = (element.getAttribute('data-tp-ref-type') || '').trim().toLowerCase()
  const id = (element.getAttribute('data-tp-ref-id') || '').trim()
  const label = (element.getAttribute('data-tp-ref-label') || '').replace(/\s+/g, ' ').trim()
  const rawImage = (element.getAttribute('data-tp-ref-image') || '').trim()
  const image = rawImage && isSafeContentReferenceImageUrl(rawImage) ? rawImage.replace(/&amp;/g, '&') : ''
  const displayMode = normalizeReferenceDisplayMode(element.getAttribute('data-tp-ref-display'))
  const styleValue = element.getAttribute('style')
  const style = styleValue ? sanitizeInlineStyle(styleValue) : ''
  const hasUnexpectedDataAttr = Array.from(element.attributes).some(attribute => {
    const attrName = attribute.name.toLowerCase()
    return attrName.startsWith('data-tp-') && !contentReferenceDataAttrs.has(attrName)
  })
  const isValid = ['item', 'npc'].includes(type)
    && /^\d{1,12}$/.test(id)
    && label.length > 0
    && label.length <= 80
    && (!rawImage || Boolean(image))
    && !hasUnexpectedDataAttr

  if (!isValid) {
    stripContentReferenceAttributes(element)
    return false
  }

  element.setAttribute('class', 'tp-content-ref')
  element.setAttribute('data-tp-ref-type', type)
  element.setAttribute('data-tp-ref-id', id)
  element.setAttribute('data-tp-ref-label', label)
  element.setAttribute('data-tp-ref-display', displayMode)
  element.setAttribute('contenteditable', 'false')
  if (image) {
    element.setAttribute('data-tp-ref-image', image)
  } else {
    element.removeAttribute('data-tp-ref-image')
  }
  if (style) {
    element.setAttribute('style', style)
  } else {
    element.removeAttribute('style')
  }
  element.removeAttribute('aria-hidden')

  while (element.firstChild) {
    element.removeChild(element.firstChild)
  }

  if (displayMode === 'text') {
    element.appendChild(element.ownerDocument.createTextNode(label))
    return true
  }

  if (image) {
    const imageNode = element.ownerDocument.createElement('img')
    imageNode.setAttribute('src', image)
    imageNode.setAttribute('alt', '')
    imageNode.setAttribute('loading', 'lazy')
    imageNode.setAttribute('decoding', 'async')
    imageNode.setAttribute('aria-hidden', 'true')
    element.appendChild(imageNode)
    return true
  }

  const fallback = element.ownerDocument.createElement('span')
  fallback.setAttribute('class', 'tp-content-ref-fallback')
  fallback.setAttribute('aria-hidden', 'true')
  fallback.textContent = '图'
  element.appendChild(fallback)
  return true
}

const normalizeSpanClass = (element: Element) => {
  const classes = (element.getAttribute('class') || '').split(/\s+/).filter(Boolean)
  if (!classes.length) return
  if (classes.includes('tp-content-ref')) {
    normalizeContentReferenceElement(element)
    return
  }
  if (classes.includes('tp-content-ref-fallback')) {
    element.setAttribute('class', 'tp-content-ref-fallback')
    element.removeAttribute('contenteditable')
    return
  }
  element.removeAttribute('class')
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

    if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attrValue)) {
      element.removeAttribute(attribute.name)
      continue
    }

    if (attrName === 'style') {
      const sanitizedStyle = sanitizeInlineStyle(attrValue)
      if (sanitizedStyle) {
        element.setAttribute('style', sanitizedStyle)
      } else {
        element.removeAttribute('style')
      }
    }
  }

  if (tagName === 'a') {
    const href = element.getAttribute('href')
    if (!href) {
      element.removeAttribute('target')
      element.removeAttribute('rel')
    } else {
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }

  if (tagName === 'img') {
    element.setAttribute('loading', 'lazy')
    element.setAttribute('decoding', 'async')
    if (!element.getAttribute('alt')) {
      element.setAttribute('alt', '')
    }
  }

  if (tagName === 'span') {
    normalizeSpanClass(element)
    const isReference = (element.getAttribute('class') || '').split(/\s+/).includes('tp-content-ref')
    const isReferenceFallback = (element.getAttribute('class') || '').split(/\s+/).includes('tp-content-ref-fallback')
    if (!isReference && !isReferenceFallback) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.toLowerCase().startsWith('data-tp-ref-')) {
          element.removeAttribute(attribute.name)
        }
      }
      element.removeAttribute('aria-hidden')
      element.removeAttribute('contenteditable')
    }
  }
}

const walkRichTree = (node: Node) => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    sanitizeElement(node as Element)
  }

  const children = Array.from(node.childNodes)
  for (const child of children) {
    walkRichTree(child)
  }
}

export const sanitizeArticleHtml = (raw: string) => {
  const source = (raw || '').trim()
  if (!source) return ''

  const root = createRichRoot(source)
  if (!root) {
    return source
  }

  walkRichTree(root)
  return root.innerHTML
}

export const extractPlainText = (html: string) => {
  const source = (html || '').trim()
  if (!source) return ''

  const root = createRichRoot(source)
  if (!root) {
    return stripTags(source)
  }

  return (root.textContent || '').replace(/\s+/g, ' ').trim()
}

export const countArticleWords = (plainText: string) => {
  if (!plainText) return 0
  const cjkCount = (plainText.match(/[\u3400-\u9fff]/g) || []).length
  const latinCount = (plainText
    .replace(/[\u3400-\u9fff]/g, ' ')
    .match(/[A-Za-z0-9]+/g) || []).length
  return cjkCount + latinCount
}

export const buildArticlePresentation = (raw: string): ArticlePresentation => {
  const html = sanitizeArticleHtml(raw)
  const fallbackPlainText = extractPlainText(html)

  const root = createRichRoot(html)
  if (!root) {
    return {
      html,
      plainText: fallbackPlainText,
      outline: [],
      wordCount: countArticleWords(fallbackPlainText),
      imageCount: 0,
      paragraphCount: 0,
    }
  }

  const outline: ArticleOutlineItem[] = []
  const headingNodes = Array.from(root.querySelectorAll('h1, h2, h3'))
  headingNodes.forEach((heading, index) => {
    const text = (heading.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) return
    const level = Number(heading.tagName.slice(1))
    const id = `article-outline-${index + 1}`
    heading.setAttribute('id', id)
    heading.setAttribute('data-outline-id', id)
    outline.push({ id, text, level })
  })

  const plainText = (root.textContent || '').replace(/\s+/g, ' ').trim()
  const imageCount = root.querySelectorAll('img').length
  const paragraphCount = root.querySelectorAll('p, li, blockquote').length

  return {
    html: root.innerHTML,
    plainText,
    outline,
    wordCount: countArticleWords(plainText),
    imageCount,
    paragraphCount,
  }
}

export const sanitizeImageAlt = (value: string) => value.replace(/["<>]/g, '').trim() || 'article-image'

export const isSafeDataImage = (value: string) => /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(value.trim())

export const isSafeBlobImage = (value: string) => /^blob:/i.test(value.trim())

export const mimeTypeToExtension = (mimeType: string) => {
  const normalized = mimeType.toLowerCase()
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/svg+xml') return '.svg'
  return ''
}
