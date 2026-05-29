<script setup lang="ts">
import { usePublicArmorSetDetail } from '~/composables/usePublicArmorSetDetail'
import type { EquipmentEffectAttribute, PublicArmorSetListItem, PublicArmorSetRelatedItem } from '~/types/public-api'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'armor-set', density: 'readable' })
const armorClientReady = ref(false)

const armorSetId = computed(() => String(route.params.id ?? '').trim())
const { data: armorDetailResult, pending: armorDetailPending, error: armorDetailError } = await usePublicArmorSetDetail(armorSetId)

const armorDetail = computed(() => armorDetailResult.value?.detail ?? null)
const armorRaw = computed<PublicArmorSetListItem | null>(() => armorDetailResult.value?.raw ?? null)
const armorDetailVisualLoading = computed(() => !armorClientReady.value || (armorDetailPending.value && !armorDetail.value))
const armorNotFound = computed(() => armorClientReady.value && !armorDetailPending.value && !armorDetail.value)

const armorTitle = computed(() => armorDetail.value?.displayName || `套装 ${armorSetId.value || '详情'}`)
const armorSubtitle = computed(() => armorDetail.value?.englishName || '公开套装资料')

useSeoMeta({
  title: () => `TerraPedia · ${armorTitle.value}`,
  description: () => `${armorTitle.value} 的公开套装详情，包含套装效果、词条解析与图片分组。`,
})

const statLabels: Record<string, string> = {
  damage_bonus: '伤害',
  crit_chance: '暴击',
  move_speed: '移速',
  melee_speed: '近战速度',
  summon_damage: '召唤伤害',
  minion_capacity: '仆从',
  ammo_conservation: '弹药节省',
  defense: '防御',
  mana_max: '魔力',
  mana_cost: '魔耗',
  mining_speed: '挖矿',
  special_effect: '特效',
}

const formatEffectValue = (effect: EquipmentEffectAttribute) => {
  const numeric = Number(effect.valueDecimal)
  if (!Number.isFinite(numeric)) return ''
  if (effect.unit === 'percent') return `${numeric > 0 ? '+' : ''}${numeric}%`
  if (effect.unit === 'multiplier') return `×${numeric}`
  return `${numeric > 0 ? '+' : ''}${numeric}`
}

const effectToneClass = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/damage|crit|melee|summon|ammo/.test(key)) return 'is-offense'
  if (/move|speed|dash|acceleration/.test(key)) return 'is-mobility'
  if (/defense|immunity/.test(key)) return 'is-defense'
  return 'is-special'
}

const statGroupLabels: Record<string, string> = {
  offense: '攻击数值',
  defense: '防御数值',
  mobility: '移动与速度',
  resource: '资源与消耗',
  summon: '召唤与仆从',
  special: '特殊效果',
}

const statGroupOrder = ['offense', 'defense', 'mobility', 'resource', 'summon', 'special']

const effectStatGroup = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/summon|minion/.test(key)) return 'summon'
  if (/damage|crit|melee|ammo/.test(key)) return 'offense'
  if (/defense|immunity|regen|life/.test(key)) return 'defense'
  if (/move|speed|dash|acceleration|flight/.test(key)) return 'mobility'
  if (/mana|cost|resource/.test(key)) return 'resource'
  return 'special'
}

const statName = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  return statLabels[key] ?? effect.statLabelZh ?? (key || '未归类')
}

const effectScopeLabel = (effect: EquipmentEffectAttribute) => {
  const classScope = String(effect.classScope ?? '').trim()
  const applyScope = String(effect.applyScope ?? '').trim()
  return [
    classScope && classScope !== 'all' ? classScope : '全职业',
    applyScope || '套装效果',
  ].join(' / ')
}

const playerEffectDescription = (effect: EquipmentEffectAttribute) => (
  String(effect.conditionText ?? effect.variantLabel ?? effect.rawText ?? '').trim() || '套装效果'
)

const armorPieceName = (item: PublicArmorSetRelatedItem) => (
  item.nameZh || item.name || '套装部件'
)

const armorPieceRole = (item: PublicArmorSetRelatedItem) => {
  const value = String(item.partRole ?? item.slotType ?? '').trim()
  if (/head/i.test(value)) return '头部'
  if (/body|shirt|chest/i.test(value)) return '胸甲'
  if (/leg|pants/i.test(value)) return '腿部'
  return '防具部件'
}

const armorBenefitLines = computed(() => {
  const benefit = String(armorRaw.value?.benefitZh ?? armorRaw.value?.benefitEn ?? '').trim()
  if (!benefit) return []
  return benefit.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20)
})

const fallbackStatKey = (line: string) => {
  if (/防御/.test(line)) return 'defense'
  if (/暴击/.test(line)) return 'crit_chance'
  if (/移动|速度/.test(line)) return 'move_speed'
  if (/召唤|仆从|哨兵/.test(line)) return 'summon_damage'
  if (/魔力|魔耗|消耗/.test(line)) return 'mana_cost'
  if (/伤害/.test(line)) return 'damage_bonus'
  return 'special_effect'
}

const fallbackStatLabel = (line: string) => statLabels[fallbackStatKey(line)] ?? '特效'

const armorBenefitFallbackEffects = computed<EquipmentEffectAttribute[]>(() => armorBenefitLines.value
  .map((line) => {
    const match = line.match(/([+\-−]?\d+(?:\.\d+)?)\s*(%?)\s*([^，、；;（）()]*)/)
    const normalizedValue = match?.[1]?.replace('−', '-') ?? ''
    const numeric = Number(normalizedValue)
    return {
      statKey: fallbackStatKey(line),
      statLabelZh: fallbackStatLabel(line),
      valueDecimal: Number.isFinite(numeric) ? numeric : null,
      unit: match?.[2] === '%' ? 'percent' : 'flat',
      classScope: 'all',
      applyScope: 'set_bonus',
      rawText: line,
      parseStatus: match ? 'fallback' : 'unparsed',
    }
  })
  .filter((effect) => effect.rawText))

const armorParsedEffects = computed(() => (armorDetail.value?.parsedEffects ?? []).slice(0, 12))
const armorShownEffects = computed(() => {
  const effects = (armorDetail.value?.effects ?? []).slice(0, 20)
  if (effects.length) return effects
  return armorBenefitFallbackEffects.value
})

const armorStatGroups = computed(() => {
  const effects = armorShownEffects.value
  const grouped = new Map<string, EquipmentEffectAttribute[]>()
  for (const effect of effects) {
    const groupKey = effectStatGroup(effect)
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), effect])
  }

  return statGroupOrder
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: statGroupLabels[key] ?? key,
      effects: grouped.get(key) ?? [],
    }))
})

const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
const asRelatedItems = (value: unknown): PublicArmorSetRelatedItem[] => Array.isArray(value)
  ? value.filter((entry): entry is PublicArmorSetRelatedItem => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  : []
const armorRelatedItems = computed(() => asRelatedItems(armorRaw.value?.relatedItems ?? armorRaw.value?.related_items))
const imageGroups = computed(() => ([
  { key: 'male', label: '男', icon: 'icon-armor', images: asStringArray(armorRaw.value?.maleImages ?? armorRaw.value?.male_images) },
  { key: 'female', label: '女', icon: 'icon-armor', images: asStringArray(armorRaw.value?.femaleImages ?? armorRaw.value?.female_images) },
  { key: 'special', label: '特殊', icon: 'icon-armor', images: asStringArray(armorRaw.value?.specialImages ?? armorRaw.value?.special_images) },
  { key: 'fallback', label: '部件图', icon: 'icon-items', images: asStringArray(armorRaw.value?.fallbackImages ?? armorRaw.value?.fallback_images) },
]).filter((group) => group.images.length))

const factCards = computed(() => ([
  { label: '部件', value: armorDetail.value?.uniqueItemCount == null ? '未标记' : String(armorDetail.value.uniqueItemCount), meta: '可用部件数量' },
  { label: '套装组', value: armorDetail.value?.setCount == null ? '未标记' : String(armorDetail.value.setCount), meta: '套装部件组数' },
  { label: '解析', value: String(armorParsedEffects.value.length), meta: '已解析效果词条' },
]))

onMounted(() => {
  armorClientReady.value = true
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout" :class="detailLayout.detailShellClass" :aria-busy="armorDetailVisualLoading">
      <section v-if="armorDetailVisualLoading" class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
          <component :is="'h1'" class="detail-missing-title"><CommonTpSkeleton type="line" /></component>
          <p><CommonTpSkeleton type="line" /></p>
          <div class="tag-row">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
        </div>
      </section>

      <section v-else-if="armorNotFound" class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow">套装资料</span>
          <component :is="'h1'" class="detail-missing-title">没有找到这个套装</component>
          <p>当前详情资料还没有可渲染内容。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="armorDetailError" class="tag moss">加载异常</span>
          </div>
          <a class="primary-button" href="/armor-sets">返回套装路线</a>
        </div>
      </section>

      <section v-else class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow">数值总览 · {{ armorSubtitle }}</span>
          <h1>{{ armorTitle }}</h1>
          <p>{{ armorBenefitLines.length ? armorBenefitLines[0] : '该套装的数值资料正在整理中。' }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ armorDetail?.primaryPart || 'set' }}</span>
            <span class="tag moss">{{ armorDetail?.uniqueItemCount ?? 0 }} 个部件</span>
            <span class="tag paper">{{ armorShownEffects.length }} 条数值</span>
          </div>
        </div>
      </section>

      <section class="armor-detail-grid">
        <article
          v-for="(card, index) in factCards"
          :key="card.label"
          class="support-panel armor-signal"
          :class="{ active: index === 0 }"
        >
          <span>{{ card.label }}</span>
          <h2>{{ armorDetailVisualLoading ? '...' : card.value }}</h2>
          <p>{{ card.meta }}</p>
        </article>
      </section>

      <section v-if="armorRelatedItems.length" class="support-panel armor-module" :class="detailLayout.detailModuleClass">
        <div class="armor-module-head">
          <div>
            <h2>套装部件</h2>
            <p>逐件展示组成这套防具的部件。</p>
          </div>
        </div>
        <div class="armor-piece-grid">
          <article v-for="item in armorRelatedItems" :key="`${item.itemId}-${item.internalName}`" class="armor-piece-card">
            <CommonPreviewImage
              :src="resolvePreviewImageUrl(item.image || '')"
              :alt="armorPieceName(item)"
              :fallback="armorPieceName(item).slice(0, 1)"
              fallback-icon="icon-items"
              width="52"
              height="52"
            />
            <div>
              <b>{{ armorPieceName(item) }}</b>
              <span>{{ armorPieceRole(item) }}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="support-panel armor-module armor-stat-module" :class="detailLayout.detailModuleClass">
        <div class="armor-module-head">
          <div>
            <h2>数值总览</h2>
            <p>按属性分组展示当前套装的解析数值。</p>
          </div>
          <a class="small-button" href="/armor-sets">返回列表</a>
        </div>

        <div v-if="armorStatGroups.length" class="armor-stat-groups">
          <section v-for="group in armorStatGroups" :key="group.key" class="armor-stat-group">
            <h3>{{ group.label }}</h3>
            <div class="armor-stat-table-wrap">
              <table class="armor-stat-table">
                <thead>
                  <tr>
                    <th>属性</th>
                    <th>数值</th>
                    <th>范围</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="effect in group.effects" :key="`${group.key}-${effect.statKey}-${effect.rawText}`">
                    <td>
                      <span class="armor-stat-name" :class="effectToneClass(effect)">{{ statName(effect) }}</span>
                    </td>
                    <td class="armor-stat-value">{{ formatEffectValue(effect) || '见说明' }}</td>
                    <td>{{ effectScopeLabel(effect) }}</td>
                    <td>{{ playerEffectDescription(effect) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <p v-else class="tp-detail-empty">暂无可展示的解析数值。</p>

        <div v-if="armorBenefitLines.length" class="armor-benefit">
          <span v-for="line in armorBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
        </div>
      </section>

      <section v-if="imageGroups.length" class="support-panel armor-module" :class="detailLayout.detailModuleClass">
        <div class="armor-module-head">
          <div>
            <h2>图片分组</h2>
            <p>按角色与来源展示套装图片。</p>
          </div>
        </div>

        <div class="armor-image-groups">
          <section v-for="group in imageGroups" :key="group.key" class="armor-image-group">
            <div class="armor-image-group-head">
              <b>{{ group.label }}</b>
              <span class="tag paper">{{ group.images.length }} 张</span>
            </div>
            <div class="armor-image-grid">
              <CommonPreviewImage
                v-for="image in group.images.slice(0, 12)"
                :key="`${group.key}-${image}`"
                :src="resolvePreviewImageUrl(image)"
                :alt="`${armorTitle} ${group.label}`"
                :fallback="armorDetail?.fallback || '?'"
                :fallback-icon="group.icon"
                width="92"
                height="92"
                class="armor-image-tile"
              />
            </div>
          </section>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.armor-detail-hero {
  display: block;
}

.armor-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.armor-signal {
  display: grid;
  gap: 8px;
}

.armor-module-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: start;
  justify-content: space-between;
}

.armor-benefit {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(244, 234, 208, 0.1);
  color: var(--text);
  font-size: 13px;
  line-height: 1.6;
}

.armor-stat-groups {
  display: grid;
  gap: 16px;
}

.armor-stat-group {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-stat-group h3 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
}

.armor-stat-table-wrap {
  overflow-x: auto;
}

.armor-stat-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 13px;
  line-height: 1.45;
}

.armor-stat-table th,
.armor-stat-table td {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(244, 234, 208, 0.09);
  text-align: left;
  vertical-align: top;
}

.armor-stat-table th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.armor-stat-table td {
  color: var(--text);
}

.armor-stat-name {
  display: inline-flex;
  min-width: 72px;
  font-weight: 700;
}

.armor-stat-value {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  white-space: nowrap;
}

.armor-piece-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.armor-piece-card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(244, 234, 208, 0.09);
  border-radius: 8px;
}

.armor-piece-card b,
.armor-piece-card span {
  display: block;
  overflow-wrap: anywhere;
}

.armor-piece-card b {
  color: var(--text);
  font-size: 13px;
}

.armor-piece-card span {
  color: var(--muted);
  font-size: 12px;
}

.armor-image-groups {
  display: grid;
  gap: 14px;
}

.armor-image-group {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.armor-image-group-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.armor-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(58px, 72px));
  gap: 10px;
}

.armor-image-tile :deep(.item-art) {
  width: 58px;
  height: 58px;
  border-radius: 10px;
  overflow: hidden;
}
</style>
