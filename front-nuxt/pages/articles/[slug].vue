<script setup lang="ts">
import type { ApiResponse, ArticleComment, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'
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
    span: style,
    div: style,
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
  while ((match = attributePattern.exec(rawAttributes)) !== null) {
    const rawName = match[1]
    if (!rawName) continue
    const name = rawName.toLowerCase()
    if (!allowed.includes(name)) continue
    const rawValue = match[2] ?? match[3] ?? match[4] ?? ''
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

watch(() => [route.query.commentId, route.query.replyId, route.hash], () => {
  if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
})

onMounted(() => {
  articleClientReady.value = true
  void loadArticleFavoriteStatus()
  void recordArticleHistoryOnce()
  if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
})
</script>

<template>
  <section class="screen article-screen active" :aria-busy="articleLoading">
    <TerraNav />
    <TerraBreadcrumb />

    <main v-if="articleLoading" class="article-detail-layout">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · 正在载入</span>
        <h1>文章加载中</h1>
        <p>正在读取已发布文章内容。</p>
      </article>
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
          <div class="article-content-text" v-html="sanitizedArticleHtml"></div>

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
            <div v-if="articleCommentsLoading && !articleComments.length" class="article-comment-empty">评论加载中...</div>
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
                      回复 @{{ commentAuthorLabel(comment) }}
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
                          <span v-if="reply.replyToDisplayName" class="article-comment-reply-to">回复 @{{ reply.replyToDisplayName }}</span>
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
