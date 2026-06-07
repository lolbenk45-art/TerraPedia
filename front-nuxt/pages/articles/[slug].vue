<script setup lang="ts">
import type { ApiResponse, ArticleComment, ContentReferenceResolveInput, NormalizedContentReference, PublicItemRecipeTree, PublicItemRecipeTreeNode, PublicItemRecipeTreeVariant, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'
import { contentReferenceKey, resolvePublicContentReferences } from '~/composables/usePublicContentReferences'
import { fetchPublicRecipeTree } from '~/composables/usePublicRecipeTree'
import {
  createArticleComment,
  createArticleCommentReply,
  deleteOwnArticleComment,
  extractUserApiError,
  fetchArticleCommentReplies,
  fetchArticleComments,
  likeArticleComment,
  unlikeArticleComment,
} from '~/composables/useUserApi'

const route = useRoute()
const authStore = useUserAuthStore()
const favoritesStore = useUserFavoritesStore()
const historyStore = useUserHistoryStore()
const favoriteError = ref('')
const articleClientReady = ref(false)
const initialArticleFavorite = ref<{ id: string, favorite: boolean } | null>(null)
const articleComments = ref<ArticleComment[]>([])
const articleCommentPagination = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const articleCommentsLoading = ref(false)
const articleCommentLoadingSlotCount = 3
const articleCommentText = ref('')
const articleCommentSubmitting = ref(false)
const articleCommentDeletingId = ref<number | null>(null)
const articleCommentError = ref('')
const articleCommentReplyText = ref('')
const articleCommentReplyTarget = ref<{ rootId: number, replyToCommentId: number, replyToDisplayName: string | null } | null>(null)
const articleCommentReplySubmitting = ref(false)
const articleCommentReplyLoadingIds = ref<Set<number>>(new Set())
const articleCommentReplyPagination = ref<Record<string, { total: number, page: number, limit: number, totalPages: number }>>({})
const articleCommentLikeMutatingIds = ref<Set<number>>(new Set())
const articleCommentTargetHighlightId = ref<number | null>(null)
const articleCommentTargetFocusing = ref(false)
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

const isDefaultRecipeTreeVariant = (variant: PublicItemRecipeTreeVariant) => {
  const text = firstRecipeTreeText(variant.versionScope, variant.variantKey, variant.variantLabel).toLowerCase()
  return /(^|[^a-z])(pc|desktop|default|电脑版|电脑|默认)([^a-z]|$)/i.test(text)
}

const recipeTreeRootNodes = (tree: PublicItemRecipeTree | null | undefined): PublicItemRecipeTreeNode[] => {
  if (!tree) return []
  const variants = Array.isArray(tree.variants) ? tree.variants : []
  const preferredVariant = variants.find(variant => isDefaultRecipeTreeVariant(variant) && Array.isArray(variant.roots) && variant.roots.length > 0)
    || variants.find(variant => Array.isArray(variant.roots) && variant.roots.length > 0)
  const preferredRoots = Array.isArray(preferredVariant?.roots) ? preferredVariant.roots : []
  if (preferredRoots.length) return preferredRoots.slice(0, 1)
  for (const nodes of [tree.materials, tree.ingredients, tree.children, tree.nodes]) {
    if (Array.isArray(nodes) && nodes.length) return nodes.slice(0, 1)
  }
  return []
}

const recipeTreeStationCount = (tree: PublicItemRecipeTree | null | undefined) => {
  if (!tree) return 0
  const stationKeys = new Set<string>()
  const addStation = (station: { stationItemId?: number | string | null, stationName?: string | null, stationNameZh?: string | null, name?: string | null, displayName?: string | null } | null | undefined) => {
    if (!station) return
    const key = firstRecipeTreeText(station.stationItemId, station.stationNameZh, station.stationName, station.displayName, station.name)
    if (key) stationKeys.add(key)
  }
  for (const station of tree.stations || []) addStation(station)
  for (const station of tree.craftingStations || []) addStation(station)
  for (const root of recipeTreeRootNodes(tree)) {
    for (const station of root.stations || []) addStation(station)
  }
  return stationKeys.size
}

const recipeTreeNodeName = (node: PublicItemRecipeTreeNode) => firstRecipeTreeText(
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.name,
  node.itemInternalName,
  '材料',
)

const recipeTreeNodeQuantity = (node: PublicItemRecipeTreeNode, isRoot = false) => {
  const quantityText = firstRecipeTreeText(node.quantityText)
  if (quantityText) return `x${quantityText.replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) return `x${node.quantityMin}-${node.quantityMax}`
  const directQuantity = firstRecipeTreeText(node.quantityMin, node.quantity, node.amount, node.count)
  if (directQuantity) return `x${directQuantity.replace(/^x/i, '')}`
  const resultQuantity = Number(node.resultQuantity)
  return isRoot && Number.isFinite(resultQuantity) && resultQuantity > 0 && resultQuantity <= 99 ? `x${resultQuantity}` : 'x1'
}

const recipeTreeNodeImage = (node: PublicItemRecipeTreeNode) => sanitizeArticleUrl(firstRecipeTreeText(
  node.itemImage,
  node.itemImageUrl,
  node.image,
  node.previewImage,
  Array.isArray(node.groupMembers) ? node.groupMembers[0]?.image : '',
  Array.isArray(node.groupMembers) ? node.groupMembers[0]?.imageUrl : '',
), 'src')

const recipeTreeStationName = (station: { stationName?: string | null, stationNameZh?: string | null, name?: string | null, displayName?: string | null, stationInternalName?: string | null } | null | undefined) => firstRecipeTreeText(
  station?.displayName,
  station?.stationNameZh,
  station?.stationName,
  station?.name,
  station?.stationInternalName,
)

const recipeTreeStationImage = (station: { stationImage?: string | null, itemImage?: string | null, itemImageUrl?: string | null, image?: string | null } | null | undefined) => sanitizeArticleUrl(firstRecipeTreeText(
  station?.stationImage,
  station?.itemImage,
  station?.itemImageUrl,
  station?.image,
), 'src')

const recipeTreeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []

const recipeTreeNodeKey = (node: PublicItemRecipeTreeNode) => firstRecipeTreeText(
  node.itemId,
  node.id,
  node.itemInternalName,
  node.itemName,
  node.displayName,
  node.name,
)

const recipeTreeGroupMemberName = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => firstRecipeTreeText(
  member.nameZh,
  member.name,
  member.internalName,
  '可替代材料',
)

const recipeTreeGroupMemberImage = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => sanitizeArticleUrl(firstRecipeTreeText(
  member.image,
  member.imageUrl,
), 'src')

const recipeTreeNodeGroupMember = (node: PublicItemRecipeTreeNode) => ({
  itemId: node.itemId,
  internalName: node.itemInternalName || node.itemName || node.name || null,
  name: node.itemName || node.name || node.displayName || null,
  nameZh: node.displayName || node.itemNameZh || node.name || null,
  image: node.itemImage || node.image || node.previewImage || null,
  imageUrl: node.itemImageUrl || null,
})

const mergeArticleRecipeTreeAlternativeChildren = (options: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  if (options.length > 1 && options.every(option => recipeTreeNodeChildren(option).length > 0)) {
    const firstOption = options[0]
    if (firstOption) {
      return [{
        ...firstOption,
        displayName: recipeTreeNodeName(firstOption),
        children: [{
          nodeType: 'recipe_options',
          displayName: `${recipeTreeNodeName(firstOption)} · ${options.length} 条配方来源`,
          secondaryName: '多配方来源',
          children: [],
          recipeOptions: options.map(option => mergeArticleRecipeTreeSameItemSiblings(recipeTreeNodeChildren(option))),
        } as PublicItemRecipeTreeNode & { recipeOptions: PublicItemRecipeTreeNode[][] }],
      }]
    }
  }

  const optionChildren = options.map(option => recipeTreeNodeChildren(option))
  const counts = new Map<string, number>()
  for (const children of optionChildren) {
    const uniqueKeys = new Set(children.map(recipeTreeNodeKey).filter(Boolean))
    for (const key of uniqueKeys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const sharedKeys = new Set([...counts.entries()].filter(([, count]) => count === options.length).map(([key]) => key))
  const shared = new Map<string, PublicItemRecipeTreeNode>()
  const alternatives: PublicItemRecipeTreeNode[] = []

  for (const children of optionChildren) {
    for (const child of children) {
      const key = recipeTreeNodeKey(child)
      if (key && sharedKeys.has(key)) {
        if (!shared.has(key)) shared.set(key, child)
      } else {
        alternatives.push(child)
      }
    }
  }

  const ordered: PublicItemRecipeTreeNode[] = []
  let alternativeInserted = false
  for (const child of optionChildren[0] ?? []) {
    const key = recipeTreeNodeKey(child)
    if (key && sharedKeys.has(key)) {
      const sharedChild = shared.get(key)
      if (sharedChild && !ordered.some(entry => recipeTreeNodeKey(entry) === key)) ordered.push(sharedChild)
    } else if (!alternativeInserted && alternatives.length > 0) {
      const firstAlternative = alternatives[0]
      if (firstAlternative) {
        ordered.push({
          ...firstAlternative,
          displayName: alternatives.map(recipeTreeNodeName).join(' 或 '),
          secondaryName: '可替代材料',
          itemInternalName: alternatives.map(node => firstRecipeTreeText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '),
          groupMembers: alternatives.map(recipeTreeNodeGroupMember),
          children: [],
        })
        alternativeInserted = true
      }
    }
  }

  for (const [key, child] of shared) {
    if (!ordered.some(entry => recipeTreeNodeKey(entry) === key)) ordered.push(child)
  }
  if (!alternativeInserted && alternatives.length > 0) {
    const firstAlternative = alternatives[0]
    if (firstAlternative) {
      ordered.unshift({
        ...firstAlternative,
        displayName: alternatives.map(recipeTreeNodeName).join(' 或 '),
        secondaryName: '可替代材料',
        itemInternalName: alternatives.map(node => firstRecipeTreeText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '),
        groupMembers: alternatives.map(recipeTreeNodeGroupMember),
        children: [],
      })
    }
  }
  return ordered
}

const mergeArticleRecipeTreeSameItemSiblings = (nodes: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  const groups = new Map<string, PublicItemRecipeTreeNode[]>()
  const order: string[] = []
  for (const node of nodes) {
    const key = `${recipeTreeNodeKey(node)}:${firstRecipeTreeText(node.quantityText, node.quantityMin, node.quantityMax, node.quantity, node.amount, node.count)}`
    if (!key.trim()) {
      const uniqueKey = `unique:${order.length}`
      order.push(uniqueKey)
      groups.set(uniqueKey, [node])
      continue
    }
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)?.push(node)
  }
  return order.flatMap((key) => {
    const group = groups.get(key) ?? []
    const first = group[0]
    if (group.length <= 1 || !first) return group
    return [{
      ...first,
      children: mergeArticleRecipeTreeAlternativeChildren(group),
    }]
  })
}

const recipeTreeNodeStations = (node: PublicItemRecipeTreeNode) => {
  const stations = (Array.isArray(node.stations) ? node.stations : []).filter(station => station?.stationType !== 'condition')
  if (stations.length) return stations
  const sameItemChild = recipeTreeNodeChildren(node).find(child => isSameRecipeTreeItem(node, child) && Array.isArray(child.stations) && child.stations.length > 0)
  return (Array.isArray(sameItemChild?.stations) ? sameItemChild.stations : []).filter(station => station?.stationType !== 'condition')
}

const isSameRecipeTreeItem = (left: PublicItemRecipeTreeNode, right: PublicItemRecipeTreeNode) => {
  const leftId = firstRecipeTreeText(left.itemId, left.id)
  const rightId = firstRecipeTreeText(right.itemId, right.id)
  if (leftId && rightId) return leftId === rightId
  const leftName = firstRecipeTreeText(left.itemInternalName, left.itemName, left.name, left.displayName)
  const rightName = firstRecipeTreeText(right.itemInternalName, right.itemName, right.name, right.displayName)
  return Boolean(leftName && rightName && leftName === rightName)
}

const recipeTreeGraphChildren = (node: PublicItemRecipeTreeNode, depth: number, maxDepth: number): PublicItemRecipeTreeNode[] => {
  if (depth >= maxDepth) return []
  let candidates = recipeTreeNodeChildren(node)
  while (candidates.length === 1 && candidates[0] && isSameRecipeTreeItem(node, candidates[0])) {
    const nextChildren = recipeTreeNodeChildren(candidates[0])
    if (!nextChildren.length) break
    candidates = nextChildren
  }
  if (candidates.length > 1 && candidates.every(child => isSameRecipeTreeItem(node, child))) {
    return mergeArticleRecipeTreeAlternativeChildren(candidates).slice(0, 18)
  }
  return mergeArticleRecipeTreeSameItemSiblings(candidates).slice(0, 18)
}

const ARTICLE_RECIPE_GRAPH_CARD_WIDTH = 102
const ARTICLE_RECIPE_GRAPH_OPTION_SOURCE_WIDTH = 150
const ARTICLE_RECIPE_GRAPH_CARD_HEIGHT = 54
const ARTICLE_RECIPE_GRAPH_X_GAP = 6
const ARTICLE_RECIPE_GRAPH_Y_GAP = 10
const ARTICLE_RECIPE_GRAPH_PADDING = 14
const ARTICLE_RECIPE_GRAPH_MIN_SCALE = 0.48
const ARTICLE_RECIPE_GRAPH_MAX_SCALE = 1
const ARTICLE_RECIPE_GRAPH_MIN_MANUAL_SCALE = 0.6
const ARTICLE_RECIPE_GRAPH_MAX_MANUAL_SCALE = 1.8
const ARTICLE_RECIPE_GRAPH_MANUAL_SCALE_STEP = 0.1

const buildArticleRecipeTreeGraphLayout = (node: PublicItemRecipeTreeNode, depth: number, maxDepth: number, indexPath = '0', isRoot = false): any => {
  let normalizedNode = node
  let graphChildren = recipeTreeGraphChildren(normalizedNode, depth, maxDepth)
  while (graphChildren.length === 1 && graphChildren[0] && isSameRecipeTreeItem(normalizedNode, graphChildren[0])) {
    normalizedNode = graphChildren[0]
    graphChildren = recipeTreeGraphChildren(normalizedNode, depth, maxDepth)
  }
  const children = graphChildren
    .map((child, index) => buildArticleRecipeTreeGraphLayout(child, depth + 1, maxDepth, `${indexPath}-${index}`, false))
  const itemKey = firstRecipeTreeText(normalizedNode.recipeId, normalizedNode.itemId, normalizedNode.id, normalizedNode.itemInternalName, normalizedNode.itemName, normalizedNode.displayName, normalizedNode.name, indexPath)
  const width = recipeTreeNodeCardWidth(normalizedNode)
  const height = recipeTreeNodeCardHeight(normalizedNode)
  return {
    id: `${depth}-${indexPath}-${itemKey}`,
    node: normalizedNode,
    depth,
    isRoot,
    x: 0,
    y: 0,
    width,
    height,
    anchorX: width / 2,
    subtreeWidth: width,
    children,
  }
}

const measureArticleRecipeTreeGraphLayout = (layoutNode: any): number => {
  if (!layoutNode.children.length) {
    layoutNode.subtreeWidth = layoutNode.width
    return layoutNode.subtreeWidth
  }
  const childWidth = layoutNode.children.reduce((total: number, child: any, index: number) =>
    total + measureArticleRecipeTreeGraphLayout(child) + (index === 0 ? 0 : ARTICLE_RECIPE_GRAPH_X_GAP), 0)
  layoutNode.subtreeWidth = Math.max(layoutNode.width, childWidth)
  return layoutNode.subtreeWidth
}

const placeArticleRecipeTreeGraphLayout = (layoutNode: any, left: number, levelY: number[], nodes: any[], edges: any[]) => {
  layoutNode.x = left + layoutNode.subtreeWidth / 2 - layoutNode.anchorX
  layoutNode.y = levelY[layoutNode.depth] ?? 0
  nodes.push(layoutNode)
  if (!layoutNode.children.length) return

  const childWidth = layoutNode.children.reduce((total: number, child: any, index: number) =>
    total + child.subtreeWidth + (index === 0 ? 0 : ARTICLE_RECIPE_GRAPH_X_GAP), 0)
  let childLeft = left + (layoutNode.subtreeWidth - childWidth) / 2
  for (const child of layoutNode.children) {
    placeArticleRecipeTreeGraphLayout(child, childLeft, levelY, nodes, edges)
    edges.push({
      id: `${layoutNode.id}-${child.id}`,
      fromX: layoutNode.x + layoutNode.anchorX,
      fromY: layoutNode.y + layoutNode.height,
      toX: child.x + child.anchorX,
      toY: child.y,
    })
    childLeft += child.subtreeWidth + ARTICLE_RECIPE_GRAPH_X_GAP
  }
}

const layoutArticleRecipeTreeGraphForest = (roots: PublicItemRecipeTreeNode[], maxDepth: number) => {
  const rootLayouts = roots.slice(0, 1).map((root, index) => buildArticleRecipeTreeGraphLayout(root, 0, maxDepth, String(index), true))
  const nodes: any[] = []
  const edges: any[] = []
  const levelHeights: number[] = []
  const collectLevelHeights = (layoutNode: any) => {
    levelHeights[layoutNode.depth] = Math.max(levelHeights[layoutNode.depth] ?? 0, layoutNode.height)
    for (const child of layoutNode.children) collectLevelHeights(child)
  }
  for (const rootLayout of rootLayouts) collectLevelHeights(rootLayout)
  const levelY = levelHeights.reduce<number[]>((offsets, height, index) => {
    offsets[index] = index === 0 ? 0 : (offsets[index - 1] ?? 0) + (levelHeights[index - 1] ?? ARTICLE_RECIPE_GRAPH_CARD_HEIGHT) + ARTICLE_RECIPE_GRAPH_Y_GAP
    return offsets
  }, [])
  let left = 0
  for (const rootLayout of rootLayouts) {
    measureArticleRecipeTreeGraphLayout(rootLayout)
    placeArticleRecipeTreeGraphLayout(rootLayout, left, levelY, nodes, edges)
    left += rootLayout.subtreeWidth + ARTICLE_RECIPE_GRAPH_X_GAP * 2
  }
  if (!nodes.length) return { nodes, edges, width: 0, height: 0 }

  const minX = Math.min(...nodes.map(node => node.x))
  const maxX = Math.max(...nodes.map(node => node.x + node.width))
  const minY = Math.min(...nodes.map(node => node.y))
  const maxY = Math.max(...nodes.map(node => node.y + node.height))
  const offsetX = ARTICLE_RECIPE_GRAPH_PADDING - minX
  const offsetY = ARTICLE_RECIPE_GRAPH_PADDING - minY
  for (const node of nodes) {
    node.x += offsetX
    node.y += offsetY
  }
  for (const edge of edges) {
    edge.fromX += offsetX
    edge.toX += offsetX
    edge.fromY += offsetY
    edge.toY += offsetY
  }
  return {
    nodes,
    edges,
    width: maxX - minX + ARTICLE_RECIPE_GRAPH_PADDING * 2,
    height: maxY - minY + ARTICLE_RECIPE_GRAPH_PADDING * 2,
  }
}

const articleRecipeTreeGroupMembers = (node: PublicItemRecipeTreeNode) => Array.isArray(node.groupMembers) ? node.groupMembers : []

const articleRecipeTreeOptionGroups = (node: PublicItemRecipeTreeNode) =>
  node.nodeType === 'recipe_options' && Array.isArray((node as PublicItemRecipeTreeNode & { recipeOptions?: PublicItemRecipeTreeNode[][] }).recipeOptions)
    ? (node as PublicItemRecipeTreeNode & { recipeOptions: PublicItemRecipeTreeNode[][] }).recipeOptions
    : []

const recipeTreeNodeCardWidth = (node: PublicItemRecipeTreeNode) =>
  articleRecipeTreeOptionGroups(node).length > 0 ? ARTICLE_RECIPE_GRAPH_OPTION_SOURCE_WIDTH : ARTICLE_RECIPE_GRAPH_CARD_WIDTH

const recipeTreeNodeCardHeight = (node: PublicItemRecipeTreeNode) => {
  const optionRows = articleRecipeTreeOptionGroups(node).length
  if (optionRows > 0) return Math.max(ARTICLE_RECIPE_GRAPH_CARD_HEIGHT, 12 + optionRows * 24)
  const members = articleRecipeTreeGroupMembers(node).length
  if (members <= 1) return ARTICLE_RECIPE_GRAPH_CARD_HEIGHT
  return Math.max(ARTICLE_RECIPE_GRAPH_CARD_HEIGHT, 20 + Math.ceil(members / 2) * 22 + 14)
}

const articleRecipeTreeRelationLabel = (node: PublicItemRecipeTreeNode, depth: number, isRoot = false) => {
  if (articleRecipeTreeOptionGroups(node).length > 0) return ''
  if (isRoot) return 'ROOT'
  const members = articleRecipeTreeGroupMembers(node)
  if (members.length > 1) return `任选 ${members.length}`
  return recipeTreeGraphChildren(node, depth, depth + 1).length > 0 ? '子配方' : '材料'
}

const articleRecipeTreeStationSummary = (node: PublicItemRecipeTreeNode) => {
  const stations = recipeTreeNodeStations(node)
  if (!stations.length) return ''
  const label = stations.map(recipeTreeStationName).filter(Boolean).join(' / ')
  return stations.length > 2 ? `${label} +${stations.length - 2}` : label
}

const articleRecipeTreeChildNameSummary = (node: PublicItemRecipeTreeNode, depth: number) => {
  const children = recipeTreeGraphChildren(node, depth, depth + 1)
  if (!children.length) return ''
  const names = children.map(recipeTreeNodeName).filter(Boolean)
  const visibleNames = names.slice(0, 4).join(' / ')
  return names.length > 4 ? `${visibleNames} +${names.length - 4}` : visibleNames
}

const articleRecipeTreeNodeDetailRows = (node: PublicItemRecipeTreeNode, depth: number, relation: string, quantity: string) => {
  const rows: Array<{ label: string, value: string }> = []
  const optionGroups = articleRecipeTreeOptionGroups(node)
  if (optionGroups.length) {
    rows.push({ label: '类型', value: '多配方来源' })
    rows.push({ label: '概况', value: `${optionGroups.length} 条配方 · ${optionGroups.reduce((total, option) => total + option.length, 0)} 个材料项` })
    return rows
  }

  rows.push({ label: '类型', value: relation || '材料' })
  if (quantity) rows.push({ label: '数量', value: quantity })
  const stations = articleRecipeTreeStationSummary(node)
  if (stations) rows.push({ label: '制作站', value: stations })
  const children = recipeTreeGraphChildren(node, depth, depth + 1)
  if (children.length) rows.push({ label: '下级', value: `${children.length} 个节点` })
  const childNames = articleRecipeTreeChildNameSummary(node, depth)
  if (childNames) rows.push({ label: '包含', value: childNames })
  const groupMembers = articleRecipeTreeGroupMembers(node)
  if (groupMembers.length > 1) rows.push({ label: '任选', value: groupMembers.map(recipeTreeGroupMemberName).filter(Boolean).join(' / ') })
  return rows
}

const articleRecipeTreeFirstGlyph = (value: string) => Array.from(String(value || '').trim())[0] ?? '?'

const createArticleRecipeTreePreviewImage = (imageUrl: string, label: string, width: number, height: number) => {
  const preview = document.createElement('span')
  preview.className = `item-art tp-preview-image${imageUrl ? '' : ' is-fallback'}`
  preview.setAttribute('data-fallback', articleRecipeTreeFirstGlyph(label))
  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    img.alt = label
    img.width = width
    img.height = height
    img.loading = 'lazy'
    img.decoding = 'async'
    preview.append(img)
  } else {
    preview.setAttribute('role', 'img')
    preview.setAttribute('aria-label', label)
  }
  return preview
}

const createArticleRecipeTreeGraphLineCanvas = (layout: any) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'recipe-overview-lines')
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`)
  svg.setAttribute('width', String(layout.width))
  svg.setAttribute('height', String(layout.height))
  svg.setAttribute('aria-hidden', 'true')
  for (const edge of layout.edges) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const midY = (edge.fromY + edge.toY) / 2
    path.setAttribute('class', 'recipe-overview-edge')
    path.setAttribute('d', `M ${edge.fromX} ${edge.fromY} V ${midY} H ${edge.toX} V ${edge.toY}`)
    svg.append(path)
  }
  return svg
}

const positionArticleRecipeTreePopover = (holder: HTMLElement, popover: HTMLElement) => {
  const anchor = holder.querySelector<HTMLElement>('.recipe-hierarchy-card') || holder
  const rect = anchor.getBoundingClientRect()
  const margin = 12
  const gap = 8
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 320
  const maxWidth = Math.max(160, Math.min(240, viewportWidth - margin * 2))
  const popoverWidth = Math.min(popover.offsetWidth || maxWidth, maxWidth)
  const popoverHeight = Math.min(popover.offsetHeight || 132, viewportHeight - margin * 2)
  const aboveSpace = rect.top - margin - gap
  const belowSpace = viewportHeight - rect.bottom - margin - gap
  const placement = aboveSpace >= popoverHeight || aboveSpace >= belowSpace ? 'above' : 'below'
  const preferredTop = placement === 'above' ? rect.top - popoverHeight - gap : rect.bottom + gap
  const top = Math.max(margin, Math.min(preferredTop, viewportHeight - popoverHeight - margin))
  const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - popoverWidth / 2, viewportWidth - popoverWidth - margin))

  popover.dataset.placement = placement
  popover.style.left = `${Math.round(left)}px`
  popover.style.top = `${Math.round(top)}px`
  popover.style.maxWidth = `${Math.round(maxWidth)}px`
  popover.style.setProperty('--recipe-popover-max-height', `${Math.round(viewportHeight - margin * 2)}px`)
}

const showArticleRecipeTreePopover = (holder: HTMLElement, popover: HTMLElement) => {
  holder.dataset.popoverActive = 'true'
  popover.dataset.articleRecipeTreePopover = 'true'
  if (popover.parentElement !== document.body) document.body.append(popover)
  popover.classList.add('is-visible')
  positionArticleRecipeTreePopover(holder, popover)
  requestAnimationFrame(() => positionArticleRecipeTreePopover(holder, popover))
}

const hideArticleRecipeTreePopover = (holder: HTMLElement, popover: HTMLElement) => {
  delete holder.dataset.popoverActive
  delete popover.dataset.articleRecipeTreePopover
  popover.classList.remove('is-visible')
  holder.append(popover)
}

const createArticleRecipeTreeGraphPositionedNode = (layoutNode: any) => {
  const holder = document.createElement('div')
  holder.className = `recipe-hierarchy-node recipe-overview-node${layoutNode.isRoot ? ' is-root' : ''}${layoutNode.children.length ? ' has-children' : ''}`
  holder.style.setProperty('--node-x', `${layoutNode.x}px`)
  holder.style.setProperty('--node-y', `${layoutNode.y}px`)
  holder.style.setProperty('--node-card-width', `${layoutNode.width}px`)
  holder.style.setProperty('--node-card-height', `${layoutNode.height}px`)

  const relation = document.createElement('span')
  relation.className = 'recipe-hierarchy-label'
  const relationText = articleRecipeTreeRelationLabel(layoutNode.node, layoutNode.depth, layoutNode.isRoot)
  relation.textContent = relationText
  holder.append(relation)

  const card = document.createElement('span')
  const optionGroups = articleRecipeTreeOptionGroups(layoutNode.node)
  if (optionGroups.length) holder.classList.add('has-recipe-options')
  const stations = recipeTreeNodeStations(layoutNode.node).slice(0, 2)
  card.className = `recipe-hierarchy-card${stations.length && !optionGroups.length ? ' has-stations' : ''}${optionGroups.length ? ' has-recipe-options' : ''}`
  card.title = `${recipeTreeNodeName(layoutNode.node)} ${recipeTreeNodeQuantity(layoutNode.node, layoutNode.isRoot)}`
  card.setAttribute('aria-label', card.title)

  const main = document.createElement('span')
  main.className = 'recipe-hierarchy-main'
  main.title = recipeTreeNodeName(layoutNode.node)

  if (optionGroups.length) {
    const source = document.createElement('span')
    source.className = 'recipe-hierarchy-option-source'
    source.title = recipeTreeNodeName(layoutNode.node)
    source.setAttribute('aria-label', '多配方来源')
    const rows = document.createElement('span')
    rows.className = 'recipe-hierarchy-option-groups'
    for (const [optionIndex, option] of optionGroups.entries()) {
      const row = document.createElement('span')
      row.className = 'recipe-hierarchy-option-row'
      row.title = option.map(recipeTreeNodeName).join(' + ')
      row.setAttribute('data-recipe-option-index', String(optionIndex + 1))
      for (const material of option.slice(0, 5)) {
        const materialNode = document.createElement('span')
        materialNode.className = 'recipe-hierarchy-option-material'
        materialNode.title = `${recipeTreeNodeName(material)} ${recipeTreeNodeQuantity(material)}`
        materialNode.append(createArticleRecipeTreePreviewImage(recipeTreeNodeImage(material), recipeTreeNodeName(material), 18, 18))
        const quantity = document.createElement('span')
        quantity.className = 'recipe-hierarchy-option-quantity'
        quantity.textContent = recipeTreeNodeQuantity(material)
        materialNode.append(quantity)
        row.append(materialNode)
      }
      rows.append(row)
    }
    source.append(rows)
    main.append(source)
  } else if (articleRecipeTreeGroupMembers(layoutNode.node).length > 1) {
    const alternatives = document.createElement('span')
    alternatives.className = 'recipe-hierarchy-alt-images'
    alternatives.title = articleRecipeTreeGroupMembers(layoutNode.node).map(recipeTreeGroupMemberName).filter(Boolean).join(' / ')
    alternatives.setAttribute('aria-label', '可替代材料')
    for (const member of articleRecipeTreeGroupMembers(layoutNode.node).slice(0, 4)) {
      alternatives.append(createArticleRecipeTreePreviewImage(recipeTreeGroupMemberImage(member), recipeTreeGroupMemberName(member), 22, 22))
    }
    main.append(alternatives)
  } else {
    main.append(createArticleRecipeTreePreviewImage(recipeTreeNodeImage(layoutNode.node), recipeTreeNodeName(layoutNode.node), layoutNode.isRoot ? 34 : 30, layoutNode.isRoot ? 34 : 30))
    const quantity = document.createElement('span')
    quantity.className = 'recipe-hierarchy-quantity'
    quantity.textContent = recipeTreeNodeQuantity(layoutNode.node, layoutNode.isRoot)
    main.append(quantity)
  }

  card.append(main)
  if (stations.length && !optionGroups.length) {
    const stationRail = document.createElement('span')
    stationRail.className = 'recipe-hierarchy-station-rail'
    stationRail.title = stations.map(recipeTreeStationName).filter(Boolean).join(' / ')
    stationRail.setAttribute('aria-label', '制作站')
    for (const station of stations) {
      const badge = document.createElement('span')
      badge.className = 'recipe-hierarchy-station-badge'
      badge.title = recipeTreeStationName(station)
      badge.append(createArticleRecipeTreePreviewImage(recipeTreeStationImage(station), recipeTreeStationName(station), 18, 18))
      stationRail.append(badge)
    }
    card.append(stationRail)
  }
  holder.append(card)

  const popover = document.createElement('aside')
  popover.className = 'recipe-hierarchy-popover crafting-screen'
  popover.setAttribute('role', 'tooltip')
  const popoverHead = document.createElement('span')
  popoverHead.className = 'recipe-hierarchy-popover-head'
  const popoverImages = document.createElement('span')
  popoverImages.className = 'recipe-hierarchy-popover-images'
  const optionImages = optionGroups.length ? optionGroups.flat().slice(0, 4) : []
  if (optionImages.length) {
    for (const material of optionImages) {
      popoverImages.append(createArticleRecipeTreePreviewImage(recipeTreeNodeImage(material), recipeTreeNodeName(material), 26, 26))
    }
  } else if (articleRecipeTreeGroupMembers(layoutNode.node).length > 1) {
    for (const member of articleRecipeTreeGroupMembers(layoutNode.node).slice(0, 4)) {
      popoverImages.append(createArticleRecipeTreePreviewImage(recipeTreeGroupMemberImage(member), recipeTreeGroupMemberName(member), 26, 26))
    }
  } else {
    popoverImages.append(createArticleRecipeTreePreviewImage(recipeTreeNodeImage(layoutNode.node), recipeTreeNodeName(layoutNode.node), 26, 26))
  }
  const popoverTitle = document.createElement('span')
  popoverTitle.className = 'recipe-hierarchy-popover-title'
  const title = document.createElement('b')
  title.textContent = recipeTreeNodeName(layoutNode.node)
  const subtitle = document.createElement('span')
  subtitle.textContent = articleRecipeTreeGroupMembers(layoutNode.node).length > 1 ? '可替代材料' : firstRecipeTreeText(layoutNode.node.secondaryName, layoutNode.node.itemInternalName, layoutNode.node.itemName)
  popoverTitle.append(title)
  if (subtitle.textContent) popoverTitle.append(subtitle)
  popoverHead.append(popoverImages, popoverTitle)
  const detailList = document.createElement('dl')
  for (const row of articleRecipeTreeNodeDetailRows(layoutNode.node, layoutNode.depth, relationText, recipeTreeNodeQuantity(layoutNode.node, layoutNode.isRoot))) {
    const term = document.createElement('dt')
    term.textContent = row.label
    const description = document.createElement('dd')
    description.textContent = row.value
    detailList.append(term, description)
  }
  popover.append(popoverHead, detailList)
  holder.append(popover)
  holder.onmouseenter = () => showArticleRecipeTreePopover(holder, popover)
  holder.onmouseleave = () => hideArticleRecipeTreePopover(holder, popover)
  holder.addEventListener('focusin', () => showArticleRecipeTreePopover(holder, popover))
  holder.addEventListener('focusout', () => hideArticleRecipeTreePopover(holder, popover))
  return holder
}

const updateArticleRecipeTreeZoom = (graph: HTMLElement) => {
  const baseScale = Number(graph.dataset.baseScale || '1')
  const manualScale = Number(graph.dataset.manualScale || '1')
  const layoutHeight = Number(graph.dataset.layoutHeight || '0')
  const scale = Math.max(ARTICLE_RECIPE_GRAPH_MIN_SCALE, Math.min(ARTICLE_RECIPE_GRAPH_MAX_MANUAL_SCALE, baseScale * manualScale))
  graph.style.setProperty('--recipe-overview-scale', String(scale))
  graph.style.setProperty('--recipe-overview-pan-x', `${Number(graph.dataset.panX || '0')}px`)
  graph.style.setProperty('--recipe-overview-pan-y', `${Number(graph.dataset.panY || '0')}px`)
  graph.style.minHeight = `${Math.ceil(layoutHeight * baseScale)}px`
  const activeHolder = graph.querySelector<HTMLElement>('.recipe-overview-node[data-popover-active="true"]')
  const activePopover = activeHolder?.querySelector<HTMLElement>('.recipe-hierarchy-popover') || document.body.querySelector<HTMLElement>('.recipe-hierarchy-popover[data-article-recipe-tree-popover="true"]')
  if (activeHolder && activePopover) requestAnimationFrame(() => positionArticleRecipeTreePopover(activeHolder, activePopover))
}

const changeArticleRecipeTreeZoomFromWheel = (graph: HTMLElement, event: WheelEvent) => {
  event.preventDefault()
  const current = Number(graph.dataset.manualScale || '1')
  const delta = event.deltaY > 0 ? -ARTICLE_RECIPE_GRAPH_MANUAL_SCALE_STEP : ARTICLE_RECIPE_GRAPH_MANUAL_SCALE_STEP
  graph.dataset.manualScale = String(Math.max(ARTICLE_RECIPE_GRAPH_MIN_MANUAL_SCALE, Math.min(ARTICLE_RECIPE_GRAPH_MAX_MANUAL_SCALE, Number((current + delta).toFixed(2)))))
  updateArticleRecipeTreeZoom(graph)
}

const startArticleRecipeTreePan = (graph: HTMLElement, event: PointerEvent) => {
  if ((event.target as HTMLElement | null)?.closest('.recipe-overview-node')) return
  graph.dataset.panPointerId = String(event.pointerId)
  graph.dataset.panStartX = String(event.clientX)
  graph.dataset.panStartY = String(event.clientY)
  graph.dataset.panOriginX = graph.dataset.panX || '0'
  graph.dataset.panOriginY = graph.dataset.panY || '0'
  graph.classList.add('is-panning')
  graph.setPointerCapture(event.pointerId)
}

const moveArticleRecipeTreePan = (graph: HTMLElement, event: PointerEvent) => {
  if (graph.dataset.panPointerId !== String(event.pointerId)) return
  graph.dataset.panX = String(Number(graph.dataset.panOriginX || '0') + event.clientX - Number(graph.dataset.panStartX || '0'))
  graph.dataset.panY = String(Number(graph.dataset.panOriginY || '0') + event.clientY - Number(graph.dataset.panStartY || '0'))
  updateArticleRecipeTreeZoom(graph)
}

const endArticleRecipeTreePan = (graph: HTMLElement, event: PointerEvent) => {
  if (graph.dataset.panPointerId !== String(event.pointerId)) return
  if (graph.hasPointerCapture?.(event.pointerId)) graph.releasePointerCapture(event.pointerId)
  delete graph.dataset.panPointerId
  graph.classList.remove('is-panning')
}

const enableArticleRecipeTreeInteractions = (graph: HTMLElement) => {
  graph.addEventListener('wheel', event => changeArticleRecipeTreeZoomFromWheel(graph, event), { passive: false })
  graph.addEventListener('pointerdown', event => startArticleRecipeTreePan(graph, event))
  graph.addEventListener('pointermove', event => moveArticleRecipeTreePan(graph, event))
  graph.addEventListener('pointerup', event => endArticleRecipeTreePan(graph, event))
  graph.addEventListener('pointercancel', event => endArticleRecipeTreePan(graph, event))
}

const appendArticleRecipeTreeGraph = (container: HTMLElement, roots: PublicItemRecipeTreeNode[], maxDepth: number) => {
  if (!roots.length) return
  const layout = layoutArticleRecipeTreeGraphForest(roots, maxDepth)
  if (!layout.nodes.length) return
  const graph = document.createElement('div')
  graph.className = 'article-recipe-tree__graph crafting-screen recipe-hierarchy-tree recipe-overview-tree'
  graph.setAttribute('data-crafting-role', 'recipe-hierarchy-tree')
  const availableWidth = Math.max(280, container.clientWidth ? container.clientWidth - 2 : 720)
  const widthScale = availableWidth / Math.max(layout.width, 1)
  const heightScale = 520 / Math.max(layout.height, 1)
  const scale = Math.max(ARTICLE_RECIPE_GRAPH_MIN_SCALE, Math.min(ARTICLE_RECIPE_GRAPH_MAX_SCALE, widthScale, heightScale))
  graph.style.setProperty('--recipe-overview-width', `${layout.width}px`)
  graph.style.setProperty('--recipe-overview-height', `${layout.height}px`)
  graph.dataset.baseScale = String(scale)
  graph.dataset.manualScale = '1'
  graph.dataset.layoutHeight = String(layout.height)
  graph.dataset.panX = '0'
  graph.dataset.panY = '0'
  const canvas = document.createElement('div')
  canvas.className = 'recipe-overview-canvas'
  canvas.append(createArticleRecipeTreeGraphLineCanvas(layout))
  for (const layoutNode of layout.nodes) canvas.append(createArticleRecipeTreeGraphPositionedNode(layoutNode))
  graph.append(canvas)
  const link = container.querySelector('.article-recipe-tree__link')
  updateArticleRecipeTreeZoom(graph)
  enableArticleRecipeTreeInteractions(graph)
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
  const roots = recipeTreeRootNodes(tree)
  const variantCount = Array.isArray(tree.variants) ? tree.variants.length : 0
  const stationCount = recipeTreeStationCount(tree)
  renderArticleRecipeTreeShell(node, 'ready', title, '文章嵌入的合成树摘要', {
    imageUrl: recipeTreeItemImage(tree),
    href,
    stats: [
      variantCount ? `${variantCount} 个版本` : '默认版本',
      '默认路线',
      stationCount ? `${stationCount} 个制作站` : '制作站未记录',
      `深度 ${maxDepth}`,
    ],
  })
  appendArticleRecipeTreeGraph(node, roots, maxDepth)
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
const articleCommentCount = computed(() => Number(articleCommentPagination.value.total ?? articleComments.value.length))
const articleCommentRedirectTarget = computed(() => {
  const path = route.fullPath.split('#')[0] || route.fullPath
  return `${path}#article-comments`
})
const articleCommentTargetId = computed(() => {
  const raw = Array.isArray(route.query.commentId) ? route.query.commentId[0] : route.query.commentId
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
})
const articleCommentTargetReplyId = computed(() => {
  const raw = Array.isArray(route.query.replyId) ? route.query.replyId[0] : route.query.replyId
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
})
const articleCommentLoginPath = computed(() => `/user/login?redirect=${encodeURIComponent(articleCommentRedirectTarget.value)}`)
const articleCommentCanSubmit = computed(() => articleCommentText.value.trim().length > 0 && articleCommentText.value.trim().length <= 1000 && !articleCommentSubmitting.value)
const articleCommentReplyCanSubmit = computed(() => articleCommentReplyText.value.trim().length > 0 && articleCommentReplyText.value.trim().length <= 1000 && !articleCommentReplySubmitting.value)
const canLoadMoreArticleComments = computed(() => articleCommentPagination.value.page < articleCommentPagination.value.totalPages)
const formatCommentDate = (raw?: string | null) => {
  if (!raw) return '刚刚'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
const commentAuthorLabel = (comment: ArticleComment) => comment.authorDisplayName || 'TerraPedia 用户'
const commentAvatarFallback = (comment: ArticleComment) => commentAuthorLabel(comment).trim().slice(0, 1).toUpperCase() || 'T'
const commentAvatarUrl = (comment: ArticleComment) => resolvePreviewImageUrl(comment.authorAvatarUrl || '')
const canDeleteComment = (comment: ArticleComment) => Boolean(authStore.user?.id && Number(authStore.user.id) === Number(comment.authorId))
const commentContent = (comment: ArticleComment) => comment.deleted ? '该评论已删除' : comment.content
const shouldShowArticleCommentReplyTarget = (rootComment: ArticleComment, reply: ArticleComment) => {
  if (!reply.replyToDisplayName || reply.replyToUserId == null) return false
  return Number(reply.replyToUserId) !== Number(rootComment.authorId)
}
const isArticleCommentReplyLoading = (commentId: number) => articleCommentReplyLoadingIds.value.has(commentId)
const isArticleCommentLikeMutating = (commentId: number) => articleCommentLikeMutatingIds.value.has(commentId)
const articleCommentRepliesPagination = (commentId: number) => articleCommentReplyPagination.value[String(commentId)] ?? {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
}
const canLoadMoreArticleCommentReplies = (comment: ArticleComment) => {
  const pagination = articleCommentRepliesPagination(comment.id)
  const loadedCount = comment.replies.length
  const total = Math.max(Number(comment.replyCount ?? 0), pagination.total)
  return loadedCount < total || pagination.page < pagination.totalPages
}
const articleCommentRepliesTotal = (comment: ArticleComment) => {
  const pagination = articleCommentRepliesPagination(comment.id)
  return Math.max(Number(comment.replyCount ?? 0), pagination.total, comment.replies.length)
}
const articleCommentRepliesLoadedLabel = (comment: ArticleComment) => `${comment.replies.length} / ${articleCommentRepliesTotal(comment)}`
const nextArticleCommentRepliesPage = (comment: ArticleComment) => {
  const pagination = articleCommentReplyPagination.value[String(comment.id)]
  if (!pagination) return 1
  return pagination.page + 1
}
const setCommentReplyLoading = (commentId: number, loading: boolean) => {
  const next = new Set(articleCommentReplyLoadingIds.value)
  if (loading) next.add(commentId)
  else next.delete(commentId)
  articleCommentReplyLoadingIds.value = next
}
const setCommentLikeMutating = (commentId: number, mutating: boolean) => {
  const next = new Set(articleCommentLikeMutatingIds.value)
  if (mutating) next.add(commentId)
  else next.delete(commentId)
  articleCommentLikeMutatingIds.value = next
}
const findArticleComment = (commentId: number | null) => {
  if (!commentId) return null
  for (const comment of articleComments.value) {
    if (comment.id === commentId) return { root: comment, comment }
    const reply = comment.replies.find(item => item.id === commentId)
    if (reply) return { root: comment, comment: reply }
  }
  return null
}
const scrollArticleCommentIntoView = async (commentId: number | null) => {
  if (!import.meta.client) return
  await nextTick()
  const selector = commentId ? `[data-comment-id="${commentId}"]` : '#article-comments'
  const target = document.querySelector(selector) || document.querySelector('#article-comments')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const updateCommentInTree = (commentId: number, updater: (comment: ArticleComment) => ArticleComment) => {
  articleComments.value = articleComments.value.map((comment) => {
    if (comment.id === commentId) return updater(comment)
    if (comment.replies.some(reply => reply.id === commentId)) {
      return {
        ...comment,
        replies: comment.replies.map(reply => reply.id === commentId ? updater(reply) : reply),
      }
    }
    return comment
  })
}
const replaceArticleCommentInTree = (updatedComment: ArticleComment) => {
  updateCommentInTree(updatedComment.id, comment => ({
    ...comment,
    ...updatedComment,
    replies: updatedComment.replies.length ? updatedComment.replies : comment.replies,
  }))
}
const appendArticleComments = (records: ArticleComment[], replace = false) => {
  const visibleRecords = records.filter(comment => !comment.deleted)
  if (replace) {
    articleComments.value = visibleRecords
    return
  }
  const existingIds = new Set(articleComments.value.map(comment => comment.id))
  articleComments.value = [
    ...articleComments.value,
    ...visibleRecords.filter(comment => !existingIds.has(comment.id)),
  ]
}
const appendArticleCommentReplies = (rootId: number, records: ArticleComment[], replace = false) => {
  const visibleRecords = records.filter(comment => !comment.deleted)
  articleComments.value = articleComments.value.map((comment) => {
    if (comment.id !== rootId) return comment
    if (replace) return { ...comment, replies: visibleRecords }
    const existingIds = new Set(comment.replies.map(reply => reply.id))
    return {
      ...comment,
      replies: [
        ...comment.replies,
        ...visibleRecords.filter(reply => !existingIds.has(reply.id)),
      ],
    }
  })
}
const articleFavoriteStatus = computed(() => article.value?.id ? favoritesStore.getStatus('ARTICLE', article.value.id) : null)
const articleIsFavorite = computed(() => Boolean(articleFavoriteStatus.value?.favorite))
const displayedFavoriteCount = computed(() => {
  const serverFavorite = favoriteCountBase.value
  const articleId = article.value?.id == null ? '' : String(article.value.id)
  if (!articleId || articleFavoriteStatus.value == null || initialArticleFavorite.value?.id !== articleId) return serverFavorite
  if (initialArticleFavorite.value.favorite === articleIsFavorite.value) return serverFavorite
  return Math.max(0, serverFavorite + (articleIsFavorite.value ? 1 : -1))
})
const articleLoading = computed(() => !articleClientReady.value || (articlePending.value && !article.value))
const notFoundState = computed(() => articleClientReady.value && !articlePending.value && (!article.value || articleError.value))

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

const loadArticleComments = async (page = 1) => {
  if (!article.value?.id) return false
  articleCommentsLoading.value = true
  articleCommentError.value = ''
  try {
    const result = await fetchArticleComments(article.value.id, page, articleCommentPagination.value.limit)
    appendArticleComments(result.records, page <= 1)
    articleCommentPagination.value = result.pagination
    return true
  } catch (exception) {
    articleCommentError.value = extractUserApiError(exception, '评论加载失败。')
    return false
  } finally {
    articleCommentsLoading.value = false
  }
}

const loadMoreArticleComments = async () => {
  if (!canLoadMoreArticleComments.value || articleCommentsLoading.value) return
  await loadArticleComments(articleCommentPagination.value.page + 1)
}

const focusArticleCommentTarget = async () => {
  const rootTargetId = articleCommentTargetId.value
  const replyTargetId = articleCommentTargetReplyId.value
  if (!rootTargetId || !article.value?.id || articleCommentTargetFocusing.value) {
    if (!rootTargetId) await scrollArticleCommentIntoView(null)
    return
  }
  articleCommentTargetFocusing.value = true
  try {
    while (!findArticleComment(rootTargetId) && canLoadMoreArticleComments.value) {
      const nextPage = articleCommentPagination.value.page + 1
      const loaded = await loadArticleComments(nextPage)
      if (!loaded || articleCommentPagination.value.page < nextPage) break
    }
    const rootTarget = findArticleComment(rootTargetId)
    if (rootTarget?.root && replyTargetId) {
      while (!findArticleComment(replyTargetId) && canLoadMoreArticleCommentReplies(rootTarget.root)) {
        const nextPage = nextArticleCommentRepliesPage(rootTarget.root)
        const loaded = await loadArticleCommentReplies(rootTarget.root, nextPage)
        if (!loaded || articleCommentRepliesPagination(rootTarget.root.id).page < nextPage) break
      }
    }
    const highlightId = replyTargetId || rootTargetId
    articleCommentTargetHighlightId.value = highlightId
    await scrollArticleCommentIntoView(highlightId)
    window.setTimeout(() => {
      if (articleCommentTargetHighlightId.value === highlightId) articleCommentTargetHighlightId.value = null
    }, 4200)
  } finally {
    articleCommentTargetFocusing.value = false
  }
}

const loadArticleCommentReplies = async (comment: ArticleComment, page = 1) => {
  if (!article.value?.id) return false
  setCommentReplyLoading(comment.id, true)
  articleCommentError.value = ''
  try {
    const current = articleCommentRepliesPagination(comment.id)
    const result = await fetchArticleCommentReplies(article.value.id, comment.id, page, current.limit)
    appendArticleCommentReplies(comment.id, result.records, page <= 1)
    articleCommentReplyPagination.value = {
      ...articleCommentReplyPagination.value,
      [String(comment.id)]: result.pagination,
    }
    return true
  } catch (exception) {
    articleCommentError.value = extractUserApiError(exception, '回复加载失败。')
    return false
  } finally {
    setCommentReplyLoading(comment.id, false)
  }
}

const loadMoreArticleCommentReplies = async (comment: ArticleComment) => {
  if (isArticleCommentReplyLoading(comment.id)) return
  await loadArticleCommentReplies(comment, nextArticleCommentRepliesPage(comment))
}

const requireArticleCommentLogin = async () => {
  await authStore.init()
  if (authStore.isAuthenticated) return true
  await navigateTo(articleCommentLoginPath.value)
  return false
}

const submitArticleComment = async () => {
  if (!article.value?.id) return
  const content = articleCommentText.value.trim()
  if (!content || content.length > 1000) return
  articleCommentSubmitting.value = true
  articleCommentError.value = ''
  try {
    if (!await requireArticleCommentLogin()) return
    await createArticleComment(article.value.id, content)
    articleCommentText.value = ''
    await loadArticleComments(1)
  } catch (exception) {
    articleCommentError.value = extractUserApiError(exception, '评论发布失败。')
  } finally {
    articleCommentSubmitting.value = false
  }
}

const openArticleCommentReplyForm = async (rootComment: ArticleComment, replyToComment?: ArticleComment) => {
  if (!await requireArticleCommentLogin()) return
  articleCommentReplyTarget.value = {
    rootId: rootComment.id,
    replyToCommentId: replyToComment?.id ?? rootComment.id,
    replyToDisplayName: replyToComment ? commentAuthorLabel(replyToComment) : null,
  }
  articleCommentReplyText.value = ''
  if (!rootComment.replies.length && Number(rootComment.replyCount ?? 0) > 0) {
    await loadArticleCommentReplies(rootComment, 1)
  }
}

const cancelArticleCommentReply = () => {
  articleCommentReplyTarget.value = null
  articleCommentReplyText.value = ''
}

const submitArticleCommentReply = async (rootComment: ArticleComment) => {
  if (!article.value?.id || articleCommentReplyTarget.value?.rootId !== rootComment.id) return
  const content = articleCommentReplyText.value.trim()
  if (!content || content.length > 1000) return
  articleCommentReplySubmitting.value = true
  articleCommentError.value = ''
  try {
    if (!await requireArticleCommentLogin()) return
    const reply = await createArticleCommentReply(
      article.value.id,
      rootComment.id,
      content,
      articleCommentReplyTarget.value.replyToCommentId,
    )
    appendArticleCommentReplies(rootComment.id, [reply])
    updateCommentInTree(rootComment.id, comment => ({
      ...comment,
      replyCount: Math.max(Number(comment.replyCount ?? 0), comment.replies.length),
    }))
    const current = articleCommentRepliesPagination(rootComment.id)
    articleCommentReplyPagination.value = {
      ...articleCommentReplyPagination.value,
      [String(rootComment.id)]: {
        ...current,
        total: Math.max(Number(current.total ?? 0) + 1, rootComment.replies.length + 1),
      },
    }
    cancelArticleCommentReply()
  } catch (exception) {
    articleCommentError.value = extractUserApiError(exception, '回复发布失败。')
  } finally {
    articleCommentReplySubmitting.value = false
  }
}

const deleteArticleComment = async (comment: ArticleComment) => {
  if (!article.value?.id || !canDeleteComment(comment)) return
  articleCommentDeletingId.value = comment.id
  articleCommentError.value = ''
  try {
    await deleteOwnArticleComment(article.value.id, comment.id)
    if (comment.parentId == null) {
      articleComments.value = articleComments.value.filter((item) => item.id !== comment.id)
      articleCommentPagination.value.total = Math.max(0, Number(articleCommentPagination.value.total ?? 0) - 1)
    } else {
      articleComments.value = articleComments.value.map(rootComment => ({
        ...rootComment,
        replies: rootComment.replies.filter(reply => reply.id !== comment.id),
        replyCount: rootComment.replies.some(reply => reply.id === comment.id)
          ? Math.max(0, Number(rootComment.replyCount ?? 0) - 1)
          : rootComment.replyCount,
      }))
    }
  } catch (exception) {
    articleCommentError.value = extractUserApiError(exception, '评论删除失败。')
  } finally {
    articleCommentDeletingId.value = null
  }
}

const toggleArticleCommentLike = async (comment: ArticleComment) => {
  if (!article.value?.id || isArticleCommentLikeMutating(comment.id)) return
  articleCommentError.value = ''
  try {
    if (!await requireArticleCommentLogin()) return
    setCommentLikeMutating(comment.id, true)
    const updatedComment = comment.likedByCurrentUser
      ? await unlikeArticleComment(article.value.id, comment.id)
      : await likeArticleComment(article.value.id, comment.id)
    replaceArticleCommentInTree(updatedComment)
  } catch (exception) {
    articleCommentError.value = extractUserApiError(exception, '点赞操作失败。')
  } finally {
    setCommentLikeMutating(comment.id, false)
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
  void loadArticleFavoriteStatus()
  void recordArticleHistoryOnce()
  void loadArticleComments().then(() => {
    if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
  })
}, { immediate: true })

watch([sanitizedArticleHtml, () => article.value?.id], async () => {
  if (!import.meta.client || !articleClientReady.value) return
  await nextTick()
  void loadArticleReferences()
  void loadArticleRecipeTreeEmbeds()
})

watch(() => [route.query.commentId, route.query.replyId, route.hash], () => {
  if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
})

onMounted(() => {
  articleClientReady.value = true
  void loadArticleFavoriteStatus()
  void recordArticleHistoryOnce()
  void loadArticleReferences()
  void loadArticleRecipeTreeEmbeds()
  if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
})
</script>

<template>
  <section class="screen article-screen active" :aria-busy="articleLoading">
    <TerraNav />
    <TerraBreadcrumb />

    <main v-if="articleLoading" class="article-detail-layout article-detail-loading" aria-live="polite">
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

    <main v-else-if="notFoundState" class="article-detail-layout">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · 未找到</span>
        <h1>没有找到这篇文章</h1>
        <p>这篇文章可能尚未发布、已下线，或链接已经失效。</p>
        <div class="article-meta">
          <span>只显示已发布文章</span><span>草稿不会公开</span><span>请返回文章入口</span>
        </div>
        <a class="primary-button article-return-link" href="/articles">返回文章入口</a>
      </article>
    </main>

    <main v-else-if="article" class="article-detail-layout">
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

          <section id="article-comments" class="article-comments" aria-label="评论区" data-comment-endpoint="/comments">
            <header class="article-comments-head">
              <div>
                <span class="eyebrow">评论区</span>
                <h2>讨论这篇文章</h2>
              </div>
              <span>{{ articleCommentCount }} 条评论</span>
            </header>

            <form v-if="authStore.isAuthenticated" class="article-comment-form" @submit.prevent="submitArticleComment">
              <label for="article-comment-input">发表评论</label>
              <textarea
                id="article-comment-input"
                v-model="articleCommentText"
                maxlength="1000"
                rows="4"
                placeholder="补充材料路线、版本差异或你的实测经验。"
              ></textarea>
              <div class="article-comment-form-actions">
                <span>{{ articleCommentText.trim().length }} / 1000</span>
                <button class="article-comment-submit" type="submit" :disabled="!articleCommentCanSubmit">
                  {{ articleCommentSubmitting ? '发布中' : '发布评论' }}
                </button>
              </div>
            </form>
            <div v-else class="article-comment-login">
              <span>登录后可以参与讨论，补充教程细节或提问。</span>
              <a :href="articleCommentLoginPath">登录后评论</a>
            </div>

            <p v-if="articleCommentError" class="article-comment-error">{{ articleCommentError }}</p>
            <div v-if="articleCommentsLoading && !articleComments.length" class="article-comment-list article-comment-list--loading" aria-live="polite" aria-label="评论加载中">
              <article
                v-for="slot in articleCommentLoadingSlotCount"
                :key="`article-comment-loading-${slot}`"
                class="article-comment-item article-comment-item--loading"
              >
                <div class="article-comment-avatar" aria-hidden="true">
                  <CommonTpSkeleton type="icon" />
                </div>
                <div class="article-comment-body">
                  <header>
                    <b><CommonTpSkeleton type="line" /></b>
                    <span><CommonTpSkeleton type="pill" /></span>
                  </header>
                  <p>
                    <CommonTpSkeleton type="line" />
                    <CommonTpSkeleton type="line" short />
                  </p>
                </div>
              </article>
            </div>
            <div v-else-if="!articleComments.length" class="article-comment-empty">暂无评论，成为第一条评论。</div>
            <div v-else class="article-comment-list">
              <article
                v-for="comment in articleComments"
                :key="comment.id"
                class="article-comment-item"
                :class="{ 'article-comment-item--targeted': articleCommentTargetHighlightId === comment.id }"
                :data-comment-id="comment.id"
              >
                <div class="article-comment-avatar">
                  <img v-if="commentAvatarUrl(comment)" :src="commentAvatarUrl(comment)" :alt="`${commentAuthorLabel(comment)} 的头像`" loading="lazy">
                  <span v-else>{{ commentAvatarFallback(comment) }}</span>
                </div>
                <div class="article-comment-body">
                  <header>
                    <b>{{ commentAuthorLabel(comment) }}</b>
                    <span>{{ formatCommentDate(comment.createdAt) }}</span>
                  </header>
                  <p>{{ commentContent(comment) }}</p>
                  <div class="article-comment-actions">
                    <button
                      class="article-comment-like"
                      type="button"
                      :aria-pressed="comment.likedByCurrentUser"
                      :disabled="isArticleCommentLikeMutating(comment.id)"
                      @click="toggleArticleCommentLike(comment)"
                    >
                      {{ comment.likedByCurrentUser ? '已赞' : '点赞' }} · {{ comment.likeCount }}
                    </button>
                    <button class="article-comment-reply" type="button" @click="openArticleCommentReplyForm(comment)">
                      回复
                    </button>
                    <button
                      v-if="canDeleteComment(comment)"
                      class="article-comment-delete"
                      type="button"
                      :disabled="articleCommentDeletingId === comment.id"
                      @click="deleteArticleComment(comment)"
                    >
                      {{ articleCommentDeletingId === comment.id ? '删除中' : '删除' }}
                    </button>
                  </div>

                  <form
                    v-if="articleCommentReplyTarget?.rootId === comment.id && articleCommentReplyTarget.replyToCommentId === comment.id"
                    class="article-comment-reply-form article-comment-reply-form--inline"
                    @submit.prevent="submitArticleCommentReply(comment)"
                  >
                    <label :for="`article-comment-reply-root-${comment.id}`">
                      回复这条评论
                    </label>
                    <textarea
                      :id="`article-comment-reply-root-${comment.id}`"
                      v-model="articleCommentReplyText"
                      maxlength="1000"
                      rows="3"
                      placeholder="写下你的补充或问题。"
                    ></textarea>
                    <div class="article-comment-form-actions">
                      <span>{{ articleCommentReplyText.trim().length }} / 1000</span>
                      <div class="article-comment-reply-buttons">
                        <button class="article-comment-delete" type="button" @click="cancelArticleCommentReply">取消</button>
                        <button class="article-comment-submit" type="submit" :disabled="!articleCommentReplyCanSubmit">
                          {{ articleCommentReplySubmitting ? '回复中' : '发布回复' }}
                        </button>
                      </div>
                    </div>
                  </form>

                  <div v-if="comment.replies.length || comment.replyCount > 0" class="article-comment-replies">
                    <article
                      v-for="reply in comment.replies"
                      :key="reply.id"
                      class="article-comment-reply-item"
                      :class="{ 'article-comment-item--targeted': articleCommentTargetHighlightId === reply.id }"
                      :data-comment-id="reply.id"
                    >
                      <div class="article-comment-avatar small">
                        <img v-if="commentAvatarUrl(reply)" :src="commentAvatarUrl(reply)" :alt="`${commentAuthorLabel(reply)} 的头像`" loading="lazy">
                        <span v-else>{{ commentAvatarFallback(reply) }}</span>
                      </div>
                      <div class="article-comment-body">
                        <header>
                          <b>{{ commentAuthorLabel(reply) }}</b>
                          <span v-if="shouldShowArticleCommentReplyTarget(comment, reply)" class="article-comment-reply-to">回复 @{{ reply.replyToDisplayName }}</span>
                          <span>{{ formatCommentDate(reply.createdAt) }}</span>
                        </header>
                        <p>{{ commentContent(reply) }}</p>
                        <div class="article-comment-actions">
                          <button
                            class="article-comment-like"
                            type="button"
                            :aria-pressed="reply.likedByCurrentUser"
                            :disabled="isArticleCommentLikeMutating(reply.id)"
                            @click="toggleArticleCommentLike(reply)"
                          >
                            {{ reply.likedByCurrentUser ? '已赞' : '点赞' }} · {{ reply.likeCount }}
                          </button>
                          <button class="article-comment-reply" type="button" @click="openArticleCommentReplyForm(comment, reply)">
                            回复
                          </button>
                          <button
                            v-if="canDeleteComment(reply)"
                            class="article-comment-delete"
                            type="button"
                            :disabled="articleCommentDeletingId === reply.id"
                            @click="deleteArticleComment(reply)"
                          >
                            {{ articleCommentDeletingId === reply.id ? '删除中' : '删除' }}
                          </button>
                        </div>
                        <form
                          v-if="articleCommentReplyTarget?.rootId === comment.id && articleCommentReplyTarget.replyToCommentId === reply.id"
                          class="article-comment-reply-form article-comment-reply-form--inline"
                          @submit.prevent="submitArticleCommentReply(comment)"
                        >
                          <label :for="`article-comment-reply-${reply.id}`">
                            回复 @{{ commentAuthorLabel(reply) }}
                          </label>
                          <textarea
                            :id="`article-comment-reply-${reply.id}`"
                            v-model="articleCommentReplyText"
                            maxlength="1000"
                            rows="3"
                            placeholder="写下你的补充或问题。"
                          ></textarea>
                          <div class="article-comment-form-actions">
                            <span>{{ articleCommentReplyText.trim().length }} / 1000</span>
                            <div class="article-comment-reply-buttons">
                              <button class="article-comment-delete" type="button" @click="cancelArticleCommentReply">取消</button>
                              <button class="article-comment-submit" type="submit" :disabled="!articleCommentReplyCanSubmit">
                                {{ articleCommentReplySubmitting ? '回复中' : '发布回复' }}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </article>
                    <div class="article-comment-replies-footer">
                      <span>已显示 {{ articleCommentRepliesLoadedLabel(comment) }} 条回复</span>
                      <button
                        v-if="canLoadMoreArticleCommentReplies(comment)"
                        class="article-comment-load-more article-comment-replies-more"
                        type="button"
                        :disabled="isArticleCommentReplyLoading(comment.id)"
                        @click="loadMoreArticleCommentReplies(comment)"
                      >
                        {{ isArticleCommentReplyLoading(comment.id) ? '加载中' : '加载更多回复' }}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            <button
              v-if="canLoadMoreArticleComments"
              class="article-comment-load-more"
              type="button"
              :disabled="articleCommentsLoading"
              @click="loadMoreArticleComments"
            >
              {{ articleCommentsLoading ? '加载中' : '加载更多评论' }}
            </button>
          </section>
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

    <TerraFooter />
  </section>
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

.article-content-text :deep(.article-recipe-tree__graph) {
  --article-recipe-graph-node-size: 56px;
  --article-recipe-graph-line: color-mix(in srgb, var(--accent-gold) 58%, var(--index-line));
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

.article-content-text :deep(.article-recipe-tree__graph-lines) {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.article-content-text :deep(.article-recipe-tree__graph-edge) {
  fill: none;
  stroke: var(--article-recipe-graph-line);
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.article-content-text :deep(.article-recipe-tree__graph-node-position) {
  position: absolute;
  display: grid;
  place-items: center;
}

.article-content-text :deep(.article-recipe-tree__graph-node) {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: var(--article-recipe-graph-node-size);
  height: var(--article-recipe-graph-node-size);
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 86%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--text-strong) 8%, transparent),
    0 8px 20px color-mix(in srgb, var(--index-bg) 54%, transparent);
}

.article-content-text :deep(.article-recipe-tree__graph-node img) {
  display: block;
  width: 38px;
  height: 38px;
  margin: 0;
  border: 0;
  border-radius: 0;
  object-fit: contain;
}

.article-content-text :deep(.article-recipe-tree__graph-fallback) {
  color: var(--accent-gold);
  font-size: 18px;
  font-weight: 950;
}

.article-content-text :deep(.article-recipe-tree__graph-quantity) {
  position: absolute;
  right: -5px;
  bottom: -5px;
  min-width: 20px;
  padding: 2px 4px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 52%, var(--index-line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--index-bg) 96%, transparent);
  color: var(--text-strong);
  font-size: 10px;
  font-weight: 950;
  line-height: 1;
  text-align: center;
}

.article-content-text :deep(.article-recipe-tree__graph-stations) {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  gap: 2px;
}

.article-content-text :deep(.article-recipe-tree__graph-station) {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
}

.article-content-text :deep(.article-recipe-tree__graph-station img) {
  display: block;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 0;
  object-fit: contain;
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
  width: min(100%, 720px);
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

.article-comments {
  max-width: 76ch;
  margin-top: 42px;
  padding-top: 26px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 78%, transparent);
}

.article-comments-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 16px;
}

.article-comments-head h2 {
  margin: 6px 0 0;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.25;
}

.article-comments-head > span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
}

.article-comment-form {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 82%, transparent);
}

.article-comment-reply-form {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 24%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-gold) 8%, var(--index-surface));
}

.article-comment-reply-form--inline {
  margin: 10px 0 2px;
}

.article-comment-form label {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 900;
}

.article-comment-form textarea,
.article-comment-reply-form textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  border: 1px solid color-mix(in srgb, var(--index-line) 86%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 72%, #05070a);
  color: var(--text-main);
  padding: 12px;
  font: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.article-comment-reply-form textarea {
  min-height: 86px;
}

.article-comment-form textarea:focus,
.article-comment-reply-form textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-gold) 58%, transparent);
  outline-offset: 2px;
}

.article-comment-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.article-comment-form-actions span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.article-comment-submit,
.article-comment-login a,
.article-comment-delete,
.article-comment-like,
.article-comment-reply,
.article-comment-load-more {
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-gold) 14%, var(--index-surface));
  color: var(--text-strong);
  padding: 0 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
  cursor: pointer;
}

.article-comment-submit:disabled,
.article-comment-delete:disabled,
.article-comment-like:disabled,
.article-comment-reply:disabled,
.article-comment-load-more:disabled {
  opacity: 0.58;
  cursor: wait;
}

.article-comment-login,
.article-comment-empty {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 62px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 78%, transparent);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 800;
}

.article-comment-error {
  margin: 12px 0 0;
  color: var(--danger);
  font-size: 12px;
  font-weight: 900;
}

.article-comment-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.article-comment-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 80%, transparent);
}

.article-comment-item--loading {
  pointer-events: none;
}

.article-comment-item--loading .article-comment-avatar {
  overflow: hidden;
}

.article-comment-item--loading .article-comment-body p {
  display: grid;
  gap: 8px;
}

.article-comment-item--targeted {
  border-color: color-mix(in srgb, var(--accent-gold) 72%, var(--index-line));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-gold) 16%, transparent), transparent 42%),
    color-mix(in srgb, var(--index-surface) 84%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-gold) 14%, transparent);
}

.article-comment-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 32%, var(--index-line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent-gold) 12%, var(--index-surface));
  color: var(--text-strong);
  font-weight: 900;
}

.article-comment-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-comment-body {
  min-width: 0;
}

.article-comment-body header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.article-comment-body b {
  color: var(--text-strong);
  font-size: 13px;
}

.article-comment-body header span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.article-comment-body p {
  margin: 0;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.68;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.article-comment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}

.article-comment-like,
.article-comment-reply {
  min-height: 30px;
  padding: 0 10px;
  background: transparent;
  color: var(--text-muted);
}

.article-comment-like[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--accent-gold) 62%, var(--index-line));
  color: var(--accent-gold);
}

.article-comment-delete {
  min-height: 30px;
  padding: 0 10px;
  background: transparent;
  color: var(--text-muted);
}

.article-comment-replies {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-left: 12px;
  border-left: 2px solid color-mix(in srgb, var(--accent-gold) 26%, var(--index-line));
}

.article-comment-reply-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 68%, transparent);
}

.article-comment-avatar.small {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.article-comment-reply-to {
  color: color-mix(in srgb, var(--accent-gold) 76%, var(--text-muted));
}

.article-comment-reply-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.article-comment-load-more {
  width: fit-content;
  margin: 14px auto 0;
  background: color-mix(in srgb, var(--index-surface) 86%, transparent);
}

.article-comment-replies-more {
  margin: 0;
  min-height: 32px;
}

.article-comment-replies-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.article-comment-replies-footer > span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 900;
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

  .article-comments {
    max-width: none;
  }

  .article-comment-item {
    grid-template-columns: 36px minmax(0, 1fr);
    padding: 12px;
  }

  .article-comment-avatar {
    width: 36px;
    height: 36px;
  }

  .article-related-link {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .article-related-cover {
    width: 64px;
  }
}
</style>
