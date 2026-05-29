<script setup lang="ts">
import { usePublicArmorSetDetail } from '~/composables/usePublicArmorSetDetail'
import type { EquipmentEffectAttribute, PublicArmorSetListItem } from '~/types/public-api'

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
const armorSubtitle = computed(() => armorDetail.value?.englishName || armorDetail.value?.sourceKey || armorDetail.value?.textKey || '公开套装资料')

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

const effectLabel = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  const label = statLabels[key] ?? effect.statLabelZh ?? key
  const value = formatEffectValue(effect)
  const scope = effect.classScope && effect.classScope !== 'all' ? ` · ${effect.classScope}` : ''
  return `${label}${value ? ` ${value}` : ''}${scope}`.trim()
}

const effectToneClass = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/damage|crit|melee|summon|ammo/.test(key)) return 'is-offense'
  if (/move|speed|dash|acceleration/.test(key)) return 'is-mobility'
  if (/defense|immunity/.test(key)) return 'is-defense'
  return 'is-special'
}

const armorBenefitLines = computed(() => {
  const benefit = String(armorRaw.value?.benefitZh ?? armorRaw.value?.benefitEn ?? '').trim()
  if (!benefit) return []
  return benefit.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8)
})

const armorParsedEffects = computed(() => (armorDetail.value?.parsedEffects ?? []).slice(0, 12))
const armorShownEffects = computed(() => {
  const parsed = armorParsedEffects.value
  if (parsed.length) return parsed
  return (armorDetail.value?.effects ?? []).slice(0, 12)
})

const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
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
        <div class="armor-detail-icon-stage">
          <CommonTpSkeleton type="icon" />
        </div>
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
        <div class="armor-detail-icon-stage">
          <CommonPreviewImage src="" alt="套装缺失" fallback="?" fallback-icon="icon-armor" />
        </div>
        <div>
          <span class="eyebrow">Armor Set #{{ armorSetId || '未知' }}</span>
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
        <div class="armor-detail-icon-stage">
          <CommonPreviewImage
            :src="armorDetail?.image || ''"
            :alt="armorTitle"
            :fallback="armorDetail?.fallback || '?'"
            fallback-icon="icon-armor"
            :source-image="armorDetail?.sourceImage || ''"
            loading="eager"
          />
        </div>
        <div>
          <span class="eyebrow">Armor Set #{{ armorSetId }} · {{ armorSubtitle }}</span>
          <h1>{{ armorTitle }}</h1>
          <p>{{ armorBenefitLines.length ? armorBenefitLines[0] : '该套装的公开说明正在整理中。' }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ armorDetail?.primaryPart || 'set' }}</span>
            <span class="tag moss">{{ armorDetail?.uniqueItemCount ?? 0 }} 个部件</span>
            <span class="tag paper">{{ armorParsedEffects.length }} 条解析</span>
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

      <section class="support-panel armor-module" :class="detailLayout.detailModuleClass">
        <div class="armor-module-head">
          <div>
            <h2>套装效果</h2>
            <p>展示原始效果文本与解析词条。</p>
          </div>
          <a class="small-button" href="/armor-sets">返回列表</a>
        </div>

        <div v-if="armorBenefitLines.length" class="armor-benefit">
          <span v-for="line in armorBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
        </div>
        <p v-else class="tp-detail-empty">暂无可展示的套装效果文本。</p>

        <div v-if="armorShownEffects.length" class="armor-effect-strip">
          <span
            v-for="effect in armorShownEffects"
            :key="`${effect.statKey}-${effect.rawText}`"
            :class="effectToneClass(effect)"
          >
            {{ effectLabel(effect) }}
          </span>
        </div>
        <p v-else class="tp-detail-empty">暂无可展示的解析词条。</p>
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
  display: grid;
  grid-template-columns: minmax(0, 90px) minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.armor-detail-icon-stage :deep(.item-art) {
  width: 78px;
  height: 78px;
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
  color: var(--text);
  font-size: 13px;
  line-height: 1.6;
}

.armor-effect-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 10px;
}

.armor-image-tile :deep(.item-art) {
  border-radius: 10px;
  overflow: hidden;
}

@media (max-width: 720px) {
  .armor-detail-hero {
    grid-template-columns: 1fr;
  }
}
</style>

