import type { PublicItemRecipeTreeNode } from '~/types/public-api'

type Station = { stationType?: string | null, stationItemId?: string | number | null, stationName?: string | null, stationNameZh?: string | null, name?: string | null, displayName?: string | null, stationInternalName?: string | null, stationImage?: string | null, itemImage?: string | null, itemImageUrl?: string | null, image?: string | null }
type LayoutNode = { id: string, node: PublicItemRecipeTreeNode, depth: number, isRoot: boolean, x: number, y: number, width: number, height: number, anchorX: number, subtreeWidth: number, children: LayoutNode[] }
type Layout = { nodes: LayoutNode[], edges: Array<{ id: string, fromX: number, fromY: number, toX: number, toY: number }>, width: number, height: number }

export type RecipeHierarchyGraphRendererOptions = {
  roots: PublicItemRecipeTreeNode[]
  maxDepth: number
  availableWidth: number
  resolveImageUrl: (imageUrl: string) => string
  popoverOwner: 'article' | 'editor'
}

const CARD_WIDTH = 132
const OPTION_SOURCE_WIDTH = 160
const CARD_HEIGHT = 100
const OPTION_ROW_HEIGHT = 30
const OPTION_ROW_GAP = 3
const OPTION_COPY_ALLOWANCE = 43
const ALTERNATIVE_ROW_HEIGHT = 34
const STATION_IMAGE_SIZE = 48
const STATION_RAIL_WIDTH = 52
const STATION_GAP = 2
const STATION_CARD_HEIGHT_PADDING = 10
const X_GAP = 6
const Y_GAP = 10
const PADDING = 14
const VIEWPORT_GUTTER = 4
const MIN_MANUAL_SCALE = 0.6
const MAX_MANUAL_SCALE = 1.8
const MANUAL_SCALE_STEP = 0.1

const text = (value: unknown) => String(value ?? '').trim()
const firstText = (...values: unknown[]) => values.map(text).find(Boolean) || ''
const childrenOf = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []
const nameOf = (node: PublicItemRecipeTreeNode) => firstText(node.displayName, node.itemNameZh, node.itemName, node.name, node.itemInternalName, '材料')
const quantityOf = (node: PublicItemRecipeTreeNode, isRoot = false) => {
  const quantityText = firstText(node.quantityText)
  if (quantityText) return `x${quantityText.replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) return `x${node.quantityMin}-${node.quantityMax}`
  const value = firstText(node.quantityMin, node.quantity, node.amount, node.count)
  if (value) return `x${value.replace(/^x/i, '')}`
  const resultQuantity = Number(node.resultQuantity)
  return isRoot && Number.isFinite(resultQuantity) && resultQuantity > 0 && resultQuantity <= 99 ? `x${resultQuantity}` : 'x1'
}
const keyOf = (node: PublicItemRecipeTreeNode) => firstText(node.itemId, node.id, node.itemInternalName, node.itemName, node.displayName, node.name)
const sameItem = (left: PublicItemRecipeTreeNode, right: PublicItemRecipeTreeNode) => {
  const leftId = firstText(left.itemId, left.id)
  const rightId = firstText(right.itemId, right.id)
  if (leftId && rightId) return leftId === rightId
  const leftName = firstText(left.itemInternalName, left.itemName, left.name, left.displayName)
  const rightName = firstText(right.itemInternalName, right.itemName, right.name, right.displayName)
  return Boolean(leftName && leftName === rightName)
}
const imageValueOf = (node: PublicItemRecipeTreeNode) => firstText(node.itemImage, node.itemImageUrl, node.image, node.previewImage, node.groupMembers?.[0]?.image, node.groupMembers?.[0]?.imageUrl)
const groupMembersOf = (node: PublicItemRecipeTreeNode) => Array.isArray(node.groupMembers) ? node.groupMembers : []
const groupMemberName = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => firstText(member.nameZh, member.name, member.internalName, '可替代材料')
const groupMemberImage = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => firstText(member.image, member.imageUrl)
const nodeGroupMember = (node: PublicItemRecipeTreeNode) => ({
  itemId: node.itemId,
  internalName: node.itemInternalName || node.itemName || node.name || null,
  name: node.itemName || node.name || node.displayName || null,
  nameZh: node.displayName || node.itemNameZh || node.name || null,
  image: node.itemImage || node.image || node.previewImage || null,
  imageUrl: node.itemImageUrl || null,
})
const stationsOf = (node: PublicItemRecipeTreeNode): Station[] => {
  const direct = (Array.isArray(node.stations) ? node.stations : []).filter(station => station?.stationType !== 'condition')
  if (direct.length) return direct
  const sameItemChild = childrenOf(node).find(child => sameItem(node, child) && Array.isArray(child.stations) && child.stations.length > 0)
  return (Array.isArray(sameItemChild?.stations) ? sameItemChild.stations : []).filter(station => station?.stationType !== 'condition')
}
const stationName = (station: Station | null | undefined) => firstText(station?.displayName, station?.stationNameZh, station?.stationName, station?.name, station?.stationInternalName)
const stationImage = (station: Station | null | undefined) => firstText(station?.stationImage, station?.itemImage, station?.itemImageUrl, station?.image)
const optionGroupsOf = (node: PublicItemRecipeTreeNode) => node.nodeType === 'recipe_options' && Array.isArray((node as PublicItemRecipeTreeNode & { recipeOptions?: PublicItemRecipeTreeNode[][] }).recipeOptions)
  ? (node as PublicItemRecipeTreeNode & { recipeOptions: PublicItemRecipeTreeNode[][] }).recipeOptions
  : []

const mergeAlternativeChildren = (options: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  if (options.length > 1 && options.every(option => childrenOf(option).length > 0)) {
    const first = options[0]
    if (first) return [{
      ...first,
      displayName: nameOf(first),
      children: [{
        nodeType: 'recipe_options',
        displayName: `${nameOf(first)} · ${options.length} 条配方来源`,
        secondaryName: '多配方来源',
        children: [],
        recipeOptions: options.map(option => mergeSameItemSiblings(childrenOf(option))),
      } as PublicItemRecipeTreeNode & { recipeOptions: PublicItemRecipeTreeNode[][] }],
    }]
  }
  const optionChildren = options.map(childrenOf)
  const counts = new Map<string, number>()
  for (const entries of optionChildren) for (const key of new Set(entries.map(keyOf).filter(Boolean))) counts.set(key, (counts.get(key) ?? 0) + 1)
  const sharedKeys = new Set([...counts].filter(([, count]) => count === options.length).map(([key]) => key))
  const shared = new Map<string, PublicItemRecipeTreeNode>()
  const alternatives: PublicItemRecipeTreeNode[] = []
  for (const entries of optionChildren) for (const child of entries) {
    const key = keyOf(child)
    if (key && sharedKeys.has(key)) { if (!shared.has(key)) shared.set(key, child) } else alternatives.push(child)
  }
  const alternativeNode = () => {
    const first = alternatives[0]
    return first ? { ...first, displayName: alternatives.map(nameOf).join(' 或 '), secondaryName: '可替代材料', itemInternalName: alternatives.map(node => firstText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '), groupMembers: alternatives.map(nodeGroupMember), children: [] } : null
  }
  const ordered: PublicItemRecipeTreeNode[] = []
  let addedAlternative = false
  for (const child of optionChildren[0] ?? []) {
    const key = keyOf(child)
    if (key && sharedKeys.has(key)) { const item = shared.get(key); if (item && !ordered.some(entry => keyOf(entry) === key)) ordered.push(item) }
    else if (!addedAlternative && alternatives.length) { const alternative = alternativeNode(); if (alternative) ordered.push(alternative); addedAlternative = true }
  }
  for (const [key, child] of shared) if (!ordered.some(entry => keyOf(entry) === key)) ordered.push(child)
  if (!addedAlternative && alternatives.length) { const alternative = alternativeNode(); if (alternative) ordered.unshift(alternative) }
  return ordered
}
const mergeSameItemSiblings = (nodes: PublicItemRecipeTreeNode[]) => {
  const groups = new Map<string, PublicItemRecipeTreeNode[]>()
  const order: string[] = []
  for (const node of nodes) {
    const key = `${keyOf(node)}:${firstText(node.quantityText, node.quantityMin, node.quantityMax, node.quantity, node.amount, node.count)}`
    const normalizedKey = key.trim() ? key : `unique:${order.length}`
    if (!groups.has(normalizedKey)) { groups.set(normalizedKey, []); order.push(normalizedKey) }
    groups.get(normalizedKey)?.push(node)
  }
  return order.flatMap(key => { const entries = groups.get(key) ?? []; const first = entries[0]; return entries.length <= 1 || !first ? entries : [{ ...first, children: mergeAlternativeChildren(entries) }] })
}
const graphChildren = (node: PublicItemRecipeTreeNode, depth: number, maxDepth: number): PublicItemRecipeTreeNode[] => {
  if (depth >= maxDepth) return []
  let candidates = childrenOf(node)
  while (candidates.length === 1 && candidates[0] && sameItem(node, candidates[0])) { const next = childrenOf(candidates[0]); if (!next.length) break; candidates = next }
  return (candidates.length > 1 && candidates.every(child => sameItem(node, child)) ? mergeAlternativeChildren(candidates) : mergeSameItemSiblings(candidates)).slice(0, 18)
}
const cardWidth = (node: PublicItemRecipeTreeNode) => optionGroupsOf(node).length ? OPTION_SOURCE_WIDTH : CARD_WIDTH
const cardHeight = (node: PublicItemRecipeTreeNode) => {
  const options = optionGroupsOf(node).length
  if (options) return Math.max(CARD_HEIGHT, OPTION_COPY_ALLOWANCE + options * OPTION_ROW_HEIGHT + Math.max(0, options - 1) * OPTION_ROW_GAP)
  const stationCount = Math.min(stationsOf(node).length, 2)
  const stationHeight = stationCount ? stationCount * STATION_IMAGE_SIZE + Math.max(0, stationCount - 1) * STATION_GAP + STATION_CARD_HEIGHT_PADDING : 0
  const members = groupMembersOf(node).length
  return members <= 1 ? Math.max(CARD_HEIGHT, stationHeight) : Math.max(CARD_HEIGHT, stationHeight, 40 + Math.ceil(members / 2) * ALTERNATIVE_ROW_HEIGHT + 14)
}
const buildLayout = (node: PublicItemRecipeTreeNode, depth: number, maxDepth: number, indexPath = '0', isRoot = false): LayoutNode => {
  let normalized = node
  let children = graphChildren(normalized, depth, maxDepth)
  while (children.length === 1 && children[0] && sameItem(normalized, children[0])) { normalized = children[0]; children = graphChildren(normalized, depth, maxDepth) }
  const width = cardWidth(normalized)
  const height = cardHeight(normalized)
  return { id: `${depth}-${indexPath}-${firstText(normalized.recipeId, normalized.itemId, normalized.id, normalized.itemInternalName, normalized.itemName, normalized.displayName, normalized.name, indexPath)}`, node: normalized, depth, isRoot, x: 0, y: 0, width, height, anchorX: width / 2, subtreeWidth: width, children: children.map((child, index) => buildLayout(child, depth + 1, maxDepth, `${indexPath}-${index}`)) }
}
const measureLayout = (node: LayoutNode): number => { node.subtreeWidth = node.children.length ? Math.max(node.width, node.children.reduce((total, child, index) => total + measureLayout(child) + (index ? X_GAP : 0), 0)) : node.width; return node.subtreeWidth }
const placeLayout = (node: LayoutNode, left: number, levelY: number[], nodes: LayoutNode[], edges: Layout['edges']) => {
  node.x = left + node.subtreeWidth / 2 - node.anchorX; node.y = levelY[node.depth] ?? 0; nodes.push(node)
  const width = node.children.reduce((total, child, index) => total + child.subtreeWidth + (index ? X_GAP : 0), 0)
  let childLeft = left + (node.subtreeWidth - width) / 2
  for (const child of node.children) { placeLayout(child, childLeft, levelY, nodes, edges); edges.push({ id: `${node.id}-${child.id}`, fromX: node.x + node.anchorX, fromY: node.y + node.height, toX: child.x + child.anchorX, toY: child.y }); childLeft += child.subtreeWidth + X_GAP }
}
const layoutForest = (roots: PublicItemRecipeTreeNode[], maxDepth: number): Layout => {
  const rootLayouts = roots.slice(0, 1).map((root, index) => buildLayout(root, 0, maxDepth, String(index), true))
  const nodes: LayoutNode[] = []; const edges: Layout['edges'] = []; const levelHeights: number[] = []
  const collect = (node: LayoutNode) => { levelHeights[node.depth] = Math.max(levelHeights[node.depth] ?? 0, node.height); node.children.forEach(collect) }
  rootLayouts.forEach(collect)
  const levelY = levelHeights.reduce<number[]>((offsets, _height, index) => { offsets[index] = index ? (offsets[index - 1] ?? 0) + (levelHeights[index - 1] ?? CARD_HEIGHT) + Y_GAP : 0; return offsets }, [])
  let left = 0; for (const root of rootLayouts) { measureLayout(root); placeLayout(root, left, levelY, nodes, edges); left += root.subtreeWidth + X_GAP * 2 }
  if (!nodes.length) return { nodes, edges, width: 0, height: 0 }
  const minX = Math.min(...nodes.map(node => node.x)); const maxX = Math.max(...nodes.map(node => node.x + node.width)); const minY = Math.min(...nodes.map(node => node.y)); const maxY = Math.max(...nodes.map(node => node.y + node.height))
  const offsetX = PADDING - minX; const offsetY = PADDING - minY
  for (const node of nodes) { node.x += offsetX; node.y += offsetY }
  for (const edge of edges) { edge.fromX += offsetX; edge.toX += offsetX; edge.fromY += offsetY; edge.toY += offsetY }
  return { nodes, edges, width: maxX - minX + PADDING * 2, height: maxY - minY + PADDING * 2 }
}

const firstGlyph = (value: string) => Array.from(value.trim())[0] || '?'
const createPreview = (rawImageUrl: string, label: string, width: number, height: number, resolveImageUrl: (imageUrl: string) => string) => {
  const imageUrl = resolveImageUrl(rawImageUrl)
  const preview = document.createElement('span'); preview.className = `item-art tp-preview-image${imageUrl ? '' : ' is-fallback'}`; preview.dataset.fallback = firstGlyph(label)
  if (!imageUrl) { preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', label); return preview }
  preview.dataset.sourceImage = imageUrl
  const img = document.createElement('img'); img.src = imageUrl; img.alt = label; img.width = width; img.height = height; img.loading = 'lazy'; img.decoding = 'async'; img.dataset.previewVisibleCenter = 'contain-only'
  const reset = () => { img.style.translate = '0 0'; img.style.transform = 'none' }
  img.addEventListener('load', reset); img.addEventListener('error', () => { reset(); preview.classList.add('is-fallback'); preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', label) }); preview.append(img)
  return preview
}
const relationLabel = (node: PublicItemRecipeTreeNode, depth: number, isRoot: boolean) => optionGroupsOf(node).length ? '' : isRoot ? 'ROOT' : groupMembersOf(node).length > 1 ? `任选 ${groupMembersOf(node).length}` : graphChildren(node, depth, depth + 1).length ? '子配方' : '材料'
const detailRows = (node: PublicItemRecipeTreeNode, depth: number, relation: string, quantity: string) => {
  const options = optionGroupsOf(node); if (options.length) return [{ label: '类型', value: '多配方来源' }, { label: '概况', value: `${options.length} 条配方 · ${options.reduce((total, option) => total + option.length, 0)} 个材料项` }]
  const rows = [{ label: '类型', value: relation || '材料' }]; if (quantity) rows.push({ label: '数量', value: quantity })
  const stations = stationsOf(node); const stationText = stations.map(stationName).filter(Boolean).join(' / '); if (stationText) rows.push({ label: '制作站', value: stations.length > 2 ? `${stationText} +${stations.length - 2}` : stationText })
  const children = graphChildren(node, depth, depth + 1); if (children.length) { rows.push({ label: '下级', value: `${children.length} 个节点` }); const names = children.map(nameOf).filter(Boolean); const visible = names.slice(0, 4).join(' / '); if (visible) rows.push({ label: '包含', value: names.length > 4 ? `${visible} +${names.length - 4}` : visible }) }
  const members = groupMembersOf(node); if (members.length > 1) rows.push({ label: '任选', value: members.map(groupMemberName).filter(Boolean).join(' / ') }); return rows
}
const positionPopover = (holder: HTMLElement, popover: HTMLElement) => { const anchor = holder.querySelector<HTMLElement>('.recipe-hierarchy-card') || holder; const rect = anchor.getBoundingClientRect(); const margin = 12; const gap = 8; const vw = window.innerWidth || 320; const vh = window.innerHeight || 320; const maxWidth = Math.max(160, Math.min(240, vw - margin * 2)); const width = Math.min(popover.offsetWidth || maxWidth, maxWidth); const height = Math.min(popover.offsetHeight || 132, vh - margin * 2); const placement = rect.top - margin - gap >= height || rect.top - margin - gap >= vh - rect.bottom - margin - gap ? 'above' : 'below'; const top = Math.max(margin, Math.min(placement === 'above' ? rect.top - height - gap : rect.bottom + gap, vh - height - margin)); const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - margin)); popover.dataset.placement = placement; popover.style.left = `${Math.round(left)}px`; popover.style.top = `${Math.round(top)}px`; popover.style.maxWidth = `${Math.round(maxWidth)}px`; popover.style.setProperty('--recipe-popover-max-height', `${Math.round(vh - margin * 2)}px`) }
const createNode = (layoutNode: LayoutNode, options: RecipeHierarchyGraphRendererOptions) => {
  const holder = document.createElement('div'); holder.className = `recipe-hierarchy-node recipe-overview-node${layoutNode.isRoot ? ' is-root' : ''}${layoutNode.children.length ? ' has-children' : ''}`; holder.style.setProperty('--node-x', `${layoutNode.x}px`); holder.style.setProperty('--node-y', `${layoutNode.y}px`); holder.style.setProperty('--node-card-width', `${layoutNode.width}px`); holder.style.setProperty('--node-card-height', `${layoutNode.height}px`)
  const relationText = relationLabel(layoutNode.node, layoutNode.depth, layoutNode.isRoot); const relation = document.createElement('span'); relation.className = 'recipe-hierarchy-label'; relation.textContent = relationText; holder.append(relation)
  const groups = optionGroupsOf(layoutNode.node); const stations = stationsOf(layoutNode.node).slice(0, 2); if (groups.length) holder.classList.add('has-recipe-options')
  const card = document.createElement('span'); card.className = `recipe-hierarchy-card${stations.length && !groups.length ? ' has-stations' : ''}${groups.length ? ' has-recipe-options' : ''}`; card.title = `${nameOf(layoutNode.node)} ${quantityOf(layoutNode.node, layoutNode.isRoot)}`; card.setAttribute('aria-label', card.title)
  const main = document.createElement('span'); main.className = 'recipe-hierarchy-main'
  if (groups.length) { const source = document.createElement('span'); source.className = 'recipe-hierarchy-option-source'; source.setAttribute('aria-label', '多配方来源'); const rows = document.createElement('span'); rows.className = 'recipe-hierarchy-option-groups'; for (const [index, group] of groups.entries()) { const row = document.createElement('span'); row.className = 'recipe-hierarchy-option-row'; row.dataset.recipeOptionIndex = String(index + 1); row.title = group.map(nameOf).join(' + '); for (const material of group.slice(0, 5)) { const item = document.createElement('span'); item.className = 'recipe-hierarchy-option-material'; item.title = `${nameOf(material)} ${quantityOf(material)}`; item.append(createPreview(imageValueOf(material), nameOf(material), 18, 18, options.resolveImageUrl)); const quantity = document.createElement('span'); quantity.className = 'recipe-hierarchy-option-quantity'; quantity.textContent = quantityOf(material); item.append(quantity); row.append(item) } rows.append(row) } source.append(rows); main.append(source) }
  else if (groupMembersOf(layoutNode.node).length > 1) { const alternatives = document.createElement('span'); alternatives.className = 'recipe-hierarchy-alt-images'; alternatives.title = groupMembersOf(layoutNode.node).map(groupMemberName).filter(Boolean).join(' / '); alternatives.setAttribute('aria-label', '可替代材料'); for (const member of groupMembersOf(layoutNode.node).slice(0, 4)) alternatives.append(createPreview(groupMemberImage(member), groupMemberName(member), 32, 32, options.resolveImageUrl)); main.append(alternatives); const quantity = document.createElement('span'); quantity.className = 'recipe-hierarchy-quantity'; quantity.textContent = quantityOf(layoutNode.node, layoutNode.isRoot); main.append(quantity) }
  else { main.append(createPreview(imageValueOf(layoutNode.node), nameOf(layoutNode.node), 48, 48, options.resolveImageUrl)); const quantity = document.createElement('span'); quantity.className = 'recipe-hierarchy-quantity'; quantity.textContent = quantityOf(layoutNode.node, layoutNode.isRoot); main.append(quantity) }
  const copy = document.createElement('span'); copy.className = 'recipe-hierarchy-graph-node-copy'; copy.textContent = nameOf(layoutNode.node); main.append(copy); card.append(main)
  if (stations.length && !groups.length) { const rail = document.createElement('span'); rail.className = 'recipe-hierarchy-station-rail'; rail.title = stations.map(stationName).filter(Boolean).join(' / '); rail.setAttribute('aria-label', '制作站'); for (const station of stations) { const badge = document.createElement('span'); badge.className = 'recipe-hierarchy-station-badge'; badge.title = stationName(station); badge.append(createPreview(stationImage(station), stationName(station), STATION_IMAGE_SIZE, STATION_IMAGE_SIZE, options.resolveImageUrl)); rail.append(badge) } card.append(rail) }
  holder.append(card)
  const popover = document.createElement('aside'); popover.className = 'recipe-hierarchy-popover crafting-screen'; popover.setAttribute('role', 'tooltip'); const head = document.createElement('span'); head.className = 'recipe-hierarchy-popover-head'; const images = document.createElement('span'); images.className = 'recipe-hierarchy-popover-images'; const imageNodes = groups.length ? groups.flat().slice(0, 4) : []; if (imageNodes.length) imageNodes.forEach(node => images.append(createPreview(imageValueOf(node), nameOf(node), 26, 26, options.resolveImageUrl))); else if (groupMembersOf(layoutNode.node).length > 1) groupMembersOf(layoutNode.node).slice(0, 4).forEach(member => images.append(createPreview(groupMemberImage(member), groupMemberName(member), 26, 26, options.resolveImageUrl))); else images.append(createPreview(imageValueOf(layoutNode.node), nameOf(layoutNode.node), 26, 26, options.resolveImageUrl)); const title = document.createElement('span'); title.className = 'recipe-hierarchy-popover-title'; const strong = document.createElement('b'); strong.textContent = nameOf(layoutNode.node); const subtitle = document.createElement('span'); subtitle.textContent = groupMembersOf(layoutNode.node).length > 1 ? '可替代材料' : firstText(layoutNode.node.secondaryName, layoutNode.node.itemInternalName, layoutNode.node.itemName); title.append(strong); if (subtitle.textContent) title.append(subtitle); head.append(images, title); const list = document.createElement('dl'); for (const row of detailRows(layoutNode.node, layoutNode.depth, relationText, quantityOf(layoutNode.node, layoutNode.isRoot))) { const term = document.createElement('dt'); term.textContent = row.label; const description = document.createElement('dd'); description.textContent = row.value; list.append(term, description) } popover.append(head, list); holder.append(popover)
  const show = () => { holder.dataset.popoverActive = 'true'; popover.dataset.recipeHierarchyPopover = options.popoverOwner; if (popover.parentElement !== document.body) document.body.append(popover); popover.classList.add('is-visible'); positionPopover(holder, popover); requestAnimationFrame(() => positionPopover(holder, popover)) }; const hide = () => { delete holder.dataset.popoverActive; delete popover.dataset.recipeHierarchyPopover; popover.classList.remove('is-visible'); holder.append(popover) }; holder.onmouseenter = show; holder.onmouseleave = hide; holder.addEventListener('focusin', show); holder.addEventListener('focusout', hide); return holder
}
const createLines = (layout: Layout) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'recipe-overview-lines'); svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`); svg.setAttribute('width', String(layout.width)); svg.setAttribute('height', String(layout.height)); svg.setAttribute('aria-hidden', 'true'); for (const edge of layout.edges) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); const middle = (edge.fromY + edge.toY) / 2; path.setAttribute('class', 'recipe-overview-edge'); path.setAttribute('d', `M ${edge.fromX} ${edge.fromY} V ${middle} H ${edge.toX} V ${edge.toY}`); svg.append(path) }; return svg }
const updateZoom = (graph: HTMLElement) => { const base = Number(graph.dataset.baseScale || '1'); const manual = Number(graph.dataset.manualScale || '1'); const scale = Math.max(base * MIN_MANUAL_SCALE, Math.min(MAX_MANUAL_SCALE, base * manual)); graph.style.setProperty('--recipe-overview-scale', String(scale)); graph.style.setProperty('--recipe-overview-pan-x', `${Number(graph.dataset.panX || '0')}px`); graph.style.setProperty('--recipe-overview-pan-y', `${Number(graph.dataset.panY || '0')}px`); graph.style.minHeight = `${Math.ceil(Number(graph.dataset.layoutHeight || '0') * base)}px`; const holder = graph.querySelector<HTMLElement>('.recipe-overview-node[data-popover-active="true"]'); const popover = holder?.querySelector<HTMLElement>('.recipe-hierarchy-popover') || document.body.querySelector<HTMLElement>(`.recipe-hierarchy-popover[data-recipe-hierarchy-popover]`); if (holder && popover) requestAnimationFrame(() => positionPopover(holder, popover)) }
const enableInteractions = (graph: HTMLElement) => { graph.addEventListener('wheel', event => { event.preventDefault(); const current = Number(graph.dataset.manualScale || '1'); graph.dataset.manualScale = String(Math.max(MIN_MANUAL_SCALE, Math.min(MAX_MANUAL_SCALE, Number((current + (event.deltaY > 0 ? -MANUAL_SCALE_STEP : MANUAL_SCALE_STEP)).toFixed(2))))); updateZoom(graph) }, { passive: false }); graph.addEventListener('pointerdown', event => { if ((event.target as HTMLElement | null)?.closest('.recipe-overview-node')) return; graph.dataset.panPointerId = String(event.pointerId); graph.dataset.panStartX = String(event.clientX); graph.dataset.panStartY = String(event.clientY); graph.dataset.panOriginX = graph.dataset.panX || '0'; graph.dataset.panOriginY = graph.dataset.panY || '0'; graph.classList.add('is-panning'); graph.setPointerCapture(event.pointerId) }); graph.addEventListener('pointermove', event => { if (graph.dataset.panPointerId !== String(event.pointerId)) return; graph.dataset.panX = String(Number(graph.dataset.panOriginX || '0') + event.clientX - Number(graph.dataset.panStartX || '0')); graph.dataset.panY = String(Number(graph.dataset.panOriginY || '0') + event.clientY - Number(graph.dataset.panStartY || '0')); updateZoom(graph) }); const end = (event: PointerEvent) => { if (graph.dataset.panPointerId !== String(event.pointerId)) return; if (graph.hasPointerCapture?.(event.pointerId)) graph.releasePointerCapture(event.pointerId); delete graph.dataset.panPointerId; graph.classList.remove('is-panning') }; graph.addEventListener('pointerup', end); graph.addEventListener('pointercancel', end) }

export const renderRecipeHierarchyGraph = (options: RecipeHierarchyGraphRendererOptions) => {
  const layout = layoutForest(options.roots, options.maxDepth)
  if (!layout.nodes.length) return null
  const graph = document.createElement('div'); graph.className = 'recipe-hierarchy-tree--article-embed crafting-screen recipe-hierarchy-tree recipe-overview-tree'; graph.setAttribute('data-crafting-role', 'recipe-hierarchy-tree'); graph.dataset.recipeHierarchyRenderer = 'shared'
  const availableWidth = Math.max(1, options.availableWidth - VIEWPORT_GUTTER); const baseScale = Math.min(1, availableWidth / Math.max(layout.width, 1), 520 / Math.max(layout.height, 1)); graph.style.setProperty('--recipe-overview-width', `${layout.width}px`); graph.style.setProperty('--recipe-overview-height', `${layout.height}px`); graph.dataset.baseScale = String(baseScale); graph.dataset.manualScale = '1'; graph.dataset.layoutHeight = String(layout.height); graph.dataset.panX = '0'; graph.dataset.panY = '0'
  const canvas = document.createElement('div'); canvas.className = 'recipe-overview-canvas'; canvas.append(createLines(layout)); layout.nodes.forEach(node => canvas.append(createNode(node, options))); graph.append(canvas); updateZoom(graph); enableInteractions(graph); return graph
}
