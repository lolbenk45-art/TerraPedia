<script setup lang="ts">
import type { useArmorSetBuilds } from '~/composables/useArmorSetBuilds'
import { armorHighlightedTextSegments } from '~/utils/armorEffectParsing'

type ArmorBuildModel = ReturnType<typeof useArmorSetBuilds>
type ArmorSetBuildCard = ArmorBuildModel['armorSetBuildCards']['value'][number]
type ArmorFixedBonusGroup = ArmorBuildModel['armorFixedBonusGroups']['value'][number]

defineProps<{
  armorSetBuildCards: ArmorSetBuildCard[]
  armorHasVariantBuilds: boolean
  armorFixedBonusLines: string[]
  armorFixedBonusGroups: ArmorFixedBonusGroup[]
}>()

const emit = defineEmits<{
  'toggle-piece': [key: string]
}>()
</script>

<template>
  <!-- armor-build-comparison-first-order: this comparison section is rendered before the full piece catalog. -->
  <div class="armor-build-board armor-structured-build-board armor-build-matrix" role="table" aria-label="套装构筑对比">
    <div class="armor-build-row armor-build-row-head armor-build-mobile-hidden-header" role="row">
      <b>构筑</b>
      <b>部件</b>
      <b>防御</b>
      <b>构筑差异</b>
    </div>
    <section v-if="armorHasVariantBuilds && armorFixedBonusLines.length" class="armor-build-row armor-fixed-bonus-row" role="row">
      <div class="armor-build-cell armor-build-title-cell" role="cell">
        <strong>全套固定</strong>
      </div>
      <div class="armor-build-cell" role="cell">
        <span>固定部件 / 套装</span>
      </div>
      <div class="armor-build-cell armor-build-defense-formula" role="cell">
        <span>公共</span>
      </div>
      <div class="armor-build-cell armor-fixed-bonus-lines" role="cell">
        <div v-for="group in armorFixedBonusGroups" :key="`fixed-${group.key}`" class="armor-fixed-bonus-group" :class="group.tone">
          <strong class="armor-fixed-bonus-group-title">{{ group.label }}</strong>
          <span v-for="entry in group.entries" :key="`fixed-${group.key}-${entry.key}`" class="armor-fixed-bonus-line">
            <small v-if="entry.value">{{ entry.value }}</small>
            <b>{{ entry.text }}</b>
            <em v-if="entry.description">{{ entry.description }}</em>
          </span>
        </div>
      </div>
    </section>
    <article v-for="build in armorSetBuildCards" :key="build.key" class="armor-build-row armor-build-mobile-card-layout" role="row">
      <div class="armor-build-cell armor-build-title-cell" role="cell">
        <strong>{{ build.title }}</strong>
      </div>
      <div class="armor-build-cell armor-build-icons" role="cell">
        <section v-for="part in build.partGroups" :key="`${build.key}-${part.key}`" class="armor-build-part-group">
          <div class="armor-build-part-head">
            <b>{{ part.role }}</b>
            <small>{{ part.alternatives.length > 1 ? `${part.alternatives.length} 件可互换` : '固定' }}</small>
          </div>
          <div class="armor-build-part-alternatives">
            <div
              class="armor-build-piece-evidence armor-build-piece-evidence-compact armor-build-piece-evidence-collapsible"
              :class="{ 'has-alternatives': part.alternatives.length > 1, 'is-expanded': part.expanded }"
            >
              <!-- armor-build-piece-group-summary-collapsible: each slot starts as one joined-name row and expands on demand. -->
              <button
                type="button"
                class="armor-build-piece-summary"
                :aria-describedby="part.tooltip ? part.tooltipId : undefined"
                :aria-expanded="part.expanded ? 'true' : 'false'"
                @click="emit('toggle-piece', `${build.key}-${part.key}`)"
              >
                <CommonPreviewImage
                  :src="resolvePreviewImageUrl(part.alternatives[0]?.item.image || '')"
                  :alt="part.summary"
                  :fallback="part.summary.slice(0, 1)"
                  fallback-icon="icon-items"
                  width="42"
                  height="42"
                />
                <span class="armor-build-piece-summary-text">
                  <b>{{ part.summary }}</b>
                  <small>{{ part.alternatives.length > 1 ? `${part.alternatives.length} 件可互换` : (part.alternatives[0]?.defense || '固定') }}</small>
                </span>
                <span class="armor-build-piece-summary-toggle" aria-hidden="true">
                  {{ part.expanded ? '收起' : '展开' }}
                </span>
                <span
                  v-if="part.tooltip"
                  :id="part.tooltipId"
                  class="armor-build-piece-summary-tooltip"
                  role="tooltip"
                >
                  {{ part.tooltip }}
                </span>
              </button>
              <!-- armor-build-piece-details-expandable: detailed per-piece data is hidden until the summary is expanded. -->
              <div v-if="part.expanded" class="armor-build-piece-details">
                <div v-for="piece in part.alternatives" :key="`${build.key}-${part.key}-${piece.key}`" class="armor-build-piece-detail-row">
                  <CommonPreviewImage
                    :src="resolvePreviewImageUrl(piece.item.image || '')"
                    :alt="piece.name"
                    :fallback="piece.name.slice(0, 1)"
                    fallback-icon="icon-items"
                    width="32"
                    height="32"
                  />
                  <span class="armor-build-piece-detail-copy">
                    <strong>{{ piece.name }}</strong>
                    <small v-if="piece.defense">{{ piece.defense }}</small>
                  </span>
                  <em
                    v-for="effect in piece.effects"
                    :key="`${build.key}-${part.key}-${piece.key}-${effect.key}`"
                    class="armor-build-piece-effect"
                    :class="{ 'has-tooltip armor-build-tooltip-visible-affordance armor-build-tooltip-touch-affordance': effect.title }"
                    tabindex="0"
                  >
                    {{ effect.text }}
                    <span v-if="effect.title" class="armor-build-piece-effect-info" aria-hidden="true">i</span>
                    <span v-if="effect.title" class="armor-build-piece-effect-tooltip" role="tooltip">
                      {{ effect.title }}
                    </span>
                  </em>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="armor-build-cell armor-build-defense-formula armor-build-defense-emphasis" role="cell">
        <strong v-if="build.defense.total != null">{{ build.defense.total }}</strong>
        <small v-if="build.defense.formula">{{ build.defense.formula }}</small>
        <span v-else>--</span>
      </div>
      <div class="armor-build-cell armor-build-difference-cell" role="cell">
        <div v-if="build.statGroups.length" class="armor-build-effect-groups">
          <div v-for="group in build.statGroups" :key="`${build.key}-${group.key}`" class="armor-fixed-bonus-group" :class="group.tone">
            <strong class="armor-fixed-bonus-group-title">{{ group.label }}</strong>
            <span v-for="entry in group.entries" :key="`${build.key}-${group.key}-${entry.key}`" class="armor-fixed-bonus-line">
              <small v-if="entry.value">{{ entry.value }}</small>
              <b>{{ entry.text }}</b>
              <em v-if="entry.description">{{ entry.description }}</em>
            </span>
          </div>
        </div>
        <div v-if="build.totalEntries.length || build.bonusLines.length" class="armor-build-summary-stack">
          <div v-if="build.totalEntries.length" class="armor-build-total-strip" aria-label="最终汇总">
            <span class="armor-build-total-label armor-build-summary-title">最终汇总</span>
            <div class="armor-build-total-entries">
              <span
                v-for="entry in build.totalEntries"
                :key="`${build.key}-total-${entry.key}`"
                class="armor-build-total-entry"
                :class="{ 'is-variable': entry.isVariable }"
              >
                <mark class="armor-highlight-number">{{ entry.value }}</mark>
                <b>{{ entry.label }}</b>
                <em v-if="entry.isVariable">可变合计</em>
              </span>
            </div>
          </div>
          <div v-if="build.bonusLines.length" class="armor-set-bonus-lines">
            <strong class="armor-set-bonus-heading">套装效果</strong>
            <div class="armor-set-bonus-list">
              <p v-for="line in build.bonusLines" :key="`${build.key}-bonus-${line}`" class="armor-set-bonus-line">
                <template v-for="segment in armorHighlightedTextSegments(line)" :key="`${build.key}-${line}-${segment.key}`">
                  <mark v-if="segment.highlight" class="armor-highlight-number">{{ segment.text }}</mark>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.armor-build-board {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.armor-build-matrix {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-build-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.65fr) minmax(210px, 1.1fr) minmax(92px, 0.44fr) minmax(220px, 1.35fr);
  gap: 10px;
  align-items: stretch;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 3%, transparent), color-mix(in srgb, var(--tp-color-positive) 2%, transparent)),
    var(--tp-color-surface);
}

.armor-build-row-head {
  padding: 6px 10px;
  border-color: var(--tp-color-border);
  background: color-mix(in srgb, var(--tp-color-accent) 4%, var(--tp-color-surface));
}

.armor-build-row-head b {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
}

.armor-fixed-bonus-row {
  border-color: var(--tp-color-border-strong);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 5%, transparent), color-mix(in srgb, var(--tp-color-positive) 3%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-fixed-bonus-row .armor-build-title-cell strong {
  color: var(--tp-color-accent);
}

.armor-build-cell {
  display: flex;
  min-width: 0;
  align-items: center;
}

.armor-build-cell > span {
  color: var(--tp-color-text-muted);
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.35;
}

.armor-build-title-cell strong {
  color: var(--tp-color-text-strong);
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.armor-build-icons {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.armor-build-part-group {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.armor-build-part-head {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.armor-build-part-head b {
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
}

.armor-build-part-head small {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
}

.armor-build-part-alternatives {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.armor-build-piece-evidence {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 6px;
  background: var(--tp-color-surface-raised);
}

.armor-build-piece-evidence.has-alternatives {
  border-color: var(--tp-color-border-strong);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 4%, transparent), color-mix(in srgb, var(--tp-color-positive) 2%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-build-piece-summary {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 3px 9px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.armor-build-icons :deep(.item-art) {
  justify-self: center;
  width: 42px;
  height: 42px;
  border-radius: 7px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-build-piece-summary-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.armor-build-piece-summary-text b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-summary-text small,
.armor-build-icons small {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
}

.armor-build-piece-summary-toggle {
  justify-self: end;
  padding: 3px 7px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 999px;
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.1;
}

.armor-build-piece-summary-tooltip {
  position: absolute;
  z-index: 24;
  left: 0;
  bottom: calc(100% + 7px);
  display: none;
  width: max-content;
  max-width: min(360px, 74vw);
  padding: 8px 10px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 6px;
  background: var(--tp-color-surface-strong);
  color: var(--tp-color-text);
  box-shadow: 0 12px 26px rgba(var(--theme-text-rgb), 0.18);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
  white-space: normal;
  pointer-events: none;
}

/* armor-build-piece-summary-tooltip-hover-focus: summary hover/focus reveals concrete values from real piece data. */
.armor-build-piece-summary:hover .armor-build-piece-summary-tooltip,
.armor-build-piece-summary:focus-visible .armor-build-piece-summary-tooltip {
  display: block;
}

.armor-build-piece-details {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding-top: 5px;
  border-top: 1px solid var(--tp-color-border);
}

.armor-build-piece-detail-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  min-width: 0;
}

.armor-build-piece-detail-row :deep(.item-art) {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-build-piece-detail-row :deep(.item-art img) {
  max-width: 32px;
  max-height: 32px;
  object-fit: contain;
}

.armor-build-piece-detail-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  align-items: center;
  min-width: 0;
}

.armor-build-piece-detail-row strong {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-detail-row small {
  justify-self: end;
}

.armor-build-piece-evidence em {
  position: relative;
  grid-column: 2;
  min-width: 0;
  color: var(--tp-color-text-muted);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-effect.has-tooltip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  cursor: help;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.armor-build-piece-effect-info {
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 999px;
  color: var(--tp-color-accent);
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  flex: 0 0 auto;
}

.armor-build-piece-effect-tooltip {
  position: absolute;
  z-index: 20;
  left: 0;
  bottom: calc(100% + 6px);
  display: none;
  width: max-content;
  max-width: min(320px, 70vw);
  padding: 7px 9px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 6px;
  background: var(--tp-color-surface-strong);
  color: var(--tp-color-text);
  box-shadow: 0 10px 24px rgba(var(--theme-text-rgb), 0.16);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
  white-space: normal;
  pointer-events: none;
}

.armor-build-piece-effect.has-tooltip:hover .armor-build-piece-effect-tooltip,
.armor-build-piece-effect.has-tooltip:focus-visible .armor-build-piece-effect-tooltip {
  display: block;
}

.armor-build-defense-formula {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-defense-formula strong {
  color: var(--tp-color-text-strong);
  font-size: 26px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-build-defense-formula small,
.armor-build-defense-formula span {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-build-stat-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
}

.armor-build-stat-lines span {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-lines {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px 10px;
  align-content: center;
  align-items: stretch;
}

.armor-build-difference-cell {
  display: grid;
  gap: 8px;
  align-content: start;
  align-items: stretch;
  min-width: 0;
}

.armor-build-effect-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 10px;
  align-content: center;
  align-items: stretch;
}

.armor-build-summary-stack {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.armor-build-total-strip {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--tp-color-positive) 28%, var(--tp-color-border));
  border-radius: 7px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 7%, transparent), color-mix(in srgb, var(--tp-color-accent) 4%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-build-total-label,
.armor-set-bonus-heading {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  color: var(--tp-color-positive);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
}

.armor-set-bonus-lines {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 0 1px;
}

.armor-set-bonus-list {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.armor-set-bonus-heading {
  color: var(--tp-color-positive);
}

.armor-build-total-entries {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-total-entry {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--tp-color-text);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.24;
}

.armor-build-total-entry.is-variable {
  color: var(--tp-color-text-strong);
}

.armor-build-total-entry em {
  color: var(--tp-color-accent);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  line-height: 1.2;
}

.armor-set-bonus-line {
  position: relative;
  margin: 0;
  padding-left: 10px;
  color: var(--tp-color-text);
  font-size: 13px;
  font-weight: 730;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.armor-set-bonus-line::before {
  position: absolute;
  top: 0.72em;
  left: 1px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--tp-color-positive);
  content: '';
}

.armor-highlight-number {
  padding: 0 3px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--tp-color-accent) 8%, var(--tp-color-surface));
  color: var(--tp-color-accent);
  font-weight: 930;
}

.armor-fixed-bonus-group {
  display: grid;
  gap: 3px;
  min-width: 0;
  align-content: start;
}

.armor-fixed-bonus-group-title {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  margin-bottom: 2px;
  padding: 2px 7px;
  border: 1px solid var(--tp-color-border);
  border-radius: 999px;
  background: var(--tp-color-surface-raised);
  color: var(--tp-color-text-muted);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.25;
}

.armor-fixed-bonus-group.is-attribute .armor-fixed-bonus-group-title {
  color: var(--tp-color-accent);
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-group-title {
  color: var(--tp-color-positive);
}

.armor-fixed-bonus-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 5px 8px;
  align-items: start;
  min-width: 0;
  padding: 5px 0;
  border-bottom: 1px solid var(--tp-color-border);
}

.armor-fixed-bonus-line small {
  display: inline-grid;
  place-items: center;
  min-width: 36px;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tp-color-accent) 7%, var(--tp-color-surface));
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-fixed-bonus-line b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 760;
  line-height: 1.42;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-line em {
  grid-column: 2;
  min-width: 0;
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-line {
  grid-template-columns: minmax(0, 1fr);
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-line b {
  color: var(--tp-color-text);
  font-weight: 720;
}

@media (max-width: 980px) {
  .armor-build-row {
    grid-template-columns: minmax(0, 0.74fr) minmax(0, 1.26fr);
  }

  .armor-build-row-head {
    display: none;
  }
}

@media (max-width: 520px) {
  .armor-build-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
  }

  .armor-build-title-cell {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--tp-color-border);
  }

  .armor-build-title-cell strong {
    font-size: 15px;
  }

  .armor-build-defense-formula {
    order: 1;
    align-items: baseline;
  }

  .armor-build-difference-cell {
    order: 2;
  }

  .armor-build-icons {
    order: 3;
  }

  .armor-build-total-strip {
    padding: 10px;
  }

  .armor-build-total-entry {
    font-size: 12.5px;
  }

  .armor-build-part-alternatives {
    grid-template-columns: 1fr;
  }

  .armor-build-piece-evidence {
    grid-template-columns: 1fr;
    padding: 6px 7px;
  }

  .armor-build-piece-evidence .armor-build-piece-effect {
    display: none;
  }

  .armor-build-piece-evidence:focus-within .armor-build-piece-effect,
  .armor-build-piece-evidence:hover .armor-build-piece-effect,
  .armor-build-piece-evidence.is-expanded .armor-build-piece-effect {
    display: inline-flex;
  }

  .armor-build-icons :deep(.item-art) {
    width: 34px;
    height: 34px;
  }
}

@media (hover: none), (pointer: coarse) {
  .armor-build-piece-effect.has-tooltip {
    display: grid;
    gap: 3px;
    text-decoration: none;
  }

  .armor-build-piece-effect-info {
    display: none;
  }

  .armor-build-piece-effect-tooltip {
    position: static;
    display: block;
    width: auto;
    max-width: 100%;
    padding: 4px 6px;
    border-color: var(--tp-color-border-strong);
    background: color-mix(in srgb, var(--tp-color-accent) 8%, transparent);
    box-shadow: none;
    color: var(--tp-color-text);
    font-size: 10px;
    line-height: 1.35;
  }

  .armor-build-piece-evidence .armor-build-piece-effect.has-tooltip {
    display: none;
  }

  .armor-build-piece-evidence:focus-within .armor-build-piece-effect.has-tooltip,
  .armor-build-piece-evidence:hover .armor-build-piece-effect.has-tooltip,
  .armor-build-piece-evidence.is-expanded .armor-build-piece-effect.has-tooltip {
    display: grid;
  }
}
</style>
