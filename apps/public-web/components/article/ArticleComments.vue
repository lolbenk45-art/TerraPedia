<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

const props = defineProps<{
  article: UserArticle | null
}>()

const authStore = useUserAuthStore()

const {
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
} = useArticleComments(() => props.article)
</script>

<template>
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

          <ArticleCommentReplyForm
            v-if="articleCommentReplyTarget?.rootId === comment.id && articleCommentReplyTarget.replyToCommentId === comment.id"
            v-model="articleCommentReplyText"
            :form-id="`article-comment-reply-root-${comment.id}`"
            label="回复这条评论"
            :submitting="articleCommentReplySubmitting"
            :can-submit="articleCommentReplyCanSubmit"
            @submit="submitArticleCommentReply(comment)"
            @cancel="cancelArticleCommentReply"
          />

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
                <ArticleCommentReplyForm
                  v-if="articleCommentReplyTarget?.rootId === comment.id && articleCommentReplyTarget.replyToCommentId === reply.id"
                  v-model="articleCommentReplyText"
                  :form-id="`article-comment-reply-${reply.id}`"
                  :label="`回复 @${commentAuthorLabel(reply)}`"
                  :submitting="articleCommentReplySubmitting"
                  :can-submit="articleCommentReplyCanSubmit"
                  @submit="submitArticleCommentReply(comment)"
                  @cancel="cancelArticleCommentReply"
                />
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
</template>

<style>
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

.article-comment-form label,
.article-comment-reply-form label {
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

@media (max-width: 720px) {
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
}
</style>
