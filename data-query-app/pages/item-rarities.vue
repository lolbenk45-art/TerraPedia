<template>
  <div class="page-wrap page-workspace rarity-page">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified hero-card">
      <div class="workspace-hero__copy">
        <p class="hero-card__eyebrow">RARITY MANAGER</p>
        <h1 class="page-head__title hero-card__title">品质管理</h1>
        <p class="page-head__subtitle hero-card__subtitle">维护物品品质字典，供 `items.rarity_id` 引用，并显示当前被多少物品使用。</p>
      </div>
      <div class="hero-stats rarity-hero__stats workspace-summary-grid">
        <article class="hero-stat">
          <span class="hero-stat__label">总品质</span>
          <strong class="hero-stat__value">{{ filteredRows.length }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">引用物品</span>
          <strong class="hero-stat__value">{{ totalItemCount }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">状态</span>
          <strong class="hero-stat__value">{{ search.trim() ? '筛选中' : '浏览' }}</strong>
        </article>
      </div>
      </div>

      <div class="workspace-controls workspace-controls--integrated">
        <form class="toolbar" @submit.prevent="loadRows">
        <label class="field field--search">
          <span class="field__label">关键词</span>
          <div class="search-wrap">
            <span class="search-wrap__icon">
              <Search :size="16" />
            </span>
            <input v-model.trim="search" class="input input--search" type="text" placeholder="搜索中文名、英文名或 code" />
          </div>
        </label>
        <div class="toolbar__actions">
          <button type="submit" class="btn btn-primary">搜索</button>
          <button type="button" class="btn btn-secondary" @click="resetSearch">重置</button>
          <button type="button" class="btn btn-strong" @click="openCreateDialog">新增品质</button>
        </div>
        </form>
      </div>
    </section>

    <section class="section-card workspace-content table-card">
      <div class="table-card__head">
        <div>
          <h2 class="section-card__title">品质列表</h2>
          <p class="section-card__subtitle">完整对应 wiki 稀有度层级，删除前会校验是否仍被物品引用。</p>
        </div>
        <div class="table-card__summary">
          <span>{{ filteredRows.length }} 条可见</span>
        </div>
      </div>

      <div v-if="loading" class="empty-text">加载中...</div>
      <template v-else>
        <div v-if="filteredRows.length" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>中文名</th>
                <th>英文名</th>
                <th>Code</th>
                <th>排序</th>
                <th>状态</th>
                <th>物品引用数</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.id">
                <td>{{ row.id }}</td>
                <td>
                  <div class="cell-primary">
                    <strong>{{ row.displayNameZh }}</strong>
                    <code class="cell-primary__atomic">{{ row.code }}</code>
                  </div>
                </td>
                <td>{{ row.displayNameEn }}</td>
                <td>{{ row.code }}</td>
                <td>{{ row.sortOrder ?? '--' }}</td>
                <td>
                  <span class="status-chip" :class="row.status === 1 ? 'status-chip--on' : 'status-chip--off'">
                    {{ row.status === 1 ? '启用' : '禁用' }}
                  </span>
                </td>
                <td>{{ row.itemCount ?? 0 }}</td>
                <td>{{ formatDateTime(row.updatedAt) }}</td>
                <td>
                  <div class="row-actions">
                    <button type="button" class="btn-link" @click="openEditDialog(row)">编辑</button>
                    <button type="button" class="btn-link btn-link--danger" @click="handleDelete(row)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppEmptyState
          v-else
          icon="RG"
          :title="search.trim() ? '未找到符合条件的品质' : '当前还没有品质数据'"
          :description="search.trim() ? '可以调整关键词，或直接新增一条品质。' : '新增后可在物品编辑中引用该品质。'"
          :primary-text="search.trim() ? '清空筛选' : '新增品质'"
          :secondary-text="search.trim() ? '新增品质' : ''"
          @primary="search.trim() ? resetSearch() : openCreateDialog()"
          @secondary="openCreateDialog"
        />
      </template>
    </section>

    <AppModal v-model="dialogVisible" :title="isEdit ? '编辑品质' : '新增品质'" width="560px">
      <form class="form-grid" @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field__label">ID<span class="field__required">*</span></span>
          <input v-model.number="form.id" class="input" type="number" :disabled="isEdit" placeholder="例如 0 / 1 / -12" />
        </label>
        <label class="field">
          <span class="field__label">Code<span class="field__required">*</span></span>
          <input v-model.trim="form.code" class="input" type="text" placeholder="例如 white / expert" />
        </label>
        <label class="field">
          <span class="field__label">中文名<span class="field__required">*</span></span>
          <input v-model.trim="form.displayNameZh" class="input" type="text" placeholder="例如 白色 / 专家" />
        </label>
        <label class="field">
          <span class="field__label">英文名<span class="field__required">*</span></span>
          <input v-model.trim="form.displayNameEn" class="input" type="text" placeholder="例如 White / Expert" />
        </label>
        <label class="field">
          <span class="field__label">排序</span>
          <input v-model.number="form.sortOrder" class="input" type="number" placeholder="排序值" />
        </label>
        <label class="field">
          <span class="field__label">状态</span>
          <select v-model.number="form.status" class="input">
            <option :value="1">启用</option>
            <option :value="0">禁用</option>
          </select>
        </label>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="dialogVisible = false">取消</button>
        <button type="button" class="btn btn-strong" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : isEdit ? '保存更改' : '创建品质' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next'

import { del, get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

definePageMeta({
  title: '品质管理',
  navSection: '/item-rarities',
  headerVariant: 'compact',
})

type ItemRarity = {
  id: number
  code: string
  displayNameZh: string
  displayNameEn: string
  sortOrder: number | null
  status: number
  itemCount: number
  updatedAt?: string
}

const rows = ref<ItemRarity[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const search = ref('')
const form = reactive({
  id: null as number | null,
  code: '',
  displayNameZh: '',
  displayNameEn: '',
  sortOrder: 999,
  status: 1,
})

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return rows.value
  return rows.value.filter((row) =>
    [row.code, row.displayNameZh, row.displayNameEn, String(row.id)].some((value) =>
      String(value || '').toLowerCase().includes(keyword),
    ),
  )
})

const totalItemCount = computed(() => rows.value.reduce((sum, row) => sum + Number(row.itemCount || 0), 0))

function resetForm() {
  form.id = null
  form.code = ''
  form.displayNameZh = ''
  form.displayNameEn = ''
  form.sortOrder = 999
  form.status = 1
}

async function loadRows() {
  loading.value = true
  try {
    const response = await get<{ success: boolean; data: ItemRarity[] }>('/admin/item-rarities')
    rows.value = Array.isArray(response?.data) ? response.data : []
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '加载品质失败', 'error')
  } finally {
    loading.value = false
  }
}

function resetSearch() {
  search.value = ''
}

function openCreateDialog() {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

function openEditDialog(row: ItemRarity) {
  isEdit.value = true
  form.id = row.id
  form.code = row.code
  form.displayNameZh = row.displayNameZh
  form.displayNameEn = row.displayNameEn
  form.sortOrder = row.sortOrder ?? 999
  form.status = row.status ?? 1
  dialogVisible.value = true
}

async function handleSubmit() {
  if (form.id == null || !form.code || !form.displayNameZh || !form.displayNameEn) {
    showToast('请完整填写品质信息', 'warning')
    return
  }
  submitting.value = true
  try {
    const payload = { ...form }
    if (isEdit.value) {
      await put(`/admin/item-rarities/${form.id}`, payload)
      showToast('品质更新成功', 'success')
    } else {
      await post('/admin/item-rarities', payload)
      showToast('品质创建成功', 'success')
    }
    dialogVisible.value = false
    await loadRows()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '保存品质失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: ItemRarity) {
  if (!window.confirm(`确定要删除品质「${row.displayNameZh}」吗？`)) return
  try {
    await del(`/admin/item-rarities/${row.id}`)
    showToast('品质删除成功', 'success')
    await loadRows()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '删除品质失败', 'error')
  }
}

function formatDateTime(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

onMounted(loadRows)
</script>

<style scoped>
.rarity-page { padding-bottom: 24px; }
.rarity-hero__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: end; }
.field--search { min-width: 0; }
.field__required { color: var(--color-danger); }
.toolbar__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.table-wrap { overflow-x: auto; border-radius: calc(var(--radius-lg) - 2px); border: 1px solid var(--color-border); }
.data-table { width: 100%; min-width: 920px; border-collapse: collapse; background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent); }
.data-table th,.data-table td { padding: 13px 14px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent); text-align: left; vertical-align: middle; }
.data-table th { background: color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent); color: var(--color-text-secondary); font-weight: 700; }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); }
.cell-primary { display: grid; gap: 4px; }
.cell-primary strong { color: var(--color-text); font-weight: 700; }
.cell-primary__atomic { color: var(--color-text-muted); font-size: .78rem; font-family: Consolas, monospace; }
.status-chip { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; font-size: .75rem; font-weight: 700; }
.status-chip--on { background: #d1fae5; color: #065f46; }
.status-chip--off { background: #fee2e2; color: #991b1b; }
.row-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-link--danger { color: var(--color-danger); }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 1080px) { .toolbar { grid-template-columns: 1fr; } }
@media (max-width: 820px) { .rarity-hero__stats,.form-grid { grid-template-columns: 1fr; } .toolbar__actions,.table-card__head { flex-direction: column; align-items: flex-start; } }
</style>
