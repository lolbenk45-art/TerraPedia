<template>
  <div class="page-wrap item-groups-page">
    <section class="workspace-shell workspace-shell--unified page-workspace">
      <div class="workspace-hero workspace-hero--unified item-groups-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">SOURCE-BACKED GROUPS</p>
          <h1 class="page-head__title">任意物品组管理</h1>
          <p class="page-head__subtitle">统一维护 Any 类物品集合，记录来源、适用域和成员，配方、NPC 商店和关系链都从这里读取可追溯数据。</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="reloadGroups">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="createNewGroup">新建组</button>
          <button type="button" class="btn btn-strong toolbar-top__primary" :disabled="saving || !draft || !isDirty" @click="saveGroup">
            {{ saving ? '保存中...' : '保存来源组' }}
          </button>
        </div>
      </div>

      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch" aria-label="任意物品组作用域">
          <button
            v-for="option in domainOptions"
            :key="option.value"
            type="button"
            class="view-switch__link"
            :class="{ 'view-switch__link--active': activeDomain === option.value }"
            @click="setDomain(option.value)"
          >
            {{ option.label }}
          </button>
        </nav>
      </div>
    </section>

    <section class="item-groups-layout">
      <aside class="item-groups-side">
        <section class="section-card workspace-panel workspace-panel--side side-panel">
          <label class="field">
            <span class="field__label">搜索组</span>
            <input
              v-model.trim="keyword"
              type="text"
              class="input"
              placeholder="canonical / 中文名 / alias"
              @input="debouncedReload"
            >
          </label>

          <div class="side-panel__summary">
            <span class="badge">{{ groups.length }} 个结果</span>
            <span class="side-panel__hint">当前域：{{ activeDomainLabel }}</span>
          </div>

          <div class="group-list">
            <article
              v-for="group in groups"
              :key="group.canonicalName"
              class="group-row"
              :class="{ 'group-row--active': activeGroup?.canonicalName === group.canonicalName }"
              role="button"
              tabindex="0"
              :aria-pressed="activeGroup?.canonicalName === group.canonicalName"
              @click="selectGroup(group.canonicalName)"
              @keydown.enter.prevent="selectGroup(group.canonicalName)"
              @keydown.space.prevent="selectGroup(group.canonicalName)"
            >
              <div class="group-row__top">
                <div>
                  <strong>{{ getGroupLabel(group) }}</strong>
                  <small>{{ group.displayNameEn || group.canonicalName }}</small>
                </div>
                <span class="badge badge--soft">{{ group.members.length }}</span>
              </div>
              <div class="group-row__meta">
                <span v-for="domain in group.domains" :key="domain" class="pill">{{ domain }}</span>
                <span class="pill" :class="{ 'pill--warn': !hasTraceableSource(group) }">{{ getSourceStatus(group) }}</span>
              </div>
            </article>

            <p v-if="!loading && !groups.length" class="empty-copy">当前没有匹配的任意物品组。</p>
          </div>
        </section>
      </aside>

      <section class="item-groups-main">
        <section class="section-card workspace-panel workspace-panel--main editor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">{{ isCreating ? '新建来源组' : '来源组编辑器' }}</h2>
              <p class="section-card__subtitle">保存前必须填写来源提供方，并至少提供来源页、来源 URL 或来源文件之一。</p>
            </div>
            <button v-if="activeGroup && canDeleteActiveGroup" type="button" class="btn btn-danger" :disabled="saving" @click="removeGroup">
              删除本地覆盖
            </button>
          </div>

          <div v-if="draft" class="group-editor">
            <section class="summary-strip">
              <article class="summary-tile">
                <span>Canonical</span>
                <strong>{{ draft.canonicalName || '未填写' }}</strong>
              </article>
              <article class="summary-tile">
                <span>来源</span>
                <strong>{{ draft.sourceProvider || '未填写' }}</strong>
              </article>
              <article class="summary-tile">
                <span>作用域</span>
                <strong>{{ draft.domains.length }}</strong>
              </article>
              <article class="summary-tile" :class="{ 'summary-tile--warn': !hasTraceableSource(draft) }">
                <span>状态</span>
                <strong>{{ hasTraceableSource(draft) ? '可追溯' : '缺来源' }}</strong>
              </article>
            </section>

            <section class="form-grid">
              <label class="field">
                <span class="field__label">Canonical Name</span>
                <input v-model.trim="draft.canonicalName" type="text" class="input" :disabled="!isCreating" placeholder="Any Pylon">
              </label>
              <label class="field">
                <span class="field__label">英文显示名</span>
                <input v-model.trim="draft.displayNameEn" type="text" class="input" placeholder="Any Pylon">
              </label>
              <label class="field">
                <span class="field__label">中文显示名</span>
                <input v-model.trim="draft.displayNameZh" type="text" class="input" placeholder="任意晶塔">
              </label>
              <label class="field">
                <span class="field__label">作用域 domains</span>
                <input v-model.trim="domainText" type="text" class="input" placeholder="recipe, npc_shop, shimmer" @change="syncDomainsFromText">
              </label>
              <label class="field">
                <span class="field__label">别名 aliases</span>
                <input v-model.trim="aliasText" type="text" class="input" placeholder="Any Teleportation Pylon, 任意晶塔" @change="syncAliasesFromText">
              </label>
              <label class="field">
                <span class="field__label">来源类型</span>
                <input v-model.trim="draft.sourceKind" type="text" class="input" placeholder="manual_wiki_source">
              </label>
            </section>

            <section class="source-panel">
              <div class="source-panel__head">
                <div>
                  <h3>来源追溯</h3>
                  <p>这里决定数据能不能进入后续配方、NPC 商店和关系链消费层。</p>
                </div>
                <span class="badge" :class="{ 'badge--warn': !hasTraceableSource(draft) }">{{ getSourceStatus(draft) }}</span>
              </div>
              <div class="form-grid form-grid--source">
                <label class="field">
                  <span class="field__label">sourceProvider</span>
                  <input v-model.trim="draft.sourceProvider" type="text" class="input" placeholder="wiki_gg">
                </label>
                <label class="field">
                  <span class="field__label">sourcePage</span>
                  <input v-model.trim="draft.sourcePage" type="text" class="input" placeholder="https://terraria.wiki.gg/wiki/Pylons">
                </label>
                <label class="field">
                  <span class="field__label">sourceRevisionTimestamp</span>
                  <input v-model.trim="draft.sourceRevisionTimestamp" type="text" class="input" placeholder="wiki revision timestamp">
                </label>
                <label class="field">
                  <span class="field__label">sourceLabel</span>
                  <input v-model.trim="draft.sourceLabel" type="text" class="input" placeholder="Pylon group validated from wiki.gg">
                </label>
                <label class="field">
                  <span class="field__label">sourceFile</span>
                  <input v-model.trim="draft.sourceFile" type="text" class="input" placeholder="data/generated/item-group-overrides.json">
                </label>
                <label class="field">
                  <span class="field__label">sourceUrls</span>
                  <textarea v-model.trim="sourceUrlsText" class="input textarea" rows="3" placeholder="每行一个来源 URL" @change="syncSourceUrlsFromText" />
                </label>
              </div>
            </section>

            <section class="member-panel">
              <div class="member-panel__head">
                <div>
                  <h3>成员物品</h3>
                  <p>成员必须解析到真实物品。Any Pylon 这类组保留为组，不创建假物品。</p>
                </div>
                <span class="badge">{{ draft.members.length }} 个成员</span>
              </div>

              <div class="member-toolbar">
                <AdminItemLookupInput
                  v-model="memberLookup"
                  placeholder="搜索物品后加入成员"
                  @pick="handlePickMember"
                />
                <button type="button" class="btn btn-secondary btn-sm" :disabled="!draft.members.length" @click="sortMembers">排序</button>
              </div>

              <div v-if="draft.members.length" class="member-grid">
                <article v-for="(member, index) in draft.members" :key="`${member.internalName || member.name || index}-${index}`" class="member-card">
                  <img v-if="member.imageUrl || member.image" :src="member.imageUrl || member.image" alt="" class="member-card__image">
                  <div v-else class="member-card__fallback">{{ getMemberAvatar(member) }}</div>
                  <div class="member-card__copy">
                    <strong>{{ member.nameZh || member.name || member.internalName }}</strong>
                    <small v-if="member.name && member.name !== member.nameZh">{{ member.name }}</small>
                    <small v-if="member.internalName">{{ member.internalName }}</small>
                  </div>
                  <button type="button" class="member-card__remove" @click="removeMember(index)">移除</button>
                </article>
              </div>
              <AppEmptyState
                v-else
                icon="IT"
                title="还没有成员"
                description="从上方搜索真实物品并加入当前组。"
              />
            </section>
          </div>

          <AppEmptyState
            v-else
            icon="GR"
            title="选择或新建一个任意物品组"
            description="左侧列表来自统一 item-groups 接口，包含配方旧组和中心来源组。"
          />
        </section>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import AdminItemLookupInput from '~/components/AdminItemLookupInput.vue'
import { showToast } from '~/composables/useToast'
import type { ItemGroup, ItemGroupMember } from '~/stores/itemGroups'

definePageMeta({ title: '任意物品组管理', navSection: '/item-groups', headerVariant: 'compact' })

type SuggestionItem = { id: number; name: string; nameZh?: string; internalName?: string; image?: string }

const route = useRoute()
const router = useRouter()
const itemGroupsStore = useItemGroupsStore()

const domainOptions = [
  { value: 'all', label: '全部' },
  { value: 'recipe', label: '配方' },
  { value: 'npc_shop', label: 'NPC 商店' },
  { value: 'loot', label: '掉落' },
  { value: 'shimmer', label: 'Shimmer' },
]

const keyword = ref('')
const activeDomain = ref(resolveInitialDomain())
const groups = ref<ItemGroup[]>([])
const activeGroup = ref<ItemGroup | null>(null)
const draft = ref<ItemGroup | null>(null)
const memberLookup = ref('')
const loading = ref(false)
const saving = ref(false)
const isCreating = ref(false)
const domainText = ref('')
const aliasText = ref('')
const sourceUrlsText = ref('')

let reloadTimer: ReturnType<typeof setTimeout> | null = null

const isDirty = computed(() => JSON.stringify(draft.value || null) !== JSON.stringify(activeGroup.value || null))
const canDeleteActiveGroup = computed(() => activeGroup.value?.sourceFile === 'data/generated/item-group-overrides.json')
const activeDomainLabel = computed(() => domainOptions.find((option) => option.value === activeDomain.value)?.label || activeDomain.value)
const summaryCards = computed(() => [
  { label: 'GROUPS', value: String(groups.value.length) },
  { label: 'DOMAIN', value: activeDomainLabel.value },
  { label: 'SOURCE GAPS', value: String(groups.value.filter((group) => !hasTraceableSource(group)).length) },
  { label: 'MEMBERS', value: String(groups.value.reduce((sum, group) => sum + group.members.length, 0)) },
])

function resolveInitialDomain() {
  const raw = Array.isArray(route.query.domain) ? route.query.domain[0] : route.query.domain
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'all'
}

function cloneGroup(group: ItemGroup | null): ItemGroup | null {
  if (!group) return null
  return {
    canonicalName: group.canonicalName || '',
    displayNameEn: group.displayNameEn || '',
    displayNameZh: group.displayNameZh || '',
    aliases: [...(group.aliases || [])],
    domains: [...(group.domains || [])],
    sourceKind: group.sourceKind || 'manual_wiki_source',
    sourceProvider: group.sourceProvider || '',
    sourcePage: group.sourcePage || '',
    sourceRevisionTimestamp: group.sourceRevisionTimestamp || '',
    sourceUpdatedAt: group.sourceUpdatedAt || '',
    sourceLabel: group.sourceLabel || '',
    sourceFile: group.sourceFile || '',
    sourceUrls: [...(group.sourceUrls || [])],
    manualOnly: Boolean(group.manualOnly),
    members: (group.members || []).map((member) => ({ ...member })),
  }
}

function syncTextFieldsFromDraft() {
  domainText.value = draft.value?.domains.join(', ') || ''
  aliasText.value = draft.value?.aliases.join(', ') || ''
  sourceUrlsText.value = draft.value?.sourceUrls.join('\n') || ''
}

function splitListText(value: string) {
  return Array.from(new Set(value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)))
}

function syncDomainsFromText() {
  if (!draft.value) return
  draft.value.domains = splitListText(domainText.value).map((domain) => domain.toLowerCase().replace(/-/g, '_'))
  if (!draft.value.domains.length) draft.value.domains = ['recipe']
  domainText.value = draft.value.domains.join(', ')
}

function syncAliasesFromText() {
  if (!draft.value) return
  draft.value.aliases = splitListText(aliasText.value)
  aliasText.value = draft.value.aliases.join(', ')
}

function syncSourceUrlsFromText() {
  if (!draft.value) return
  draft.value.sourceUrls = splitListText(sourceUrlsText.value)
  sourceUrlsText.value = draft.value.sourceUrls.join('\n')
}

async function setDomain(domain: string) {
  if (activeDomain.value === domain) return
  activeDomain.value = domain
  await router.replace({ path: '/item-groups', query: domain === 'all' ? {} : { domain } })
  await reloadGroups()
}

async function reloadGroups() {
  loading.value = true
  try {
    const nextGroups = await itemGroupsStore.fetchItemGroups(keyword.value, activeDomain.value)
    groups.value = nextGroups
    if (activeGroup.value?.canonicalName) {
      const refreshed = nextGroups.find((group) => group.canonicalName === activeGroup.value?.canonicalName) || null
      if (refreshed && !isDirty.value) {
        activeGroup.value = refreshed
        draft.value = cloneGroup(refreshed)
        syncTextFieldsFromDraft()
      }
    }
    if (!draft.value && nextGroups[0]) {
      await selectGroup(nextGroups[0].canonicalName, true)
    }
  } finally {
    loading.value = false
  }
}

function debouncedReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    void reloadGroups()
  }, 180)
}

async function selectGroup(canonicalName: string, force = false) {
  if (!force && isDirty.value && !window.confirm('当前组有未保存修改，确认切换吗？')) return
  const detail = await itemGroupsStore.fetchItemGroupDetail(canonicalName)
  activeGroup.value = detail
  draft.value = cloneGroup(detail)
  isCreating.value = false
  syncTextFieldsFromDraft()
}

function createNewGroup() {
  if (isDirty.value && !window.confirm('当前组有未保存修改，确认新建吗？')) return
  activeGroup.value = null
  draft.value = {
    canonicalName: '',
    displayNameEn: '',
    displayNameZh: '',
    aliases: [],
    domains: activeDomain.value === 'all' ? ['recipe'] : [activeDomain.value],
    sourceKind: 'manual_wiki_source',
    sourceProvider: 'wiki_gg',
    sourcePage: '',
    sourceRevisionTimestamp: '',
    sourceUpdatedAt: '',
    sourceLabel: '',
    sourceFile: '',
    sourceUrls: [],
    manualOnly: true,
    members: [],
  }
  isCreating.value = true
  syncTextFieldsFromDraft()
}

function handlePickMember(item: SuggestionItem) {
  if (!draft.value) return
  const key = item.internalName || item.name || item.nameZh || ''
  const exists = draft.value.members.some((member) => (member.internalName || member.name || member.nameZh || '') === key)
  if (exists) {
    showToast('该成员已存在', 'warning')
    return
  }
  draft.value.members.push({
    itemId: item.id,
    internalName: item.internalName,
    name: item.name,
    nameZh: item.nameZh,
    image: item.image,
    imageUrl: item.image,
  })
  memberLookup.value = ''
}

function removeMember(index: number) {
  draft.value?.members.splice(index, 1)
}

function sortMembers() {
  if (!draft.value) return
  draft.value.members.sort((left, right) => getMemberLabel(left).localeCompare(getMemberLabel(right)))
}

async function saveGroup() {
  if (!draft.value) return
  syncDomainsFromText()
  syncAliasesFromText()
  syncSourceUrlsFromText()
  if (!draft.value.canonicalName.trim()) {
    showToast('Canonical Name 不能为空', 'error')
    return
  }
  if (!draft.value.members.length) {
    showToast('至少添加一个真实物品成员', 'error')
    return
  }
  if (!hasTraceableSource(draft.value)) {
    showToast('缺少来源：必须填写 sourceProvider，并提供 sourcePage、sourceUrls 或 sourceFile', 'error')
    return
  }

  saving.value = true
  try {
    const payload = cloneGroup(draft.value)!
    const result = isCreating.value
      ? await itemGroupsStore.createItemGroup(payload)
      : await itemGroupsStore.updateItemGroup(activeGroup.value!.canonicalName, payload)
    if (!result) return
    activeGroup.value = result
    draft.value = cloneGroup(result)
    isCreating.value = false
    syncTextFieldsFromDraft()
    await reloadGroups()
  } finally {
    saving.value = false
  }
}

async function removeGroup() {
  if (!activeGroup.value) return
  if (!window.confirm(`确认删除 ${activeGroup.value.canonicalName} 的中心覆盖记录吗？`)) return
  saving.value = true
  try {
    const ok = await itemGroupsStore.deleteItemGroup(activeGroup.value.canonicalName)
    if (!ok) return
    activeGroup.value = null
    draft.value = null
    isCreating.value = false
    await reloadGroups()
  } finally {
    saving.value = false
  }
}

function getGroupLabel(group: ItemGroup) {
  return group.displayNameZh || group.displayNameEn || group.canonicalName
}

function getMemberLabel(member: ItemGroupMember) {
  return member.nameZh || member.name || member.internalName || ''
}

function getMemberAvatar(member: ItemGroupMember) {
  const label = getMemberLabel(member).trim()
  return label ? label.slice(0, 2).toUpperCase() : 'IT'
}

function hasTraceableSource(group: ItemGroup | null) {
  if (!group) return false
  return Boolean(
    group.sourceProvider?.trim()
    && (
      group.sourcePage?.trim()
      || group.sourceFile?.trim()
      || (Array.isArray(group.sourceUrls) && group.sourceUrls.some((url) => url.trim()))
    ),
  )
}

function getSourceStatus(group: ItemGroup) {
  if (!hasTraceableSource(group)) return '缺来源'
  if (group.manualOnly) return '本地覆盖'
  return group.sourceKind || '来源数据'
}

watch(
  () => route.query.domain,
  (value) => {
    const next = Array.isArray(value) ? value[0] : value
    const normalized = typeof next === 'string' && next.trim() ? next.trim() : 'all'
    if (normalized !== activeDomain.value) {
      activeDomain.value = normalized
      void reloadGroups()
    }
  },
)

onMounted(async () => {
  await reloadGroups()
})
</script>

<style scoped>
.item-groups-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.side-panel,
.group-editor,
.source-panel,
.member-panel {
  display: grid;
  gap: 14px;
}

.side-panel {
  position: sticky;
  top: 16px;
}

.side-panel__summary,
.group-row__top,
.source-panel__head,
.member-panel__head,
.member-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.side-panel__hint,
.empty-copy {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.group-list {
  display: grid;
  gap: 10px;
  max-height: calc(100vh - 260px);
  overflow: auto;
  padding-right: 4px;
}

.group-row {
  display: grid;
  gap: 10px;
  padding: 14px 15px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  cursor: pointer;
  transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.group-row:hover {
  transform: translateY(-1px);
}

.group-row--active {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.group-row strong,
.summary-tile strong,
.source-panel h3,
.member-panel h3,
.member-card__copy strong {
  color: var(--color-text-primary);
}

.group-row small,
.source-panel p,
.member-panel p,
.member-card__copy small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.group-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  color: var(--color-text-secondary);
  font-size: 12px;
  border: 1px solid var(--color-border);
}

.pill--warn,
.badge--warn {
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 45%, var(--color-border));
  color: var(--color-warning, #b45309);
}

.badge--soft {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-tile {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
}

.summary-tile span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.summary-tile--warn {
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 45%, var(--color-border));
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.form-grid--source {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.source-panel,
.member-panel {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
}

.textarea {
  min-height: 92px;
  resize: vertical;
}

.member-toolbar {
  align-items: center;
}

.member-toolbar :deep(.lookup) {
  flex: 1;
  min-width: 0;
}

.member-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.member-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
}

.member-card__image,
.member-card__fallback {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  object-fit: contain;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  font-weight: 800;
  color: var(--color-text-secondary);
}

.member-card__copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.member-card__copy small {
  word-break: break-all;
}

.member-card__remove {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 1180px) {
  .item-groups-layout {
    grid-template-columns: 1fr;
  }

  .side-panel {
    position: static;
  }

  .group-list {
    max-height: none;
  }

  .summary-strip,
  .form-grid,
  .form-grid--source {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .summary-strip,
  .form-grid,
  .form-grid--source,
  .member-grid {
    grid-template-columns: 1fr;
  }

  .member-toolbar {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
