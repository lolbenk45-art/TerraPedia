<template>
  <div class="article-detail-wrap">
    <div class="article-back">
      <router-link to="/articles">&lt; Back to Articles</router-link>
    </div>

    <section v-if="loading" class="state">Loading article...</section>
    <section v-else-if="error" class="state state--error">{{ error }}</section>
    <article v-else-if="article" class="article-detail">
      <img v-if="article.coverImage" :src="article.coverImage" :alt="article.title" class="cover" />
      <header class="article-header">
        <h1>{{ article.title }}</h1>
        <p class="meta">
          <span>{{ formatDate(article.publishedAt || article.createdAt) }}</span>
          <span v-if="article.authorDisplayName">by {{ article.authorDisplayName }}</span>
        </p>
      </header>
      <p v-if="article.summary" class="summary">{{ article.summary }}</p>

      <section class="markdown-body" v-html="renderArticleContent(article.contentHtml || article.contentMarkdown || '')"></section>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Article } from '@/types'
import { fetchArticleById } from '@/api/articles'
import { formatZhDate } from '@/utils/dateTime'

const route = useRoute()
const loading = ref(false)
const error = ref('')
const article = ref<Article | null>(null)

const articleId = computed(() => Number(route.params.id))

const loadArticle = async () => {
  if (!Number.isFinite(articleId.value) || articleId.value <= 0) {
    error.value = 'Invalid article id'
    article.value = null
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    article.value = await fetchArticleById(articleId.value)
  } catch (exception: any) {
    article.value = null
    error.value = exception?.response?.data?.message || exception?.message || 'Failed to load article'
  } finally {
    loading.value = false
  }
}

const formatDate = formatZhDate

const escapeHtml = (raw: string) => {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const normalizeUrl = (rawUrl: string) => {
  const value = rawUrl.replace(/&amp;/g, '&').trim()
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) {
    return value
  }
  return ''
}

const looksLikeHtml = (raw: string) => /<\/?[a-z][\s\S]*>/i.test(raw)

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
    if ((property === 'color' || property === 'background-color') && /^(#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|[a-z]+)$/i.test(value)) {
      allowed.push(`${property}:${value}`)
    }
  }

  return allowed.join(';')
}

const sanitizeRichHtml = (raw: string) => {
  const source = (raw || '').trim()
  if (!source) return '<p>No content.</p>'
  if (typeof window === 'undefined') return `<p>${escapeHtml(source)}</p>`

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${source}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return '<p>No content.</p>'

  const allowedTags = new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
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
    h5: new Set(['style']),
    h6: new Set(['style']),
    span: new Set(['style']),
    div: new Set(['style']),
    pre: new Set(['style']),
    code: new Set(['style']),
    ul: new Set(['style']),
    ol: new Set(['style']),
    li: new Set(['style']),
    blockquote: new Set(['style']),
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

      if (attrName === 'href' || attrName === 'src') {
        const safeUrl = normalizeUrl(attrValue)
        if (!safeUrl) {
          element.removeAttribute(attribute.name)
        } else {
          element.setAttribute(attrName, safeUrl)
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
      if (!element.getAttribute('alt')) {
        element.setAttribute('alt', '')
      }
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

const renderInline = (text: string) => {
  const inlineCodes: string[] = []

  let html = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.push(`<code>${code}</code>`) - 1
    return `@@INLINE_CODE_${idx}@@`
  })

  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const safeUrl = normalizeUrl(url)
    if (!safeUrl) return ''
    return `<figure class="md-image"><img src="${safeUrl}" alt="${alt}" loading="lazy" /></figure>`
  })

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safeUrl = normalizeUrl(url)
    if (!safeUrl) return label
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  html = html.replace(/(^|[^*])\*(?!\s)([^*]+?)(?<!\s)\*/g, '$1<em>$2</em>')

  html = html.replace(/@@INLINE_CODE_(\d+)@@/g, (_, index) => inlineCodes[Number(index)] || '')
  return html
}

const isUlLine = (line: string) => /^[-*+]\s+/.test(line.trim())
const isOlLine = (line: string) => /^\d+\.\s+/.test(line.trim())
const isHeadingLine = (line: string) => /^#{1,6}\s+/.test(line.trim())
const isQuoteLine = (line: string) => /^>\s?/.test(line.trim())
const isHrLine = (line: string) => /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())
const isCodeFence = (line: string) => line.trim().startsWith('```')

const renderMarkdown = (content: string) => {
  if (!content || !content.trim()) return '<p>No content.</p>'

  const normalized = escapeHtml(content).replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const result: string[] = []

  let i = 0
  while (i < lines.length) {
    const current = lines[i]
    const trimmed = current.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (isCodeFence(trimmed)) {
      const language = trimmed.slice(3).trim().replace(/[^a-z0-9_-]/gi, '')
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !isCodeFence(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      result.push(
        `<pre class="md-code-block"><code${language ? ` class="language-${language}"` : ''}>${codeLines.join('\n')}</code></pre>`
      )
      continue
    }

    if (isHeadingLine(trimmed)) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/)
      const level = match?.[1].length || 1
      const text = match?.[2] || ''
      result.push(`<h${level}>${renderInline(text)}</h${level}>`)
      i += 1
      continue
    }

    if (isQuoteLine(trimmed)) {
      const quoteLines: string[] = []
      while (i < lines.length && isQuoteLine(lines[i])) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      result.push(`<blockquote><p>${renderInline(quoteLines.join('<br />'))}</p></blockquote>`)
      continue
    }

    if (isHrLine(trimmed)) {
      result.push('<hr />')
      i += 1
      continue
    }

    if (isUlLine(trimmed)) {
      const items: string[] = []
      while (i < lines.length && isUlLine(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i += 1
      }
      result.push(`<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (isOlLine(trimmed)) {
      const items: string[] = []
      while (i < lines.length && isOlLine(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i += 1
      }
      result.push(`<ol>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`)
      continue
    }

    const paragraphLines = [trimmed]
    i += 1
    while (i < lines.length) {
      const next = lines[i].trim()
      if (!next) {
        i += 1
        break
      }
      if (
        isCodeFence(next) ||
        isHeadingLine(next) ||
        isQuoteLine(next) ||
        isHrLine(next) ||
        isUlLine(next) ||
        isOlLine(next)
      ) {
        break
      }
      paragraphLines.push(next)
      i += 1
    }
    result.push(`<p>${renderInline(paragraphLines.join('<br />'))}</p>`)
  }

  return result.join('\n') || '<p>No content.</p>'
}

const renderArticleContent = (content: string) => {
  const source = (content || '').trim()
  if (!source) return '<p>No content.</p>'
  if (looksLikeHtml(source)) {
    return sanitizeRichHtml(source)
  }
  return renderMarkdown(source)
}

watch(articleId, () => {
  loadArticle()
}, { immediate: true })
</script>

<style scoped>
.article-detail-wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 28px 16px 40px;
  overflow-x: clip;
}

.article-back {
  margin-bottom: 8px;
}

.article-back a {
  color: var(--accent-primary);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.article-detail {
  margin-top: 12px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-secondary);
  padding: 22px;
}

.cover {
  width: 100%;
  max-height: 360px;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 16px;
}

.article-header h1 {
  margin: 0;
  font-size: clamp(2rem, 3.3vw, 2.6rem);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.meta {
  margin: 10px 0 0;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.summary {
  margin: 16px 0 20px;
  padding: 14px 16px;
  border-radius: 12px;
  border-left: 4px solid var(--accent-primary);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1.75;
}

:deep(.markdown-body) {
  color: var(--text-primary);
  font-size: 1.04rem;
  line-height: 1.9;
  overflow-wrap: anywhere;
  word-break: break-word;
}

:deep(.markdown-body p) {
  margin: 0 0 14px;
}

:deep(.markdown-body p:first-of-type) {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text-primary);
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4) {
  margin: 28px 0 12px;
  line-height: 1.35;
  font-weight: 800;
  color: var(--text-primary);
}

:deep(.markdown-body h1) {
  font-size: 1.95rem;
}

:deep(.markdown-body h2) {
  font-size: 1.62rem;
}

:deep(.markdown-body h3) {
  font-size: 1.32rem;
}

:deep(.markdown-body h4) {
  font-size: 1.14rem;
}

:deep(.markdown-body strong) {
  font-weight: 800;
}

:deep(.markdown-body em) {
  font-style: italic;
}

:deep(.markdown-body del) {
  opacity: 0.75;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 0 0 16px;
  padding-left: 1.5rem;
}

:deep(.markdown-body li) {
  margin: 6px 0;
}

:deep(.markdown-body blockquote) {
  margin: 16px 0;
  padding: 12px 14px;
  border-left: 4px solid var(--accent-primary);
  background: var(--bg-tertiary);
  border-radius: 8px;
}

:deep(.markdown-body blockquote p) {
  margin: 0;
}

:deep(.markdown-body hr) {
  border: none;
  border-top: 1px dashed var(--border-color);
  margin: 22px 0;
}

:deep(.markdown-body a) {
  color: var(--accent-primary);
  font-weight: 600;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

:deep(.markdown-body code) {
  background: var(--bg-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

:deep(.markdown-body .md-code-block) {
  margin: 14px 0 18px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: #0f172a;
  color: #e2e8f0;
  overflow-x: auto;
  max-width: 100%;
}

:deep(.markdown-body .md-code-block code) {
  border: none;
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: 0.92rem;
}

:deep(.markdown-body .md-image) {
  margin: 16px 0;
}

:deep(.markdown-body .md-image img) {
  width: 100%;
  max-height: 420px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.state {
  margin-top: 16px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.state--error {
  color: var(--accent-error);
}

@media (max-width: 768px) {
  .article-detail {
    padding: 16px;
  }

  .summary {
    padding: 12px;
    font-size: 0.96rem;
  }

  :deep(.markdown-body) {
    font-size: 1rem;
  }
}
</style>
