<script setup lang="ts">
definePageMeta({ publicScreenClass: 'article-screen' })

import DOMPurify from 'dompurify'
import type { ApiResponse, ContentReferenceResolveInput, NormalizedContentReference, PublicItemRecipeTree, PublicItemRecipeTreeNode, PublicItemRecipeTreeVariant, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { renderRecipeHierarchyGraph } from '~/utils/recipeHierarchyGraphRenderer'
import { buildCraftingRecipeModel } from '~/composables/useCraftingRecipeModel'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'
import { contentReferenceKey, resolvePublicContentReferences } from '~/composables/usePublicContentReferences'
import { fetchPublicRecipeTree } from '~/composables/usePublicRecipeTree'

const route = useRoute()
const authStore = useUserAuthStore()
const favoritesStore = useUserFavoritesStore()
const historyStore = useUserHistoryStore()
const favoriteError = ref('')
const articleClientReady = ref(false)
const initialArticleFavorite = ref<{ id: string, favorite: boolean } | null>(null)
const articleContentRef = ref<HTMLElement | null>(null)
const articleReferences = ref<Record<string, NormalizedContentReference>>({})
const articleReferenceError = ref('')
const articleReferenceLabels = ref<Record<string, string>>({})
const ARTICLE_REFERENCE_PREVIEW_ID = 'article-reference-preview'
const ARTICLE_REFERENCE_PREVIEW_WIDTH = 280
const ARTICLE_REFERENCE_PREVIEW_HEIGHT = 148
const ARTICLE_REFERENCE_PREVIEW_MARGIN = 12
const articleReferencePreview = ref<{
  key: string
  label: string
  type: 'item' | 'npc' | 'boss'
  typeLabel: string
  id: string
  imageUrl: string
  categoryName: string
  summary: string
  internalName: string
  detailPath: string
  available: boolean
  x: number
  y: number
  placement: 'right' | 'left' | 'bottom'
} | null>(null)
let articleReferenceLoadSequence = 0
let articleRecipeTreeLoadSequence = 0
const recordedArticleHistoryIds = new Set<string>()

const slug = computed(() => String(route.params.slug ?? '').trim())
const articlePath = computed(() => `/articles/slug/${encodeURIComponent(slug.value)}`)

const { data: articleResponse, pending: articlePending, error: articleError } = await useAsyncData(
  () => `public-article:${slug.value}`,
  () => usePublicApiFetch<UserArticle>(articlePath.value),
  { watch: [slug] },
)

const { data: recommendedArticleResponse } = await useAsyncData(
  () => `public-article-recommendations:${slug.value}`,
  () => usePublicApiFetch<UserArticle[]>('/articles', {
    query: {
      page: 1,
      limit: 6,
    },
  }),
  { watch: [slug] },
)

const article = computed<UserArticle | null>(() => {
  if (!articleResponse.value) return null
  const nextArticle = unwrapApiResponse<UserArticle>(articleResponse.value)
  return nextArticle?.id ? nextArticle : null
})

// SSR 直达返回真实 HTTP 404,对齐 items/[id] 等详情页口径;
// 客户端软导航由 notFoundState watch 走 showError(见下方定义处)。
if (import.meta.server && !article.value) {
  throw createError({ statusCode: 404, statusMessage: '文章不存在' })
}

const recommendedArticles = computed<Array<UserArticle & { slug: string }>>(() => {
  const source = (recommendedArticleResponse.value as ApiResponse<UserArticle[]> | null)?.data
  const currentId = article.value?.id == null ? '' : String(article.value.id)
  const currentSlug = String(article.value?.slug || slug.value).trim()
  return (Array.isArray(source) ? source : [])
    .filter((item): item is UserArticle & { slug: string } => {
      const itemSlug = String(item.slug || '').trim()
      if (!item.id || !itemSlug) return false
      return String(item.id) !== currentId && itemSlug !== currentSlug
    })
    .slice(0, 3)
})

const escapeArticleHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const sanitizeArticleUrl = (value: string, type: 'href' | 'src') => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (type === 'src') {
    const resolved = resolvePreviewImageUrl(trimmed)
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(resolved)) return resolved
    if (/^(https?:|\/)/i.test(resolved) && !resolved.startsWith('//')) return resolved
    return ''
  }
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed
  return ''
}

const sanitizeArticleStyle = (styleText: string) => {
  const allowed: string[] = []
  for (const item of styleText.split(';').map(part => part.trim()).filter(Boolean)) {
    const dividerIndex = item.indexOf(':')
    if (dividerIndex <= 0) continue
    const property = item.slice(0, dividerIndex).trim().toLowerCase()
    const value = item.slice(dividerIndex + 1).trim()
    if (!value || /url\s*\(/i.test(value)) continue

    if (property === 'font-size' && /^([1-9]\d?|1\d\d)px$/.test(value)) allowed.push(`font-size:${value}`)
    if (property === 'font-weight' && /^(normal|bold|[1-9]00)$/.test(value)) allowed.push(`font-weight:${value}`)
    if (property === 'font-style' && /^(normal|italic)$/.test(value)) allowed.push(`font-style:${value}`)
    if (property === 'text-decoration' && /^(none|underline|line-through)$/.test(value)) allowed.push(`text-decoration:${value}`)
    if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) allowed.push(`text-align:${value}`)
    if (property === 'line-height' && /^(\d+(\.\d+)?|[1-9]\d?px)$/.test(value)) allowed.push(`line-height:${value}`)
    if (property === 'text-indent' && /^(0|[1-9]\d*(\.\d+)?(px|em|rem))$/.test(value)) allowed.push(`text-indent:${value}`)
    if (property === 'color' && /^(#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|[a-z]+)$/i.test(value)) allowed.push(`color:${value}`)
    if (property === 'width' && /^(auto|100%|[1-9]\d?%|[1-9]\d{0,3}px)$/.test(value)) allowed.push(`width:${value}`)
    if (property === 'max-width' && /^(100%|[1-9]\d?%|[1-9]\d{0,3}px)$/.test(value)) allowed.push(`max-width:${value}`)
    if (property === 'height' && /^(auto|[1-9]\d{0,3}px)$/.test(value)) allowed.push(`height:${value}`)
    if (property === 'display' && /^(block|inline-block)$/.test(value)) allowed.push(`display:${value}`)
    if (property === 'margin-left' && /^(0|0px|auto)$/.test(value)) allowed.push(`margin-left:${value}`)
    if (property === 'margin-right' && /^(0|0px|auto)$/.test(value)) allowed.push(`margin-right:${value}`)
  }
  return allowed.join(';')
}

type ArticleReferenceType = 'item' | 'npc' | 'boss'

const normalizeArticleReferenceType = (value: unknown): ArticleReferenceType | '' => {
  const type = String(value ?? '').trim().toLowerCase()
  return type === 'item' || type === 'npc' || type === 'boss' ? type : ''
}

const articleReferenceDetailPath = (type: ArticleReferenceType, id: string) => {
  if (type === 'item') return `/items/${id}`
  if (type === 'npc') return `/npcs/${id}`
  return `/bosses/${id}`
}

const normalizeRecipeTreeDepth = (value: unknown) => {
  const parsed = parseRecipeTreeDepth(value)
  return parsed ?? 3
}

const parseRecipeTreeDepth = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const depth = Number(value)
  if (!Number.isInteger(depth) || depth < 1 || depth > 5) return null
  return depth
}

const sanitizeArticleAttributes = (tagName: string, rawAttributes: string) => {
  const style = ['style']
  const allowedAttributes: Record<string, string[]> = {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'style'],
    p: style,
    h2: style,
    h3: style,
    h4: style,
    blockquote: style,
    ul: style,
    ol: style,
    li: style,
    span: ['style', 'class', 'data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label', 'data-tp-ref-image', 'data-tp-ref-display'],
    div: ['style', 'class', 'data-tp-embed-type', 'data-tp-item-id', 'data-tp-max-depth', 'data-tp-label'],
    figure: style,
    figcaption: style,
    pre: style,
    code: style,
    style: ['style'],
  }
  const allowed = allowedAttributes[tagName] ?? []
  if (!allowed.length) return ''

  const attributes: string[] = []
  const attributePattern = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  const rawAttributeValues = new Map<string, string>()
  let hasEventAttribute = false
  let hasUnexpectedDataTp = false
  while ((match = attributePattern.exec(rawAttributes)) !== null) {
    const rawName = match[1]
    if (!rawName) continue
    const name = rawName.toLowerCase()
    const rawValue = match[2] ?? match[3] ?? match[4] ?? ''
    rawAttributeValues.set(name, rawValue)
    if (name.startsWith('on')) hasEventAttribute = true
    if (name.startsWith('data-tp-') && !['data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label', 'data-tp-ref-image', 'data-tp-ref-display', 'data-tp-embed-type', 'data-tp-item-id', 'data-tp-max-depth', 'data-tp-label'].includes(name)) {
      hasUnexpectedDataTp = true
    }
  }

  const referenceClasses = String(rawAttributeValues.get('class') || '').trim().split(/\s+/).filter(Boolean)
  const hasReferenceClass = tagName === 'span' && referenceClasses.includes('tp-content-ref')
  const referenceType = String(rawAttributeValues.get('data-tp-ref-type') || '').trim().toLowerCase()
  const referenceId = String(rawAttributeValues.get('data-tp-ref-id') || '').trim()
  const referenceLabel = String(rawAttributeValues.get('data-tp-ref-label') || '').trim()
  const referenceImage = rawAttributeValues.has('data-tp-ref-image')
    ? sanitizeArticleUrl(String(rawAttributeValues.get('data-tp-ref-image') || ''), 'src')
    : ''
  const referenceDisplay = String(rawAttributeValues.get('data-tp-ref-display') || 'image').trim().toLowerCase()
  const referenceStyle = rawAttributeValues.has('style') ? sanitizeArticleStyle(String(rawAttributeValues.get('style') || '')) : ''
  const isAtomicReferenceValid = hasReferenceClass
    && referenceClasses.length === 1
    && Boolean(normalizeArticleReferenceType(referenceType))
    && /^\d{1,12}$/.test(referenceId)
    && referenceLabel.length > 0
    && referenceLabel.length <= 80
    && (!rawAttributeValues.has('data-tp-ref-image') || Boolean(referenceImage))
    && ['image', 'text'].includes(referenceDisplay)
    && !hasEventAttribute
    && !hasUnexpectedDataTp
    && (!rawAttributeValues.has('style') || Boolean(referenceStyle))
    && rawAttributeValues.has('data-tp-ref-type')
    && rawAttributeValues.has('data-tp-ref-id')
    && rawAttributeValues.has('data-tp-ref-label')
  const embedClasses = String(rawAttributeValues.get('class') || '').trim().split(/\s+/).filter(Boolean)
  const hasRecipeTreeEmbedClass = tagName === 'div' && embedClasses.includes('tp-recipe-tree')
  const recipeTreeItemId = String(rawAttributeValues.get('data-tp-item-id') || '').trim()
  const recipeTreeDepth = parseRecipeTreeDepth(rawAttributeValues.get('data-tp-max-depth'))
  const recipeTreeLabel = String(rawAttributeValues.get('data-tp-label') || '').trim()
  const isRecipeTreeEmbedValid = hasRecipeTreeEmbedClass
    && embedClasses.length === 2
    && embedClasses[0] === 'tp-article-embed'
    && embedClasses[1] === 'tp-recipe-tree'
    && String(rawAttributeValues.get('data-tp-embed-type') || '').trim() === 'recipe-tree'
    && /^\d{1,12}$/.test(recipeTreeItemId)
    && recipeTreeDepth !== null
    && recipeTreeLabel.length > 0
    && recipeTreeLabel.length <= 80
    && !hasEventAttribute
    && !hasUnexpectedDataTp

  for (const [name, rawValue] of rawAttributeValues) {
    if (!allowed.includes(name)) continue
    if (tagName === 'div' && hasRecipeTreeEmbedClass && name === 'style') continue
    if (tagName === 'div' && (name === 'class' || name.startsWith('data-tp-'))) {
      if (!isRecipeTreeEmbedValid) continue
      if (name === 'class') {
        attributes.push('class="tp-article-embed tp-recipe-tree"')
        continue
      }
      const safeEmbedValue = name === 'data-tp-embed-type'
        ? 'recipe-tree'
        : name === 'data-tp-item-id'
          ? recipeTreeItemId
          : name === 'data-tp-max-depth'
            ? String(recipeTreeDepth ?? 3)
            : recipeTreeLabel
      attributes.push(`${name}="${escapeArticleHtml(safeEmbedValue)}"`)
      continue
    }
    if (tagName === 'span' && (name === 'class' || name.startsWith('data-tp-ref-'))) {
      if (!isAtomicReferenceValid) continue
      if (name === 'class') {
        attributes.push('class="tp-content-ref"')
        continue
      }
      const safeReferenceValue = name === 'data-tp-ref-type'
        ? referenceType
        : name === 'data-tp-ref-id'
          ? referenceId
          : name === 'data-tp-ref-image'
            ? referenceImage
            : name === 'data-tp-ref-display'
              ? referenceDisplay
            : referenceLabel
      attributes.push(`${name}="${escapeArticleHtml(safeReferenceValue)}"`)
      continue
    }
    const safeValue = name === 'href'
      ? sanitizeArticleUrl(rawValue, 'href')
      : name === 'src'
        ? sanitizeArticleUrl(rawValue, 'src')
        : name === 'style'
          ? sanitizeArticleStyle(rawValue)
          : rawValue.trim()
    if (!safeValue && (name === 'href' || name === 'src')) continue
    if (!safeValue && name === 'style') continue
    attributes.push(`${name}="${escapeArticleHtml(safeValue)}"`)
  }

  if (tagName === 'a' && attributes.some((attribute) => attribute.startsWith('href='))) {
    attributes.push('rel="noopener noreferrer"')
  }
  if (tagName === 'img' && attributes.some((attribute) => attribute.startsWith('src='))) {
    attributes.push('loading="lazy"', 'decoding="async"')
  }
  if (hasReferenceClass && isAtomicReferenceValid && !attributes.some(attribute => attribute.startsWith('data-tp-ref-display='))) {
    attributes.push('data-tp-ref-display="image"')
  }
  return attributes.length ? ` ${attributes.join(' ')}` : ''
}

const ARTICLE_SANITIZER_ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'img', 'span', 'div', 'figure', 'figcaption']
const ARTICLE_SANITIZER_DATA_ATTRIBUTES = ['data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label', 'data-tp-ref-image', 'data-tp-ref-display', 'data-tp-embed-type', 'data-tp-item-id', 'data-tp-max-depth', 'data-tp-label']
const ARTICLE_SANITIZER_CONFIG = {
  ALLOWED_TAGS: ARTICLE_SANITIZER_ALLOWED_TAGS,
  ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'style', 'class', 'rel', 'loading', 'decoding', ...ARTICLE_SANITIZER_DATA_ATTRIBUTES],
  ALLOW_DATA_ATTR: false,
  // The uponSanitizeElement hook already validates these values through
  // sanitizeArticleAttributes; DOMPurify's URI heuristic would otherwise drop
  // free-text labels that contain a colon.
  ADD_URI_SAFE_ATTR: ARTICLE_SANITIZER_DATA_ATTRIBUTES,
}

const decodeSanitizedArticleAttributeValue = (value: string) => value
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')

const createArticleDomPurifier = () => {
  // DOMPurify needs a real DOM window. On the server (and anywhere else
  // without one) sanitizeArticleHtml keeps its regex whitelist fallback, so
  // SSR output stays sanitized without an isomorphic build dependency.
  if (!import.meta.client) return null
  const purifier = DOMPurify(window)
  if (!purifier.isSupported) return null
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (node.nodeType !== 1) return
    if (!ARTICLE_SANITIZER_ALLOWED_TAGS.includes(data.tagName)) return
    const element = node as Element
    // Reuse sanitizeArticleAttributes so the DOMPurify path enforces the exact
    // per-tag attribute policy of the regex fallback, including the
    // tp-content-ref / tp-recipe-tree validation and rel/loading additions.
    const rawAttributes = Array.from(element.attributes)
      .map(attribute => `${attribute.name}="${String(attribute.value).replace(/"/g, '&quot;')}"`)
      .join(' ')
    const safeAttributes = sanitizeArticleAttributes(data.tagName, rawAttributes)
    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name)
    }
    const safeAttributePattern = /([\w-]+)="([^"]*)"/g
    let attributeMatch: RegExpExecArray | null
    while ((attributeMatch = safeAttributePattern.exec(safeAttributes)) !== null) {
      const safeName = attributeMatch[1]
      if (!safeName) continue
      element.setAttribute(safeName, decodeSanitizedArticleAttributeValue(attributeMatch[2] ?? ''))
    }
  })
  return purifier
}

// Hydration safety: the server and the client's first frame must produce the
// exact same v-html string, so both stay on the regex fallback inside
// sanitizeArticleHtml (articleDomPurifier is null until mount). The DOMPurify
// path activates from onMounted after nextTick, where the re-sanitized swap is
// an ordinary reactive update instead of a hydration comparison.
let articleDomPurifier: ReturnType<typeof createArticleDomPurifier> = null
const articleDomPurifierReady = ref(false)

const renderInlineArticleText = (value: string) => escapeArticleHtml(value.trim())
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')

const renderPlainArticleText = (value: string) => {
  const lines = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | '' = ''
  let listItems: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(`<p>${paragraph.map(renderInlineArticleText).join('<br>')}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (!listType || !listItems.length) return
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineArticleText(item)}</li>`).join('')}</${listType}>`)
    listType = ''
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading?.[1] && heading[2]) {
      flushParagraph()
      flushList()
      const level = Math.min(4, Math.max(2, heading[1].length + 1))
      blocks.push(`<h${level}>${renderInlineArticleText(heading[2])}</h${level}>`)
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    if (unordered?.[1]) {
      flushParagraph()
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(unordered[1])
      continue
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (ordered?.[1]) {
      flushParagraph()
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(ordered[1])
      continue
    }

    const quote = trimmed.match(/^>\s+(.+)$/)
    if (quote?.[1]) {
      flushParagraph()
      flushList()
      blocks.push(`<blockquote><p>${renderInlineArticleText(quote[1])}</p></blockquote>`)
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()

  return blocks.join('\n') || '<p>这篇文章暂时没有正文内容。</p>'
}

const sanitizeArticleHtml = (value: string) => {
  const source = value.trim()
  if (!source) return '<p>这篇文章暂时没有正文内容。</p>'
  if (!/<\s*\/?\s*[a-zA-Z][\w:-]*(?:\s|>|\/)/.test(source)) return renderPlainArticleText(source)
  const stripped = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|template|iframe|object|embed|form|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi, (full, rawAttributes) => {
      if (!/\btp-recipe-tree\b/i.test(rawAttributes)) return full
      const safeAttributes = sanitizeArticleAttributes('div', rawAttributes)
      if (!/\bclass="tp-article-embed tp-recipe-tree"/.test(safeAttributes)) return ''
      return `<div${safeAttributes}></div>`
    })
    .replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (full, rawAttributes, content) => {
      if (!/\btp-content-ref\b/i.test(rawAttributes)) return full
      if (/\s(on\w+)\s*=/i.test(content) || /\sdata-tp-(?!ref-type|ref-id|ref-label)[\w-]*\s*=/i.test(content)) {
        const strippedAttributes = String(rawAttributes)
          .replace(/\sclass\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, '')
          .replace(/\sdata-tp-[\w-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, '')
        return `<span${strippedAttributes}>${content}</span>`
      }
      const safeAttributes = sanitizeArticleAttributes('span', rawAttributes)
      if (!/\bclass="tp-content-ref"/.test(safeAttributes)) {
        return full
      }
      const imageMatch = safeAttributes.match(/\sdata-tp-ref-image="([^"]+)"/)
      const displayMatch = safeAttributes.match(/\sdata-tp-ref-display="([^"]+)"/)
      const imageUrl = imageMatch?.[1] || ''
      const displayMode = displayMatch?.[1] === 'text' ? 'text' : 'image'
      const labelMatch = safeAttributes.match(/\sdata-tp-ref-label="([^"]+)"/)
      const label = labelMatch?.[1] || ''
      const inner = displayMode === 'text'
        ? escapeArticleHtml(label)
        : imageUrl
        ? `<img src="${imageUrl}" alt="" loading="lazy" decoding="async" aria-hidden="true">`
        : '<span class="tp-content-ref-fallback" aria-hidden="true">图</span>'
      return `<span${safeAttributes}>${inner}</span>`
    })
  // Client path: DOMPurify parses and filters the preprocessed markup through
  // the hook-backed whitelist above. The regex whitelist below stays as the
  // shared fallback for SSR and for extracted contract fixtures, where no
  // purifier instance exists.
  const activeArticleDomPurifier = typeof articleDomPurifier === 'undefined' ? null : articleDomPurifier
  if (activeArticleDomPurifier) {
    const purified = activeArticleDomPurifier.sanitize(stripped, ARTICLE_SANITIZER_CONFIG)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return purified || '<p>这篇文章暂时没有正文内容。</p>'
  }
  const allowedTags = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'img', 'span', 'div', 'figure', 'figcaption'])
  const voidTags = new Set(['br', 'img'])
  let result = ''
  let cursor = 0
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)([^>]*)>/g
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(stripped)) !== null) {
    result += escapeArticleHtml(stripped.slice(cursor, match.index))
    const rawTagName = match[1]
    if (!rawTagName) {
      cursor = tagPattern.lastIndex
      continue
    }
    const tagName = rawTagName.toLowerCase()
    const rawTag = match[0]
    if (allowedTags.has(tagName)) {
      const isClosing = /^<\s*\//.test(rawTag)
      if (isClosing) {
        if (!voidTags.has(tagName)) result += `</${tagName}>`
      } else {
        const attributes = sanitizeArticleAttributes(tagName, match[2] ?? '')
        result += voidTags.has(tagName) ? `<${tagName}${attributes}>` : `<${tagName}${attributes}>`
      }
    }
    cursor = tagPattern.lastIndex
  }
  result += escapeArticleHtml(stripped.slice(cursor))

  const normalized = result
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return normalized || '<p>这篇文章暂时没有正文内容。</p>'
}

const normalizeRecipeTreeText = (value: unknown) => String(value ?? '').trim()

const firstRecipeTreeText = (...values: unknown[]) => {
  for (const value of values) {
    const text = normalizeRecipeTreeText(value)
    if (text) return text
  }
  return ''
}

const recipeTreeItemName = (tree: PublicItemRecipeTree | null | undefined, fallback = '') => firstRecipeTreeText(
  tree?.item?.displayName,
  tree?.item?.nameZh,
  tree?.item?.name,
  tree?.displayName,
  tree?.resultName,
  tree?.name,
  fallback,
)

const recipeTreeItemImage = (tree: PublicItemRecipeTree | null | undefined) => sanitizeArticleUrl(firstRecipeTreeText(
  tree?.item?.previewImage,
  tree?.item?.imageUrl,
  tree?.item?.image,
  tree?.item?.iconUrl,
), 'src')

const recipeTreeRootNodes = (tree: PublicItemRecipeTree | null | undefined): PublicItemRecipeTreeNode[] => {
  if (!tree) return []
  const variants = Array.isArray(tree.variants) ? tree.variants : []
  const preferredRoots = variants.find(variant => Array.isArray(variant.roots) && variant.roots.length > 0)?.roots
  if (Array.isArray(preferredRoots) && preferredRoots[0]) return [preferredRoots[0]]
  for (const nodes of [tree.materials, tree.ingredients, tree.children, tree.nodes]) {
    if (Array.isArray(nodes) && nodes[0]) return [nodes[0]]
  }
  return []
}

const articleRecipeTreeVariantKey = (variant: PublicItemRecipeTreeVariant, index: number) =>
  firstRecipeTreeText(variant.variantKey, variant.variantLabel, index) || `variant-${index}`

const resolveArticleRecipeTreeSelection = (tree: PublicItemRecipeTree | null | undefined, variantKey = '', recipeKey = '') => {
  const model = buildCraftingRecipeModel(tree, variantKey, recipeKey)
  const rawVariants = Array.isArray(tree?.variants) ? tree.variants : []
  const rawVariant = rawVariants.find((variant, index) => articleRecipeTreeVariantKey(variant, index) === model.activeVariant?.key)
    ?? rawVariants[0]
    ?? null
  const rawRoots = Array.isArray(rawVariant?.roots) ? rawVariant.roots : []
  const recipeIndex = model.activeVariant?.options.findIndex(option => option.key === model.activeRecipe?.key) ?? -1
  const root = rawRoots[recipeIndex] ?? rawRoots[0] ?? (rawVariants.length === 0 ? recipeTreeRootNodes(tree)[0] : null)
  return { model, root }
}

const ARTICLE_RECIPE_TREE_WIDE_BREAKPOINT = 960

const resolveArticleRecipeTreeAvailableWidth = (containerWidth: number, paddingLeft: number, paddingRight: number) =>
  Math.max(1, containerWidth - Math.max(0, paddingLeft) - Math.max(0, paddingRight))

const resolveArticleRecipeTreeFrameWidth = (contentWidth: number, bodyPanelContentWidth: number, viewportWidth: number) => {
  const safeContentWidth = Math.max(1, contentWidth)
  const safeBodyPanelWidth = Math.max(1, bodyPanelContentWidth)
  return viewportWidth >= ARTICLE_RECIPE_TREE_WIDE_BREAKPOINT
    ? Math.max(safeContentWidth, safeBodyPanelWidth)
    : safeContentWidth
}

const appendArticleRecipeTreeGraph = (container: HTMLElement, roots: PublicItemRecipeTreeNode[], maxDepth: number) => {
  if (!roots.length) return
  const containerStyle = getComputedStyle(container)
  const containerPaddingLeft = Number.parseFloat(containerStyle.paddingLeft) || 0
  const containerPaddingRight = Number.parseFloat(containerStyle.paddingRight) || 0
  const contentWidth = resolveArticleRecipeTreeAvailableWidth(
    container.clientWidth || 720,
    containerPaddingLeft,
    containerPaddingRight,
  )
  const bodyPanel = container.closest<HTMLElement>('.article-body-panel')
  const bodyPanelStyle = bodyPanel ? getComputedStyle(bodyPanel) : null
  const bodyPanelContentWidth = bodyPanel && bodyPanelStyle
    ? resolveArticleRecipeTreeAvailableWidth(
        bodyPanel.clientWidth,
        Number.parseFloat(bodyPanelStyle.paddingLeft) || 0,
        Number.parseFloat(bodyPanelStyle.paddingRight) || 0,
      )
    : contentWidth
  const availableWidth = resolveArticleRecipeTreeFrameWidth(contentWidth, bodyPanelContentWidth, window.innerWidth)
  if (availableWidth > contentWidth) {
    const containerBorderWidth = (Number.parseFloat(containerStyle.borderLeftWidth) || 0) + (Number.parseFloat(containerStyle.borderRightWidth) || 0)
    container.dataset.articleRecipeTreeWide = 'true'
    container.style.setProperty('--article-recipe-tree-wide-width', `${availableWidth + containerPaddingLeft + containerPaddingRight + containerBorderWidth}px`)
  } else {
    delete container.dataset.articleRecipeTreeWide
    container.style.removeProperty('--article-recipe-tree-wide-width')
  }
  const graph = renderRecipeHierarchyGraph({
    roots,
    maxDepth,
    availableWidth,
    resolveImageUrl: imageUrl => sanitizeArticleUrl(imageUrl, 'src'),
    popoverOwner: 'article',
    popoverThemeClass: 'tp-article-runtime-popover--public',
  })
  if (!graph) return
  graph.classList.add('article-recipe-tree__graph')
  const link = container.querySelector('.article-recipe-tree__link')
  if (link) container.insertBefore(graph, link)
  else container.append(graph)
}

const renderArticleRecipeTreeShell = (node: HTMLElement, state: 'loading' | 'ready' | 'missing' | 'error', title: string, description: string, options: { imageUrl?: string, href?: string, stats?: string[] } = {}) => {
  const imageUrl = sanitizeArticleUrl(options.imageUrl || '', 'src')
  const href = sanitizeArticleUrl(options.href || '', 'href')
  node.dataset.tpResolved = state
  node.setAttribute('role', 'group')
  node.setAttribute('aria-label', `${title} 合成树`)
  node.replaceChildren()

  const header = document.createElement('div')
  header.className = 'article-recipe-tree__header'
  const thumb = document.createElement('span')
  thumb.className = 'article-recipe-tree__thumb'
  thumb.setAttribute('aria-hidden', 'true')
  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    img.alt = ''
    img.loading = 'lazy'
    img.decoding = 'async'
    thumb.append(img)
  } else {
    thumb.textContent = '合'
  }

  const copy = document.createElement('span')
  copy.className = 'article-recipe-tree__copy'
  const strong = document.createElement('strong')
  strong.textContent = title
  const small = document.createElement('small')
  small.textContent = description
  copy.append(strong, small)
  header.append(thumb, copy)
  node.append(header)

  if (options.stats?.length) {
    const stats = document.createElement('div')
    stats.className = 'article-recipe-tree__stats'
    for (const statText of options.stats) {
      const stat = document.createElement('span')
      stat.textContent = statText
      stats.append(stat)
    }
    node.append(stats)
  }

  if (href) {
    const link = document.createElement('a')
    link.className = 'article-recipe-tree__link'
    link.href = href
    link.textContent = '打开完整合成树'
    node.append(link)
  }
}

const appendArticleRecipeTreeSelectors = (
  node: HTMLElement,
  selection: any,
  onVariantSelect: any,
  onRecipeSelect: any,
) => {
  const activeVariant = selection.model.activeVariant
  if (!activeVariant) return
  const fragment = document.createDocumentFragment()
  const appendSelector = (
    role: string,
    label: string,
    entries: any[],
    activeKey: string,
    onSelect: any,
  ) => {
    if (entries.length < 2) return
    const selector = document.createElement('section')
    selector.className = `article-recipe-tree__selector ${role === 'variant-selector' ? 'recipe-variant-selector' : 'recipe-option-selector'} tp-toolbar`
    selector.dataset.articleRecipeRole = role
    selector.setAttribute('aria-label', label)
    for (const entry of entries) {
      const button = document.createElement('button')
      button.className = `tp-control recipe-selector-button${entry.key === activeKey ? ' active' : ''}`
      button.type = 'button'
      button.dataset.articleRecipeRole = role
      if (role === 'variant-selector') button.dataset.articleRecipeVariantKey = entry.key
      else button.dataset.articleRecipeOptionKey = entry.key
      button.setAttribute('aria-pressed', String(entry.key === activeKey))
      const title = document.createElement('b')
      title.textContent = entry.label
      const summary = document.createElement('span')
      summary.textContent = entry.meta
      button.append(title, summary)
      button.addEventListener('click', () => onSelect(entry.key))
      selector.append(button)
    }
    fragment.append(selector)
  }

  appendSelector(
    'variant-selector',
    '配方版本',
    selection.model.variants.map((variant: any) => ({ key: variant.key, label: variant.label, meta: variant.meta })),
    activeVariant.key,
    onVariantSelect,
  )
  appendSelector(
    'recipe-option-selector',
    '配方方案',
    activeVariant.options.map((option: any) => ({ key: option.key, label: option.label, meta: option.summary || option.output.title })),
    selection.model.activeRecipe?.key || '',
    onRecipeSelect,
  )
  if (!fragment.childNodes.length) return
  const link = node.querySelector('.article-recipe-tree__link')
  if (link) node.insertBefore(fragment, link)
  else node.append(fragment)
}

const renderArticleRecipeTreeResult = (node: HTMLElement, tree: PublicItemRecipeTree | null, itemId: string, maxDepth: number, label: string) => {
  const title = recipeTreeItemName(tree, label) || label || `物品 #${itemId}`
  const href = `/crafting?itemId=${encodeURIComponent(itemId)}&maxDepth=${maxDepth}`
  if (!tree) {
    renderArticleRecipeTreeShell(node, 'missing', title, '合成树暂不可用', {
      href,
      stats: [`深度 ${maxDepth}`],
    })
    return
  }
  const variantCount = Array.isArray(tree.variants) ? tree.variants.length : 0
  const renderSelection = (variantKey = '', recipeKey = '') => {
    const selection = resolveArticleRecipeTreeSelection(tree, variantKey, recipeKey)
    const activeVariant = selection.model.activeVariant
    renderArticleRecipeTreeShell(node, 'ready', title, '文章嵌入的合成树摘要', {
      imageUrl: recipeTreeItemImage(tree),
      href,
      stats: [
        variantCount ? `${variantCount} 个版本` : '默认版本',
        `深度 ${maxDepth}`,
      ],
    })
    appendArticleRecipeTreeSelectors(
      node,
      selection,
      (nextVariantKey: string) => renderSelection(nextVariantKey),
      (nextRecipeKey: string) => renderSelection(activeVariant?.key || variantKey, nextRecipeKey),
    )
    appendArticleRecipeTreeGraph(node, selection.root ? [selection.root] : [], maxDepth)
  }
  renderSelection()
}

const loadArticleRecipeTreeEmbeds = async () => {
  if (!import.meta.client) return
  const sequence = ++articleRecipeTreeLoadSequence
  const articleId = article.value?.id == null ? '' : String(article.value.id)
  await nextTick()
  const root = articleContentRef.value
  if (!root) return
  const embeds = Array.from(root.querySelectorAll<HTMLElement>('.tp-recipe-tree'))
    .map((node) => {
      const itemId = String(node.dataset.tpItemId || '').trim()
      const maxDepth = parseRecipeTreeDepth(node.dataset.tpMaxDepth)
      const label = String(node.dataset.tpLabel || '').trim()
      if (!/^\d{1,12}$/.test(itemId) || maxDepth === null || !label || label.length > 80) return null
      return { node, itemId, maxDepth, label }
    })
    .filter((embed): embed is { node: HTMLElement, itemId: string, maxDepth: number, label: string } => Boolean(embed))

  if (!embeds.length) return
  for (const embed of embeds) {
    renderArticleRecipeTreeShell(embed.node, 'loading', embed.label, '合成树加载中...', {
      href: `/crafting?itemId=${encodeURIComponent(embed.itemId)}&maxDepth=${embed.maxDepth}`,
      stats: [`深度 ${embed.maxDepth}`],
    })
  }

  await Promise.all(embeds.map(async (embed) => {
    try {
      const result = await fetchPublicRecipeTree(embed.itemId, embed.maxDepth)
      if (sequence !== articleRecipeTreeLoadSequence || articleId !== (article.value?.id == null ? '' : String(article.value.id))) return
      renderArticleRecipeTreeResult(embed.node, result.tree, embed.itemId, embed.maxDepth, embed.label)
    } catch {
      if (sequence !== articleRecipeTreeLoadSequence || articleId !== (article.value?.id == null ? '' : String(article.value.id))) return
      renderArticleRecipeTreeShell(embed.node, 'error', embed.label, '合成树加载失败', {
        href: `/crafting?itemId=${encodeURIComponent(embed.itemId)}&maxDepth=${embed.maxDepth}`,
        stats: [`深度 ${embed.maxDepth}`],
      })
    }
  }))
}

const baseSanitizedArticleHtml = computed(() => {
  // Depend on the purifier flag so the DOMPurify re-sanitize replaces the
  // regex-fallback HTML after mount (see articleDomPurifier definition).
  void articleDomPurifierReady.value
  const raw = String(article.value?.contentHtml ?? article.value?.contentMarkdown ?? '').trim()
  return sanitizeArticleHtml(raw)
})

const plainTextFromHtml = (value: string) => value
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim()

const articleToc = computed(() => {
  const headings: Array<{ id: string, level: number, title: string }> = []
  const headingPattern = /<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(baseSanitizedArticleHtml.value)) !== null) {
    const level = Number(match[1])
    const title = plainTextFromHtml(match[3] || '')
    if (!title) continue
    headings.push({ id: `article-section-${headings.length + 1}`, level, title })
  }
  return headings
})

const sanitizedArticleHtml = computed(() => {
  let index = 0
  return baseSanitizedArticleHtml.value.replace(/<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, level, attributes, content) => {
    index += 1
    return `<h${level}${attributes} id="article-section-${index}">${content}</h${level}>`
  })
})

const collectArticleReferenceInputs = (): ContentReferenceResolveInput[] => {
  const root = articleContentRef.value
  if (!root || !import.meta.client) return []
  const labels: Record<string, string> = {}
  const refs = Array.from(root.querySelectorAll<HTMLElement>('.tp-content-ref'))
    .map((node): ContentReferenceResolveInput | null => {
      const type = normalizeArticleReferenceType(node.dataset.tpRefType)
      const id = String(node.dataset.tpRefId || '').trim()
      const label = String(node.dataset.tpRefLabel || node.textContent || '').trim()
      if (!type || !/^\d{1,12}$/.test(id)) return null
      labels[`${type}:${id}`] = label
      return { type, id, label }
    })
    .filter((ref): ref is ContentReferenceResolveInput => Boolean(ref))
  articleReferenceLabels.value = labels
  return refs
}

const formatArticleReferenceTypeLabel = (type: ArticleReferenceType | '') => {
  if (type === 'item') return '物品'
  if (type === 'npc') return 'NPC'
  if (type === 'boss') return 'Boss'
  return '资料'
}

const computeArticleReferencePreviewPosition = (node: HTMLElement, event?: MouseEvent | FocusEvent) => {
  const rect = node.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || ARTICLE_REFERENCE_PREVIEW_WIDTH
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || ARTICLE_REFERENCE_PREVIEW_HEIGHT
  const previewWidth = Math.min(ARTICLE_REFERENCE_PREVIEW_WIDTH, Math.max(0, viewportWidth - ARTICLE_REFERENCE_PREVIEW_MARGIN * 2))
  const maxX = Math.max(ARTICLE_REFERENCE_PREVIEW_MARGIN, viewportWidth - ARTICLE_REFERENCE_PREVIEW_MARGIN - previewWidth)
  const maxY = Math.max(ARTICLE_REFERENCE_PREVIEW_MARGIN, viewportHeight - ARTICLE_REFERENCE_PREVIEW_MARGIN - ARTICLE_REFERENCE_PREVIEW_HEIGHT)
  const anchorGap = 10
  const centeredY = rect.top + rect.height / 2 - ARTICLE_REFERENCE_PREVIEW_HEIGHT / 2
  const y = Math.min(Math.max(centeredY, ARTICLE_REFERENCE_PREVIEW_MARGIN), maxY)
  const rightX = rect.right + anchorGap
  const leftX = rect.left - previewWidth - anchorGap

  if (rightX <= maxX) {
    return { x: rightX, y, placement: 'right' as const }
  }
  if (leftX >= ARTICLE_REFERENCE_PREVIEW_MARGIN) {
    return { x: leftX, y, placement: 'left' as const }
  }

  const centeredX = rect.left + rect.width / 2 - previewWidth / 2
  const x = Math.min(Math.max(centeredX, ARTICLE_REFERENCE_PREVIEW_MARGIN), maxX)
  const bottomY = Math.min(Math.max(rect.bottom + anchorGap, ARTICLE_REFERENCE_PREVIEW_MARGIN), maxY)
  return { x, y: bottomY, placement: 'bottom' as const }
}

const showArticleReferencePreview = (node: HTMLElement, event?: MouseEvent | FocusEvent) => {
  const key = contentReferenceKey(node.dataset.tpRefType, node.dataset.tpRefId)
  const reference = key ? articleReferences.value[key] : null
  const type = normalizeArticleReferenceType(node.dataset.tpRefType)
  const id = String(node.dataset.tpRefId || '').trim()
  if (!key || !type || !id) return
  const position = computeArticleReferencePreviewPosition(node, event)
  const label = articleReferenceLabels.value[key] || reference?.label || String(node.dataset.tpRefLabel || node.textContent || '').trim()
  articleReferencePreview.value = {
    key,
    label: label || `${formatArticleReferenceTypeLabel(type)} #${id}`,
    type,
    typeLabel: formatArticleReferenceTypeLabel(type),
    id,
    imageUrl: reference?.imageUrl || sanitizeArticleUrl(String(node.dataset.tpRefImage || ''), 'src'),
    categoryName: reference?.categoryName || '',
    summary: reference?.summary || '',
    internalName: reference?.internalName || '',
    detailPath: reference?.detailPath || node.dataset.tpHref || articleReferenceDetailPath(type, id),
    available: reference?.available !== false,
    ...position,
  }
  node.setAttribute('aria-describedby', ARTICLE_REFERENCE_PREVIEW_ID)
}

const moveArticleReferencePreview = (event: MouseEvent) => {
  if (!articleReferencePreview.value) return
  const node = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!node) return
  articleReferencePreview.value = {
    ...articleReferencePreview.value,
    ...computeArticleReferencePreviewPosition(node, event),
  }
}

const hideArticleReferencePreview = (node?: HTMLElement, key?: string) => {
  node?.removeAttribute('aria-describedby')
  if (!key || articleReferencePreview.value?.key === key) {
    articleReferencePreview.value = null
  }
}

const clearArticleReferencePreview = () => {
  articleContentRef.value
    ?.querySelectorAll<HTMLElement>('.tp-content-ref[aria-describedby]')
    .forEach(node => node.removeAttribute('aria-describedby'))
  articleReferencePreview.value = null
}

const shouldPreviewArticleReferenceOnTap = (node: HTMLElement, event: MouseEvent) => {
  const isCoarsePointer = window.matchMedia?.('(hover: none), (pointer: coarse)').matches === true
  if (!isCoarsePointer) return false
  const key = contentReferenceKey(node.dataset.tpRefType, node.dataset.tpRefId)
  if (!key) return false
  if (articleReferencePreview.value?.key === key) return false
  event.preventDefault()
  showArticleReferencePreview(node, event)
  return true
}

const enhanceArticleReferenceNodes = () => {
  const root = articleContentRef.value
  if (!root || !import.meta.client) return
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('.tp-content-ref'))) {
    const key = contentReferenceKey(node.dataset.tpRefType, node.dataset.tpRefId)
    const reference = key ? articleReferences.value[key] : null
    const authorLabel = key ? articleReferenceLabels.value[key] || reference?.label || '' : ''
    const label = authorLabel || reference?.label || String(node.dataset.tpRefLabel || node.textContent || '').trim()
    const type = normalizeArticleReferenceType(node.dataset.tpRefType)
    const id = String(node.dataset.tpRefId || '').trim()
    const imageUrl = reference?.imageUrl || sanitizeArticleUrl(String(node.dataset.tpRefImage || ''), 'src')
    const detailPath = type && id ? reference?.detailPath || articleReferenceDetailPath(type, id) : ''
    const displayMode = node.dataset.tpRefDisplay === 'text' ? 'text' : 'image'
    node.replaceChildren()
    if (displayMode === 'text') {
      node.textContent = label
    } else if (imageUrl) {
      const img = document.createElement('img')
      img.src = imageUrl
      img.alt = ''
      img.loading = 'lazy'
      img.decoding = 'async'
      img.setAttribute('aria-hidden', 'true')
      node.replaceChildren(img)
    } else {
      const fallback = document.createElement('span')
      fallback.className = 'tp-content-ref-fallback'
      fallback.textContent = '图'
      fallback.setAttribute('aria-hidden', 'true')
      node.replaceChildren(fallback)
    }
    node.dataset.tpRefDisplay = displayMode
    node.setAttribute('role', 'link')
    node.setAttribute('tabindex', '0')
    if (label) {
      node.removeAttribute('title')
      node.setAttribute('aria-label', `${label}，打开详情`)
    } else {
      node.removeAttribute('title')
      node.setAttribute('aria-label', '打开引用详情')
    }
    node.dataset.tpHref = detailPath
    node.dataset.tpHasImage = imageUrl ? 'true' : 'false'
    node.dataset.tpResolved = reference?.available === false ? 'missing' : reference ? 'ready' : 'loading'
    node.onclick = (event: MouseEvent) => {
      if (shouldPreviewArticleReferenceOnTap(node, event)) return
      if (detailPath) navigateTo(detailPath)
    }
    node.onkeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (detailPath) navigateTo(detailPath)
    }
    node.onmouseenter = (event: MouseEvent) => showArticleReferencePreview(node, event)
    node.onmousemove = moveArticleReferencePreview
    node.onmouseleave = () => hideArticleReferencePreview(node, key || undefined)
    node.onfocus = (event: FocusEvent) => showArticleReferencePreview(node, event)
    node.onblur = () => hideArticleReferencePreview(node, key || undefined)
  }
}

const loadArticleReferences = async () => {
  if (!import.meta.client) return
  const sequence = ++articleReferenceLoadSequence
  const articleId = article.value?.id == null ? '' : String(article.value.id)
  clearArticleReferencePreview()
  await nextTick()
  const refs = collectArticleReferenceInputs()
  articleReferenceError.value = ''
  enhanceArticleReferenceNodes()
  if (!refs.length) {
    if (sequence !== articleReferenceLoadSequence || articleId !== (article.value?.id == null ? '' : String(article.value.id))) return
    articleReferences.value = {}
    enhanceArticleReferenceNodes()
    return
  }
  try {
    const resolved = await resolvePublicContentReferences(refs)
    if (sequence !== articleReferenceLoadSequence || articleId !== (article.value?.id == null ? '' : String(article.value.id))) return
    const authorLabels = articleReferenceLabels.value
    articleReferences.value = Object.fromEntries(Object.entries(resolved).map(([key, reference]) => [
      key,
      {
        ...reference,
        label: authorLabels[key] || reference.label,
      },
    ]))
  } catch {
    if (sequence !== articleReferenceLoadSequence || articleId !== (article.value?.id == null ? '' : String(article.value.id))) return
    articleReferences.value = {}
    articleReferenceError.value = '正文引用暂时无法加载。'
  }
  await nextTick()
  enhanceArticleReferenceNodes()
}

const formatArticleDate = (raw?: string | null) => {
  if (!raw) return '发布时间未记录'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const publishedDate = computed(() => formatArticleDate(article.value?.publishedAt || article.value?.updatedAt || article.value?.createdAt))
const authorLabel = computed(() => article.value?.authorDisplayName || 'TerraPedia 用户')
const authorProfilePath = computed(() => article.value?.authorId ? `/users/${article.value.authorId}` : '')
const authorAvatarUrl = computed(() => resolvePreviewImageUrl(article.value?.authorAvatarUrl || ''))
const authorAvatarFallback = computed(() => authorLabel.value.trim().slice(0, 1).toUpperCase() || 'T')
const viewCount = computed(() => Math.max(0, Number(article.value?.viewCount ?? 0)))
const favoriteCountBase = computed(() => Math.max(0, Number(article.value?.favoriteCount ?? 0)))
const resolveArticleCoverUrl = (article: UserArticle | null) => article ? resolvePreviewImageUrl(article.coverImage || '') : ''
const articleCoverUrl = computed(() => resolveArticleCoverUrl(article.value))
const recommendedArticlePath = (targetArticle: UserArticle) => `/articles/${targetArticle.slug}`
const recommendedArticleCoverUrl = (targetArticle: UserArticle) => resolvePreviewImageUrl(targetArticle.coverImage || '')
const recommendedArticleCoverFallback = (targetArticle: UserArticle) => {
  const source = String(targetArticle.title || targetArticle.slug || 'TP').trim()
  return source.slice(0, 2).toUpperCase()
}
const recommendedArticleSummary = (targetArticle: UserArticle) => targetArticle.summary || '这篇文章暂无摘要。'
const recommendedArticleViewCount = (targetArticle: UserArticle) => Math.max(0, Number(targetArticle.viewCount ?? 0))
const recommendedArticleFavoriteCount = (targetArticle: UserArticle) => Math.max(0, Number(targetArticle.favoriteCount ?? 0))
const articleFavoriteStatus = computed(() => article.value?.id ? favoritesStore.getStatus('ARTICLE', article.value.id) : null)
const articleIsFavorite = computed(() => Boolean(articleFavoriteStatus.value?.favorite))
const displayedFavoriteCount = computed(() => {
  const serverFavorite = favoriteCountBase.value
  const articleId = article.value?.id == null ? '' : String(article.value.id)
  if (!articleId || articleFavoriteStatus.value == null || initialArticleFavorite.value?.id !== articleId) return serverFavorite
  if (initialArticleFavorite.value.favorite === articleIsFavorite.value) return serverFavorite
  return Math.max(0, serverFavorite + (articleIsFavorite.value ? 1 : -1))
})
// 正文走真 SSR：加载态只看数据请求本身，不再等客户端就绪，
// SSR/水合首帧直接输出正文 HTML(两端同为 regex 回退净化产物)。
const articleLoading = computed(() => articlePending.value && !article.value)
const notFoundState = computed(() => articleClientReady.value && !articlePending.value && (!article.value || articleError.value))

watch(notFoundState, (value) => {
  if (value) showError({ statusCode: 404, statusMessage: '文章不存在' })
})

useSeoMeta({
  title: () => `TerraPedia · ${article.value?.title || '文章详情'}`,
  description: () => article.value?.summary || 'TerraPedia 用户发布文章详情。',
  ogImage: () => articleCoverUrl.value || undefined,
})

const loadArticleFavoriteStatus = async () => {
  if (!article.value?.id) return
  favoriteError.value = ''
  try {
    await authStore.init()
    if (authStore.isAuthenticated) {
      await favoritesStore.loadStatuses('ARTICLE', [article.value.id])
      const loadedStatus = favoritesStore.getStatus('ARTICLE', article.value.id)
      const loadedId = String(article.value.id)
      if (loadedStatus && initialArticleFavorite.value?.id !== loadedId) {
        initialArticleFavorite.value = { id: loadedId, favorite: Boolean(loadedStatus.favorite) }
      }
    }
  } catch {
    favoriteError.value = '收藏状态暂时无法同步。'
  }
}

const toggleArticleFavorite = async () => {
  if (!article.value?.id) return
  favoriteError.value = ''
  try {
    await favoritesStore.toggleArticleFavorite(article.value.id)
  } catch (exception: unknown) {
    favoriteError.value = exception instanceof Error ? exception.message : '收藏操作失败。'
  }
}

const recordArticleHistoryOnce = async () => {
  if (!import.meta.client || !article.value?.id) return
  const id = String(article.value.id)
  if (recordedArticleHistoryIds.has(id)) return
  recordedArticleHistoryIds.add(id)
  try {
    await historyStore.record('ARTICLE', article.value.id)
  } catch {
    // Reading history must not block public article rendering.
  }
}

watch(() => article.value?.id, () => {
  initialArticleFavorite.value = null
  // TerraNav 水合竞态守护：预挂载阶段(SSR/水合首帧)不触发 authStore.init()，
  // 否则服务端把导航渲染成"正在检查登录状态"而客户端序列化状态已是访客态。
  // 首次加载由 onMounted 负责，此 watch 只服务客户端软导航换文章;
  // recordArticleHistoryOnce 同样由 onMounted 处理首跳。
  if (!articleClientReady.value) return
  void loadArticleFavoriteStatus()
  void recordArticleHistoryOnce()
}, { immediate: true })

watch([sanitizedArticleHtml, () => article.value?.id], async () => {
  if (!import.meta.client || !articleClientReady.value) return
  await nextTick()
  void loadArticleReferences()
  void loadArticleRecipeTreeEmbeds()
})

onMounted(() => {
  articleClientReady.value = true
  void loadArticleFavoriteStatus()
  void recordArticleHistoryOnce()
  void loadArticleReferences()
  void loadArticleRecipeTreeEmbeds()
  // Swap to the DOMPurify sanitize path only after hydration has settled;
  // the resulting v-html update re-triggers the enhancement watch above.
  void nextTick().then(() => {
    articleDomPurifier = createArticleDomPurifier()
    if (articleDomPurifier) articleDomPurifierReady.value = true
  })
})
</script>

<template>
    <TerraBreadcrumb />

  <main v-if="articleLoading" class="article-detail-layout article-detail-loading" aria-live="polite" :aria-busy="articleLoading">
      <div class="article-detail-grid">
        <section class="article-body-panel article-detail-loading-body">
          <header class="article-inline-header">
            <div class="article-cover-figure article-cover-figure--loading" aria-hidden="true">
              <CommonTpSkeleton type="icon" />
            </div>
            <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
            <h1><CommonTpSkeleton type="line" /></h1>
            <p>
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" short />
            </p>
            <div class="article-primary-meta">
              <span><CommonTpSkeleton type="pill" /></span>
              <span><CommonTpSkeleton type="pill" /></span>
              <span><CommonTpSkeleton type="pill" /></span>
            </div>
          </header>
          <h2 class="article-section-title"><CommonTpSkeleton type="line" /></h2>
          <div class="article-content-text article-detail-loading-copy">
            <CommonTpSkeleton type="line" />
            <CommonTpSkeleton type="line" />
            <CommonTpSkeleton type="line" short />
            <CommonTpSkeleton type="line" />
            <CommonTpSkeleton type="line" short />
          </div>
        </section>
        <aside class="article-route-panel article-detail-loading-sidebar">
          <CommonTpSkeleton type="pill" />
          <CommonTpSkeleton type="line" />
          <CommonTpSkeleton type="line" short />
          <CommonTpSkeleton type="line" />
        </aside>
      </div>
    </main>

  <main v-else-if="notFoundState" class="article-detail-layout" :aria-busy="articleLoading">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · 未找到</span>
        <h1>没有找到这篇文章</h1>
        <p>这篇文章可能已下线，或链接已经失效。</p>
        <div class="article-meta">
          <span>文章不可访问</span><span>链接可能已失效</span><span>请返回文章入口</span>
        </div>
        <a class="primary-button article-return-link" href="/articles">返回文章入口</a>
      </article>
    </main>

  <main v-else-if="article" class="article-detail-layout" :aria-busy="articleLoading">
      <div class="article-detail-grid">
        <section class="article-body-panel">
          <header class="article-inline-header">
            <figure class="article-cover-figure">
              <img v-if="articleCoverUrl" :src="articleCoverUrl" :alt="article.title" loading="eager">
              <span v-else class="article-cover-fallback" aria-hidden="true">{{ String(article.title || article.slug || 'TP').slice(0, 2).toUpperCase() }}</span>
            </figure>
            <span class="eyebrow">资料手札 · {{ article.slug }}</span>
            <h1>{{ article.title }}</h1>
            <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>

            <div class="article-primary-meta" aria-label="文章信息">
              <a v-if="authorProfilePath" class="article-primary-author" :href="authorProfilePath" :aria-label="`${authorLabel} 的主页`">
                <span class="article-author-avatar compact">
                  <img v-if="authorAvatarUrl" :src="authorAvatarUrl" :alt="`${authorLabel} 的头像`" loading="lazy">
                  <span v-else>{{ authorAvatarFallback }}</span>
                </span>
                <span>{{ authorLabel }}</span>
              </a>
              <span v-else class="article-primary-author">
                <span class="article-author-avatar compact">
                  <img v-if="authorAvatarUrl" :src="authorAvatarUrl" :alt="`${authorLabel} 的头像`" loading="lazy">
                  <span v-else>{{ authorAvatarFallback }}</span>
                </span>
                <span>{{ authorLabel }}</span>
              </span>
              <span>{{ publishedDate }}</span>
              <span>文章 #{{ article.id }}</span>
              <span>{{ viewCount }} 浏览</span>
              <span>{{ displayedFavoriteCount }} 收藏</span>
            </div>

            <div class="article-favorite-actions">
              <button
                class="article-favorite-button"
                :class="{ active: articleIsFavorite }"
                type="button"
                :disabled="favoritesStore.mutating || !article.id"
                :aria-pressed="articleIsFavorite"
                @click="toggleArticleFavorite"
              >
                <span class="sprite-icon icon-favorites compact" aria-hidden="true"></span>
                <span>{{ articleIsFavorite ? '已收藏' : '收藏文章' }}</span>
              </button>
              <span v-if="favoriteError" class="article-favorite-error">{{ favoriteError }}</span>
            </div>
          </header>
          <h2 class="article-section-title">正文</h2>
          <div ref="articleContentRef" class="article-content-text" v-html="sanitizedArticleHtml"></div>
          <Teleport to="body">
            <div
              v-if="articleReferencePreview"
              :id="ARTICLE_REFERENCE_PREVIEW_ID"
              class="article-reference-preview"
              :class="`article-reference-preview--${articleReferencePreview.placement}`"
              :style="{ left: `${articleReferencePreview.x}px`, top: `${articleReferencePreview.y}px` }"
              role="tooltip"
            >
              <span class="article-reference-preview__thumb" aria-hidden="true">
                <img
                  v-if="articleReferencePreview.imageUrl"
                  :src="articleReferencePreview.imageUrl"
                  :alt="articleReferencePreview.label"
                  loading="lazy"
                  decoding="async"
                >
                <span v-else>图</span>
              </span>
              <span class="article-reference-preview__body">
                <strong>{{ articleReferencePreview.label }}</strong>
                <small>{{ articleReferencePreview.typeLabel }} · {{ articleReferencePreview.categoryName || articleReferencePreview.summary || `ID ${articleReferencePreview.id}` }}</small>
                <small v-if="articleReferencePreview.internalName" class="article-reference-preview__code">{{ articleReferencePreview.internalName }} · #{{ articleReferencePreview.id }}</small>
                <small v-else class="article-reference-preview__code">#{{ articleReferencePreview.id }}</small>
                <em>{{ articleReferencePreview.available ? '点击打开详情' : '资料暂不可用' }}</em>
              </span>
            </div>
          </Teleport>
          <p v-if="articleReferenceError" class="article-reference-error">{{ articleReferenceError }}</p>

          <ArticleComments :article="article" />
        </section>

        <aside class="article-route-panel">
          <nav v-if="articleToc.length" class="article-toc" aria-label="文章目录">
            <span class="eyebrow">文章目录</span>
            <a
              v-for="item in articleToc"
              :key="item.id"
              :class="['article-toc-link', `level-${item.level}`]"
              :href="`#${item.id}`"
            >
              {{ item.title }}
            </a>
            <a class="article-toc-link comments-link" href="#article-comments">评论区</a>
          </nav>

          <section v-if="recommendedArticles.length" class="article-related-articles" aria-label="推荐文章">
            <span class="eyebrow">推荐文章</span>
            <a
              v-for="recommendedArticle in recommendedArticles"
              :key="recommendedArticle.id"
              class="article-related-link"
              :href="recommendedArticlePath(recommendedArticle)"
            >
              <span class="article-related-cover">
                <img
                  v-if="recommendedArticleCoverUrl(recommendedArticle)"
                  :src="recommendedArticleCoverUrl(recommendedArticle)"
                  :alt="recommendedArticle.title"
                  loading="lazy"
                >
                <b v-else>{{ recommendedArticleCoverFallback(recommendedArticle) }}</b>
              </span>
              <span class="article-related-copy">
                <b>{{ recommendedArticle.title }}</b>
                <span>{{ recommendedArticleSummary(recommendedArticle) }}</span>
                <small>{{ recommendedArticleViewCount(recommendedArticle) }} 浏览 · {{ recommendedArticleFavoriteCount(recommendedArticle) }} 收藏</small>
              </span>
            </a>
          </section>

          <a class="article-more-link" href="/articles">更多文章</a>
        </aside>
      </div>
    </main>
</template>

<style scoped>
.article-favorite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
}

.article-favorite-button {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-width: 118px;
  min-height: 44px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
  border-radius: 999px;
  background: var(--index-surface);
  color: var(--text-strong);
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.article-favorite-button.active {
  background: color-mix(in srgb, var(--accent-gold) 18%, var(--index-surface));
}

.article-favorite-button:disabled {
  opacity: 0.62;
  cursor: wait;
}

.article-favorite-error {
  color: var(--danger);
  font-size: 12px;
  font-weight: 800;
}

.article-detail-hero h1 {
  overflow-wrap: anywhere;
}

.article-detail-hero p {
  overflow-wrap: anywhere;
}

.article-body-panel {
  min-width: 0;
}

.article-detail-loading-body,
.article-detail-loading-sidebar {
  pointer-events: none;
}

.article-inline-header {
  margin-bottom: 24px;
  padding-bottom: 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--index-line) 78%, transparent);
}

.article-cover-figure {
  display: grid;
  place-items: center;
  width: 100%;
  margin: 0 0 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 22%, var(--index-line));
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-gold) 12%, transparent), transparent 44%),
    color-mix(in srgb, var(--index-surface) 84%, #101827);
  aspect-ratio: 16 / 7;
}

.article-cover-figure img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--accent-gold);
  font-family: var(--font-display);
  font-size: clamp(42px, 8vw, 88px);
  font-weight: 900;
  letter-spacing: 0.04em;
}

.article-inline-header h1 {
  max-width: 24ch;
  margin: 8px 0 12px;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 46px);
  line-height: 1.12;
  overflow-wrap: anywhere;
}

.article-inline-header p {
  max-width: 76ch;
  margin: 0;
  color: var(--text-muted);
  font-size: 15.5px;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

.article-primary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin-top: 16px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 850;
}

.article-primary-author {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  color: var(--text-strong);
  text-decoration: none;
}

.article-primary-author:hover {
  color: var(--accent-gold);
}

.article-author-card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  max-width: 760px;
  margin-top: 18px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 84%, transparent);
}

.article-author-avatar {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 38%, var(--index-line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent-gold) 16%, var(--index-surface));
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 900;
  text-decoration: none;
}

.article-author-avatar.compact {
  width: 28px;
  height: 28px;
  font-size: 12px;
}

.article-author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-author-name {
  color: var(--text-strong);
  font-weight: 900;
}

.article-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-width: 760px;
  margin-top: 14px;
}

.article-stat-grid div {
  min-width: 0;
  min-height: 62px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--index-line) 80%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 72%, transparent);
}

.article-stat-grid b {
  display: block;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.article-stat-grid span {
  display: block;
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.article-section-title {
  margin: 0 0 18px;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.25;
}

.article-content-text {
  max-width: 76ch;
  margin: 0;
  color: var(--text-main);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.82;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.article-content-text :deep(p),
.article-content-text :deep(ul),
.article-content-text :deep(ol),
.article-content-text :deep(blockquote),
.article-content-text :deep(pre) {
  margin: 0 0 18px;
}

.article-content-text :deep(h2),
.article-content-text :deep(h3),
.article-content-text :deep(h4) {
  margin: 30px 0 12px;
  color: var(--text-strong);
  font-family: var(--font-display);
  line-height: 1.28;
  overflow-wrap: anywhere;
}

.article-content-text :deep(h2) {
  font-size: 24px;
}

.article-content-text :deep(h3) {
  font-size: 20px;
}

.article-content-text :deep(h4) {
  font-size: 17px;
}

.article-content-text :deep(a) {
  color: #ffd765;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.article-content-text :deep(.tp-content-ref) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875em;
  height: 1.875em;
  padding: 2px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 80%, rgba(255, 215, 101, .16));
  color: var(--accent-gold);
  line-height: 1;
  text-decoration: none;
  vertical-align: -0.38em;
  cursor: pointer;
  white-space: nowrap;
  break-inside: avoid;
  box-shadow: 0 2px 8px rgba(0,0,0,.22);
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.article-content-text :deep(.tp-content-ref[data-tp-ref-display="text"]) {
  justify-content: flex-start;
  width: auto;
  height: auto;
  max-width: min(100%, 22em);
  padding: 0 .42em;
  font-weight: 850;
  line-height: 1.45;
  vertical-align: .04em;
  white-space: nowrap;
}

.article-content-text :deep(.tp-content-ref img) {
  display: block;
  width: 100%;
  height: 100%;
  flex: 0 0 100%;
  margin: 0;
  border: 0;
  object-fit: contain;
  border-radius: 3px;
}

.article-content-text :deep(.tp-content-ref-fallback) {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--accent-gold);
  font-size: 13px;
  font-weight: 900;
}

.article-content-text :deep(.tp-content-ref:hover),
.article-content-text :deep(.tp-content-ref:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--accent-gold) 52%, transparent);
  outline-offset: 2px;
  border-color: color-mix(in srgb, var(--accent-gold) 78%, var(--index-line));
  box-shadow: 0 4px 12px rgba(0,0,0,.28);
  transform: translateY(-1px);
}

.article-content-text :deep(.tp-content-ref[data-tp-resolved="missing"]) {
  border-color: color-mix(in srgb, var(--danger) 46%, var(--index-line));
  color: var(--text-muted);
  cursor: default;
}

.article-content-text :deep(.tp-recipe-tree) {
  display: grid;
  width: min(100%, 720px);
  min-height: 112px;
  margin: 24px 0;
  padding: 14px;
  gap: 12px;
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 30%, var(--index-line));
  border-radius: 8px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--text-strong) 4%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--text-strong) 3%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--index-bg) 92%, var(--panel));
  background-size: 32px 32px, 32px 32px, auto;
  line-height: 1.35;
}

@media (min-width: 960px) {
  .article-content-text :deep(.tp-recipe-tree[data-article-recipe-tree-wide="true"]) {
    width: var(--article-recipe-tree-wide-width);
    max-width: none;
  }
}

.article-content-text :deep(.tp-recipe-tree[data-tp-resolved="loading"]) {
  border-style: dashed;
  color: var(--text-muted);
}

.article-content-text :deep(.tp-recipe-tree[data-tp-resolved="missing"]),
.article-content-text :deep(.tp-recipe-tree[data-tp-resolved="error"]) {
  border-color: color-mix(in srgb, var(--danger) 38%, var(--index-line));
}

.article-content-text :deep(.article-recipe-tree__header) {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 260px;
}

.article-content-text :deep(.article-recipe-tree__thumb) {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 34%, var(--index-line));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-gold) 12%, transparent);
  color: var(--accent-gold);
  font-weight: 900;
}

.article-content-text :deep(.article-recipe-tree__thumb img) {
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  border-radius: 0;
  object-fit: contain;
}

.article-content-text :deep(.article-recipe-tree__copy) {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.article-content-text :deep(.article-recipe-tree__copy strong) {
  color: var(--text-strong);
  font-size: 16px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.article-content-text :deep(.article-recipe-tree__copy small) {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.article-content-text :deep(.article-recipe-tree__stats) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 260px;
}

.article-content-text :deep(.article-recipe-tree__stats span) {
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 42%, transparent);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.article-content-text :deep(.article-recipe-tree__selector) {
  flex: 0 0 auto;
  min-width: min(100%, 260px);
  max-width: 100%;
  overflow-x: auto;
  padding: 8px;
}

.article-content-text :deep(.article-recipe-tree__selector .recipe-selector-button) {
  flex: 0 0 min(240px, calc(100vw - 84px));
  min-width: 0;
}

.article-content-text :deep(.article-recipe-tree__graph) {
  --article-recipe-tree-node-image-size: 48px;
  --article-recipe-tree-alternative-image-size: 32px;
  --article-recipe-tree-station-image-size: 48px;
  --article-recipe-tree-station-rail-width: 52px;
  --recipe-overview-pan-x: 0px;
  --recipe-overview-pan-y: 0px;
  position: relative;
  flex: 0 0 auto;
  min-width: max-content;
  margin: 2px auto 0;
  cursor: grab;
  touch-action: none;
}

.article-content-text :deep(.article-recipe-tree__graph.is-panning) {
  cursor: grabbing;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-overview-edge) {
  stroke: color-mix(in srgb, var(--accent-gold) 58%, var(--index-line));
  stroke-width: 1.5;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-card) {
  border-color: color-mix(in srgb, var(--accent-gold) 62%, var(--index-line));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-gold) 8%, transparent), transparent 72%),
    color-mix(in srgb, var(--panel) 94%, var(--index-bg));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--text-strong) 12%, transparent),
    0 7px 16px color-mix(in srgb, var(--index-bg) 34%, transparent);
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-main) {
  align-content: center;
  gap: 2px;
}

.article-content-text :deep(.article-recipe-tree__graph .tp-preview-image img) {
  display: block;
  margin: 0;
  border: 0;
  border-radius: 0;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-main > .tp-preview-image) {
  width: var(--article-recipe-tree-node-image-size);
  height: var(--article-recipe-tree-node-image-size);
  --tp-preview-image-size: var(--article-recipe-tree-node-image-size);
  --tp-preview-fallback-icon-size: calc(var(--article-recipe-tree-node-image-size) * 0.72);
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-main > .tp-preview-image img) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  max-width: none;
  max-height: none;
  object-fit: contain;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-card.has-stations) {
  grid-template-columns: minmax(0, 1fr) var(--article-recipe-tree-station-rail-width);
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-station-rail) {
  width: var(--article-recipe-tree-station-rail-width);
  padding-left: 3px;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-station-badge) {
  width: var(--article-recipe-tree-station-image-size);
  height: var(--article-recipe-tree-station-image-size);
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-station-badge .tp-preview-image) {
  width: var(--article-recipe-tree-station-image-size);
  height: var(--article-recipe-tree-station-image-size);
  --tp-preview-image-size: var(--article-recipe-tree-station-image-size);
  --tp-preview-fallback-icon-size: calc(var(--article-recipe-tree-station-image-size) * 0.72);
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-station-badge .tp-preview-image img) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-alt-images) {
  grid-template-columns: repeat(2, var(--article-recipe-tree-alternative-image-size));
  gap: 2px;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-alt-images .tp-preview-image) {
  width: var(--article-recipe-tree-alternative-image-size);
  height: var(--article-recipe-tree-alternative-image-size);
  --tp-preview-image-size: var(--article-recipe-tree-alternative-image-size);
  --tp-preview-fallback-icon-size: calc(var(--article-recipe-tree-alternative-image-size) * 0.72);
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-graph-node-copy) {
  display: -webkit-box;
  width: 100%;
  overflow: hidden;
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-align: center;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-content-text :deep(.article-recipe-tree__graph .recipe-hierarchy-quantity) {
  color: var(--text-strong);
  font-size: 10px;
}

.article-content-text :deep(.article-recipe-tree__link) {
  justify-self: start;
  min-width: 0;
  font-size: 13px;
}

:global(.article-reference-preview) {
  position: fixed;
  z-index: var(--tp-z-page-popover);
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  width: min(280px, calc(100vw - 24px));
  gap: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 96%, #111111);
  box-shadow: 0 16px 34px rgba(0,0,0,.36);
  pointer-events: none;
}

:global(.article-reference-preview::before) {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  border: inherit;
  background: inherit;
  transform: rotate(45deg);
}

:global(.article-reference-preview--right::before) {
  left: -5px;
  top: 18px;
  border-right: 0;
  border-top: 0;
}

:global(.article-reference-preview--left::before) {
  right: -5px;
  top: 18px;
  border-left: 0;
  border-bottom: 0;
}

:global(.article-reference-preview--bottom::before) {
  left: 18px;
  top: -5px;
  border-right: 0;
  border-bottom: 0;
}

:global(.article-reference-preview__thumb) {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 34%, var(--index-line));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-gold) 12%, transparent);
  color: var(--accent-gold);
  font-size: 13px;
  font-weight: 900;
  overflow: hidden;
}

:global(.article-reference-preview__thumb img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

:global(.article-reference-preview__body) {
  display: grid;
  min-width: 0;
  gap: 3px;
  line-height: 1.35;
}

:global(.article-reference-preview__body strong),
:global(.article-reference-preview__body small),
:global(.article-reference-preview__body em) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.article-reference-preview__body strong) {
  color: var(--text-main);
  font-size: .92rem;
  font-style: normal;
  font-weight: 900;
}

:global(.article-reference-preview__body small) {
  color: var(--text-muted);
  font-size: .78rem;
  font-weight: 760;
}

:global(.article-reference-preview__body .article-reference-preview__code) {
  color: color-mix(in srgb, var(--text-muted) 74%, var(--accent-gold));
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: .72rem;
  font-weight: 760;
}

:global(.article-reference-preview__body em) {
  color: var(--accent-gold);
  font-size: .76rem;
  font-style: normal;
  font-weight: 900;
}

.article-reference-error {
  max-width: 76ch;
  margin: 12px 0 0;
  color: var(--danger);
  font-size: 12px;
  font-weight: 900;
}

.article-cover-figure--loading {
  min-height: 260px;
}

.article-detail-loading-copy {
  display: grid;
  gap: 12px;
}

.article-detail-loading-sidebar {
  display: grid;
  align-content: start;
  gap: 12px;
}

.article-content-text :deep(ul),
.article-content-text :deep(ol) {
  padding-left: 1.4em;
}

.article-content-text :deep(li + li) {
  margin-top: 6px;
}

.article-content-text :deep(blockquote) {
  padding: 2px 0 2px 16px;
  border-left: 3px solid color-mix(in srgb, var(--accent-gold) 55%, var(--index-line));
  color: var(--text-muted);
}

.article-content-text :deep(pre),
.article-content-text :deep(code) {
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 78%, #030712);
}

.article-content-text :deep(pre) {
  max-width: 100%;
  padding: 14px;
  overflow-x: auto;
}

.article-content-text :deep(code) {
  padding: 2px 5px;
  font-size: 0.92em;
}

.article-content-text :deep(pre code) {
  border: 0;
  padding: 0;
  background: transparent;
}

.article-content-text :deep(img) {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  margin: 20px 0;
  border: 1px solid var(--index-line);
  border-radius: 12px;
}

.article-content-text :deep(h2[id]),
.article-content-text :deep(h3[id]),
.article-content-text :deep(h4[id]) {
  scroll-margin-top: 96px;
}

.article-author-link,
.article-author-side-link {
  color: #ffd765;
  font-weight: 900;
  text-decoration: none;
}

.article-author-link:hover,
.article-author-side-link:hover {
  text-decoration: underline;
}

.article-return-link {
  width: fit-content;
  margin-top: 18px;
}

.article-recommendations {
  display: grid;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
}

.article-recommendation-link {
  display: grid;
  gap: 4px;
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 82%, transparent);
  color: var(--text-main);
  text-decoration: none;
}

.article-recommendation-link b {
  color: var(--text-strong);
  font-size: 13px;
  line-height: 1.2;
}

.article-recommendation-link span {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.article-recommendation-link:hover,
.article-recommendation-link:focus-visible {
  border-color: color-mix(in srgb, var(--accent-gold) 48%, var(--index-line));
  color: var(--accent-gold);
}

.article-related-articles {
  display: grid;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
}

.article-related-link {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 10px;
  min-height: 92px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-gold) 9%, transparent), transparent 54%),
    color-mix(in srgb, var(--index-surface) 84%, transparent);
  color: var(--text-main);
  text-decoration: none;
}

.article-related-cover {
  display: grid;
  place-items: center;
  width: 76px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 20%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-gold) 10%, var(--index-surface));
  color: var(--accent-gold);
  font-family: var(--font-display);
  font-weight: 900;
}

.article-related-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-related-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.article-related-copy b {
  color: var(--text-strong);
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.article-related-copy span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-related-copy small {
  color: color-mix(in srgb, var(--accent-gold) 76%, var(--text-muted));
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
}

.article-related-link:hover,
.article-related-link:focus-visible {
  border-color: color-mix(in srgb, var(--accent-gold) 52%, var(--index-line));
}

.article-more-link {
  display: grid;
  place-items: center;
  min-height: 42px;
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 78%, transparent);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
}

.article-more-link:hover,
.article-more-link:focus-visible {
  border-color: color-mix(in srgb, var(--accent-gold) 50%, var(--index-line));
  color: var(--accent-gold);
}

.article-toc {
  display: grid;
  gap: 8px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
}

.article-toc-link {
  display: block;
  min-height: 34px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--index-line) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 74%, transparent);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.35;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.article-toc-link.level-3 {
  padding-left: 18px;
}

.article-toc-link.level-4 {
  padding-left: 26px;
}

.article-toc-link.comments-link {
  color: color-mix(in srgb, var(--accent-gold) 78%, var(--text-main));
}

.article-toc-link:hover,
.article-toc-link:focus-visible {
  border-color: color-mix(in srgb, var(--accent-gold) 48%, var(--index-line));
}

@media (max-width: 720px) {
  .article-inline-header {
    margin-bottom: 20px;
    padding-bottom: 18px;
  }

  .article-inline-header h1 {
    max-width: none;
    font-size: 28px;
  }

  .article-cover-figure {
    aspect-ratio: 16 / 10;
  }

  .article-primary-meta {
    gap: 8px;
  }

  .article-content-text {
    max-width: none;
    font-size: 15.5px;
    line-height: 1.78;
  }

  .article-related-link {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .article-related-cover {
    width: 64px;
  }
}
</style>
