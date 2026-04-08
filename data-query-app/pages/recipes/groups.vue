<template>
  <div class="page-wrap recipe-groups-page">
    <section class="workspace-shell workspace-shell--unified recipe-groups-hero page-workspace">
      <div class="workspace-hero workspace-hero--unified">
        <div class="workspace-hero__copy">
          <p class="eyebrow">RECIPE GROUPS</p>
          <h1 class="page-head__title">任意物品组管理</h1>
          <p class="page-head__subtitle">维护 Any Iron Bar、Any Wood 这类配方组，成员选择后会自动补齐图片和中英文名。</p>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="reloadGroups">刷新</button>
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="createNewGroup">新建组</button>
          <button type="button" class="btn btn-strong toolbar-top__primary" :disabled="saving || !isDirty || !draft" @click="saveGroup">
            {{ saving ? '保存中...' : '保存组配置' }}
          </button>
        </div>
      </div>
      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch" aria-label="配方模块视图切换">
          <NuxtLink to="/recipes" class="view-switch__link">配方编辑</NuxtLink>
          <NuxtLink to="/recipes/tree" class="view-switch__link">合成路径</NuxtLink>
          <NuxtLink to="/recipes/stations" class="view-switch__link">制作站管理</NuxtLink>
          <NuxtLink to="/recipes/groups" class="view-switch__link view-switch__link--active">任意物品组</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="layout">
      <aside class="side">
        <section class="section-card workspace-panel workspace-panel--side side-panel">
          <label class="field">
            <span class="field__label">搜索组</span>
            <input
              v-model.trim="keyword"
              type="text"
              class="input"
              placeholder="输入 canonical / 中英文名"
              @input="debouncedReload"
            >
          </label>

          <div class="side-panel__summary">
            <span class="badge">{{ groups.length }} 个结果</span>
            <span class="side-panel__hint">点击左侧即可直接进入编辑</span>
          </div>

          <div class="group-list">
            <article
              v-for="group in groups"
              :key="group.canonicalName"
              class="group-list__item"
              :class="{ 'group-list__item--active': activeGroup?.canonicalName === group.canonicalName }"
              role="button"
              tabindex="0"
              :aria-pressed="activeGroup?.canonicalName === group.canonicalName"
              @click="selectGroup(group.canonicalName)"
              @keydown.enter.prevent="selectGroup(group.canonicalName)"
              @keydown.space.prevent="selectGroup(group.canonicalName)"
            >
              <div class="group-list__top">
                <div>
                  <strong>{{ group.displayNameZh || group.displayNameEn || group.canonicalName }}</strong>
                  <small>{{ group.displayNameEn || group.canonicalName }}</small>
                </div>
                <span class="badge badge--soft">{{ group.members.length }} 成员</span>
              </div>

              <div v-if="group.members.length" class="group-list__members">
                <button
                  v-for="member in group.members.slice(0, 3)"
                  :key="member.internalName || member.nameZh || member.name"
                  class="group-list__member"
                  type="button"
                  :disabled="!member.itemId"
                  @click.stop="openMemberItem(member)"
                >
                  <img v-if="member.imageUrl" :src="member.imageUrl" alt="" class="group-list__member-image">
                  <div v-else class="group-list__member-fallback">{{ getMemberAvatar(member) }}</div>
                  <span>{{ member.nameZh || member.name || member.internalName }}</span>
                </button>
              </div>
            </article>

            <p v-if="!loading && !groups.length" class="empty-copy">当前没有匹配的任意物品组。</p>
          </div>
        </section>
      </aside>

      <section class="main">
        <section class="section-card workspace-panel workspace-panel--main editor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">{{ isCreating ? '新建任意物品组' : '组编辑器' }}</h2>
              <p class="section-card__subtitle">默认自动选中第一组。成员区放在上方，添加后立刻进入卡片列表，减少来回滚动。</p>
            </div>
            <button
              v-if="activeGroup && !isCreating"
              type="button"
              class="btn btn-danger"
              :disabled="saving"
              @click="removeGroup"
            >
              删除组
            </button>
          </div>

          <div v-if="draft" class="group-editor">
            <section class="group-summary">
              <article class="summary-tile">
                <span>Canonical</span>
                <strong>{{ draft.canonicalName || '未填写' }}</strong>
              </article>
              <article class="summary-tile">
                <span>显示名</span>
                <strong>{{ draft.displayNameZh || draft.displayNameEn || '未填写' }}</strong>
              </article>
              <article class="summary-tile">
                <span>成员数</span>
                <strong>{{ draft.members.length }}</strong>
              </article>
              <article class="summary-tile" :class="{ 'summary-tile--warn': isDirty }">
                <span>状态</span>
                <strong>{{ isDirty ? '未保存' : '已同步' }}</strong>
              </article>
            </section>

            <section class="group-editor__meta">
              <label class="field">
                <span class="field__label">Canonical Name</span>
                <input
                  v-model.trim="draft.canonicalName"
                  type="text"
                  class="input"
                  :disabled="!isCreating"
                  placeholder="例如 Any Iron Bar"
                >
              </label>
              <label class="field">
                <span class="field__label">英文展示名</span>
                <input
                  v-model.trim="draft.displayNameEn"
                  type="text"
                  class="input"
                  placeholder="例如 Any Iron Bar"
                >
              </label>
              <label class="field">
                <span class="field__label">中文展示名</span>
                <input
                  v-model.trim="draft.displayNameZh"
                  type="text"
                  class="input"
                  placeholder="例如 任意铁锭"
                >
              </label>
            </section>

            <section class="member-panel">
              <div class="member-panel__head">
                <div>
                  <h3>成员管理</h3>
                  <p>搜索后点选即可加入，图片与名称会自动补齐；同一成员不会重复添加。</p>
                </div>
                <span class="badge">{{ draft.members.length }} 个成员</span>
              </div>

              <div class="member-toolbar">
                <div class="member-toolbar__lookup">
                  <AdminItemLookupInput
                    v-model="memberLookup"
                    placeholder="搜索中英文名或 internalName 后点选"
                    @pick="handlePickMember"
                  />
                </div>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="!draft.members.length" @click="sortMembers">
                  按名称排序
                </button>
              </div>

              <div v-if="draft.members.length" class="member-grid">
                <article
                  v-for="(member, index) in draft.members"
                  :key="`${member.internalName || member.nameZh || member.name || index}-${index}`"
                  class="member-card"
                  :class="{ 'member-card--interactive': !!member.itemId }"
                  @click="openMemberItem(member)"
                >
                  <img v-if="member.imageUrl" :src="member.imageUrl" alt="" class="member-card__image">
                  <div v-else class="member-card__fallback">{{ getMemberAvatar(member) }}</div>
                  <div class="member-card__copy">
                    <strong>{{ member.nameZh || member.name || member.internalName }}</strong>
                    <small v-if="member.name && member.name !== member.nameZh">{{ member.name }}</small>
                    <small v-if="member.internalName">{{ member.internalName }}</small>
                  </div>
                  <button type="button" class="member-card__remove" @click.stop="removeMember(index)">移除</button>
                </article>
              </div>
              <div v-else class="member-empty">
                <div class="member-empty__icon">IT</div>
                <div>
                  <strong>还没有成员</strong>
                  <p>在上方搜索并点击物品后，它会立刻加入当前组。</p>
                </div>
              </div>
            </section>
          </div>

          <AppEmptyState
            v-else
            icon="GR"
            title="先选择一个任意物品组"
            description="左侧会自动加载分组；点击任意一组，右侧立刻进入可编辑状态。"
          />
        </section>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import AdminItemLookupInput from '~/components/AdminItemLookupInput.vue'
import { showToast } from '~/composables/useToast'
import type { RecipeGroup, RecipeGroupMember } from '~/stores/items'

definePageMeta({ title: '任意物品组管理', navSection: '/recipes', headerVariant: 'compact' })

type SuggestionItem = { id: number; name: string; nameZh?: string; internalName?: string; image?: string }

const itemsStore = useItemsStore()
const router = useRouter()

const keyword = ref('')
const memberLookup = ref('')
const groups = ref<RecipeGroup[]>([])
const activeGroup = ref<RecipeGroup | null>(null)
const draft = ref<RecipeGroup | null>(null)
const loading = ref(false)
const saving = ref(false)
const isCreating = ref(false)

let reloadTimer: ReturnType<typeof setTimeout> | null = null

const isDirty = computed(() => JSON.stringify(draft.value || null) !== JSON.stringify(activeGroup.value || null))

function cloneGroup(group: RecipeGroup | null): RecipeGroup | null {
  if (!group) return null
  return {
    canonicalName: group.canonicalName,
    displayNameEn: group.displayNameEn || '',
    displayNameZh: group.displayNameZh || '',
    members: (group.members || []).map((member) => ({ ...member })),
  }
}

async function reloadGroups() {
  loading.value = true
  try {
    const nextGroups = await itemsStore.fetchRecipeGroups(keyword.value)
    groups.value = nextGroups

    if (isCreating.value) {
      return
    }

    if (activeGroup.value?.canonicalName) {
      const refreshed = nextGroups.find((group) => group.canonicalName === activeGroup.value?.canonicalName) || null
      if (refreshed) {
        activeGroup.value = refreshed
        if (!isDirty.value) {
          draft.value = cloneGroup(refreshed)
        }
        return
      }
    }

    const firstGroup = nextGroups[0]
    if (!draft.value && firstGroup) {
      await selectGroup(firstGroup.canonicalName, true)
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
  const detail = await itemsStore.fetchRecipeGroupDetail(canonicalName)
  activeGroup.value = detail
  draft.value = cloneGroup(detail)
  isCreating.value = false
}

function createNewGroup() {
  if (isDirty.value && !window.confirm('当前组有未保存修改，确认新建吗？')) return
  activeGroup.value = null
  draft.value = {
    canonicalName: '',
    displayNameEn: '',
    displayNameZh: '',
    members: [],
  }
  isCreating.value = true
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
  draft.value.members.sort((left, right) => {
    const leftLabel = left.nameZh || left.name || left.internalName || ''
    const rightLabel = right.nameZh || right.name || right.internalName || ''
    return leftLabel.localeCompare(rightLabel)
  })
}

async function saveGroup() {
  if (!draft.value) return
  if (!draft.value.canonicalName.trim()) {
    showToast('Canonical Name 不能为空', 'error')
    return
  }
  if (!draft.value.members.length) {
    showToast('至少添加一个成员', 'error')
    return
  }

  saving.value = true
  try {
    const payload = cloneGroup(draft.value)!
    const result = isCreating.value
      ? await itemsStore.createRecipeGroup(payload)
      : await itemsStore.updateRecipeGroup(activeGroup.value!.canonicalName, payload)
    if (!result) return
    activeGroup.value = result
    draft.value = cloneGroup(result)
    isCreating.value = false
    await reloadGroups()
  } finally {
    saving.value = false
  }
}

async function removeGroup() {
  if (!activeGroup.value) return
  if (!window.confirm(`确认删除 ${activeGroup.value.canonicalName} 吗？`)) return
  saving.value = true
  try {
    const ok = await itemsStore.deleteRecipeGroup(activeGroup.value.canonicalName)
    if (!ok) return
    activeGroup.value = null
    draft.value = null
    isCreating.value = false
    await reloadGroups()
  } finally {
    saving.value = false
  }
}

function getMemberAvatar(member: RecipeGroupMember) {
  const label = (member.nameZh || member.name || member.internalName || '').trim()
  return label ? label.slice(0, 2).toUpperCase() : 'IT'
}

async function openMemberItem(member: RecipeGroupMember) {
  if (!member.itemId) return
  await router.push({
    path: '/items',
    query: {
      itemId: String(member.itemId),
      view: 'detail',
    },
  })
}

onMounted(async () => {
  await reloadGroups()
})
</script>

<style scoped>
.recipe-groups-page .layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.side-panel {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 14px;
}

.side-panel__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.side-panel__hint {
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

.group-list__item {
  display: grid;
  gap: 10px;
  padding: 14px 15px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  text-align: left;
  cursor: pointer;
  transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.group-list__item:hover {
  transform: translateY(-1px);
}

.group-list__item--active {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.group-list__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.group-list__top strong {
  color: var(--color-text-primary);
  display: block;
}

.group-list__top small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.group-list__members {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-list__member {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease;
}

.group-list__member:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--color-primary) 36%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg));
  color: var(--color-text-primary);
}

.group-list__member:disabled {
  cursor: default;
}

.group-list__member-image,
.group-list__member-fallback {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  object-fit: contain;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  font-size: 10px;
  font-weight: 700;
}

.editor-panel {
  min-height: 0;
}

.group-editor {
  display: grid;
  gap: 18px;
}

.group-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-tile {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
}

.summary-tile span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.summary-tile strong {
  color: var(--color-text-primary);
  font-size: 15px;
}

.summary-tile--warn {
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 45%, var(--color-border));
}

.group-editor__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.member-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
}

.member-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.member-panel__head h3 {
  color: var(--color-text-primary);
}

.member-panel__head p {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.member-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.member-toolbar__lookup {
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

.member-card--interactive {
  cursor: pointer;
  transition: border-color .18s ease, transform .18s ease, background-color .18s ease;
}

.member-card--interactive:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg));
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
  display: grid;
  gap: 3px;
  min-width: 0;
}

.member-card__copy strong {
  color: var(--color-text-primary);
}

.member-card__copy small {
  color: var(--color-text-secondary);
  font-size: 12px;
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
}

.member-empty {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 18px;
  border-radius: 18px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 82%, transparent);
  background: color-mix(in srgb, var(--color-bg) 84%, transparent);
}

.member-empty__icon {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  color: var(--color-text-secondary);
  font-weight: 800;
}

.member-empty strong {
  color: var(--color-text-primary);
}

.member-empty p,
.empty-copy {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.badge--soft {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

@media (max-width: 1180px) {
  .recipe-groups-page .layout {
    grid-template-columns: 1fr;
  }

  .side-panel {
    position: static;
  }

  .group-list {
    max-height: none;
  }

  .group-summary,
  .group-editor__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .member-toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .group-summary,
  .group-editor__meta,
  .member-grid {
    grid-template-columns: 1fr;
  }
}
</style>
