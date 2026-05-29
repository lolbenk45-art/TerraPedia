<script setup lang="ts">
import type {
  PublicItemRecipeTreeGroupMember,
  PublicItemRecipeTreeNode,
  PublicItemRecipeTreeStation,
} from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

const props = defineProps<{
  root: PublicItemRecipeTreeNode | null
  hoveredTargetKey?: string
  activeTargetKey?: string
}>()

const emit = defineEmits<{
  hoverTarget: [key: string]
}>()

type RouteItem = {
  key: string
  sourceKey: string
  title: string
  subtitle: string
  quantity: string
  image: string
  fallback: string
  fallbackIcon: string
  href: string
  members: RouteItem[]
}

type RouteStation = {
  key: string
  title: string
  image: string
  fallback: string
  href: string
  isCondition: boolean
}

type RouteChoiceOption = {
  key: string
  label: string
  items: RouteItem[]
}

type RouteChoiceGroup = {
  key: string
  label: string
  options: RouteChoiceOption[]
}

type RouteEntry = {
  key: string
  targetKey: string
  level: number
  label: string
  parentTitle: string
  output: RouteItem
  materials: RouteItem[]
  sharedMaterials: RouteItem[]
  choiceGroups: RouteChoiceGroup[]
  stations: RouteStation[]
  conditions: RouteStation[]
  optionCount: number
}

const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const normalizeKey = (...values: unknown[]) => displayText(...values).replace(/\s+/g, '-').toLowerCase()
const truthyFlag = (value: unknown) => value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'
const recipeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []
const recipeNodeStations = (node: PublicItemRecipeTreeNode) => Array.isArray(node.stations) ? node.stations : []

const nodeTitle = (node: PublicItemRecipeTreeNode) => displayText(
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.name,
  node.itemInternalName,
  '配方节点',
)

const nodeSubtitle = (node: PublicItemRecipeTreeNode, fallback = '') => displayText(
  node.itemInternalName,
  node.itemName,
  fallback,
)

const nodeImage = (node: PublicItemRecipeTreeNode) => resolvePreviewImageUrl(
  node.itemImage || node.itemImageUrl || node.image || node.previewImage || '',
)

const nodeHref = (node: PublicItemRecipeTreeNode) => {
  const itemId = displayText(node.itemId, node.id)
  return itemId ? `/items/${itemId}` : ''
}

const nodeQuantity = (node: PublicItemRecipeTreeNode, isOutput = false) => {
  if (node.quantityText) return `x${String(node.quantityText).replace(/^x/i, '')}`
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) {
    return `x${node.quantityMin}-${node.quantityMax}`
  }

  const directQuantity = displayText(node.quantityMin, node.quantity, node.amount, node.count)
  if (directQuantity) return `x${directQuantity.replace(/^x/i, '')}`

  const resultQuantity = Number(node.resultQuantity)
  if (isOutput && Number.isFinite(resultQuantity) && resultQuantity > 0 && resultQuantity <= 99) {
    return `x${resultQuantity}`
  }

  return 'x1'
}

const memberTitle = (member: PublicItemRecipeTreeGroupMember) => displayText(
  member.nameZh,
  member.name,
  member.internalName,
  '可选材料',
)

const memberItem = (member: PublicItemRecipeTreeGroupMember, index: number): RouteItem => {
  const title = memberTitle(member)
  const itemId = displayText(member.itemId)
  const sourceKey = `member:${displayText(member.itemId, member.internalName, title)}`

  return {
    key: normalizeKey(member.itemId, member.internalName, title, index) || `member-${index}`,
    sourceKey,
    title,
    subtitle: displayText(member.internalName),
    quantity: '',
    image: resolvePreviewImageUrl(member.image || member.imageUrl || ''),
    fallback: firstGlyph(title),
    fallbackIcon: 'icon-items',
    href: itemId ? `/items/${itemId}` : '',
    members: [],
  }
}

const itemSourceKey = (node: PublicItemRecipeTreeNode) => {
  const members = Array.isArray(node.groupMembers) ? node.groupMembers : []
  if (members.length > 0) {
    const memberKeys = members
      .map((member) => displayText(member.itemId, member.internalName, member.nameZh, member.name))
      .filter(Boolean)
      .sort()
      .join('|')
    return `group:${memberKeys || normalizeKey(nodeTitle(node))}`
  }

  return `item:${displayText(node.itemId, node.id, node.itemInternalName, node.itemName, nodeTitle(node))}`
}

const recipeTargetKey = (node: PublicItemRecipeTreeNode) => normalizeKey(itemSourceKey(node))

const routeItem = (node: PublicItemRecipeTreeNode, index = 0, isOutput = false): RouteItem => {
  const members = (Array.isArray(node.groupMembers) ? node.groupMembers : []).map(memberItem)
  const title = nodeTitle(node)
  const memberSummary = members.map((member) => member.title).slice(0, 3).join('/')

  return {
    key: normalizeKey(node.recipeId, node.itemId, node.itemInternalName, title, index) || `node-${index}`,
    sourceKey: itemSourceKey(node),
    title,
    subtitle: nodeSubtitle(node, memberSummary),
    quantity: nodeQuantity(node, isOutput),
    image: nodeImage(node) || members[0]?.image || '',
    fallback: firstGlyph(title),
    fallbackIcon: 'icon-items',
    href: nodeHref(node),
    members,
  }
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

const routeStation = (station: PublicItemRecipeTreeStation, index: number): RouteStation => {
  const title = stationTitle(station)
  const itemId = displayText(station.stationItemId)

  return {
    key: normalizeKey(station.stationItemId, station.stationInternalName, title, index) || `station-${index}`,
    title,
    image: resolvePreviewImageUrl(station.stationImage || station.itemImage || station.itemImageUrl || station.image || ''),
    fallback: firstGlyph(title),
    href: itemId ? `/items/${itemId}` : '',
    isCondition: station.stationType === 'condition',
  }
}

const canExpandChildRecipe = (node: PublicItemRecipeTreeNode) => {
  const childHasRecipe = Boolean(recipeNodeChildren(node).length || recipeNodeStations(node).length)
  return childHasRecipe && !truthyFlag(node.cycleDetected) && !truthyFlag(node.isReference)
}

const isRecipeOptionNode = (node: PublicItemRecipeTreeNode) =>
  node.nodeType === 'craft-result' && displayText(node.recipeId) !== ''

const childRecipeOptions = (node: PublicItemRecipeTreeNode) => {
  if (!canExpandChildRecipe(node)) return []

  const children = recipeNodeChildren(node)
  if (children.length > 0 && children.every(isRecipeOptionNode)) {
    return children
  }

  return [node]
}

const recipeKey = (node: PublicItemRecipeTreeNode, level: number) =>
  normalizeKey(node.recipeId, node.itemId, node.itemInternalName, nodeTitle(node), level)

const sharedAndChoiceMaterials = (options: PublicItemRecipeTreeNode[]) => {
  const counts = new Map<string, number>()
  const optionMaterials = options.map((option) => {
    const unique = new Map<string, PublicItemRecipeTreeNode>()
    for (const child of recipeNodeChildren(option)) {
      unique.set(itemSourceKey(child), child)
    }
    for (const key of unique.keys()) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return unique
  })

  const firstMaterials = optionMaterials[0] ?? new Map<string, PublicItemRecipeTreeNode>()
  const sharedMaterials = [...firstMaterials.entries()]
    .filter(([key]) => (counts.get(key) ?? 0) === options.length)
    .map(([, node], index) => routeItem(node, index))
  const choices = optionMaterials.map((materials, optionIndex) => ({
    key: `option-${optionIndex}`,
    label: `路线 ${optionIndex + 1}`,
    items: [...materials.entries()]
      .filter(([key]) => (counts.get(key) ?? 0) < options.length)
      .map(([, node], itemIndex) => routeItem(node, itemIndex)),
  })).filter((option) => option.items.length > 0)

  return { sharedMaterials, choices }
}

const uniqueStations = (options: PublicItemRecipeTreeNode[]) => {
  const stations = new Map<string, RouteStation>()
  for (const option of options) {
    recipeNodeStations(option)
      .filter((station) => station.stationType !== 'condition')
      .map(routeStation)
      .forEach((station) => stations.set(station.title, station))
  }
  return [...stations.values()]
}

const buildNormalEntry = (
  node: PublicItemRecipeTreeNode,
  level: number,
  parentTitle: string,
  index: number,
): RouteEntry => {
  const stationViews = recipeNodeStations(node).map(routeStation)
  const stations = stationViews.filter((station) => !station.isCondition)
  const conditions = stationViews.filter((station) => station.isCondition)
  const recipeId = displayText(node.recipeId)

  return {
    key: `recipe-${recipeKey(node, level)}-${index}`,
    targetKey: recipeTargetKey(node),
    level,
    label: recipeId ? `配方 #${recipeId}` : '配方',
    parentTitle,
    output: routeItem(node, index, true),
    materials: recipeNodeChildren(node).map((child, childIndex) => routeItem(child, childIndex)),
    sharedMaterials: [],
    choiceGroups: [],
    stations,
    conditions,
    optionCount: 1,
  }
}

const buildChoiceEntry = (
  source: PublicItemRecipeTreeNode,
  options: PublicItemRecipeTreeNode[],
  level: number,
  parentTitle: string,
  index: number,
): RouteEntry => {
  const { sharedMaterials, choices } = sharedAndChoiceMaterials(options)

  return {
    key: `choice-${recipeKey(source, level)}-${index}`,
    targetKey: recipeTargetKey(source),
    level,
    label: `${options.length} 条路线 · 任选 1 条`,
    parentTitle,
    output: routeItem(source, index, true),
    materials: [],
    sharedMaterials,
    choiceGroups: choices.length > 0
      ? [{ key: 'choice-materials', label: '可替换材料', options: choices }]
      : [],
    stations: uniqueStations(options),
    conditions: [],
    optionCount: options.length,
  }
}

const collectChildEntries = (
  node: PublicItemRecipeTreeNode,
  level: number,
  parentTitle: string,
  seen: Set<string>,
): RouteEntry[] => {
  if (level > 5) return []

  const entries: RouteEntry[] = []
  for (const [childIndex, child] of recipeNodeChildren(node).entries()) {
    const options = childRecipeOptions(child)
    if (!options.length) continue

    const key = `${level}:${itemSourceKey(child)}:${options.map((option) => displayText(option.recipeId, itemSourceKey(option))).join('|')}`
    if (seen.has(key)) continue
    seen.add(key)

    const entry = options.length > 1
      ? buildChoiceEntry(child, options, level, parentTitle, childIndex)
      : buildNormalEntry(options[0] ?? child, level, parentTitle, childIndex)
    entries.push(entry)

    for (const option of options) {
      entries.push(...collectChildEntries(option, level + 1, entry.output.title, seen))
    }
  }

  return entries
}

const routeEntries = computed(() => {
  if (!props.root) return []
  const rootEntry = buildNormalEntry(props.root, 0, '', 0)
  return [
    rootEntry,
    ...collectChildEntries(props.root, 1, rootEntry.output.title, new Set()),
  ]
})

const graphSummary = computed(() => {
  const materialCount = routeEntries.value.reduce((total, entry) => {
    const choiceMaterialCount = entry.choiceGroups.reduce((choiceTotal, group) =>
      choiceTotal + group.options.reduce((optionTotal, option) => optionTotal + option.items.length, 0), 0)

    return total + entry.materials.length + entry.sharedMaterials.length + choiceMaterialCount
  }, 0)
  const choiceCount = routeEntries.value.reduce((total, entry) => total + entry.choiceGroups.length, 0)
  return `${routeEntries.value.length} 条关系 · ${materialCount} 个材料 · ${choiceCount} 个任选组`
})
const isHoveredEntry = (entry: RouteEntry) => Boolean(entry.targetKey && props.hoveredTargetKey === entry.targetKey)
const isActiveEntry = (entry: RouteEntry) => Boolean(entry.targetKey && props.activeTargetKey === entry.targetKey)
const handleEntryHover = (entry: RouteEntry) => {
  if (!entry.targetKey) return
  emit('hoverTarget', entry.targetKey)
}
const handleEntryLeave = (entry: RouteEntry) => {
  if (!entry.targetKey || props.hoveredTargetKey !== entry.targetKey) return
  emit('hoverTarget', '')
}
</script>

<template>
  <section class="recipe-graph tp-panel" data-crafting-role="recipe-graph" aria-label="合成路线树">
    <header class="recipe-graph-head">
      <div>
        <span class="eyebrow">关系树</span>
        <h2>合成路线</h2>
      </div>
      <small>{{ graphSummary }}</small>
    </header>

    <div v-if="routeEntries.length" class="recipe-route-tree" data-crafting-role="recipe-route-tree">
      <article
        v-for="entry in routeEntries"
        :key="entry.key"
        class="recipe-route-entry"
        :class="{ 'is-linked-hover': isHoveredEntry(entry), 'is-linked-active': isActiveEntry(entry) }"
        :style="{ '--route-level': entry.level }"
        :data-route-level="entry.level"
        :data-recipe-target-key="entry.targetKey"
        @mouseenter="handleEntryHover(entry)"
        @mouseleave="handleEntryLeave(entry)"
        @focusin="handleEntryHover(entry)"
        @focusout="handleEntryLeave(entry)"
      >
        <header class="recipe-route-entry-head">
          <span class="recipe-route-level">{{ entry.level === 0 ? '目标配方' : `第 ${entry.level} 层` }}</span>
          <b>{{ entry.parentTitle ? `${entry.parentTitle} 需要` : entry.output.title }}</b>
          <small>{{ entry.label }}</small>
        </header>

        <div class="recipe-route-row" data-crafting-role="recipe-route-row">
          <section class="recipe-relation-step is-materials" data-crafting-role="recipe-relation-step">
            <span class="recipe-step-label">材料</span>
            <div class="recipe-route-item-list">
              <template v-if="entry.materials.length">
                <component
                  :is="item.href ? 'a' : 'span'"
                  v-for="item in entry.materials"
                  :key="item.key"
                  class="recipe-route-item-chip"
                  :href="item.href || undefined"
                >
                  <CommonPreviewImage
                    :src="item.image"
                    :alt="item.title"
                    :fallback="item.fallback"
                    :fallback-icon="item.fallbackIcon"
                    width="34"
                    height="34"
                  />
                  <span class="recipe-route-item-copy">
                    <b>{{ item.title }}</b>
                    <small>{{ item.quantity }}</small>
                  </span>
                </component>
              </template>

              <div
                v-if="entry.choiceGroups.length"
                class="recipe-choice-stack"
                data-crafting-role="recipe-option-materials"
              >
                <section
                  v-for="group in entry.choiceGroups"
                  :key="group.key"
                  class="recipe-choice-group"
                  data-crafting-role="recipe-choice-group"
                >
                  <span class="recipe-choice-label">{{ group.label }} · 任选 1</span>
                  <div class="recipe-choice-options">
                    <div v-for="option in group.options" :key="option.key" class="recipe-choice-option">
                      <span class="recipe-choice-option-label">{{ option.label }}</span>
                      <component
                        :is="item.href ? 'a' : 'span'"
                        v-for="item in option.items"
                        :key="item.key"
                        class="recipe-route-item-chip is-choice"
                        :href="item.href || undefined"
                      >
                        <CommonPreviewImage
                          :src="item.image"
                          :alt="item.title"
                          :fallback="item.fallback"
                          :fallback-icon="item.fallbackIcon"
                          width="34"
                          height="34"
                        />
                        <span class="recipe-route-item-copy">
                          <b>{{ item.title }}</b>
                          <small>{{ item.quantity }}</small>
                        </span>
                      </component>
                    </div>
                  </div>
                </section>
              </div>

              <div
                v-if="entry.sharedMaterials.length"
                class="recipe-shared-materials"
                data-crafting-role="recipe-shared-materials"
              >
                <span class="recipe-shared-label">共享材料</span>
                <component
                  :is="item.href ? 'a' : 'span'"
                  v-for="item in entry.sharedMaterials"
                  :key="item.key"
                  class="recipe-route-item-chip is-shared"
                  :href="item.href || undefined"
                >
                  <CommonPreviewImage
                    :src="item.image"
                    :alt="item.title"
                    :fallback="item.fallback"
                    :fallback-icon="item.fallbackIcon"
                    width="34"
                    height="34"
                  />
                  <span class="recipe-route-item-copy">
                    <b>{{ item.title }}</b>
                    <small>{{ item.quantity }}</small>
                  </span>
                </component>
              </div>
            </div>
          </section>

          <span class="route-flow-arrow" aria-hidden="true">→</span>

          <section class="recipe-relation-step is-stations" data-crafting-role="recipe-relation-step">
            <span class="recipe-step-label">制作站</span>
            <div class="recipe-route-item-list is-compact">
              <component
                :is="station.href ? 'a' : 'span'"
                v-for="station in entry.stations"
                :key="station.key"
                class="recipe-route-item-chip is-station"
                :href="station.href || undefined"
              >
                <CommonPreviewImage
                  :src="station.image"
                  :alt="station.title"
                  :fallback="station.fallback"
                  fallback-icon="icon-crafting"
                  width="30"
                  height="30"
                />
                <span class="recipe-route-item-copy">
                  <b>{{ station.title }}</b>
                </span>
              </component>
              <span v-if="!entry.stations.length" class="recipe-route-empty">徒手</span>
            </div>
          </section>

          <span class="route-flow-arrow" aria-hidden="true">→</span>

          <section class="recipe-relation-step is-output" data-crafting-role="recipe-relation-step">
            <span class="recipe-step-label">产物</span>
            <component
              :is="entry.output.href ? 'a' : 'span'"
              class="recipe-route-item-chip is-output"
              :href="entry.output.href || undefined"
            >
              <CommonPreviewImage
                :src="entry.output.image"
                :alt="entry.output.title"
                :fallback="entry.output.fallback"
                :fallback-icon="entry.output.fallbackIcon"
                width="42"
                height="42"
              />
              <span class="recipe-route-item-copy">
                <b>{{ entry.output.title }}</b>
                <small>{{ entry.output.quantity }}</small>
              </span>
            </component>
          </section>
        </div>
      </article>
    </div>

    <div v-else class="recipe-route-empty-state">
      <b>暂无可绘制的配方关系</b>
      <span>选择有公开配方的物品后会显示合成路线。</span>
    </div>
  </section>
</template>
