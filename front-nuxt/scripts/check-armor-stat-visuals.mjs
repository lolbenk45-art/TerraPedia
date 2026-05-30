import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pagePath = resolve(__dirname, '../pages/armor-sets/[id].vue')
const source = readFileSync(pagePath, 'utf8')

const requiredMarkers = [
  'armor-build-board',
  'armor-build-card',
  'armor-build-piece-strip',
  'armorSetBuildCards',
  'armorBuildCardStats',
  'effectBelongsToItem',
  'uniqueArmorItems',
]

const missing = requiredMarkers.filter((marker) => !source.includes(marker))
const forbiddenMarkers = [
  'armor-stat-source-images',
  'armorStatPreviewItems',
  'statVisualMeta(effect).icon',
  'sprite-icon compact',
  'armor-variant-sprite',
  'armor-variant-card',
  'armor-summary-lines',
  'armor-equipment-board',
]
const presentForbidden = forbiddenMarkers.filter((marker) => source.includes(marker))

if (missing.length) {
  console.error(`Armor stat visuals missing markers: ${missing.join(', ')}`)
  process.exit(1)
}

if (presentForbidden.length) {
  console.error(`Armor stat visuals should not show repeated equipment thumbnails: ${presentForbidden.join(', ')}`)
  process.exit(1)
}

console.log('Armor stat visuals contract passed.')
