import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const failures = []

const read = (path) => {
  const fullPath = file(path)
  if (!existsSync(fullPath)) {
    failures.push(`${path}: file is required`)
    return ''
  }

  return readFileSync(fullPath, 'utf8')
}

const assertContains = (path, content, markers) => {
  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`${path}: missing marker ${marker}`)
    }
  }
}

{
  const path = 'components/common/PreviewImage.vue'
  const content = read(path)

  assertContains(path, content, [
    'fallbackIcon?: string | null',
    'fallbackIconClass',
    "'has-fallback-icon'",
    'preview-fallback-icon',
  ])
}

for (const path of [
  'assets/css/loading-skeleton.css',
  'assets/css/hifi-preview.css',
  'assets/css/catalog-image-fixes.css',
]) {
  const content = read(path)
  assertContains(path, content, [
    '.has-fallback-icon',
    '.preview-fallback-icon',
  ])
}

for (const path of [
  'pages/armor-sets/index.vue',
  'pages/biomes/[id].vue',
  'pages/biomes/index.vue',
  'pages/bosses/[id].vue',
  'pages/bosses/index.vue',
  'pages/buffs/[id].vue',
  'pages/buffs/index.vue',
  'pages/crafting/index.vue',
  'pages/items/[id].vue',
  'pages/items/index.vue',
  'pages/npcs/[id].vue',
  'pages/npcs/index.vue',
  'pages/projectiles/index.vue',
  'pages/search.vue',
  'pages/search-tool.vue',
  'components/crafting/RecipeSummaryCard.vue',
  'components/crafting/RecipeTreeNode.vue',
]) {
  const content = read(path)
  const blocks = content.match(/<CommonPreviewImage\b[\s\S]*?\/>/g) ?? []

  for (const [index, block] of blocks.entries()) {
    if (!/[:\w-]*fallback-icon=/.test(block)) {
      failures.push(`${path}: CommonPreviewImage #${index + 1} must provide semantic fallback-icon instead of text-only glyph fallback`)
    }
  }
}

for (const [path, markers] of Object.entries({
  'pages/items/[id].vue': [
    'sourceFallbackIcon',
    ':fallback-icon="source.icon"',
  ],
  'pages/npcs/[id].vue': [
    'entryFallbackIcon',
    ':fallback-icon="entryFallbackIcon(entry)"',
  ],
  'pages/bosses/[id].vue': [
    'bossLootFallbackIcon',
    'summonItemFallbackIcon',
    'memberFallbackIcon',
  ],
})) {
  const content = read(path)
  assertContains(path, content, markers)
}

if (failures.length) {
  console.error(`Preview image fallback contract failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Preview image fallback contract passed.')
