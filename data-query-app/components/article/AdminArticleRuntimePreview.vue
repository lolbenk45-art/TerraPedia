<template>
  <article class="admin-article-runtime-preview">
    <header class="admin-article-runtime-preview__head">
      <h2>{{ title || '未命名文章' }}</h2>
      <p v-if="summary">{{ summary }}</p>
      <img v-if="normalizedCoverImage" :src="normalizedCoverImage" :alt="`${title || '文章'} 封面`" />
    </header>
    <div ref="contentRef" class="tp-article-runtime tp-article-runtime--admin admin-article-runtime-preview__body" v-html="safeHtml" />
  </article>
</template>

<script lang="ts">
let nextPreviewInstance = 0
</script>

<script setup lang="ts">
import { normalizeAdminArticleImageUrl } from '~/stores/articles'
import { useItemsStore } from '~/stores/items'
import type { ItemRecipeTreeResponse } from '~/stores/items'
import { post } from '~/composables/useApi'
import { sanitizeArticleHtml } from '~/utils/articleEditor'
import { createRecipeTreeRequestQueue, parseRecipeTreeDepth } from '~/utils/articleRuntimePreview'
import { renderRecipeHierarchyGraph } from '#article-runtime/recipeHierarchyGraphRenderer'

const props = withDefaults(defineProps<{ html: string; title?: string; summary?: string; coverImage?: string; mode: 'review' | 'editor' }>(), {
  title: '', summary: '', coverImage: '',
})

const contentRef = ref<HTMLElement | null>(null)
const itemsStore = useItemsStore()
const safeHtml = computed(() => sanitizeArticleHtml(props.html || ''))
const normalizedCoverImage = computed(() => normalizeAdminArticleImageUrl(props.coverImage))
let renderSequence = 0
let resizeObserver: ResizeObserver | null = null
let observedWidth = 0
const queueTree = createRecipeTreeRequestQueue((itemId, maxDepth) => itemsStore.fetchItemRecipeTree(itemId, maxDepth))
const previewOwner = `admin-article-preview-${++nextPreviewInstance}`
const preservedRecipeGraphs = new Map<string, DocumentFragment[]>()
const recipeTreeStates = new Map<string, { result: ItemRecipeTreeResponse; activeVariant: number }>()

const recipeTreeEmbedIdentity = (node: HTMLElement) => {
  const embedType = String(node.dataset.tpEmbedType || '').trim()
  const itemId = String(node.dataset.tpItemId || '').trim()
  const maxDepth = parseRecipeTreeDepth(node.dataset.tpMaxDepth)
  const label = String(node.dataset.tpLabel || '').replace(/\s+/g, ' ').trim()
  if (embedType !== 'recipe-tree' || !/^\d{1,12}$/.test(itemId) || maxDepth === null || !label || label.length > 80) return null
  return { key: `${itemId}:${maxDepth}:${label}`, itemId, maxDepth, label }
}

const clearOwnedPopovers = () => {
  document.querySelectorAll<HTMLElement>(`[data-tp-preview-owner="${previewOwner}"]`).forEach(node => node.remove())
  document.querySelectorAll<HTMLElement>(`[data-recipe-hierarchy-popover="${previewOwner}"]`).forEach(node => node.remove())
}

const markRecipeTreeFailure = (node: HTMLElement, label: string) => {
  node.classList.add('tp-recipe-tree--failed')
  node.setAttribute('role', 'status')
  node.textContent = `${label || '合成树'} 暂不可用`
}

const renderRecipeTree = (node: HTMLElement, state: { result: ItemRecipeTreeResponse; activeVariant: number }, maxDepth: number, label: string) => {
  const variants = state.result.variants.filter(variant => Array.isArray(variant.roots) && variant.roots.length)
  if (!variants.length) {
    markRecipeTreeFailure(node, label)
    return
  }
  state.activeVariant = Math.min(Math.max(state.activeVariant, 0), variants.length - 1)
  node.classList.remove('tp-recipe-tree--failed')
  node.removeAttribute('role')
  node.replaceChildren()

  if (variants.length > 1) {
    const controls = document.createElement('div')
    controls.className = 'tp-recipe-tree__variants'
    controls.setAttribute('role', 'group')
    controls.setAttribute('aria-label', `${label} 版本选择`)
    variants.forEach((variant, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'tp-recipe-tree__variant'
      button.textContent = variant.variantLabel || variant.versionScope || `版本 ${index + 1}`
      button.setAttribute('aria-pressed', String(index === state.activeVariant))
      button.addEventListener('click', () => {
        state.activeVariant = index
        renderRecipeTree(node, state, maxDepth, label)
      })
      controls.append(button)
    })
    node.append(controls)
  }

  const graph = renderRecipeHierarchyGraph({
    roots: variants[state.activeVariant]?.roots || [],
    maxDepth,
    availableWidth: Math.max(280, node.clientWidth || contentRef.value?.clientWidth || 680),
    resolveImageUrl: normalizeAdminArticleImageUrl,
    popoverOwner: previewOwner,
    popoverThemeClass: 'tp-article-runtime-popover--admin',
  })
  if (graph) node.append(graph)
  else markRecipeTreeFailure(node, label)
}

const captureRenderedRecipeGraphs = (root: HTMLElement) => {
  clearOwnedPopovers()
  preservedRecipeGraphs.clear()
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('.tp-recipe-tree'))) {
    const identity = recipeTreeEmbedIdentity(node)
    const graph = node.querySelector<HTMLElement>('[data-recipe-hierarchy-renderer="shared"]')
    if (!identity || !graph) continue
    const preserved = document.createDocumentFragment()
    while (node.firstChild) preserved.append(node.firstChild)
    const graphs = preservedRecipeGraphs.get(identity.key) || []
    graphs.push(preserved)
    preservedRecipeGraphs.set(identity.key, graphs)
  }
}

const resolveReferences = async (root: HTMLElement) => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.tp-content-ref'))
  const inputs = [...new Map(nodes
    .map(node => ({ type: node.dataset.tpRefType, id: node.dataset.tpRefId }))
    .filter(input => /^(item|npc|boss)$/.test(String(input.type)) && /^\d{1,12}$/.test(String(input.id)))
    .map(input => [`${input.type}:${input.id}`, input])).values()]
  if (!inputs.length) return
  try {
    const response: any = await post('/public/content-references/resolve', { refs: inputs })
    const entries = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
    const resolved = new Map<string, any>(entries.map((entry: any) => [`${entry.type}:${entry.id}`, entry]))
    for (const node of nodes) {
      const entry = resolved.get(`${node.dataset.tpRefType}:${node.dataset.tpRefId}`)
      if (!entry) continue
      node.setAttribute('role', 'button')
      node.tabIndex = 0
      node.setAttribute('aria-label', `${entry.label || entry.name || node.dataset.tpRefLabel || '资料引用'} 信息`)
      let popover: HTMLElement | null = null
      const hide = () => { popover?.remove(); popover = null }
      const show = () => {
        hide()
        popover = document.createElement('aside')
        popover.className = 'tp-article-runtime-popover tp-article-runtime-popover--admin is-visible'
        popover.dataset.tpPreviewOwner = previewOwner
        popover.setAttribute('role', 'tooltip')
        popover.textContent = [entry.label || entry.name, entry.categoryName, entry.summary].filter(Boolean).join(' · ')
        const rect = node.getBoundingClientRect()
        popover.style.left = `${Math.round(Math.max(12, rect.left))}px`
        popover.style.top = `${Math.round(Math.min(window.innerHeight - 48, rect.bottom + 8))}px`
        document.body.append(popover)
      }
      node.addEventListener('mouseenter', show)
      node.addEventListener('mouseleave', hide)
      node.addEventListener('focus', show)
      node.addEventListener('blur', hide)
      node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show() } if (event.key === 'Escape') hide() })
    }
  } catch { /* preview remains readable from sanitized saved content */ }
}

const hydrateRecipeTrees = async (root: HTMLElement, sequence: number) => {
  const activeKeys = new Set<string>()
  const embeds = Array.from(root.querySelectorAll<HTMLElement>('.tp-recipe-tree'))
  await Promise.all(embeds.map(async node => {
    const identity = recipeTreeEmbedIdentity(node)
    if (!identity) return
    activeKeys.add(identity.key)
    const preserved = preservedRecipeGraphs.get(identity.key)?.shift()
    if (preserved) {
      node.replaceChildren(preserved)
      return
    }
    const cached = recipeTreeStates.get(identity.key)
    if (cached) {
      renderRecipeTree(node, cached, identity.maxDepth, identity.label)
      return
    }
    try {
      const result = await queueTree(Number(identity.itemId), identity.maxDepth)
      if (sequence !== renderSequence || !root.contains(node)) return
      if (!result) {
        markRecipeTreeFailure(node, identity.label)
        return
      }
      const state = { result, activeVariant: 0 }
      recipeTreeStates.set(identity.key, state)
      renderRecipeTree(node, state, identity.maxDepth, identity.label)
    } catch {
      if (sequence === renderSequence && root.contains(node)) markRecipeTreeFailure(node, identity.label)
    }
  }))
  for (const key of recipeTreeStates.keys()) if (!activeKeys.has(key)) recipeTreeStates.delete(key)
}

const observeRecipeTreeWidth = (root: HTMLElement) => {
  if (resizeObserver) return
  observedWidth = root.clientWidth
  resizeObserver = new ResizeObserver(entries => {
    const width = Math.round(entries[0]?.contentRect.width || 0)
    if (!width || width === observedWidth) return
    observedWidth = width
    for (const node of Array.from(root.querySelectorAll<HTMLElement>('.tp-recipe-tree'))) {
      const identity = recipeTreeEmbedIdentity(node)
      const state = identity ? recipeTreeStates.get(identity.key) : null
      if (identity && state) renderRecipeTree(node, state, identity.maxDepth, identity.label)
    }
  })
  resizeObserver.observe(root)
}

const hydrate = async () => {
  const previousRoot = contentRef.value
  if (previousRoot) captureRenderedRecipeGraphs(previousRoot)
  const sequence = ++renderSequence
  await nextTick()
  const root = contentRef.value
  if (!root) return
  observeRecipeTreeWidth(root)
  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) image.src = normalizeAdminArticleImageUrl(image.getAttribute('src'))
  await Promise.all([resolveReferences(root), hydrateRecipeTrees(root, sequence)])
}

watch(safeHtml, hydrate, { immediate: true, flush: 'pre' })
onBeforeUnmount(() => {
  renderSequence += 1
  resizeObserver?.disconnect()
  clearOwnedPopovers()
})
</script>

<style scoped>
.admin-article-runtime-preview { display: grid; gap: 14px; min-width: 0; color: var(--color-text); }
.admin-article-runtime-preview__head { display: grid; gap: 8px; }
.admin-article-runtime-preview__head h2, .admin-article-runtime-preview__head p { margin: 0; }
.admin-article-runtime-preview__head img { width: 100%; border: 1px solid var(--color-border); border-radius: var(--radius-md); object-fit: cover; }
.admin-article-runtime-preview__body { display: grid; gap: 12px; min-width: 0; overflow: auto; }
.admin-article-runtime-preview__body :deep(img) { width: auto; max-width: 100%; height: auto; }
.admin-article-runtime-preview__body :deep(.tp-content-ref) { display: inline-flex; width: 1.875em; height: 1.875em; vertical-align: -.35em; cursor: pointer; }
.admin-article-runtime-preview__body :deep(.tp-content-ref img) { width: 100%; height: 100%; object-fit: contain; }
.admin-article-runtime-preview__body :deep(.tp-recipe-tree--failed) { border: 1px dashed var(--color-border); border-radius: var(--radius-md); color: var(--color-text-secondary); padding: 12px; }
.admin-article-runtime-preview__body :deep(.tp-recipe-tree__variants) { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.admin-article-runtime-preview__body :deep(.tp-recipe-tree__variant) { border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface-2); color: var(--color-text); cursor: pointer; padding: 4px 9px; }
.admin-article-runtime-preview__body :deep(.tp-recipe-tree__variant[aria-pressed="true"]) { border-color: var(--color-primary); color: var(--color-primary); }
</style>
