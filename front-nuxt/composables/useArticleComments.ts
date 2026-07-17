import type { ArticleComment, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
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

export const useArticleComments = (article: MaybeRefOrGetter<UserArticle | null>) => {
  const route = useRoute()
  const authStore = useUserAuthStore()
  const currentArticle = computed(() => toValue(article))

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

  const loadArticleComments = async (page = 1) => {
    if (!currentArticle.value?.id) return false
    articleCommentsLoading.value = true
    articleCommentError.value = ''
    try {
      const result = await fetchArticleComments(currentArticle.value.id, page, articleCommentPagination.value.limit)
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
    if (!rootTargetId || !currentArticle.value?.id || articleCommentTargetFocusing.value) {
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
    if (!currentArticle.value?.id) return false
    setCommentReplyLoading(comment.id, true)
    articleCommentError.value = ''
    try {
      const current = articleCommentRepliesPagination(comment.id)
      const result = await fetchArticleCommentReplies(currentArticle.value.id, comment.id, page, current.limit)
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
    if (!currentArticle.value?.id) return
    const content = articleCommentText.value.trim()
    if (!content || content.length > 1000) return
    articleCommentSubmitting.value = true
    articleCommentError.value = ''
    try {
      if (!await requireArticleCommentLogin()) return
      await createArticleComment(currentArticle.value.id, content)
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
    if (!currentArticle.value?.id || articleCommentReplyTarget.value?.rootId !== rootComment.id) return
    const content = articleCommentReplyText.value.trim()
    if (!content || content.length > 1000) return
    articleCommentReplySubmitting.value = true
    articleCommentError.value = ''
    try {
      if (!await requireArticleCommentLogin()) return
      const reply = await createArticleCommentReply(
        currentArticle.value.id,
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
    if (!currentArticle.value?.id || !canDeleteComment(comment)) return
    articleCommentDeletingId.value = comment.id
    articleCommentError.value = ''
    try {
      await deleteOwnArticleComment(currentArticle.value.id, comment.id)
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
    if (!currentArticle.value?.id || isArticleCommentLikeMutating(comment.id)) return
    articleCommentError.value = ''
    try {
      if (!await requireArticleCommentLogin()) return
      setCommentLikeMutating(comment.id, true)
      const updatedComment = comment.likedByCurrentUser
        ? await unlikeArticleComment(currentArticle.value.id, comment.id)
        : await likeArticleComment(currentArticle.value.id, comment.id)
      replaceArticleCommentInTree(updatedComment)
    } catch (exception) {
      articleCommentError.value = extractUserApiError(exception, '点赞操作失败。')
    } finally {
      setCommentLikeMutating(comment.id, false)
    }
  }

  watch(() => currentArticle.value?.id, () => {
    void loadArticleComments().then(() => {
      if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
    })
  }, { immediate: true })

  watch(() => [route.query.commentId, route.query.replyId, route.hash], () => {
    if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
  })

  onMounted(() => {
    if (route.hash === '#article-comments' || articleCommentTargetId.value) void focusArticleCommentTarget()
  })

  return {
    articleComments,
    articleCommentsLoading,
    articleCommentLoadingSlotCount,
    articleCommentText,
    articleCommentSubmitting,
    articleCommentDeletingId,
    articleCommentError,
    articleCommentReplyText,
    articleCommentReplyTarget,
    articleCommentReplySubmitting,
    articleCommentTargetHighlightId,
    articleCommentCount,
    articleCommentLoginPath,
    articleCommentCanSubmit,
    articleCommentReplyCanSubmit,
    canLoadMoreArticleComments,
    formatCommentDate,
    commentAuthorLabel,
    commentAvatarFallback,
    commentAvatarUrl,
    canDeleteComment,
    commentContent,
    shouldShowArticleCommentReplyTarget,
    isArticleCommentReplyLoading,
    isArticleCommentLikeMutating,
    canLoadMoreArticleCommentReplies,
    articleCommentRepliesLoadedLabel,
    loadMoreArticleComments,
    loadMoreArticleCommentReplies,
    submitArticleComment,
    openArticleCommentReplyForm,
    cancelArticleCommentReply,
    submitArticleCommentReply,
    deleteArticleComment,
    toggleArticleCommentLike,
  }
}
