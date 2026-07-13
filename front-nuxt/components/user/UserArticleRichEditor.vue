<script setup lang="ts">
import {
  USER_ARTICLE_EDITOR_PLACEHOLDER,
  buildUserArticleLinkHtml,
  buildUserArticleInlineStyle,
  buildUserArticleReferenceHtml,
  buildUserArticleRecipeTreeEmbedHtml,
  buildUserArticleTypingSpanHtml,
  createUserArticleEditorHistory,
  applyUserArticleInlineStyleToSelectedRange,
  isSafeUserArticleReferenceElement,
  isSafeUserArticleLinkHref,
  normalizeUserArticleReferenceDisplayMode,
  normalizeUserArticleReferenceImage,
  normalizeUserArticleLinkHref,
  sanitizeUserArticleEditorColor,
  sanitizeUserArticleEditorLoadedHtml,
  sanitizeUserArticlePastedHtml,
  setUserArticleBlockTag,
  setUserArticleOrderedList,
  setUserArticleUnorderedList,
  unwrapUserArticleTypingPlaceholders,
} from '~/lib/userArticleEditorDom.mjs'
import type { NormalizedContentReference, PublicItemRecipeTree, PublicItemRecipeTreeNode, PublicItemRecipeTreeVariant } from '~/types/public-api'
import { searchPublicContentReferences } from '~/composables/usePublicContentReferences'
import { fetchPublicRecipeTree } from '~/composables/usePublicRecipeTree'
import { renderRecipeHierarchyGraph } from '~/utils/recipeHierarchyGraphRenderer'

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  referencePanelTarget?: string
}>(), {
  disabled: false,
  referencePanelTarget: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  error: [message: string]
  referencePanelOpen: []
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const syncingFromModel = ref(false)
const savedRange = ref<Range | null>(null)
const fontSizePx = ref(16)
const lineHeightValue = ref('1.75')
const textIndentValue = ref('0')
const textColorValue = ref('#f5e6b8')
const colorMenuOpen = ref(false)
const linkMenuOpen = ref(false)
const linkUrlValue = ref('')
const linkTitleValue = ref('')
const referenceMenuOpen = ref(false)
const referenceSearchText = ref('')
const referenceSearchType = ref<'item' | 'npc' | 'boss' | 'all'>('all')
const referenceDisplayMode = ref<'image' | 'text'>('image')
const referenceSearchLoading = ref(false)
const referenceSearchError = ref('')
const referenceSearchResults = ref<NormalizedContentReference[]>([])
const selectedImage = ref<HTMLImageElement | null>(null)
const selectedImageWidth = ref('100')
const selectedImageAlign = ref('center')
const selectedImageAlt = ref('')
const canUndoHistory = ref(false)
const canRedoHistory = ref(false)
const isRestoringHistory = ref(false)
const pickaxeImageFailed = ref(false)

const fontSizeOptions = [14, 16, 18, 20, 24, 28]
const lineHeightOptions = [
  { value: '1.5', label: '行距 1.5' },
  { value: '1.75', label: '行距 1.75' },
  { value: '2', label: '行距 2.0' },
]
const textIndentOptions = [
  { value: '0', label: '无首缩' },
  { value: '2em', label: '首缩 2 字' },
  { value: '4em', label: '首缩 4 字' },
]
const textColorPresets = [
  { value: '#f5e6b8', label: '暖白' },
  { value: '#ffd765', label: '金色' },
  { value: '#7dd3fc', label: '蓝色' },
  { value: '#86efac', label: '绿色' },
  { value: '#fca5a5', label: '红色' },
  { value: '#c4b5fd', label: '紫色' },
]
const BLOCK_SELECTOR = 'p,h2,h3,h4,blockquote,li'
const IRON_PICKAXE_REFERENCE_IMAGE = '/terrapedia-images/items/wiki/item-images/2f/2f394ee0d8c4d96e83b933355bfd93d65f101c4b-iron-pickaxe-png.png'
let referenceSearchTimer: ReturnType<typeof setTimeout> | null = null
let referenceSearchSequence = 0
let draggedReferenceElement: HTMLElement | null = null
let lastEmittedEditorHtml = ''
let editorRecipeTreeLoadSequence = 0
const REFERENCE_DRAG_MIME = 'application/x-terrapedia-reference'
const editorHistory = createUserArticleEditorHistory('', { limit: 80 })

const allowedEditorTags = new Set([
  'p', 'br', 'hr', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption', 'span', 'div',
])

const allowedEditorAttributes: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'loading', 'decoding', 'style']),
  p: new Set(['style']),
  h2: new Set(['style']),
  h3: new Set(['style']),
  h4: new Set(['style']),
  span: new Set(['style', 'class', 'data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label', 'data-tp-ref-image', 'data-tp-ref-display']),
  div: new Set(['style', 'class', 'data-tp-embed-type', 'data-tp-item-id', 'data-tp-max-depth', 'data-tp-label']),
  pre: new Set(['style']),
  code: new Set(['style']),
  ul: new Set(['style']),
  ol: new Set(['style']),
  li: new Set(['style']),
  blockquote: new Set(['style']),
  figure: new Set(['style']),
  figcaption: new Set(['style']),
}

const imageCount = computed(() => {
  if (!import.meta.client) return 0
  const root = document.createElement('div')
  root.innerHTML = props.modelValue || ''
  return root.querySelectorAll('img').length
})

const hasText = computed(() => {
  if (!import.meta.client) return Boolean(props.modelValue.trim())
  const root = document.createElement('div')
  root.innerHTML = props.modelValue || ''
  return Boolean((root.textContent || '').replace(/\s+/g, '').trim() || root.querySelector('img'))
})

const encodeAttributeValue = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const isSafeEditorUrl = (value: string, type: 'href' | 'src') => {
  const normalized = value.trim().replace(/&amp;/g, '&')
  if (!normalized) return false
  const src = normalized.toLowerCase()
  if (src.startsWith('file:') || src.startsWith('blob:') || src.startsWith('javascript:')) return false
  if (type === 'src') {
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalized)) return true
    return /^(https?:|\/)/i.test(normalized) && !normalized.startsWith('//')
  }
  return /^(https?:|mailto:|tel:|\/|#)/i.test(normalized) && !normalized.startsWith('//')
}

const sanitizeEditorStyle = (styleText: string) => {
  const allowed: string[] = []
  for (const item of styleText.split(';').map(part => part.trim()).filter(Boolean)) {
    const dividerIndex = item.indexOf(':')
    if (dividerIndex <= 0) continue
    const property = item.slice(0, dividerIndex).trim().toLowerCase()
    const value = item.slice(dividerIndex + 1).trim()
    if (!value || /url\s*\(/i.test(value)) continue

    if (property === 'font-weight' && /^(normal|bold|[1-9]00)$/.test(value)) allowed.push(`font-weight:${value}`)
    if (property === 'font-style' && /^(normal|italic)$/.test(value)) allowed.push(`font-style:${value}`)
    if (property === 'text-decoration' && /^(none|underline|line-through)$/.test(value)) allowed.push(`text-decoration:${value}`)
    if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) allowed.push(`text-align:${value}`)
    if (property === 'font-size' && /^([1-9]\d?|1\d\d)px$/.test(value)) allowed.push(`font-size:${value}`)
    if (property === 'color' && /^(#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|[a-z]+)$/i.test(value)) allowed.push(`color:${value}`)
    if (property === 'line-height' && /^(\d+(\.\d+)?|[1-9]\d?px)$/.test(value)) allowed.push(`line-height:${value}`)
    if (property === 'text-indent' && /^(0|[1-9]\d*(\.\d+)?(px|em|rem))$/.test(value)) allowed.push(`text-indent:${value}`)
    if (property === 'width' && /^(auto|100%|[1-9]\d?%|[1-9]\d{0,3}px)$/.test(value)) allowed.push(`width:${value}`)
    if (property === 'max-width' && /^(100%|[1-9]\d?%|[1-9]\d{0,3}px)$/.test(value)) allowed.push(`max-width:${value}`)
    if (property === 'height' && /^(auto|[1-9]\d{0,3}px)$/.test(value)) allowed.push(`height:${value}`)
    if (property === 'display' && /^(block|inline-block)$/.test(value)) allowed.push(`display:${value}`)
    if (property === 'margin-left' && /^(0|0px|auto)$/.test(value)) allowed.push(`margin-left:${value}`)
    if (property === 'margin-right' && /^(0|0px|auto)$/.test(value)) allowed.push(`margin-right:${value}`)
  }
  return allowed.join(';')
}

const isAtomicEditorReferenceSpan = (element: Element) => {
  if (element.tagName.toLowerCase() !== 'span') return false
  const classValue = element.getAttribute('class') || ''
  const classes = classValue.trim().split(/\s+/).filter(Boolean)
  if (classes.length !== 1 || classes[0] !== 'tp-content-ref') return false
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (name.startsWith('data-tp-') && !['data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label', 'data-tp-ref-image', 'data-tp-ref-display'].includes(name)) return false
  }
  const styleValue = element.getAttribute('style')
  if (styleValue != null && !sanitizeEditorStyle(styleValue)) return false
  return isSafeUserArticleReferenceElement({
    type: element.getAttribute('data-tp-ref-type'),
    id: element.getAttribute('data-tp-ref-id'),
    label: element.getAttribute('data-tp-ref-label'),
    imageUrl: element.getAttribute('data-tp-ref-image'),
    displayMode: element.getAttribute('data-tp-ref-display'),
  })
}

const renderEditorReferenceElement = (element: Element) => {
  const label = String(element.getAttribute('data-tp-ref-label') || '').trim()
  const imageUrl = normalizeUserArticleReferenceImage(element.getAttribute('data-tp-ref-image'))
  const displayMode = normalizeUserArticleReferenceDisplayMode(element.getAttribute('data-tp-ref-display')) || 'image'
  element.setAttribute('data-tp-ref-display', displayMode)
  element.setAttribute('contenteditable', 'false')
  element.setAttribute('draggable', 'true')
  element.replaceChildren()
  if (displayMode === 'text') {
    element.textContent = label
    return
  }
  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    img.alt = ''
    img.loading = 'lazy'
    img.decoding = 'async'
    img.setAttribute('aria-hidden', 'true')
    element.replaceChildren(img)
    return
  }
  const fallback = document.createElement('span')
  fallback.className = 'tp-content-ref-fallback'
  fallback.textContent = '图'
  fallback.setAttribute('aria-hidden', 'true')
  element.replaceChildren(fallback)
}

const stripEditorReferenceAttributes = (element: Element) => {
  const classes = (element.getAttribute('class') || '').split(/\s+/).filter(value => value && value !== 'tp-content-ref')
  if (classes.length) element.setAttribute('class', classes.join(' '))
  else element.removeAttribute('class')
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.toLowerCase().startsWith('data-tp-')) element.removeAttribute(attribute.name)
  }
}

const isAtomicEditorRecipeTreeEmbed = (element: Element) => {
  if (element.tagName.toLowerCase() !== 'div') return false
  const classes = (element.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)
  if (classes.length !== 2 || classes[0] !== 'tp-article-embed' || classes[1] !== 'tp-recipe-tree') return false
  const depthAttribute = element.getAttribute('data-tp-max-depth')
  if (depthAttribute == null) return false
  if (String(element.getAttribute('data-tp-embed-type') || '').trim() !== 'recipe-tree') return false
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (name.startsWith('on')) return false
    if (name.startsWith('data-tp-') && !['data-tp-embed-type', 'data-tp-item-id', 'data-tp-max-depth', 'data-tp-label'].includes(name)) return false
  }
  return Boolean(buildUserArticleRecipeTreeEmbedHtml({
    itemId: element.getAttribute('data-tp-item-id'),
    maxDepth: Number(depthAttribute),
    label: element.getAttribute('data-tp-label'),
  }))
}

const hasNormalizableEditorRecipeTreeEmbedIdentity = (element: Element) => {
  if (element.tagName.toLowerCase() !== 'div') return false
  const classes = (element.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)
  if (classes.length !== 2 || classes[0] !== 'tp-article-embed' || classes[1] !== 'tp-recipe-tree') return false
  if (String(element.getAttribute('data-tp-embed-type') || '').trim() !== 'recipe-tree') return false
  const depthAttribute = element.getAttribute('data-tp-max-depth')
  return Boolean(buildUserArticleRecipeTreeEmbedHtml({
    itemId: element.getAttribute('data-tp-item-id'),
    maxDepth: depthAttribute == null ? Number.NaN : Number(depthAttribute),
    label: element.getAttribute('data-tp-label'),
  }))
}

const normalizeEditorRecipeTreeEmbed = (element: Element) => {
  const depthAttribute = element.getAttribute('data-tp-max-depth')
  const html = buildUserArticleRecipeTreeEmbedHtml({
    itemId: element.getAttribute('data-tp-item-id'),
    maxDepth: depthAttribute == null ? Number.NaN : Number(depthAttribute),
    label: element.getAttribute('data-tp-label'),
  })
  if (!html) {
    element.replaceWith(...Array.from(element.childNodes))
    return
  }
  const template = document.createElement('template')
  template.innerHTML = html
  const safeElement = template.content.firstElementChild
  if (safeElement) element.replaceWith(safeElement)
}

const editorRecipeTreeText = (value: unknown) => String(value ?? '').trim()

const firstEditorRecipeTreeText = (...values: unknown[]) => {
  for (const value of values) {
    const text = editorRecipeTreeText(value)
    if (text) return text
  }
  return ''
}

const editorRecipeTreeNodeName = (node: PublicItemRecipeTreeNode) => firstEditorRecipeTreeText(
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.name,
  node.itemInternalName,
  '材料',
)

const editorRecipeTreeNodeQuantity = (node: PublicItemRecipeTreeNode, isRoot = false) => {
  const quantityText = firstEditorRecipeTreeText(node.quantityText)
  if (quantityText) return `x${quantityText.replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) return `x${node.quantityMin}-${node.quantityMax}`
  const directQuantity = firstEditorRecipeTreeText(node.quantityMin, node.quantity, node.amount, node.count)
  if (directQuantity) return `x${directQuantity.replace(/^x/i, '')}`
  const resultQuantity = Number(node.resultQuantity)
  return isRoot && Number.isFinite(resultQuantity) && resultQuantity > 0 && resultQuantity <= 99 ? `x${resultQuantity}` : 'x1'
}

const editorRecipeTreeImage = (value: unknown) => {
  const imageUrl = String(value ?? '').trim()
  if (!imageUrl) return ''
  return isSafeEditorUrl(imageUrl, 'src') ? imageUrl : ''
}

const editorRecipeTreeNodeImage = (node: PublicItemRecipeTreeNode) => editorRecipeTreeImage(firstEditorRecipeTreeText(
  node.itemImage,
  node.itemImageUrl,
  node.image,
  node.previewImage,
  Array.isArray(node.groupMembers) ? node.groupMembers[0]?.image : '',
  Array.isArray(node.groupMembers) ? node.groupMembers[0]?.imageUrl : '',
))

const editorRecipeTreeStationName = (station: { stationName?: string | null, stationNameZh?: string | null, name?: string | null, displayName?: string | null, stationInternalName?: string | null } | null | undefined) => firstEditorRecipeTreeText(
  station?.displayName,
  station?.stationNameZh,
  station?.stationName,
  station?.name,
  station?.stationInternalName,
)

const editorRecipeTreeStationImage = (station: { stationImage?: string | null, itemImage?: string | null, itemImageUrl?: string | null, image?: string | null } | null | undefined) => editorRecipeTreeImage(firstEditorRecipeTreeText(
  station?.stationImage,
  station?.itemImage,
  station?.itemImageUrl,
  station?.image,
))

const editorRecipeTreeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []

const editorRecipeTreeNodeKey = (node: PublicItemRecipeTreeNode) => firstEditorRecipeTreeText(
  node.itemId,
  node.id,
  node.itemInternalName,
  node.itemName,
  node.displayName,
  node.name,
)

const editorRecipeTreeGroupMemberName = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => firstEditorRecipeTreeText(
  member.nameZh,
  member.name,
  member.internalName,
  '可替代材料',
)

const editorRecipeTreeGroupMemberImage = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => editorRecipeTreeImage(firstEditorRecipeTreeText(
  member.image,
  member.imageUrl,
))

const editorRecipeTreeNodeGroupMember = (node: PublicItemRecipeTreeNode) => ({
  itemId: node.itemId,
  internalName: node.itemInternalName || node.itemName || node.name || null,
  name: node.itemName || node.name || node.displayName || null,
  nameZh: node.displayName || node.itemNameZh || node.name || null,
  image: node.itemImage || node.image || node.previewImage || null,
  imageUrl: node.itemImageUrl || null,
})

const editorRecipeTreeNodeStations = (node: PublicItemRecipeTreeNode) => {
  const stations = (Array.isArray(node.stations) ? node.stations : []).filter(station => station?.stationType !== 'condition')
  if (stations.length) return stations
  const sameItemChild = editorRecipeTreeNodeChildren(node).find(child => isSameEditorRecipeTreeItem(node, child) && Array.isArray(child.stations) && child.stations.length > 0)
  return (Array.isArray(sameItemChild?.stations) ? sameItemChild.stations : []).filter(station => station?.stationType !== 'condition')
}

const isSameEditorRecipeTreeItem = (left: PublicItemRecipeTreeNode, right: PublicItemRecipeTreeNode) => {
  const leftId = firstEditorRecipeTreeText(left.itemId, left.id)
  const rightId = firstEditorRecipeTreeText(right.itemId, right.id)
  if (leftId && rightId) return leftId === rightId
  const leftName = firstEditorRecipeTreeText(left.itemInternalName, left.itemName, left.name, left.displayName)
  const rightName = firstEditorRecipeTreeText(right.itemInternalName, right.itemName, right.name, right.displayName)
  return Boolean(leftName && rightName && leftName === rightName)
}

const isDefaultEditorRecipeTreeVariant = (variant: PublicItemRecipeTreeVariant) => {
  const text = firstEditorRecipeTreeText(variant.versionScope, variant.variantKey, variant.variantLabel).toLowerCase()
  return /(^|[^a-z])(pc|desktop|default|电脑版|电脑|默认)([^a-z]|$)/i.test(text)
}

const editorRecipeTreeRootNodes = (tree: PublicItemRecipeTree | null | undefined): PublicItemRecipeTreeNode[] => {
  if (!tree) return []
  const variants = Array.isArray(tree.variants) ? tree.variants : []
  const preferredVariant = variants.find(variant => isDefaultEditorRecipeTreeVariant(variant) && Array.isArray(variant.roots) && variant.roots.length > 0)
    || variants.find(variant => Array.isArray(variant.roots) && variant.roots.length > 0)
  const preferredRoots = Array.isArray(preferredVariant?.roots) ? preferredVariant.roots : []
  if (preferredRoots.length) return preferredRoots.slice(0, 1)
  for (const nodes of [tree.materials, tree.ingredients, tree.children, tree.nodes]) {
    if (Array.isArray(nodes) && nodes.length) return nodes.slice(0, 1)
  }
  return []
}

const editorRecipeTreeItemName = (tree: PublicItemRecipeTree | null | undefined, fallback = '') => firstEditorRecipeTreeText(
  tree?.item?.displayName,
  tree?.item?.nameZh,
  tree?.item?.name,
  tree?.displayName,
  tree?.resultName,
  tree?.name,
  fallback,
)

const editorRecipeTreeItemImage = (tree: PublicItemRecipeTree | null | undefined) => editorRecipeTreeImage(firstEditorRecipeTreeText(
  tree?.item?.previewImage,
  tree?.item?.imageUrl,
  tree?.item?.image,
  tree?.item?.iconUrl,
))

const renderEditorRecipeTreeShell = (node: HTMLElement, state: 'loading' | 'ready' | 'missing' | 'error', title: string, description: string, options: { imageUrl?: string, stats?: string[] } = {}) => {
  node.dataset.tpResolved = state
  node.setAttribute('contenteditable', 'false')
  node.setAttribute('role', 'group')
  node.setAttribute('aria-label', `${title} 合成树`)
  node.replaceChildren()

  const header = document.createElement('div')
  header.className = 'article-recipe-tree__header'
  const thumb = document.createElement('span')
  thumb.className = 'article-recipe-tree__thumb'
  thumb.setAttribute('aria-hidden', 'true')
  if (options.imageUrl) {
    const image = document.createElement('img')
    image.src = options.imageUrl
    image.alt = ''
    image.loading = 'lazy'
    image.decoding = 'async'
    thumb.append(image)
  } else thumb.textContent = '合'
  const copy = document.createElement('span')
  copy.className = 'article-recipe-tree__copy'
  const titleNode = document.createElement('strong')
  titleNode.textContent = title
  const descriptionNode = document.createElement('small')
  descriptionNode.textContent = description
  copy.append(titleNode, descriptionNode)
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
}

const mergeEditorRecipeTreeAlternativeChildren = (options: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  if (options.length > 1 && options.every(option => editorRecipeTreeNodeChildren(option).length > 0)) {
    const firstOption = options[0]
    if (firstOption) {
      return [{
        ...firstOption,
        displayName: editorRecipeTreeNodeName(firstOption),
        children: [{
          nodeType: 'recipe_options',
          displayName: `${editorRecipeTreeNodeName(firstOption)} · ${options.length} 条配方来源`,
          secondaryName: '多配方来源',
          children: [],
          recipeOptions: options.map(option => mergeEditorRecipeTreeSameItemSiblings(editorRecipeTreeNodeChildren(option))),
        } as PublicItemRecipeTreeNode & { recipeOptions: PublicItemRecipeTreeNode[][] }],
      }]
    }
  }

  const optionChildren = options.map(option => editorRecipeTreeNodeChildren(option))
  const counts = new Map<string, number>()
  for (const children of optionChildren) {
    const uniqueKeys = new Set(children.map(editorRecipeTreeNodeKey).filter(Boolean))
    for (const key of uniqueKeys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const sharedKeys = new Set([...counts.entries()].filter(([, count]) => count === options.length).map(([key]) => key))
  const shared = new Map<string, PublicItemRecipeTreeNode>()
  const alternatives: PublicItemRecipeTreeNode[] = []

  for (const children of optionChildren) {
    for (const child of children) {
      const key = editorRecipeTreeNodeKey(child)
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
    const key = editorRecipeTreeNodeKey(child)
    if (key && sharedKeys.has(key)) {
      const sharedChild = shared.get(key)
      if (sharedChild && !ordered.some(entry => editorRecipeTreeNodeKey(entry) === key)) ordered.push(sharedChild)
    } else if (!alternativeInserted && alternatives.length > 0) {
      const firstAlternative = alternatives[0]
      if (firstAlternative) {
        ordered.push({
          ...firstAlternative,
          displayName: alternatives.map(editorRecipeTreeNodeName).join(' 或 '),
          secondaryName: '可替代材料',
          itemInternalName: alternatives.map(node => firstEditorRecipeTreeText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '),
          groupMembers: alternatives.map(editorRecipeTreeNodeGroupMember),
          children: [],
        })
        alternativeInserted = true
      }
    }
  }

  for (const [key, child] of shared) {
    if (!ordered.some(entry => editorRecipeTreeNodeKey(entry) === key)) ordered.push(child)
  }
  if (!alternativeInserted && alternatives.length > 0) {
    const firstAlternative = alternatives[0]
    if (firstAlternative) {
      ordered.unshift({
        ...firstAlternative,
        displayName: alternatives.map(editorRecipeTreeNodeName).join(' 或 '),
        secondaryName: '可替代材料',
        itemInternalName: alternatives.map(node => firstEditorRecipeTreeText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '),
        groupMembers: alternatives.map(editorRecipeTreeNodeGroupMember),
        children: [],
      })
    }
  }
  return ordered
}

const mergeEditorRecipeTreeSameItemSiblings = (nodes: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  const groups = new Map<string, PublicItemRecipeTreeNode[]>()
  const order: string[] = []
  for (const node of nodes) {
    const key = `${editorRecipeTreeNodeKey(node)}:${firstEditorRecipeTreeText(node.quantityText, node.quantityMin, node.quantityMax, node.quantity, node.amount, node.count)}`
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
      children: mergeEditorRecipeTreeAlternativeChildren(group),
    }]
  })
}

const editorRecipeTreeGraphChildren = (node: PublicItemRecipeTreeNode, depth: number, maxDepth: number): PublicItemRecipeTreeNode[] => {
  if (depth >= maxDepth) return []
  let candidates = editorRecipeTreeNodeChildren(node)
  while (candidates.length === 1 && candidates[0] && isSameEditorRecipeTreeItem(node, candidates[0])) {
    const nextChildren = editorRecipeTreeNodeChildren(candidates[0])
    if (!nextChildren.length) break
    candidates = nextChildren
  }
  if (candidates.length > 1 && candidates.every(child => isSameEditorRecipeTreeItem(node, child))) {
    return mergeEditorRecipeTreeAlternativeChildren(candidates).slice(0, 18)
  }
  return mergeEditorRecipeTreeSameItemSiblings(candidates).slice(0, 18)
}

const EDITOR_RECIPE_GRAPH_CARD_WIDTH = 102
const EDITOR_RECIPE_GRAPH_OPTION_SOURCE_WIDTH = 150
const EDITOR_RECIPE_GRAPH_CARD_HEIGHT = 54
const EDITOR_RECIPE_GRAPH_X_GAP = 6
const EDITOR_RECIPE_GRAPH_Y_GAP = 10
const EDITOR_RECIPE_GRAPH_PADDING = 12
const EDITOR_RECIPE_GRAPH_MIN_SCALE = 0.48
const EDITOR_RECIPE_GRAPH_MAX_SCALE = 1
const EDITOR_RECIPE_GRAPH_MIN_MANUAL_SCALE = 0.6
const EDITOR_RECIPE_GRAPH_MAX_MANUAL_SCALE = 1.8
const EDITOR_RECIPE_GRAPH_MANUAL_SCALE_STEP = 0.1

const buildEditorRecipeTreeGraphLayout = (node: PublicItemRecipeTreeNode, depth: number, maxDepth: number, indexPath = '0', isRoot = false): any => {
  let normalizedNode = node
  let graphChildren = editorRecipeTreeGraphChildren(normalizedNode, depth, maxDepth)
  while (graphChildren.length === 1 && graphChildren[0] && isSameEditorRecipeTreeItem(normalizedNode, graphChildren[0])) {
    normalizedNode = graphChildren[0]
    graphChildren = editorRecipeTreeGraphChildren(normalizedNode, depth, maxDepth)
  }
  const children = graphChildren
    .map((child, index) => buildEditorRecipeTreeGraphLayout(child, depth + 1, maxDepth, `${indexPath}-${index}`, false))
  const itemKey = firstEditorRecipeTreeText(normalizedNode.recipeId, normalizedNode.itemId, normalizedNode.id, normalizedNode.itemInternalName, normalizedNode.itemName, normalizedNode.displayName, normalizedNode.name, indexPath)
  const width = editorRecipeTreeNodeCardWidth(normalizedNode)
  const height = editorRecipeTreeNodeCardHeight(normalizedNode)
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

const measureEditorRecipeTreeGraphLayout = (layoutNode: any): number => {
  if (!layoutNode.children.length) {
    layoutNode.subtreeWidth = layoutNode.width
    return layoutNode.subtreeWidth
  }
  const childWidth = layoutNode.children.reduce((total: number, child: any, index: number) =>
    total + measureEditorRecipeTreeGraphLayout(child) + (index === 0 ? 0 : EDITOR_RECIPE_GRAPH_X_GAP), 0)
  layoutNode.subtreeWidth = Math.max(layoutNode.width, childWidth)
  return layoutNode.subtreeWidth
}

const placeEditorRecipeTreeGraphLayout = (layoutNode: any, left: number, levelY: number[], nodes: any[], edges: any[]) => {
  layoutNode.x = left + layoutNode.subtreeWidth / 2 - layoutNode.anchorX
  layoutNode.y = levelY[layoutNode.depth] ?? 0
  nodes.push(layoutNode)
  if (!layoutNode.children.length) return

  const childWidth = layoutNode.children.reduce((total: number, child: any, index: number) =>
    total + child.subtreeWidth + (index === 0 ? 0 : EDITOR_RECIPE_GRAPH_X_GAP), 0)
  let childLeft = left + (layoutNode.subtreeWidth - childWidth) / 2
  for (const child of layoutNode.children) {
    placeEditorRecipeTreeGraphLayout(child, childLeft, levelY, nodes, edges)
    edges.push({
      id: `${layoutNode.id}-${child.id}`,
      fromX: layoutNode.x + layoutNode.anchorX,
      fromY: layoutNode.y + layoutNode.height,
      toX: child.x + child.anchorX,
      toY: child.y,
    })
    childLeft += child.subtreeWidth + EDITOR_RECIPE_GRAPH_X_GAP
  }
}

const layoutEditorRecipeTreeGraphForest = (roots: PublicItemRecipeTreeNode[], maxDepth: number) => {
  const rootLayouts = roots.slice(0, 1).map((root, index) => buildEditorRecipeTreeGraphLayout(root, 0, maxDepth, String(index), true))
  const nodes: any[] = []
  const edges: any[] = []
  const levelHeights: number[] = []
  const collectLevelHeights = (layoutNode: any) => {
    levelHeights[layoutNode.depth] = Math.max(levelHeights[layoutNode.depth] ?? 0, layoutNode.height)
    for (const child of layoutNode.children) collectLevelHeights(child)
  }
  for (const rootLayout of rootLayouts) collectLevelHeights(rootLayout)
  const levelY = levelHeights.reduce<number[]>((offsets, height, index) => {
    offsets[index] = index === 0 ? 0 : (offsets[index - 1] ?? 0) + (levelHeights[index - 1] ?? EDITOR_RECIPE_GRAPH_CARD_HEIGHT) + EDITOR_RECIPE_GRAPH_Y_GAP
    return offsets
  }, [])
  let left = 0
  for (const rootLayout of rootLayouts) {
    measureEditorRecipeTreeGraphLayout(rootLayout)
    placeEditorRecipeTreeGraphLayout(rootLayout, left, levelY, nodes, edges)
    left += rootLayout.subtreeWidth + EDITOR_RECIPE_GRAPH_X_GAP * 2
  }
  if (!nodes.length) return { nodes, edges, width: 0, height: 0 }

  const minX = Math.min(...nodes.map(node => node.x))
  const maxX = Math.max(...nodes.map(node => node.x + node.width))
  const minY = Math.min(...nodes.map(node => node.y))
  const maxY = Math.max(...nodes.map(node => node.y + node.height))
  const offsetX = EDITOR_RECIPE_GRAPH_PADDING - minX
  const offsetY = EDITOR_RECIPE_GRAPH_PADDING - minY
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
    width: maxX - minX + EDITOR_RECIPE_GRAPH_PADDING * 2,
    height: maxY - minY + EDITOR_RECIPE_GRAPH_PADDING * 2,
  }
}

const editorRecipeTreeGroupMembers = (node: PublicItemRecipeTreeNode) => Array.isArray(node.groupMembers) ? node.groupMembers : []

const editorRecipeTreeOptionGroups = (node: PublicItemRecipeTreeNode) =>
  node.nodeType === 'recipe_options' && Array.isArray((node as PublicItemRecipeTreeNode & { recipeOptions?: PublicItemRecipeTreeNode[][] }).recipeOptions)
    ? (node as PublicItemRecipeTreeNode & { recipeOptions: PublicItemRecipeTreeNode[][] }).recipeOptions
    : []

const editorRecipeTreeNodeCardWidth = (node: PublicItemRecipeTreeNode) =>
  editorRecipeTreeOptionGroups(node).length > 0 ? EDITOR_RECIPE_GRAPH_OPTION_SOURCE_WIDTH : EDITOR_RECIPE_GRAPH_CARD_WIDTH

const editorRecipeTreeNodeCardHeight = (node: PublicItemRecipeTreeNode) => {
  const optionRows = editorRecipeTreeOptionGroups(node).length
  if (optionRows > 0) return Math.max(EDITOR_RECIPE_GRAPH_CARD_HEIGHT, 12 + optionRows * 24)
  const members = editorRecipeTreeGroupMembers(node).length
  if (members <= 1) return EDITOR_RECIPE_GRAPH_CARD_HEIGHT
  return Math.max(EDITOR_RECIPE_GRAPH_CARD_HEIGHT, 20 + Math.ceil(members / 2) * 22 + 14)
}

const editorRecipeTreeRelationLabel = (node: PublicItemRecipeTreeNode, depth: number, isRoot = false) => {
  if (editorRecipeTreeOptionGroups(node).length > 0) return ''
  if (isRoot) return 'ROOT'
  const members = editorRecipeTreeGroupMembers(node)
  if (members.length > 1) return `任选 ${members.length}`
  return editorRecipeTreeGraphChildren(node, depth, depth + 1).length > 0 ? '子配方' : '材料'
}

const editorRecipeTreeStationSummary = (node: PublicItemRecipeTreeNode) => {
  const stations = editorRecipeTreeNodeStations(node)
  if (!stations.length) return ''
  const label = stations.map(editorRecipeTreeStationName).filter(Boolean).join(' / ')
  return stations.length > 2 ? `${label} +${stations.length - 2}` : label
}

const editorRecipeTreeChildNameSummary = (node: PublicItemRecipeTreeNode, depth: number) => {
  const children = editorRecipeTreeGraphChildren(node, depth, depth + 1)
  if (!children.length) return ''
  const names = children.map(editorRecipeTreeNodeName).filter(Boolean)
  const visibleNames = names.slice(0, 4).join(' / ')
  return names.length > 4 ? `${visibleNames} +${names.length - 4}` : visibleNames
}

const editorRecipeTreeNodeDetailRows = (node: PublicItemRecipeTreeNode, depth: number, relation: string, quantity: string) => {
  const rows: Array<{ label: string, value: string }> = []
  const optionGroups = editorRecipeTreeOptionGroups(node)
  if (optionGroups.length) {
    rows.push({ label: '类型', value: '多配方来源' })
    rows.push({ label: '概况', value: `${optionGroups.length} 条配方 · ${optionGroups.reduce((total, option) => total + option.length, 0)} 个材料项` })
    return rows
  }

  rows.push({ label: '类型', value: relation || '材料' })
  if (quantity) rows.push({ label: '数量', value: quantity })
  const stations = editorRecipeTreeStationSummary(node)
  if (stations) rows.push({ label: '制作站', value: stations })
  const children = editorRecipeTreeGraphChildren(node, depth, depth + 1)
  if (children.length) rows.push({ label: '下级', value: `${children.length} 个节点` })
  const childNames = editorRecipeTreeChildNameSummary(node, depth)
  if (childNames) rows.push({ label: '包含', value: childNames })
  const groupMembers = editorRecipeTreeGroupMembers(node)
  if (groupMembers.length > 1) rows.push({ label: '任选', value: groupMembers.map(editorRecipeTreeGroupMemberName).filter(Boolean).join(' / ') })
  return rows
}

const editorRecipeTreeFirstGlyph = (value: string) => Array.from(String(value || '').trim())[0] ?? '?'

const createEditorRecipeTreePreviewImage = (imageUrl: string, label: string, width: number, height: number) => {
  const preview = document.createElement('span')
  preview.className = `item-art tp-preview-image${imageUrl ? '' : ' is-fallback'}`
  preview.setAttribute('data-fallback', editorRecipeTreeFirstGlyph(label))
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

const createEditorRecipeTreeGraphLineCanvas = (layout: any) => {
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

const positionEditorRecipeTreePopover = (holder: HTMLElement, popover: HTMLElement) => {
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

const showEditorRecipeTreePopover = (holder: HTMLElement, popover: HTMLElement) => {
  holder.dataset.popoverActive = 'true'
  popover.dataset.editorRecipeTreePopover = 'true'
  if (popover.parentElement !== document.body) document.body.append(popover)
  popover.classList.add('is-visible')
  positionEditorRecipeTreePopover(holder, popover)
  requestAnimationFrame(() => positionEditorRecipeTreePopover(holder, popover))
}

const hideEditorRecipeTreePopover = (holder: HTMLElement, popover: HTMLElement) => {
  delete holder.dataset.popoverActive
  delete popover.dataset.editorRecipeTreePopover
  popover.classList.remove('is-visible')
  holder.append(popover)
}

const createEditorRecipeTreeGraphPositionedNode = (layoutNode: any) => {
  const holder = document.createElement('div')
  holder.className = `recipe-hierarchy-node recipe-overview-node${layoutNode.isRoot ? ' is-root' : ''}${layoutNode.children.length ? ' has-children' : ''}`
  holder.style.setProperty('--node-x', `${layoutNode.x}px`)
  holder.style.setProperty('--node-y', `${layoutNode.y}px`)
  holder.style.setProperty('--node-card-width', `${layoutNode.width}px`)
  holder.style.setProperty('--node-card-height', `${layoutNode.height}px`)

  const relation = document.createElement('span')
  relation.className = 'recipe-hierarchy-label'
  const relationText = editorRecipeTreeRelationLabel(layoutNode.node, layoutNode.depth, layoutNode.isRoot)
  relation.textContent = relationText
  holder.append(relation)

  const card = document.createElement('span')
  const optionGroups = editorRecipeTreeOptionGroups(layoutNode.node)
  if (optionGroups.length) holder.classList.add('has-recipe-options')
  const stations = editorRecipeTreeNodeStations(layoutNode.node).slice(0, 2)
  card.className = `recipe-hierarchy-card${stations.length && !optionGroups.length ? ' has-stations' : ''}${optionGroups.length ? ' has-recipe-options' : ''}`
  card.title = `${editorRecipeTreeNodeName(layoutNode.node)} ${editorRecipeTreeNodeQuantity(layoutNode.node, layoutNode.isRoot)}`
  card.setAttribute('aria-label', card.title)

  const main = document.createElement('span')
  main.className = 'recipe-hierarchy-main'
  main.title = editorRecipeTreeNodeName(layoutNode.node)

  if (optionGroups.length) {
    const source = document.createElement('span')
    source.className = 'recipe-hierarchy-option-source'
    source.title = editorRecipeTreeNodeName(layoutNode.node)
    source.setAttribute('aria-label', '多配方来源')
    const rows = document.createElement('span')
    rows.className = 'recipe-hierarchy-option-groups'
    for (const [optionIndex, option] of optionGroups.entries()) {
      const row = document.createElement('span')
      row.className = 'recipe-hierarchy-option-row'
      row.title = option.map(editorRecipeTreeNodeName).join(' + ')
      row.setAttribute('data-recipe-option-index', String(optionIndex + 1))
      for (const material of option.slice(0, 5)) {
        const materialNode = document.createElement('span')
        materialNode.className = 'recipe-hierarchy-option-material'
        materialNode.title = `${editorRecipeTreeNodeName(material)} ${editorRecipeTreeNodeQuantity(material)}`
        materialNode.append(createEditorRecipeTreePreviewImage(editorRecipeTreeNodeImage(material), editorRecipeTreeNodeName(material), 18, 18))
        const quantity = document.createElement('span')
        quantity.className = 'recipe-hierarchy-option-quantity'
        quantity.textContent = editorRecipeTreeNodeQuantity(material)
        materialNode.append(quantity)
        row.append(materialNode)
      }
      rows.append(row)
    }
    source.append(rows)
    main.append(source)
  } else if (editorRecipeTreeGroupMembers(layoutNode.node).length > 1) {
    const alternatives = document.createElement('span')
    alternatives.className = 'recipe-hierarchy-alt-images'
    alternatives.title = editorRecipeTreeGroupMembers(layoutNode.node).map(editorRecipeTreeGroupMemberName).filter(Boolean).join(' / ')
    alternatives.setAttribute('aria-label', '可替代材料')
    for (const member of editorRecipeTreeGroupMembers(layoutNode.node).slice(0, 4)) {
      alternatives.append(createEditorRecipeTreePreviewImage(editorRecipeTreeGroupMemberImage(member), editorRecipeTreeGroupMemberName(member), 22, 22))
    }
    main.append(alternatives)
  } else {
    main.append(createEditorRecipeTreePreviewImage(editorRecipeTreeNodeImage(layoutNode.node), editorRecipeTreeNodeName(layoutNode.node), layoutNode.isRoot ? 34 : 30, layoutNode.isRoot ? 34 : 30))
    const quantity = document.createElement('span')
    quantity.className = 'recipe-hierarchy-quantity'
    quantity.textContent = editorRecipeTreeNodeQuantity(layoutNode.node, layoutNode.isRoot)
    main.append(quantity)
  }

  card.append(main)
  if (stations.length && !optionGroups.length) {
    const stationRail = document.createElement('span')
    stationRail.className = 'recipe-hierarchy-station-rail'
    stationRail.title = stations.map(editorRecipeTreeStationName).filter(Boolean).join(' / ')
    stationRail.setAttribute('aria-label', '制作站')
    for (const station of stations) {
      const badge = document.createElement('span')
      badge.className = 'recipe-hierarchy-station-badge'
      badge.title = editorRecipeTreeStationName(station)
      badge.append(createEditorRecipeTreePreviewImage(editorRecipeTreeStationImage(station), editorRecipeTreeStationName(station), 18, 18))
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
      popoverImages.append(createEditorRecipeTreePreviewImage(editorRecipeTreeNodeImage(material), editorRecipeTreeNodeName(material), 26, 26))
    }
  } else if (editorRecipeTreeGroupMembers(layoutNode.node).length > 1) {
    for (const member of editorRecipeTreeGroupMembers(layoutNode.node).slice(0, 4)) {
      popoverImages.append(createEditorRecipeTreePreviewImage(editorRecipeTreeGroupMemberImage(member), editorRecipeTreeGroupMemberName(member), 26, 26))
    }
  } else {
    popoverImages.append(createEditorRecipeTreePreviewImage(editorRecipeTreeNodeImage(layoutNode.node), editorRecipeTreeNodeName(layoutNode.node), 26, 26))
  }
  const popoverTitle = document.createElement('span')
  popoverTitle.className = 'recipe-hierarchy-popover-title'
  const title = document.createElement('b')
  title.textContent = editorRecipeTreeNodeName(layoutNode.node)
  const subtitle = document.createElement('span')
  subtitle.textContent = editorRecipeTreeGroupMembers(layoutNode.node).length > 1 ? '可替代材料' : firstEditorRecipeTreeText(layoutNode.node.secondaryName, layoutNode.node.itemInternalName, layoutNode.node.itemName)
  popoverTitle.append(title)
  if (subtitle.textContent) popoverTitle.append(subtitle)
  popoverHead.append(popoverImages, popoverTitle)
  const detailList = document.createElement('dl')
  for (const row of editorRecipeTreeNodeDetailRows(layoutNode.node, layoutNode.depth, relationText, editorRecipeTreeNodeQuantity(layoutNode.node, layoutNode.isRoot))) {
    const term = document.createElement('dt')
    term.textContent = row.label
    const description = document.createElement('dd')
    description.textContent = row.value
    detailList.append(term, description)
  }
  popover.append(popoverHead, detailList)
  holder.append(popover)
  holder.onmouseenter = () => showEditorRecipeTreePopover(holder, popover)
  holder.onmouseleave = () => hideEditorRecipeTreePopover(holder, popover)
  holder.addEventListener('focusin', () => showEditorRecipeTreePopover(holder, popover))
  holder.addEventListener('focusout', () => hideEditorRecipeTreePopover(holder, popover))
  return holder
}

const updateEditorRecipeTreeZoom = (graph: HTMLElement) => {
  const baseScale = Number(graph.dataset.baseScale || '1')
  const manualScale = Number(graph.dataset.manualScale || '1')
  const layoutHeight = Number(graph.dataset.layoutHeight || '0')
  const scale = Math.max(EDITOR_RECIPE_GRAPH_MIN_SCALE, Math.min(EDITOR_RECIPE_GRAPH_MAX_MANUAL_SCALE, baseScale * manualScale))
  graph.style.setProperty('--recipe-overview-scale', String(scale))
  graph.style.setProperty('--recipe-overview-pan-x', `${Number(graph.dataset.panX || '0')}px`)
  graph.style.setProperty('--recipe-overview-pan-y', `${Number(graph.dataset.panY || '0')}px`)
  graph.style.minHeight = `${Math.ceil(layoutHeight * baseScale)}px`
  const activeHolder = graph.querySelector<HTMLElement>('.recipe-overview-node[data-popover-active="true"]')
  const activePopover = activeHolder?.querySelector<HTMLElement>('.recipe-hierarchy-popover') || document.body.querySelector<HTMLElement>('.recipe-hierarchy-popover[data-editor-recipe-tree-popover="true"]')
  if (activeHolder && activePopover) requestAnimationFrame(() => positionEditorRecipeTreePopover(activeHolder, activePopover))
}

const changeEditorRecipeTreeZoomFromWheel = (graph: HTMLElement, event: WheelEvent) => {
  event.preventDefault()
  const current = Number(graph.dataset.manualScale || '1')
  const delta = event.deltaY > 0 ? -EDITOR_RECIPE_GRAPH_MANUAL_SCALE_STEP : EDITOR_RECIPE_GRAPH_MANUAL_SCALE_STEP
  graph.dataset.manualScale = String(Math.max(EDITOR_RECIPE_GRAPH_MIN_MANUAL_SCALE, Math.min(EDITOR_RECIPE_GRAPH_MAX_MANUAL_SCALE, Number((current + delta).toFixed(2)))))
  updateEditorRecipeTreeZoom(graph)
}

const startEditorRecipeTreePan = (graph: HTMLElement, event: PointerEvent) => {
  if ((event.target as HTMLElement | null)?.closest('.recipe-overview-node')) return
  graph.dataset.panPointerId = String(event.pointerId)
  graph.dataset.panStartX = String(event.clientX)
  graph.dataset.panStartY = String(event.clientY)
  graph.dataset.panOriginX = graph.dataset.panX || '0'
  graph.dataset.panOriginY = graph.dataset.panY || '0'
  graph.classList.add('is-panning')
  graph.setPointerCapture(event.pointerId)
}

const moveEditorRecipeTreePan = (graph: HTMLElement, event: PointerEvent) => {
  if (graph.dataset.panPointerId !== String(event.pointerId)) return
  graph.dataset.panX = String(Number(graph.dataset.panOriginX || '0') + event.clientX - Number(graph.dataset.panStartX || '0'))
  graph.dataset.panY = String(Number(graph.dataset.panOriginY || '0') + event.clientY - Number(graph.dataset.panStartY || '0'))
  updateEditorRecipeTreeZoom(graph)
}

const endEditorRecipeTreePan = (graph: HTMLElement, event: PointerEvent) => {
  if (graph.dataset.panPointerId !== String(event.pointerId)) return
  if (graph.hasPointerCapture?.(event.pointerId)) graph.releasePointerCapture(event.pointerId)
  delete graph.dataset.panPointerId
  graph.classList.remove('is-panning')
}

const enableEditorRecipeTreeInteractions = (graph: HTMLElement) => {
  graph.addEventListener('wheel', event => changeEditorRecipeTreeZoomFromWheel(graph, event), { passive: false })
  graph.addEventListener('pointerdown', event => startEditorRecipeTreePan(graph, event))
  graph.addEventListener('pointermove', event => moveEditorRecipeTreePan(graph, event))
  graph.addEventListener('pointerup', event => endEditorRecipeTreePan(graph, event))
  graph.addEventListener('pointercancel', event => endEditorRecipeTreePan(graph, event))
}

const appendEditorRecipeTreeGraph = (container: HTMLElement, roots: PublicItemRecipeTreeNode[], maxDepth: number) => {
  const availableWidth = Math.max(280, container.clientWidth ? container.clientWidth - 2 : 680)
  const graph = renderRecipeHierarchyGraph({
    roots,
    maxDepth,
    availableWidth,
    resolveImageUrl: imageUrl => editorRecipeTreeImage(imageUrl),
    popoverOwner: 'editor',
  })
  if (!graph) return
  graph.classList.add('editor-recipe-tree__graph')
  container.append(graph)
}

const renderEditorRecipeTreeResult = (node: HTMLElement, tree: PublicItemRecipeTree | null, maxDepth: number, label: string) => {
  const title = editorRecipeTreeItemName(tree, label) || label
  if (!tree) {
    renderEditorRecipeTreeShell(node, 'missing', title, '合成树暂不可用')
    return
  }
  const roots = editorRecipeTreeRootNodes(tree)
  const variantCount = Array.isArray(tree.variants) ? tree.variants.length : 0
  renderEditorRecipeTreeShell(node, 'ready', title, '文章嵌入的合成树摘要', {
    imageUrl: editorRecipeTreeItemImage(tree),
    stats: [variantCount ? `${variantCount} 个版本` : '默认版本', `深度 ${maxDepth}`],
  })
  appendEditorRecipeTreeGraph(node, roots, maxDepth)
}

const collectEditorRecipeTreeEmbeds = () => {
  const editor = editorRef.value
  if (!editor) return []
  return Array.from(editor.querySelectorAll<HTMLElement>('.tp-recipe-tree'))
    .map((node) => {
      const itemId = String(node.dataset.tpItemId || '').trim()
      const maxDepth = Number(node.dataset.tpMaxDepth)
      const label = String(node.dataset.tpLabel || '').trim()
      if (!/^\d{1,12}$/.test(itemId) || !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 5 || !label || label.length > 80) return null
      return { node, itemId, maxDepth, label }
    })
    .filter((embed): embed is { node: HTMLElement, itemId: string, maxDepth: number, label: string } => Boolean(embed))
}

const loadEditorRecipeTreeEmbeds = async () => {
  if (!import.meta.client) return
  const sequence = ++editorRecipeTreeLoadSequence
  await nextTick()
  const embeds = collectEditorRecipeTreeEmbeds()
  if (!embeds.length) return
  for (const embed of embeds) {
    renderEditorRecipeTreeShell(embed.node, 'loading', embed.label, '合成树加载中...')
  }
  await Promise.all(embeds.map(async (embed) => {
    try {
      const result = await fetchPublicRecipeTree(embed.itemId, embed.maxDepth)
      if (sequence !== editorRecipeTreeLoadSequence || !editorRef.value?.contains(embed.node)) return
      renderEditorRecipeTreeResult(embed.node, result.tree, embed.maxDepth, embed.label)
    } catch {
      if (sequence !== editorRecipeTreeLoadSequence || !editorRef.value?.contains(embed.node)) return
      renderEditorRecipeTreeShell(embed.node, 'error', embed.label, '合成树加载失败')
    }
  }))
}

const sanitizeEditorElement = (element: Element) => {
  const tagName = element.tagName.toLowerCase()
  if (!allowedEditorTags.has(tagName)) {
    const parent = element.parentNode
    if (!parent) return
    while (element.firstChild) parent.insertBefore(element.firstChild, element)
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

    const tagAllowedAttributes = allowedEditorAttributes[tagName]
    if (!tagAllowedAttributes?.has(attrName)) {
      element.removeAttribute(attribute.name)
      continue
    }

    if (tagName === 'span' && attrName === 'class') {
      continue
    }

    if (tagName === 'span' && attrName.startsWith('data-tp-ref-')) {
      continue
    }

    if ((attrName === 'href' || attrName === 'src') && !isSafeEditorUrl(attrValue, attrName)) {
      element.removeAttribute(attribute.name)
      continue
    }

    if (attrName === 'style') {
      const sanitizedStyle = sanitizeEditorStyle(attrValue)
      if (sanitizedStyle) {
        element.setAttribute('style', sanitizedStyle)
      } else {
        element.removeAttribute(attribute.name)
      }
    }
  }

  if (tagName === 'a') {
    if (element.getAttribute('href')) {
      element.setAttribute('rel', 'noopener noreferrer')
      element.setAttribute('target', '_blank')
    } else {
      element.removeAttribute('rel')
      element.removeAttribute('target')
    }
  }

  if (tagName === 'span') {
    if ((element.getAttribute('class') || '').split(/\s+/).includes('tp-content-ref')) {
      if (isAtomicEditorReferenceSpan(element)) {
        element.setAttribute('class', 'tp-content-ref')
        element.setAttribute('data-tp-ref-type', String(element.getAttribute('data-tp-ref-type') || '').trim().toLowerCase())
        element.setAttribute('data-tp-ref-id', String(element.getAttribute('data-tp-ref-id') || '').trim())
        element.setAttribute('data-tp-ref-label', String(element.getAttribute('data-tp-ref-label') || '').trim())
        const imageUrl = normalizeUserArticleReferenceImage(element.getAttribute('data-tp-ref-image'))
        if (imageUrl) element.setAttribute('data-tp-ref-image', imageUrl)
        else element.removeAttribute('data-tp-ref-image')
        const displayMode = normalizeUserArticleReferenceDisplayMode(element.getAttribute('data-tp-ref-display')) || 'image'
        element.setAttribute('data-tp-ref-display', displayMode)
        renderEditorReferenceElement(element)
      } else {
        stripEditorReferenceAttributes(element)
      }
    } else {
      stripEditorReferenceAttributes(element)
    }
  }

  if (tagName === 'div' && (element.getAttribute('class') || '').split(/\s+/).includes('tp-recipe-tree')) {
    if (isAtomicEditorRecipeTreeEmbed(element) || hasNormalizableEditorRecipeTreeEmbedIdentity(element)) {
      normalizeEditorRecipeTreeEmbed(element)
    } else {
      element.replaceWith(...Array.from(element.childNodes))
    }
    return
  }

  if (tagName === 'img') {
    if (!element.getAttribute('src')) {
      element.remove()
      return
    }
    element.setAttribute('loading', 'lazy')
    element.setAttribute('decoding', 'async')
    if (!element.getAttribute('alt')) element.setAttribute('alt', '')
    if (element.closest('.tp-content-ref')) {
      element.removeAttribute('style')
      element.setAttribute('aria-hidden', 'true')
      return
    }
    if (!element.getAttribute('style')) {
      ;(element as HTMLElement).style.display = 'block'
      ;(element as HTMLElement).style.maxWidth = '100%'
      ;(element as HTMLElement).style.height = 'auto'
    }
  }
}

const sanitizeEditorTree = (node: Node) => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    sanitizeEditorElement(node as Element)
  }
  for (const child of Array.from(node.childNodes)) {
    sanitizeEditorTree(child)
  }
}

const sanitizeEditorHtml = (value: string) => {
  if (!import.meta.client) return value.trim()
  const root = document.createElement('div')
  root.innerHTML = unwrapUserArticleTypingPlaceholders(value || '')
  sanitizeEditorTree(root)
  for (const emptySpan of Array.from(root.querySelectorAll('span'))) {
    if (!emptySpan.textContent?.trim() && !emptySpan.querySelector('img')) emptySpan.remove()
  }
  return root.innerHTML.trim()
}

const updateHistoryButtons = () => {
  canUndoHistory.value = editorHistory.canUndo()
  canRedoHistory.value = editorHistory.canRedo()
}

const emitEditorValue = () => {
  if (syncingFromModel.value || isRestoringHistory.value) return
  const editor = editorRef.value
  if (!editor) return
  const nextHtml = sanitizeEditorHtml(editor.innerHTML)
  editorHistory.commit(nextHtml)
  updateHistoryButtons()
  lastEmittedEditorHtml = nextHtml
  emit('update:modelValue', sanitizeEditorHtml(editor.innerHTML))
}

const syncEditorFromModel = async () => {
  await nextTick()
  const editor = editorRef.value
  if (!editor) return
  const nextHtml = sanitizeUserArticleEditorLoadedHtml(props.modelValue || '<p><br></p>') || '<p><br></p>'
  const normalizedNextHtml = sanitizeEditorHtml(nextHtml)
  const normalizedCurrentHtml = sanitizeEditorHtml(editor.innerHTML)
  if (normalizedNextHtml === lastEmittedEditorHtml && normalizedCurrentHtml === normalizedNextHtml) {
    updateHistoryButtons()
    void loadEditorRecipeTreeEmbeds()
    return
  }
  if (editor.innerHTML === nextHtml || sanitizeEditorHtml(editor.innerHTML) === normalizedNextHtml) {
    editorHistory.reset(normalizedNextHtml)
    updateHistoryButtons()
    void loadEditorRecipeTreeEmbeds()
    return
  }
  syncingFromModel.value = true
  editor.innerHTML = nextHtml
  await nextTick()
  syncingFromModel.value = false
  editorHistory.reset(normalizedNextHtml)
  updateHistoryButtons()
  void loadEditorRecipeTreeEmbeds()
}

watch(() => props.modelValue, () => {
  void syncEditorFromModel()
})

const saveSelection = () => {
  const editor = editorRef.value
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return
  savedRange.value = range.cloneRange()
}

const isEditorRange = (range: Range | null) => {
  const editor = editorRef.value
  return Boolean(editor && range && editor.contains(range.commonAncestorContainer))
}

const setCaretAtEnd = (element: HTMLElement) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
  savedRange.value = range.cloneRange()
}

const setCaretAfterNode = (node: Node) => {
  const range = document.createRange()
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, node.textContent?.length || 0)
  } else {
    range.setStartAfter(node)
  }
  range.collapse(true)
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
  savedRange.value = range.cloneRange()
}

const clearEditorTransientState = () => {
  savedRange.value = null
  colorMenuOpen.value = false
  linkMenuOpen.value = false
  referenceMenuOpen.value = false
  selectEditorImage(null)
  handleEditorDragEnd()
}

const restoreEditorHistoryHtml = (html: string) => {
  const editor = editorRef.value
  if (!editor) return
  isRestoringHistory.value = true
  clearEditorTransientState()
  editor.innerHTML = sanitizeUserArticleEditorLoadedHtml(html || '<p><br></p>') || '<p><br></p>'
  setCaretAtEnd(editor)
  isRestoringHistory.value = false
  updateHistoryButtons()
  lastEmittedEditorHtml = sanitizeEditorHtml(editor.innerHTML)
  emit('update:modelValue', lastEmittedEditorHtml)
  void loadEditorRecipeTreeEmbeds()
}

const undoEditorHistory = () => {
  if (props.disabled || !editorHistory.canUndo()) return
  restoreEditorHistoryHtml(editorHistory.undo())
}

const redoEditorHistory = () => {
  if (props.disabled || !editorHistory.canRedo()) return
  restoreEditorHistoryHtml(editorHistory.redo())
}

const handleEditorKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  const key = event.key.toLowerCase()
  const isModifierPressed = event.ctrlKey || event.metaKey
  if (!isModifierPressed) return
  if (key === 'z' && event.shiftKey) {
    event.preventDefault()
    redoEditorHistory()
    return
  }
  if (key === 'z') {
    event.preventDefault()
    undoEditorHistory()
    return
  }
  if (key === 'y') {
    event.preventDefault()
    redoEditorHistory()
  }
}

const ensureEditorRange = () => {
  const editor = editorRef.value
  if (!editor) return null
  if (!editor.innerHTML.trim()) editor.innerHTML = '<p><br></p>'

  const selection = window.getSelection()
  if (selection?.rangeCount) {
    const selectedRange = selection.getRangeAt(0)
    if (isEditorRange(selectedRange)) {
      savedRange.value = selectedRange.cloneRange()
      return selectedRange
    }
  }

  if (isEditorRange(savedRange.value)) {
    restoreSelection()
    return savedRange.value
  }

  setCaretAtEnd(editor)
  return savedRange.value
}

const handleToolbarMouseDown = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.closest('select,input,textarea')) {
    saveSelection()
    return
  }
  event.preventDefault()
  saveSelection()
}

const restoreSelection = () => {
  const editor = editorRef.value
  const range = savedRange.value
  if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

const setCaretInTypingNode = (node: Text) => {
  const range = document.createRange()
  range.setStart(node, node.data.length)
  range.collapse(true)
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
  savedRange.value = range.cloneRange()
}

const exec = (command: string, value?: string) => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(command, false, value)
  saveSelection()
  emitEditorValue()
}

const formatBlock = (tag: string) => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  const activeRange = ensureEditorRange()
  if (!activeRange || !isEditorRange(activeRange)) return

  const blocks = collectSelectedBlocks()
  const targetBlocks = blocks.length ? blocks : [editor]
  let lastBlock: HTMLElement | null = null
  for (const block of targetBlocks) {
    const current = block.closest(BLOCK_SELECTOR) as HTMLElement | null
    if (!current || !editor.contains(current)) continue
    const replacement = document.createElement(tag)
    replacement.innerHTML = current.innerHTML || '<br>'
    const style = current.getAttribute('style')
    if (style) replacement.setAttribute('style', style)
    current.replaceWith(replacement)
    lastBlock = replacement
  }
  if (!lastBlock) {
    editor.innerHTML = setUserArticleBlockTag(editor.innerHTML, tag)
    lastBlock = editor.querySelector(tag) as HTMLElement | null
  }
  if (lastBlock) setCaretAtEnd(lastBlock)
  emitEditorValue()
}

const normalizeEditorFontTags = (targetPx: number) => {
  const editor = editorRef.value
  if (!editor) return
  for (const node of Array.from(editor.querySelectorAll('font[size="7"]'))) {
    const span = document.createElement('span')
    span.style.fontSize = `${targetPx}px`
    span.innerHTML = node.innerHTML
    node.replaceWith(span)
  }
}

const applyFontSize = () => {
  const nextPx = Number(fontSizePx.value)
  if (!Number.isFinite(nextPx) || nextPx <= 0) return
  applyInlineStyleToSelection()
  normalizeEditorFontTags(nextPx)
  emitEditorValue()
}

const findSelectionElement = () => {
  const range = ensureEditorRange()
  if (!range) return null
  const node = range.startContainer
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
}

const setInlineStyle = (element: HTMLElement) => {
  const nextPx = Number(fontSizePx.value)
  if (Number.isFinite(nextPx) && nextPx > 0) {
    element.style.fontSize = `${nextPx}px`
  }
  element.style.color = sanitizeUserArticleEditorColor(textColorValue.value)
}

const applyInlineStyleToReference = (element: HTMLElement) => {
  setInlineStyle(element)
  if (element.dataset.tpRefDisplay !== 'text') {
    element.style.lineHeight = '1'
  }
}

const collectSelectedReferences = (range: Range) => {
  const editor = editorRef.value
  if (!editor) return [] as HTMLElement[]
  const references = new Set<HTMLElement>()
  for (const reference of Array.from(editor.querySelectorAll<HTMLElement>('.tp-content-ref'))) {
    try {
      if (range.intersectsNode(reference)) references.add(reference)
    } catch {
      continue
    }
  }
  const startReference = (range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement)?.closest('.tp-content-ref') as HTMLElement | null
  const endReference = (range.endContainer.nodeType === Node.ELEMENT_NODE
    ? range.endContainer as Element
    : range.endContainer.parentElement)?.closest('.tp-content-ref') as HTMLElement | null
  if (startReference && editor.contains(startReference)) references.add(startReference)
  if (endReference && editor.contains(endReference)) references.add(endReference)
  return Array.from(references)
}

const applyInlineStyleToSelection = () => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  const range = ensureEditorRange()
  if (!range || !isEditorRange(range)) return
  const selectedReferences = collectSelectedReferences(range)

  const styleText = buildUserArticleInlineStyle({
    fontSizePx: fontSizePx.value,
    textColor: textColorValue.value,
  })

  if (range.collapsed) {
    const selectionElement = findSelectionElement()
    const typingSpan = selectionElement?.closest('span') as HTMLElement | null
    if (typingSpan && editor.contains(typingSpan) && typingSpan.textContent?.includes(USER_ARTICLE_EDITOR_PLACEHOLDER)) {
      setInlineStyle(typingSpan)
      const textNode = Array.from(typingSpan.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE)
      if (textNode) setCaretInTypingNode(textNode)
      saveSelection()
      return
    }

    const span = document.createElement('span')
    setInlineStyle(span)
    const placeholder = document.createTextNode(USER_ARTICLE_EDITOR_PLACEHOLDER)
    span.appendChild(placeholder)
    range.insertNode(span)
    for (const reference of selectedReferences) applyInlineStyleToReference(reference)
    setCaretInTypingNode(placeholder)
    saveSelection()
    void buildUserArticleTypingSpanHtml(styleText)
    return
  }

  const styleResult = applyUserArticleInlineStyleToSelectedRange({
    editor,
    range,
    fontSizePx: fontSizePx.value,
    textColor: textColorValue.value,
  })
  for (const reference of selectedReferences) {
    if (editor.contains(reference)) applyInlineStyleToReference(reference)
  }
  if (styleResult.mode === 'inline' && styleResult.element instanceof HTMLElement) {
    setCaretAtEnd(styleResult.element)
  }
  saveSelection()
}

const collectSelectedBlocks = () => {
  const editor = editorRef.value
  if (!editor) return [] as HTMLElement[]
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    ? selection.getRangeAt(0)
    : savedRange.value
  if (!range || !editor.contains(range.commonAncestorContainer)) return [] as HTMLElement[]

  const blocks = new Set<HTMLElement>()
  const startElement = (range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement)?.closest(BLOCK_SELECTOR) as HTMLElement | null
  if (startElement) blocks.add(startElement)
  for (const candidate of Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
    try {
      if (range.intersectsNode(candidate)) blocks.add(candidate)
    } catch {
      continue
    }
  }
  return Array.from(blocks)
}

const applyStyleToSelectedBlocks = (property: 'line-height' | 'text-indent', value: string) => {
  if (props.disabled) return
  const blocks = collectSelectedBlocks()
  if (!blocks.length) return
  for (const block of blocks) {
    if (!value || value === '0') {
      block.style.removeProperty(property)
    } else {
      block.style.setProperty(property, value)
    }
  }
  saveSelection()
  emitEditorValue()
}

const applyLineHeight = () => {
  applyStyleToSelectedBlocks('line-height', lineHeightValue.value)
}

const applyTextIndent = () => {
  applyStyleToSelectedBlocks('text-indent', textIndentValue.value)
}

const applyTextColor = () => {
  textColorValue.value = sanitizeUserArticleEditorColor(textColorValue.value)
  applyInlineStyleToSelection()
  emitEditorValue()
}

const applyPresetTextColor = (value: string) => {
  textColorValue.value = sanitizeUserArticleEditorColor(value)
  applyTextColor()
  colorMenuOpen.value = false
}

const toggleColorMenu = () => {
  if (props.disabled) return
  saveSelection()
  colorMenuOpen.value = !colorMenuOpen.value
  if (colorMenuOpen.value) linkMenuOpen.value = false
}

const getRangeElement = (range: Range | null) => {
  if (!range) return null
  return range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement
}

const findActiveLink = () => {
  const range = ensureEditorRange()
  const editor = editorRef.value
  const element = getRangeElement(range)
  const link = element?.closest('a') as HTMLAnchorElement | null
  return link && editor?.contains(link) ? link : null
}

const getSelectedEditorText = () => {
  const editor = editorRef.value
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return ''
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return ''
  return selection.toString().trim()
}

const openLinkMenu = () => {
  if (props.disabled) return
  saveSelection()
  const link = findActiveLink()
  linkUrlValue.value = link?.getAttribute('href') || ''
  linkTitleValue.value = link?.textContent?.trim() || getSelectedEditorText()
  linkMenuOpen.value = true
  colorMenuOpen.value = false
  referenceMenuOpen.value = false
}

const closeLinkMenu = () => {
  linkMenuOpen.value = false
}

const openReferenceMenu = () => {
  if (props.disabled) return
  saveSelection()
  referenceMenuOpen.value = true
  emit('referencePanelOpen')
  colorMenuOpen.value = false
  linkMenuOpen.value = false
  if (!referenceSearchLoading.value && !referenceSearchResults.value.length) void runReferenceSearch()
}

const closeReferenceMenu = () => {
  referenceMenuOpen.value = false
  referenceSearchError.value = ''
}

const clearReferenceSearchTimer = () => {
  if (!referenceSearchTimer) return
  clearTimeout(referenceSearchTimer)
  referenceSearchTimer = null
}

const runReferenceSearch = async () => {
  const q = referenceSearchText.value.trim()
  const sequence = ++referenceSearchSequence
  referenceSearchLoading.value = true
  referenceSearchError.value = ''
  try {
    const results = await searchPublicContentReferences({
      q,
      types: referenceSearchType.value === 'all' ? 'item,npc,boss' : referenceSearchType.value,
      limit: 20,
    })
    if (sequence === referenceSearchSequence) referenceSearchResults.value = results
  } catch {
    if (sequence === referenceSearchSequence) {
      referenceSearchError.value = '引用搜索失败，请稍后重试。'
      referenceSearchResults.value = []
    }
  } finally {
    if (sequence === referenceSearchSequence) referenceSearchLoading.value = false
  }
}

const scheduleReferenceSearch = () => {
  clearReferenceSearchTimer()
  referenceSearchTimer = setTimeout(() => {
    void runReferenceSearch()
  }, 180)
}

watch([referenceSearchText, referenceSearchType], scheduleReferenceSearch)

const insertContentReference = (reference: NormalizedContentReference) => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  const range = ensureEditorRange()
  if (!range || !isEditorRange(range)) return
  const html = buildUserArticleReferenceHtml({
    type: reference.type,
    id: reference.id,
    label: reference.label,
    imageUrl: reference.imageUrl,
    displayMode: referenceDisplayMode.value,
  })
  if (!html) {
    emit('error', '引用插入失败。')
    return
  }
  const template = document.createElement('template')
  template.innerHTML = html
  const node = template.content.firstElementChild
  if (!node) return
  node.setAttribute('contenteditable', 'false')
  node.setAttribute('draggable', 'true')
  const trailingSpace = document.createTextNode('\u00a0')
  range.deleteContents()
  range.insertNode(node)
  node.after(trailingSpace)
  setCaretAfterNode(trailingSpace)
  emitEditorValue()
}

const insertRecipeTreeEmbed = (reference: NormalizedContentReference) => {
  if (props.disabled || reference.type !== 'item') return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  const range = ensureEditorRange()
  if (!range || !isEditorRange(range)) return
  const html = buildUserArticleRecipeTreeEmbedHtml({
    itemId: reference.id,
    maxDepth: 5,
    label: reference.label,
  })
  if (!html) {
    emit('error', '合成树插入失败。')
    return
  }
  const template = document.createElement('template')
  template.innerHTML = `${html}<p><br></p>`
  const fragment = template.content
  const embedNode = fragment.querySelector('.tp-recipe-tree')
  const caretBlock = fragment.querySelector('p')
  if (embedNode instanceof HTMLElement) embedNode.setAttribute('contenteditable', 'false')

  const activeElement = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement
  const activeBlock = activeElement?.closest('p,h2,h3,h4,blockquote')
  if (range.collapsed && activeBlock instanceof HTMLElement && editor.contains(activeBlock) && activeBlock.parentElement === editor && embedNode instanceof HTMLElement) {
    const afterRange = document.createRange()
    afterRange.selectNodeContents(activeBlock)
    afterRange.setStart(range.startContainer, range.startOffset)
    const afterFragment = afterRange.extractContents()
    if (!activeBlock.textContent?.trim() && !activeBlock.querySelector('img,.tp-content-ref')) activeBlock.innerHTML = '<br>'

    const insertedNodes: Node[] = [embedNode]
    const hasAfterContent = Boolean((afterFragment.textContent || '').trim() || afterFragment.querySelector?.('img,.tp-content-ref'))
    if (hasAfterContent) {
      const afterBlock = document.createElement(activeBlock.tagName.toLowerCase())
      afterBlock.append(afterFragment)
      insertedNodes.push(afterBlock)
    }
    if (caretBlock instanceof HTMLElement) insertedNodes.push(caretBlock)
    activeBlock.after(...insertedNodes)
    if (caretBlock instanceof HTMLElement) setCaretAtEnd(caretBlock)
    emitEditorValue()
    void loadEditorRecipeTreeEmbeds()
    return
  }

  range.deleteContents()
  range.insertNode(fragment)
  if (caretBlock instanceof HTMLElement) setCaretAtEnd(caretBlock)
  emitEditorValue()
  void loadEditorRecipeTreeEmbeds()
}

const buildLinkAnchor = (href: string, title: string) => {
  const html = buildUserArticleLinkHtml({ href, title })
  if (!html) return null
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.firstElementChild as HTMLAnchorElement | null
}

const applyLink = () => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return

  const normalizedHref = normalizeUserArticleLinkHref(linkUrlValue.value)
  if (!isSafeUserArticleLinkHref(normalizedHref)) {
    emit('error', '请输入有效的链接地址。')
    return
  }

  editor.focus()
  restoreSelection()
  const range = ensureEditorRange()
  if (!range || !isEditorRange(range)) return

  const selectedText = getSelectedEditorText()
  const title = linkTitleValue.value.trim() || selectedText

  const anchor = buildLinkAnchor(normalizedHref, title)
  if (!anchor) {
    emit('error', '链接插入失败。')
    return
  }

  const activeLink = findActiveLink()
  if (activeLink && editor.contains(activeLink)) {
    activeLink.replaceWith(anchor)
  } else {
    range.deleteContents()
    range.insertNode(anchor)
  }

  setCaretAtEnd(anchor)
  linkMenuOpen.value = false
  emitEditorValue()
}

const removeLink = () => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  const link = findActiveLink()
  if (!link || !editor.contains(link)) return
  const text = document.createTextNode(link.textContent || '')
  link.replaceWith(text)
  setCaretInTypingNode(text)
  linkMenuOpen.value = false
  emitEditorValue()
}

const appendPlainParagraph = (container: HTMLElement, text: string) => {
  const paragraph = document.createElement('p')
  paragraph.textContent = text.trim()
  if (!paragraph.textContent) paragraph.innerHTML = '<br>'
  container.appendChild(paragraph)
  return paragraph
}

const clearFormatting = () => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return

  editor.focus()
  restoreSelection()
  const cleaned = document.createElement('div')
  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() || ''
      if (text) appendPlainParagraph(cleaned, text)
      continue
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node as HTMLElement
    const tagName = element.tagName.toLowerCase()
    if (tagName === 'ol' || tagName === 'ul') {
      for (const item of Array.from(element.querySelectorAll(':scope > li'))) {
        appendPlainParagraph(cleaned, item.textContent || '')
      }
      continue
    }

    if (tagName === 'figure' || tagName === 'img') {
      cleaned.appendChild(element.cloneNode(true))
      continue
    }

    appendPlainParagraph(cleaned, element.textContent || '')
  }

  editor.innerHTML = cleaned.innerHTML || '<p><br></p>'
  const firstParagraph = editor.querySelector('p') as HTMLElement | null
  if (firstParagraph) setCaretAtEnd(firstParagraph)
  emitEditorValue()
}

const insertHtml = (html: string) => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  document.execCommand('insertHTML', false, html)
  saveSelection()
  emitEditorValue()
}

const syncSelectedImageControls = (image: HTMLImageElement) => {
  const widthMatch = image.style.width.match(/^(\d+)%$/)
  selectedImageWidth.value = widthMatch?.[1] || '100'
  selectedImageAlt.value = image.getAttribute('alt') || ''
  if (image.style.marginLeft === 'auto' && (image.style.marginRight === '0px' || image.style.marginRight === '0')) {
    selectedImageAlign.value = 'right'
  } else if ((image.style.marginLeft === '0px' || image.style.marginLeft === '0') && image.style.marginRight === 'auto') {
    selectedImageAlign.value = 'left'
  } else {
    selectedImageAlign.value = 'center'
  }
}

const selectEditorImage = (image: HTMLImageElement | null) => {
  const editor = editorRef.value
  if (selectedImage.value && selectedImage.value !== image) {
    selectedImage.value.classList.remove('user-rich-editor__selected-image')
  }
  if (!image || !editor?.contains(image)) {
    selectedImage.value = null
    return
  }
  selectedImage.value = image
  image.classList.add('user-rich-editor__selected-image')
  syncSelectedImageControls(image)
}

const getSelectedImage = () => {
  const editor = editorRef.value
  const image = selectedImage.value
  if (!editor || !image || !editor.contains(image)) {
    selectEditorImage(null)
    return null
  }
  return image
}

const setSelectedImageWidth = (value: string | number) => {
  const image = getSelectedImage()
  if (!image) return
  const width = Number(value)
  if (!Number.isInteger(width) || width < 20 || width > 100) return
  image.style.width = `${width}%`
  image.style.maxWidth = '100%'
  image.style.height = 'auto'
  image.style.display = 'block'
  selectedImageWidth.value = String(width)
  emitEditorValue()
}

const setSelectedImageAlign = (align: 'left' | 'center' | 'right') => {
  const image = getSelectedImage()
  if (!image) return
  image.style.display = 'block'
  if (align === 'left') {
    image.style.marginLeft = '0'
    image.style.marginRight = 'auto'
  } else if (align === 'right') {
    image.style.marginLeft = 'auto'
    image.style.marginRight = '0'
  } else {
    image.style.marginLeft = 'auto'
    image.style.marginRight = 'auto'
  }
  selectedImageAlign.value = align
  emitEditorValue()
}

const applySelectedImageAlt = () => {
  const image = getSelectedImage()
  if (!image) return
  const alt = selectedImageAlt.value.trim()
  image.setAttribute('alt', alt)
  if (alt) image.setAttribute('title', alt)
  else image.removeAttribute('title')
  emitEditorValue()
}

const removeSelectedImage = () => {
  const image = getSelectedImage()
  if (!image) return
  const wrapper = image.closest('figure')
  if (wrapper && editorRef.value?.contains(wrapper)) {
    wrapper.remove()
  } else {
    image.remove()
  }
  selectedImage.value = null
  emitEditorValue()
}

const openEditorLink = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  const reference = target?.closest('.tp-content-ref') as HTMLElement | null
  if (reference && editorRef.value?.contains(reference)) {
    event.preventDefault()
    selectEditorImage(null)
    saveSelection()
    return
  }
  const image = target?.closest('img') as HTMLImageElement | null
  const editor = editorRef.value
  if (image && editor?.contains(image)) {
    event.preventDefault()
    selectEditorImage(image)
    return
  }
  if (!target?.closest('img')) selectEditorImage(null)
  const link = target?.closest('a') as HTMLAnchorElement | null
  if (!link || !editor?.contains(link)) return
  const href = link.getAttribute('href') || ''
  if (!isSafeUserArticleLinkHref(href)) return
  event.preventDefault()
  window.open(normalizeUserArticleLinkHref(href), '_blank', 'noopener,noreferrer')
}

const insertList = (type: 'ol' | 'ul') => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  const activeRange = ensureEditorRange()
  if (!activeRange || !isEditorRange(activeRange)) return

  const blocks = collectSelectedBlocks()
  const activeElement = (activeRange.startContainer.nodeType === Node.ELEMENT_NODE
    ? activeRange.startContainer as Element
    : activeRange.startContainer.parentElement)
  const activeList = activeElement?.closest('ol,ul') as HTMLElement | null
  if (activeList && editor.contains(activeList)) {
    if (activeList.tagName.toLowerCase() !== type) {
      const replacement = document.createElement(type)
      replacement.innerHTML = activeList.innerHTML
      activeList.replaceWith(replacement)
      const firstItem = replacement.querySelector('li') as HTMLElement | null
      if (firstItem) setCaretAtEnd(firstItem)
      emitEditorValue()
      return
    }

    const paragraphs: HTMLElement[] = []
    for (const item of Array.from(activeList.querySelectorAll(':scope > li'))) {
      const paragraph = document.createElement('p')
      paragraph.innerHTML = item.innerHTML || '<br>'
      paragraphs.push(paragraph)
    }
    activeList.replaceWith(...paragraphs)
    if (paragraphs[0]) setCaretAtEnd(paragraphs[0])
    emitEditorValue()
    return
  }

  const list = document.createElement(type)
  const sourceBlocks = blocks.length ? blocks : []
  if (!sourceBlocks.length) {
    const listHtml = type === 'ol'
      ? setUserArticleOrderedList(editor.innerHTML)
      : setUserArticleUnorderedList(editor.innerHTML)
    list.innerHTML = listHtml.replace(/^<(ol|ul)>|<\/(ol|ul)>$/g, '')
    editor.innerHTML = ''
    editor.appendChild(list)
  } else {
    const currentBlocks = sourceBlocks
      .map(block => block.closest(BLOCK_SELECTOR) as HTMLElement | null)
      .filter((block): block is HTMLElement => Boolean(block && editor.contains(block)))

    for (const current of currentBlocks) {
      const item = document.createElement('li')
      item.innerHTML = current.innerHTML || '<br>'
      list.appendChild(item)
    }

    const anchor = currentBlocks[0] || null
    if (anchor) {
      anchor.replaceWith(list)
      for (const current of currentBlocks.slice(1)) current.remove()
    } else {
      editor.appendChild(list)
    }
  }

  const firstItem = list.querySelector('li') as HTMLElement | null
  if (firstItem) setCaretAtEnd(firstItem)
  emitEditorValue()
}

const insertOrderedList = () => {
  insertList('ol')
}

const insertUnorderedList = () => {
  insertList('ul')
}

const validateImage = (file: File) => {
  if (!file.type.startsWith('image/')) {
    emit('error', '请选择图片文件。')
    return false
  }
  if (file.size > 5 * 1024 * 1024) {
    emit('error', '文章图片不能超过 5MB。')
    return false
  }
  return true
}

const readUserArticleImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('图片读取失败。'))
  reader.readAsDataURL(file)
})

const insertImageFile = async (file: File) => {
  if (!validateImage(file)) return
  uploading.value = true
  try {
    const dataUrl = await readUserArticleImageAsDataUrl(file)
    const src = encodeAttributeValue(dataUrl)
    insertHtml(`<figure><img src="${src}" alt="" loading="lazy" decoding="async"></figure><p><br></p>`)
    await nextTick()
    const images = Array.from(editorRef.value?.querySelectorAll<HTMLImageElement>('img') || [])
    selectEditorImage(images.at(-1) || null)
  } catch (exception: unknown) {
    emit('error', exception instanceof Error ? exception.message : '图片插入失败。')
  } finally {
    uploading.value = false
  }
}

const openImagePicker = () => {
  if (props.disabled || uploading.value) return
  saveSelection()
  imageInputRef.value?.click()
}

const handleImageSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  for (const file of files) {
    await insertImageFile(file)
  }
  input.value = ''
}

const handlePaste = async (event: ClipboardEvent) => {
  if (props.disabled) return
  const files = Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))
  if (files.length) {
    event.preventDefault()
    saveSelection()
    for (const file of files) {
      await insertImageFile(file)
    }
    return
  }

  const html = event.clipboardData?.getData('text/html') || ''
  const uri = event.clipboardData?.getData('text/uri-list')?.split('\n').find(line => line.trim() && !line.trim().startsWith('#'))?.trim() || ''
  const plainText = event.clipboardData?.getData('text/plain')?.trim() || ''
  const sanitizedHtml = html
    ? sanitizeUserArticlePastedHtml(html)
    : buildUserArticleLinkHtml({
        href: uri || plainText,
        title: plainText && plainText !== uri ? plainText : uri || plainText,
      })
  if (!sanitizedHtml) return
  event.preventDefault()
  saveSelection()
  insertHtml(sanitizedHtml)
}

const setCaretFromPoint = (clientX: number, clientY: number) => {
  const editor = editorRef.value
  if (!editor) return
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
  }
  let range = documentWithCaret.caretRangeFromPoint?.(clientX, clientY) || null
  if (!range && documentWithCaret.caretPositionFromPoint) {
    const position = documentWithCaret.caretPositionFromPoint(clientX, clientY)
    if (position?.offsetNode) {
      range = document.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  }
  if (!range || !editor.contains(range.commonAncestorContainer)) return
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
  savedRange.value = range.cloneRange()
}

const handleEditorDragStart = (event: DragEvent) => {
  if (props.disabled) return
  const editor = editorRef.value
  const target = event.target as HTMLElement | null
  const reference = target?.closest('.tp-content-ref') as HTMLElement | null
  if (!editor || !reference || !editor.contains(reference)) return
  draggedReferenceElement = reference
  reference.classList.add('is-dragging')
  event.dataTransfer?.setData(REFERENCE_DRAG_MIME, reference.outerHTML)
  event.dataTransfer?.setData('text/plain', reference.getAttribute('data-tp-ref-label') || '')
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const handleEditorDragEnd = () => {
  draggedReferenceElement?.classList.remove('is-dragging')
  draggedReferenceElement = null
}

const prepareEditorReferenceNode = (node: Element) => {
  node.setAttribute('contenteditable', 'false')
  node.setAttribute('draggable', 'true')
  return node
}

const handleReferenceDrop = (event: DragEvent) => {
  const editor = editorRef.value
  if (!editor || !draggedReferenceElement || !editor.contains(draggedReferenceElement)) return false
  event.preventDefault()
  const movingReference = draggedReferenceElement
  setCaretFromPoint(event.clientX, event.clientY)
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return true
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return true
  if (movingReference.contains(range.commonAncestorContainer)) return true
  movingReference.remove()
  const trailingSpace = document.createTextNode('\u00a0')
  range.insertNode(prepareEditorReferenceNode(movingReference))
  movingReference.after(trailingSpace)
  setCaretAfterNode(trailingSpace)
  emitEditorValue()
  handleEditorDragEnd()
  return true
}

const handleDrop = async (event: DragEvent) => {
  if (props.disabled) return
  if (handleReferenceDrop(event)) return
  const files = Array.from(event.dataTransfer?.files || []).filter(file => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  setCaretFromPoint(event.clientX, event.clientY)
  for (const file of files) {
    await insertImageFile(file)
  }
}

onMounted(() => {
  void syncEditorFromModel()
  void loadEditorRecipeTreeEmbeds()
})

onBeforeUnmount(() => {
  clearReferenceSearchTimer()
  referenceSearchSequence += 1
  editorRecipeTreeLoadSequence += 1
})
</script>

<template>
  <section class="user-rich-editor" :class="{ 'user-rich-editor--disabled': disabled }">
    <div class="user-rich-editor__toolbar" role="toolbar" aria-label="文章正文工具栏" @mousedown="handleToolbarMouseDown">
      <button type="button" title="撤销" :disabled="disabled || !canUndoHistory" @click="undoEditorHistory">↶</button>
      <button type="button" title="重做" :disabled="disabled || !canRedoHistory" @click="redoEditorHistory">↷</button>
      <span class="user-rich-editor__separator" aria-hidden="true"></span>
      <button type="button" title="正文" :disabled="disabled" @click="formatBlock('p')">正文</button>
      <button type="button" title="二级标题" :disabled="disabled" @click="formatBlock('h2')">H2</button>
      <button type="button" title="三级标题" :disabled="disabled" @click="formatBlock('h3')">H3</button>
      <button type="button" title="引用" :disabled="disabled" @click="formatBlock('blockquote')">引用</button>
      <select v-model.number="fontSizePx" class="user-rich-editor__select" title="字体大小" :disabled="disabled" @change="applyFontSize">
        <option v-for="size in fontSizeOptions" :key="size" :value="size">{{ size }}px</option>
      </select>
      <select v-model="lineHeightValue" class="user-rich-editor__select" title="行距" :disabled="disabled" @change="applyLineHeight">
        <option v-for="option in lineHeightOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <select v-model="textIndentValue" class="user-rich-editor__select" title="首行缩进" :disabled="disabled" @change="applyTextIndent">
        <option v-for="option in textIndentOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <div class="user-rich-editor__color-menu">
        <button
          type="button"
          class="user-rich-editor__color-trigger"
          title="文字颜色"
          aria-label="文字颜色"
          :aria-expanded="colorMenuOpen"
          :disabled="disabled"
          @click="toggleColorMenu"
        >
          <span class="user-rich-editor__color-current" :style="{ '--swatch-color': textColorValue }"></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>
        </button>
        <div v-if="colorMenuOpen" class="user-rich-editor__color-popover" role="group" aria-label="文字颜色选择">
          <button
            v-for="preset in textColorPresets"
            :key="preset.value"
            type="button"
            class="user-rich-editor__swatch"
            :class="{ 'user-rich-editor__swatch--active': textColorValue === preset.value }"
            :title="`文字颜色：${preset.label}`"
            :aria-label="`文字颜色：${preset.label}`"
            :disabled="disabled"
            :style="{ '--swatch-color': preset.value }"
            @click="applyPresetTextColor(preset.value)"
          />
          <label class="user-rich-editor__color" title="自定义文字颜色" aria-label="自定义文字颜色">
            <input v-model="textColorValue" type="color" :disabled="disabled" @input="applyTextColor">
          </label>
        </div>
      </div>
      <span class="user-rich-editor__separator" aria-hidden="true"></span>
      <button type="button" title="加粗" :disabled="disabled" @click="exec('bold')">B</button>
      <button type="button" title="斜体" :disabled="disabled" @click="exec('italic')"><i>I</i></button>
      <button type="button" title="下划线" :disabled="disabled" @click="exec('underline')"><u>U</u></button>
      <button type="button" title="左对齐" aria-label="左对齐" :disabled="disabled" @click="exec('justifyLeft')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h15M4 10h10M4 14h15M4 18h10" /></svg>
      </button>
      <button type="button" title="居中对齐" aria-label="居中对齐" :disabled="disabled" @click="exec('justifyCenter')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M8 10h8M5 14h14M8 18h8" /></svg>
      </button>
      <button type="button" title="右对齐" aria-label="右对齐" :disabled="disabled" @click="exec('justifyRight')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h15M10 10h10M5 14h15M10 18h10" /></svg>
      </button>
      <button type="button" title="两端对齐" aria-label="两端对齐" :disabled="disabled" @click="exec('justifyFull')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
      </button>
      <button type="button" title="无序列表" :disabled="disabled" @click="insertUnorderedList">•</button>
      <button type="button" title="有序列表" :disabled="disabled" @click="insertOrderedList">1.</button>
      <button type="button" title="插入分割线" :disabled="disabled" @click="exec('insertHorizontalRule')">—</button>
      <button type="button" title="清除格式" :disabled="disabled" @click="clearFormatting">清</button>
      <div class="user-rich-editor__link-menu">
        <button
          type="button"
          class="user-rich-editor__link-trigger"
          title="插入链接"
          aria-label="插入链接"
          :aria-expanded="linkMenuOpen"
          :disabled="disabled"
          @click="openLinkMenu"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
            <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
          </svg>
        </button>
        <div v-if="linkMenuOpen" class="user-rich-editor__link-popover" role="group" aria-label="链接设置">
          <label>
            <span>链接地址</span>
            <input v-model="linkUrlValue" type="url" inputmode="url" placeholder="https://example.com" :disabled="disabled">
          </label>
          <label>
            <span>显示标题</span>
            <input v-model="linkTitleValue" type="text" placeholder="可选，不填显示链接地址" :disabled="disabled" @keydown.enter.prevent="applyLink">
          </label>
          <div class="user-rich-editor__link-actions">
            <button type="button" :disabled="disabled" @click="applyLink">应用</button>
            <button type="button" :disabled="disabled" @click="removeLink">取消链接</button>
            <button type="button" :disabled="disabled" @click="closeLinkMenu">关闭</button>
          </div>
        </div>
      </div>
      <button type="button" title="插入图片" :disabled="disabled || uploading" @click="openImagePicker">{{ uploading ? '上传中' : '图片' }}</button>
      <input ref="imageInputRef" class="user-rich-editor__file" type="file" accept="image/*" multiple @change="handleImageSelected">
      <button
        type="button"
        class="user-rich-editor__reference-fab"
        title="插入资料引用"
        aria-label="插入资料引用"
        :aria-expanded="referenceMenuOpen"
        :disabled="disabled"
        @mousedown.prevent="saveSelection"
        @click="openReferenceMenu"
      >
        <img
          v-if="!pickaxeImageFailed"
          :src="IRON_PICKAXE_REFERENCE_IMAGE"
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
          @error="pickaxeImageFailed = true"
        >
        <span v-else class="user-rich-editor__reference-icon-fallback" aria-hidden="true">镐</span>
        <span class="user-rich-editor__reference-fab-label">资料引用</span>
      </button>
    </div>

    <div class="user-rich-editor__stage">
      <div
        ref="editorRef"
        class="user-rich-editor__surface"
        :contenteditable="!disabled"
        role="textbox"
        aria-label="文章正文"
        @input="emitEditorValue"
        @paste="handlePaste"
        @click="openEditorLink"
        @keydown="handleEditorKeydown"
        @dragstart="handleEditorDragStart"
        @dragend="handleEditorDragEnd"
        @dragover.prevent
        @drop="handleDrop"
        @keyup="saveSelection"
        @mouseup="saveSelection"
        @blur="saveSelection"
      />
    </div>

    <div v-if="selectedImage" class="user-rich-editor__image-tools" role="group" aria-label="图片设置">
      <div class="user-rich-editor__image-tool-group">
        <span>宽度</span>
        <input
          v-model="selectedImageWidth"
          class="user-rich-editor__image-width"
          type="range"
          min="20"
          max="100"
          step="5"
          :disabled="disabled"
          aria-label="图片宽度"
          @input="setSelectedImageWidth(selectedImageWidth)"
        >
        <output class="user-rich-editor__image-width-value">{{ selectedImageWidth }}%</output>
      </div>
      <div class="user-rich-editor__image-tool-group">
        <span>对齐</span>
        <button
          type="button"
          title="图片左对齐"
          aria-label="图片左对齐"
          :class="{ active: selectedImageAlign === 'left' }"
          :disabled="disabled"
          @click="setSelectedImageAlign('left')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 9h10M4 13h16M4 17h10" /></svg>
        </button>
        <button
          type="button"
          title="图片居中"
          aria-label="图片居中"
          :class="{ active: selectedImageAlign === 'center' }"
          :disabled="disabled"
          @click="setSelectedImageAlign('center')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 9h10M4 13h16M7 17h10" /></svg>
        </button>
        <button
          type="button"
          title="图片右对齐"
          aria-label="图片右对齐"
          :class="{ active: selectedImageAlign === 'right' }"
          :disabled="disabled"
          @click="setSelectedImageAlign('right')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M10 9h10M4 13h16M10 17h10" /></svg>
        </button>
      </div>
      <label class="user-rich-editor__image-alt">
        <span>替代文本</span>
        <input v-model="selectedImageAlt" type="text" :disabled="disabled" placeholder="图片说明" @keydown.enter.prevent="applySelectedImageAlt" @input="applySelectedImageAlt">
      </label>
      <button type="button" class="user-rich-editor__image-remove" :disabled="disabled" @click="removeSelectedImage">删除图片</button>
    </div>

    <div class="user-rich-editor__meta">
      <span>{{ hasText ? '正文已填写' : '正文必填' }}</span>
      <span>图片 {{ imageCount }}</span>
    </div>
  </section>

  <Teleport v-if="referencePanelTarget" :to="referencePanelTarget" defer>
    <div v-if="referenceMenuOpen" class="user-rich-editor__reference-menu" aria-label="资料引用外部面板">
      <div class="user-rich-editor__reference-popover" role="dialog" aria-label="资料引用">
        <div class="user-rich-editor__reference-tabs" role="tablist">
          <button type="button" :class="{ active: referenceSearchType === 'all' }" @click="referenceSearchType = 'all'">全部</button>
          <button type="button" :class="{ active: referenceSearchType === 'item' }" @click="referenceSearchType = 'item'">物品</button>
          <button type="button" :class="{ active: referenceSearchType === 'npc' }" @click="referenceSearchType = 'npc'">NPC</button>
          <button type="button" :class="{ active: referenceSearchType === 'boss' }" @click="referenceSearchType = 'boss'">Boss</button>
        </div>
        <div class="user-rich-editor__reference-display" role="group" aria-label="引用显示方式">
          <span>显示</span>
          <button type="button" :class="{ active: referenceDisplayMode === 'image' }" @click="referenceDisplayMode = 'image'">图片</button>
          <button type="button" :class="{ active: referenceDisplayMode === 'text' }" @click="referenceDisplayMode = 'text'">文字</button>
        </div>
        <input
          v-model="referenceSearchText"
          type="search"
          placeholder="搜索物品、NPC 或 Boss"
          :disabled="disabled"
          @keydown.enter.prevent="runReferenceSearch"
        >
        <div class="user-rich-editor__reference-results">
          <div
            v-for="reference in referenceSearchResults"
            :key="reference.key"
            class="user-rich-editor__reference-result"
          >
            <span class="user-rich-editor__reference-thumb">
              <img v-if="reference.imageUrl" :src="reference.imageUrl" :alt="reference.label" loading="lazy" decoding="async">
              <span v-else>{{ reference.label.slice(0, 1) }}</span>
            </span>
            <span class="user-rich-editor__reference-copy">
              <strong>{{ reference.label }}</strong>
              <small>{{ reference.summary || reference.categoryName || reference.type }}</small>
            </span>
            <span class="user-rich-editor__reference-actions">
              <button type="button" :disabled="disabled" @mousedown.prevent @click="insertContentReference(reference)">引用</button>
              <button
                v-if="reference.type === 'item'"
                type="button"
                class="user-rich-editor__reference-embed-button"
                :disabled="disabled"
                @mousedown.prevent
                @click="insertRecipeTreeEmbed(reference)"
              >
                合成树
              </button>
            </span>
          </div>
          <p v-if="referenceSearchLoading">搜索中...</p>
          <p v-else-if="referenceSearchError">{{ referenceSearchError }}</p>
          <p v-else-if="!referenceSearchResults.length">{{ referenceSearchText ? '没有找到可引用数据。' : '暂无可引用数据。' }}</p>
        </div>
        <button type="button" :disabled="disabled" @click="closeReferenceMenu">关闭</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.user-rich-editor {
  display: grid;
  gap: 0;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 22%, var(--index-line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--index-surface) 92%, var(--panel));
}

.user-rich-editor__toolbar {
  position: sticky;
  top: var(--user-article-toolbar-top, 72px);
  z-index: 8;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--index-line) 78%, transparent);
  border-radius: 14px 14px 0 0;
  background: color-mix(in srgb, var(--index-surface) 96%, var(--panel));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--index-bg) 24%, transparent);
}

.user-rich-editor__toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 62%, transparent);
  color: var(--index-text);
  cursor: pointer;
  font: inherit;
  font-size: .84rem;
}

.user-rich-editor__toolbar button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.user-rich-editor__toolbar button:hover:not(:disabled),
.user-rich-editor__toolbar button:focus-visible {
  border-color: color-mix(in srgb, var(--accent-gold) 52%, var(--index-line));
  color: var(--accent-gold);
}

.user-rich-editor__toolbar button:disabled {
  cursor: not-allowed;
  opacity: .48;
}

.user-rich-editor__color-menu,
.user-rich-editor__link-menu {
  position: relative;
  display: inline-flex;
}

.user-rich-editor__color-trigger,
.user-rich-editor__link-trigger {
  gap: 5px;
  min-width: 48px;
}

.user-rich-editor__color-current,
.user-rich-editor__swatch {
  display: inline-block;
  border: 1px solid color-mix(in srgb, #fff 22%, var(--index-line));
  background-color: var(--swatch-color);
  background-image: linear-gradient(135deg, rgba(255,255,255,.25), transparent 46%);
}

.user-rich-editor__color-current {
  width: 18px;
  height: 18px;
  border-radius: 5px;
}

.user-rich-editor__color-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  display: grid;
  grid-template-columns: repeat(4, 28px);
  gap: 7px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 96%, var(--panel));
  box-shadow: 0 12px 28px rgba(0,0,0,.28);
}

.user-rich-editor__color-popover .user-rich-editor__swatch {
  width: 26px;
  min-width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border-radius: 999px;
  background-color: var(--swatch-color);
  background-image: linear-gradient(135deg, rgba(255,255,255,.25), transparent 46%);
}

.user-rich-editor__swatch--active {
  border-color: var(--accent-gold);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-gold) 28%, transparent);
}

.user-rich-editor__color {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 62%, transparent);
  cursor: pointer;
}

.user-rich-editor__color input {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: inherit;
}

.user-rich-editor__color:has(input:disabled) {
  cursor: not-allowed;
  opacity: .48;
}

.user-rich-editor__link-popover {
  position: absolute;
  z-index: 32;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  width: min(320px, calc(100vw - 32px));
  gap: 9px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 96%, var(--panel));
  box-shadow: 0 12px 28px rgba(0,0,0,.28);
}

.user-rich-editor__link-popover label {
  display: grid;
  gap: 5px;
  color: var(--index-muted);
  font-size: .78rem;
}

.user-rich-editor__link-popover input {
  min-width: 0;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 70%, transparent);
  color: var(--index-text);
  font: inherit;
  font-size: .86rem;
}

.user-rich-editor__link-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.user-rich-editor__link-actions button {
  min-width: auto;
  min-height: 32px;
  padding: 0 10px;
}

.user-rich-editor__reference-popover {
  position: static;
  z-index: 1;
  display: grid;
  width: min(420px, 100%);
  max-height: min(var(--user-article-reference-panel-max-height, 58dvh), 460px);
  gap: 9px;
  overflow: auto;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 96%, var(--panel));
  box-shadow: 0 12px 28px rgba(0,0,0,.28);
}

.user-rich-editor__reference-tabs {
  display: flex;
  gap: 6px;
}

.user-rich-editor__reference-tabs button,
.user-rich-editor__reference-display button {
  min-width: auto;
  min-height: 30px;
  padding: 0 10px;
}

.user-rich-editor__reference-tabs button.active,
.user-rich-editor__reference-display button.active {
  border-color: color-mix(in srgb, var(--accent-gold) 62%, var(--index-line));
  color: var(--accent-gold);
}

.user-rich-editor__reference-display {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--index-muted);
  font-size: 12px;
  font-weight: 800;
}

.user-rich-editor__reference-popover input {
  min-width: 0;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 70%, transparent);
  color: var(--index-text);
  font: inherit;
  font-size: .86rem;
}

.user-rich-editor__reference-results {
  display: grid;
  max-height: max(150px, min(280px, calc(var(--user-article-reference-panel-max-height, 58dvh) - 170px)));
  gap: 6px;
  overflow: auto;
}

.user-rich-editor__reference-result {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--index-line) 55%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 64%, transparent);
  text-align: left;
}

.user-rich-editor__reference-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
  line-height: 1.25;
}

.user-rich-editor__reference-result strong,
.user-rich-editor__reference-result small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-rich-editor__reference-result small,
.user-rich-editor__reference-results p {
  margin: 0;
  color: var(--index-muted);
  font-size: .78rem;
}

.user-rich-editor__reference-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.user-rich-editor__reference-actions button {
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 45%, var(--index-line));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-gold) 16%, var(--index-bg));
  color: var(--index-text);
  font-size: .76rem;
}

.user-rich-editor__reference-thumb {
  display: inline-flex;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-gold) 14%, transparent);
  color: var(--accent-gold);
  font-size: .82rem;
  font-weight: 900;
  overflow: hidden;
}

.user-rich-editor__reference-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.user-rich-editor__select {
  min-height: 34px;
  max-width: 118px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 62%, transparent);
  color: var(--index-text);
  cursor: pointer;
  font: inherit;
  font-size: .82rem;
}

.user-rich-editor__select:disabled {
  cursor: not-allowed;
  opacity: .48;
}

.user-rich-editor__separator {
  width: 1px;
  height: 24px;
  background: color-mix(in srgb, var(--index-line) 76%, transparent);
}

.user-rich-editor__file {
  display: none;
}

.user-rich-editor__stage {
  position: relative;
  isolation: isolate;
}

.user-rich-editor__surface {
  min-height: 380px;
  padding: 22px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 42%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--index-line) 42%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--index-line) 42%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--index-line) 42%, transparent);
  border-radius: 0 0 14px 14px;
  color: var(--index-text);
  background: color-mix(in srgb, var(--index-surface) 88%, transparent);
  outline: none;
  line-height: 1.78;
  word-break: break-word;
}

.user-rich-editor__reference-menu {
  position: relative;
  z-index: 20;
  display: grid;
  justify-items: stretch;
  width: 100%;
}

.user-rich-editor__reference-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 132px;
  min-height: 44px;
  gap: 8px;
  padding: 7px;
  border: 2px solid color-mix(in srgb, var(--accent-gold) 82%, #fff);
  border-radius: 8px;
  background:
    radial-gradient(circle at 30% 20%, rgba(255,255,255,.4), transparent 38%),
    linear-gradient(180deg, #ffe08a, #c89424);
  color: #201706;
  cursor: pointer;
  box-shadow: 0 0 0 2px rgba(255, 215, 101, .22), 0 14px 30px rgba(0,0,0,.34);
}

.user-rich-editor__reference-fab img {
  display: block;
  width: 28px;
  height: 28px;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
}

.user-rich-editor__reference-icon-fallback {
  font-size: 1.18rem;
  font-weight: 1000;
  line-height: 1;
}

.user-rich-editor__reference-fab-label {
  color: currentColor;
  font-size: .88rem;
  font-weight: 1000;
  line-height: 1;
  white-space: nowrap;
}

.user-rich-editor__reference-fab:hover:not(:disabled),
.user-rich-editor__reference-fab:focus-visible {
  background:
    radial-gradient(circle at 30% 20%, rgba(255,255,255,.48), transparent 38%),
    linear-gradient(180deg, #fff0b8, #dba434);
  color: #140e03;
  transform: translateY(-1px);
}

.user-rich-editor__reference-fab:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.user-rich-editor__surface:empty::before {
  content: "从这里开始写正文，可直接粘贴或拖拽图片。";
  color: var(--index-muted);
}

.user-rich-editor__surface :deep(p) {
  margin: 0 0 1em;
}

.user-rich-editor__surface :deep(.tp-content-ref) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875em;
  height: 1.875em;
  padding: 2px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-gold) 13%, transparent);
  color: var(--accent-gold);
  line-height: 1;
  vertical-align: -0.38em;
  cursor: grab;
  user-select: none;
  white-space: nowrap;
  break-inside: avoid;
}

.user-rich-editor__surface :deep(.tp-content-ref:active) {
  cursor: grabbing;
}

.user-rich-editor__surface :deep(.tp-content-ref.is-dragging) {
  opacity: .52;
  outline: 2px solid color-mix(in srgb, var(--accent-gold) 62%, transparent);
  outline-offset: 2px;
}

.user-rich-editor__surface :deep(.tp-content-ref[data-tp-ref-display="text"]) {
  justify-content: flex-start;
  width: auto;
  height: auto;
  max-width: min(100%, 22em);
  padding: 0 .42em;
  font-weight: 650;
  line-height: 1.45;
  vertical-align: .04em;
  white-space: nowrap;
}

.user-rich-editor__surface :deep(.tp-content-ref img) {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  object-fit: contain;
  border-radius: 3px;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.user-rich-editor__surface :deep(.tp-content-ref-fallback) {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--accent-gold);
  font-size: 13px;
  font-weight: 900;
}

.user-rich-editor__surface :deep(.tp-recipe-tree) {
  display: grid;
  min-height: 112px;
  margin: 24px 0;
  padding: 14px;
  gap: 12px;
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
  border-radius: 8px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--text-strong) 4%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--text-strong) 3%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--index-bg) 92%, var(--panel));
  background-size: 32px 32px, 32px 32px, auto;
  color: var(--text-strong);
  cursor: default;
  user-select: none;
}

.user-rich-editor__surface :deep(.tp-recipe-tree[data-tp-resolved="loading"]) {
  border-style: dashed;
}

.user-rich-editor__surface :deep(.tp-recipe-tree[data-tp-resolved="missing"]),
.user-rich-editor__surface :deep(.tp-recipe-tree[data-tp-resolved="error"]) {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--index-line));
}

.user-rich-editor__surface :deep(.article-recipe-tree__header) {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 260px;
}

.user-rich-editor__surface :deep(.article-recipe-tree__thumb) {
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

.user-rich-editor__surface :deep(.article-recipe-tree__thumb img) {
  width: 100%; height: 100%; margin: 0; border: 0; border-radius: 0; object-fit: contain;
}

.user-rich-editor__surface :deep(.article-recipe-tree__copy) { display: grid; min-width: 0; gap: 4px; }
.user-rich-editor__surface :deep(.article-recipe-tree__copy strong) { color: var(--text-strong); font-size: 16px; line-height: 1.25; overflow-wrap: anywhere; }
.user-rich-editor__surface :deep(.article-recipe-tree__copy small) {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.user-rich-editor__surface :deep(.article-recipe-tree__stats) { display: flex; flex-wrap: wrap; gap: 8px; min-width: 260px; }
.user-rich-editor__surface :deep(.article-recipe-tree__stats span) { padding: 4px 8px; border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--panel) 42%, transparent); color: var(--text-muted); font-size: 12px; font-weight: 850; white-space: nowrap; }

.user-rich-editor__surface :deep(.editor-recipe-tree__graph) {
  --editor-recipe-graph-node-size: 52px;
  --editor-recipe-graph-line: color-mix(in srgb, var(--accent-gold) 58%, var(--index-line));
  --recipe-overview-pan-x: 0px;
  --recipe-overview-pan-y: 0px;
  position: relative;
  flex: 0 0 auto;
  min-width: max-content;
  margin: 2px auto 0;
  cursor: grab;
  touch-action: none;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph.is-panning) {
  cursor: grabbing;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-lines) {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-edge) {
  fill: none;
  stroke: var(--editor-recipe-graph-line);
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-node-position) {
  position: absolute;
  display: grid;
  place-items: center;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-node) {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: var(--editor-recipe-graph-node-size);
  height: var(--editor-recipe-graph-node-size);
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 86%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--text-strong) 8%, transparent),
    0 8px 18px color-mix(in srgb, var(--index-bg) 50%, transparent);
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-node img) {
  display: block;
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-fallback) {
  color: var(--accent-gold);
  font-size: 17px;
  font-weight: 950;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-quantity) {
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

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-stations) {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  gap: 2px;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-station) {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
}

.user-rich-editor__surface :deep(.editor-recipe-tree__graph-station img) {
  display: block;
  width: 15px;
  height: 15px;
  object-fit: contain;
}

.user-rich-editor__surface :deep(ul),
.user-rich-editor__surface :deep(ol) {
  margin: 0 0 1em;
  padding-left: 1.6em;
}

.user-rich-editor__surface :deep(ul) {
  list-style: disc;
}

.user-rich-editor__surface :deep(ol) {
  list-style: decimal;
}

.user-rich-editor__surface :deep(li) {
  display: list-item;
  margin: .28em 0;
  padding-left: .18em;
}

.user-rich-editor__surface :deep(h2),
.user-rich-editor__surface :deep(h3) {
  margin: 1.3em 0 .65em;
  color: var(--accent-gold);
  line-height: 1.28;
}

.user-rich-editor__surface :deep(blockquote) {
  margin: 1em 0;
  padding: 10px 14px;
  border-left: 3px solid var(--accent-gold);
  background: color-mix(in srgb, var(--accent-gold) 10%, transparent);
}

.user-rich-editor__surface :deep(figure) {
  margin: 16px 0;
}

.user-rich-editor__surface :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid color-mix(in srgb, var(--index-line) 76%, transparent);
  border-radius: 12px;
}

.user-rich-editor__surface :deep(img.user-rich-editor__selected-image) {
  border-color: color-mix(in srgb, var(--accent-gold) 78%, #ffffff);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent-gold) 26%, transparent),
    0 12px 30px rgba(0, 0, 0, .22);
}

.user-rich-editor__surface :deep(figcaption) {
  margin-top: 6px;
  color: var(--index-muted);
  font-size: .82rem;
  text-align: center;
}

.user-rich-editor__surface :deep(a) {
  color: #7dd3fc;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.user-rich-editor__image-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
  background: color-mix(in srgb, var(--index-surface) 94%, var(--panel));
}

.user-rich-editor__image-tool-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.user-rich-editor__image-tool-group > span,
.user-rich-editor__image-alt span {
  color: var(--index-muted);
  font-size: .78rem;
  font-weight: 800;
  white-space: nowrap;
}

.user-rich-editor__image-width {
  width: 118px;
  accent-color: var(--accent-gold);
}

.user-rich-editor__image-width-value {
  min-width: 42px;
  color: var(--index-text);
  font-size: .82rem;
  font-weight: 900;
  text-align: right;
}

.user-rich-editor__image-tools button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 36px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 62%, transparent);
  color: var(--index-text);
  cursor: pointer;
  font: inherit;
  font-size: .82rem;
  font-weight: 800;
}

.user-rich-editor__image-tools button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.user-rich-editor__image-tools button:hover:not(:disabled),
.user-rich-editor__image-tools button:focus-visible,
.user-rich-editor__image-tools button.active {
  border-color: color-mix(in srgb, var(--accent-gold) 58%, var(--index-line));
  background: color-mix(in srgb, var(--accent-gold) 14%, var(--index-bg));
  color: var(--accent-gold);
}

.user-rich-editor__image-tools button:disabled {
  cursor: not-allowed;
  opacity: .48;
}

.user-rich-editor__image-alt {
  display: inline-flex;
  flex: 1 1 220px;
  gap: 8px;
  align-items: center;
  min-width: min(100%, 220px);
}

.user-rich-editor__image-alt input {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--index-line) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-bg) 70%, transparent);
  color: var(--index-text);
  font: inherit;
  font-size: .86rem;
}

.user-rich-editor__image-remove {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--index-line)) !important;
  color: color-mix(in srgb, var(--danger) 88%, #ffffff) !important;
}

.user-rich-editor__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-top: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
  color: var(--index-muted);
  font-size: .82rem;
}

.user-rich-editor--disabled .user-rich-editor__surface {
  opacity: .72;
}

@media (max-width: 720px) {
  .user-rich-editor__surface {
    min-height: 320px;
    padding: 16px;
  }

  .user-rich-editor__reference-fab {
    min-width: 100%;
    min-height: 44px;
  }

  .user-rich-editor__reference-popover {
    width: 100%;
    max-height: min(var(--user-article-reference-panel-max-height, 70dvh), 480px);
  }

  .user-rich-editor__reference-results {
    max-height: max(150px, min(260px, calc(var(--user-article-reference-panel-max-height, 70dvh) - 170px)));
  }

  .user-rich-editor__image-tools {
    align-items: stretch;
  }

  .user-rich-editor__image-tool-group,
  .user-rich-editor__image-alt {
    width: 100%;
  }

  .user-rich-editor__image-alt {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
