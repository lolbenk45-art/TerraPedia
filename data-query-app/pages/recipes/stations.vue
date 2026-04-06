<template>
  <div class="page-wrap stations-page">
    <section class="workspace-shell workspace-shell--unified recipes-workspace-hero">
      <div class="workspace-hero workspace-hero--unified stations-hero">
      <div class="stations-hero__copy workspace-hero__copy">
        <p class="stations-hero__eyebrow">CRAFTING STATIONS</p>
        <h1 class="page-head__title">制作站管理</h1>
        <p class="page-head__subtitle">把工作台、熔炉、铁砧等制作站独立维护，供配方统一引用。</p>
        <div class="stations-hero__stats workspace-summary-grid">
          <article v-for="stat in stationHeroStats" :key="stat.label" class="hero-stat">
            <span class="hero-stat__label">{{ stat.label }}</span>
            <strong class="hero-stat__value">{{ stat.value }}</strong>
          </article>
        </div>
      </div>

      <div class="stations-hero__actions action-cluster">
        <button type="button" class="btn btn-secondary" :disabled="savingStation" @click="handleResetEditor">清空表单</button>
        <button type="button" class="btn btn-strong" :disabled="savingStation || loadingStations" @click="saveStation">
          {{ savingStation ? '保存中...' : editingId ? '更新制作站' : '新建制作站' }}
        </button>
      </div>
      </div>
      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch" aria-label="配方模块视图切换">
          <NuxtLink to="/recipes" class="view-switch__link">配方编辑</NuxtLink>
          <NuxtLink to="/recipes/tree" class="view-switch__link">合成路径</NuxtLink>
          <NuxtLink to="/recipes/stations" class="view-switch__link view-switch__link--active">制作站管理</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="stations-layout">
      <section class="section-card station-editor workspace-panel workspace-panel--side">
        <h2 class="section-card__title">制作站表单</h2>
        <div class="station-editor__grid">
          <label class="field field--full">
            <span class="field__label">关联物品</span>
            <AdminItemLookupInput
              v-model="itemKeyword"
              placeholder="输入中文名、英文名或 internalName"
              @pick="applyItemSuggestion"
            />
          </label>

          <div v-if="selectedItem" class="field field--full">
            <span class="field__label">当前绑定</span>
            <div class="linked-item-card">
              <img
                v-if="selectedItem.imageUrl || selectedItem.image"
                :src="selectedItem.imageUrl || selectedItem.image"
                :alt="getLinkedItemLabel(selectedItem)"
                class="linked-item-card__image"
              />
              <div v-else class="linked-item-card__image linked-item-card__image--fallback">IT</div>
              <div class="linked-item-card__copy">
                <strong>{{ getLinkedItemLabel(selectedItem) }}</strong>
                <span v-if="selectedItem.nameZh && selectedItem.name">{{ selectedItem.name }}</span>
                <span v-else-if="selectedItem.internalName">{{ selectedItem.internalName }}</span>
                <span>#{{ selectedItem.id }}</span>
              </div>
              <button type="button" class="btn-link" @click="clearLinkedItem">取消绑定</button>
            </div>
          </div>

          <p v-else-if="form.itemId" class="field__hint field--full">
            当前仅填写了物品 ID #{{ form.itemId }}，尚未校验物品信息。
          </p>

          <div v-if="editingStation" class="field field--full">
            <span class="field__label">当前制作站</span>
            <div class="binding-panel__current-station station-editor__current-station">
              <img
                v-if="editingStation.imageUrl || editingStation.itemImageUrl"
                :src="editingStation.imageUrl || editingStation.itemImageUrl"
                :alt="getStationLabel(editingStation)"
                class="binding-panel__current-station-image"
              />
              <div v-else class="binding-panel__current-station-image binding-panel__current-station-image--fallback">ST</div>
              <div class="binding-panel__current-station-copy">
                <span class="binding-panel__current-station-label">Current station</span>
                <strong>{{ getStationLabel(editingStation) }}</strong>
                <small>{{ editingStation.internalName || `ID ${editingStation.id}` }}</small>
                <small v-if="editingStation.itemId">关联物品 #{{ editingStation.itemId }}</small>
                <small>{{ editingStation.usageItemCount ?? 0 }} 个物品 / {{ editingStation.usageRecipeCount ?? 0 }} 条配方</small>
              </div>
            </div>
          </div>

          <div v-if="editingStation" class="field field--full">
            <span class="field__label">当前使用情况</span>
            <div class="usage-panel">
              <div class="usage-panel__stats">
                <article class="usage-stat">
                  <span>结果物品</span>
                  <strong>{{ editingStation.usageItemCount ?? 0 }}</strong>
                </article>
                <article class="usage-stat">
                  <span>配方条数</span>
                  <strong>{{ editingStation.usageRecipeCount ?? 0 }}</strong>
                </article>
              </div>
              <div v-if="editingStation.usageItems?.length" class="usage-chip-list">
                <component
                  v-for="usage in editingStation.usageItems.slice(0, 6)"
                  :key="`${usage.resultItemId ?? usage.resultItemInternalName}-${usage.versionScope}`"
                  :is="usage.resultItemId ? 'a' : 'span'"
                  :href="usage.resultItemId ? `/recipes?itemId=${usage.resultItemId}` : undefined"
                  class="usage-chip"
                  :class="{ 'usage-chip--disabled': !usage.resultItemId }"
                >
                  <img v-if="usage.resultItemImageUrl || usage.resultItemImage" :src="usage.resultItemImageUrl || usage.resultItemImage" alt="" class="usage-chip__image">
                  <span>{{ getUsageItemLabel(usage) }}</span>
                  <small v-if="usage.recipeCount">×{{ usage.recipeCount }}</small>
                </component>
              </div>
              <p v-else class="usage-panel__empty">暂未被任何配方使用。</p>
              <div class="usage-panel__actions">
                <button type="button" class="btn btn-secondary" :disabled="!editingId || isDirty" @click="goToRecipeWorkspaceForStation">
                  {{ !editingId ? '先从列表选择制作站' : isDirty ? '先保存当前制作站信息' : '进入配方绑定工作区' }}
                </button>
              </div>
            </div>
          </div>

          <label class="field">
            <span class="field__label">物品 ID</span>
            <input v-model.number="form.itemId" class="input" type="number" min="1" />
          </label>

          <label class="field">
            <span class="field__label">内部名</span>
            <input v-model="form.internalName" class="input" type="text" />
          </label>

          <label class="field">
            <span class="field__label">英文名</span>
            <input v-model="form.nameEn" class="input" type="text" />
          </label>

          <label class="field">
            <span class="field__label">中文名</span>
            <input v-model="form.nameZh" class="input" type="text" />
          </label>

          <label class="field">
            <span class="field__label">类型</span>
            <input v-model="form.stationType" class="input" type="text" placeholder="crafting_station" />
          </label>

          <label class="field">
            <span class="field__label">排序</span>
            <input v-model.number="form.sortOrder" class="input" type="number" min="0" />
          </label>

          <label class="field field--full">
            <span class="field__label">图片地址</span>
            <input v-model="form.imageUrl" class="input" type="text" />
          </label>

          <label class="field field--full">
            <span class="field__label">备注</span>
            <textarea v-model="form.notes" class="input textarea" rows="4"></textarea>
          </label>
        </div>
      </section>

      <div class="stations-main">
      <section class="section-card binding-workspace workspace-panel workspace-panel--main">
        <div class="binding-panel">
          <div class="binding-panel__head">
            <div>
              <h2 class="section-card__title">关联配方工作区</h2>
              <p>制作站是“配方级”关系。先选结果物品，再决定它的哪条配方要使用当前制作站。</p>
            </div>
            <span v-if="!editingId" class="binding-panel__note">先从列表选择一个制作站</span>
            <span v-else-if="isDirty" class="binding-panel__note">当前制作站信息有未保存修改，请先保存</span>
            <span v-else class="binding-panel__note">可直接绑定现有配方</span>
          </div>

          <div v-if="editingStation" class="binding-panel__current-station">
            <img
              v-if="editingStation.imageUrl || editingStation.itemImageUrl"
              :src="editingStation.imageUrl || editingStation.itemImageUrl"
              :alt="getStationLabel(editingStation)"
              class="binding-panel__current-station-image"
            />
            <div v-else class="binding-panel__current-station-image binding-panel__current-station-image--fallback">ST</div>
            <div class="binding-panel__current-station-copy">
              <span class="binding-panel__current-station-label">Current station</span>
              <strong>{{ getStationLabel(editingStation) }}</strong>
              <small>{{ editingStation.internalName || `ID ${editingStation.id}` }}</small>
            </div>
          </div>

          <div v-if="editingStation?.usageItems?.length" class="binding-panel__quick-picks">
            <span class="binding-panel__quick-picks-label">正在使用它的物品</span>
            <div class="usage-chip-list">
              <component
                v-for="usage in editingStation.usageItems"
                :key="`binding-quick-${usage.resultItemId ?? usage.resultItemInternalName}-${usage.versionScope}`"
                :is="usage.resultItemId ? 'button' : 'span'"
                :type="usage.resultItemId ? 'button' : undefined"
                class="usage-chip"
                :class="{ 'usage-chip--disabled': !usage.resultItemId }"
                @click="usage.resultItemId && goToUsageItem(usage.resultItemId)"
              >
                <img v-if="usage.resultItemImageUrl || usage.resultItemImage" :src="usage.resultItemImageUrl || usage.resultItemImage" alt="" class="usage-chip__image">
                <span>{{ getUsageItemLabel(usage) }}</span>
              </component>
            </div>
          </div>

          <div v-if="editingStation" class="binding-panel__usage-library">
            <div class="binding-panel__usage-library-head">
              <div>
                <h3>全部关联物品</h3>
                <p>这里会列出当前制作站关联到的全部结果物品，不再只显示前几条 sample。</p>
              </div>
              <span>{{ editingStation.usageItemCount ?? 0 }} 个物品 / {{ editingStation.usageRecipeCount ?? 0 }} 条配方</span>
            </div>

            <div v-if="loadingStationUsageItems" class="binding-panel__status">关联物品加载中...</div>

            <div v-else-if="stationUsageItems.length" class="binding-usage-grid">
              <component
                v-for="usage in stationUsageItems"
                :key="`usage-library-${usage.resultItemId ?? usage.resultItemInternalName}`"
                :is="usage.resultItemId ? 'button' : 'div'"
                :type="usage.resultItemId ? 'button' : undefined"
                class="binding-usage-card"
                @click="usage.resultItemId && handleStationUsageChipClick(editingStation!, usage.resultItemId)"
              >
                <img v-if="usage.resultItemImageUrl || usage.resultItemImage" :src="usage.resultItemImageUrl || usage.resultItemImage" alt="" class="binding-usage-card__image">
                <div v-else class="binding-usage-card__image binding-usage-card__image--fallback">IT</div>
                <div class="binding-usage-card__copy">
                  <strong>{{ getUsageItemLabel(usage) }}</strong>
                  <span v-if="usage.versionScope">{{ usage.versionScope }}</span>
                  <span>{{ usage.recipeCount ?? 0 }} 条配方</span>
                </div>
              </component>
            </div>

            <p v-else class="binding-panel__status">当前没有可用的关联物品。</p>

            <div v-if="stationUsagePagination.totalPages > 1" class="binding-panel__pagination">
              <AppPagination
                :page="stationUsagePagination.page"
                :total="stationUsagePagination.total"
                :total-pages="stationUsagePagination.totalPages"
                @change="handleStationUsagePageChange"
              />
            </div>
          </div>

          <label class="field field--full">
            <span class="field__label">选择目标物品</span>
            <AdminItemLookupInput
              v-model="bindingKeyword"
              placeholder="搜索要绑定到的结果物品"
              @pick="handlePickBindingItem"
            />
          </label>

          <div v-if="bindingTargetItem" class="linked-item-card linked-item-card--binding">
            <img
              v-if="bindingTargetItem.imageUrl"
              :src="bindingTargetItem.imageUrl"
              :alt="getBindingTargetLabel(bindingTargetItem)"
              class="linked-item-card__image"
            />
            <div v-else class="linked-item-card__image linked-item-card__image--fallback">IT</div>
            <div class="linked-item-card__copy">
              <strong>{{ getBindingTargetLabel(bindingTargetItem) }}</strong>
              <span v-if="bindingTargetItem.nameZh && bindingTargetItem.name">{{ bindingTargetItem.name }}</span>
              <span v-else-if="bindingTargetItem.internalName">{{ bindingTargetItem.internalName }}</span>
              <span>#{{ bindingTargetItem.id }}</span>
            </div>
            <button type="button" class="btn btn-secondary" @click="goToUsageItem(bindingTargetItem.id)">打开完整配方页</button>
          </div>

          <div v-if="bindingTargetItem" class="binding-toolbar">
            <div class="binding-toolbar__stats">
              <article class="binding-mini-stat">
                <span>当前配方数</span>
                <strong>{{ bindingRecipes.length }}</strong>
              </article>
              <article class="binding-mini-stat">
                <span>已绑定当前制作站</span>
                <strong>{{ bindingRecipes.filter((recipe) => Boolean(getRecipeBinding(recipe, editingStation))).length }}</strong>
              </article>
              <article class="binding-mini-stat">
                <span>待保存修改</span>
                <strong>{{ bindingIsDirty ? '是' : '否' }}</strong>
              </article>
            </div>
            <div class="binding-toolbar__actions">
              <button type="button" class="btn btn-secondary" :disabled="!canManageBindings || savingBindingContext" @click="addBindingRecipeDraft">
                新增配方并预置当前制作站
              </button>
              <button type="button" class="btn btn-secondary" :disabled="!bindingTargetItem" @click="goToUsageItem(bindingTargetItem.id)">
                打开完整配方页
              </button>
              <button type="button" class="btn btn-strong" :disabled="!canManageBindings || savingBindingContext || !bindingIsDirty" @click="saveBindingRecipes">
                {{ savingBindingContext ? '保存中...' : '保存当前物品配方' }}
              </button>
            </div>
          </div>

          <div v-if="bindingTargetItem && suggestedBindingRoot && showDeprecatedFlowPreview" class="binding-flow-summary">
            <div class="binding-panel__usage-library-head">
              <div>
                <h3>建议合成流程</h3>
                <p>给出当前目标物品的简要制作信息，包括建议路径、使用制作站和基础环境信息。</p>
              </div>
              <span>{{ desktopBindingVariant?.versionScope || '主版本 / Desktop 优先' }}</span>
            </div>

            <div class="binding-flow-summary__meta">
              <article class="binding-mini-stat">
                <span>当前建议结果</span>
                <strong>{{ getSuggestedRootLabel(suggestedBindingRoot) }}</strong>
              </article>
              <article class="binding-mini-stat">
                <span>基础信息</span>
                <strong>{{ getSuggestedRootMeta(suggestedBindingRoot) }}</strong>
              </article>
            </div>

            <div v-if="suggestedBindingRoot.stations?.length" class="usage-chip-list">
              <span
                v-for="station in suggestedBindingRoot.stations"
                :key="`${station.stationItemId ?? station.stationInternalName}-${station.sortOrder}`"
                class="usage-chip usage-chip--disabled"
              >
                {{ getTreeStationLabel(station) }}
              </span>
            </div>

            <div class="binding-flow-summary__tree">
              <AdminRecipeTreeBranch :node="suggestedBindingRoot" compact />
            </div>
          </div>

          <div v-if="loadingBindingContext" class="binding-panel__status">目标物品配方加载中...</div>

          <AppEmptyState
            v-else-if="editingStation && !bindingTargetItem"
            icon="RC"
            title="先选择一个结果物品"
            description="可以直接搜索一个新物品进行绑定，也可以点击上方“正在使用它的物品”快捷进入管理。"
          />

          <div v-else-if="bindingTargetItem && bindingRecipes.length" class="binding-recipe-list">
            <article
              v-for="(recipe, recipeIndex) in bindingRecipes"
              :key="`${bindingTargetItem.id}-${recipeIndex}-${recipe.versionScope || 'default'}`"
              class="binding-recipe-card"
            >
              <div class="binding-recipe-card__head">
                <div>
                  <strong>{{ getRecipeCardLabel(recipe, recipeIndex) }}</strong>
                  <p>{{ getRecipeStationsLabel(recipe) }}</p>
                </div>
                <span v-if="getRecipeBinding(recipe, editingStation)" class="recipe-pill recipe-pill--active">
                  {{ getRecipeBinding(recipe, editingStation)?.isAlternative ? '已绑定为替代工作台' : '已绑定为主工作台' }}
                </span>
                <span v-else class="recipe-pill">尚未绑定当前制作站</span>
              </div>

              <div class="binding-recipe-card__actions">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="!canManageBindings || bindingActionKey === `${recipeIndex}-primary` || Boolean(getRecipeBinding(recipe, editingStation) && !getRecipeBinding(recipe, editingStation)?.isAlternative)"
                  @click="applyBindingToRecipe(recipeIndex, false)"
                >
                  {{ getRecipeBinding(recipe, editingStation)?.isAlternative ? '改为主工作台' : '绑定为主工作台' }}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="!canManageBindings || bindingActionKey === `${recipeIndex}-alt` || Boolean(getRecipeBinding(recipe, editingStation)?.isAlternative)"
                  @click="applyBindingToRecipe(recipeIndex, true)"
                >
                  {{ getRecipeBinding(recipe, editingStation) ? '改为替代工作台' : '绑定为替代工作台' }}
                </button>
                <button
                  type="button"
                  class="btn-link btn-link--danger"
                  :disabled="!canManageBindings || !getRecipeBinding(recipe, editingStation) || !canUnbindRecipe(recipe) || bindingActionKey === `${recipeIndex}-remove`"
                  :title="canUnbindRecipe(recipe) ? '' : '配方至少保留 1 个工作台，无法直接解绑'"
                  @click="removeBindingFromRecipe(recipeIndex)"
                >
                  {{ bindingActionKey === `${recipeIndex}-remove` ? '解绑中...' : '解绑当前制作站' }}
                </button>
              </div>
            </article>
          </div>

          <AppEmptyState
            v-else-if="bindingTargetItem"
            icon="RC"
            title="这个物品还没有配方"
            description="可以直接在这里新增配方草稿，系统会预置当前制作站。补充原料后即可保存。"
          />

          <div v-if="false && bindingTargetItem && showBindingEditor && showInlineBindingEditor" class="binding-editor">
            <ItemRecipeEditor v-model="bindingRecipes" :crafting-stations="bindingStationOptions" />
          </div>
        </div>
      </section>

      <section class="section-card station-list workspace-panel workspace-panel--main">
        <div class="station-list__head">
          <h2 class="section-card__title">制作站列表</h2>
          <div class="station-list__tools">
            <input v-model.trim="searchKeyword" class="input station-list__search" type="text" placeholder="搜索名称或 internalName" />
            <select v-model="usageFilter" class="input station-list__filter">
              <option value="all">全部</option>
              <option value="used">仅已使用</option>
              <option value="unused">仅未使用</option>
            </select>
            <button type="button" class="btn btn-secondary" :disabled="loadingStations" @click="loadStations({ page: 1 })">
              {{ loadingStations ? '刷新中...' : '刷新' }}
            </button>
          </div>
        </div>

        <div v-if="loadingStations && !stations.length" class="station-list__status">制作站加载中...</div>

        <div v-else-if="stations.length" class="station-list__grid">
          <article v-for="station in stations" :key="station.id" class="station-card" :class="{ 'station-card--active': editingId === station.id }">
            <img v-if="station.imageUrl || station.itemImageUrl" :src="station.imageUrl || station.itemImageUrl" :alt="getStationLabel(station)" class="station-card__image" />
            <div v-else class="station-card__fallback">ST</div>
            <div class="station-card__copy">
              <div class="station-card__title-row">
                <strong>{{ getStationLabel(station) }}</strong>
                <span v-if="editingId === station.id" class="station-card__active-pill">Current</span>
              </div>
              <span>{{ station.internalName || '无 internalName' }}</span>
              <div v-if="station.itemId" class="station-card__binding">
                <span class="station-card__binding-label">关联物品</span>
                <span>{{ getLinkedItemLabel(station) }}</span>
                <span v-if="station.itemInternalName">{{ station.itemInternalName }}</span>
                <span>#{{ station.itemId }}</span>
              </div>
              <span v-else>未绑定物品</span>

              <div class="station-card__usage">
                <div class="station-card__usage-head">
                  <span class="station-card__binding-label">被这些物品使用</span>
                  <span>{{ station.usageItemCount ?? 0 }} 个物品 / {{ station.usageRecipeCount ?? 0 }} 条配方</span>
                </div>
                <div v-if="station.usageItems?.length" class="usage-chip-list">
                  <template v-for="usage in station.usageItems.slice(0, 4)" :key="`${station.id}-${usage.resultItemId ?? usage.resultItemInternalName}-${usage.versionScope}`">
                    <button
                      v-if="usage.resultItemId"
                      type="button"
                      class="usage-chip usage-chip--compact"
                      @click="handleStationUsageChipClick(station, usage.resultItemId)"
                    >
                      <img v-if="usage.resultItemImageUrl || usage.resultItemImage" :src="usage.resultItemImageUrl || usage.resultItemImage" alt="" class="usage-chip__image">
                      <span>{{ getUsageItemLabel(usage) }}</span>
                    </button>
                    <span
                      v-else
                      class="usage-chip usage-chip--compact usage-chip--disabled"
                    >
                      <img v-if="usage.resultItemImageUrl || usage.resultItemImage" :src="usage.resultItemImageUrl || usage.resultItemImage" alt="" class="usage-chip__image">
                      <span>{{ getUsageItemLabel(usage) }}</span>
                    </span>
                  </template>
                  <span v-if="(station.usageItems?.length ?? 0) > 4" class="usage-more">+{{ (station.usageItems?.length ?? 0) - 4 }}</span>
                </div>
                <span v-else class="station-card__usage-empty">暂未被任何配方使用</span>
              </div>
            </div>
            <div class="station-card__actions">
              <button type="button" class="btn-link" :disabled="savingStation || deletingStationId === station.id" @click="editStation(station)">编辑</button>
              <button type="button" class="btn-link" :disabled="savingStation || deletingStationId === station.id" @click="openBindingWorkspaceForStation(station)">管理绑定</button>
              <button
                type="button"
                class="btn-link btn-link--danger"
                :disabled="(station.usageRecipeCount ?? 0) > 0 || deletingStationId === station.id || savingStation"
                :title="(station.usageRecipeCount ?? 0) > 0 ? '该制作站已被配方引用，不能删除' : ''"
                @click="removeStation(station)"
              >
                {{ deletingStationId === station.id ? '删除中...' : '删除' }}
              </button>
            </div>
          </article>
        </div>

        <AppEmptyState
          v-else
          icon="ST"
          :title="searchKeyword || usageFilter !== 'all' ? '没有匹配的制作站' : '当前还没有制作站数据'"
          :description="searchKeyword || usageFilter !== 'all' ? '调整搜索词或筛选条件后再试。' : '创建第一条制作站后，这里会显示列表和引用情况。'"
        />

        <div v-if="stationsPagination.totalPages > 1" class="station-list__pagination">
          <AppPagination
            :page="stationsPagination.page"
            :total="stationsPagination.total"
            :total-pages="stationsPagination.totalPages"
            @change="handlePageChange"
          />
        </div>
      </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import AdminRecipeTreeBranch from '~/components/AdminRecipeTreeBranch.vue'
import AdminItemLookupInput from '~/components/AdminItemLookupInput.vue'
import ItemRecipeEditor from '~/components/ItemRecipeEditor.vue'
import { showToast } from '~/composables/useToast'
import type {
  CraftingStation,
  CraftingStationUsageItem,
  Item,
  ItemRecipePayload,
  ItemRecipeRelation,
  ItemRecipeStationPayload,
  ItemRecipeTreeNode,
  ItemRecipeTreeResponse,
  ItemRecipeTreeStation,
  ItemRecipeTreeVariant,
  Pagination,
} from '~/stores/items'

definePageMeta({
  title: '制作站管理',
  navSection: '/recipes',
  headerVariant: 'compact',
})

type SuggestionItem = {
  id: number
  name: string
  nameZh?: string
  internalName?: string
  image?: string
}

type LinkedItemSummary = {
  id: number
  name: string
  nameZh?: string
  internalName?: string
  image?: string
  imageUrl?: string
}

type LinkedItemSource = Partial<LinkedItemSummary & CraftingStation>

const itemsStore = useItemsStore()
const route = useRoute()
const router = useRouter()
const stations = ref<CraftingStation[]>([])
const editingId = ref<number | null>(null)
const itemKeyword = ref('')
const searchKeyword = ref('')
const usageFilter = ref<'all' | 'used' | 'unused'>('all')
const selectedItem = ref<LinkedItemSummary | null>(null)
const editingStation = ref<CraftingStation | null>(null)
const bindingKeyword = ref('')
const bindingTargetItem = ref<Item | null>(null)
const bindingRecipes = ref<ItemRecipePayload[]>([])
const bindingLoadedRecipes = ref<ItemRecipePayload[]>([])
const bindingRecipeTree = ref<ItemRecipeTreeResponse | null>(null)
const stationUsageItems = ref<CraftingStationUsageItem[]>([])
const loadingStations = ref(false)
const savingStation = ref(false)
const deletingStationId = ref<number | null>(null)
const loadingBindingContext = ref(false)
const savingBindingContext = ref(false)
const loadingStationUsageItems = ref(false)
const bindingActionKey = ref('')
const showBindingEditor = ref(false)
const bindingStationOptions = ref<CraftingStation[]>([])
const stationsPagination = ref<Pagination>({ page: 1, size: 20, total: 0, totalPages: 0 })
const stationUsagePagination = ref<Pagination>({ page: 1, size: 12, total: 0, totalPages: 0 })
const editorBaseline = ref('')
const workspaceFocus = ref<'editor' | 'binding'>('editor')
const isHydratingRoute = ref(false)
const isSyncingRoute = ref(false)
const allowConfirmedNavigation = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let loadSerial = 0
const form = reactive<Partial<CraftingStation>>({
  itemId: null,
  internalName: '',
  nameEn: '',
  nameZh: '',
  stationType: 'crafting_station',
  notes: '',
  imageUrl: '',
  sortOrder: 0,
  status: 1,
})
const isDirty = computed(() => serializeEditorState() !== editorBaseline.value)
const canManageBindings = computed(() => Boolean(editingId.value) && !isDirty.value && !savingStation.value)
const bindingIsDirty = computed(() => JSON.stringify(bindingRecipes.value) !== JSON.stringify(bindingLoadedRecipes.value))
const stationHeroStats = computed(() => {
  const usedCount = stations.value.filter((station) => (station.usageRecipeCount ?? 0) > 0).length
  return [
    { label: 'STATIONS', value: String(stationsPagination.value.total || stations.value.length) },
    { label: 'USED', value: String(usedCount) },
    { label: 'EDITOR', value: editingStation.value ? getStationLabel(editingStation.value) : 'Create mode' },
    { label: 'STATE', value: isDirty.value || bindingIsDirty.value ? 'Unsaved changes' : 'Synced' },
  ]
})
const showDeprecatedFlowPreview = false
const showInlineBindingEditor = false
const desktopBindingVariant = computed<ItemRecipeTreeVariant | null>(() => {
  const variants = bindingRecipeTree.value?.variants || []
  return (
    variants.find((variant) => (variant.versionScope || '').toLowerCase().includes('desktop version'))
    || variants.find((variant) => (variant.versionScope || '').toLowerCase().includes('desktop'))
    || variants.find((variant) => !(variant.versionScope || '').trim())
    || variants[0]
    || null
  )
})
const suggestedBindingRoot = computed<ItemRecipeTreeNode | null>(() => desktopBindingVariant.value?.roots?.[0] ?? null)

function getStationLabel(station: Partial<CraftingStation>) {
  return station.nameZh || station.nameEn || station.internalName || `制作站 #${station.id ?? '--'}`
}

function getLinkedItemLabel(item: LinkedItemSource) {
  return item.nameZh || item.itemNameZh || item.name || item.itemName || item.internalName || item.itemInternalName || `物品 #${item.id ?? item.itemId ?? '--'}`
}

function createLinkedItemSummary(item: Partial<SuggestionItem & CraftingStation>) {
  const id = Number(item.id ?? item.itemId ?? 0)
  if (!Number.isFinite(id) || id <= 0) {
    return null
  }
  return {
    id,
    name: item.name || item.itemName || '',
    nameZh: item.nameZh || item.itemNameZh || '',
    internalName: item.internalName || item.itemInternalName || '',
    image: item.image || item.itemImage || '',
    imageUrl: item.itemImageUrl || '',
  }
}

function getUsageItemLabel(item: NonNullable<CraftingStation['usageItems']>[number]) {
  return item.resultItemNameZh || item.resultItemName || item.resultItemInternalName || `物品 #${item.resultItemId ?? '--'}`
}

async function loadStationUsageItems(stationId: number, page = 1) {
  loadingStationUsageItems.value = true
  try {
    const result = await itemsStore.fetchCraftingStationUsageItems(stationId, page, stationUsagePagination.value.size)
    stationUsageItems.value = result.records
    stationUsagePagination.value = result.pagination ?? { ...stationUsagePagination.value, page, total: result.records.length, totalPages: 1 }
  } finally {
    loadingStationUsageItems.value = false
  }
}

function handleStationUsagePageChange(page: number) {
  if (!editingStation.value?.id) return
  void loadStationUsageItems(editingStation.value.id, page).then(() => syncStationWorkspaceRoute())
}

function focusBindingWorkspace() {
  if (!canManageBindings.value) return
  workspaceFocus.value = 'binding'
  const panel = document.querySelector('.binding-workspace')
  if (panel instanceof HTMLElement) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function clearBindingContext() {
  bindingKeyword.value = ''
  bindingTargetItem.value = null
  bindingRecipes.value = []
  bindingLoadedRecipes.value = []
  bindingRecipeTree.value = null
  showBindingEditor.value = false
}

async function goToRecipeWorkspaceForStation() {
  if (!editingStation.value?.itemId) return
  if (!confirmDiscardChanges('跳转到配方页') || !confirmDiscardBindingChanges('跳转到配方页')) return
  allowConfirmedNavigation.value = true
  await router.push({ path: '/recipes', query: buildRecipeRouteQuery(editingStation.value.itemId) })
}

function getBindingTargetLabel(item: Item | null) {
  if (!item) return '未选择物品'
  return item.nameZh || item.name || item.internalName || `物品 #${item.id}`
}

function trimText(value?: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function getQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || ''
  return typeof value === 'string' ? value : ''
}

function parsePositiveQueryNumber(value: string | string[] | undefined) {
  const parsed = Number(getQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseUsageFilter(value: string | string[] | undefined): 'all' | 'used' | 'unused' {
  const normalized = getQueryValue(value)
  return normalized === 'used' || normalized === 'unused' ? normalized : 'all'
}

function parseFocus(value: string | string[] | undefined): 'editor' | 'binding' {
  return getQueryValue(value) === 'binding' ? 'binding' : 'editor'
}

function sanitizeRouteQuery(query: Record<string, string | undefined>) {
  const next: Record<string, string> = {}
  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      next[key] = value
    }
  })
  return next
}

function queriesEqual(left: Record<string, string>, right: Record<string, any>) {
  const current = sanitizeRouteQuery(
    Object.fromEntries(
      Object.entries(right).map(([key, value]) => [key, getQueryValue(value as string | string[] | undefined)])
    )
  )
  return JSON.stringify(left) === JSON.stringify(current)
}

function buildStationWorkspaceQuery(overrides: Record<string, string | undefined> = {}) {
  const station = editingStation.value
  const base = sanitizeRouteQuery({
    stationId: editingId.value != null ? String(editingId.value) : undefined,
    stationItemId: station?.itemId != null ? String(station.itemId) : undefined,
    stationInternalName: trimText(station?.internalName) || undefined,
    search: trimText(searchKeyword.value) || undefined,
    usageFilter: usageFilter.value !== 'all' ? usageFilter.value : undefined,
    page: stationsPagination.value.page > 1 ? String(stationsPagination.value.page) : undefined,
    usagePage: stationUsagePagination.value.page > 1 ? String(stationUsagePagination.value.page) : undefined,
    bindingItemId: bindingTargetItem.value?.id != null ? String(bindingTargetItem.value.id) : undefined,
    focus: workspaceFocus.value !== 'editor' ? workspaceFocus.value : undefined,
  })
  return sanitizeRouteQuery({ ...base, ...overrides })
}

async function syncStationWorkspaceRoute(overrides: Record<string, string | undefined> = {}) {
  if (isHydratingRoute.value) return
  const query = buildStationWorkspaceQuery(overrides)
  if (queriesEqual(query, route.query as Record<string, any>)) return
  isSyncingRoute.value = true
  try {
    await router.replace({ path: '/recipes/stations', query })
  } finally {
    isSyncingRoute.value = false
  }
}

function buildRecipeRouteQuery(itemId: number) {
  const stationQuery = buildStationWorkspaceQuery()
  return sanitizeRouteQuery({
    itemId: String(itemId),
    from: 'recipes-stations',
    stationId: stationQuery.stationId,
    stationItemId: stationQuery.stationItemId,
    stationInternalName: stationQuery.stationInternalName,
    stationSearch: stationQuery.search,
    stationUsageFilter: stationQuery.usageFilter,
    stationPage: stationQuery.page,
    stationUsagePage: stationQuery.usagePage,
    bindingItemId: stationQuery.bindingItemId,
    stationFocus: stationQuery.focus,
  })
}

function isDesktopRecipe(recipe: ItemRecipeRelation) {
  const scope = recipe.versionScope?.trim().toLowerCase() || ''
  return !scope || scope.includes('desktop version') || scope.includes('desktop')
}

function toRecipeDrafts(recipes: ItemRecipeRelation[]): ItemRecipePayload[] {
  return (Array.isArray(recipes) ? recipes : []).filter(isDesktopRecipe).map((recipe) => ({
    resultItemId: recipe.resultItemId ?? null,
    resultItemName: recipe.resultItemName ?? '',
    resultItemNameZh: recipe.resultItemNameZh ?? '',
    resultItemInternalName: recipe.resultItemInternalName ?? '',
    resultItemImage: recipe.resultItemImage ?? '',
    resultItemImageUrl: recipe.resultItemImageUrl ?? '',
    resultQuantity: recipe.resultQuantity ?? 1,
    versionScope: recipe.versionScope ?? '',
    notes: recipe.notes ?? '',
    sourceProvider: recipe.sourceProvider ?? '',
    sourcePage: recipe.sourcePage ?? '',
    sourceRevisionTimestamp: recipe.sourceRevisionTimestamp ?? '',
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ingredient, ingredientIndex) => ({
          ingredientItemId: ingredient.ingredientItemId ?? null,
          ingredientNameRaw: ingredient.ingredientNameRaw ?? ingredient.itemNameZh ?? ingredient.itemName ?? '',
          ingredientGroupType: ingredient.ingredientGroupType ?? (ingredient.ingredientItemId ? 'item' : 'group'),
          quantityMin: ingredient.quantityMin ?? null,
          quantityMax: ingredient.quantityMax ?? null,
          quantityText: ingredient.quantityText ?? '1',
          sortOrder: ingredient.sortOrder ?? ingredientIndex + 1,
          itemName: ingredient.itemName ?? '',
          itemNameZh: ingredient.itemNameZh ?? '',
          itemInternalName: ingredient.itemInternalName ?? '',
          itemImage: ingredient.itemImage ?? '',
          itemImageUrl: ingredient.itemImageUrl ?? '',
        }))
      : [],
    stations: Array.isArray(recipe.stations)
      ? recipe.stations.map((station, stationIndex) => ({
          stationId: station.stationId ?? null,
          stationItemId: station.stationItemId ?? null,
          stationNameRaw: station.stationNameRaw ?? station.itemNameZh ?? station.itemName ?? '',
          isAlternative: station.isAlternative ?? false,
          sortOrder: station.sortOrder ?? stationIndex + 1,
          itemName: station.itemName ?? '',
          itemNameZh: station.itemNameZh ?? '',
          itemInternalName: station.itemInternalName ?? '',
          itemImage: station.itemImage ?? '',
          itemImageUrl: station.itemImageUrl ?? '',
        }))
      : [],
    conditions: Array.isArray(recipe.conditions)
      ? recipe.conditions.map((condition, conditionIndex) => ({
          refType: condition.refType ?? 'WORLD_CONTEXT',
          refId: condition.refId ?? null,
          requirementRole: condition.requirementRole ?? 'required',
          notes: condition.notes ?? '',
          sortOrder: condition.sortOrder ?? conditionIndex + 1,
          refCode: condition.refCode ?? '',
          refNameEn: condition.refNameEn ?? '',
          refNameZh: condition.refNameZh ?? '',
          refContextType: condition.refContextType ?? '',
        }))
      : [],
  }))
}

function cloneRecipePayloads(recipes: ItemRecipePayload[]) {
  return JSON.parse(JSON.stringify(recipes || [])) as ItemRecipePayload[]
}

function getRecipeCardLabel(recipe: ItemRecipePayload, index: number) {
  return recipe.versionScope?.trim() || `配方 #${index + 1}`
}

function isCurrentStationBound(station: ItemRecipeStationPayload, currentStation: CraftingStation | null) {
  if (!station || !currentStation) return false
  if (currentStation.id != null && station.stationId === currentStation.id) return true
  if (currentStation.itemId != null && station.stationItemId === currentStation.itemId) return true
  const currentInternalName = trimText(currentStation.internalName)
  if (currentInternalName && currentInternalName === trimText(station.itemInternalName)) return true
  const currentNameEn = trimText(currentStation.nameEn)
  if (currentNameEn && currentNameEn === trimText(station.stationNameRaw)) return true
  const currentNameZh = trimText(currentStation.nameZh)
  return Boolean(currentNameZh && currentNameZh === trimText(station.stationNameRaw))
}

function getRecipeBinding(recipe: ItemRecipePayload, currentStation: CraftingStation | null) {
  return (recipe.stations || []).find((station) => isCurrentStationBound(station, currentStation)) ?? null
}

function getRecipeStationsLabel(recipe: ItemRecipePayload) {
  if (!recipe.stations?.length) return '未配置工作台'
  return recipe.stations
    .map((station) => station.itemNameZh || station.itemName || station.stationNameRaw || station.itemInternalName || '未命名工作台')
    .slice(0, 4)
    .join(' / ')
}

function getTreeStationLabel(station: ItemRecipeTreeStation) {
  return station.stationNameZh || station.stationName || station.stationNameRaw || station.stationInternalName || '未知制作站'
}

function getSuggestedRootLabel(root: ItemRecipeTreeNode) {
  return root.itemNameZh || root.itemName || root.itemInternalName || `Recipe #${root.recipeId ?? '--'}`
}

function getSuggestedRootMeta(root: ItemRecipeTreeNode) {
  const ingredientCount = Array.isArray(root.children) ? root.children.length : 0
  const stationCount = Array.isArray(root.stations) ? root.stations.length : 0
  return `${ingredientCount} 个原料 / ${stationCount} 个制作站`
}

function canUnbindRecipe(recipe: ItemRecipePayload) {
  const remainingStations = (recipe.stations || []).filter((station) => !isCurrentStationBound(station, editingStation.value))
  return remainingStations.length > 0
}

function createStationBindingPayload(isAlternative: boolean): ItemRecipeStationPayload | null {
  if (!editingStation.value) return null
  return {
    stationId: editingStation.value.id,
    stationItemId: editingStation.value.itemId ?? null,
    stationNameRaw: editingStation.value.nameZh || editingStation.value.nameEn || editingStation.value.internalName || '',
    isAlternative,
    sortOrder: null,
    itemName: editingStation.value.itemName ?? editingStation.value.nameEn ?? '',
    itemNameZh: editingStation.value.itemNameZh ?? editingStation.value.nameZh ?? '',
    itemInternalName: editingStation.value.itemInternalName ?? editingStation.value.internalName ?? '',
    itemImage: editingStation.value.itemImage ?? editingStation.value.imageUrl ?? '',
    itemImageUrl: editingStation.value.itemImageUrl ?? editingStation.value.imageUrl ?? '',
  }
}

function handleResetEditor() {
  resetEditor()
}

function serializeEditorState() {
  return JSON.stringify({
    itemId: form.itemId ?? null,
    internalName: form.internalName ?? '',
    nameEn: form.nameEn ?? '',
    nameZh: form.nameZh ?? '',
    stationType: form.stationType ?? 'crafting_station',
    notes: form.notes ?? '',
    imageUrl: form.imageUrl ?? '',
    sortOrder: form.sortOrder ?? 0,
    status: form.status ?? 1,
  })
}

function syncEditorBaseline() {
  editorBaseline.value = serializeEditorState()
}

function confirmDiscardChanges(action: string) {
  if (!isDirty.value) return true
  return window.confirm(`当前有未保存修改，确认继续${action}并丢弃这些内容吗？`)
}

function confirmDiscardBindingChanges(action: string) {
  if (!bindingIsDirty.value) return true
  return window.confirm(`当前配方绑定有未保存修改，确认继续${action}并丢弃这些内容吗？`)
}

function resetEditor(options: { force?: boolean } = {}) {
  if (!options.force && !confirmDiscardChanges('清空表单')) {
    return false
  }
  if (!options.force && !confirmDiscardBindingChanges('清空表单')) {
    return false
  }
  editingId.value = null
  itemKeyword.value = ''
  selectedItem.value = null
  editingStation.value = null
  stationUsageItems.value = []
  stationUsagePagination.value = { page: 1, size: stationUsagePagination.value.size, total: 0, totalPages: 0 }
  clearBindingContext()
  workspaceFocus.value = 'editor'
  form.itemId = null
  form.internalName = ''
  form.nameEn = ''
  form.nameZh = ''
  form.stationType = 'crafting_station'
  form.notes = ''
  form.imageUrl = ''
  form.sortOrder = 0
  form.status = 1
  syncEditorBaseline()
  if (!options.force) {
    void syncStationWorkspaceRoute()
  }
  return true
}

function applyItemSuggestion(item: SuggestionItem) {
  if (!item?.id) {
    clearLinkedItem()
    return
  }
  form.itemId = item.id
  selectedItem.value = createLinkedItemSummary(item)
  itemKeyword.value = ''
  workspaceFocus.value = 'editor'
  void syncStationWorkspaceRoute()
}

function clearLinkedItem() {
  itemKeyword.value = ''
  selectedItem.value = null
  form.itemId = null
}

async function loadBindingItemContext(itemId: number) {
  loadingBindingContext.value = true
  try {
    const [item, recipes, tree] = await Promise.all([
      itemsStore.fetchItemById(itemId),
      itemsStore.fetchItemRecipes(itemId),
      itemsStore.fetchItemRecipeTree(itemId, 4),
    ])
    if (!item) {
      showToast('未找到对应物品', 'warning')
      bindingTargetItem.value = null
      bindingRecipes.value = []
      bindingLoadedRecipes.value = []
      bindingRecipeTree.value = null
      return
    }
    bindingTargetItem.value = item
    bindingKeyword.value = ''
    bindingLoadedRecipes.value = cloneRecipePayloads(toRecipeDrafts(recipes))
    bindingRecipes.value = cloneRecipePayloads(bindingLoadedRecipes.value)
    bindingRecipeTree.value = tree
    workspaceFocus.value = 'binding'
    if (!isHydratingRoute.value) {
      await syncStationWorkspaceRoute()
    }
  } finally {
    loadingBindingContext.value = false
  }
}

async function handlePickBindingItem(item: SuggestionItem) {
  if (!canManageBindings.value) {
    showToast('请先保存当前制作站信息，再管理配方绑定', 'warning')
    return
  }
  if (!item?.id) {
    if (bindingIsDirty.value && !window.confirm('当前绑定工作区有未保存修改，确认清空目标物品吗？')) return
    clearBindingContext()
    await syncStationWorkspaceRoute()
    return
  }
  if (bindingIsDirty.value && !window.confirm('当前绑定工作区有未保存修改，确认切换目标物品吗？')) return
  await loadBindingItemContext(item.id)
}

async function handleUsageChipClick(itemId?: number | null) {
  if (!itemId) return
  await goToUsageItem(itemId)
}

async function handleStationUsageChipClick(station: CraftingStation, itemId?: number | null) {
  if (!itemId) return
  await goToUsageItem(itemId)
}

function openBindingWorkspaceForStation(station: CraftingStation) {
  const switched = editStation(station, { focus: 'binding' })
  if (switched === false) return
  queueMicrotask(() => focusBindingWorkspace())
}

function editStation(station: CraftingStation, options: { force?: boolean; focus?: 'editor' | 'binding' } = {}) {
  if (!options.force && !confirmDiscardChanges('切换到另一条制作站')) {
    return false
  }
  if (!options.force && !confirmDiscardBindingChanges('切换到另一条制作站')) {
    return false
  }
  clearBindingContext()
  editingId.value = station.id
  editingStation.value = station
  workspaceFocus.value = options.focus ?? 'editor'
  selectedItem.value = createLinkedItemSummary(station)
  itemKeyword.value = ''
  form.itemId = station.itemId ?? null
  form.internalName = station.internalName || ''
  form.nameEn = station.nameEn || ''
  form.nameZh = station.nameZh || ''
  form.stationType = station.stationType || 'crafting_station'
  form.notes = station.notes || ''
  form.imageUrl = station.imageUrl || ''
  form.sortOrder = station.sortOrder ?? 0
  form.status = station.status ?? 1
  syncEditorBaseline()
  if (station.id) {
    stationUsagePagination.value.page = 1
    loadStationUsageItems(station.id, 1)
  } else {
    stationUsageItems.value = []
  }
  if (!options.force) {
    void syncStationWorkspaceRoute()
  }
  return true
}

async function goToUsageItem(itemId?: number | null) {
  if (!itemId) return
  if (!confirmDiscardChanges('跳转到配方页') || !confirmDiscardBindingChanges('跳转到配方页')) return
  allowConfirmedNavigation.value = true
  await router.push({ path: '/recipes', query: buildRecipeRouteQuery(itemId) })
}

async function persistBindingRecipes(nextRecipes: ItemRecipePayload[], actionKey: string) {
  if (!bindingTargetItem.value) return
  bindingActionKey.value = actionKey
  try {
    const saved = await itemsStore.updateItemRecipes(bindingTargetItem.value.id, nextRecipes, 'full')
    if (saved === null) return
    bindingLoadedRecipes.value = cloneRecipePayloads(toRecipeDrafts(saved))
    bindingRecipes.value = cloneRecipePayloads(bindingLoadedRecipes.value)
    bindingRecipeTree.value = await itemsStore.fetchItemRecipeTree(bindingTargetItem.value.id, 4)
    await loadStations({ page: stationsPagination.value.page })
    const latestEditingStation = stations.value.find((station) => station.id === editingId.value)
    if (latestEditingStation) {
      editingStation.value = latestEditingStation
      if (latestEditingStation.id) {
        await loadStationUsageItems(latestEditingStation.id, stationUsagePagination.value.page)
      }
    }
    await loadBindingStationOptions()
  } finally {
    bindingActionKey.value = ''
  }
}

async function applyBindingToRecipe(recipeIndex: number, isAlternative: boolean) {
  if (!editingStation.value || !bindingTargetItem.value || !canManageBindings.value) return
  const nextRecipes = cloneRecipePayloads(bindingRecipes.value)
  const recipe = nextRecipes[recipeIndex]
  if (!recipe) return
  const currentBinding = getRecipeBinding(recipe, editingStation.value)
  const bindingPayload = createStationBindingPayload(isAlternative)
  if (!bindingPayload) return

  if (currentBinding) {
    currentBinding.stationId = bindingPayload.stationId
    currentBinding.stationItemId = bindingPayload.stationItemId
    currentBinding.stationNameRaw = bindingPayload.stationNameRaw
    currentBinding.isAlternative = isAlternative
    currentBinding.itemName = bindingPayload.itemName
    currentBinding.itemNameZh = bindingPayload.itemNameZh
    currentBinding.itemInternalName = bindingPayload.itemInternalName
    currentBinding.itemImage = bindingPayload.itemImage
    currentBinding.itemImageUrl = bindingPayload.itemImageUrl
  } else {
    recipe.stations = [
      ...(recipe.stations || []),
      {
        ...bindingPayload,
        sortOrder: (recipe.stations?.length ?? 0) + 1,
      },
    ]
  }

  await persistBindingRecipes(nextRecipes, `${recipeIndex}-${isAlternative ? 'alt' : 'primary'}`)
}

async function removeBindingFromRecipe(recipeIndex: number) {
  if (!editingStation.value || !bindingTargetItem.value || !canManageBindings.value) return
  const nextRecipes = cloneRecipePayloads(bindingRecipes.value)
  const recipe = nextRecipes[recipeIndex]
  if (!recipe || !canUnbindRecipe(recipe)) return
  recipe.stations = (recipe.stations || [])
    .filter((station) => !isCurrentStationBound(station, editingStation.value))
    .map((station, index) => ({ ...station, sortOrder: index + 1 }))
  await persistBindingRecipes(nextRecipes, `${recipeIndex}-remove`)
}

function addBindingRecipeDraft() {
  if (!bindingTargetItem.value || !editingStation.value || !canManageBindings.value) return
  const bindingPayload = createStationBindingPayload(false)
  if (!bindingPayload) return
  bindingRecipes.value.push({
    resultItemId: bindingTargetItem.value.id,
    resultItemName: bindingTargetItem.value.name ?? '',
    resultItemNameZh: bindingTargetItem.value.nameZh ?? '',
    resultItemInternalName: bindingTargetItem.value.internalName ?? '',
    resultItemImage: bindingTargetItem.value.imageUrl ?? '',
    resultItemImageUrl: bindingTargetItem.value.imageUrl ?? '',
    resultQuantity: 1,
    versionScope: '',
    notes: '',
    sourceProvider: 'manual_admin',
    sourcePage: '',
    sourceRevisionTimestamp: '',
    ingredients: [],
    stations: [{ ...bindingPayload, sortOrder: 1 }],
    conditions: [],
  })
  showBindingEditor.value = true
  showToast('已新增配方草稿，并预置当前制作站。请补充原料后保存。', 'success')
}

async function saveBindingRecipes() {
  if (!bindingTargetItem.value || !canManageBindings.value || !bindingIsDirty.value) return
  savingBindingContext.value = true
  try {
    const saved = await itemsStore.updateItemRecipes(bindingTargetItem.value.id, bindingRecipes.value, 'full')
    if (saved === null) return
    bindingLoadedRecipes.value = cloneRecipePayloads(toRecipeDrafts(saved))
    bindingRecipes.value = cloneRecipePayloads(bindingLoadedRecipes.value)
    bindingRecipeTree.value = await itemsStore.fetchItemRecipeTree(bindingTargetItem.value.id, 4)
    await loadStations({ page: stationsPagination.value.page })
    const latestEditingStation = stations.value.find((station) => station.id === editingId.value)
    if (latestEditingStation) {
      editingStation.value = latestEditingStation
      if (latestEditingStation.id) {
        await loadStationUsageItems(latestEditingStation.id, stationUsagePagination.value.page)
      }
    }
    await loadBindingStationOptions()
    showToast('当前物品的配方绑定已保存', 'success')
  } finally {
    savingBindingContext.value = false
  }
}

async function loadBindingStationOptions() {
  const result = await itemsStore.fetchCraftingStations(1, 500)
  bindingStationOptions.value = result.records
}

async function loadStations(options: { page?: number } = {}) {
  const page = options.page ?? stationsPagination.value.page
  const serial = ++loadSerial
  loadingStations.value = true
  try {
    const result = await itemsStore.fetchCraftingStations(page, stationsPagination.value.size, searchKeyword.value, usageFilter.value)
    if (serial !== loadSerial) return
    stations.value = result.records
    stationsPagination.value = result.pagination ?? { ...stationsPagination.value, page, total: result.records.length, totalPages: 1 }
    if (editingId.value != null) {
      const latestEditingStation = result.records.find((station) => station.id === editingId.value)
      if (latestEditingStation) {
        editingStation.value = latestEditingStation
      }
    }
  } finally {
    if (serial === loadSerial) {
      loadingStations.value = false
    }
  }
}

async function saveStation() {
  if (!form.nameEn?.trim() && !form.nameZh?.trim() && !form.internalName?.trim()) {
    showToast('至少填写一个制作站名称或 internalName', 'warning')
    return
  }
  if (savingStation.value) return

  const payload = {
    itemId: form.itemId ?? null,
    internalName: form.internalName?.trim() || '',
    nameEn: form.nameEn?.trim() || '',
    nameZh: form.nameZh?.trim() || '',
    stationType: form.stationType?.trim() || 'crafting_station',
    notes: form.notes?.trim() || '',
    imageUrl: form.imageUrl?.trim() || '',
    sortOrder: form.sortOrder ?? 0,
    status: form.status ?? 1,
  }

  savingStation.value = true
  try {
    const saved = editingId.value
      ? await itemsStore.updateCraftingStation(editingId.value, payload)
      : await itemsStore.createCraftingStation(payload)

    if (!saved) return
    await loadStations({ page: stationsPagination.value.page })
    await loadBindingStationOptions()
    const latestSaved = stations.value.find((station) => station.id === saved.id) ?? saved
    editStation(latestSaved, { force: true })
    syncEditorBaseline()
    await syncStationWorkspaceRoute()
  } finally {
    savingStation.value = false
  }
}

async function removeStation(station: CraftingStation) {
  if ((station.usageRecipeCount ?? 0) > 0 || deletingStationId.value != null) return
  if (!window.confirm(`确认删除制作站「${getStationLabel(station)}」吗？`)) return
  deletingStationId.value = station.id
  try {
    const ok = await itemsStore.deleteCraftingStation(station.id)
    if (!ok) return
    if (editingId.value === station.id) {
      resetEditor({ force: true })
    }
    const targetPage = stations.value.length === 1 && stationsPagination.value.page > 1
      ? stationsPagination.value.page - 1
      : stationsPagination.value.page
    await loadStations({ page: targetPage })
    await loadBindingStationOptions()
    await syncStationWorkspaceRoute()
  } finally {
    deletingStationId.value = null
  }
}

function handlePageChange(page: number) {
  void loadStations({ page }).then(() => syncStationWorkspaceRoute())
}

function findStationFromContext(options: { stationId?: number | null; stationItemId?: number | null; stationInternalName?: string }) {
  return stations.value.find((station) => {
    if (options.stationId != null && station.id === options.stationId) return true
    if (options.stationItemId != null && station.itemId === options.stationItemId) return true
    if (options.stationInternalName && trimText(station.internalName) === options.stationInternalName) return true
    return false
  }) ?? null
}

async function hydrateStationWorkspaceFromRoute(query: Record<string, any>) {
  if (isSyncingRoute.value) return

  isHydratingRoute.value = true
  try {
    searchKeyword.value = getQueryValue(query.search)
    usageFilter.value = parseUsageFilter(query.usageFilter)
    workspaceFocus.value = parseFocus(query.focus)

    const page = parsePositiveQueryNumber(query.page) ?? 1
    const usagePage = parsePositiveQueryNumber(query.usagePage) ?? 1
    stationsPagination.value.page = page
    await loadStations({ page })

    const stationId = parsePositiveQueryNumber(query.stationId)
    const stationItemId = parsePositiveQueryNumber(query.stationItemId)
    const stationInternalName = trimText(getQueryValue(query.stationInternalName))
    const matchedStation = findStationFromContext({ stationId, stationItemId, stationInternalName })

    if (matchedStation) {
      editStation(matchedStation, { force: true, focus: workspaceFocus.value })
    } else {
      resetEditor({ force: true })
    }

    const bindingItemId = parsePositiveQueryNumber(query.bindingItemId)
    if (bindingItemId && matchedStation) {
      await loadBindingItemContext(bindingItemId)
    } else if (!bindingItemId) {
      clearBindingContext()
    }

    if (matchedStation?.id) {
      stationUsagePagination.value.page = usagePage
      await loadStationUsageItems(matchedStation.id, usagePage)
    } else {
      stationUsagePagination.value = { ...stationUsagePagination.value, page: 1, total: 0, totalPages: 0 }
    }

    if (workspaceFocus.value === 'binding' && matchedStation) {
      queueMicrotask(() => focusBindingWorkspace())
    }
  } finally {
    isHydratingRoute.value = false
  }
}

onBeforeRouteLeave((_to, _from, next) => {
  if (allowConfirmedNavigation.value) {
    next()
    return
  }
  if (confirmDiscardChanges('离开制作站页面') && confirmDiscardBindingChanges('离开制作站页面')) {
    next()
    return
  }
  next(false)
})

onBeforeRouteUpdate((_to, _from, next) => {
  if (isSyncingRoute.value || allowConfirmedNavigation.value || confirmDiscardChanges('切换制作站工作区') && confirmDiscardBindingChanges('切换制作站工作区')) {
    next()
    return
  }
  next(false)
})

onMounted(async () => {
  resetEditor({ force: true })
  await loadBindingStationOptions()
  await hydrateStationWorkspaceFromRoute(route.query as Record<string, any>)
})

watch(() => form.itemId, (value) => {
  if (!value) {
    selectedItem.value = null
  } else if (selectedItem.value && selectedItem.value.id !== value) {
    selectedItem.value = null
  }
})

watch([searchKeyword, usageFilter], () => {
  if (isHydratingRoute.value) return
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    stationsPagination.value.page = 1
    await loadStations({ page: 1 })
    await syncStationWorkspaceRoute()
  }, 250)
})

watch(() => route.query, async (query) => {
  await hydrateStationWorkspaceFromRoute(query as Record<string, any>)
}, { deep: true })
</script>

<style scoped>
.stations-page {
  --recipes-radius-xl: 22px;
  --recipes-radius-lg: 18px;
  --recipes-surface: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent);
  --recipes-surface-soft: color-mix(in srgb, var(--color-bg) 88%, var(--color-bg-secondary));
  --recipes-surface-muted: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
  padding-bottom: 32px;
}
.stations-hero, .stations-layout { display: grid; gap: 18px; }

.stations-hero {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 40%),
    linear-gradient(135deg, color-mix(in srgb, var(--color-bg-secondary) 92%, transparent), var(--color-bg-secondary));
}
.stations-hero__copy { max-width: 780px; }
.stations-hero__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 20px;
}
.hero-stat {
  min-width: 0;
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-soft);
  box-shadow: var(--shadow-sm);
}
.hero-stat__label {
  font-size: .78rem;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.hero-stat__value {
  color: var(--color-text);
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.recipes-workspace-hero,
.workspace-panel {
  border-radius: var(--recipes-radius-xl);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  box-shadow: 0 18px 38px -34px color-mix(in srgb, var(--color-primary) 28%, transparent);
}
.workspace-panel { background: var(--recipes-surface); }
.workspace-panel--side {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 8%, transparent), transparent 44%),
    var(--recipes-surface);
}
.workspace-panel--main {
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg) 92%, transparent));
}
.page-head__title { margin: 0; font-size: clamp(1.9rem, 2vw, 2.35rem); line-height: 1.08; }
.page-head__subtitle { margin: 12px 0 0; max-width: 60ch; color: var(--color-text-secondary); font-size: .96rem; line-height: 1.7; }
.stations-hero__eyebrow { font-size: .78rem; letter-spacing: .18em; font-weight: 800; color: var(--color-primary); }
.stations-hero__actions, .view-switch, .station-list__head, .station-card__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.action-cluster { gap: 12px; align-items: center; justify-content: flex-end; }
.stations-hero__actions--stacked { align-content: start; max-width: 360px; }

.view-switch {
  margin: 0;
  gap: 10px;
  padding: 6px;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg) 80%, var(--color-bg-secondary));
}
.view-switch__link {
  min-height: 44px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid transparent;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 800;
  font-size: .92rem;
  background: transparent;
  transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
}

.view-switch__link:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border)); }
.view-switch__link--active { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light)); box-shadow: 0 14px 30px -24px color-mix(in srgb, var(--color-primary) 85%, transparent); }
.stations-layout { grid-template-columns: minmax(300px, 340px) minmax(0, 1fr); gap: 32px; margin-top: 10px; }
.stations-main { display: grid; gap: 22px; align-content: start; min-width: 0; }

.station-editor {
  position: sticky;
  top: calc(var(--header-height) + 16px);
  align-self: start;
}

.station-editor__grid, .station-list__grid { display: grid; gap: 14px; }
.station-editor__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.station-editor { padding: 28px 28px 30px; }
.station-editor .field { gap: 10px; }
.station-editor .field__label { font-size: .94rem; letter-spacing: .01em; }

.field { display: grid; gap: 8px; }
.field--full { grid-column: 1 / -1; }
.field__label { color: var(--color-text); font-size: .92rem; font-weight: 700; }
.field__hint {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, transparent);
  color: var(--color-text-secondary);
  font-size: .88rem;
  line-height: 1.6;
}

.input, .textarea {
  width: 100%;
  min-height: 46px;
  padding: 11px 13px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-muted);
  color: var(--color-text);
  transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
}

.input:focus,
.textarea:focus,
.btn:focus-visible,
.view-switch__link:focus-visible,
.binding-usage-card:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.textarea { min-height: 100px; resize: vertical; }
.linked-item-card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-secondary));
}

.linked-item-card__image {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  object-fit: contain;
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
}

.linked-item-card__image--fallback {
  display: grid;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: .82rem;
  font-weight: 700;
}

.linked-item-card__copy { display: grid; gap: 4px; min-width: 0; }
.linked-item-card__copy strong { color: var(--color-text); }
.linked-item-card__copy span { color: var(--color-text-secondary); font-size: .88rem; overflow-wrap: anywhere; }
.linked-item-card--binding { align-items: center; }
.usage-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-primary-muted));
  background: var(--recipes-surface-soft);
}
.usage-panel__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.usage-stat {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--recipes-surface-muted);
}
.usage-stat span { color: var(--color-text-secondary); font-size: .84rem; }
.usage-stat strong { color: var(--color-text); font-size: 1.12rem; }
.usage-panel__empty { margin: 0; color: var(--color-text-secondary); font-size: .9rem; }
.usage-panel__actions { display: flex; justify-content: flex-end; }
.binding-panel {
  display: grid;
  gap: 22px;
  padding: 20px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent 42%),
    var(--recipes-surface);
}
.binding-panel__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.binding-panel__head { padding-bottom: 4px; }
.binding-panel__head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.binding-panel__head strong { color: var(--color-text); }
.binding-panel__head p,
.binding-panel__status { margin: 4px 0 0; color: var(--color-text-secondary); font-size: .88rem; line-height: 1.6; }
.binding-panel__current-station {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--recipes-surface-soft));
}
.binding-panel__current-station-image {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  object-fit: contain;
}
.binding-panel__current-station-image--fallback {
  display: grid;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: .72rem;
  font-weight: 800;
}
.binding-panel__current-station-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.binding-panel__current-station-label {
  color: var(--color-primary);
  font-size: .76rem;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.binding-panel__current-station-copy strong {
  color: var(--color-text);
  font-size: 1rem;
  line-height: 1.3;
}
.binding-panel__current-station-copy small {
  color: var(--color-text-secondary);
  font-size: .84rem;
}
.binding-panel__quick-picks { display: grid; gap: 10px; }
.binding-panel__quick-picks-label { color: var(--color-text-secondary); font-size: .88rem; font-weight: 700; }
.binding-panel__usage-library {
  display: grid;
  gap: 16px;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-soft);
}
.binding-panel__usage-library-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.binding-panel__usage-library-head h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.06rem;
}
.binding-panel__usage-library-head p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: .88rem;
  line-height: 1.6;
}
.binding-usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.binding-usage-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-muted);
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease;
}
.binding-usage-card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); }
.binding-usage-card__image {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  object-fit: contain;
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
}
.binding-usage-card__image--fallback {
  display: grid;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: .8rem;
  font-weight: 700;
}
.binding-usage-card__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.binding-usage-card__copy strong {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.binding-usage-card__copy span {
  color: var(--color-text-secondary);
  font-size: .84rem;
}
.binding-panel__pagination { margin-top: 4px; }
.binding-panel__note {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: .84rem;
  font-weight: 700;
  white-space: normal;
  background: var(--recipes-surface-muted);
}
.binding-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  background: var(--recipes-surface-soft);
}
.binding-toolbar__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.binding-mini-stat {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--recipes-surface-muted);
}
.binding-mini-stat span { color: var(--color-text-secondary); font-size: .84rem; }
.binding-mini-stat strong { color: var(--color-text); font-size: 1rem; }
.binding-toolbar__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.binding-flow-summary {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-bg-secondary));
}
.binding-flow-summary__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.binding-flow-summary__tree {
  padding: 14px;
  border-radius: 16px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  background: var(--recipes-surface-muted);
}
.binding-recipe-list { display: grid; gap: 14px; }
.binding-recipe-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-soft);
}
.binding-recipe-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.binding-recipe-card__head strong { color: var(--color-text); }
.binding-recipe-card__head p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: .88rem; line-height: 1.5; }
.binding-recipe-card__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.recipe-pill {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: .82rem;
  font-weight: 700;
  background: var(--recipes-surface-muted);
}
.recipe-pill--active {
  border-color: color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-secondary));
}
.binding-editor {
  padding-top: 6px;
  border-top: 1px dashed color-mix(in srgb, var(--color-border) 90%, transparent);
}
.station-list__head { justify-content: space-between; align-items: center; margin-bottom: 18px; }
.station-list__tools { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.station-list__search { flex: 1 1 240px; min-width: 0; }
.station-list__filter { flex: 0 1 140px; min-width: 0; }
.station-list__status {
  padding: 18px;
  border-radius: 16px;
  border: 1px dashed var(--color-border);
  color: var(--color-text-secondary);
  font-size: .9rem;
}
.station-list__pagination { margin-top: 18px; }

.station-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 16px;
  border-radius: var(--recipes-radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-soft);
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease, box-shadow .18s ease;
}
.station-card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border)); }
.station-card--active {
  border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--recipes-surface-soft));
  box-shadow: 0 18px 34px -28px color-mix(in srgb, var(--color-primary) 48%, transparent);
}

.station-card__image,
.station-card__fallback {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
  object-fit: contain;
  display: grid;
  place-items: center;
}

.station-card__copy { display: grid; gap: 4px; min-width: 0; }
.station-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.station-card__copy strong { color: var(--color-text); }
.station-card__copy span { color: var(--color-text-secondary); font-size: .88rem; overflow-wrap: anywhere; line-height: 1.5; }
.station-card__active-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--recipes-surface-soft));
  color: var(--color-primary);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.station-card__usage {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed color-mix(in srgb, var(--color-border) 90%, transparent);
}
.station-card__usage-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.station-card__usage-empty { color: var(--color-text-secondary); font-size: .88rem; }
.usage-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
.usage-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface-muted);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  text-decoration: none;
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease;
}
.usage-chip:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border)); }
.usage-chip--disabled {
  cursor: default;
  opacity: .78;
}
.usage-chip--active {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-secondary));
}
.usage-chip--compact { max-width: 100%; }
.usage-chip__image {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  object-fit: contain;
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
}
.usage-chip span {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: .84rem;
}
.usage-chip small { color: var(--color-text-secondary); font-size: .78rem; }
.usage-more {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px dashed var(--color-border);
  color: var(--color-text-secondary);
  font-size: .84rem;
  font-weight: 700;
}
.station-card__binding { display: grid; gap: 2px; }
.station-card__binding-label { color: var(--color-primary) !important; font-weight: 700; }

.btn {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid transparent;
  font-size: .92rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease, box-shadow .18s ease;
}
.btn:hover { transform: translateY(-1px); }

.btn-secondary { background: var(--recipes-surface-muted); color: var(--color-text); border-color: color-mix(in srgb, var(--color-border) 92%, transparent); }
.btn-strong { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light)); color: #f8fffe; box-shadow: 0 18px 32px -24px color-mix(in srgb, var(--color-primary) 88%, transparent); }
.btn-link { border: none; background: none; color: var(--color-primary); cursor: pointer; padding: 0; font-weight: 700; }
.btn-link--danger { color: var(--color-danger); }
.btn-link:disabled { opacity: .45; cursor: not-allowed; }

@media (max-width: 1240px) {
  .stations-hero,
  .stations-layout,
  .stations-hero__stats,
  .station-editor__grid {
    grid-template-columns: 1fr;
  }

  .station-editor { position: static; }
  .station-card { grid-template-columns: 48px minmax(0, 1fr); }
  .station-card__actions { grid-column: 1 / -1; }
  .linked-item-card { grid-template-columns: 52px minmax(0, 1fr); }
  .usage-panel__stats { grid-template-columns: 1fr; }
  .binding-toolbar,
  .binding-toolbar__stats {
    grid-template-columns: 1fr;
  }
  .binding-flow-summary__meta { grid-template-columns: 1fr; }
  .binding-panel__head,
  .binding-panel__usage-library-head,
  .binding-recipe-card__head,
  .binding-recipe-card__actions { grid-template-columns: 1fr; display: grid; }
  .binding-toolbar__actions,
  .binding-panel__head-actions,
  .usage-panel__actions { justify-content: flex-start; }
}
@media (max-width: 820px) {
  .view-switch { width: 100%; }
  .view-switch__link { flex: 1 1 calc(50% - 10px); }
  .binding-usage-grid { grid-template-columns: 1fr; }
}
</style>
