<template>
  <section class="writer-page">
    <header class="hero">
      <p class="hero__eyebrow">文章编辑页</p>
      <h1>文章草稿编辑</h1>
      <p>
        前台支持文章内容编辑、草稿保存与提交审核。发布与运营流程统一在后台处理。
      </p>
    </header>

    <div class="layout">
      <aside class="drafts-card">
        <div class="drafts-head">
          <h2>草稿箱（{{ orderedDrafts.length }}）</h2>
          <button type="button" @click="createNewDraft">新建</button>
        </div>

        <ul v-if="orderedDrafts.length" class="draft-list">
          <li v-for="draft in orderedDrafts" :key="draft.id">
            <button
              type="button"
              class="draft-item"
              :class="{ 'draft-item--active': draft.id === activeDraftId }"
              @click="switchDraft(draft.id)"
            >
              <span class="draft-item__title">{{ getDraftTitle(draft) }}</span>
              <span class="draft-item__meta">{{ formatDateTime(draft.updatedAt) }}</span>
              <span class="draft-item__state">审核：{{ toReviewStatusLabel(draft.backendReviewStatus) }} · 状态：{{ toStatusLabel(draft.backendStatus) }}</span>
            </button>
          </li>
        </ul>

        <p v-else class="draft-empty">尚无草稿。</p>
      </aside>

      <div class="workspace">
        <section class="editor-card">
          <div class="field-grid">
            <label>
              <span>标题</span>
              <input v-model.trim="title" type="text" placeholder="输入文章标题" />
            </label>
            <label>
              <span>封面链接</span>
              <input v-model.trim="coverImage" type="text" placeholder="https://..." />
            </label>
            <label class="field-grid__full">
              <span>摘要</span>
              <textarea v-model.trim="summary" rows="3" placeholder="一句话概括价值" />
            </label>
          </div>

          <div v-if="false" class="assistant-card">
            <div class="assistant-card__head">
              <p class="assistant-card__eyebrow">公众号助手</p>
              <h3>模板 · 钩子 · 自检 · 快速排版</h3>
            </div>
            <div class="assistant-card__row">
              <label>
                <span>结构模板</span>
                <select v-model="selectedTemplate">
                  <option v-for="option in templateOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <button type="button" class="assistant-card__btn" @click="insertTemplateSkeleton">插入模板</button>
              <button type="button" class="assistant-card__btn assistant-card__btn--ghost" @click="optimizeWechatLayout">
                公众号排版优化
              </button>
            </div>
            <div class="assistant-hooks">
              <button
                v-for="hook in helperHooks"
                :key="hook.id"
                type="button"
                class="assistant-hook"
                @click="applyHookTitle(hook)"
              >
                <span>{{ hook.label }}</span>
                <small>{{ hook.hint }}</small>
              </button>
            </div>
            <div class="assistant-checklist">
              <div class="assistant-checklist__head">
                <span>发布前自检</span>
                <strong>{{ checklistPassCount }}/{{ checklistDefinitions.length }} 项通过</strong>
              </div>
              <ul>
                <li v-for="rule in checklistState" :key="rule.id" :class="{ pass: rule.passed }">
                  <span>{{ rule.label }}</span>
                  <small>{{ rule.detail }}</small>
                </li>
              </ul>
            </div>
          </div>

          <div class="toolbar" role="toolbar" aria-label="文章编辑工具栏">
            <div class="toolbar__cluster">
              <button type="button" class="toolbar__button toolbar__button--icon" title="撤销" aria-label="撤销" @click="execEditorCommand('undo')">↶</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="重做" aria-label="重做" @click="execEditorCommand('redo')">↷</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="清除格式" aria-label="清除格式" @click="clearFormatting">⌫</button>
            </div>

            <div class="toolbar__cluster toolbar__cluster--type">
              <label class="toolbar__group toolbar__group--select">
                <span class="visually-hidden">版式</span>
                <select :value="blockTag" aria-label="版式" @change="applyBlockTagFromEvent">
                  <option value="p">正文</option>
                  <option value="h1">H1</option>
                  <option value="h2">H2</option>
                  <option value="h3">H3</option>
                </select>
              </label>
              <label class="toolbar__group toolbar__group--select">
                <span class="visually-hidden">字号</span>
                <select :value="fontSizePx" aria-label="字号" @change="applyFontSize">
                  <option v-for="size in fontSizeOptions" :key="size" :value="size">{{ size }}px</option>
                </select>
              </label>
              <label class="toolbar__group toolbar__group--select">
                <span class="visually-hidden">行距</span>
                <select :value="lineHeightValue" aria-label="行距" @change="applyLineHeight">
                  <option v-for="option in lineHeightOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label class="toolbar__group toolbar__group--select">
                <span class="visually-hidden">首行缩进</span>
                <select :value="firstLineIndentValue" aria-label="首行缩进" @change="applyFirstLineIndent">
                  <option v-for="option in firstLineIndentOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label class="toolbar__group toolbar__group--select">
                <span class="visually-hidden">文字颜色</span>
                <select :value="textColorValue" aria-label="文字颜色" @change="applyTextColor">
                  <option v-for="option in textColorOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
            </div>

            <div class="toolbar__cluster">
              <button type="button" class="toolbar__button" title="加粗" aria-label="加粗" @click="execEditorCommand('bold')"><strong>B</strong></button>
              <button type="button" class="toolbar__button" title="斜体" aria-label="斜体" @click="execEditorCommand('italic')"><em>I</em></button>
              <button type="button" class="toolbar__button" title="下划线" aria-label="下划线" @click="execEditorCommand('underline')"><u>U</u></button>
              <button type="button" class="toolbar__button" title="删除线" aria-label="删除线" @click="execEditorCommand('strikeThrough')"><s>S</s></button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="行内代码" aria-label="行内代码" @click="insertInlineCode">&lt;/&gt;</button>
            </div>

            <div class="toolbar__cluster">
              <button type="button" class="toolbar__button toolbar__button--icon" title="无序列表" aria-label="无序列表" @click="execEditorCommand('insertUnorderedList')">•</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="有序列表" aria-label="有序列表" @click="execEditorCommand('insertOrderedList')">1.</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="引用" aria-label="引用" @click="applyBlockTag('blockquote')">❝</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="分割线" aria-label="分割线" @click="insertDivider">—</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="代码块" aria-label="代码块" @click="insertCodeBlock">{ }</button>
            </div>

            <div class="toolbar__cluster">
              <button type="button" class="toolbar__button toolbar__button--icon" title="左对齐" aria-label="左对齐" @click="applyAlignment('left')">≡</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="居中" aria-label="居中" @click="applyAlignment('center')">≣</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="右对齐" aria-label="右对齐" @click="applyAlignment('right')">☰</button>
              <button type="button" class="toolbar__button toolbar__button--icon" title="两端对齐" aria-label="两端对齐" @click="applyAlignment('justify')">☷</button>
            </div>

            <button type="button" class="toolbar__toggle" @click="showAdvancedTools = !showAdvancedTools">
              {{ showAdvancedTools ? '收起扩展' : '更多工具' }}
            </button>

            <div class="toolbar__cluster toolbar__cluster--advanced" :class="{ 'toolbar__cluster--hidden': !showAdvancedTools }">
              <button type="button" class="toolbar__button" @click="insertLink">插入链接</button>
              <button type="button" class="toolbar__button" @click="removeLink">移除链接</button>
              <label class="toolbar__group toolbar__group--compact">
                <span>表格</span>
                <input v-model.number="tableRows" type="number" min="1" max="12" aria-label="table rows" />
                <span>x</span>
                <input v-model.number="tableCols" type="number" min="1" max="8" aria-label="table columns" />
                <button type="button" class="toolbar__button" @click="insertTable">插入表格</button>
              </label>
              <button type="button" class="toolbar__button" @click="triggerImageUpload">上传图片</button>
              <button v-if="false" type="button" @click="triggerMarkdownImport">导入 Markdown</button>
              <button type="button" class="toolbar__button" @click="clearFormatting">清除格式</button>
            </div>

            <input
              ref="markdownInputRef"
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              class="visually-hidden"
              @change="handleMarkdownFileChange"
            />
            <input
              ref="imageUploadInputRef"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              class="visually-hidden"
              @change="handleImageUploadChange"
            />
          </div>

          <div class="editor-wrap">
            <div
              ref="editorRef"
              class="editor"
              contenteditable="true"
              role="textbox"
              aria-label="文章编辑器"
              data-placeholder="开始写作..."
              @input="syncFromEditor"
              @paste="handleEditorPaste"
              @keyup="saveSelection"
              @mouseup="saveSelection"
              @blur="saveSelection"
            />
          </div>

          <div class="editor-actions">
            <div class="meta">
              <span>{{ characterCount }} 字符</span>
              <span>{{ plainTextCount }} 纯文字符</span>
              <span>本地自动保存：{{ lastLocalSaveLabel }}</span>
              <span>快捷键：Ctrl/Cmd + S/B/I/U</span>
            </div>
            <div class="buttons">
              <button type="button" @click="saveCurrentDraft">保存到本地</button>
              <button type="button" @click="saveAsNewDraft">新建草稿</button>
              <button type="button" :disabled="savingRemote" @click="saveDraftToBackend">
                {{ savingRemote ? '保存中...' : '保存草稿' }}
              </button>
              <button
                type="button"
                :disabled="!canSubmitReview"
                :title="submitReviewHint"
                @click="submitCurrentDraftReview"
              >
                {{ submittingReview ? '提交中...' : '提交审核' }}
              </button>
              <button type="button" class="danger" @click="deleteCurrentDraft">删除</button>
            </div>
            <p class="editor-note">提示：请先“保存草稿”到后端，再点击“提交审核”。发布仍需在后台完成。</p>
          </div>

          <div v-if="false" class="snapshot-card">
            <div class="snapshot-card__head">
              <p>版本快照</p>
              <button type="button" @click="captureSnapshot('手动快照')">创建快照</button>
            </div>
            <p v-if="!activeSnapshots.length" class="snapshot-card__empty">当前草稿暂无快照</p>
            <ul v-else class="snapshot-card__list">
              <li v-for="item in activeSnapshots" :key="item.id">
                <button type="button" @click="restoreSnapshot(item.id)">
                  <span>{{ item.reason }}</span>
                  <small>{{ formatDateTime(item.createdAt) }}</small>
                </button>
              </li>
            </ul>
          </div>

          <div v-if="false" class="backend-status">
            <p class="backend-status__title">后端草稿状态</p>
            <p><span>文章 ID</span><strong>{{ activeBackendArticleId || '--' }}</strong></p>
            <p><span>状态</span><strong>{{ activeBackendStatusLabel }}</strong></p>
            <p><span>审核</span><strong>{{ activeReviewStatusLabel }}</strong></p>
            <p><span>更新时间</span><strong>{{ activeBackendUpdatedAt ? formatDateTime(activeBackendUpdatedAt) : '--' }}</strong></p>
          </div>

          <p v-if="statusMessage" class="status">{{ statusMessage }}</p>
        </section>

        <aside class="preview-card">
          <h2>实时预览</h2>
          <figure v-if="coverImage" class="preview-cover">
            <img :src="coverImage" :alt="title || 'cover'" />
          </figure>
          <h3 v-if="title" class="preview-title">{{ title }}</h3>
          <p v-if="summary" class="preview-summary">{{ summary }}</p>
          <div class="preview-content" v-html="previewHtml" />
          <div v-if="false" class="preview-actions">
            <button type="button" @click="copyHtml">复制 HTML</button>
            <button type="button" @click="exportMarkdown">导出 Markdown</button>
          </div>
          <section v-if="false" class="outline-card">
            <div class="outline-card__head">
              <h3>文章大纲</h3>
              <span>{{ outlineItems.length }} 节点</span>
            </div>
            <p v-if="outlineItems.length === 0" class="outline-card__empty">暂无标题层级，建议使用 H2/H3 组织结构。</p>
            <ol v-else class="outline-card__list">
              <li v-for="node in outlineItems" :key="node.id">
                <button type="button" :style="{ paddingLeft: `${(node.level - 1) * 10}px` }" @click="scrollToOutline(node.id)">
                  {{ node.text }}
                </button>
              </li>
            </ol>
          </section>
          <section v-if="false" class="material-card">
            <div class="material-card__head">
              <h3>素材库</h3>
              <button type="button" :disabled="mediaUploading" @click="triggerImageUpload">
                {{ mediaUploading ? '上传中...' : '上传图片' }}
              </button>
            </div>
            <p v-if="!mediaLibrary.length" class="material-card__empty">暂无素材，上传后可一键插入正文。</p>
            <ul v-else class="material-card__list">
              <li v-for="item in mediaLibrary" :key="item.id">
                <img :src="item.url" :alt="item.name" />
                <div class="material-card__meta">
                  <span>{{ item.name }}</span>
                  <small>{{ formatDateTime(item.createdAt) }}</small>
                </div>
                <button type="button" @click="insertMaterialImage(item.url, item.name)">插入</button>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createUserArticle,
  submitUserArticleReview,
  updateUserArticle,
  type UserArticleUpsertPayload,
} from '@/api/articles'
import type { Article, ArticleReviewStatus, ArticleStatus } from '@/types'
import { formatZhDateTime } from '@/utils/dateTime'

interface DraftRecord {
  id: string
  title: string
  summary: string
  coverImage: string
  contentHtml: string
  snapshots: DraftSnapshot[]
  backendArticleId: number | null
  backendStatus: ArticleStatus
  backendReviewStatus: ArticleReviewStatus
  backendUpdatedAt: string
  createdAt: string
  updatedAt: string
}

interface DraftSnapshot {
  id: string
  reason: string
  title: string
  summary: string
  coverImage: string
  contentHtml: string
  createdAt: string
}

interface MediaAsset {
  id: string
  url: string
  name: string
  createdAt: string
}

interface OutlineNode {
  id: string
  text: string
  level: number
}

interface DraftInbox {
  version: number
  activeId: string
  drafts: DraftRecord[]
}

const STORAGE_KEY_V2 = 'terrapedia.front.article-writer.drafts.v2'
const LEGACY_STORAGE_KEY_V1 = 'terrapedia.front.article-writer.draft.v1'
const INBOX_VERSION = 2
const AUTO_PERSIST_DELAY_MS = 480
const EMPTY_EDITOR_HTML = '<p><br></p>'
const PREVIEW_EMPTY_HTML = '<p>暂无内容。</p>'
const fontSizeOptions = [12, 14, 16, 18, 20, 24, 28, 32]
const lineHeightOptions = [
  { value: '1.5', label: '1.5x' },
  { value: '1.75', label: '1.75x' },
  { value: '2', label: '2.0x' },
] as const
const firstLineIndentOptions = [
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
type LineHeightValue = (typeof lineHeightOptions)[number]['value']
type FirstLineIndentValue = (typeof firstLineIndentOptions)[number]['value']
type TextColorValue = (typeof textColorOptions)[number]['value']
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,blockquote,li'

const editorRef = ref<HTMLElement | null>(null)
const markdownInputRef = ref<HTMLInputElement | null>(null)
const imageUploadInputRef = ref<HTMLInputElement | null>(null)
const selectionRange = ref<Range | null>(null)
const statusMessage = ref('')
const fontSizePx = ref(16)
const blockTag = ref<'p' | 'h1' | 'h2' | 'h3'>('p')
const lineHeightValue = ref<LineHeightValue>('1.75')
const firstLineIndentValue = ref<FirstLineIndentValue>('0')
const textColorValue = ref<TextColorValue>('#111827')
const tableRows = ref(2)
const tableCols = ref(3)
const mediaUploading = ref(false)
const showAdvancedTools = ref(false)
const savingRemote = ref(false)
const submittingReview = ref(false)

const title = ref('')
const summary = ref('')
const coverImage = ref('')
const draftHtml = ref(EMPTY_EDITOR_HTML)

const drafts = ref<DraftRecord[]>([])
const activeDraftId = ref('')
const applyingDraft = ref(false)
const autoPersistTimer = ref<number | null>(null)
const storageWriteFailed = ref(false)
const mediaLibrary = ref<MediaAsset[]>([])

const buildOutlineNodes = (html: string): OutlineNode[] => {
  if (typeof window === 'undefined') return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html || ''}</div>`, 'text/html')
  const headings = Array.from(doc.body.querySelectorAll('h1, h2, h3, h4'))
  return headings
    .map((node, index) => {
      const text = (node.textContent || '').trim()
      if (!text) return null
      const rawLevel = Number.parseInt(node.tagName.slice(1), 10)
      const level = Number.isFinite(rawLevel) ? Math.min(Math.max(rawLevel, 1), 4) : 2
      return {
        id: `heading-${index}`,
        text,
        level,
      }
    })
    .filter((node): node is OutlineNode => Boolean(node))
}

const previewHtml = computed(() => sanitizeRichHtml(draftHtml.value, PREVIEW_EMPTY_HTML))
const characterCount = computed(() => draftHtml.value.length)
const plainTextCount = computed(() => extractPlainText(draftHtml.value).length)
const orderedDrafts = computed(() => sortDrafts(drafts.value))
const activeDraft = computed(() => drafts.value.find(item => item.id === activeDraftId.value) || null)
const activeSnapshots = computed(() => activeDraft.value?.snapshots || [])
const activeBackendArticleId = computed(() => activeDraft.value?.backendArticleId || null)
const activeBackendUpdatedAt = computed(() => activeDraft.value?.backendUpdatedAt || '')
const activeBackendStatusLabel = computed(() => toStatusLabel(activeDraft.value?.backendStatus || 'DRAFT'))
const activeReviewStatusLabel = computed(() => toReviewStatusLabel(activeDraft.value?.backendReviewStatus || 'DRAFT'))
const canSubmitReview = computed(() => {
  const backendId = activeDraft.value?.backendArticleId || null
  const reviewStatus = activeDraft.value?.backendReviewStatus || 'DRAFT'
  const articleStatus = activeDraft.value?.backendStatus || 'DRAFT'
  if (!backendId || savingRemote.value || submittingReview.value) return false
  if (articleStatus === 'PUBLISHED') return false
  return reviewStatus === 'DRAFT' || reviewStatus === 'REJECTED'
})
const submitReviewHint = computed(() => {
  const backendId = activeDraft.value?.backendArticleId || null
  const reviewStatus = activeDraft.value?.backendReviewStatus || 'DRAFT'
  const articleStatus = activeDraft.value?.backendStatus || 'DRAFT'
  if (!backendId) return '请先保存草稿到后端'
  if (savingRemote.value) return '正在保存草稿，请稍后'
  if (submittingReview.value) return '正在提交审核'
  if (articleStatus === 'PUBLISHED') return '已发布文章不能提交审核'
  if (reviewStatus === 'PENDING_REVIEW') return '该文章已在审核中'
  if (reviewStatus === 'APPROVED') return '该文章已审核通过，无需重复提交'
  return '提交给后台审核'
})
const lastLocalSaveLabel = computed(() => {
  const updatedAt = activeDraft.value?.updatedAt
  return updatedAt ? formatDateTime(updatedAt) : '--'
})
const outlineItems = computed(() => buildOutlineNodes(previewHtml.value))

const setStatus = (message: string) => {
  statusMessage.value = message
  window.setTimeout(() => {
    if (statusMessage.value === message) {
      statusMessage.value = ''
    }
  }, 2200)
}

const nowIso = () => new Date().toISOString()

const generateDraftId = () => `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const sortDrafts = (items: DraftRecord[]) =>
  [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime()
    const rightTime = new Date(right.updatedAt).getTime()
    return rightTime - leftTime
  })

const normalizeTimestamp = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString()
}

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeBackendArticleId = (value: unknown) => {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) return null
  return Math.trunc(id)
}

const normalizeArticleStatus = (value: unknown): ArticleStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PUBLISHED' || status === 'OFFLINE') {
    return status
  }
  return 'DRAFT'
}

const normalizeReviewStatus = (value: unknown): ArticleReviewStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PENDING_REVIEW' || status === 'APPROVED' || status === 'REJECTED') {
    return status
  }
  return 'DRAFT'
}

const toStatusLabel = (status: ArticleStatus) => {
  if (status === 'PUBLISHED') return '已发布'
  if (status === 'OFFLINE') return '已下线'
  return '草稿'
}

const toReviewStatusLabel = (status: ArticleReviewStatus) => {
  if (status === 'PENDING_REVIEW') return '待审核'
  if (status === 'APPROVED') return '已通过'
  if (status === 'REJECTED') return '已驳回'
  return '草稿'
}

const normalizeEditorHtml = (value: unknown) => {
  if (typeof value !== 'string') return EMPTY_EDITOR_HTML
  const trimmed = value.trim()
  return trimmed ? trimmed : EMPTY_EDITOR_HTML
}

const normalizeSnapshots = (value: unknown): DraftSnapshot[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item): DraftSnapshot | null => {
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const createdAt = normalizeTimestamp(source.createdAt, nowIso())
      const contentHtml = normalizeEditorHtml(source.contentHtml)
      return {
        id: normalizeText(source.id) || `snapshot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        reason: normalizeText(source.reason) || '手动快照',
        title: normalizeText(source.title),
        summary: normalizeText(source.summary),
        coverImage: normalizeText(source.coverImage),
        contentHtml,
        createdAt,
      }
    })
    .filter((item): item is DraftSnapshot => Boolean(item))
    .slice(0, 30)
}

const createDraft = (input?: Partial<DraftRecord>): DraftRecord => {
  const fallbackTime = nowIso()
  const createdAt = normalizeTimestamp(input?.createdAt, fallbackTime)
  const updatedAt = normalizeTimestamp(input?.updatedAt, createdAt)
  return {
    id: normalizeText(input?.id) || generateDraftId(),
    title: normalizeText(input?.title),
    summary: normalizeText(input?.summary),
    coverImage: normalizeText(input?.coverImage),
    contentHtml: normalizeEditorHtml(input?.contentHtml),
    snapshots: normalizeSnapshots((input as { snapshots?: unknown } | undefined)?.snapshots),
    backendArticleId: normalizeBackendArticleId(input?.backendArticleId),
    backendStatus: normalizeArticleStatus(input?.backendStatus),
    backendReviewStatus: normalizeReviewStatus(input?.backendReviewStatus),
    backendUpdatedAt: normalizeText(input?.backendUpdatedAt),
    createdAt,
    updatedAt,
  }
}

const normalizeDraft = (input: unknown): DraftRecord | null => {
  if (!input || typeof input !== 'object') return null
  return createDraft(input as Partial<DraftRecord>)
}

const extractPlainText = (raw: string) => {
  if (typeof window === 'undefined') return raw.replace(/<[^>]+>/g, '').trim()
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${raw || ''}</div>`, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

const fallbackTitleFromHtml = (html: string) => {
  const text = extractPlainText(html)
  if (!text) return '未命名草稿'
  return text.length > 22 ? `${text.slice(0, 22)}...` : text
}

const getDraftTitle = (draft: DraftRecord) => {
  if (draft.id === activeDraftId.value) {
    return title.value.trim() || fallbackTitleFromHtml(draftHtml.value)
  }
  return draft.title || fallbackTitleFromHtml(draft.contentHtml)
}

type HookOption = {
  id: string
  label: string
  hint: string
  title: string
}

type ChecklistItemDefinition = {
  id: string
  label: string
  detail: string
  predicate: () => boolean
}

const templateOptions = ['热点快评', '知识科普', '案例拆解', '清单攻略'] as const
const templateSkeletons: Record<
  (typeof templateOptions)[number],
  { headline: string; lead: string; points: string[] }
> = {
  '热点快评': {
    headline: '热点速读',
    lead: '先点明事件背景，再突出冲突或趋势。',
    points: ['事件的关键人物与切入角度', '对比已有观点并提出新视角', '结尾呼吁关注或复盘'],
  },
  '知识科普': {
    headline: '知识解构',
    lead: '先解释核心概念，再用例子或数据撑场。',
    points: ['定义+背后原理', '现实场景中的表现', '撇除误区后的实操提醒'],
  },
  '案例拆解': {
    headline: '案例拆解',
    lead: '从真实案例抽象出可复用逻辑。',
    points: ['事件阶段+关键动作', '背后的底层思维模型', '用户/客户可复制的下一步'],
  },
  '清单攻略': {
    headline: '落地清单',
    lead: '按步骤列清单，强调行动点与验收标准。',
    points: ['核心目标', '关键步骤（1/2/3）', '衡量方式或省时提示'],
  },
}

const selectedTemplate = ref<(typeof templateOptions)[number]>(templateOptions[0])
const helperHooks: HookOption[] = [
  { id: 'contrast', label: '对比钩子', hint: '新旧反差/前后对比', title: '旧方式崩盘，新方案还能这样做？' },
  { id: 'suspense', label: '悬念钩子', hint: '留白式问题', title: '他用 5 分钟完成 20% 整理，关键细节却没说' },
  { id: 'risk', label: '风险钩子', hint: '警示/避坑', title: '不提前做这件事，可能被 2 万元罚款' },
  { id: 'benefit', label: '收益钩子', hint: '收益放大', title: '掌握这个方法，月薪最多涨 30%' },
  { id: 'question', label: '问句钩子', hint: '读者直接提问', title: '你还在用旧流程做内容？' },
  { id: 'direct', label: '直接称呼', hint: '直呼读者身份', title: '产品经理，再不看这份策略你会错过' },
  { id: 'curiosity', label: '好奇心钩子', hint: '反常/冷知识', title: '越努力越输？这个数据告诉你为什么' },
  { id: 'urgency', label: '紧迫感钩子', hint: '时效/限量', title: '只在本周，这 3 步帮你完成 3 倍产出' },
]

const helperPlainText = computed(() => extractPlainText(draftHtml.value))
const helperTitleText = computed(() => title.value.trim())
const helperSummaryText = computed(() => summary.value.trim())
const helperActionKeywords = ['立即', '速达', '马上', '动手', '别错过', '小技巧']

const checklistDefinitions: ChecklistItemDefinition[] = [
  {
    id: 'hook',
    label: '开篇有钩子',
    detail: '标题或首段包含问句、对比或悬念',
    predicate: () =>
      /[？?!！]/.test(helperTitleText.value) ||
      /对比|却|然而|翻转|不再/.test(helperPlainText.value.slice(0, 80)),
  },
  {
    id: 'summary',
    label: '摘要明确',
    detail: '摘要字数 >= 18 并指出收益',
    predicate: () => helperSummaryText.value.length >= 18 && /收获|收益|好处/.test(helperSummaryText.value),
  },
  {
    id: 'length',
    label: '内容充实',
    detail: '正文不少于 200 字',
    predicate: () => helperPlainText.value.length >= 200,
  },
  {
    id: 'action',
    label: '有行动建议',
    detail: '含「立即」「速」等动词+号召',
    predicate: () => helperActionKeywords.some(keyword => helperPlainText.value.includes(keyword)),
  },
  {
    id: 'conclusion',
    label: '明确结论',
    detail: '文末或小标题出现“结论”“因此”等',
    predicate: () => /(结论|因此|所以|建议)$/.test(helperPlainText.value.slice(-30)),
  },
  {
    id: 'cover',
    label: '封面就绪',
    detail: '封面链接已填写',
    predicate: () => Boolean(coverImage.value.trim()),
  },
]

const checklistState = computed(() =>
  checklistDefinitions.map(def => ({
    id: def.id,
    label: def.label,
    detail: def.detail,
    passed: def.predicate(),
  })),
)
const checklistPassCount = computed(() => checklistState.value.filter(rule => rule.passed).length)

const persistInbox = () => {
  if (typeof window === 'undefined') return
  try {
    const normalized = sortDrafts(drafts.value)
    drafts.value = normalized
    const activeExists = normalized.some(item => item.id === activeDraftId.value)
    const activeId = activeExists ? activeDraftId.value : normalized[0]?.id || ''
    activeDraftId.value = activeId
    const payload: DraftInbox = {
      version: INBOX_VERSION,
      activeId,
      drafts: normalized,
    }
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload))
    storageWriteFailed.value = false
  } catch {
    if (!storageWriteFailed.value) {
      setStatus('草稿持久化失败，可能是 localStorage 空间不足。')
      storageWriteFailed.value = true
    }
  }
}

const clearAutoPersistTimer = () => {
  if (typeof window === 'undefined') return
  if (autoPersistTimer.value !== null) {
    window.clearTimeout(autoPersistTimer.value)
    autoPersistTimer.value = null
  }
}

const scheduleAutoPersist = () => {
  if (typeof window === 'undefined') return
  clearAutoPersistTimer()
  autoPersistTimer.value = window.setTimeout(() => {
    autoPersistTimer.value = null
    updateDraftFromForm(true)
    persistInbox()
  }, AUTO_PERSIST_DELAY_MS)
}

const flushAutoPersist = () => {
  clearAutoPersistTimer()
  persistInbox()
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const migrateLegacyDraft = (): DraftInbox | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY_V1)
  if (!raw) return null

  const parsed = parseJson(raw)
  let legacySource: Partial<DraftRecord>

  if (typeof parsed === 'string') {
    legacySource = { contentHtml: parsed }
  } else if (parsed && typeof parsed === 'object') {
    const mapped = parsed as Record<string, unknown>
    legacySource = {
      title: normalizeText(mapped.title),
      summary: normalizeText(mapped.summary),
      coverImage: normalizeText(mapped.coverImage),
      contentHtml: normalizeEditorHtml(mapped.contentHtml ?? mapped.draftHtml ?? mapped.content),
    }
  } else {
    legacySource = { contentHtml: EMPTY_EDITOR_HTML }
  }

  const migrated = createDraft(legacySource)
  return {
    version: INBOX_VERSION,
    activeId: migrated.id,
    drafts: [migrated],
  }
}

const loadInbox = (): DraftInbox => {
  const fallbackDraft = createDraft()
  const fallbackInbox: DraftInbox = {
    version: INBOX_VERSION,
    activeId: fallbackDraft.id,
    drafts: [fallbackDraft],
  }

  if (typeof window === 'undefined') return fallbackInbox

  const rawV2 = window.localStorage.getItem(STORAGE_KEY_V2)
  if (rawV2) {
    const parsed = parseJson(rawV2)
    if (parsed && typeof parsed === 'object') {
      const source = parsed as Record<string, unknown>
      const sourceDrafts = Array.isArray(source.drafts) ? source.drafts : []
      const normalized = sourceDrafts.map(item => normalizeDraft(item)).filter((item): item is DraftRecord => Boolean(item))
      if (normalized.length > 0) {
        const sorted = sortDrafts(normalized)
        const activeId =
          typeof source.activeId === 'string' && sorted.some(item => item.id === source.activeId)
            ? source.activeId
            : sorted[0].id
        return {
          version: INBOX_VERSION,
          activeId,
          drafts: sorted,
        }
      }
    }
  }

  const migrated = migrateLegacyDraft()
  if (migrated) {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY_V1)
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated))
    return migrated
  }

  window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(fallbackInbox))
  return fallbackInbox
}

const writeEditorHtml = (raw: string) => {
  if (!editorRef.value) return
  editorRef.value.innerHTML = sanitizeRichHtml(raw, EMPTY_EDITOR_HTML)
}

const applyDraftToForm = (draft: DraftRecord) => {
  applyingDraft.value = true
  title.value = draft.title
  summary.value = draft.summary
  coverImage.value = draft.coverImage
  draftHtml.value = normalizeEditorHtml(draft.contentHtml)
  nextTick(() => {
    writeEditorHtml(draftHtml.value)
    saveSelection()
    applyingDraft.value = false
  })
}

const updateDraftFromForm = (touchUpdatedAt: boolean) => {
  if (!activeDraftId.value) return
  const index = drafts.value.findIndex(item => item.id === activeDraftId.value)
  if (index < 0) return

  const current = drafts.value[index]
  const updated: DraftRecord = {
    ...current,
    title: title.value.trim(),
    summary: summary.value.trim(),
    coverImage: coverImage.value.trim(),
    contentHtml: normalizeEditorHtml(draftHtml.value),
    updatedAt: touchUpdatedAt ? nowIso() : current.updatedAt,
  }
  const next = drafts.value.slice()
  next[index] = updated
  drafts.value = touchUpdatedAt ? sortDrafts(next) : next
}

watch([title, summary, coverImage, draftHtml], () => {
  if (applyingDraft.value) return
  updateDraftFromForm(false)
  scheduleAutoPersist()
})

const buildUserArticlePayload = (): UserArticleUpsertPayload => ({
  title: title.value.trim() || '未命名文章',
  summary: summary.value.trim() || undefined,
  coverImage: coverImage.value.trim() || undefined,
  contentHtml: sanitizeRichHtml(draftHtml.value, EMPTY_EDITOR_HTML),
  status: activeDraft.value?.backendStatus || 'DRAFT',
})

const syncDraftWithBackendArticle = (article: Article) => {
  if (!activeDraftId.value) return
  const index = drafts.value.findIndex(item => item.id === activeDraftId.value)
  if (index < 0) return
  const current = drafts.value[index]
  const nextRecord: DraftRecord = {
    ...current,
    title: title.value.trim(),
    summary: summary.value.trim(),
    coverImage: coverImage.value.trim(),
    contentHtml: normalizeEditorHtml(draftHtml.value),
    backendArticleId: article.id,
    backendStatus: normalizeArticleStatus(article.status),
    backendReviewStatus: normalizeReviewStatus(article.reviewStatus),
    backendUpdatedAt: normalizeText(article.updatedAt),
    updatedAt: nowIso(),
  }
  const nextDrafts = drafts.value.slice()
  nextDrafts[index] = nextRecord
  drafts.value = sortDrafts(nextDrafts)
  activeDraftId.value = nextRecord.id
}

const saveDraftToBackend = async () => {
  if (savingRemote.value) return
  savingRemote.value = true
  clearAutoPersistTimer()
  updateDraftFromForm(true)
  try {
    const payload = buildUserArticlePayload()
    const currentBackendId = activeDraft.value?.backendArticleId || null
    const article = currentBackendId
      ? await updateUserArticle(currentBackendId, payload)
      : await createUserArticle(payload)
    syncDraftWithBackendArticle(article)
    persistInbox()
    setStatus(currentBackendId ? '后端草稿已更新' : '后端草稿已创建')
  } catch (exception: any) {
    setStatus(exception?.response?.data?.message || exception?.message || '保存到后端失败')
  } finally {
    savingRemote.value = false
  }
}

const submitCurrentDraftReview = async () => {
  if (submittingReview.value || savingRemote.value) return
  const backendId = activeDraft.value?.backendArticleId || null
  const reviewStatus = activeDraft.value?.backendReviewStatus || 'DRAFT'
  const articleStatus = activeDraft.value?.backendStatus || 'DRAFT'
  if (!backendId) {
    setStatus('请先保存到后端再提交审核')
    return
  }
  if (articleStatus === 'PUBLISHED') {
    setStatus('已发布文章不能提交审核')
    return
  }
  if (reviewStatus === 'PENDING_REVIEW') {
    setStatus('该文章已在审核中，请勿重复提交')
    return
  }
  if (reviewStatus === 'APPROVED') {
    setStatus('该文章已审核通过，无需重复提交')
    return
  }
  if (!(reviewStatus === 'DRAFT' || reviewStatus === 'REJECTED')) {
    setStatus('当前状态不支持提交审核')
    return
  }
  submittingReview.value = true
  try {
    const article = await submitUserArticleReview(backendId)
    syncDraftWithBackendArticle(article)
    persistInbox()
    setStatus('已提交审核')
  } catch (exception: any) {
    const message = String(exception?.response?.data?.message || exception?.message || '')
    if (message.includes('Only draft or rejected article can be submitted for review')) {
      setStatus('仅草稿或已驳回文章可提交审核')
    } else if (message.includes('Published article cannot be submitted for review')) {
      setStatus('已发布文章不能提交审核')
    } else {
      setStatus(message || '提交审核失败')
    }
  } finally {
    submittingReview.value = false
  }
}

const switchDraft = (draftId: string) => {
  if (!draftId || draftId === activeDraftId.value) return
  clearAutoPersistTimer()
  updateDraftFromForm(true)
  const target = drafts.value.find(item => item.id === draftId)
  if (!target) return
  activeDraftId.value = draftId
  applyDraftToForm(target)
  persistInbox()
}

const createNewDraft = () => {
  clearAutoPersistTimer()
  updateDraftFromForm(true)
  const fresh = createDraft()
  drafts.value = sortDrafts([fresh, ...drafts.value])
  activeDraftId.value = fresh.id
  applyDraftToForm(fresh)
  persistInbox()
  setStatus('已新建空白草稿')
}

const saveCurrentDraft = () => {
  clearAutoPersistTimer()
  updateDraftFromForm(true)
  persistInbox()
  setStatus('草稿已保存')
}

const saveAsNewDraft = () => {
  clearAutoPersistTimer()
  updateDraftFromForm(true)
  const cloned = createDraft({
    title: title.value.trim(),
    summary: summary.value.trim(),
    coverImage: coverImage.value.trim(),
    contentHtml: normalizeEditorHtml(draftHtml.value),
  })
  drafts.value = sortDrafts([cloned, ...drafts.value])
  activeDraftId.value = cloned.id
  applyDraftToForm(cloned)
  persistInbox()
  setStatus('已另存为新草稿')
}

const deleteCurrentDraft = () => {
  clearAutoPersistTimer()
  if (!activeDraftId.value) return
  if (typeof window !== 'undefined') {
    const shouldDelete = window.confirm('Delete current draft? This action cannot be undone.')
    if (!shouldDelete) return
  }
  const remaining = drafts.value.filter(item => item.id !== activeDraftId.value)
  if (remaining.length === 0) {
    const blank = createDraft()
    drafts.value = [blank]
    activeDraftId.value = blank.id
    applyDraftToForm(blank)
  } else {
    const sorted = sortDrafts(remaining)
    drafts.value = sorted
    activeDraftId.value = sorted[0].id
    applyDraftToForm(sorted[0])
  }
  persistInbox()
  setStatus('草稿已删除')
}

const saveSelection = () => {
  if (!editorRef.value) return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    syncFormattingControls()
    return
  }
  const range = selection.getRangeAt(0)
  if (!editorRef.value.contains(range.commonAncestorContainer)) {
    syncFormattingControls()
    return
  }
  selectionRange.value = range.cloneRange()
  syncFormattingControls()
}

const restoreSelection = () => {
  if (!selectionRange.value) return
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(selectionRange.value)
}

const getSelectionAnchorElement = () => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const node = selection.anchorNode
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
}

const getRangeWithinEditor = () => {
  const editor = editorRef.value
  if (!editor) return null

  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const liveRange = selection.getRangeAt(0)
    if (editor.contains(liveRange.commonAncestorContainer)) {
      return liveRange
    }
  }

  if (selectionRange.value && editor.contains(selectionRange.value.commonAncestorContainer)) {
    return selectionRange.value
  }

  return null
}

const findClosestBlock = (node: Node | null) => {
  if (!node) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  return element?.closest(BLOCK_SELECTOR) as HTMLElement | null
}

const collectSelectedBlocks = () => {
  const editor = editorRef.value
  const range = getRangeWithinEditor()
  if (!editor || !range) return [] as HTMLElement[]

  const blocks = new Set<HTMLElement>()
  const startBlock = findClosestBlock(range.startContainer)
  const endBlock = findClosestBlock(range.endContainer)
  if (startBlock) blocks.add(startBlock)
  if (endBlock) blocks.add(endBlock)

  const candidates = Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
  for (const candidate of candidates) {
    try {
      if (range.intersectsNode(candidate)) {
        blocks.add(candidate)
      }
    } catch {
      continue
    }
  }

  if (!blocks.size) {
    const fallback = findClosestBlock(range.commonAncestorContainer)
    if (fallback) blocks.add(fallback)
  }

  return Array.from(blocks)
}

const snapFontSize = (value: number) =>
  fontSizeOptions.reduce((closest, option) => (
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest
  ), fontSizeOptions[0])

const snapLineHeightValue = (value: number): LineHeightValue =>
  lineHeightOptions.reduce((closest, option) => (
    Math.abs(Number(option.value) - value) < Math.abs(Number(closest.value) - value) ? option : closest
  ), lineHeightOptions[0]).value

const snapFirstLineIndentValue = (value: number): FirstLineIndentValue => {
  if (value >= 3) return '4em'
  if (value >= 1) return '2em'
  return '0'
}

const rgbToHex = (value: string) => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return null
  return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`.toLowerCase()
}

const syncFormattingControls = () => {
  const editor = editorRef.value
  const anchor = getSelectionAnchorElement()
  if (!editor || !anchor || !editor.contains(anchor)) return

  const block = (anchor.closest(BLOCK_SELECTOR) as HTMLElement | null) || (editor.firstElementChild as HTMLElement | null)
  if (!block) return

  const tagName = block.tagName.toLowerCase()
  if (tagName === 'p' || tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
    blockTag.value = tagName
  }

  const computedStyle = window.getComputedStyle(block)
  const fontSize = Number.parseFloat(computedStyle.fontSize)
  if (Number.isFinite(fontSize) && fontSize > 0) {
    fontSizePx.value = snapFontSize(fontSize)
  }

  const computedLineHeight = Number.parseFloat(computedStyle.lineHeight)
  const lineHeightRatio = Number.isFinite(computedLineHeight) && Number.isFinite(fontSize) && fontSize > 0
    ? computedLineHeight / fontSize
    : Number(lineHeightValue.value)
  lineHeightValue.value = snapLineHeightValue(lineHeightRatio)

  const computedIndent = Number.parseFloat(computedStyle.textIndent)
  const indentRatio = Number.isFinite(computedIndent) && Number.isFinite(fontSize) && fontSize > 0
    ? computedIndent / fontSize
    : 0
  firstLineIndentValue.value = snapFirstLineIndentValue(indentRatio)

  const colorHex = rgbToHex(computedStyle.color)
  if (colorHex) {
    const matchedOption = textColorOptions.find(option => option.value === colorHex)
    textColorValue.value = matchedOption?.value || '#111827'
  }
}

const applyStyleToSelectedBlocks = (property: 'line-height' | 'text-indent', value: string) => {
  const blocks = collectSelectedBlocks()
  if (!blocks.length) return

  blocks.forEach(block => {
    if (!value || value === '0') {
      block.style.removeProperty(property)
      return
    }
    block.style.setProperty(property, value)
  })

  syncFromEditor()
}

const execEditorCommand = (command: string, value?: string) => {
  restoreSelection()
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(command, false, value)
  syncFromEditor()
}

const applyBlockTag = (tag: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote') => {
  restoreSelection()
  const commandValue = `<${tag}>`
  document.execCommand('formatBlock', false, commandValue)
  if (tag !== 'blockquote') {
    blockTag.value = tag
  }
  syncFromEditor()
}

const applyBlockTagFromEvent = (event: Event) => {
  const target = event.target as HTMLSelectElement | null
  const value = target?.value
  if (value === 'h1' || value === 'h2' || value === 'h3' || value === 'p') {
    applyBlockTag(value)
  }
}

const applyFontSize = (event: Event) => {
  const target = event.target as HTMLSelectElement | null
  if (!target) return
  const selected = Number.parseInt(target.value, 10)
  if (!Number.isFinite(selected)) return
  fontSizePx.value = selected

  restoreSelection()
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand('fontSize', false, '7')
  if (editorRef.value) {
    const fontNodes = editorRef.value.querySelectorAll('font[size="7"]')
    fontNodes.forEach(node => {
      const span = document.createElement('span')
      span.style.fontSize = `${selected}px`
      span.innerHTML = node.innerHTML
      node.replaceWith(span)
    })
  }
  syncFromEditor()
}

const applyLineHeight = (event: Event) => {
  const target = event.target as HTMLSelectElement | null
  const nextValue = target?.value as LineHeightValue | undefined
  if (!nextValue) return
  lineHeightValue.value = nextValue
  applyStyleToSelectedBlocks('line-height', nextValue)
}

const applyFirstLineIndent = (event: Event) => {
  const target = event.target as HTMLSelectElement | null
  const nextValue = target?.value as FirstLineIndentValue | undefined
  if (!nextValue) return
  firstLineIndentValue.value = nextValue
  applyStyleToSelectedBlocks('text-indent', nextValue)
}

const applyTextColor = (event: Event) => {
  const target = event.target as HTMLSelectElement | null
  const nextValue = target?.value as TextColorValue | undefined
  if (!nextValue) return
  textColorValue.value = nextValue
  execEditorCommand('foreColor', nextValue)
}

const insertInlineCode = () => {
  restoreSelection()
  const selection = window.getSelection()
  const selectedText = selection?.toString().trim() || ''
  const content = escapeHtml(selectedText || 'code')
  insertHtmlAtCursor(`<code>${content}</code>`)
}

const insertDivider = () => {
  execEditorCommand('insertHorizontalRule')
}

const clearFormatting = () => {
  restoreSelection()
  document.execCommand('removeFormat')
  document.execCommand('unlink')
  applyStyleToSelectedBlocks('line-height', '')
  applyStyleToSelectedBlocks('text-indent', '')
  syncFromEditor()
}

const syncFromEditor = () => {
  const html = editorRef.value?.innerHTML || EMPTY_EDITOR_HTML
  draftHtml.value = normalizeEditorHtml(html)
  saveSelection()
}

const isSafeDataImage = (value: string) => /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)

const normalizeUrl = (rawUrl: string) => {
  const value = rawUrl.replace(/&amp;/g, '&').trim()
  if (/^https?:\/\//i.test(value)) return value
  if (isSafeDataImage(value)) return value
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
      continue
    }
    if (property === 'line-height' && /^(\d+(\.\d+)?|[1-9]\d?px)$/.test(value)) {
      allowed.push(`line-height:${value}`)
      continue
    }
    if (property === 'text-indent' && /^(0|[1-9]\d*(\.\d+)?(px|em|rem))$/.test(value)) {
      allowed.push(`text-indent:${value}`)
    }
  }

  return allowed.join(';')
}

const sanitizeRichHtml = (raw: string, fallback: string) => {
  const source = (raw || '').trim()
  if (!source) return fallback
  if (typeof window === 'undefined') return source.replace(/[<>&"]/g, '')

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${source}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return fallback

  const allowedTags = new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4',
    'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'a', 'img', 'span', 'div',
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
    table: new Set([]),
    thead: new Set([]),
    tbody: new Set([]),
    tr: new Set([]),
    th: new Set([]),
    td: new Set([]),
    hr: new Set([]),
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
        element.setAttribute('alt', '粘贴图片')
      }
      element.setAttribute('loading', 'lazy')
    }
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(node as Element)
      Array.from(node.childNodes).forEach(child => walk(child))
    } else if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node)
    }
  }

  Array.from(root.childNodes).forEach(node => walk(node))
  const result = root.innerHTML.trim()
  return result || fallback
}

const insertHtmlAtCursor = (html: string) => {
  restoreSelection()
  document.execCommand('insertHTML', false, html)
  syncFromEditor()
}

const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

const buildTemplateHtml = (name: (typeof templateOptions)[number]) => {
  const schema = templateSkeletons[name]
  if (!schema) return ''
  const parts = []
  if (schema.headline) parts.push(`<h2>${schema.headline}</h2>`)
  if (schema.lead) parts.push(`<p>${schema.lead}</p>`)
  parts.push(...schema.points.map(point => `<p>${point}</p>`))
  return parts.join('')
}

const refreshDraftHtml = (rawHtml: string, message?: string) => {
  const normalized = rawHtml ? normalizeEditorHtml(rawHtml) : EMPTY_EDITOR_HTML
  draftHtml.value = normalized
  nextTick(() => {
    writeEditorHtml(draftHtml.value)
    if (message) {
      setStatus(message)
    }
  })
}

const insertTemplateSkeleton = () => {
  const templateHtml = buildTemplateHtml(selectedTemplate.value)
  if (!templateHtml) {
    setStatus('模板加载失败')
    return
  }
  const sanitized = sanitizeRichHtml(templateHtml, '')
  if (!sanitized) {
    setStatus('模板内容不足')
    return
  }
  const current = draftHtml.value === EMPTY_EDITOR_HTML ? '' : draftHtml.value
  const divider = current ? '<div class="assistant-divider"></div>' : ''
  refreshDraftHtml(`${current}${divider}${sanitized}`, `${selectedTemplate.value} 模板已插入`)
}

const applyHookTitle = (hook: HookOption) => {
  title.value = hook.title
  setStatus('标题钩子已应用')
}

const optimizeWechatLayout = () => {
  if (typeof window === 'undefined') return
  const sanitized = sanitizeRichHtml(draftHtml.value, EMPTY_EDITOR_HTML)
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${sanitized}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return

  const paragraphs = Array.from(root.querySelectorAll('p'))
  paragraphs.forEach(paragraph => {
    const raw = paragraph.textContent?.trim() ?? ''
    if (raw.length <= 120) return
    const pieces = raw.split(/(?<=[。！？?])/).map(piece => piece.trim()).filter(Boolean)
    if (pieces.length <= 1) return
    const fragment = document.createDocumentFragment()
    pieces.forEach(piece => {
      const node = doc.createElement('p')
      node.textContent = piece
      fragment.appendChild(node)
    })
    paragraph.replaceWith(fragment)
  })

  if (!root.querySelector('h2, h3, h4')) {
    const heading = doc.createElement('h2')
    heading.textContent = '核心观点'
    root.insertBefore(heading, root.firstElementChild)
  }

  refreshDraftHtml(root.innerHTML, '公众号排版优化已完成')
}

const insertCodeBlock = () => {
  insertHtmlAtCursor('<pre><code>// code</code></pre><p><br></p>')
}

const insertTable = () => {
  const rows = clampInteger(tableRows.value, 1, 12, 2)
  const cols = clampInteger(tableCols.value, 1, 8, 3)
  tableRows.value = rows
  tableCols.value = cols

  const header = Array.from({ length: cols })
    .map((_, index) => `<th>列 ${index + 1}</th>`)
    .join('')

  const body = Array.from({ length: Math.max(0, rows - 1) })
    .map(() => `<tr>${Array.from({ length: cols }).map(() => '<td><br></td>').join('')}</tr>`)
    .join('')

  insertHtmlAtCursor(`<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table><p><br></p>`)
}

const applyAlignment = (mode: 'left' | 'center' | 'right' | 'justify') => {
  const commandMap: Record<typeof mode, string> = {
    left: 'justifyLeft',
    center: 'justifyCenter',
    right: 'justifyRight',
    justify: 'justifyFull',
  }
  execEditorCommand(commandMap[mode])
}

const normalizeLinkUrl = (value: string) => {
  const normalized = value.trim().replace(/&amp;/g, '&')
  return /^https?:\/\//i.test(normalized) ? normalized : ''
}

const insertLink = () => {
  if (typeof window === 'undefined') return
  restoreSelection()
  const selection = window.getSelection()
  const selectedText = selection?.toString().trim() || ''
  const input = window.prompt('输入链接地址（http/https）', 'https://')
  if (!input) return
  const safeUrl = normalizeLinkUrl(input)
  if (!safeUrl) {
    setStatus('仅支持 http/https 链接')
    return
  }
  if (selectedText) {
    execEditorCommand('createLink', safeUrl)
    return
  }
  insertHtmlAtCursor(`<a href="${escapeAttr(safeUrl)}">${escapeHtml(safeUrl)}</a>`)
}

const removeLink = () => {
  execEditorCommand('unlink')
}

const triggerImageUpload = () => {
  imageUploadInputRef.value?.click()
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })

const insertMaterialImage = (url: string, name = 'image') => {
  const normalized = normalizeUrl(url)
  if (!normalized) {
    setStatus('图片地址不安全，已拦截')
    return
  }
  const safeAlt = escapeAttr(name || 'image')
  insertHtmlAtCursor(`<p><img src="${escapeAttr(normalized)}" alt="${safeAlt}" /></p><p><br></p>`)
}

const handleImageUploadChange = async (event: Event) => {
  const input = event.target as HTMLInputElement | null
  const files = Array.from(input?.files || [])
  if (!files.length) return

  mediaUploading.value = true
  try {
    const assets: MediaAsset[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const dataUrl = await readFileAsDataUrl(file)
      if (!isSafeDataImage(dataUrl)) continue
      assets.push({
        id: `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        url: dataUrl,
        name: file.name || 'image',
        createdAt: nowIso(),
      })
    }
    if (!assets.length) {
      setStatus('未识别到可用图片')
      return
    }
    mediaLibrary.value = [...assets, ...mediaLibrary.value].slice(0, 60)
    insertMaterialImage(assets[0].url, assets[0].name)
    setStatus(`已导入 ${assets.length} 张图片`)
  } catch (exception: any) {
    setStatus(exception?.message || '图片上传失败')
  } finally {
    mediaUploading.value = false
    if (input) {
      input.value = ''
    }
  }
}

const triggerMarkdownImport = () => {
  markdownInputRef.value?.click()
}

const escapeHtml = (raw: string) =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeAttr = (raw: string) => escapeHtml(raw).replace(/"/g, '&quot;')

const parseInlineMarkdown = (input: string) => {
  let output = escapeHtml(input)
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
    const normalized = normalizeUrl(src)
    if (!normalized) return ''
    return `<img src="${escapeAttr(normalized)}" alt="${escapeAttr(alt || 'image')}" />`
  })
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const normalized = normalizeUrl(href)
    if (!normalized) return escapeHtml(text)
    return `<a href="${escapeAttr(normalized)}">${escapeHtml(text)}</a>`
  })
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>')
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return output
}

const splitMarkdownTableRow = (line: string) => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(cell => parseInlineMarkdown(cell.trim()))
}

const isMarkdownTableDivider = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)

const markdownToHtml = (markdownSource: string) => {
  const lines = markdownSource.replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let cursor = 0

  while (cursor < lines.length) {
    const currentLine = lines[cursor]
    const trimmed = currentLine.trim()

    if (!trimmed) {
      cursor += 1
      continue
    }

    const fencedCodeMatch = trimmed.match(/^```([\w-]+)?\s*$/)
    if (fencedCodeMatch) {
      cursor += 1
      const codeLines: string[] = []
      while (cursor < lines.length && !/^```/.test(lines[cursor].trim())) {
        codeLines.push(lines[cursor])
        cursor += 1
      }
      if (cursor < lines.length) cursor += 1
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (currentLine.includes('|') && cursor + 1 < lines.length && isMarkdownTableDivider(lines[cursor + 1])) {
      const headerCells = splitMarkdownTableRow(currentLine)
      cursor += 2
      const rowCells: string[][] = []
      while (cursor < lines.length && lines[cursor].trim() && lines[cursor].includes('|')) {
        rowCells.push(splitMarkdownTableRow(lines[cursor]))
        cursor += 1
      }
      const headerHtml = `<tr>${headerCells.map(cell => `<th>${cell || '<br>'}</th>`).join('')}</tr>`
      const bodyHtml = rowCells
        .map(row => `<tr>${headerCells.map((_, index) => `<td>${row[index] || '<br>'}</td>`).join('')}</tr>`)
        .join('')
      blocks.push(`<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`)
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push(`<h${level}>${parseInlineMarkdown(headingMatch[2])}</h${level}>`)
      cursor += 1
      continue
    }

    if (/^\s*(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(trimmed)) {
      blocks.push('<hr>')
      cursor += 1
      continue
    }

    if (/^\s*>\s?/.test(currentLine)) {
      const quoteLines: string[] = []
      while (cursor < lines.length && /^\s*>\s?/.test(lines[cursor])) {
        quoteLines.push(lines[cursor].replace(/^\s*>\s?/, ''))
        cursor += 1
      }
      blocks.push(`<blockquote><p>${parseInlineMarkdown(quoteLines.join('\n')).replace(/\n/g, '<br>')}</p></blockquote>`)
      continue
    }

    if (/^\s*[-*+]\s+/.test(currentLine)) {
      const items: string[] = []
      while (cursor < lines.length && /^\s*[-*+]\s+/.test(lines[cursor])) {
        items.push(lines[cursor].replace(/^\s*[-*+]\s+/, ''))
        cursor += 1
      }
      blocks.push(`<ul>${items.map(item => `<li>${parseInlineMarkdown(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(currentLine)) {
      const items: string[] = []
      while (cursor < lines.length && /^\s*\d+\.\s+/.test(lines[cursor])) {
        items.push(lines[cursor].replace(/^\s*\d+\.\s+/, ''))
        cursor += 1
      }
      blocks.push(`<ol>${items.map(item => `<li>${parseInlineMarkdown(item)}</li>`).join('')}</ol>`)
      continue
    }

    const paragraphLines: string[] = []
    while (cursor < lines.length && lines[cursor].trim()) {
      const line = lines[cursor]
      if (
        /^```/.test(line.trim()) ||
        /^(#{1,3})\s+/.test(line.trim()) ||
        /^\s*>\s?/.test(line) ||
        /^\s*[-*+]\s+/.test(line) ||
        /^\s*\d+\.\s+/.test(line) ||
        /^\s*(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(line.trim()) ||
        (line.includes('|') && cursor + 1 < lines.length && isMarkdownTableDivider(lines[cursor + 1]))
      ) {
        break
      }
      paragraphLines.push(line)
      cursor += 1
    }

    if (paragraphLines.length) {
      blocks.push(`<p>${parseInlineMarkdown(paragraphLines.join('\n')).replace(/\n/g, '<br>')}</p>`)
    } else {
      cursor += 1
    }
  }

  return blocks.join('\n')
}

const handleMarkdownFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  try {
    const content = await file.text()
    const importedHtml = sanitizeRichHtml(markdownToHtml(content), EMPTY_EDITOR_HTML)
    draftHtml.value = normalizeEditorHtml(importedHtml)
    nextTick(() => {
      writeEditorHtml(draftHtml.value)
      saveSelection()
    })
    updateDraftFromForm(true)
    persistInbox()
    setStatus(`已导入 Markdown：${file.name}`)
  } catch (exception: any) {
    setStatus(exception?.message || '导入 Markdown 失败')
  } finally {
    if (input) {
      input.value = ''
    }
  }
}

const handleEditorPaste = (event: ClipboardEvent) => {
  if (!event.clipboardData) return
  const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))
  if (imageItem) {
    const file = imageItem.getAsFile()
    if (!file) return
    event.preventDefault()
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!isSafeDataImage(result)) {
        setStatus('仅支持粘贴图片 Data URL')
        return
      }
      restoreSelection()
      document.execCommand('insertImage', false, result)
      syncFromEditor()
    }
    reader.readAsDataURL(file)
    return
  }

  const html = event.clipboardData.getData('text/html')
  if (html) {
    event.preventDefault()
    insertHtmlAtCursor(sanitizeRichHtml(html, EMPTY_EDITOR_HTML))
  }
}

const copyHtml = async () => {
  const html = previewHtml.value
  try {
    await navigator.clipboard.writeText(html)
    setStatus('HTML 已复制')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = html
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    setStatus('HTML 已复制')
  }
}

const htmlToMarkdown = (html: string) => {
  if (typeof window === 'undefined') return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  const renderChildren = (node: Node): string =>
    Array.from(node.childNodes)
      .map(child => renderNode(child))
      .join('')

  const renderNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    const content = renderChildren(element).trim()

    if (tag === 'br') return '\n'
    if (tag === 'strong' || tag === 'b') return `**${content}**`
    if (tag === 'em' || tag === 'i') return `*${content}*`
    if (tag === 'code' && element.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${content}\``
    if (tag === 'a') {
      const href = element.getAttribute('href') || ''
      return href ? `[${content || href}](${href})` : content
    }
    if (tag === 'img') {
      const src = element.getAttribute('src') || ''
      const alt = element.getAttribute('alt') || 'image'
      return src ? `![${alt}](${src})` : ''
    }
    if (tag === 'h1') return `# ${content}\n\n`
    if (tag === 'h2') return `## ${content}\n\n`
    if (tag === 'h3') return `### ${content}\n\n`
    if (tag === 'h4') return `#### ${content}\n\n`
    if (tag === 'blockquote') {
      const lines = content.split('\n').map(line => line.trim()).filter(Boolean)
      return `${lines.map(line => `> ${line}`).join('\n')}\n\n`
    }
    if (tag === 'hr') return '---\n\n'
    if (tag === 'pre') return `\`\`\`\n${element.textContent || ''}\n\`\`\`\n\n`
    if (tag === 'table') {
      const rows = Array.from(element.querySelectorAll('tr'))
      if (!rows.length) return ''
      const rowCells = rows.map(row =>
        Array.from(row.children)
          .filter(cell => {
            const cellTag = cell.tagName.toLowerCase()
            return cellTag === 'th' || cellTag === 'td'
          })
          .map(cell => renderChildren(cell).replace(/\n+/g, ' ').trim())
      )
      const maxCols = Math.max(...rowCells.map(cells => cells.length), 1)
      const normalizeRow = (cells: string[]) =>
        Array.from({ length: maxCols }).map((_, index) => cells[index] || '')

      const header = normalizeRow(rowCells[0])
      const divider = Array.from({ length: maxCols }).map(() => '---')
      const body = rowCells.slice(1).map(normalizeRow)
      const lines = [`| ${header.join(' | ')} |`, `| ${divider.join(' | ')} |`]
      body.forEach(row => lines.push(`| ${row.join(' | ')} |`))
      return `${lines.join('\n')}\n\n`
    }
    if (tag === 'li') return `${content}\n`
    if (tag === 'ul') {
      const items = Array.from(element.children)
        .filter(child => child.tagName.toLowerCase() === 'li')
        .map(child => `- ${renderChildren(child).trim()}`)
      return `${items.join('\n')}\n\n`
    }
    if (tag === 'ol') {
      const items = Array.from(element.children)
        .filter(child => child.tagName.toLowerCase() === 'li')
        .map((child, index) => `${index + 1}. ${renderChildren(child).trim()}`)
      return `${items.join('\n')}\n\n`
    }
    if (tag === 'p' || tag === 'div') return `${content}\n\n`

    return renderChildren(element)
  }

  return renderChildren(root)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const downloadText = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const slugifyFilename = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\-_\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64) || 'article-draft'

const exportMarkdown = () => {
  const heading = title.value.trim() || '未命名文章'
  const summaryLine = summary.value.trim() ? `> ${summary.value.trim()}\n\n` : ''
  const markdownBody = htmlToMarkdown(previewHtml.value)
  const markdown = `# ${heading}\n\n${summaryLine}${markdownBody}\n`
  const filename = `${slugifyFilename(heading)}.md`
  downloadText(filename, markdown, 'text/markdown;charset=utf-8')
  setStatus('Markdown 已导出')
}

const formatDateTime = (value: string) => {
  return formatZhDateTime(value)
}

const captureSnapshot = (reason = '手动快照') => {
  if (!activeDraftId.value) return
  const index = drafts.value.findIndex(item => item.id === activeDraftId.value)
  if (index < 0) return
  const current = drafts.value[index]
  const nextSnapshot: DraftSnapshot = {
    id: `snapshot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    reason: reason.trim() || '手动快照',
    title: title.value.trim(),
    summary: summary.value.trim(),
    coverImage: coverImage.value.trim(),
    contentHtml: normalizeEditorHtml(draftHtml.value),
    createdAt: nowIso(),
  }
  const nextDrafts = drafts.value.slice()
  nextDrafts[index] = {
    ...current,
    snapshots: [nextSnapshot, ...current.snapshots].slice(0, 30),
    updatedAt: nowIso(),
  }
  drafts.value = sortDrafts(nextDrafts)
  activeDraftId.value = nextDrafts[index].id
  persistInbox()
  setStatus('已创建版本快照')
}

const restoreSnapshot = (snapshotId: string) => {
  const snapshot = activeSnapshots.value.find(item => item.id === snapshotId)
  if (!snapshot) return
  applyingDraft.value = true
  title.value = snapshot.title
  summary.value = snapshot.summary
  coverImage.value = snapshot.coverImage
  draftHtml.value = normalizeEditorHtml(snapshot.contentHtml)
  nextTick(() => {
    writeEditorHtml(draftHtml.value)
    saveSelection()
    applyingDraft.value = false
    updateDraftFromForm(true)
    persistInbox()
    setStatus('已恢复到所选快照')
  })
}

const scrollToOutline = (nodeId: string) => {
  if (typeof window === 'undefined') return
  const index = Number.parseInt(nodeId.replace('heading-', ''), 10)
  if (!Number.isFinite(index) || index < 0) return
  const headings = document.querySelectorAll('.preview-content h1, .preview-content h2, .preview-content h3, .preview-content h4')
  const target = headings.item(index) as HTMLElement | null
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const handleEditorShortcuts = (event: KeyboardEvent) => {
  const isPrimaryModifier = event.ctrlKey || event.metaKey
  if (!isPrimaryModifier) return
  const key = event.key.toLowerCase()
  if (key === 's') {
    event.preventDefault()
    saveCurrentDraft()
    return
  }
  if (key === 'b' || key === 'i' || key === 'u') {
    event.preventDefault()
    const commandMap: Record<'b' | 'i' | 'u', string> = {
      b: 'bold',
      i: 'italic',
      u: 'underline',
    }
    execEditorCommand(commandMap[key as 'b' | 'i' | 'u'])
  }
}

onMounted(() => {
  showAdvancedTools.value = window.matchMedia('(min-width: 980px)').matches
  window.addEventListener('keydown', handleEditorShortcuts)
  const inbox = loadInbox()
  drafts.value = sortDrafts(inbox.drafts)
  activeDraftId.value = inbox.activeId
  const current = drafts.value.find(item => item.id === activeDraftId.value) || drafts.value[0]
  if (current) {
    activeDraftId.value = current.id
    applyDraftToForm(current)
  } else {
    const fallback = createDraft()
    drafts.value = [fallback]
    activeDraftId.value = fallback.id
    applyDraftToForm(fallback)
    persistInbox()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEditorShortcuts)
  flushAutoPersist()
})
</script>

<style scoped>
.writer-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 32px;
  display: grid;
  gap: 16px;
}

.hero {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 18px;
  box-shadow: var(--shadow-sm);
}

.hero__eyebrow {
  margin: 0;
  color: var(--accent-primary);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.78rem;
}

.hero h1 {
  margin: 6px 0 0;
  font-size: clamp(1.6rem, 2.8vw, 2.1rem);
}

.hero p {
  margin: 10px 0 0;
  color: var(--text-secondary);
}

.layout {
  display: grid;
  gap: 14px;
  grid-template-columns: 280px minmax(0, 1fr);
}

.layout--editor-only {
  grid-template-columns: 1fr;
}

.drafts-card,
.editor-card,
.preview-card {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.drafts-card {
  padding: 12px;
  display: grid;
  gap: 10px;
  align-content: start;
  max-height: calc(100vh - 140px);
  position: sticky;
  top: 18px;
}

.drafts-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.drafts-head h2 {
  margin: 0;
  font-size: 1rem;
}

.drafts-head button {
  border: none;
  border-radius: 9px;
  padding: 7px 10px;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
}

.draft-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.draft-item {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 8px 10px;
  text-align: left;
  display: grid;
  gap: 4px;
}

.draft-item--active {
  border-color: color-mix(in oklab, var(--accent-primary) 60%, var(--border-color));
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent-primary) 20%, transparent);
}

.draft-item__title {
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.3;
  font-size: 0.92rem;
}

.draft-item__meta {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.draft-item__state {
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.draft-empty {
  margin: 6px 0 0;
  color: var(--text-muted);
}

.workspace {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
}

.editor-card {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field-grid label {
  display: grid;
  gap: 6px;
}

.field-grid span {
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.field-grid input,
.field-grid textarea {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 9px 11px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.field-grid__full {
  grid-column: 1 / -1;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in oklab, var(--border-color) 84%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(180deg, #fff 0%, color-mix(in oklab, var(--bg-primary) 96%, #fff 4%) 100%);
  padding: 12px;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.8),
    0 10px 24px rgb(15 23 42 / 0.05);
}

.assistant-card {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px;
  background: var(--bg-primary);
  display: grid;
  gap: 10px;
}

.assistant-card__head h3 {
  margin: 2px 0 0;
  font-size: 1rem;
}

.assistant-card__row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.assistant-card__row select,
.assistant-card__row button {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.assistant-card__btn--ghost {
  border-style: dashed;
}

.assistant-hooks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.assistant-hook {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  background: var(--bg-secondary);
  text-align: left;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.assistant-hook span {
  font-weight: 600;
}

.assistant-checklist {
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 10px;
  background: color-mix(in oklab, var(--bg-primary) 90%, #000 10%);
}

.assistant-checklist__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.assistant-checklist ul {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.assistant-checklist li {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--bg-primary);
  font-size: 0.82rem;
}

.assistant-checklist li.pass {
  border-color: var(--accent-primary);
  background: color-mix(in oklab, var(--accent-primary) 12%, var(--bg-primary));
}

.assistant-divider {
  margin: 18px 0;
  border-top: 1px dashed var(--border-color);
}

.toolbar__group {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.toolbar__group--select select {
  min-width: 86px;
}

.toolbar__cluster {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 42px;
  border: 1px solid color-mix(in oklab, var(--border-color) 80%, #fff 20%);
  border-radius: 12px;
  background: color-mix(in oklab, #fff 86%, var(--bg-primary) 14%);
  padding: 5px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.7);
}

.toolbar__cluster--advanced {
  flex-basis: 100%;
}

.toolbar__cluster--hidden {
  display: none;
}

.toolbar__toggle {
  border: 1px dashed color-mix(in oklab, var(--border-color) 82%, transparent);
  border-radius: 12px;
  padding: 8px 12px;
  background: color-mix(in oklab, #fff 82%, var(--bg-secondary) 18%);
  color: var(--text-primary);
  font-weight: 700;
  margin-left: auto;
}

.toolbar__group--compact input {
  width: 54px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 6px 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.toolbar__button,
.toolbar select,
.toolbar button {
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 10px;
  background: transparent;
  color: var(--text-primary);
  font-weight: 600;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.toolbar button:hover,
.toolbar select:hover {
  border-color: color-mix(in oklab, var(--accent-primary) 45%, var(--border-color));
  background: color-mix(in oklab, var(--accent-primary) 8%, #fff 92%);
}

.toolbar button:focus-visible,
.toolbar select:focus-visible {
  outline: none;
  border-color: color-mix(in oklab, var(--accent-primary) 55%, var(--border-color));
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent-primary) 15%, transparent);
}

.toolbar__button--icon {
  min-width: 34px;
  padding-inline: 8px;
  font-size: 0.88rem;
  font-weight: 700;
}

.editor-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-primary);
  min-height: 380px;
}

.editor {
  min-height: 380px;
  padding: 14px;
  line-height: 1.75;
  outline: none;
}

.editor:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
}

.editor :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.editor :deep(blockquote) {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--accent-primary);
  background: color-mix(in oklab, var(--accent-primary) 10%, transparent);
}

.editor :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 16px 0;
}

.editor :deep(pre) {
  margin: 0;
  background: color-mix(in oklab, var(--bg-tertiary) 76%, #000 6%);
  border-radius: 10px;
  padding: 10px 12px;
  overflow-x: auto;
}

.editor :deep(table),
.preview-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
}

.editor :deep(th),
.editor :deep(td),
.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.editor :deep(th),
.preview-content :deep(th) {
  background: color-mix(in oklab, var(--bg-tertiary) 80%, #fff 10%);
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 0.84rem;
}

.buttons {
  display: flex;
  gap: 8px;
}

.buttons button {
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 8px 11px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 600;
}

.buttons button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.editor-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.84rem;
  line-height: 1.6;
}

.buttons .danger {
  color: var(--accent-error);
}

.backend-status {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}

.backend-status__title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
}

.backend-status p {
  margin: 0;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.backend-status strong {
  color: var(--text-primary);
  font-weight: 700;
}

.status {
  margin: 0;
  color: var(--accent-primary);
  font-weight: 600;
}

.snapshot-card,
.outline-card,
.material-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 10px 12px;
  display: grid;
  gap: 8px;
}

.snapshot-card__head,
.outline-card__head,
.material-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.snapshot-card__head p,
.outline-card__head h3,
.material-card__head h3 {
  margin: 0;
  font-size: 0.92rem;
}

.snapshot-card__head button,
.material-card__head button {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-weight: 600;
}

.snapshot-card__empty,
.outline-card__empty,
.material-card__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.snapshot-card__list,
.outline-card__list,
.material-card__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.snapshot-card__list button,
.outline-card__list button {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 7px 9px;
  text-align: left;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.outline-card__list button {
  font-size: 0.83rem;
}

.material-card__list li {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
  padding: 8px;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.material-card__list img {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  object-fit: cover;
}

.material-card__meta {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.material-card__meta span {
  font-size: 0.82rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card__meta small {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.material-card__list button {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 600;
}

.preview-card {
  padding: 14px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.preview-card h2 {
  margin: 0;
}

.preview-cover {
  margin: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.preview-cover img {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
}

.preview-title {
  margin: 2px 0 0;
  font-size: 1.35rem;
  line-height: 1.3;
}

.preview-summary {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.preview-content {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 14px;
  min-height: 300px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.preview-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.preview-content :deep(blockquote) {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--accent-primary);
  background: color-mix(in oklab, var(--accent-primary) 10%, transparent);
}

.preview-content :deep(pre) {
  margin: 0;
  background: color-mix(in oklab, var(--bg-tertiary) 76%, #000 6%);
  border-radius: 10px;
  padding: 10px 12px;
  overflow-x: auto;
}

.preview-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 16px 0;
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.preview-actions button {
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 8px 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 600;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (max-width: 1160px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .drafts-card {
    position: static;
    max-height: none;
  }

  .workspace {
    grid-template-columns: 1fr;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar__toggle {
    justify-self: stretch;
  }
}

@media (max-width: 700px) {
  .field-grid {
    grid-template-columns: 1fr;
  }

  .editor-actions .meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .buttons {
    width: 100%;
    flex-wrap: wrap;
  }

  .buttons button {
    flex: 1 1 120px;
  }

  .preview-actions {
    flex-wrap: wrap;
  }

  .material-card__list li {
    grid-template-columns: 1fr;
  }
}
</style>
