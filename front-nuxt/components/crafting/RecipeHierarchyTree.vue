<script setup lang="ts">
import type { PublicItemRecipeTreeNode, PublicItemRecipeTreeStation } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

const props = defineProps<{
  root: PublicItemRecipeTreeNode | null
  maxDepth: number
  hoveredTargetKey?: string
  activeTargetKey?: string
}>()

const emit = defineEmits<{
  hoverTarget: [key: string]
  selectTarget: [key: string]
}>()

type OverviewNode = {
  id: string
  node: PublicItemRecipeTreeNode
  title: string
  subtitle: string
  image: string
  href: string
  quantity: string
  relation: string
  depth: number
  x: number
  y: number
  width: number
  height: number
  anchorX: number
  subtreeWidth: number
  targetKey: string
  detailRows: Array<{ label: string, value: string }>
  children: OverviewNode[]
}

type OverviewEdge = {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

type RecipeOptionsSourceNode = PublicItemRecipeTreeNode & {
  nodeType: 'recipe_options'
  recipeOptions: PublicItemRecipeTreeNode[][]
  targetKey: string
}

const CARD_WIDTH = 102
const OPTION_SOURCE_WIDTH = 150
const CARD_HEIGHT = 54
const X_GAP = 6
const Y_GAP = 10
const PADDING = 12
const MIN_SCALE = 0.48
const MAX_SCALE = 1

const treeHost = ref<HTMLElement | null>(null)
const hostWidth = ref(0)
const hostHeightLimit = ref(520)
let resizeObserver: ResizeObserver | null = null

const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const normalizeTargetKey = (...values: unknown[]) => displayText(...values).replace(/\s+/g, '-').toLowerCase()
const truthyFlag = (value: unknown) => value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'
const nodeDepth = (node: PublicItemRecipeTreeNode, fallback: number) => {
  const parsed = Number(node.depth)
  return Number.isFinite(parsed) ? parsed : fallback
}
const nodeTitle = (node: PublicItemRecipeTreeNode) => displayText(
  ...(Array.isArray(node.groupMembers) && node.groupMembers.length > 0
    ? [node.groupMembers.map((member) => displayText(member.nameZh, member.name, member.internalName)).filter(Boolean).join(' 或 ')]
    : []),
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.name,
  node.itemInternalName,
  '配方节点',
)
const nodeSubtitle = (node: PublicItemRecipeTreeNode) => Array.isArray(node.groupMembers) && node.groupMembers.length > 1
  ? '可替代材料'
  : displayText(node.secondaryName, node.itemInternalName, node.itemName)
const nodeImage = (node: PublicItemRecipeTreeNode) => {
  const firstMember = Array.isArray(node.groupMembers) ? node.groupMembers[0] : null
  return resolvePreviewImageUrl(node.itemImage || node.itemImageUrl || node.image || node.previewImage || firstMember?.image || firstMember?.imageUrl || '')
}
const popoverImages = (node: PublicItemRecipeTreeNode) => {
  const options = recipeOptionGroups(node)
  if (options.length > 0) {
    return options
      .flatMap((option) => option)
      .map((material) => ({
        key: displayText(material.recipeId, material.itemId, material.itemInternalName, material.displayName, material.name),
        title: nodeTitle(material),
        image: nodeImage(material),
      }))
      .filter((entry) => entry.key || entry.image)
      .slice(0, 4)
  }

  const members = groupMembers(node)
  if (members.length > 1) {
    return members
      .map((member) => ({
        key: displayText(member.itemId, member.internalName, memberTitle(member)),
        title: memberTitle(member),
        image: memberImage(member),
      }))
      .filter((entry) => entry.key || entry.image)
      .slice(0, 4)
  }

  return [{
    key: itemKey(node),
    title: nodeTitle(node),
    image: nodeImage(node),
  }]
}
const memberTitle = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => displayText(member.nameZh, member.name, member.internalName, '可替代材料')
const memberImage = (member: NonNullable<PublicItemRecipeTreeNode['groupMembers']>[number]) => resolvePreviewImageUrl(member.image || member.imageUrl || '')
const groupMembers = (node: PublicItemRecipeTreeNode) => Array.isArray(node.groupMembers) ? node.groupMembers : []
const visibleGroupMembers = (node: PublicItemRecipeTreeNode) => groupMembers(node)
const groupMemberSummary = (node: PublicItemRecipeTreeNode) => groupMembers(node).map(memberTitle).filter(Boolean).join(' / ')
const isRecipeOptionsSource = (node: PublicItemRecipeTreeNode): node is RecipeOptionsSourceNode =>
  node.nodeType === 'recipe_options' && Array.isArray((node as RecipeOptionsSourceNode).recipeOptions)
const recipeOptionGroups = (node: PublicItemRecipeTreeNode) => {
  return isRecipeOptionsSource(node) ? node.recipeOptions : []
}
const hasRecipeOptionGroups = (node: PublicItemRecipeTreeNode) => recipeOptionGroups(node).length > 0
const nodeCardWidth = (node: PublicItemRecipeTreeNode) => hasRecipeOptionGroups(node) ? OPTION_SOURCE_WIDTH : CARD_WIDTH
const nodeAnchorX = (node: PublicItemRecipeTreeNode) => nodeCardWidth(node) / 2
const nodeCardHeight = (node: PublicItemRecipeTreeNode) => {
  const optionRows = recipeOptionGroups(node).length
  if (optionRows > 0) return Math.max(CARD_HEIGHT, 12 + optionRows * 24)

  const members = groupMembers(node).length
  if (members <= 1) return CARD_HEIGHT
  const rows = Math.ceil(members / 2)
  return Math.max(CARD_HEIGHT, 20 + rows * 22 + 14)
}
const stationTitle = (station: PublicItemRecipeTreeStation) => displayText(
  station.displayName,
  station.stationNameZh,
  station.stationName,
  station.name,
  station.stationNameRaw,
  station.stationInternalName,
  '制作站',
)
const stationImage = (station: PublicItemRecipeTreeStation) => resolvePreviewImageUrl(station.stationImage || station.itemImage || station.itemImageUrl || station.image || '')
const stationKey = (station: PublicItemRecipeTreeStation, index: number) => displayText(station.stationItemId, station.stationInternalName, stationTitle(station), index)
const directStations = (node: PublicItemRecipeTreeNode) => Array.isArray(node.stations) ? node.stations : []
const inheritedStations = (node: PublicItemRecipeTreeNode) => {
  const stations = directStations(node)
  if (stations.length > 0) return stations

  const children = Array.isArray(node.children) ? node.children : []
  const sameItemRecipe = children.find((child) => isSameRecipeItem(node, child) && directStations(child).length > 0)
  return sameItemRecipe ? directStations(sameItemRecipe) : []
}
const visibleStations = (node: PublicItemRecipeTreeNode) => inheritedStations(node)
  .filter((station) => station.stationType !== 'condition')
  .slice(0, 2)
const stationSummary = (node: PublicItemRecipeTreeNode) => {
  const stations = visibleStations(node)
  if (!stations.length) return ''
  const label = stations.map(stationTitle).join(' / ')
  const total = inheritedStations(node).filter((station) => station.stationType !== 'condition').length
  return total > stations.length ? `${label} +${total - stations.length}` : label
}
const childSummary = (node: PublicItemRecipeTreeNode, depth: number) => {
  const children = visibleChildrenFor(node, depth)
  if (!children.length) return ''
  const recipeCount = children.filter((child) => visibleChildrenFor(child, depth + 1).length > 0 || directStations(child).length > 0).length
  const materialCount = children.length - recipeCount
  return [
    recipeCount > 0 ? `${recipeCount} 个子配方` : '',
    materialCount > 0 ? `${materialCount} 个材料` : '',
  ].filter(Boolean).join(' / ')
}
const childNameSummary = (node: PublicItemRecipeTreeNode, depth: number) => {
  const children = visibleChildrenFor(node, depth)
  if (!children.length) return ''

  const names = children.map(nodeTitle).filter(Boolean)
  const visibleNames = names.slice(0, 4).join(' / ')
  return names.length > 4 ? `${visibleNames} +${names.length - 4}` : visibleNames
}
const sourceTitle = (node: PublicItemRecipeTreeNode) => nodeTitle(node).replace(/\s*·\s*\d+\s*条配方来源$/, '')
const appendSourcePath = (path: string[], title: string) => {
  if (!title || path[path.length - 1] === title) return path
  return path.concat(title)
}
const childRecipeSourceSummary = (node: PublicItemRecipeTreeNode, depth: number) => {
  const summaries: string[] = []
  const walk = (current: PublicItemRecipeTreeNode, currentDepth: number, path: string[]) => {
    if (summaries.length >= 8 || currentDepth > props.maxDepth + 1) return

    const nextPath = appendSourcePath(path, sourceTitle(current))
    const options = recipeOptionGroups(current)
    if (options.length > 0) {
      summaries.push(`${nextPath.slice(-3).join(' > ')} ${options.length} 条来源`)
      return
    }

    for (const child of visibleChildrenFor(current, currentDepth)) {
      walk(child, currentDepth + 1, nextPath)
    }
  }

  for (const child of visibleChildrenFor(node, depth)) {
    walk(child, depth + 1, [])
  }

  const visibleSummaries = summaries.slice(0, 3).join(' / ')
  return summaries.length > 3 ? `${visibleSummaries} +${summaries.length - 3}` : visibleSummaries
}
const optionSourceSummary = (node: PublicItemRecipeTreeNode) => {
  const options = recipeOptionGroups(node)
  if (!options.length) return ''
  const materialCount = options.reduce((total, option) => total + option.length, 0)
  return `${options.length} 条配方 · ${materialCount} 个材料项`
}
const nodeDetailRows = (node: PublicItemRecipeTreeNode, depth: number, quantity: string, relation: string) => {
  const rows: Array<{ label: string, value: string }> = []
  const optionsSummary = optionSourceSummary(node)
  if (optionsSummary) {
    rows.push({ label: '类型', value: '多配方来源' })
    rows.push({ label: '概况', value: optionsSummary })
    return rows
  }

  rows.push({ label: '类型', value: relation || '材料' })
  if (quantity) rows.push({ label: '数量', value: quantity })
  const stations = stationSummary(node)
  if (stations) rows.push({ label: '制作站', value: stations })
  const children = childSummary(node, depth)
  if (children) rows.push({ label: '下级', value: children })
  const childNames = childNameSummary(node, depth)
  if (childNames) rows.push({ label: '包含', value: childNames })
  const childSources = childRecipeSourceSummary(node, depth)
  if (childSources) rows.push({ label: '来源', value: childSources })
  if (groupMembers(node).length > 1) rows.push({ label: '任选', value: groupMemberSummary(node) })
  return rows
}
const nodeGroupMember = (node: PublicItemRecipeTreeNode) => ({
  itemId: node.itemId,
  internalName: node.itemInternalName || node.itemName || node.name || null,
  name: node.itemName || node.name || node.displayName || null,
  nameZh: node.displayName || node.itemNameZh || node.name || null,
  image: node.itemImage || node.image || node.previewImage || null,
  imageUrl: node.itemImageUrl || null,
})
const nodeHref = (node: PublicItemRecipeTreeNode) => {
  const itemId = displayText(node.itemId, node.id)
  return itemId ? `/items/${itemId}` : ''
}
const nodeQuantity = (node: PublicItemRecipeTreeNode, isRoot = false) => {
  if (hasRecipeOptionGroups(node)) return ''
  if (node.quantityText) return `x${String(node.quantityText).replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) return `x${node.quantityMin}-${node.quantityMax}`
  const directQuantity = displayText(node.quantityMin, node.quantity, node.amount, node.count)
  if (directQuantity) return `x${directQuantity.replace(/^x/i, '')}`
  const resultQuantity = Number(node.resultQuantity)
  return isRoot && Number.isFinite(resultQuantity) && resultQuantity > 0 ? `x${resultQuantity}` : 'x1'
}
const itemKey = (node: PublicItemRecipeTreeNode) => displayText(
  node.itemId,
  node.id,
  node.itemInternalName,
  node.itemName,
  node.displayName,
  node.name,
)
const itemTargetKey = (node: PublicItemRecipeTreeNode) => {
  const members = Array.isArray(node.groupMembers) ? node.groupMembers : []
  if (members.length > 0) {
    const memberKeys = members
      .map((member) => displayText(member.itemId, member.internalName, member.nameZh, member.name))
      .filter(Boolean)
      .sort()
      .join('|')
    return `group:${memberKeys || normalizeTargetKey(nodeTitle(node))}`
  }

  return `item:${displayText(node.itemId, node.id, node.itemInternalName, node.itemName, nodeTitle(node))}`
}
const recipeTargetKey = (node: PublicItemRecipeTreeNode) => normalizeTargetKey(itemTargetKey(node))
const nodeTargetKey = (node: PublicItemRecipeTreeNode) => isRecipeOptionsSource(node) ? node.targetKey : recipeTargetKey(node)
const isSameRecipeItem = (left: PublicItemRecipeTreeNode, right: PublicItemRecipeTreeNode) => {
  const leftItemId = displayText(left.itemId, left.id)
  const rightItemId = displayText(right.itemId, right.id)
  if (leftItemId && rightItemId) return leftItemId === rightItemId

  const leftInternalName = displayText(left.itemInternalName, left.itemName)
  const rightInternalName = displayText(right.itemInternalName, right.itemName)
  return Boolean(leftInternalName && rightInternalName && leftInternalName === rightInternalName)
}
const mergeAlternativeRecipeChildren = (options: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  if (options.length > 1 && options.every((option) => Array.isArray(option.children) && option.children.length > 0)) {
    const firstOption = options[0]
    if (firstOption) {
      return [{
        ...firstOption,
        displayName: nodeTitle(firstOption),
        children: [{
          nodeType: 'recipe_options',
          displayName: `${nodeTitle(firstOption)} · ${options.length} 条配方来源`,
          secondaryName: '多配方来源',
          children: [],
          targetKey: recipeTargetKey(firstOption),
          recipeOptions: options.map((option) => mergeSameItemSiblings(Array.isArray(option.children) ? option.children : [])),
        } as RecipeOptionsSourceNode],
      } as PublicItemRecipeTreeNode]
    }
  }

  const optionChildren = options.map((option) => Array.isArray(option.children) ? option.children : [])
  const counts = new Map<string, number>()
  for (const children of optionChildren) {
    const uniqueKeys = new Set(children.map((child) => itemKey(child)).filter(Boolean))
    for (const key of uniqueKeys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const sharedKeys = new Set([...counts.entries()]
    .filter(([, count]) => count === options.length)
    .map(([key]) => key))
  const shared = new Map<string, PublicItemRecipeTreeNode>()
  const alternatives: PublicItemRecipeTreeNode[] = []

  for (const children of optionChildren) {
    for (const child of children) {
      const key = itemKey(child)
      if (key && sharedKeys.has(key)) {
        if (!shared.has(key)) shared.set(key, child)
      } else {
        alternatives.push(child)
      }
    }
  }

  const ordered: PublicItemRecipeTreeNode[] = []
  let alternativeInserted = false
  const firstChildren = optionChildren[0] ?? []
  for (const child of firstChildren) {
    const key = itemKey(child)
    if (key && sharedKeys.has(key)) {
      const sharedChild = shared.get(key)
      if (sharedChild && !ordered.some((entry) => itemKey(entry) === key)) ordered.push(sharedChild)
    } else if (!alternativeInserted && alternatives.length > 0) {
      const firstAlternative = alternatives[0]
      ordered.push({
        ...firstAlternative,
        displayName: alternatives.map(nodeTitle).join(' 或 '),
        secondaryName: '可替代材料',
        itemInternalName: alternatives.map((node) => displayText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '),
        groupMembers: alternatives.map(nodeGroupMember),
        children: [],
      })
      alternativeInserted = true
    }
  }

  for (const [key, child] of shared) {
    if (!ordered.some((entry) => itemKey(entry) === key)) ordered.push(child)
  }
  if (!alternativeInserted && alternatives.length > 0) {
    const firstAlternative = alternatives[0]
    ordered.unshift({
      ...firstAlternative,
      displayName: alternatives.map(nodeTitle).join(' 或 '),
      secondaryName: '可替代材料',
      itemInternalName: alternatives.map((node) => displayText(node.itemInternalName, node.itemName, node.name)).filter(Boolean).join(' / '),
      groupMembers: alternatives.map(nodeGroupMember),
      children: [],
    })
  }

  return ordered
}
const mergeSameItemSiblings = (nodes: PublicItemRecipeTreeNode[]): PublicItemRecipeTreeNode[] => {
  const groups = new Map<string, PublicItemRecipeTreeNode[]>()
  const order: string[] = []
  for (const node of nodes) {
    const key = `${itemKey(node)}:${displayText(node.quantityText, node.quantityMin, node.quantityMax, node.quantity, node.amount, node.count)}`
    if (!key.trim()) {
      order.push(`unique:${order.length}`)
      groups.set(order[order.length - 1] ?? '', [node])
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
    if (group.length <= 1) return group
    const first = group[0]
    if (!first) return []
    return [{
      ...first,
      children: mergeAlternativeRecipeChildren(group),
    }]
  })
}
const visibleChildrenFor = (node: PublicItemRecipeTreeNode, depth: number): PublicItemRecipeTreeNode[] => {
  const children = Array.isArray(node.children) ? node.children : []
  const canExpand = children.length > 0 && nodeDepth(node, depth) < props.maxDepth && !truthyFlag(node.cycleDetected) && !truthyFlag(node.isReference)
  if (!canExpand) return []

  let candidates = children
  while (candidates.length === 1 && candidates[0] && isSameRecipeItem(node, candidates[0])) {
    const nextChildren = Array.isArray(candidates[0].children) ? candidates[0].children : []
    if (!nextChildren.length) break
    candidates = nextChildren
  }
  if (candidates.length > 1 && candidates.every((child) => isSameRecipeItem(node, child))) {
    return mergeAlternativeRecipeChildren(candidates).slice(0, 18)
  }

  return mergeSameItemSiblings(candidates).slice(0, 18)
}
const relationLabel = (node: PublicItemRecipeTreeNode, depth: number, isRoot = false) => {
  if (hasRecipeOptionGroups(node)) return ''
  if (isRoot) return 'ROOT'
  if (node.groupMembers?.length) return `任选 ${node.groupMembers.length}`
  return visibleChildrenFor(node, depth).length > 0 ? '子配方' : '材料'
}
const makeNodeId = (node: PublicItemRecipeTreeNode, depth: number, indexPath: string) => displayText(node.recipeId, itemKey(node), `${depth}-${indexPath}`)

const buildOverviewTree = (node: PublicItemRecipeTreeNode, depth = 0, indexPath = '0', isRoot = false): OverviewNode => {
  let normalizedNode = node
  let sameItemChildren = visibleChildrenFor(normalizedNode, depth)
  while (sameItemChildren.length === 1 && sameItemChildren[0] && isSameRecipeItem(normalizedNode, sameItemChildren[0])) {
    normalizedNode = sameItemChildren[0]
    sameItemChildren = visibleChildrenFor(normalizedNode, depth)
  }

  const children = sameItemChildren.map((child: PublicItemRecipeTreeNode, index: number) => buildOverviewTree(child, depth + 1, `${indexPath}-${index}`, false))
  const quantity = nodeQuantity(normalizedNode, isRoot)
  const relation = relationLabel(normalizedNode, depth, isRoot)
  return {
    id: makeNodeId(normalizedNode, depth, indexPath),
    node: normalizedNode,
    title: nodeTitle(normalizedNode),
    subtitle: nodeSubtitle(normalizedNode),
    image: nodeImage(normalizedNode),
    href: nodeHref(normalizedNode),
    quantity,
    relation,
    depth,
    x: 0,
    y: 0,
    width: nodeCardWidth(normalizedNode),
    height: nodeCardHeight(normalizedNode),
    anchorX: nodeAnchorX(normalizedNode),
    subtreeWidth: nodeCardWidth(normalizedNode),
    targetKey: nodeTargetKey(normalizedNode),
    detailRows: nodeDetailRows(normalizedNode, depth, quantity, relation),
    children,
  }
}

const layoutTree = (root: OverviewNode | null) => {
  if (!root) return { nodes: [] as OverviewNode[], edges: [] as OverviewEdge[], width: 0, height: 0 }

  let maxDepth = 0
  const nodes: OverviewNode[] = []
  const edges: OverviewEdge[] = []
  const levelHeights: number[] = []

  const collectLevelHeights = (node: OverviewNode) => {
    levelHeights[node.depth] = Math.max(levelHeights[node.depth] ?? 0, node.height)
    for (const child of node.children) collectLevelHeights(child)
  }
  collectLevelHeights(root)
  const levelY = levelHeights.reduce<number[]>((offsets, height, index) => {
    offsets[index] = index === 0 ? 0 : (offsets[index - 1] ?? 0) + (levelHeights[index - 1] ?? CARD_HEIGHT) + Y_GAP
    return offsets
  }, [])

  const measure = (node: OverviewNode): number => {
    if (node.children.length === 0) {
      node.subtreeWidth = node.width
      return node.subtreeWidth
    }

    const childWidth = node.children.reduce((total, child, index) =>
      total + measure(child) + (index === 0 ? 0 : X_GAP), 0)
    node.subtreeWidth = Math.max(node.width, childWidth)
    return node.subtreeWidth
  }
  measure(root)

  const place = (node: OverviewNode, left = 0) => {
    maxDepth = Math.max(maxDepth, node.depth)
    node.x = left + node.subtreeWidth / 2 - node.anchorX
    node.y = levelY[node.depth] ?? 0

    if (node.children.length > 0) {
      const childWidth = node.children.reduce((total, child, index) =>
        total + child.subtreeWidth + (index === 0 ? 0 : X_GAP), 0)
      let childLeft = left + (node.subtreeWidth - childWidth) / 2
      for (const child of node.children) {
        place(child, childLeft)
        childLeft += child.subtreeWidth + X_GAP
      }
    }

    nodes.push(node)

    for (const child of node.children) {
      edges.push({
        id: `${node.id}-${child.id}`,
        fromX: node.x + node.anchorX,
        fromY: node.y + node.height,
        toX: child.x + child.anchorX,
        toY: child.y,
      })
    }
  }

  place(root)

  const minX = Math.min(...nodes.map((node) => node.x))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const offsetX = PADDING - minX
  for (const node of nodes) node.x += offsetX
  for (const edge of edges) {
    edge.fromX += offsetX
    edge.toX += offsetX
  }

  return {
    nodes,
    edges,
    width: maxX - minX + PADDING * 2,
    height: (levelY[maxDepth] ?? 0) + (levelHeights[maxDepth] ?? CARD_HEIGHT) + PADDING * 2,
  }
}

const overview = computed(() => layoutTree(props.root ? buildOverviewTree(props.root, 0, '0', true) : null))
const isLinkedNode = (node: OverviewNode) => Boolean(node.targetKey)
const isHoveredNode = (node: OverviewNode) => Boolean(node.targetKey && props.hoveredTargetKey === node.targetKey)
const isActiveNode = (node: OverviewNode) => Boolean(node.targetKey && props.activeTargetKey === node.targetKey)
const handleNodeHover = (node: OverviewNode) => {
  if (!node.targetKey) return
  emit('hoverTarget', node.targetKey)
}
const handleNodeLeave = (node: OverviewNode) => {
  if (!node.targetKey || props.hoveredTargetKey !== node.targetKey) return
  emit('hoverTarget', '')
}
const handleNodeSelect = (node: OverviewNode) => {
  if (!node.targetKey) return
  emit('selectTarget', node.targetKey)
}
const treeScale = computed(() => {
  if (!hostWidth.value || !overview.value.width) return MAX_SCALE
  const available = Math.max(280, hostWidth.value - 2)
  const widthScale = available / overview.value.width
  const heightScale = hostHeightLimit.value / Math.max(overview.value.height, 1)
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, widthScale, heightScale))
})
const viewportStyle = computed(() => ({
  '--recipe-overview-width': `${overview.value.width}px`,
  '--recipe-overview-height': `${overview.value.height}px`,
  '--recipe-overview-scale': String(treeScale.value),
  minHeight: `${Math.ceil(overview.value.height * treeScale.value)}px`,
}))

onMounted(() => {
  if (!treeHost.value) return

  const updateSize = () => {
    hostWidth.value = treeHost.value?.clientWidth ?? 0
    const hostTop = treeHost.value?.getBoundingClientRect().top ?? 0
    const visibleHeight = window.innerHeight - hostTop - 34
    hostHeightLimit.value = Math.max(232, Math.min(520, visibleHeight))
  }
  updateSize()

  resizeObserver = new ResizeObserver(updateSize)
  resizeObserver.observe(treeHost.value)
  window.addEventListener('resize', updateSize)
  onBeforeUnmount(() => window.removeEventListener('resize', updateSize))
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    v-if="root"
    ref="treeHost"
    class="recipe-hierarchy-tree recipe-overview-tree"
    :style="viewportStyle"
    data-crafting-role="recipe-hierarchy-tree"
  >
    <div class="recipe-overview-canvas">
      <svg
        class="recipe-overview-lines"
        :viewBox="`0 0 ${overview.width} ${overview.height}`"
        :width="overview.width"
        :height="overview.height"
        aria-hidden="true"
        data-crafting-role="recipe-overview-lines"
      >
        <path
          v-for="edge in overview.edges"
          :key="edge.id"
          class="recipe-overview-edge"
          :d="`M ${edge.fromX} ${edge.fromY} V ${(edge.fromY + edge.toY) / 2} H ${edge.toX} V ${edge.toY}`"
        />
      </svg>

      <article
        v-for="node in overview.nodes"
        :key="node.id"
        class="recipe-hierarchy-node recipe-overview-node"
        :class="{ 'is-root': node.depth === 0, 'has-children': node.children.length > 0, 'has-recipe-options': hasRecipeOptionGroups(node.node), 'is-linked': isLinkedNode(node), 'is-hover-linked': isHoveredNode(node), 'is-active-linked': isActiveNode(node) }"
        :style="{ '--node-x': `${node.x}px`, '--node-y': `${node.y}px`, '--node-card-width': `${node.width}px`, '--node-card-height': `${node.height}px` }"
        :data-recipe-target-key="node.targetKey || undefined"
        data-crafting-role="recipe-hierarchy-node"
        @mouseenter="handleNodeHover(node)"
        @mouseleave="handleNodeLeave(node)"
        @focusin="handleNodeHover(node)"
        @focusout="handleNodeLeave(node)"
      >
        <span class="recipe-hierarchy-label">{{ node.relation }}</span>
        <button
          v-if="node.targetKey"
          type="button"
          class="recipe-hierarchy-card"
          :class="{ 'has-stations': visibleStations(node.node).length && !hasRecipeOptionGroups(node.node), 'has-recipe-options': hasRecipeOptionGroups(node.node) }"
          @click="handleNodeSelect(node)"
        >
          <span class="recipe-hierarchy-main" :title="node.title">
            <span
              v-if="recipeOptionGroups(node.node).length"
              class="recipe-hierarchy-option-source"
              :title="node.title"
              aria-label="多配方来源"
            >
              <span class="recipe-hierarchy-option-groups">
                <span
                  v-for="(option, optionIndex) in recipeOptionGroups(node.node)"
                  :key="`option-${optionIndex}`"
                  class="recipe-hierarchy-option-row"
                  :title="option.map(nodeTitle).join(' + ')"
                >
                  <span
                    v-for="material in option"
                    :key="displayText(material.recipeId, material.itemId, material.itemInternalName, material.displayName, material.name)"
                    class="recipe-hierarchy-option-material"
                  >
                    <CommonPreviewImage
                      :src="nodeImage(material)"
                      :alt="nodeTitle(material)"
                      :fallback="firstGlyph(nodeTitle(material))"
                      fallback-icon="icon-items"
                      width="18"
                      height="18"
                    />
                    <span class="recipe-hierarchy-option-quantity">{{ nodeQuantity(material) }}</span>
                  </span>
                </span>
              </span>
            </span>
            <span
              v-else-if="groupMembers(node.node).length > 1"
              class="recipe-hierarchy-alt-images"
              :title="groupMemberSummary(node.node)"
              aria-label="可替代材料"
            >
              <CommonPreviewImage
                v-for="member in visibleGroupMembers(node.node)"
                :key="displayText(member.itemId, member.internalName, memberTitle(member))"
                :src="memberImage(member)"
                :alt="memberTitle(member)"
                :fallback="firstGlyph(memberTitle(member))"
                fallback-icon="icon-items"
              width="22"
              height="22"
            />
          </span>
            <template v-else>
              <CommonPreviewImage :src="node.image" :alt="node.title" :fallback="firstGlyph(node.title)" fallback-icon="icon-items" width="30" height="30" />
              <span class="recipe-hierarchy-quantity">{{ node.quantity }}</span>
            </template>
          </span>
          <span v-if="visibleStations(node.node).length && !hasRecipeOptionGroups(node.node)" class="recipe-hierarchy-station-rail" :title="stationSummary(node.node)" aria-label="制作站">
            <span
              v-for="(station, index) in visibleStations(node.node)"
              :key="stationKey(station, index)"
              class="recipe-hierarchy-station-badge"
            >
            <CommonPreviewImage
              :src="stationImage(station)"
              :alt="stationTitle(station)"
              :fallback="firstGlyph(stationTitle(station))"
              fallback-icon="icon-crafting"
              width="18"
              height="18"
            />
            </span>
          </span>
        </button>
        <aside class="recipe-hierarchy-popover" role="tooltip">
          <span class="recipe-hierarchy-popover-head">
            <span class="recipe-hierarchy-popover-images">
              <CommonPreviewImage
                v-for="image in popoverImages(node.node)"
                :key="image.key || image.title"
                :src="image.image"
                :alt="image.title"
                :fallback="firstGlyph(image.title)"
                fallback-icon="icon-items"
                width="26"
                height="26"
              />
            </span>
            <span class="recipe-hierarchy-popover-title">
              <b>{{ node.title }}</b>
              <span v-if="node.subtitle">{{ node.subtitle }}</span>
            </span>
          </span>
          <dl>
            <template v-for="row in node.detailRows" :key="`${row.label}-${row.value}`">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </aside>
      </article>
    </div>
  </div>
  <p v-else class="recipe-route-empty-state">暂无合成树。</p>
</template>
