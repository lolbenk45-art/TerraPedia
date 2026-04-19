<template>
  <section class="recipe-editor">
    <div class="recipe-editor__head">
      <div>
        <h3>配方编辑</h3>
        <p>按物品整体维护配方、原料和工作台。当前保存策略为整体替换。</p>
      </div>
      <button type="button" class="btn btn-secondary" @click="addRecipe">新增配方</button>
    </div>

    <div v-if="drafts.length" class="recipe-editor__list">
      <article v-for="(recipe, recipeIndex) in drafts" :key="recipe._key" class="recipe-card">
        <header class="recipe-card__head">
          <div class="recipe-card__title">
            <strong>配方 #{{ recipeIndex + 1 }}</strong>
            <span>{{ getRecipeLabel(recipe) }}</span>
            <div class="recipe-card__stats">
              <span class="recipe-stat">产出 ×{{ recipe.resultQuantity || 1 }}</span>
              <span class="recipe-stat">{{ recipe.ingredients.length }} 个原料</span>
              <span class="recipe-stat">{{ recipe.stations.length }} 个站点关系</span>
              <span class="recipe-stat">{{ recipe.conditions.length }} 个条件</span>
            </div>
          </div>
          <div class="recipe-card__head-actions">
            <button type="button" class="btn btn-ghost btn--compact recipe-card__toggle" @click="toggleRecipe(recipe._key)">
              {{ isRecipeOpen(recipe._key) ? '收起' : '展开' }}
            </button>
            <button type="button" class="btn btn-ghost btn--compact recipe-card__toggle" @click="duplicateRecipe(recipeIndex)">
              复制配方
            </button>
            <button type="button" class="btn-link btn-link--danger" @click="removeRecipe(recipeIndex)">删除配方</button>
          </div>
        </header>

        <div v-if="isRecipeOpen(recipe._key)" class="recipe-card__content">
          <div class="recipe-card__grid recipe-card__grid--quick">
            <div class="field field--full">
              <span class="field__label">产出预览</span>
              <div class="recipe-entity-preview">
                <img v-if="recipe.resultItemImageUrl || recipe.resultItemImage" :src="recipe.resultItemImageUrl || recipe.resultItemImage" class="recipe-entity-preview__image" alt="" />
                <div v-else class="recipe-entity-preview__fallback">IT</div>
                <div class="recipe-entity-preview__copy">
                  <strong>{{ recipe.resultItemNameZh || recipe.resultItemName || recipe.resultItemInternalName || '当前物品' }}</strong>
                  <span v-if="recipe.resultItemNameZh && recipe.resultItemName">{{ recipe.resultItemName }}</span>
                </div>
              </div>
            </div>
            <label class="field">
              <span class="field__label">产出数量</span>
              <input v-model.number="recipe.resultQuantity" type="number" min="1" class="input" placeholder="1" />
            </label>
            <div class="field field--toggle">
              <span class="field__label">高级信息</span>
              <button type="button" class="btn btn-ghost btn--compact recipe-card__toggle recipe-card__toggle--inline" @click="toggleRecipeMeta(recipe._key)">
                {{ isRecipeMetaOpen(recipe._key) ? '收起高级字段' : '展开高级字段' }}
              </button>
            </div>
          </div>

          <div v-if="isRecipeMetaOpen(recipe._key)" class="recipe-card__grid recipe-card__grid--meta">
            <label class="field">
              <span class="field__label">版本范围</span>
              <input v-model="recipe.versionScope" type="text" class="input" placeholder="例如：Desktop version only" />
            </label>
            <label class="field">
              <span class="field__label">来源提供方</span>
              <select v-model="recipe.sourceProvider" class="input">
                <option v-for="option in recipeSourceProviderOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">来源页面</span>
              <input v-model="recipe.sourcePage" type="text" class="input" placeholder="来源页面" />
            </label>
            <label class="field field--full">
              <span class="field__label">备注</span>
              <textarea v-model="recipe.notes" class="input textarea" rows="3" placeholder="配方备注"></textarea>
            </label>
          </div>

          <section class="recipe-block recipe-block--ingredients">
            <div class="recipe-block__head">
              <div>
                <h4>原料</h4>
                <p>默认只做两件事：搜到原料，然后填数量。其余字段收在高级模式里。</p>
              </div>
              <button type="button" class="btn btn-secondary" @click="addIngredient(recipeIndex)">新增原料</button>
            </div>
            <div v-if="recipe.ingredients.length" class="recipe-block__list">
              <div v-for="(ingredient, ingredientIndex) in recipe.ingredients" :key="ingredient._key" class="recipe-line">
                <div class="recipe-line__summary">
                  <div class="recipe-line__summary-main">
                    <strong>{{ getIngredientLabel(ingredient) }}</strong>
                    <span>{{ getIngredientSubLabel(ingredient) }}</span>
                  </div>
                  <div class="recipe-line__chips">
                    <span class="recipe-chip">{{ ingredient.ingredientGroupType || 'item' }}</span>
                    <span class="recipe-chip recipe-chip--accent">{{ getIngredientQuantityLabel(ingredient) }}</span>
                  </div>
                </div>
                <div class="recipe-line__grid">
                  <div v-if="ingredient.itemImageUrl || ingredient.itemImage || ingredient.itemNameZh || ingredient.itemName || ingredient.itemInternalName" class="field field--full">
                    <span class="field__label">原料预览</span>
                    <div class="recipe-entity-preview recipe-entity-preview--compact">
                      <img v-if="ingredient.itemImageUrl || ingredient.itemImage" :src="ingredient.itemImageUrl || ingredient.itemImage" class="recipe-entity-preview__image" alt="" />
                      <div v-else class="recipe-entity-preview__fallback">IT</div>
                      <div class="recipe-entity-preview__copy">
                        <strong>{{ ingredient.itemNameZh || ingredient.itemName || ingredient.ingredientNameRaw || '未命名原料' }}</strong>
                        <span v-if="ingredient.itemNameZh && ingredient.itemName">{{ ingredient.itemName }}</span>
                        <span v-else-if="ingredient.itemInternalName">{{ ingredient.itemInternalName }}</span>
                      </div>
                    </div>
                  </div>
                  <label class="field field--full">
                    <span class="field__label">搜索原料物品</span>
                    <AdminItemLookupInput
                      :model-value="ingredientLookupQueries[ingredient._key] ?? ''"
                      :update-on-input="false"
                      placeholder="输入中文、英文或 internalName 搜索原料"
                      @update:model-value="updateIngredientLookupQuery(ingredient._key, $event)"
                      @pick="applyIngredientSuggestion(recipeIndex, ingredientIndex, $event)"
                    />
                  </label>
                  <label class="field field--quantity">
                    <span class="field__label">显示数量</span>
                    <input v-model="ingredient.quantityText" type="text" class="input" placeholder="例如：10 / Any Wood" />
                  </label>
                </div>
                <div v-if="isIngredientAdvancedOpen(ingredient._key)" class="recipe-line__grid recipe-line__grid--advanced">
                  <label class="field">
                    <span class="field__label">物品 ID</span>
                    <input v-model.number="ingredient.ingredientItemId" type="number" min="1" class="input" placeholder="可选" />
                  </label>
                  <label class="field">
                    <span class="field__label">原料名称</span>
                    <input v-model="ingredient.ingredientNameRaw" type="text" class="input" placeholder="例如：Iron Bar" />
                  </label>
                  <label class="field">
                    <span class="field__label">类型</span>
                    <select v-model="ingredient.ingredientGroupType" class="input">
                      <option value="item">item</option>
                      <option value="group">group</option>
                    </select>
                  </label>
                  <label class="field">
                    <span class="field__label">最小值</span>
                    <input v-model.number="ingredient.quantityMin" type="number" min="0" class="input" placeholder="可选" />
                  </label>
                  <label class="field">
                    <span class="field__label">最大值</span>
                    <input v-model.number="ingredient.quantityMax" type="number" min="0" class="input" placeholder="可选" />
                  </label>
                </div>
                <div class="recipe-line__actions">
                  <button type="button" class="btn-link" @click="toggleIngredientAdvanced(ingredient._key)">
                    {{ isIngredientAdvancedOpen(ingredient._key) ? '收起高级项' : '高级项' }}
                  </button>
                  <button type="button" class="btn-link btn-link--danger" @click="removeIngredient(recipeIndex, ingredientIndex)">删除原料</button>
                </div>
              </div>
            </div>
            <p v-else class="empty-hint">当前配方还没有原料</p>
          </section>

          <section class="recipe-block recipe-block--stations">
            <div class="recipe-block__head">
              <div>
                <h4>工作台 / 环境</h4>
                <p>正常流程优先选已有制作站；环境关系也在这里维护，手动名称与 legacy 字段收进高级模式。</p>
              </div>
              <div class="recipe-block__actions">
                <button type="button" class="btn btn-secondary" @click="addStation(recipeIndex)">新增工作台</button>
                <button
                  v-if="recipeIndex > 0 && drafts[recipeIndex - 1]?.stations?.length"
                  type="button"
                  class="btn btn-secondary"
                  @click="copyPreviousRecipeStations(recipeIndex)"
                >
                  复制上一条工作台
                </button>
              </div>
            </div>
            <div v-if="recipe.stations.length" class="recipe-block__list">
              <div v-for="(station, stationIndex) in recipe.stations" :key="station._key" class="recipe-line">
                <div class="recipe-line__summary">
                  <div class="recipe-line__summary-main">
                    <strong>{{ getStationLabel(station) }}</strong>
                    <span>{{ getStationSummary(station) }}</span>
                  </div>
                  <div class="recipe-line__chips">
                    <span class="recipe-chip">{{ station.stationItemId ? `ID ${station.stationItemId}` : '未绑定 ID' }}</span>
                    <span v-if="station.stationType === 'environment'" class="recipe-chip">Environment</span>
                    <span v-if="station.isAlternative" class="recipe-chip recipe-chip--accent">Alternative</span>
                  </div>
                </div>
                <div class="recipe-line__grid recipe-line__grid--station">
                  <label class="field field--full">
                    <span class="field__label">选择制作站</span>
                    <select class="input" :value="station.stationId ?? ''" @change="applyStationSelection(recipeIndex, stationIndex, $event)">
                      <option value="">未绑定制作站</option>
                      <option v-for="craftingStation in props.craftingStations || []" :key="craftingStation.id" :value="craftingStation.id">
                        {{ craftingStation.nameZh || craftingStation.nameEn || craftingStation.internalName || `#${craftingStation.id}` }}
                      </option>
                    </select>
                  </label>
                  <label class="field field--checkbox">
                    <span class="field__label">可替代</span>
                    <input v-model="station.isAlternative" type="checkbox" />
                  </label>
                  <div v-if="station.itemImageUrl || station.itemImage || station.itemNameZh || station.itemName || station.itemInternalName" class="field field--full">
                    <span class="field__label">工作台预览</span>
                    <div class="recipe-entity-preview recipe-entity-preview--compact">
                      <img v-if="station.itemImageUrl || station.itemImage" :src="station.itemImageUrl || station.itemImage" class="recipe-entity-preview__image" alt="" />
                      <div v-else class="recipe-entity-preview__fallback">IT</div>
                      <div class="recipe-entity-preview__copy">
                        <strong>{{ station.itemNameZh || station.itemName || station.stationNameRaw || '未命名工作台' }}</strong>
                        <span v-if="station.itemNameZh && station.itemName">{{ station.itemName }}</span>
                        <span v-else-if="station.itemInternalName">{{ station.itemInternalName }}</span>
                        <span v-if="station.stationType === 'environment'">环境关系</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="isStationAdvancedOpen(station._key)" class="recipe-line__grid recipe-line__grid--advanced">
                  <label class="field field--full">
                    <span class="field__label">搜索工作台物品</span>
                    <AdminItemLookupInput
                      :model-value="stationLookupQueries[station._key] ?? ''"
                      :update-on-input="false"
                      placeholder="输入中文、英文或 internalName 搜索工作台"
                      @update:model-value="updateStationLookupQuery(station._key, $event)"
                      @pick="applyStationSuggestion(recipeIndex, stationIndex, $event)"
                    />
                  </label>
                  <label class="field">
                    <span class="field__label">物品 ID</span>
                    <input v-model.number="station.stationItemId" type="number" min="1" class="input" placeholder="可选" />
                  </label>
                  <label class="field">
                    <span class="field__label">工作台名称</span>
                    <input
                      v-model="station.stationNameRaw"
                      type="text"
                      class="input"
                      :disabled="Boolean(station.stationId)"
                      placeholder="例如：Iron Anvil"
                    />
                  </label>
                </div>
                <div class="recipe-line__actions">
                  <button type="button" class="btn-link" @click="toggleStationAdvanced(station._key)">
                    {{ isStationAdvancedOpen(station._key) ? '收起高级项' : '手动 / Legacy' }}
                  </button>
                  <button type="button" class="btn-link btn-link--danger" @click="removeStation(recipeIndex, stationIndex)">删除工作台</button>
                </div>
              </div>
            </div>
            <p v-else class="empty-hint">当前配方还没有工作台</p>
          </section>

          <section class="recipe-block recipe-block--conditions">
            <div class="recipe-block__head">
              <div>
                <h4>制作条件</h4>
                <p>把群系、环境、月相等前置条件独立维护，不再伪装成工作台。</p>
              </div>
              <button type="button" class="btn btn-secondary" @click="addCondition(recipeIndex)">新增条件</button>
            </div>
            <div v-if="recipe.conditions.length" class="recipe-block__list">
              <div v-for="(condition, conditionIndex) in recipe.conditions" :key="condition._key" class="recipe-line">
                <div class="recipe-line__summary">
                  <div class="recipe-line__summary-main">
                    <strong>{{ getConditionLabel(condition) }}</strong>
                    <span>{{ getConditionSubLabel(condition) }}</span>
                  </div>
                  <div class="recipe-line__chips">
                    <span class="recipe-chip">{{ condition.refType || '未选类型' }}</span>
                    <span class="recipe-chip recipe-chip--accent">{{ condition.requirementRole || 'required' }}</span>
                  </div>
                </div>
                <div class="recipe-line__grid recipe-line__grid--condition">
                  <label class="field">
                    <span class="field__label">条件类型</span>
                    <select v-model="condition.refType" class="input">
                      <option value="">请选择</option>
                      <option value="BIOME">群系 / BIOME</option>
                      <option value="WORLD_CONTEXT">世界条件 / WORLD_CONTEXT</option>
                    </select>
                  </label>
                  <label class="field">
                    <span class="field__label">目标条件</span>
                    <select v-model.number="condition.refId" class="input">
                      <option :value="null">请选择条件</option>
                      <option v-for="option in getConditionOptions(condition)" :key="`${condition.refType}-${option.id}`" :value="option.id">
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
                  <label class="field">
                    <span class="field__label">角色</span>
                    <select v-model="condition.requirementRole" class="input">
                      <option value="required">required</option>
                      <option value="optional">optional</option>
                    </select>
                  </label>
                  <label class="field field--full">
                    <span class="field__label">备注</span>
                    <input v-model="condition.notes" type="text" class="input" placeholder="例如：墓地中才能制作 / 满月时售卖" />
                  </label>
                </div>
                <div class="recipe-line__actions">
                  <button type="button" class="btn-link btn-link--danger" @click="removeCondition(recipeIndex, conditionIndex)">删除条件</button>
                </div>
              </div>
            </div>
            <p v-else class="empty-hint">当前配方没有额外制作条件</p>
          </section>
        </div>
      </article>
    </div>
    <p v-else class="empty-hint">当前物品没有配方，点击右上角可新增。</p>
  </section>
</template>

<script setup lang="ts">
import AdminItemLookupInput from '~/components/AdminItemLookupInput.vue'
import { useSupportDomainsStore } from '~/stores/supportDomains'
import type {
  CraftingStation,
  ItemRecipeConditionPayload,
  ItemRecipeIngredientPayload,
  ItemRecipePayload,
  ItemRecipeStationPayload,
} from '~/stores/items'

type EditableRecipeIngredient = ItemRecipeIngredientPayload & { _key: string }
type EditableRecipeStation = ItemRecipeStationPayload & { _key: string }
type EditableRecipeCondition = ItemRecipeConditionPayload & { _key: string }
type EditableRecipe = Omit<ItemRecipePayload, 'ingredients' | 'stations' | 'conditions'> & {
  _key: string
  ingredients: EditableRecipeIngredient[]
  stations: EditableRecipeStation[]
  conditions: EditableRecipeCondition[]
}
type SuggestionItem = {
  id: number
  name: string
  nameZh?: string
  internalName?: string
  image?: string
}
type ConditionOption = { id: number; label: string; contextType?: string }

const props = defineProps<{
  modelValue: ItemRecipePayload[]
  craftingStations?: CraftingStation[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ItemRecipePayload[]]
}>()

const drafts = ref<EditableRecipe[]>([])
const recipeExpanded = reactive<Record<string, boolean>>({})
const recipeMetaExpanded = reactive<Record<string, boolean>>({})
const ingredientAdvancedExpanded = reactive<Record<string, boolean>>({})
const stationAdvancedExpanded = reactive<Record<string, boolean>>({})
const ingredientLookupQueries = reactive<Record<string, string>>({})
const stationLookupQueries = reactive<Record<string, string>>({})
const supportDomainsStore = useSupportDomainsStore()
const biomeOptions = ref<ConditionOption[]>([])
const worldContextOptions = computed<ConditionOption[]>(() => supportDomainsStore.worldContextOptions)
let syncingFromProps = false
const recipeSourceProviderOptions = [
  { value: 'manual_admin', label: 'manual_admin' },
  { value: 'wiki_gg', label: 'wiki_gg' },
  { value: 'wiki_gg_zh_reference', label: 'wiki_gg_zh_reference' },
  { value: 'wiki_zh', label: 'wiki_zh' },
]

const createKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createIngredient = (): EditableRecipeIngredient => ({
  _key: createKey(),
  ingredientItemId: null,
  ingredientNameRaw: '',
  ingredientGroupType: 'item',
  quantityMin: null,
  quantityMax: null,
  quantityText: '1',
  sortOrder: null,
})

const createStation = (): EditableRecipeStation => ({
  _key: createKey(),
  stationId: null,
  stationItemId: null,
  stationNameRaw: '',
  stationType: 'crafting_station',
  isAlternative: false,
  sortOrder: null,
})

const createCondition = (): EditableRecipeCondition => ({
  _key: createKey(),
  refType: 'WORLD_CONTEXT',
  refId: null,
  requirementRole: 'required',
  notes: '',
  sortOrder: null,
})

const createRecipe = (): EditableRecipe => ({
  _key: createKey(),
  resultQuantity: 1,
  versionScope: '',
  notes: '',
  sourceProvider: 'manual_admin',
  sourcePage: '',
  sourceRevisionTimestamp: '',
  ingredients: [createIngredient()],
  stations: [createStation()],
  conditions: [],
})

const cloneRecipes = (recipes: ItemRecipePayload[] = []): EditableRecipe[] => (
  Array.isArray(recipes)
    ? recipes.map((recipe) => ({
        _key: createKey(),
        resultItemId: recipe.resultItemId ?? null,
        resultItemName: recipe.resultItemName ?? '',
        resultItemNameZh: recipe.resultItemNameZh ?? '',
        resultItemInternalName: recipe.resultItemInternalName ?? '',
        resultItemImage: recipe.resultItemImage ?? '',
        resultItemImageUrl: recipe.resultItemImageUrl ?? '',
        resultQuantity: recipe.resultQuantity ?? 1,
        versionScope: recipe.versionScope ?? '',
        notes: recipe.notes ?? '',
        sourceProvider: recipe.sourceProvider ?? 'manual_admin',
        sourcePage: recipe.sourcePage ?? '',
        sourceRevisionTimestamp: recipe.sourceRevisionTimestamp ?? '',
        ingredients: Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((ingredient) => ({
              _key: createKey(),
              ingredientItemId: ingredient.ingredientItemId ?? null,
              ingredientNameRaw: ingredient.ingredientNameRaw ?? '',
              ingredientGroupType: ingredient.ingredientGroupType ?? 'item',
              quantityMin: ingredient.quantityMin ?? null,
              quantityMax: ingredient.quantityMax ?? null,
              quantityText: ingredient.quantityText ?? '',
              sortOrder: ingredient.sortOrder ?? null,
              itemName: ingredient.itemName ?? '',
              itemNameZh: ingredient.itemNameZh ?? '',
              itemInternalName: ingredient.itemInternalName ?? '',
              itemImage: ingredient.itemImage ?? '',
              itemImageUrl: ingredient.itemImageUrl ?? '',
            }))
          : [],
        stations: Array.isArray(recipe.stations)
          ? recipe.stations.map((station) => ({
              _key: createKey(),
              stationId: station.stationId ?? null,
              stationItemId: station.stationItemId ?? null,
              stationNameRaw: station.stationNameRaw ?? '',
              stationType: station.stationType ?? 'crafting_station',
              isAlternative: station.isAlternative ?? false,
              sortOrder: station.sortOrder ?? null,
              itemName: station.itemName ?? '',
              itemNameZh: station.itemNameZh ?? '',
              itemInternalName: station.itemInternalName ?? '',
              itemImage: station.itemImage ?? '',
              itemImageUrl: station.itemImageUrl ?? '',
            }))
          : [],
        conditions: Array.isArray(recipe.conditions)
          ? recipe.conditions.map((condition) => ({
              _key: createKey(),
              refType: condition.refType ?? 'WORLD_CONTEXT',
              refId: condition.refId ?? null,
              requirementRole: condition.requirementRole ?? 'required',
              notes: condition.notes ?? '',
              sortOrder: condition.sortOrder ?? null,
              refCode: condition.refCode ?? '',
              refNameEn: condition.refNameEn ?? '',
              refNameZh: condition.refNameZh ?? '',
              refContextType: condition.refContextType ?? '',
            }))
          : [],
      }))
    : []
)

const serializeRecipes = (recipes: EditableRecipe[]): ItemRecipePayload[] => (
  recipes.map((recipe) => ({
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
    ingredients: recipe.ingredients.map(({ _key, ...ingredient }) => ingredient),
    stations: recipe.stations.map(({ _key, ...station }) => station),
    conditions: recipe.conditions.map(({ _key, ...condition }) => condition),
  }))
)

watch(
  () => props.modelValue,
  (value) => {
    syncingFromProps = true
    drafts.value = cloneRecipes(value)
    queueMicrotask(() => { syncingFromProps = false })
  },
  { immediate: true, deep: true }
)

watch(
  drafts,
  (value) => {
    if (syncingFromProps) return
    emit('update:modelValue', serializeRecipes(value))
  },
  { deep: true }
)

watch(
  () => drafts.value.map((recipe) => recipe._key),
  (keys) => {
    const active = new Set(keys)
    Object.keys(recipeExpanded).forEach((key) => {
      if (!active.has(key)) {
        delete recipeExpanded[key]
      }
    })
    keys.forEach((key, index) => {
      if (!(key in recipeExpanded)) {
        recipeExpanded[key] = index === 0
      }
      if (!(key in recipeMetaExpanded)) {
        recipeMetaExpanded[key] = false
      }
    })
  },
  { immediate: true }
)

watch(
  drafts,
  (recipes) => {
    const ingredientKeys = new Set(recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient._key)))
    Object.keys(ingredientAdvancedExpanded).forEach((key) => {
      if (!ingredientKeys.has(key)) {
        delete ingredientAdvancedExpanded[key]
      }
    })
    ingredientKeys.forEach((key) => {
      if (!(key in ingredientAdvancedExpanded)) {
        ingredientAdvancedExpanded[key] = false
      }
      if (!(key in ingredientLookupQueries)) {
        ingredientLookupQueries[key] = ''
      }
    })
    Object.keys(ingredientLookupQueries).forEach((key) => {
      if (!ingredientKeys.has(key)) {
        delete ingredientLookupQueries[key]
      }
    })

    const stationKeys = new Set(recipes.flatMap((recipe) => recipe.stations.map((station) => station._key)))
    Object.keys(stationAdvancedExpanded).forEach((key) => {
      if (!stationKeys.has(key)) {
        delete stationAdvancedExpanded[key]
      }
    })
    stationKeys.forEach((key) => {
      if (!(key in stationAdvancedExpanded)) {
        stationAdvancedExpanded[key] = false
      }
      if (!(key in stationLookupQueries)) {
        stationLookupQueries[key] = ''
      }
    })
    Object.keys(stationLookupQueries).forEach((key) => {
      if (!stationKeys.has(key)) {
        delete stationLookupQueries[key]
      }
    })
  },
  { immediate: true, deep: true }
)

const updateIngredientLookupQuery = (key: string, value: string) => {
  ingredientLookupQueries[key] = value
}

const updateStationLookupQuery = (key: string, value: string) => {
  stationLookupQueries[key] = value
}

const addRecipe = () => {
  const recipe = createRecipe()
  drafts.value.push(recipe)
  recipeExpanded[recipe._key] = true
  recipeMetaExpanded[recipe._key] = false
}

const removeRecipe = (recipeIndex: number) => {
  drafts.value.splice(recipeIndex, 1)
}

const duplicateRecipe = (recipeIndex: number) => {
  const recipe = drafts.value[recipeIndex]
  if (!recipe) return
  const serialized = serializeRecipes([recipe])
  const source = serialized[0]
  if (!source) return
  const duplicatedRecipes = cloneRecipes([source])
  const duplicated = duplicatedRecipes[0]
  if (!duplicated) return
  drafts.value.splice(recipeIndex + 1, 0, duplicated)
  recipeExpanded[duplicated._key] = true
}

const isRecipeOpen = (key: string) => recipeExpanded[key] ?? false
const isRecipeMetaOpen = (key: string) => recipeMetaExpanded[key] ?? false

const toggleRecipe = (key: string) => {
  recipeExpanded[key] = !isRecipeOpen(key)
}

const toggleRecipeMeta = (key: string) => {
  recipeMetaExpanded[key] = !isRecipeMetaOpen(key)
}

const addIngredient = (recipeIndex: number) => {
  drafts.value[recipeIndex]?.ingredients.push(createIngredient())
}

const removeIngredient = (recipeIndex: number, ingredientIndex: number) => {
  drafts.value[recipeIndex]?.ingredients.splice(ingredientIndex, 1)
}

const addStation = (recipeIndex: number) => {
  drafts.value[recipeIndex]?.stations.push(createStation())
}

const copyPreviousRecipeStations = (recipeIndex: number) => {
  const currentRecipe = drafts.value[recipeIndex]
  const previousRecipe = drafts.value[recipeIndex - 1]
  if (!currentRecipe || !previousRecipe?.stations?.length) return
  currentRecipe.stations = previousRecipe.stations.map(({ _key, ...station }) => ({
    ...station,
    _key: createKey(),
  }))
}

const removeStation = (recipeIndex: number, stationIndex: number) => {
  drafts.value[recipeIndex]?.stations.splice(stationIndex, 1)
}

const addCondition = (recipeIndex: number) => {
  drafts.value[recipeIndex]?.conditions.push(createCondition())
}

const removeCondition = (recipeIndex: number, conditionIndex: number) => {
  drafts.value[recipeIndex]?.conditions.splice(conditionIndex, 1)
}

const isIngredientAdvancedOpen = (key: string) => ingredientAdvancedExpanded[key] ?? false
const toggleIngredientAdvanced = (key: string) => {
  ingredientAdvancedExpanded[key] = !isIngredientAdvancedOpen(key)
}

const isStationAdvancedOpen = (key: string) => stationAdvancedExpanded[key] ?? false
const toggleStationAdvanced = (key: string) => {
  stationAdvancedExpanded[key] = !isStationAdvancedOpen(key)
}

const applyIngredientSuggestion = (recipeIndex: number, ingredientIndex: number, item: SuggestionItem) => {
  const ingredient = drafts.value[recipeIndex]?.ingredients[ingredientIndex]
  if (!ingredient) return
  ingredient.ingredientItemId = item.id || null
  ingredient.ingredientNameRaw = item.nameZh || item.name || ''
  ingredient.ingredientGroupType = item.id ? 'item' : ingredient.ingredientGroupType
  ingredient.itemName = item.name || ''
  ingredient.itemNameZh = item.nameZh || ''
  ingredient.itemInternalName = item.internalName || ''
  ingredient.itemImage = item.image || ''
  ingredient.itemImageUrl = item.image || ''
  ingredientLookupQueries[ingredient._key] = ''
}

const applyStationSuggestion = (recipeIndex: number, stationIndex: number, item: SuggestionItem) => {
  const station = drafts.value[recipeIndex]?.stations[stationIndex]
  if (!station) return
  station.stationId = null
  station.stationItemId = item.id || null
  station.stationNameRaw = item.nameZh || item.name || ''
  station.stationType = 'crafting_station'
  station.itemName = item.name || ''
  station.itemNameZh = item.nameZh || ''
  station.itemInternalName = item.internalName || ''
  station.itemImage = item.image || ''
  station.itemImageUrl = item.image || ''
  stationLookupQueries[station._key] = ''
}

const applyStationSelection = (recipeIndex: number, stationIndex: number, event: Event) => {
  const station = drafts.value[recipeIndex]?.stations[stationIndex]
  if (!station) return

  const target = event.target as HTMLSelectElement
  const selectedId = Number(target.value)
  if (!Number.isFinite(selectedId) || selectedId <= 0) {
    station.stationId = null
    return
  }

  const selected = (props.craftingStations || []).find((item) => item.id === selectedId)
  if (!selected) {
    station.stationId = selectedId
    return
  }

  station.stationId = selected.id
  station.stationItemId = selected.itemId ?? null
  station.stationNameRaw = selected.nameZh || selected.nameEn || selected.internalName || ''
  station.stationType = selected.stationType || 'crafting_station'
  station.itemName = selected.nameEn || ''
  station.itemNameZh = selected.nameZh || ''
  station.itemInternalName = selected.internalName || ''
  station.itemImage = selected.imageUrl || ''
  station.itemImageUrl = selected.imageUrl || ''
  stationLookupQueries[station._key] = ''
}

const getRecipeLabel = (recipe: EditableRecipe) => recipe.versionScope?.trim() || '主版本 / 通用配方'

const getIngredientLabel = (ingredient: EditableRecipeIngredient) => (
  ingredient.itemNameZh
  || ingredient.itemName
  || ingredient.ingredientNameRaw
  || '未命名原料'
)

const getIngredientSubLabel = (ingredient: EditableRecipeIngredient) => {
  if (ingredient.itemNameZh && ingredient.itemName) return ingredient.itemName
  if (ingredient.itemInternalName) return ingredient.itemInternalName
  if (ingredient.ingredientItemId) return `ID ${ingredient.ingredientItemId}`
  return '尚未绑定物品'
}

const getIngredientQuantityLabel = (ingredient: EditableRecipeIngredient) => {
  if (ingredient.quantityText?.trim()) return ingredient.quantityText.trim()
  if (ingredient.quantityMin != null && ingredient.quantityMax != null && ingredient.quantityMin !== ingredient.quantityMax) {
    return `${ingredient.quantityMin}-${ingredient.quantityMax}`
  }
  if (ingredient.quantityMin != null) return String(ingredient.quantityMin)
  if (ingredient.quantityMax != null) return String(ingredient.quantityMax)
  return '数量未填'
}

const getStationLabel = (station: EditableRecipeStation) => (
  station.itemNameZh
  || station.itemName
  || station.stationNameRaw
  || '未命名工作台'
)

const getStationSummary = (station: EditableRecipeStation) => {
  if (station.stationType === 'environment') {
    return station.isAlternative ? '可替代环境条件' : '环境条件'
  }
  return station.isAlternative ? '可替代工作台' : '主工作台'
}

const getConditionOptions = (condition: EditableRecipeCondition) => (
  condition.refType === 'BIOME' ? biomeOptions.value : worldContextOptions.value
)

const getConditionLabel = (condition: EditableRecipeCondition) => {
  const option = getConditionOptions(condition).find((entry) => entry.id === condition.refId)
  return condition.refNameZh
    || option?.label
    || condition.refCode
    || '未命名条件'
}

const getConditionSubLabel = (condition: EditableRecipeCondition) => {
  const option = getConditionOptions(condition).find((entry) => entry.id === condition.refId)
  return [
    condition.refType === 'BIOME' ? '群系' : '世界条件',
    option?.contextType || condition.refContextType || '',
    condition.notes?.trim() || '',
  ].filter(Boolean).join(' · ')
}

onMounted(async () => {
  try {
    const [biomesResponse] = await Promise.all([
      get('/admin/biomes', { page: 1, limit: 500 }),
      supportDomainsStore.ensureLoaded(),
    ])
    const biomeRows = Array.isArray(biomesResponse?.data ?? biomesResponse) ? (biomesResponse?.data ?? biomesResponse) : []
    biomeOptions.value = biomeRows.map((row: any) => ({
      id: Number(row?.id ?? 0),
      label: String(row?.nameZh ?? row?.name_zh ?? row?.nameEn ?? row?.name_en ?? row?.code ?? ''),
    })).filter((row: ConditionOption) => row.id > 0 && row.label)
  } catch (error) {
    console.error('Failed to load recipe condition options:', error)
  }
})
</script>

<style scoped>
.recipe-editor {
  --editor-surface: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent);
  --editor-surface-soft: color-mix(in srgb, var(--color-bg) 88%, var(--color-bg-secondary));
  --editor-surface-muted: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
  display: grid;
  gap: 14px;
  padding-top: 8px;
  min-width: 0;
}
.recipe-editor__head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.recipe-editor__head h3 { margin: 0; color: var(--color-text); }
.recipe-editor__head p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: .9rem; line-height: 1.6; }
.recipe-editor__list { display: grid; gap: 12px; min-width: 0; }
.recipe-card {
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  border-radius: 20px;
  background: var(--editor-surface);
  display: grid;
  gap: 16px;
  min-width: 0;
}
.recipe-card__head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.recipe-card__head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.recipe-card__title { display: grid; gap: 8px; }
.recipe-card__head strong { display: block; color: var(--color-text); }
.recipe-card__head span { display: block; margin-top: 4px; color: var(--color-text-secondary); font-size: .9rem; line-height: 1.5; }
.recipe-card__content { display: grid; gap: 16px; min-width: 0; }
.recipe-card__toggle--inline { width: fit-content; }
.recipe-card__stats { display: flex; flex-wrap: wrap; gap: 8px; }
.recipe-stat {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--editor-surface-muted);
  color: var(--color-text);
  font-size: .84rem;
  font-weight: 700;
}
.recipe-card__grid,.recipe-line__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
.recipe-card__grid--quick { align-items: end; }
.recipe-card__grid--meta,
.recipe-line__grid--advanced {
  padding: 14px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 16px;
  background: var(--editor-surface-muted);
}
.recipe-line__grid--station { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.recipe-line__grid--condition { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.recipe-block {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--editor-surface-soft);
  min-width: 0;
}
.recipe-block--ingredients { box-shadow: inset 0 0 0 1px color-mix(in srgb, #0ea5e9 10%, transparent); }
.recipe-block--stations { box-shadow: inset 0 0 0 1px color-mix(in srgb, #10b981 10%, transparent); }
.recipe-block--conditions { box-shadow: inset 0 0 0 1px color-mix(in srgb, #f59e0b 12%, transparent); }
.recipe-block__head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.recipe-block__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.recipe-block__head h4 { margin: 0; color: var(--color-text); }
.recipe-block__head p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: .9rem; line-height: 1.55; }
.recipe-block__list { display: grid; gap: 12px; min-width: 0; }
.recipe-line {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px dashed var(--color-border);
  border-radius: 16px;
  background: var(--editor-surface);
  min-width: 0;
}
.recipe-line__summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
}
.recipe-line__summary-main { display: grid; gap: 4px; min-width: 0; }
.recipe-line__summary-main strong { color: var(--color-text); }
.recipe-line__summary-main span { color: var(--color-text-secondary); font-size: .88rem; line-height: 1.5; }
.recipe-line__chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.recipe-chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--editor-surface-muted);
  color: var(--color-text-secondary);
  font-size: .82rem;
  font-weight: 700;
  white-space: nowrap;
}
.recipe-chip--accent {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  color: var(--color-text);
}
.recipe-line__actions { display: flex; justify-content: flex-end; }
.field { display: grid; gap: 8px; min-width: 0; }
.field--toggle { align-content: end; }
.field--quantity { grid-column: span 1; }
.field__label { color: var(--color-text); font-size: .9rem; font-weight: 700; }
.field--checkbox { align-content: end; grid-column: 1 / -1; justify-self: flex-start; }
.field--checkbox input { width: 18px; height: 18px; }
.recipe-entity-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--editor-surface-muted);
}
.recipe-entity-preview--compact { min-height: 56px; }
.recipe-entity-preview__image {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  object-fit: contain;
  padding: 6px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent);
  flex-shrink: 0;
}
.recipe-entity-preview__fallback {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: .78rem;
  font-weight: 700;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent);
  flex-shrink: 0;
}
.recipe-entity-preview__copy { display: grid; gap: 4px; min-width: 0; }
.recipe-entity-preview__copy strong { color: var(--color-text); }
.recipe-entity-preview__copy span { color: var(--color-text-secondary); font-size: .88rem; line-height: 1.5; }
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
.btn-secondary {
  background: var(--editor-surface-muted);
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-border) 92%, transparent);
}
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border-color: color-mix(in srgb, var(--color-border) 92%, transparent);
}
.btn--compact {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: .84rem;
}
.input,.textarea {
  width: 100%;
  min-height: 46px;
  padding: 11px 13px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  border-radius: 14px;
  background: var(--editor-surface-muted);
  color: var(--color-text);
  transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
}
.input:focus,
.textarea:focus,
.btn:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 18%, transparent);
}
.textarea { min-height: 96px; resize: vertical; }
.empty-hint { color: var(--color-text-secondary); font-size: .9rem; line-height: 1.6; }
.btn-link { border: none; background: none; color: var(--color-primary); cursor: pointer; padding: 0; font-weight: 700; }
.btn-link--danger { color: var(--color-danger); }
@media (max-width: 1200px) {
  .recipe-card__grid,.recipe-line__grid,.recipe-line__grid--station,.recipe-line__grid--condition { grid-template-columns: 1fr; }
  .recipe-editor__head,.recipe-card__head,.recipe-block__head { flex-direction: column; align-items: flex-start; }
  .recipe-line__summary { flex-direction: column; }
  .recipe-line__chips { justify-content: flex-start; }
}
</style>

