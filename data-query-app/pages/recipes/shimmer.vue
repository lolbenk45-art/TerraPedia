<template>
  <div class="page-wrap shimmer-page">
    <section class="workspace-shell workspace-shell--unified page-workspace">
      <div class="workspace-hero workspace-hero--unified shimmer-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">微光数据 Shimmer</p>
          <h1 class="page-head__title">微光数据</h1>
          <p class="page-head__subtitle">维护已导入的微光转换、拆解规则、实体转换、NPC 微光变体和微光世界条件。</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loadingOverview" @click="loadOverview">
            {{ loadingOverview ? '刷新中...' : '刷新概览' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="loadingRows" @click="loadRows()">
            {{ loadingRows ? '加载中...' : '重新加载记录' }}
          </button>
          <button type="button" class="btn btn-strong" @click="openCreateDialog">新增记录</button>
        </div>
      </div>

      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch" aria-label="配方模块视图切换">
          <NuxtLink to="/recipes" class="view-switch__link">配方编辑</NuxtLink>
          <NuxtLink to="/recipes/tree" class="view-switch__link">合成路径</NuxtLink>
          <NuxtLink to="/recipes/stations" class="view-switch__link">制作站管理</NuxtLink>
          <NuxtLink :to="{ path: '/item-groups', query: { domain: 'recipe' } }" class="view-switch__link">任意物品组</NuxtLink>
          <NuxtLink to="/recipes/wiki-zh-import" class="view-switch__link">中文配方导入</NuxtLink>
          <NuxtLink to="/recipes/shimmer" class="view-switch__link view-switch__link--active">微光数据</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="layout">
      <section class="main main--full">
        <section class="section-card workspace-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">微光环境</h2>
              <p class="section-card__subtitle">编辑微光数据导入所使用的主世界条件记录。</p>
            </div>
            <div class="meta-pills">
              <span class="meta-pill" :class="{ 'meta-pill--ok': manifest.parseStatus === 'parsed' }">{{ manifest.parseStatus || 'missing' }}</span>
              <span class="meta-pill">未解析 {{ manifest.unresolvedCount }}</span>
            </div>
          </div>

          <div v-if="context" class="context-grid">
            <label class="field">
              <span class="field__label">编码 Code</span>
              <input v-model.trim="contextForm.code" class="input" type="text" disabled />
            </label>
            <label class="field">
              <span class="field__label">英文名 Name EN</span>
              <input v-model.trim="contextForm.nameEn" class="input" type="text" />
            </label>
            <label class="field">
              <span class="field__label">中文名 Name ZH</span>
              <input v-model.trim="contextForm.nameZh" class="input" type="text" />
            </label>
            <label class="field">
              <span class="field__label">条件类型 Context Type</span>
              <input v-model.trim="contextForm.contextType" class="input" type="text" />
            </label>
            <label class="field">
              <span class="field__label">排序 Sort Order</span>
              <input v-model.number="contextForm.sortOrder" class="input" type="number" />
            </label>
            <label class="field">
              <span class="field__label">状态</span>
              <select v-model.number="contextForm.status" class="input">
                <option :value="1">启用</option>
                <option :value="0">禁用</option>
              </select>
            </label>
            <label class="field field--full">
              <span class="field__label">描述</span>
              <textarea v-model.trim="contextForm.description" class="input textarea" rows="4" />
            </label>
            <label class="field field--full">
              <span class="field__label">图标 URL</span>
              <input v-model.trim="contextForm.iconUrl" class="input" type="text" />
              <div class="context-preview">
                <div class="shimmer-thumb shimmer-thumb--context">
                  <img
                    v-if="isImageVisible(contextForm.iconUrl)"
                    :src="normalizeImageUrl(contextForm.iconUrl)"
                    :alt="contextForm.nameZh || contextForm.nameEn || 'Shimmer'"
                    loading="lazy"
                    @error="markImageFailed(contextForm.iconUrl)"
                  />
                  <span v-else>SH</span>
                </div>
                <div class="context-preview__copy">
                  <strong>{{ contextForm.nameZh || contextForm.nameEn || 'Shimmer' }}</strong>
                  <code>{{ contextForm.iconUrl || '未填写图标 URL' }}</code>
                </div>
              </div>
            </label>
          </div>

          <div class="toolbar-top toolbar-top--section">
            <button type="button" class="btn btn-secondary" @click="resetContextForm">重置</button>
            <button type="button" class="btn btn-strong" :disabled="savingContext" @click="saveContext">
              {{ savingContext ? '保存中...' : '保存环境' }}
            </button>
          </div>
        </section>

        <section class="section-card workspace-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">数据集浏览器</h2>
              <p class="section-card__subtitle">通过标签切换当前存入专用表的四类微光数据集。</p>
            </div>
          </div>

          <div class="dataset-tabs" role="tablist" aria-label="微光数据集">
            <button
              v-for="tab in datasetTabs"
              :key="tab.key"
              type="button"
              class="dataset-tab"
              :class="{ 'dataset-tab--active': activeDataset === tab.key }"
              :aria-pressed="activeDataset === tab.key"
              @click="switchDataset(tab.key)"
            >
              <span>{{ tab.label }}</span>
              <strong>{{ datasetCount(tab.key) }}</strong>
            </button>
          </div>

          <form class="toolbar shimmer-toolbar" @submit.prevent="loadRows()">
            <label class="field field--search">
              <span class="field__label">搜索</span>
              <div class="search-wrap">
                <span class="search-wrap__icon">
                  <Search :size="16" />
                </span>
                <input v-model.trim="search" class="input input--search" type="text" :placeholder="currentConfig.searchPlaceholder" />
              </div>
            </label>
            <div class="toolbar__actions">
              <button type="submit" class="btn btn-primary">搜索</button>
              <button type="button" class="btn btn-secondary" @click="resetSearch">重置</button>
              <button type="button" class="btn btn-strong" @click="openCreateDialog">新增记录</button>
            </div>
          </form>

          <div v-if="loadingRows" class="empty-text">记录加载中...</div>
          <template v-else>
            <div v-if="rows.length" class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th v-for="column in currentConfig.columns" :key="column.key">{{ column.label }}</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rows" :key="row.id">
                    <td v-for="column in currentConfig.columns" :key="`${row.id}-${column.key}`">
                      <template v-if="column.key === 'outputsPreview'">
                        <div v-if="getOutputPreviews(row).length" class="shimmer-output-list">
                          <article v-for="(output, index) in getVisibleOutputPreviews(row)" :key="getOutputPreviewKey(output, index)" class="shimmer-output-chip">
                            <div class="shimmer-output-chip__thumb">
                              <img
                                v-if="isImageVisible(output.imageUrl)"
                                :src="normalizeImageUrl(output.imageUrl)"
                                :alt="getOutputTitle(output)"
                                loading="lazy"
                                @error="markImageFailed(output.imageUrl)"
                              />
                              <span v-else>{{ getOutputFallback(output) }}</span>
                            </div>
                            <div class="shimmer-output-chip__copy">
                              <strong>{{ getOutputTitle(output) }}</strong>
                              <small v-if="getOutputMeta(output)">{{ getOutputMeta(output) }}</small>
                            </div>
                          </article>
                          <span v-if="getOutputOverflowCount(row)" class="shimmer-output-more">+{{ getOutputOverflowCount(row) }}</span>
                        </div>
                        <span v-else>--</span>
                      </template>
                      <template v-else-if="getEntityColumnRole(column.key)">
                        <div class="shimmer-entity-cell">
                          <div class="shimmer-thumb">
                            <img
                              v-if="isImageVisible(getEntityImage(row, column.key))"
                              :src="normalizeImageUrl(getEntityImage(row, column.key))"
                              :alt="getEntityLabel(row, column.key)"
                              loading="lazy"
                              @error="markImageFailed(getEntityImage(row, column.key))"
                            />
                            <span v-else>{{ getEntityFallback(row, column.key) }}</span>
                          </div>
                          <div class="shimmer-entity-cell__copy">
                            <strong>{{ getEntityLabel(row, column.key) }}</strong>
                            <span v-if="getEntitySecondary(row, column.key)">{{ getEntitySecondary(row, column.key) }}</span>
                            <code v-if="getEntityMeta(row, column.key)" class="cell-primary__atomic">{{ getEntityMeta(row, column.key) }}</code>
                            <code v-if="column.key === currentConfig.primaryColumn" class="cell-primary__atomic">#{{ row.id }}</code>
                          </div>
                        </div>
                      </template>
                      <template v-else-if="column.key === currentConfig.primaryColumn">
                        <div class="cell-primary">
                          <strong>{{ row[column.key] || '--' }}</strong>
                          <span v-if="currentConfig.secondaryColumn && row[currentConfig.secondaryColumn]">{{ row[currentConfig.secondaryColumn] }}</span>
                          <code class="cell-primary__atomic">#{{ row.id }}</code>
                        </div>
                      </template>
                      <template v-else>
                        <span>{{ formatCell(row[column.key]) }}</span>
                      </template>
                    </td>
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
              icon="SH"
              :title="search ? '没有匹配的微光记录' : '当前还没有微光记录'"
              :description="search ? '换一个关键词或清空筛选后再试。' : '为当前数据集新增第一条记录。'"
              :primary-text="search ? '清空搜索' : '新增记录'"
              @primary="search ? resetSearch() : openCreateDialog()"
            />
          </template>

          <div v-if="pagination.totalPages > 1" class="pagination-wrap">
            <AppPagination :page="pagination.page" :total="pagination.total" :total-pages="pagination.totalPages" @change="handlePageChange" />
          </div>
        </section>
      </section>
    </section>

    <AppModal v-model="dialogVisible" :title="isEdit ? `编辑${currentConfig.label}` : `新增${currentConfig.label}`" width="min(920px, calc(100vw - 32px))">
      <div v-if="dialogPreviewCards.length" class="shimmer-dialog-preview">
        <article v-for="card in dialogPreviewCards" :key="card.key" class="shimmer-dialog-preview__item">
          <div class="shimmer-thumb shimmer-thumb--dialog">
            <img
              v-if="isImageVisible(card.imageUrl)"
              :src="normalizeImageUrl(card.imageUrl)"
              :alt="card.title"
              loading="lazy"
              @error="markImageFailed(card.imageUrl)"
            />
            <span v-else>{{ card.fallback }}</span>
          </div>
          <div class="shimmer-dialog-preview__copy">
            <span>{{ card.label }}</span>
            <strong>{{ card.title }}</strong>
            <small v-if="card.subtitle">{{ card.subtitle }}</small>
            <code v-if="card.meta">{{ card.meta }}</code>
          </div>
        </article>
      </div>
      <div class="form-grid">
        <template v-for="field in currentConfig.fields" :key="field.key">
          <label class="field" :class="field.span === 'full' ? 'field--full' : ''">
            <div class="field__topline">
              <span class="field__label">{{ field.label }}<span v-if="field.required" class="field__required">*</span></span>
              <button v-if="field.format === 'json'" type="button" class="field__action" @click="formatJsonField(field.key)">格式化 JSON</button>
            </div>
            <textarea
              v-if="field.type === 'textarea'"
              v-model="form[field.key]"
              class="input textarea"
              :class="{ 'textarea--code': field.format === 'json' }"
              :rows="field.rows || 4"
            />
            <select v-else-if="field.type === 'status'" v-model.number="form[field.key]" class="input">
              <option :value="1">启用</option>
              <option :value="0">禁用</option>
            </select>
            <input v-else v-model="form[field.key]" class="input" :type="field.type === 'number' ? 'number' : 'text'" />
            <span v-if="field.helper" class="field__hint">{{ field.helper }}</span>
          </label>
        </template>
      </div>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="dialogVisible = false">取消</button>
        <button type="button" class="btn btn-strong" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '保存中...' : isEdit ? '保存更改' : '新增记录' }}
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
  title: '微光数据',
  navSection: '/recipes',
  headerVariant: 'compact',
})

type OverviewContext = Record<string, any> | null
type OverviewManifest = Record<string, any>
type DatasetCount = { dataset: string; count: number }
type DatasetRow = Record<string, any>
type EntityColumnRole = 'input' | 'output' | 'npc' | 'variant'
type DialogPreviewCard = {
  key: string
  label: string
  title: string
  subtitle: string
  meta: string
  imageUrl: string
  fallback: string
}

type FieldConfig = {
  key: string
  label: string
  type?: 'text' | 'number' | 'textarea' | 'status'
  required?: boolean
  span?: 'full'
  format?: 'json'
  rows?: number
  helper?: string
}

type DatasetConfig = {
  key: string
  label: string
  endpoint: string
  searchPlaceholder: string
  primaryColumn: string
  secondaryColumn?: string
  columns: Array<{ key: string; label: string }>
  fields: FieldConfig[]
}

const datasetConfigs: Record<string, DatasetConfig> = {
  'item-transforms': {
    key: 'item-transforms',
    label: '物品转换',
    endpoint: '/admin/shimmer/datasets/item-transforms',
    searchPlaceholder: '搜索输入、输出、internalName 或备注',
    primaryColumn: 'inputNameZh',
    secondaryColumn: 'outputNameZh',
    columns: [
      { key: 'inputNameZh', label: '输入' },
      { key: 'outputNameZh', label: '输出' },
      { key: 'inputKind', label: '输入类型 inputKind' },
      { key: 'outputKind', label: '输出类型 outputKind' },
      { key: 'sortOrder', label: '排序' },
      { key: 'status', label: '状态' },
    ],
    fields: [
      { key: 'inputKind', label: '输入类型 inputKind', required: true },
      { key: 'inputNameZh', label: '输入中文名 inputNameZh', required: true },
      { key: 'inputNameEn', label: '输入英文名 inputNameEn' },
      { key: 'inputInternalName', label: '输入内部名 inputInternalName' },
      { key: 'outputKind', label: '输出类型 outputKind', required: true },
      { key: 'outputNameZh', label: '输出中文名 outputNameZh', required: true },
      { key: 'outputNameEn', label: '输出英文名 outputNameEn' },
      { key: 'outputInternalName', label: '输出内部名 outputInternalName' },
      { key: 'conditionsJson', label: '条件 JSON conditionsJson', type: 'textarea', span: 'full', format: 'json', rows: 6 },
      { key: 'notes', label: '备注 notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sortOrder', label: '排序 sortOrder', type: 'number' },
      { key: 'status', label: '状态 status', type: 'status' },
    ],
  },
  'decraft-rules': {
    key: 'decraft-rules',
    label: '拆解规则',
    endpoint: '/admin/shimmer/datasets/decraft-rules',
    searchPlaceholder: '搜索规则类型、输入、组标签或备注',
    primaryColumn: 'inputNameZh',
    secondaryColumn: 'ruleType',
    columns: [
      { key: 'inputNameZh', label: '输入' },
      { key: 'outputsPreview', label: '输出' },
      { key: 'ruleType', label: '规则类型 ruleType' },
      { key: 'groupLabel', label: '组标签 groupLabel' },
      { key: 'sortOrder', label: '排序' },
      { key: 'status', label: '状态' },
    ],
    fields: [
      { key: 'ruleType', label: '规则类型 ruleType', required: true },
      { key: 'groupLabel', label: '组标签 groupLabel' },
      { key: 'inputKind', label: '输入类型 inputKind', required: true },
      { key: 'inputNameZh', label: '输入中文名 inputNameZh', required: true },
      { key: 'inputNameEn', label: '输入英文名 inputNameEn' },
      { key: 'inputInternalName', label: '输入内部名 inputInternalName' },
      { key: 'outputsJson', label: '输出 JSON outputsJson', type: 'textarea', span: 'full', format: 'json', rows: 8 },
      { key: 'conditionsJson', label: '条件 JSON conditionsJson', type: 'textarea', span: 'full', format: 'json', rows: 6 },
      { key: 'notes', label: '备注 notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sortOrder', label: '排序 sortOrder', type: 'number' },
      { key: 'status', label: '状态 status', type: 'status' },
    ],
  },
  'entity-transforms': {
    key: 'entity-transforms',
    label: '实体转换',
    endpoint: '/admin/shimmer/datasets/entity-transforms',
    searchPlaceholder: '搜索转换组、输入、输出或 internalName',
    primaryColumn: 'inputNameZh',
    secondaryColumn: 'outputNameZh',
    columns: [
      { key: 'inputNameZh', label: '输入' },
      { key: 'outputNameZh', label: '输出' },
      { key: 'transformGroup', label: '转换组 transformGroup' },
      { key: 'sortOrder', label: '排序' },
      { key: 'status', label: '状态' },
    ],
    fields: [
      { key: 'transformGroup', label: '转换组 transformGroup', required: true },
      { key: 'inputEntityType', label: '输入实体类型 inputEntityType' },
      { key: 'inputNameZh', label: '输入中文名 inputNameZh', required: true },
      { key: 'inputNameEn', label: '输入英文名 inputNameEn' },
      { key: 'inputInternalName', label: '输入内部名 inputInternalName' },
      { key: 'outputEntityType', label: '输出实体类型 outputEntityType' },
      { key: 'outputNameZh', label: '输出中文名 outputNameZh', required: true },
      { key: 'outputNameEn', label: '输出英文名 outputNameEn' },
      { key: 'outputInternalName', label: '输出内部名 outputInternalName' },
      { key: 'sortOrder', label: '排序 sortOrder', type: 'number' },
      { key: 'status', label: '状态 status', type: 'status' },
    ],
  },
  'npc-transforms': {
    key: 'npc-transforms',
    label: 'NPC 转换',
    endpoint: '/admin/shimmer/datasets/npc-transforms',
    searchPlaceholder: '搜索 NPC 名称、internalName、备注或变体信息',
    primaryColumn: 'npcNameZh',
    secondaryColumn: 'appearanceVariant',
    columns: [
      { key: 'npcNameZh', label: 'NPC' },
      { key: 'appearanceVariant', label: '变体' },
      { key: 'variantImageUrl', label: '变体图片' },
      { key: 'effectType', label: '效果类型 effectType' },
      { key: 'sortOrder', label: '排序' },
      { key: 'status', label: '状态' },
    ],
    fields: [
      { key: 'npcNameZh', label: 'NPC 中文名 npcNameZh', required: true },
      { key: 'npcNameEn', label: 'NPC 英文名 npcNameEn' },
      { key: 'npcInternalName', label: 'NPC 内部名 npcInternalName' },
      { key: 'appearanceVariant', label: '外观变体 appearanceVariant' },
      { key: 'effectType', label: '效果类型 effectType' },
      { key: 'variantImageUrl', label: '变体图片 URL variantImageUrl', span: 'full' },
      { key: 'variantImageAlt', label: '变体图片说明 variantImageAlt', span: 'full' },
      { key: 'notes', label: '备注 notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sortOrder', label: '排序 sortOrder', type: 'number' },
      { key: 'status', label: '状态 status', type: 'status' },
    ],
  },
}

const datasetTabs = Object.values(datasetConfigs)
const activeDataset = ref<keyof typeof datasetConfigs>('item-transforms')
const currentConfig = computed<DatasetConfig>(() => datasetConfigs[activeDataset.value] as DatasetConfig)

const loadingOverview = ref(false)
const loadingRows = ref(false)
const savingContext = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const search = ref('')
const rows = ref<DatasetRow[]>([])
const pagination = ref({ total: 0, page: 1, limit: 20, totalPages: 1 })
const datasetCounts = ref<Record<string, number>>({})
const context = ref<OverviewContext>(null)
const manifest = ref<OverviewManifest>({ parseStatus: 'missing', unresolvedCount: 0 })
const failedImages = ref<Record<string, boolean>>({})

const contextForm = reactive({
  code: 'SHIMMER',
  nameEn: 'Shimmer',
  nameZh: '',
  contextType: 'ENVIRONMENT',
  description: '',
  iconUrl: '',
  sortOrder: 30,
  status: 1,
})

const form = reactive<Record<string, any>>({})

const summaryCards = computed(() => [
  { label: '物品转换', value: datasetCount('item-transforms') },
  { label: '拆解规则', value: datasetCount('decraft-rules') },
  { label: '实体转换', value: datasetCount('entity-transforms') },
  { label: 'NPC 转换', value: datasetCount('npc-transforms') },
  { label: '未解析', value: manifest.value.unresolvedCount ?? 0 },
  { label: '状态', value: manifest.value.parseStatus || 'missing' },
])

const dialogPreviewCards = computed<DialogPreviewCard[]>(() => {
  const cards: DialogPreviewCard[] = []
  if (hasAnyValue(form.inputNameZh, form.inputNameEn, form.inputInternalName, form.inputImageUrl)) {
    cards.push(buildDialogCard('input', '输入', {
      title: firstText(form.inputImageNameZh, form.inputNameZh, form.inputImageName, form.inputNameEn, form.inputInternalName, '输入'),
      subtitle: firstText(form.inputNameEn, form.inputImageName, form.inputKind),
      meta: firstText(form.inputInternalName, form.inputKind),
      imageUrl: firstText(form.inputImageUrl),
      fallback: getInitials(firstText(form.inputNameZh, form.inputNameEn, form.inputInternalName), 'IT'),
    }))
  }
  if (hasAnyValue(form.outputNameZh, form.outputNameEn, form.outputInternalName, form.outputImageUrl)) {
    cards.push(buildDialogCard('output', '输出', {
      title: firstText(form.outputImageNameZh, form.outputNameZh, form.outputImageName, form.outputNameEn, form.outputInternalName, '输出'),
      subtitle: firstText(form.outputNameEn, form.outputImageName, form.outputKind),
      meta: firstText(form.outputInternalName, form.outputKind),
      imageUrl: firstText(form.outputImageUrl),
      fallback: getInitials(firstText(form.outputNameZh, form.outputNameEn, form.outputInternalName), 'IT'),
    }))
  }
  if (hasAnyValue(form.npcNameZh, form.npcNameEn, form.npcInternalName, form.npcImageUrl)) {
    cards.push(buildDialogCard('npc', 'NPC', {
      title: firstText(form.npcImageNameZh, form.npcNameZh, form.npcImageName, form.npcNameEn, form.npcInternalName, 'NPC'),
      subtitle: firstText(form.npcNameEn, form.npcImageName, form.effectType),
      meta: firstText(form.npcInternalName, form.appearanceVariant),
      imageUrl: firstText(form.npcImageUrl),
      fallback: 'NPC',
    }))
  }
  if (hasAnyValue(form.variantImageUrl, form.variantImageAlt)) {
    cards.push(buildDialogCard('variant', '变体', {
      title: firstText(form.variantImageAlt, form.appearanceVariant, form.npcNameZh, form.npcNameEn, '变体'),
      subtitle: firstText(form.appearanceVariant, form.effectType),
      meta: firstText(form.variantImageUrl),
      imageUrl: firstText(form.variantImageUrl),
      fallback: 'VAR',
    }))
  }
  return cards
})

onMounted(async () => {
  await loadOverview()
  await loadRows()
})

async function loadOverview() {
  loadingOverview.value = true
  try {
    const response: any = await get('/admin/shimmer/overview')
    const payload = response?.data ?? response ?? {}
    context.value = payload.context ?? null
    manifest.value = payload.manifest ?? { parseStatus: 'missing', unresolvedCount: 0 }
    datasetCounts.value = Object.fromEntries((payload.datasets || []).map((entry: DatasetCount) => [entry.dataset, Number(entry.count || 0)]))
    resetContextForm()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '微光概览加载失败', 'error')
  } finally {
    loadingOverview.value = false
  }
}

async function loadRows(page = pagination.value.page) {
  loadingRows.value = true
  try {
    const response: any = await get(currentConfig.value.endpoint, {
      page,
      limit: pagination.value.limit,
      search: search.value || undefined,
    })
    rows.value = Array.isArray(response?.data) ? response.data : []
    const nextPagination = response?.pagination ?? { total: rows.value.length, page, limit: pagination.value.limit, totalPages: 1 }
    pagination.value = {
      total: Number(nextPagination.total || 0),
      page: Number(nextPagination.page || page),
      limit: Number(nextPagination.limit || pagination.value.limit),
      totalPages: Number(nextPagination.totalPages || 1),
    }
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '微光记录加载失败', 'error')
  } finally {
    loadingRows.value = false
  }
}

function switchDataset(nextDataset: keyof typeof datasetConfigs) {
  activeDataset.value = nextDataset
  search.value = ''
  pagination.value.page = 1
  loadRows(1)
}

function datasetCount(key: string) {
  return Number(datasetCounts.value[key] || 0).toLocaleString('zh-CN')
}

function resetContextForm() {
  contextForm.code = String(context.value?.code || 'SHIMMER')
  contextForm.nameEn = String(context.value?.nameEn || 'Shimmer')
  contextForm.nameZh = String(context.value?.nameZh || '')
  contextForm.contextType = String(context.value?.contextType || 'ENVIRONMENT')
  contextForm.description = String(context.value?.description || '')
  contextForm.iconUrl = String(context.value?.iconUrl || '')
  contextForm.sortOrder = Number(context.value?.sortOrder || 30)
  contextForm.status = Number(context.value?.status || 1)
}

async function saveContext() {
  savingContext.value = true
  try {
    await put('/admin/shimmer/context', { ...contextForm })
    showToast('微光环境已更新', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '微光环境保存失败', 'error')
  } finally {
    savingContext.value = false
  }
}

function resetForm() {
  for (const key of Object.keys(form)) {
    delete form[key]
  }
  for (const field of currentConfig.value.fields) {
    form[field.key] = field.type === 'status' ? 1 : field.type === 'number' ? 0 : ''
  }
}

function openCreateDialog() {
  isEdit.value = false
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

async function openEditDialog(row: DatasetRow) {
  isEdit.value = true
  editingId.value = Number(row.id)
  resetForm()
  try {
    const response: any = await get(`${currentConfig.value.endpoint}/${row.id}`)
    const payload = response?.data ?? response ?? {}
    for (const field of currentConfig.value.fields) {
      form[field.key] = payload[field.key] ?? (field.type === 'status' ? 1 : field.type === 'number' ? 0 : '')
    }
    assignDisplayFields(payload)
    dialogVisible.value = true
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '微光记录详情加载失败', 'error')
  }
}

async function handleSubmit() {
  const missingField = currentConfig.value.fields.find((field) => field.required && !String(form[field.key] ?? '').trim())
  if (missingField) {
    showToast(`${missingField.label} 为必填项`, 'warning')
    return
  }
  submitting.value = true
  try {
    const payload = Object.fromEntries(currentConfig.value.fields.map((field) => [field.key, form[field.key]]))
    if (isEdit.value && editingId.value != null) {
      await put(`${currentConfig.value.endpoint}/${editingId.value}`, payload)
      showToast('微光记录已更新', 'success')
    } else {
      await post(currentConfig.value.endpoint, payload)
      showToast('微光记录已创建', 'success')
    }
    dialogVisible.value = false
    await loadRows(pagination.value.page)
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '微光记录保存失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: DatasetRow) {
  if (!window.confirm(`确定删除记录 #${row.id} 吗？`)) {
    return
  }
  try {
    await del(`${currentConfig.value.endpoint}/${row.id}`)
    showToast('微光记录已删除', 'success')
    await loadRows(Math.max(1, pagination.value.page))
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '微光记录删除失败', 'error')
  }
}

function handlePageChange(nextPage: number) {
  pagination.value.page = nextPage
  loadRows(nextPage)
}

function resetSearch() {
  search.value = ''
  pagination.value.page = 1
  loadRows(1)
}

function formatCell(value: any) {
  if (value == null || value === '') return '--'
  if (typeof value === 'string' && value.length > 80) return `${value.slice(0, 80)}...`
  return value
}

function formatJsonField(key: string) {
  try {
    form[key] = JSON.stringify(JSON.parse(String(form[key] || '[]')), null, 2)
  } catch {
    showToast('JSON 格式无效', 'warning')
  }
}

function assignDisplayFields(payload: DatasetRow) {
  const displayKeys = [
    'inputImageUrl',
    'inputImageName',
    'inputImageNameZh',
    'outputImageUrl',
    'outputImageName',
    'outputImageNameZh',
    'npcImageUrl',
    'npcImageName',
    'npcImageNameZh',
  ]
  for (const key of displayKeys) {
    if (payload[key] != null) {
      form[key] = payload[key]
    }
  }
}

function getEntityColumnRole(columnKey: string): EntityColumnRole | null {
  if (columnKey.startsWith('input')) return 'input'
  if (columnKey.startsWith('output')) return 'output'
  if (columnKey.startsWith('npc')) return 'npc'
  if (columnKey === 'variantImageUrl') return 'variant'
  return null
}

function getEntityImage(row: DatasetRow, columnKey: string) {
  const role = getEntityColumnRole(columnKey)
  if (role === 'variant') return firstText(row.variantImageUrl)
  if (role === 'npc') return firstText(row.npcImageUrl, row.variantImageUrl)
  if (role === 'output') return firstText(row.outputImageUrl)
  if (role === 'input') return firstText(row.inputImageUrl)
  return ''
}

function getEntityLabel(row: DatasetRow, columnKey: string) {
  const role = getEntityColumnRole(columnKey)
  if (role === 'variant') {
    return firstText(row.variantImageAlt, row.appearanceVariant, row.npcNameZh, row.npcNameEn, '变体')
  }
  if (role === 'npc') {
    return firstText(row.npcImageNameZh, row.npcNameZh, row.npcImageName, row.npcNameEn, row.npcInternalName, '--')
  }
  if (role === 'output') {
    return firstText(row.outputImageNameZh, row.outputNameZh, row.outputImageName, row.outputNameEn, row.outputInternalName, '--')
  }
  if (role === 'input') {
    return firstText(row.inputImageNameZh, row.inputNameZh, row.inputImageName, row.inputNameEn, row.inputInternalName, '--')
  }
  return firstText(row[columnKey], '--')
}

function getEntitySecondary(row: DatasetRow, columnKey: string) {
  const role = getEntityColumnRole(columnKey)
  if (role === 'variant') return firstText(row.appearanceVariant, row.effectType)
  if (role === 'npc') return firstText(row.npcNameEn, row.npcImageName, row.effectType)
  if (role === 'output') return firstText(row.outputNameEn, row.outputImageName, row.outputKind, row.outputEntityType)
  if (role === 'input') return firstText(row.inputNameEn, row.inputImageName, row.inputKind, row.inputEntityType)
  return ''
}

function getEntityMeta(row: DatasetRow, columnKey: string) {
  const role = getEntityColumnRole(columnKey)
  if (role === 'variant') return firstText(row.variantImageUrl)
  if (role === 'npc') return firstText(row.npcInternalName)
  if (role === 'output') return firstText(row.outputInternalName, row.outputKind, row.outputEntityType)
  if (role === 'input') return firstText(row.inputInternalName, row.inputKind, row.inputEntityType)
  return ''
}

function getEntityFallback(row: DatasetRow, columnKey: string) {
  const role = getEntityColumnRole(columnKey)
  if (role === 'npc') return 'NPC'
  if (role === 'variant') return 'VAR'
  return getInitials(getEntityLabel(row, columnKey), 'IT')
}

function getOutputPreviews(row: DatasetRow) {
  return Array.isArray(row.outputsPreview) ? row.outputsPreview : []
}

function getVisibleOutputPreviews(row: DatasetRow) {
  return getOutputPreviews(row).slice(0, 3)
}

function getOutputOverflowCount(row: DatasetRow) {
  return Math.max(0, getOutputPreviews(row).length - getVisibleOutputPreviews(row).length)
}

function getOutputPreviewKey(output: DatasetRow, index: number) {
  return `${output.internalName || output.nameZh || output.nameEn || 'output'}-${index}`
}

function getOutputTitle(output: DatasetRow) {
  return firstText(output.nameZh, output.nameEn, output.internalName, 'Output')
}

function getOutputMeta(output: DatasetRow) {
  return firstText(output.quantityText, output.internalName, output.kind)
}

function getOutputFallback(output: DatasetRow) {
  return getInitials(getOutputTitle(output), 'IT')
}

function buildDialogCard(key: string, label: string, card: Omit<DialogPreviewCard, 'key' | 'label'>): DialogPreviewCard {
  return { key, label, ...card }
}

function hasAnyValue(...values: any[]) {
  return values.some(value => firstText(value) !== '')
}

function firstText(...values: any[]) {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function normalizeImageUrl(value: any) {
  return firstText(value)
}

function isImageVisible(value: any) {
  const imageUrl = normalizeImageUrl(value)
  return Boolean(imageUrl && !failedImages.value[imageUrl])
}

function markImageFailed(value: any) {
  const imageUrl = normalizeImageUrl(value)
  if (imageUrl) {
    failedImages.value = { ...failedImages.value, [imageUrl]: true }
  }
}

function getInitials(value: any, fallback: string) {
  const text = firstText(value)
  if (!text) return fallback
  if (/^[\u4e00-\u9fa5]/.test(text)) return text.slice(0, 2)
  return text
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || fallback
}
</script>

<style scoped>
.main--full { width: 100%; }
.shimmer-hero { align-items: flex-start; }
.context-grid, .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.field--full { grid-column: 1 / -1; }
.field__required { color: var(--color-danger); }
.dataset-tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.dataset-tab { border: 1px solid var(--color-border); background: var(--color-bg-secondary); border-radius: 14px; padding: 10px 14px; display: grid; gap: 4px; min-width: 150px; text-align: left; }
.dataset-tab strong { font-size: 1rem; color: var(--color-text); }
.dataset-tab--active { border-color: color-mix(in srgb, var(--color-primary) 65%, transparent); background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary)); }
.shimmer-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: end; }
.toolbar__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.context-preview { margin-top: 10px; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 74%, transparent); }
.context-preview__copy { min-width: 0; display: grid; gap: 4px; }
.context-preview__copy strong { color: var(--color-text); }
.context-preview__copy code { color: var(--color-text-muted); font-size: .78rem; overflow-wrap: anywhere; }
.table-wrap { overflow-x: auto; border-radius: calc(var(--radius-lg) - 2px); border: 1px solid var(--color-border); }
.data-table { width: 100%; min-width: 1040px; border-collapse: collapse; background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent); }
.data-table th,.data-table td { padding: 13px 14px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent); text-align: left; vertical-align: middle; }
.data-table th { background: color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent); color: var(--color-text-secondary); font-weight: 700; white-space: nowrap; }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); }
.cell-primary { display: grid; gap: 4px; }
.cell-primary strong { color: var(--color-text); font-weight: 700; }
.cell-primary__atomic { color: var(--color-text-muted); font-size: .78rem; font-family: Consolas, monospace; white-space: normal; overflow-wrap: anywhere; }
.shimmer-entity-cell { min-width: 230px; display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 12px; align-items: center; }
.shimmer-entity-cell__copy { min-width: 0; display: grid; gap: 4px; }
.shimmer-entity-cell__copy strong { color: var(--color-text); font-weight: 700; overflow-wrap: anywhere; }
.shimmer-entity-cell__copy span { color: var(--color-text-secondary); font-size: .84rem; overflow-wrap: anywhere; }
.shimmer-thumb { width: 46px; height: 46px; border-radius: 12px; border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent); display: grid; place-items: center; overflow: hidden; color: var(--color-text-muted); font-size: .72rem; font-weight: 800; line-height: 1; flex-shrink: 0; }
.shimmer-thumb img { width: 100%; height: 100%; padding: 4px; object-fit: contain; display: block; }
.shimmer-thumb--context { width: 64px; height: 64px; border-radius: 14px; font-size: .88rem; }
.shimmer-thumb--dialog { width: 58px; height: 58px; border-radius: 14px; font-size: .8rem; }
.shimmer-output-list { min-width: 300px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.shimmer-output-chip { min-width: 130px; max-width: 190px; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 86%, transparent); }
.shimmer-output-chip__thumb { width: 30px; height: 30px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent); display: grid; place-items: center; overflow: hidden; color: var(--color-text-muted); font-size: .64rem; font-weight: 800; background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent); }
.shimmer-output-chip__thumb img { width: 100%; height: 100%; padding: 3px; object-fit: contain; display: block; }
.shimmer-output-chip__copy { min-width: 0; display: grid; gap: 2px; }
.shimmer-output-chip__copy strong { color: var(--color-text); font-size: .8rem; overflow-wrap: anywhere; }
.shimmer-output-chip__copy small { color: var(--color-text-muted); font-size: .72rem; overflow-wrap: anywhere; }
.shimmer-output-more { color: var(--color-text-muted); font-size: .8rem; font-weight: 700; }
.shimmer-dialog-preview { margin-bottom: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.shimmer-dialog-preview__item { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 12px; align-items: center; min-width: 0; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 78%, transparent); }
.shimmer-dialog-preview__copy { min-width: 0; display: grid; gap: 4px; }
.shimmer-dialog-preview__copy span { color: var(--color-text-muted); font-size: .72rem; font-weight: 800; text-transform: uppercase; }
.shimmer-dialog-preview__copy strong { color: var(--color-text); overflow-wrap: anywhere; }
.shimmer-dialog-preview__copy small { color: var(--color-text-secondary); overflow-wrap: anywhere; }
.shimmer-dialog-preview__copy code { color: var(--color-text-muted); font-size: .74rem; overflow-wrap: anywhere; }
.row-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-link--danger { color: var(--color-danger); }
.textarea--code { font-family: Consolas, monospace; min-height: 140px; }
.toolbar-top--section { margin-top: 18px; justify-content: flex-end; }
@media (max-width: 960px) {
  .context-grid, .form-grid, .shimmer-toolbar, .shimmer-dialog-preview { grid-template-columns: 1fr; }
}
</style>
