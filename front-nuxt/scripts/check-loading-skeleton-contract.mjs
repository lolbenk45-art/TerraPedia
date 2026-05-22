import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const failures = []

const requiredFiles = [
  'components/common/PreviewImage.vue',
  'components/common/TpSkeleton.vue',
  'components/catalog/CatalogWallSkeleton.vue',
  'components/detail/ItemDetailSkeleton.vue',
  'components/search/SuggestionSkeletonRows.vue',
  'assets/css/loading-skeleton.css',
]

for (const path of requiredFiles) {
  if (!existsSync(file(path))) {
    failures.push(`${path}: missing reusable loading/fallback primitive`)
  }
}

const assertMarkers = (path, markers) => {
  if (!existsSync(file(path))) return

  const content = readFileSync(file(path), 'utf8')

  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`${path}: missing marker ${marker}`)
    }
  }
}

assertMarkers('assets/css/app.css', [
  '@import "./loading-skeleton.css";',
])

assertMarkers('assets/css/loading-skeleton.css', [
  '.tp-skeleton',
  '.tp-skeleton-icon',
  '.tp-skeleton-line',
  '.tp-skeleton-pill',
  '.tp-skeleton-row',
  '@keyframes tpSkeletonPulse',
  '@media (prefers-reduced-motion: reduce)',
])

assertMarkers('components/common/PreviewImage.vue', [
  'defineProps',
  'resolvePreviewImageUrl',
  'failed',
  'fallbackGlyph',
  '@error="markFailed"',
  'class="item-art tp-preview-image"',
  "'is-fallback': !hasImage",
])

assertMarkers('components/common/TpSkeleton.vue', [
  "type?: 'icon' | 'line' | 'pill' | 'row'",
  'computed',
  'tp-skeleton',
  '`tp-skeleton-${props.type}`',
])

assertMarkers('components/catalog/CatalogWallSkeleton.vue', [
  'defineProps',
  'slots?: number',
  'CatalogWallSkeleton',
  'CommonTpSkeleton type="icon"',
  'CommonTpSkeleton type="line"',
])

assertMarkers('components/detail/ItemDetailSkeleton.vue', [
  'ItemDetailSkeleton',
  'detail-loading-skeleton',
  'CommonTpSkeleton type="icon"',
  'CommonTpSkeleton type="pill"',
])

assertMarkers('components/search/SuggestionSkeletonRows.vue', [
  'SuggestionSkeletonRows',
  'home-suggestion-row is-loading',
  'CommonTpSkeleton type="icon"',
  'CommonTpSkeleton type="line"',
])

assertMarkers('pages/items/index.vue', [
  '<CatalogWallSkeleton',
  ':slots="catalogLoadingSlotCount"',
  'catalogClientReady',
  'catalogFallbackUnavailable',
  'catalogDisplayItems',
  'catalogVisualLoading',
  '!catalogClientReady.value || itemsPending.value',
  '<CommonPreviewImage',
])

assertMarkers('pages/items/[id].vue', [
  '<DetailItemDetailSkeleton v-if="detailLoadingState"',
  ':aria-busy="detailLoadingState"',
  '<CommonPreviewImage',
  'detailClientReady',
  '!detailClientReady.value || (detailPending.value && !detailItem.value)',
  'detailClientReady.value && !detailPending.value && !detailItem.value',
  ':src="itemImage"',
  ':src="material.image"',
  ':src="source.image"',
])

assertMarkers('pages/search-tool.vue', [
  'suggestionsClientReady',
  'suggestionsVisualLoading',
  '<SearchSuggestionSkeletonRows v-if="suggestionsVisualLoading"',
  '<CommonPreviewImage',
  'suggestionsPending',
  'fetchPublicItemSuggestions(keyword, 5, { allowFallback: false })',
  ':aria-busy="suggestionsVisualLoading"',
  'to="/items"',
])

assertMarkers('scripts/check-public-pages.mjs', [
  'components/common/PreviewImage.vue',
  'components/catalog/CatalogWallSkeleton.vue',
  'assets/css/loading-skeleton.css',
])

assertMarkers('package.json', [
  '"check:loading-skeleton": "node scripts/check-loading-skeleton-contract.mjs"',
])

assertMarkers('composables/usePublicItems.ts', [
  'allowFallback?: boolean',
  'allowFallback = false',
  'publicItems.source === \'api\'',
  'return allowFallback ? fallbackItemSuggestions(trimmedKeyword, safeLimit) : []',
])

if (failures.length > 0) {
  console.error(`Loading skeleton contract failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Loading skeleton contract passed.')
