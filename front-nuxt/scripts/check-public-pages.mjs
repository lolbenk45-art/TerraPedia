import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const assertApiPagedListBypassesLocalFilters = (violations, path, content, contract) => {
  for (const marker of contract.markers) {
    if (!content.includes(marker)) {
      violations.push(`${path}: API-backed pagination must expose ${marker} before bypassing local filters`)
    }
  }

  const filteredBlock = content.match(contract.filteredBlockPattern)?.[0] ?? ''

  if (!filteredBlock.includes(contract.apiBypassMarker)) {
    violations.push(`${path}: API-paginated results must render the backend page directly before any local filtering`)
  }
}

const readCssPxValue = (content, selector, property) => {
  const rule = content.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'm'))
  if (!rule) {
    return null
  }

  const declaration = rule[1].match(new RegExp(`${escapeRegExp(property)}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'm'))
  if (declaration) {
    return Number(declaration[1])
  }

  const variableDeclaration = rule[1].match(new RegExp(`${escapeRegExp(property)}\\s*:\\s*var\\((--[\\w-]+)\\)`, 'm'))
  if (!variableDeclaration) {
    return null
  }

  const variableName = variableDeclaration[1]
  const tokenDeclaration = content.match(new RegExp(`${escapeRegExp(variableName)}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'm'))
  if (tokenDeclaration) {
    return Number(tokenDeclaration[1])
  }

  const aliasDeclaration = content.match(new RegExp(`${escapeRegExp(variableName)}\\s*:\\s*var\\((--[\\w-]+)\\)`, 'm'))
  if (!aliasDeclaration) {
    return null
  }

  const aliasedTokenDeclaration = content.match(new RegExp(`${escapeRegExp(aliasDeclaration[1])}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'm'))
  return aliasedTokenDeclaration ? Number(aliasedTokenDeclaration[1]) : null
}

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  return upDistance <= upLeftDistance ? up : upLeft
}

const readPngPixels = (path) => {
  const source = readFileSync(path)
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const chunks = []

  while (offset < source.length) {
    const length = source.readUInt32BE(offset)
    offset += 4
    const type = source.toString('ascii', offset, offset + 4)
    offset += 4
    const data = source.subarray(offset, offset + length)
    offset += length + 4

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    }

    if (type === 'IDAT') {
      chunks.push(data)
    }

    if (type === 'IEND') {
      break
    }
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0

  if (bitDepth !== 8 || channels === 0) {
    throw new Error(`Unsupported PNG format in ${path}: bitDepth=${bitDepth}, colorType=${colorType}`)
  }

  const bytesPerPixel = channels
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(chunks))
  const pixels = Buffer.alloc(width * height * 4)
  const previous = Buffer.alloc(stride)
  const current = Buffer.alloc(stride)
  let rawOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset]
    rawOffset += 1
    raw.copy(current, 0, rawOffset, rawOffset + stride)
    rawOffset += stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0
      const up = previous[x]
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0

      if (filter === 1) {
        current[x] = (current[x] + left) & 255
      } else if (filter === 2) {
        current[x] = (current[x] + up) & 255
      } else if (filter === 3) {
        current[x] = (current[x] + Math.floor((left + up) / 2)) & 255
      } else if (filter === 4) {
        current[x] = (current[x] + paethPredictor(left, up, upLeft)) & 255
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter} in ${path}`)
      }
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * channels
      const pixelIndex = (y * width + x) * 4
      pixels[pixelIndex] = current[sourceIndex]
      pixels[pixelIndex + 1] = current[sourceIndex + 1]
      pixels[pixelIndex + 2] = current[sourceIndex + 2]
      pixels[pixelIndex + 3] = channels === 4 ? current[sourceIndex + 3] : 255
    }

    current.copy(previous)
  }

  return { width, height, pixels }
}

const readPngHeader = (path) => {
  const source = readFileSync(path)
  let offset = 8

  while (offset < source.length) {
    const length = source.readUInt32BE(offset)
    offset += 4
    const type = source.toString('ascii', offset, offset + 4)
    offset += 4
    const data = source.subarray(offset, offset + length)
    offset += length + 4

    if (type === 'IHDR') {
      return {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
      }
    }
  }

  throw new Error(`Missing IHDR in ${path}`)
}

const measureEmblemBalance = (path) => {
  const image = readPngPixels(path)
  let weightedX = 0
  let weightedY = 0
  let totalWeight = 0

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixelIndex = (y * image.width + x) * 4
      const red = image.pixels[pixelIndex]
      const green = image.pixels[pixelIndex + 1]
      const blue = image.pixels[pixelIndex + 2]
      const weight = Math.max(red, green, blue) - 65

      if (weight > 0) {
        weightedX += x * weight
        weightedY += y * weight
        totalWeight += weight
      }
    }
  }

  if (totalWeight === 0) {
    return {
      xOffset: Number.POSITIVE_INFINITY,
      yOffset: Number.POSITIVE_INFINITY,
    }
  }

  return {
    xOffset: weightedX / totalWeight - image.width / 2,
    yOffset: weightedY / totalWeight - image.height / 2,
  }
}

const requiredRoutes = [
  'pages/search.vue',
  'pages/search-tool.vue',
  'pages/crafting/index.vue',
  'pages/categories/index.vue',
  'pages/categories/[id].vue',
  'pages/biomes/index.vue',
  'pages/biomes/[id].vue',
  'pages/articles/[slug].vue',
  'pages/npcs/index.vue',
  'pages/npcs/[id].vue',
  'pages/bosses/index.vue',
  'pages/bosses/[id].vue',
  'pages/buffs/index.vue',
  'pages/buffs/[id].vue',
  'pages/projectiles/index.vue',
  'pages/armor-sets/index.vue',
  'pages/user/index.vue',
  'pages/user/login.vue',
  'pages/user/register.vue',
  'pages/user/articles/index.vue',
  'pages/user/articles/new.vue',
  'pages/user/favorites.vue',
  'pages/user/settings.vue',
  'pages/about.vue',
]

const publicPageFiles = [
  'pages/index.vue',
  'pages/home-hero-options.vue',
  'pages/items/index.vue',
  'pages/items/[id].vue',
  'pages/articles/index.vue',
  ...requiredRoutes,
]

const requiredSeoRoutes = [
  'pages/index.vue',
  'pages/items/index.vue',
  'pages/items/[id].vue',
  'pages/search.vue',
  'pages/crafting/index.vue',
  'pages/npcs/index.vue',
  'pages/bosses/index.vue',
  'pages/buffs/index.vue',
  'pages/biomes/index.vue',
  'pages/armor-sets/index.vue',
  'pages/projectiles/index.vue',
  'pages/articles/index.vue',
  'pages/about.vue',
]

const forbiddenPublicTerms = [
  'sourceItems',
  'inflictingNpcs',
  'immuneNpcs',
]

const playerFacingCopyFiles = [
  ...publicPageFiles,
  'components/TerraFooter.vue',
  'components/TerraNav.vue',
  'components/TerraBreadcrumb.vue',
]

const accountUnavailablePageFiles = [
  'pages/user/index.vue',
  'pages/user/login.vue',
  'pages/user/register.vue',
  'pages/user/articles/index.vue',
  'pages/user/articles/new.vue',
  'pages/user/favorites.vue',
  'pages/user/settings.vue',
]

const unfinishedAccountRoutes = [
  '/user/articles',
  '/user/favorites',
  '/user/settings',
  '/user/login',
  '/user/register',
  '/user',
]

const forbiddenAccountUnavailableTerms = [
  'preview-only',
  '登录占位',
  '当前只是静态视觉',
  '保存物品和路线',
  '收藏、投稿、设置入口',
]

const forbiddenSearchFixtureTerms = [
  '98%',
  '84%',
  '61%',
  '57%',
  '8 条建议',
  '搜索页先做成高密度入口',
  '当前只是静态视觉',
]

const forbiddenArticleFixtureTerms = [
  '本周主线',
  '12 分钟阅读',
  '18 个图鉴链接',
  '更新于 2026',
  '从机械 Boss 到月亮领主：近战装备推进路线',
  '/items/terra-blade',
]

const forbiddenCategoryDetailFixtureTerms = [
  'Category · Weapons',
  '932 条目',
  '代表：泰拉刃',
  '/items/terra-blade',
  "background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')",
]

const forbiddenPlayerFacingTerms = [
  '结构化',
  '追踪',
  '追溯',
  '接口',
  'API',
  '聚合',
  '后端',
  'Public Aggregate',
  'Internal',
  'Trace',
  'fallback',
  '/public/',
]

const extractQuotedStrings = (content) => {
  const values = []
  const quotedStringPattern = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g
  let match

  while ((match = quotedStringPattern.exec(content)) !== null) {
    values.push(match[2])
  }

  return values.join('\n')
}

const extractTemplateContent = (content) => {
  const match = content.match(/<template\b[^>]*>([\s\S]*?)<\/template>/m)
  return match ? match[1] : ''
}

const extractPlayerFacingAuditContent = (content) => {
  const template = extractTemplateContent(content)
  const interpolations = [...template.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((match) => match[1]).join('\n')
  const staticTemplateText = template
    .replace(/\{\{[\s\S]*?\}\}/g, '\n')
    .replace(/<[^>]*>/g, '\n')
  const scriptText = content.replace(template, '')
  const visibleScriptText = extractQuotedStrings(scriptText)
    .split('\n')
    .filter((value) => /(结构化|追踪|追溯|接口|API|聚合|后端|Public Aggregate|Internal|Trace|\/public\/)/.test(value))
    .filter((value) => !/^[A-Za-z_$][\w$]*Internal[A-Za-z_$][\w$]*$/.test(value))
    .filter((value) => !/^[A-Za-z_$][\w$]*\(entry\.[\s\S]*Internal[A-Za-z_$][\w$]*[\s\S]*\)$/.test(value))
    .join('\n')

  return [
    staticTemplateText,
    extractQuotedStrings(interpolations),
    visibleScriptText,
  ].join('\n')
}

const assertTemplateOmitsRawFields = (violations, path, content, fields, reason) => {
  const template = extractTemplateContent(content)

  for (const field of fields) {
    if (template.includes(field)) {
      violations.push(`${path}: ${reason} (${field})`)
    }
  }
}

const assertNoUnsafeFieldReader = (violations, path, content, fields, allowedHelper, reason) => {
  const fieldPattern = fields.map(escapeRegExp).join('|')
  const readerPattern = new RegExp(`(?:firstText|displayText)\\([^)]*(?:${fieldPattern})`, 'm')

  if (readerPattern.test(content)) {
    violations.push(`${path}: ${reason}; use ${allowedHelper} before rendering raw text fields`)
  }
}

const forbiddenLightThemeTokens = [
  '#f5ecd2',
  '#dfcc9f',
  '#fbf3df',
  '#ebd9b6',
  '#fffaf0',
  '#efe0bd',
  '#e7d4aa',
  '#f4e5c2',
]

const readOptionalFile = (path) => existsSync(file(path)) ? readFileSync(file(path), 'utf8') : ''
const robotsContent = readOptionalFile('public/robots.txt')
const sitemapContent = readOptionalFile('public/sitemap.xml')
const seoSourceReportContent = readOptionalFile('../docs/audits/2026-05-23_basic-public-site-v0.1-seo-source.md')
const sitemapBlocked = seoSourceReportContent.includes('sitemap blocked because public HTTPS site origin is not confirmed')

const missing = requiredRoutes.filter((route) => !existsSync(file(route)))

if (missing.length > 0) {
  console.error(`Missing public Nuxt pages:\n${missing.map((route) => `- ${route}`).join('\n')}`)
  process.exit(1)
}

if (!existsSync(file('components/TerraFooter.vue'))) {
  console.error('Missing public footer component:\n- components/TerraFooter.vue')
  process.exit(1)
}

if (!existsSync(file('components/TerraNav.vue'))) {
  console.error('Missing public navigation component:\n- components/TerraNav.vue')
  process.exit(1)
}

if (!existsSync(file('error.vue'))) {
  console.error('Missing custom Nuxt error page:\n- error.vue')
  process.exit(1)
}

if (!existsSync(file('components/TerraBreadcrumb.vue'))) {
  console.error('Missing public breadcrumb component:\n- components/TerraBreadcrumb.vue')
  process.exit(1)
}

if (!existsSync(file('stores/theme.ts'))) {
  console.error('Missing public theme store:\n- stores/theme.ts')
  process.exit(1)
}

const requiredPublicDataLayerFiles = [
  'types/public-api.ts',
  'composables/usePreviewImage.ts',
  'composables/usePublicApi.ts',
  'composables/usePublicItems.ts',
  'composables/usePublicItemDetail.ts',
  'composables/usePublicNpcs.ts',
  'composables/usePublicBuffs.ts',
  'composables/usePublicBuffDetail.ts',
  'composables/usePublicProjectiles.ts',
  'composables/usePublicBosses.ts',
  'composables/usePublicBossDetail.ts',
  'composables/usePublicBiomes.ts',
  'composables/usePublicBiomeDetail.ts',
  'composables/usePublicRecipeTree.ts',
  'utils/price.ts',
  'components/common/PreviewImage.vue',
  'components/common/PaginationDock.vue',
  'components/common/TpSkeleton.vue',
  'composables/useCraftingRecipeModel.ts',
  'components/crafting/CraftingTargetBar.vue',
  'components/crafting/RecipeVariantSelector.vue',
  'components/crafting/RecipeOptionSelector.vue',
  'components/crafting/RecipeSheet.vue',
  'components/crafting/MaterialExpansionList.vue',
  'components/crafting/RecipeCompareTable.vue',
  'components/crafting/CraftingLegend.vue',
  'components/crafting/MaterialSlot.vue',
  'components/crafting/AnyMaterialGroupDisclosure.vue',
  'components/crafting/StationRequirementGroup.vue',
  'assets/css/domains/crafting.css',
  'components/crafting/RecipeSummaryCard.vue',
  'components/catalog/CatalogWallSkeleton.vue',
  'components/detail/ItemDetailSkeleton.vue',
  'components/search/SuggestionSkeletonRows.vue',
  'assets/css/loading-skeleton.css',
]

const missingPublicDataLayerFiles = requiredPublicDataLayerFiles.filter((path) => !existsSync(file(path)))

if (missingPublicDataLayerFiles.length > 0) {
  console.error(`Missing public data layer files:\n${missingPublicDataLayerFiles.map((path) => `- ${path}`).join('\n')}`)
  process.exit(1)
}

const requiredPublicDataLayerMarkers = {
  'types/public-api.ts': [
    'export type ApiResponse',
    'export type Pagination',
    'export type PublicItemListItem',
    'export type PublicItemDetail',
    'export type PublicItemImage',
    'export type PublicItemSource',
    'export type PublicItemRecipeTree',
    'export type PublicItemDetailBundle',
    'export type PublicItemQuery',
    'export type CatalogItem',
    'export type PublicNpcQuery',
    'export type PublicNpcWikiAssets',
    'export type PublicNpcLivingPreference',
    'export type PublicNpcListItem',
    'export type PublicNpcAggregate',
    'export type NpcCatalogCard',
    'export type PublicBuffQuery',
    'export type PublicBuffListItem',
    'export type PublicBuffDetail',
    'export type BuffCatalogItem',
    'export type PublicProjectileQuery',
    'export type PublicProjectileListItem',
    'export type ProjectileCatalogItem',
    'export type PublicBossQuery',
    'export type PublicBossListItem',
    'export type PublicBossDetail',
    'export type BossSummonItemDTO',
    'export type BossConditionDTO',
    'export type BossMechanicNoteDTO',
    'export type BossDifficultyNoteDTO',
    'export type BossCatalogCard',
    'export type PublicBiomeListItem',
    'export type BiomeCatalogTile',
    'export type PublicRecipeTreeResult',
  ],
  'composables/usePreviewImage.ts': [
    'export const resolvePreviewImageUrl',
    '/preview-assets/terrapedia-images/',
    '/terrapedia-images/',
  ],
  'composables/usePublicApi.ts': [
    'export const unwrapApiResponse',
    'export const usePublicApiFetch',
    "config.public.apiBase || '/api'",
    'config.apiServerBase',
    'import.meta.server',
  ],
  'composables/usePublicItems.ts': [
    'export const normalizePublicItem',
    'export const fallbackCatalogItems',
    'export const fetchPublicItems',
    'export const usePublicItems',
    "'/public/items'",
    'Array.isArray(rawItems)',
  ],
  'composables/usePublicItemDetail.ts': [
    'export const fetchPublicItemDetailBundle',
    'export const usePublicItemDetail',
    '/public/items/${normalizedItemId}',
    '/public/items/${normalizedItemId}/images',
    '/public/items/${normalizedItemId}/sources',
    '/public/items/${normalizedItemId}/recipe-tree',
    'resolvePreviewImageUrl',
    'source: \'missing\'',
  ],
  'composables/usePublicNpcs.ts': [
    'export const fetchPublicNpcs',
    'export const fetchPublicNpcAggregate',
    'export const usePublicNpcs',
    'export const usePublicNpcAggregate',
    "'/npcs'",
    '`/public/npcs/${normalizedNpcId}/aggregate`',
    "include: 'loot,shop,buffs'",
    'normalizePublicNpcAggregate',
  ],
  'composables/usePublicBuffs.ts': [
    'export const normalizePublicBuff',
    'export const fetchPublicBuffs',
    'export const usePublicBuffs',
    "'/public/buffs'",
    'Array.isArray(rawBuffs)',
    'source: \'api\'',
  ],
  'composables/usePublicBuffDetail.ts': [
    'export const normalizePublicBuffDetail',
    'export const fetchPublicBuffDetail',
    'export const usePublicBuffDetail',
    '`/public/buffs/${normalizedBuffId}`',
    "detailRecord[`source${'Items'}`]",
    "detailRecord[`inflicting${'Npcs'}`]",
    "detailRecord[`immune${'Npcs'}`]",
    'source: \'missing\'',
  ],
  'composables/usePublicProjectiles.ts': [
    'export const normalizePublicProjectile',
    'export const fetchPublicProjectiles',
    'export const usePublicProjectiles',
    "'/public/projectiles'",
    'Array.isArray(rawProjectiles)',
    'source: \'api\'',
  ],
  'composables/usePublicBosses.ts': [
    'export const normalizePublicBoss',
    'export const fetchPublicBosses',
    'export const usePublicBosses',
    "'/public/bosses'",
    'Array.isArray(rawBosses)',
    'source: \'api\'',
  ],
  'composables/usePublicBossDetail.ts': [
    'export const fetchPublicBossDetail',
    'export const usePublicBossDetail',
    '`/public/bosses/${normalizedBossId}`',
    'source: \'missing\'',
  ],
  'composables/usePublicBiomes.ts': [
    'export const normalizePublicBiome',
    'export const fetchPublicBiomes',
    'export const usePublicBiomes',
    "'/public/biomes'",
    'Array.isArray(rawBiomes)',
    'source: \'api\'',
  ],
  'composables/usePublicBiomeDetail.ts': [
    'export const fetchPublicBiomeDetail',
    'export const usePublicBiomeDetail',
    '`/public/biomes/${normalizedBiomeId}`',
    'source: \'missing\'',
  ],
  'composables/usePublicRecipeTree.ts': [
    'export const fetchPublicRecipeTree',
    'export const usePublicRecipeTree',
    '`/public/items/${normalizedItemId}/recipe-tree`',
    'source: \'missing\'',
  ],
  'utils/price.ts': [
    'export const formatTerrariaPrice',
    'export const formatCatalogPrice',
    'export type TerrariaPriceToken',
    'export const buildTerrariaPriceTokens',
    'export const formatTerrariaPriceTokens',
    'export const resolveTerrariaPriceUnitLabel',
    'export const localizeTerrariaPriceShorthandText',
    '不可购买',
    '不可出售',
  ],
  'components/common/PreviewImage.vue': [
    'resolvePreviewImageUrl',
    'failed',
    'fallbackGlyph',
    'class="item-art tp-preview-image"',
    '@load="syncVisibleCenter"',
    '@error="markFailed"',
    'getImageData',
    'ResizeObserver',
    '--tp-preview-visible-shift-x',
    '--tp-preview-visible-shift-y',
  ],
  'components/common/PaginationDock.vue': [
    'defineProps',
    'defineEmits',
    'catalog-page-dock',
    "'page-change'",
    "'page-size-change'",
    'catalog-density-picker',
  ],
  'pages/items/index.vue': [
    '<CommonPaginationDock',
    '@page-change="goToPage"',
    'summary-suffix',
  ],
  'pages/buffs/index.vue': [
    '<CommonPaginationDock',
    '@page-change="goToBuffPage"',
    'jump-id="buff-page-jump"',
  ],
  'pages/projectiles/index.vue': [
    '<CommonPaginationDock',
    '@page-change="goToProjectilePage"',
    '@page-size-change="setProjectilePageSize"',
  ],
  'components/common/TpSkeleton.vue': [
    "type?: 'icon' | 'line' | 'pill' | 'row'",
    'tp-skeleton',
    '`tp-skeleton-${props.type}`',
  ],
  'components/catalog/CatalogWallSkeleton.vue': [
    'CatalogWallSkeleton',
    'CommonTpSkeleton type="icon"',
    'CommonTpSkeleton type="line"',
  ],
  'components/detail/ItemDetailSkeleton.vue': [
    'ItemDetailSkeleton',
    'detail-loading-skeleton',
    'CommonTpSkeleton type="icon"',
    'CommonTpSkeleton type="pill"',
  ],
  'components/search/SuggestionSkeletonRows.vue': [
    'SuggestionSkeletonRows',
    'home-suggestion-row is-loading',
    'CommonTpSkeleton type="icon"',
    'CommonTpSkeleton type="line"',
  ],
  'composables/useCraftingRecipeModel.ts': [
    'export type CraftingNodeState',
    'export type CraftingMaterialView',
    'export type CraftingRecipeOptionView',
    'export const buildCraftingRecipeModel',
    'export const useCraftingRecipeModel',
    'expandable',
    'cycleDetected',
    'isReference',
    'referenceKey',
    'groupMembers',
    'formatMaterialSummary',
    'material.isAnyGroup',
    '任选其一',
    'summarizeMaterials',
    'childRecipe',
    'childRecipes',
    'childRecipeOptions',
    'canExpandChildRecipe',
    '!state.cycleDetected',
    '!state.isReference',
    'const stationSummary = stations.map((station) => station.title).join(\' / \')',
  ],
  'components/crafting/CraftingTargetBar.vue': [
    'data-crafting-role="target-bar"',
    'class="target-title"',
    '<CommonPreviewImage',
    'searchUnavailable',
    'refreshItems',
  ],
  'components/crafting/RecipeVariantSelector.vue': [
    'data-crafting-role="variant-selector"',
    ':aria-pressed="variant.key === activeKey"',
    'variant.meta',
  ],
  'components/crafting/RecipeOptionSelector.vue': [
    'data-crafting-role="recipe-option-selector"',
    ':aria-pressed="option.key === activeKey"',
    'option.summary || option.output.title',
  ],
  'components/crafting/RecipeSheet.vue': [
    'data-crafting-role="recipe-sheet"',
    'data-crafting-role="recipe-materials"',
    'data-crafting-role="recipe-stations"',
    'data-crafting-role="recipe-output"',
    '<CraftingAnyMaterialGroupDisclosure',
    '<CraftingMaterialSlot',
    '<CraftingStationRequirementGroup',
    '<CommonPreviewImage',
    'recipe-sheet-compact',
  ],
  'components/crafting/MaterialExpansionList.vue': [
    'data-crafting-role="material-expansion-list"',
    'CraftingMaterialSlot',
    'CraftingRecipeSheet',
    'material.childRecipes',
    'material-child-recipe-list',
    'compact',
  ],
  'components/crafting/RecipeCompareTable.vue': [
    'data-crafting-role="compare-table"',
    'data-crafting-role="compare-material"',
    'data-crafting-role="compare-station"',
    'data-crafting-role="compare-output"',
    'material.isAnyGroup',
    'material.members',
    'compare-any-members',
    '<CommonPreviewImage',
  ],
  'components/crafting/CraftingLegend.vue': [
    'data-crafting-role="legend"',
    '任选其一',
    '制作站选项',
    '秘银砧/山铜砧',
  ],
  'components/crafting/MaterialSlot.vue': [
    'data-crafting-role="material-slot"',
    '<CommonPreviewImage',
    'material.quantity',
  ],
  'components/crafting/AnyMaterialGroupDisclosure.vue': [
    'data-crafting-role="any-material-group"',
    '任选其一',
    'material.members',
    'any-material-inline-summary',
    'any-material-separator',
    '<CommonPreviewImage',
  ],
  'components/crafting/StationRequirementGroup.vue': [
    'data-crafting-role="station-options"',
    'station-option-summary',
    "stations.map((station) => station.title).join('/')",
    '<CommonPreviewImage',
  ],
  'assets/css/domains/crafting.css': [
    '.crafting-page',
    '.target-title',
    '.recipe-sheet-grid',
    '.recipe-flow-arrow',
    '.material-expansion-item:not([open]) > :not(summary)',
    '.station-option-summary',
    '.recipe-sheet-compact',
    '.any-material-group',
    '.recipe-output-inline',
  ],
  'assets/css/loading-skeleton.css': [
    '.tp-skeleton',
    '.tp-skeleton-icon',
    '.tp-skeleton-line',
    '.tp-skeleton-pill',
    '@keyframes tpSkeletonPulse',
  ],
  'nuxt.config.ts': [
    'apiServerBase',
    'terrapediaBackendOrigin',
    'TERRAPEDIA_IMAGE_ORIGIN',
    'TERRAPEDIA_MINIO_PUBLIC_ENDPOINT',
    'imageOrigin',
  ],
}

for (const [path, markers] of Object.entries(requiredPublicDataLayerMarkers)) {
  const content = readFileSync(file(path), 'utf8')

  for (const marker of markers) {
    if (!content.includes(marker)) {
      console.error(`${path}: missing public data layer marker ${marker}`)
      process.exit(1)
    }
  }
}

if (!existsSync(file('public/brand/terrapedia-logo.png'))) {
  console.error('Missing public TerraPedia logo asset:\n- public/brand/terrapedia-logo.png')
  process.exit(1)
}

if (!existsSync(file('public/brand/terrapedia-emblem.png'))) {
  console.error('Missing centered TerraPedia emblem asset:\n- public/brand/terrapedia-emblem.png')
  process.exit(1)
}

if (!existsSync(file('public/ui/terrapedia-icon-sprite.png'))) {
  console.error('Missing public UI icon sprite asset:\n- public/ui/terrapedia-icon-sprite.png')
  process.exit(1)
}

const generatedHomeHeroPixelSheets = [
  'public/ui/home-hero-pixel/relic-sheet.png',
  'public/ui/home-hero-pixel/craft-sheet.png',
  'public/ui/home-hero-pixel/manual-sheet.png',
]

for (const generatedPixelSheet of generatedHomeHeroPixelSheets) {
  if (!existsSync(file(generatedPixelSheet))) {
    console.error(`Missing home hero generated pixel sheet asset:\n- ${generatedPixelSheet}`)
    process.exit(1)
  }
}

const iconSpriteHeader = readPngHeader(file('public/ui/terrapedia-icon-sprite.png'))
if (iconSpriteHeader.colorType !== 6) {
  console.error('Public UI icon sprite must use RGBA transparency so dark theme does not show bright icon tiles')
  process.exit(1)
}

for (const generatedPixelSheet of generatedHomeHeroPixelSheets) {
  const generatedSheetHeader = readPngHeader(file(generatedPixelSheet))
  if (generatedSheetHeader.width !== 256 || generatedSheetHeader.height !== 256) {
    console.error(`Unexpected generated home hero pixel sheet dimensions: ${generatedPixelSheet} is ${generatedSheetHeader.width}x${generatedSheetHeader.height}, expected 256x256`)
    process.exit(1)
  }
}

if (!existsSync(file('public/brand/terrapedia-emblem-centered.png'))) {
  console.error('Missing cache-busted centered TerraPedia emblem asset:\n- public/brand/terrapedia-emblem-centered.png')
  process.exit(1)
}

if (!existsSync(file('public/ui/terrapedia-icon-sprite.png'))) {
  console.error('Missing generated public UI icon sprite:\n- public/ui/terrapedia-icon-sprite.png')
  process.exit(1)
}

if (!existsSync(file('public/robots.txt'))) {
  console.error('Missing public robots.txt:\n- public/robots.txt')
  process.exit(1)
}

if (!robotsContent.includes('User-agent: *') || !robotsContent.includes('Allow: /')) {
  console.error('public/robots.txt must allow the public V0.1 read-only site')
  process.exit(1)
}

if (robotsContent.includes('Sitemap: /sitemap.xml')) {
  console.error('public/robots.txt must not reference a relative sitemap URL')
  process.exit(1)
}

if (robotsContent.match(/Sitemap:\s*(?!https:\/\/)/)) {
  console.error('public/robots.txt sitemap URL must be an absolute https origin URL')
  process.exit(1)
}

if (!sitemapContent && !sitemapBlocked) {
  console.error('public/sitemap.xml is missing and no sitemap-blocked SEO source report was recorded')
  process.exit(1)
}

if (sitemapContent) {
  const locValues = [...sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  const blockedRoutePattern = /\/user|\/login|\/register|\/favorites|\/settings|\/search-tool|\/home-hero-options/

  if (locValues.length === 0) {
    console.error('public/sitemap.xml must contain at least one <loc> entry when present')
    process.exit(1)
  }

  for (const loc of locValues) {
    if (!loc.startsWith('https://')) {
      console.error(`public/sitemap.xml loc must be an absolute https URL: ${loc}`)
      process.exit(1)
    }

    if (blockedRoutePattern.test(loc)) {
      console.error(`public/sitemap.xml must not include unavailable or internal route: ${loc}`)
      process.exit(1)
    }
  }
}

const emblemBalance = measureEmblemBalance(file('public/brand/terrapedia-emblem-centered.png'))

if (Math.abs(emblemBalance.xOffset) > 8 || Math.abs(emblemBalance.yOffset) > 18) {
  console.error(
    [
      'TerraPedia emblem visual balance failed:',
      `- xOffset=${emblemBalance.xOffset.toFixed(1)}px`,
      `- yOffset=${emblemBalance.yOffset.toFixed(1)}px`,
      '- regenerate public/brand/terrapedia-emblem-centered.png so the book+sword mark is visually centered at small nav size',
    ].join('\n'),
  )
  process.exit(1)
}

const scanFiles = [
  ...publicPageFiles,
  'app.vue',
  'error.vue',
  'nuxt.config.ts',
  'package.json',
  'components/TerraNav.vue',
  'components/TerraFooter.vue',
  'components/TerraBreadcrumb.vue',
  'components/common/PreviewImage.vue',
  'components/common/PaginationDock.vue',
  'components/common/TpSkeleton.vue',
  'composables/useCraftingRecipeModel.ts',
  'components/crafting/CraftingTargetBar.vue',
  'components/crafting/RecipeVariantSelector.vue',
  'components/crafting/RecipeOptionSelector.vue',
  'components/crafting/RecipeSheet.vue',
  'components/crafting/MaterialExpansionList.vue',
  'components/crafting/RecipeCompareTable.vue',
  'components/crafting/CraftingLegend.vue',
  'components/crafting/MaterialSlot.vue',
  'components/crafting/AnyMaterialGroupDisclosure.vue',
  'components/crafting/StationRequirementGroup.vue',
  'components/crafting/RecipeSummaryCard.vue',
  'components/catalog/CatalogWallSkeleton.vue',
  'components/detail/ItemDetailSkeleton.vue',
  'components/search/SuggestionSkeletonRows.vue',
  'components/home/HomeHero.vue',
  'components/home/HomeExplorationMap.vue',
  'components/home/HomeFeaturedRoute.vue',
  'components/home/HomeBossProgression.vue',
  'components/home/HomeCodexBand.vue',
  'composables/useHomeData.ts',
  'composables/usePublicItems.ts',
  'composables/usePublicBuffs.ts',
  'composables/usePublicBuffDetail.ts',
  'composables/usePublicProjectiles.ts',
  'stores/theme.ts',
  'assets/css/hifi-preview.css',
  'assets/css/loading-skeleton.css',
  'assets/css/catalog-image-fixes.css',
  'assets/css/light-theme-contrast-fixes.css',
  'assets/css/domains/crafting.css',
]

const violations = []
const hifiCss = readFileSync(file('assets/css/hifi-preview.css'), 'utf8')
const lightContrastCss = readFileSync(file('assets/css/light-theme-contrast-fixes.css'), 'utf8')
const homeHeroOptionsCss = readFileSync(file('assets/css/home-hero-options.css'), 'utf8')
const lightThemeSelector = ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])'
const homeTemplateFiles = [
  'pages/index.vue',
  'components/home/HomeHero.vue',
  'components/home/HomeExplorationMap.vue',
  'components/home/HomeFeaturedRoute.vue',
  'components/home/HomeBossProgression.vue',
  'components/home/HomeCodexBand.vue',
]
const homeDataFiles = [
  'composables/useHomeData.ts',
]
const homeTemplateContent = homeTemplateFiles.map((path) => readFileSync(file(path), 'utf8')).join('\n')
const homeDataContent = homeDataFiles.map((path) => readFileSync(file(path), 'utf8')).join('\n')
const homeAuditContent = `${homeTemplateContent}\n${homeDataContent}`
const forbiddenHomepageLaunchTerms = [
  '最后数据更新:2 天前',
  'trendingArticles',
  'views',
  '热门内容',
  '社区共建',
  '收藏路线',
]

const requiredLightVisualSelectors = [
  `${lightThemeSelector} .item-cell:hover`,
  `${lightThemeSelector} .article-card:hover`,
  `${lightThemeSelector} .boss-node:hover`,
  `${lightThemeSelector} .buff-signal.active`,
  `${lightThemeSelector} .dark-card`,
  `${lightThemeSelector} .hero-j1-icon`,
  `${lightThemeSelector} .preview-panel`,
  `${lightThemeSelector} .stat-box`,
  `${lightThemeSelector} .preview-list-row`,
  `${lightThemeSelector} .cover-art`,
  `${lightThemeSelector} .cover-art::before`,
  `${lightThemeSelector} .cover-plate.primary`,
  `${lightThemeSelector} .cover-plate.secondary`,
  `${lightThemeSelector} .cover-plate.tertiary`,
]

for (const selector of requiredLightVisualSelectors) {
  if (!lightContrastCss.includes(selector)) {
    violations.push(`assets/css/light-theme-contrast-fixes.css: missing light visual override for ${selector}`)
  }
}

if (!lightContrastCss.includes('@keyframes subtle-pulse-light')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: missing light-specific subtle-pulse animation')
}

if (!lightContrastCss.includes('animation-name: subtle-pulse-light')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: active light cards must use subtle-pulse-light instead of the dark pulse keyframes')
}

if (!lightContrastCss.includes('rgba(var(--theme-text-rgb), 0.14') && !lightContrastCss.includes('rgba(var(--theme-text-rgb), .14')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: light surface shadows must use theme text color at visible depth')
}

if (!lightContrastCss.includes('rgba(var(--entry-accent), 0.18') && !lightContrastCss.includes('rgba(var(--entry-accent), .18')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: home J1 icons must retain a visible entry-accent glow in light themes')
}

if (!/\[data-theme="light"\]\s*,\s*\n\[data-theme="morning-paper"\]\s*,\s*\n\[data-theme="warm-slate"\]\s*\{[\s\S]*--theme-surface-shadow:/m.test(lightContrastCss)) {
  violations.push('assets/css/light-theme-contrast-fixes.css: light shadow token overrides must use real [data-theme] specificity so they beat hifi theme variables')
}

if (!hifiCss.includes('background-color: rgba(244,234,208,0.04)')) {
  violations.push('assets/css/hifi-preview.css: expected dark-theme hover baseline marker is missing; update light visual audit before changing this block')
}

if (existsSync(file('app/app.vue'))) {
  violations.push('app/app.vue: nested Nuxt 4 app shell must not exist; root app.vue/pages/components are the public source root')
}

for (const path of scanFiles) {
  const content = readFileSync(file(path), 'utf8')

  if (requiredSeoRoutes.includes(path) && !content.includes('useSeoMeta')) {
    violations.push(`${path}: V0.1 public route must define route-level useSeoMeta`)
  }

  if (playerFacingCopyFiles.includes(path)) {
    const playerFacingContent = extractPlayerFacingAuditContent(content)

    for (const term of forbiddenPlayerFacingTerms) {
      if (playerFacingContent.includes(term)) {
        violations.push(`${path}: player-facing copy must not expose backend/internal wording "${term}"`)
      }
    }
  }

  for (const term of forbiddenPublicTerms) {
    if (content.includes(term)) {
      violations.push(`${path}: forbidden backend field "${term}"`)
    }
  }

  if (content.includes('clamp(')) {
    violations.push(`${path}: avoid clamp() in the public preview CSS/templates`)
  }

  if (/\b\d+(?:\.\d+)?vw\b/.test(content.replaceAll('calc(100vw - 32px)', '').replaceAll('calc(100vw - 28px)', ''))) {
    violations.push(`${path}: avoid vw-based sizing in the public preview`)
  }

  if (publicPageFiles.includes(path) && !content.includes('<TerraFooter')) {
    violations.push(`${path}: public page must render the shared TerraFooter`)
  }

  if (path === 'error.vue') {
    for (const marker of [
      'defineProps',
      'clearError',
      'TerraNav',
      'TerraFooter',
      'error-screen',
      'error-status-code',
      '404',
      '返回首页',
      '物品图鉴',
      '搜索资料',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: custom Nuxt error page must include marker ${marker}`)
      }
    }

    for (const forbiddenMarker of [
      'Page not found',
      'Nuxt',
      'Stack trace',
      'statusMessage',
    ]) {
      if (content.includes(forbiddenMarker)) {
        violations.push(`${path}: custom error page must not expose default Nuxt error wording (${forbiddenMarker})`)
      }
    }
  }

    if (publicPageFiles.includes(path) && !content.includes('<TerraNav')) {
      violations.push(`${path}: public page must render the shared TerraNav`)
    }

    const semanticContent = path === 'pages/index.vue' ? homeTemplateContent : content

    if (publicPageFiles.includes(path) && !semanticContent.includes('<h1')) {
      violations.push(`${path}: public page must expose one semantic h1 for the primary page title`)
    }

    if (publicPageFiles.includes(path)) {
      const headings = [...semanticContent.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]))

      if (headings.filter((level) => level === 1).length !== 1) {
        violations.push(`${path}: public page must expose exactly one semantic h1`)
      }

      for (let index = 1; index < headings.length; index += 1) {
        if (headings[index] - headings[index - 1] > 1) {
          violations.push(`${path}: heading hierarchy skips from h${headings[index - 1]} to h${headings[index]}`)
          break
        }
      }
    }

    if (publicPageFiles.includes(path) && path !== 'pages/index.vue' && path !== 'pages/search-tool.vue' && !content.includes('<TerraBreadcrumb')) {
      violations.push(`${path}: public page must render the shared TerraBreadcrumb`)
    }

  if (publicPageFiles.includes(path) && content.includes('<header class="site-nav"')) {
    violations.push(`${path}: public page must not duplicate raw site-nav markup`)
  }

  if (path === 'components/TerraNav.vue') {
    for (const marker of ['sprite-icon icon-search', 'sprite-icon icon-codex']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: shared navigation must use the generated sprite icon marker ${marker}`)
      }
    }

    for (const route of unfinishedAccountRoutes) {
      if (content.includes(`href="${route}"`) || content.includes(`href='${route}'`)) {
        violations.push(`TerraNav.vue: V0.1 public nav must not link to unfinished account surface ${route}`)
      }
    }

    if (!content.includes('/brand/terrapedia-emblem-centered.png') || !content.includes('brand-logo-image')) {
      violations.push(`${path}: shared navigation must use the centered TerraPedia emblem asset in the brand mark`)
    }

    if (!content.includes('site-logo-copy') || !content.includes('TerraPedia') || !content.includes('中文资料库')) {
      violations.push(`${path}: shared navigation must show the TerraPedia brand text beside the emblem`)
    }

    if (content.includes('site-dock') || content.includes('dock-link')) {
      violations.push(`${path}: auxiliary routes must be grouped in a compact menu, not a second nav row`)
    }

    if (!content.includes('nav-menu-panel')) {
      violations.push(`${path}: shared navigation must expose auxiliary routes through a compact menu panel`)
    }

    if (!content.includes('nav-menu-hover-bridge')) {
      violations.push(`${path}: resources hover menu must include a hover bridge so pointer travel does not close the panel`)
    }

    if (!content.includes('nav-menu-text-trigger')) {
      violations.push(`${path}: shared navigation resources trigger should be a low-weight text menu`)
    }

    if (!content.includes('theme-toggle') || !content.includes('themeStore.cycleTheme')) {
      violations.push(`${path}: shared navigation must include a visible multi-theme toggle`)
    }

    for (const marker of ['themeOptions', 'themeStore.setTheme', 'role="radiogroup"', 'role="radio"', 'aria-checked']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: shared navigation multi-theme toggle must expose ${marker}`)
      }
    }

    if (content.includes('themeStore.toggleTheme') || content.includes('aria-pressed')) {
      violations.push(`${path}: shared navigation must not be limited to a two-state light/dark toggle`)
    }

    if (!content.includes('useThemeStore')) {
      violations.push(`${path}: shared navigation must use the Pinia theme store`)
    }

    if (content.includes('document.') || content.includes('localStorage')) {
      violations.push(`${path}: shared navigation must not manage theme through raw document/localStorage access`)
    }

    if (!content.includes('activeMenu')) {
      violations.push(`${path}: resources menu must use activeMenu state to prevent hover races`)
    }

    if (!content.includes("openMenu('resources')")) {
      violations.push(`${path}: resources trigger must explicitly open its managed menu state`)
    }

    if (!content.includes('scheduleCloseMenu')) {
      violations.push(`${path}: managed hover menus must use a short delayed close for pointer travel into panels`)
    }

    if (!content.includes("activeMenu === 'resources'")) {
      violations.push(`${path}: menu panel must bind its open class to activeMenu state`)
    }

    if (!content.includes(':aria-hidden="activeMenu !==') || !content.includes(':tabindex="activeMenu ===')) {
      violations.push(`${path}: closed resource menu links must be hidden from assistive tech and removed from tab order`)
    }

    if (!content.includes('@mouseenter') || !content.includes('@mouseleave')) {
      violations.push(`${path}: managed hover menus must handle pointer enter and leave explicitly`)
    }

    if (content.includes('secondary-button nav-menu-trigger')) {
      violations.push(`${path}: resources trigger must not look like a large secondary button beside account entry`)
    }

    for (const route of ['/search', '/crafting', '/categories', '/biomes', '/buffs', '/armor-sets', '/projectiles']) {
      if (!content.includes(route)) {
        violations.push(`${path}: shared navigation menu must expose ${route} before the footer`)
      }
    }
  }

  if (path === 'components/TerraBreadcrumb.vue') {
    for (const marker of ['unavailableAccountRoutes', 'isUnavailableAccountRoute(currentPath)', 'href: currentPath === path || isUnavailableAccountRoute(currentPath) ? undefined : currentPath']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: V0.1 breadcrumb must not link to unfinished account surfaces via marker ${marker}`)
      }
    }
  }

  if (path === 'components/TerraFooter.vue') {
    for (const route of unfinishedAccountRoutes) {
      if (content.includes(`href="${route}"`) || content.includes(`href='${route}'`)) {
        violations.push(`TerraFooter.vue: V0.1 public nav must not link to unfinished account surface ${route}`)
      }
    }
  }

  if (path === 'pages/index.vue') {
    for (const marker of [
      'await useHomeData()',
      '<HomeHero v-bind="hero"',
      '<HomeExplorationMap :nodes="explorationNodes"',
      '<HomeFeaturedRoute :route="featuredRoute"',
      '<HomeBossProgression :route="bossRoute"',
      '<HomeCodexBand :codex="codex"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: split home page must render component/data marker ${marker}`)
      }
    }

    if (!homeDataContent.includes('icon:') || !homeTemplateContent.includes('sprite-icon') || !homeTemplateContent.includes(':class="entry.icon"')) {
      violations.push(`${path}: home quick entries must render generated sprite icons from entry.icon`)
    }

    if (homeAuditContent.includes('hero-brand-lockup') || homeAuditContent.includes('hero-brand-emblem')) {
      violations.push(`${path}: home left index should use the top slot for useful entry/status content, not a repeated large logo`)
    }

    if (homeAuditContent.includes('index-entry-strip') || homeAuditContent.includes('分类入口') || homeAuditContent.includes('制作路线')) {
      violations.push(`${path}: home left index must not include the oversized top entry strip; keep the card compact`)
    }

    if (!homeTemplateContent.includes('hero-j1-panel') || !homeTemplateContent.includes('hero-j1-title')) {
      violations.push(`${path}: home hero must use the selected J1 large-title panel`)
    }

    const heroPanelIndex = homeTemplateContent.indexOf('class="hero-j1-panel"')
    const indexPanelIndex = homeTemplateContent.indexOf('class="hero-left"')
    if (heroPanelIndex === -1 || indexPanelIndex === -1 || heroPanelIndex > indexPanelIndex) {
      violations.push(`${path}: home hero must use the selected J1 left-right swapped layout with J1 before the index device`)
    }

    if (!homeTemplateContent.includes('hero-j1-grid') || !homeTemplateContent.includes('hero-j1-cell') || !homeDataContent.includes('primaryEntries')) {
      violations.push(`${path}: home hero must render the selected J1 2 x 2 primary entry grid`)
    }

    if (!homeTemplateContent.includes('hero-j1-icon') || !homeTemplateContent.includes('hero-j1-cell-copy') || !homeTemplateContent.includes('hero-j1-count')) {
      violations.push(`${path}: home J1 entries must include a large sprite icon, short description, and count`)
    }

    for (const route of ['/items', '/bosses', '/npcs', '/articles']) {
      if (!homeAuditContent.includes(route)) {
        violations.push(`${path}: home J1 primary grid must expose ${route}`)
      }
    }

    if (!homeTemplateContent.includes('hero-j1-search') || !homeTemplateContent.includes('/search')) {
      violations.push(`${path}: home J1 hero must include the full-width search entry`)
    }

    if (!homeTemplateContent.includes('hero-status-line') || !homeTemplateContent.includes('hero-status-pill') || homeTemplateContent.includes('hero-trust-band-desktop')) {
      violations.push(`${path}: home maintenance signals must render as a subtle inline status line, not a full-width desktop strip`)
    }

    for (const marker of [
      'useAsyncData(',
      'fetchHomeStats',
      '/statistics/overview',
      'homeSearchQuery',
      'type="search"',
      'role="search"',
      '@submit.prevent="submitHomeSearch"',
      'navigateTo(`/search?keyword=${encodeURIComponent(keyword)}`)',
    ]) {
      if (!homeAuditContent.includes(marker)) {
        violations.push(`${path}: home page must replace static/fake hero data with live stats and a real search control via marker ${marker}`)
      }
    }

    if (homeTemplateContent.includes('<div class="hero-j1-search">') || homeTemplateContent.includes('<strong>物品、Boss、NPC、路线...</strong>')) {
      violations.push(`${path}: home hero search must not be a fake static search bar`)
    }

    if (!homeDataContent.includes('secondaryLinks') || !homeTemplateContent.includes('hero-j1-paths') || !homeTemplateContent.includes('hero-j1-path-link')) {
      violations.push(`${path}: home J1 hero must include lower-weight secondary shortcuts below search`)
    }

    for (const route of ['/categories', '/crafting', '/biomes', '/buffs', '/armor-sets', '/projectiles']) {
      if (!homeAuditContent.includes(route)) {
        violations.push(`${path}: home J1 secondary shortcuts must expose ${route}`)
      }
    }

    for (const marker of [
      'explorationNodes',
      'v-for="node in nodes"',
      'class="map-node-link"',
      'featuredRoute',
      ':href="route.href"',
      '查看完整路线',
      'codex:',
      'v-for="action in codex.links"',
      'class="index-focus-action"',
      '/items/757',
      'home-primary-stat',
    ]) {
      if (!homeAuditContent.includes(marker)) {
        violations.push(`${path}: home page must make showcase nodes, route cards, codex chips, and index focus intentionally navigable via marker ${marker}`)
      }
    }

    if (homeTemplateContent.includes('<em>详情</em>') || homeTemplateContent.includes('<div class="codex-actions">') && homeTemplateContent.includes('<span>攻略</span>')) {
      violations.push(`${path}: home page must not render button-looking spans or em elements for navigable actions`)
    }

    if (homeTemplateContent.includes('<section class="index-plinth"')) {
      violations.push(`${path}: home page must remove the repeated index-plinth statistics block and use the hero/index stats only once`)
    }

    for (const forbiddenHeading of ['<h3>首页下半部分承接首屏', '<h4>将战斗、掉落和推进节奏摆在同一条线上', '<h4>文章区不是博客堆叠，而是专题导航']) {
      if (homeTemplateContent.includes(forbiddenHeading)) {
        violations.push(`${path}: home section headings must use a sequential h1 to h2 hierarchy instead of ${forbiddenHeading}`)
      }
    }

    if (homeTemplateContent.includes('class="boss-medallion">\n                  <span class="item-art"')) {
      violations.push(`${path}: home Boss event strip must not reuse a generic item sprite as the primary medallion`)
    }

    if (homeAuditContent.includes('195bfda5955641b5bf340322fdd26eba.png')) {
      violations.push(`${path}: home page must not use the Iron Pickaxe placeholder image in showcase sections`)
    }

    if (!content.includes('<TerraFooter :item-total-label="itemTotalLabel"')) {
      violations.push(`${path}: home footer must reuse the live item total label instead of showing a stale static total`)
    }

    for (const term of forbiddenHomepageLaunchTerms) {
      if (homeAuditContent.includes(term)) {
        violations.push(`${path}: V0.1 homepage must not claim unsupported dynamic or account/community behavior (${term})`)
      }
    }
  }

  if (path === 'components/TerraFooter.vue') {
    for (const marker of [
      'defineProps',
      'itemTotalLabel?: string',
      '{{ itemTotalLabel }}',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: shared footer must allow the home page to pass the live item total label via marker ${marker}`)
      }
    }
  }

  if (path === 'pages/npcs/index.vue') {
    for (const marker of [
      'usePublicNpcs',
      'npcCards',
      'pagination',
      ':href="npc.detailPath"',
      'v-for="npc in visibleNpcCards"',
      "npcResult.value?.source === 'api'",
      'npc-card-loading',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC list page must use the public NPC API data layer via marker ${marker}`)
      }
    }

    for (const marker of [
      'const npcCategoryGroups',
      'const quickFilters = npcCategoryGroups.flatMap',
      'const pageSizeOptions = [12, 24, 48, 96]',
      'pageSize: selectedPageSize.value !== defaultNpcPageSize',
      '<CommonPaginationDock',
      'matchNpcFilter',
      'npcWallTopRef',
      'scrollIntoView',
      'npcFallbackUnavailable',
      'npcDisplayCards',
      'npcVisualLoading',
      'npcLoadingSlotCount',
      '<CommonTpSkeleton',
      'npc-card-loading',
      'catalog-density-picker',
      'jump-id="npc-page-jump"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC list page must reuse item category, page-size, pagination dock, URL sync, and skeleton mechanics via marker ${marker}`)
      }
    }

    for (const marker of [
      'entity-layout',
      'entity-rail',
      'entity-filter',
      'entity-main-panel',
      'npc-board',
      'npc-card',
      'entity-preview-dark',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC list page must preserve its entity/NPC visual shell while adopting item paging mechanics via marker ${marker}`)
      }
    }

    if (!content.includes('v-for="group in npcCategoryGroups"') || !content.includes('v-for="filter in group.filters"')) {
      violations.push(`${path}: NPC category drawer must render grouped filters from npcCategoryGroups`)
    }

    assertApiPagedListBypassesLocalFilters(violations, path, content, {
      filteredBlockPattern: /const\s+filteredNpcCards\s*=\s*computed\(\(\)\s*=>\s*\{[\s\S]*?\n\}\)/,
      apiBypassMarker: "if (npcResult.value?.source === 'api') return npcDisplayCards.value",
      markers: [
        "search: backendSearch.value || undefined",
        "isTownNpc: selectedFilter.value.isTownNpc",
        "isFriendly: selectedFilter.value.isFriendly",
        "isBoss: selectedFilter.value.isBoss",
        "hasShop: selectedFilter.value.hasShop",
        "hasLoot: selectedFilter.value.hasLoot",
      ],
    })

    if (!content.includes('<CommonPaginationDock') || !content.includes('@page-change="goToPage"') || !content.includes('v-for="pageSize in pageSizeOptions"')) {
      violations.push(`${path}: NPC page dock and drawer must keep reusable paging and page-size controls wired`)
    }

    for (const marker of [
      'isFriendly: selectedFilter.value.isFriendly',
      'isBoss: selectedFilter.value.isBoss',
      'hasShop: selectedFilter.value.hasShop',
      'hasLoot: selectedFilter.value.hasLoot',
      "key: 'shop'",
      "key: 'loot'",
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC filters must be backed by public query fields through marker ${marker}`)
      }
    }

    if (content.includes('/npcs/guide')) {
      violations.push(`${path}: NPC list page must not link static /npcs/guide preview routes`)
    }
  }

  if (path === 'types/public-api.ts') {
    const livingPreferenceType = content.match(/export type PublicNpcLivingPreference = \{[\s\S]*?\n\}/)?.[0] ?? ''
    if (livingPreferenceType.includes('sourceText') || livingPreferenceType.includes('source_text')) {
      violations.push(`${path}: PublicNpcLivingPreference must not expose raw sourceText fields`)
    }

    const npcBuffRelationType = content.match(/export type PublicNpcBuffRelation = \{[\s\S]*?\n\}/)?.[0] ?? ''
    for (const marker of ['durationTicks?', 'duration_ticks?']) {
      if (!npcBuffRelationType.includes(marker)) {
        violations.push(`${path}: PublicNpcBuffRelation must include API duration tick fields via marker ${marker}`)
      }
    }
  }

  if (path === 'composables/usePublicNpcs.ts') {
    for (const marker of [
      'const normalizeNpcShopPriceToken',
      'raw.priceTokens ?? raw.price_tokens',
      'buyPrice: toNumberOrNull(raw.buyPrice ?? raw.buy_price)',
      'sellPrice: toNumberOrNull(raw.sellPrice ?? raw.sell_price)',
      'priceTokens:',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC shop normalizer must preserve structured coin token price data via marker ${marker}`)
      }
    }

    if (!content.includes('const normalizeNpcLivingPreference = (raw: PublicNpcLivingPreference): PublicNpcLivingPreference => ({')) {
      violations.push(`${path}: NPC living preferences must pass through the sanitizing normalizer`)
    }
    const livingPreferenceNormalizer = content.match(/const normalizeNpcLivingPreference = \(raw: PublicNpcLivingPreference\): PublicNpcLivingPreference => \(\{[\s\S]*?\n\}\)/)?.[0] ?? ''
    if (livingPreferenceNormalizer.includes('...raw') || livingPreferenceNormalizer.includes('sourceText') || livingPreferenceNormalizer.includes('source_text')) {
      violations.push(`${path}: normalizeNpcLivingPreference must not forward raw sourceText fields`)
    }
    const npcBaseNormalizer = content.match(/export const normalizePublicNpcBase = \(raw: PublicNpcListItem[\s\S]*?\n\}/)?.[0] ?? ''
    if (npcBaseNormalizer.includes('...raw')) {
      violations.push(`${path}: normalizePublicNpcBase raw payload must be a normalized field allowlist, not a raw spread`)
    }
    const rawPayload = content.match(/raw: \{[\s\S]*?\n    \},\n  \}/)?.[0] ?? ''
    if (rawPayload.includes('living_preferences') || rawPayload.includes('sourceText') || rawPayload.includes('source_text')) {
      violations.push(`${path}: normalizePublicNpcBase raw payload must not forward snake_case raw living_preferences`)
    }

    const npcBuffRelationNormalizer = content.match(/export const normalizePublicNpcBuffRelation = \(raw: PublicNpcBuffRelation\): PublicNpcBuffRelation => \(\{[\s\S]*?\n\}\)/)?.[0] ?? ''
    for (const marker of ['durationTicks:', 'raw.durationTicks ?? raw.duration_ticks']) {
      if (!npcBuffRelationNormalizer.includes(marker)) {
        violations.push(`${path}: normalizePublicNpcBuffRelation must preserve API duration tick fields via marker ${marker}`)
      }
    }
  }

  if (path === 'pages/npcs/[id].vue') {
    for (const marker of [
      'usePublicNpcAggregate',
      'route.params.id',
      'Number.isInteger',
      'trustedLoot',
      'trustedLootVisibleEntries',
      'trustedLootRemainderEntries',
      'shopEntries',
      'buffRelations',
      'materialStatus',
      'npcStatRows',
      'npcAssetCards',
      '资料图像',
      'lootConditionLabel(entry)',
      'buffConditionLabel(entry)',
      'shopConditionSummary(entry)',
      'dialoguePortraitImage',
      '生活偏好',
      'preferenceLabel',
      'normalizedPreferenceValue',
      'livingPreferenceRows',
      'preferenceGroups',
      'preferenceTargetImage',
      'preferenceFallbackIcon',
      'preferenceTargetTitle',
      'preferenceTargetRawName',
      'hasPreferenceSignal(row)',
      '未命名偏好对象',
      'preference-group-card',
      'preferenceTargetPath',
      'preferenceMissingLinkLabel',
      '偏好对象',
      '未关联资料',
      '特殊条件',
      'npcWikiAssets.value?.spriteImage',
      'npcWikiAssets.value?.mapIconImage',
      'npcBehaviorSummary',
      '基础数值',
      '出售物品',
      '掉落物',
      '状态效果',
      '加载 NPC 详情',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC detail page must use the public aggregate API data layer via marker ${marker}`)
      }
    }

    if (content.includes('/npcs/guide') || content.includes('后续接入')) {
      violations.push(`${path}: NPC detail page must not keep static guide preview links or future-integration copy`)
    }

    if (content.includes('售价待整理')) {
      violations.push(`${path}: NPC detail page must not render price placeholder copy as if it were useful data`)
    }

    if (content.includes('sourceProvider') || content.includes('sourcePage')) {
      violations.push(`${path}: NPC public detail page must not render internal source provider/page fields`)
    }

    for (const rawRelatedItemMarker of [
      'entry.quantityText',
      'entry.chanceText',
      'entry.priceText',
      'entry.note',
      'sourceProvider',
      'sourcePage',
    ]) {
      const relatedItemBlock = content.match(/const relatedItemSections = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] ?? ''
      if (relatedItemBlock.includes(rawRelatedItemMarker)) {
        violations.push(`${path}: NPC related item summary must not expose raw relation metadata (${rawRelatedItemMarker})`)
      }
    }

    if (!content.includes('relationTypeLabel(entry.relationType)')) {
      violations.push(`${path}: NPC related item summary must use player-facing relation labels`)
    }

    if (content.includes('[entry.relationType,')) {
      violations.push(`${path}: NPC buff relation rows must not render raw relationType enums`)
    }

    if (!content.includes('shopPriceTokens(entry)') || !content.includes('formatTerrariaPriceTokens(shopPriceTokens(entry))')) {
      violations.push(`${path}: NPC shop prices must render structured Terraria coin tokens instead of raw shorthand price text`)
    }

    if (!content.includes('resolveTerrariaPriceUnitLabel(token.unit)')) {
      violations.push(`${path}: NPC shop prices must derive visible coin labels from controlled unit mapping, not backend token labels`)
    }

    if (content.includes('label: safeNpcDisplayText(token.label)')) {
      violations.push(`${path}: NPC shop prices must not trust backend token.label for visible coin labels`)
    }

    if (!content.includes('class="npc-shop-price-token"') || !content.includes('class="npc-shop-price-icon"') || !content.includes('decorative')) {
      violations.push(`${path}: NPC shop price tokens must include fixed-size decorative coin images`)
    }

    if (!content.includes('npc-shop-grid') || !content.includes('npc-shop-row')) {
      violations.push(`${path}: NPC shop rows must use a dedicated compact shop grid instead of the generic relation row density`)
    }

    if (!content.includes('minmax(172px, 1fr)') || !content.includes('24px')) {
      violations.push(`${path}: NPC shop layout must increase row density and render larger coin icons`)
    }

    if (content.includes('[shopPriceLabel(entry), shopConditionSummary(entry)]')) {
      violations.push(`${path}: NPC shop rows must not concatenate raw price text into relation metadata`)
    }

    if (content.includes('entry.conditions].filter(Boolean)')) {
      violations.push(`${path}: NPC detail rows must not render raw conditions directly`)
    }

    const npcDetailTemplate = extractTemplateContent(content)
    for (const forbiddenMarker of [
      'sourceText',
      '{{living preferences',
      'terraria.wiki.gg',
      'shopConditionsLabel(entry)',
    ]) {
      if (npcDetailTemplate.includes(forbiddenMarker)) {
        violations.push(`${path}: NPC detail template must not render forbidden raw marker ${forbiddenMarker}`)
      }
    }

    if (content.includes('firstText(npc?.behaviorNotes') || content.includes('firstText(npc.value?.behaviorNotes')) {
      violations.push(`${path}: NPC hero behavior notes must use display-safe text before rendering`)
    }

    if (!content.includes('localizeTerrariaPriceShorthandText(firstText(value))')) {
      violations.push(`${path}: NPC hero and relation copy must localize Terraria coin shorthand before rendering public text`)
    }

    if (!content.includes('trustedLootVisibleEntries') || !content.includes('trustedLootRemainderEntries') || !content.includes('trustedLoot.value.slice(0, 8)')) {
      violations.push(`${path}: NPC trusted loot must be collapsed after the first 8 rows`)
    }

    if (!content.includes('trustedLoot.value.slice(8)') || !content.includes('v-for="entry in trustedLootRemainderEntries"')) {
      violations.push(`${path}: NPC trusted loot remainder must render from the post-8 slice, not drop or duplicate rows`)
    }

    for (const marker of [
      'npc.value?.moneyDrops',
      'formatTerrariaPriceTokens(drop.tokens)',
      'resolveTerrariaPriceUnitLabel(token.unit)',
      'token.iconUrl',
      'class="npc-money-token"',
      'class="npc-money-token-row"',
      'decorative',
      '24px',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC money drops must render compact Terraria coin tokens with controlled labels and optional backend icons via marker ${marker}`)
      }
    }

    if (content.includes('grid-template-columns: repeat(auto-fit, minmax(172px, 1fr))')) {
      violations.push(`${path}: NPC money drops must not use the old full-width card grid; keep money rewards as compact strips`)
    }

    if (content.includes('label: safeNpcDisplayText(token.label)')) {
      violations.push(`${path}: NPC money drops must not trust backend token.label for visible coin labels`)
    }

    for (const rawMoneyMarker of [
      'drop.value',
      'drop.moneyDropValue',
      'drop.money_drop_value',
      'npc.value?.value',
      'npc.value?.moneyDropValue',
      'npc.value?.money_drop_value',
    ]) {
      if (content.includes(rawMoneyMarker)) {
        violations.push(`${path}: NPC money drops must not render or fallback from raw copper values via marker ${rawMoneyMarker}; backend must provide structured tokens`)
      }
    }

    if (content.includes('npc-money-token-fallback')) {
      violations.push(`${path}: NPC money drops must use coin-specific visual marks instead of text glyph fallback when backend icons are missing`)
    }

    for (const marker of [
      'npc-buff-card-grid',
      'class="npc-buff-card"',
      'class="npc-buff-media"',
      'class="npc-buff-copy"',
      'class="npc-buff-meta"',
      ':src="entryImage(entry)"',
      ':fallback-icon="entryFallbackIcon(entry)"',
      'relationTypeLabel(entry.relationType)',
      'buffConditionLabel(entry)',
      'durationTicks',
      'duration_ticks',
      'formatBuffTickDuration',
      '-webkit-line-clamp: 2',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC buff relations must render as compact image-rich cards via marker ${marker}`)
      }
    }

    const buffConditionHelper = content.match(/const buffConditionLabel = \(entry: PublicNpcBuffRelation\)[\s\S]*?(?=\nconst |\n\nconst |\nconst [a-zA-Z])/u)?.[0] ?? ''
    if (buffConditionHelper.includes('sourceText') || buffConditionHelper.includes('source_text')) {
      violations.push(`${path}: NPC buff condition labels must not use raw sourceText as public fallback copy`)
    }

    if (content.includes('class="source-table dark-table"') && content.includes('v-for="entry in buffRelations"')) {
      violations.push(`${path}: NPC buff relations must not render as the old generic source-table rows`)
    }

    if (
      content.includes('firstText(npc.value?.nameZh, npc.value?.name, npc.value?.internalName')
      || content.includes('firstText(npc.value?.name, npc.value?.internalName')
      || content.includes('firstText(entry.itemNameZh, entry.itemName, entry.itemInternalName')
      || content.includes('firstText(entry.buffNameZh, entry.buffName, entry.buffInternalName')
      || content.includes('safeNpcDisplayText(entry.itemNameZh, entry.itemName, entry.itemInternalName')
      || content.includes('safeNpcDisplayText(entry.buffNameZh, entry.buffName, entry.buffInternalName')
    ) {
      violations.push(`${path}: NPC public labels must not fall back to internal NPC/item/buff names`)
    }

    assertTemplateOmitsRawFields(violations, path, content, [
      'entry.conditions',
      'entry.notes',
      'entry.chanceText',
      'entry.quantityText',
      'entry.durationText',
    ], 'NPC detail templates must render sanitized relation labels instead of raw relation fields')
    assertNoUnsafeFieldReader(violations, path, content, [
      'entry.conditions',
      'entry.notes',
      'entry.chanceText',
      'entry.quantityText',
      'entry.durationText',
    ], 'safeNpcDisplayText', 'NPC relation helper readers must not pass raw relation fields through firstText/displayText')

    for (const marker of [
      'shopEntryGroups',
      'shopGroupKey(entry)',
      '常驻出售',
      '阶段出售',
      '地点出售',
      '解锁出售',
      'v-for="group in shopEntryGroups"',
      'detail-group-remainder',
      'group.entries.slice(0, 8)',
      'group.entries.slice(8)',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC shop entries must be grouped by player-facing sale conditions via marker ${marker}`)
      }
    }

    if (content.includes('v-for="entry in shopEntries"')) {
      violations.push(`${path}: NPC shop entries must not render as one flat ungrouped list`)
    }

    if (!/v-for="asset in npcAssetCards"/.test(content) || !/:source-image="asset\.sourceImage"/.test(content)) {
      violations.push(`${path}: NPC detail page must render a dedicated media gallery for managed wiki assets and original base image`)
    }

    if (!/v-for="group in preferenceGroups"/.test(content) || !content.includes('<CommonPreviewImage') || !/preferenceTargetImage\(row\)/.test(content)) {
      violations.push(`${path}: NPC living preferences must render grouped visual relation cards with target images or semantic visual fallbacks`)
    }
  }

  if (path === 'pages/items/[id].vue') {
    for (const marker of [
      'usePublicItemDetail',
      'route.params.id',
      'detailItem',
      '<DetailItemDetailSkeleton v-if="detailLoadingState"',
      'detailLoadingState',
      ':aria-busy="detailLoadingState"',
      'notFoundState',
      'recipeTreeSummary',
      'imageEntries',
      'sourceEntryGroups',
      'itemCoverageRows',
      'itemDescriptionSourceText',
      'itemHasPrice',
      'itemTooltipText',
      'sourceGroupKey(source)',
      'safeItemDisplayText(tree.note, tree.summary, tree.description)',
      '制作路线',
      '来源分组',
      '图片画廊',
      '资料概览',
      'sourceEntries',
      '<CommonPreviewImage',
      '<RecipeSummaryCard',
      ':src="source.image"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: item detail page must render live public item detail data via marker ${marker}`)
      }
    }

    if (content.includes('Terra Blade') || content.includes('泰拉刃是一把困难模式后期近战武器')) {
      violations.push(`${path}: item detail page must not keep the static Terra Blade mock as primary content`)
    }

    if (content.includes('class="detail-tabs"') || content.includes('class="detail-tab')) {
      violations.push(`${path}: item detail page must not render fake tab buttons without navigation behavior`)
    }

    if (content.includes('image.note || image.url')) {
      violations.push(`${path}: item detail image rows must not fall back to rendering raw image URLs`)
    }

    if (
      content.includes('firstText(image.label, imageRoleLabel(image)')
      || content.includes('return firstText(image.label, image.name')
      || content.includes('safeItemDisplayText(image.label, image.name')
    ) {
      violations.push(`${path}: item image gallery must not render raw image labels or names`)
    }

    if (
      content.includes('sourceBiomeLabel(source)') && content.match(/sourceBiomeLabel[\s\S]*source\.biomeCode/)
      || content.match(/safeItemDisplayText\([^)]*source\.biomeCode/)
    ) {
      violations.push(`${path}: item source notes must not fall back to raw biome codes`)
    }

    if (
      content.includes('variant: firstText(activeRecipeVariant.value.variantLabel, activeRecipeVariant.value.variantKey')
      || content.includes('{{ firstText(variant.variantLabel, variant.variantKey')
    ) {
      violations.push(`${path}: item recipe copy must not fall back to raw recipe variant keys`)
    }

    if (content.includes('detailItem.value?.internalName') || content.includes('detailItem.value?.categoryPath')) {
      violations.push(`${path}: item detail header/category must not fall back to internal names or category paths`)
    }

    if (content.includes("itemDescriptionText.value ? '已整理'") || content.includes("statRows.value.some((row) => row.label === '买入'")) {
      violations.push(`${path}: item coverage status must be based on source fields, not fallback copy or placeholder stat rows`)
    }

    if (content.includes('note: firstText(tree.note, tree.summary, tree.description)')) {
      violations.push(`${path}: item recipe tree notes must use display-safe text before rendering`)
    }

    if (content.includes('<CraftingRecipeTreeNode')) {
      violations.push(`${path}: item detail page must use compact RecipeSummaryCard instead of the full recipe tree`)
    }

    const recipeIndex = content.indexOf('<RecipeSummaryCard')
    const sourceIndex = content.indexOf('item-source-module')
    const imageIndex = content.indexOf('<section v-if="imageEntries.length"')
    if (recipeIndex === -1 || sourceIndex === -1 || imageIndex === -1 || !(recipeIndex < sourceIndex && sourceIndex < imageIndex)) {
      violations.push(`${path}: item detail modules must order recipe summary before sources and image evidence`)
    }
  }

  if (path === 'pages/buffs/index.vue') {
    for (const marker of [
      'usePublicBuffs',
      'buffListQuery',
      'buffSearchQuery',
      'buffDisplayItems',
      'buffHeroEyebrow',
      'buffFallbackUnavailable.value || buffsError.value',
      'buffVisualLoading',
      'buffLoadingSlotCount',
      'goToBuffPage',
      '<CommonPaginationDock',
      'jump-id="buff-page-jump"',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="buffVisualLoading"',
      '{{ buffHeroEyebrow }}',
      'v-for="buff in buffDisplayItems"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: buffs page must render live public buff data with search, paging, preview images, and skeleton loading via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      '铁皮药水',
      '再生药水',
      '敏捷药水',
      '着火了！</h3>',
      '中毒</h3>',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: buffs page must not keep static preview-only buff content (${staticMarker})`)
      }
    }
  }

  if (path === 'pages/buffs/[id].vue') {
    for (const marker of [
      'usePublicBuffDetail',
      'route.params.id',
      'buffDetail',
      'buffDetailVisualLoading',
      'buffRelationSections',
      'sources',
      'inflicters',
      'immuneTargets',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="buffDetailVisualLoading"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: buff detail page must render live public buff detail data and relation sections via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      'Ironskin',
      '防御 +8',
      'Boss 前检查',
      '后续接入来源接口',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: buff detail page must not keep the static Iron Skin mock as primary content (${staticMarker})`)
      }
    }
  }

  if (path === 'pages/bosses/index.vue') {
    for (const marker of [
      'usePublicBosses',
      'bossDisplayItems',
      'bossHeroEyebrow',
      'bossApiUnavailable.value || bossesError.value',
      'bossVisualLoading',
      'bossLoadingSlotCount',
      'goToBossPage',
      '<CommonPaginationDock',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="bossVisualLoading"',
      '{{ bossHeroEyebrow }}',
      'v-for="boss in bossDisplayItems"',
      'boss-node-visual',
      'boss-node-backdrop',
      'boss-node-sprite',
      'boss-node-type',
      'boss-node-summary',
      'boss-node-meta',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: bosses page must render live public boss data with paging, preview images, and skeleton loading via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      '史莱姆王',
      '克苏鲁之眼',
      '血肉墙',
      '月亮领主',
      '普通模式到月亮领主前的关键节点',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: bosses page must not keep static preview-only boss content (${staticMarker})`)
      }
    }
  }

  if (path === 'pages/bosses/[id].vue') {
    for (const marker of [
      'usePublicBossDetail',
      'route.params.id',
      'bossDetailVisualLoading',
      'bossMembers',
      'bossLootEntries',
      'bossProgressionLabel',
      'bossTypeLabel',
      'bossSummonMethod',
      'bossSummonItems',
      'bossSummonConditions',
      'bossMechanicNotes',
      'bossDifficultyNotes',
      'bossSummonStatusRows',
      'safeBossDisplayText',
      'bossLootConditionLabel(entry)',
      'bossLootNoteLabel(entry)',
      'bossLootChanceLabel(entry)',
      'bossSummaryText',
      'boss-detail-loading-tags',
      'boss-detail-missing-tags',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="bossDetailVisualLoading"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: boss detail page must render live public boss detail data, members, loot, preview images, and skeleton loading via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      'Eye of Cthulhu',
      '克苏鲁之眼',
      '2800 HP',
      '恶魔矿 / 猩红矿',
      '战前完成度',
      '推进 #${bossCard?.progressionOrder}',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: boss detail page must not keep the static Eye of Cthulhu mock as primary content (${staticMarker})`)
      }
    }

    for (const rawUiMarker of [
      '<span>Members</span>',
      '<span>Loot</span>',
      '<span>Reference</span>',
      'entry.dropSourceKind,',
      "displayText(member.bossRole, member.sourceBossCode, '角色未标注')",
      'href="/npcs"',
      'bossCard?.type ||',
    ]) {
      if (content.includes(rawUiMarker)) {
        violations.push(`${path}: boss detail page must not expose raw labels, enum fallbacks, or dead relation links (${rawUiMarker})`)
      }
    }

    if (!content.includes("key === 'pre_hardmode'") || !content.includes('困难模式前')) {
      violations.push(`${path}: boss detail page must translate boss type enum labels before rendering`)
    }

    for (const marker of [
      'dropSourceKindLabel(entry.dropSourceKind)',
      'bossMemberRoleLabel(member.bossRole, member.sourceBossCode)',
      'bossMemberPath(member)',
      'bossLootItemPath(entry)',
      '<NuxtLink v-if="bossLootItemPath(entry)"',
      '召唤与触发',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: boss detail page must expose translated drop source labels and detail links via marker ${marker}`)
      }
    }

    if (content.includes('entry.conditions, entry.notes') || content.includes('entry.quantityText, entry.conditions')) {
      violations.push(`${path}: boss loot rows must not render raw conditions or notes directly`)
    }

    if (content.includes('bossCard?.summary || bossDetail?.notes')) {
      violations.push(`${path}: boss hero summary must use display-safe text before rendering`)
    }

    if (
      content.includes('bossDetail.value?.code')
      || content.includes('displayText(entry.itemNameZh, entry.itemName, entry.itemInternalName')
      || content.includes('safeBossDisplayText(entry.itemNameZh, entry.itemName, entry.itemInternalName')
      || content.includes('displayText(member.nameZh, member.name, member.internalName')
      || content.includes('safeBossDisplayText(member.nameZh, member.name, member.internalName')
    ) {
      violations.push(`${path}: boss detail public labels must not fall back to internal codes or internal names`)
    }

    if (content.includes("key ? key.replaceAll('_', ' ') : 'Boss'")) {
      violations.push(`${path}: boss type labels must not expose raw enum values when translation is missing`)
    }

    for (const marker of [
      'bossDetail.value?.summonMethodResolved',
      'summonItemTitle(item)',
      'bossSummonItemPath(item)',
      'bossConditionCopy(condition)',
      'bossMechanicCopy(note)',
      'bossDifficultyCopy(note)',
      'v-for="item in bossSummonItems"',
      'v-for="condition in bossSummonConditions"',
      'v-for="note in bossMechanicNotes"',
      'v-for="note in bossDifficultyNotes"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: boss detail page must consume P2 boss contract fields through sanitized display helpers via marker ${marker}`)
      }
    }

    if (
      content.includes('item.internalName')
      || content.includes('item.role')
      || content.includes('condition.conditionType')
      || content.includes('note.kind')
      || content.includes('note.mode')
      || content.includes('sourceText')
      || content.includes('derived')
    ) {
      violations.push(`${path}: boss detail page must not expose or branch on raw P2 contract keys, source text, internal names, or derived values`)
    }

    assertTemplateOmitsRawFields(violations, path, content, [
      'entry.conditions',
      'entry.notes',
      'entry.chanceText',
      'entry.quantityText',
      'member.internalName',
      'bossDetail?.code',
      'item.internalName',
      'item.role',
      'item.sourceText',
      'item.derived',
      'condition.conditionType',
      'condition.sourceText',
      'condition.derived',
      'note.kind',
      'note.mode',
      'note.sourceText',
      'note.derived',
    ], 'boss detail templates must render sanitized labels instead of raw/internal fields')
    assertNoUnsafeFieldReader(violations, path, content, [
      'entry.conditions',
      'entry.notes',
      'entry.chanceText',
      'entry.quantityText',
    ], 'safeBossDisplayText', 'boss loot helper readers must not pass raw loot fields through firstText/displayText')

    for (const marker of [
      'bossLootGroups',
      'bossLootGroupKey(entry)',
      '普通掉落',
      '宝藏袋',
      '条件掉落',
      'v-for="group in bossLootGroups"',
      'detail-group-remainder',
      'group.entries.slice(0, 8)',
      'group.entries.slice(8)',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: boss loot entries must render in grouped player-facing sections via marker ${marker}`)
      }
    }

    if (content.includes('v-for="entry in bossLootEntries"')) {
      violations.push(`${path}: boss loot entries must not render as one flat ungrouped list`)
    }

    for (const marker of [
      'bossDetail.value?.moneyDrops',
      'asArray(drop.tokens)',
      'formatTerrariaPriceTokens(drop.tokens)',
      'resolveTerrariaPriceUnitLabel(token.unit)',
      'token.iconUrl',
      'class="boss-money-drops"',
      'class="boss-money-token"',
      'decorative',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: boss money drops must render compact Terraria coin tokens with controlled labels and optional backend icons via marker ${marker}`)
      }
    }

    if (content.includes('label: safeBossDisplayText(token.label)')) {
      violations.push(`${path}: boss money drops must not trust backend token.label for visible coin labels`)
    }

    if (content.includes('safeBossDisplayText(drop.label)')) {
      violations.push(`${path}: boss money drops must not trust backend drop.label for visible difficulty labels`)
    }

    if (content.includes('drop.value')) {
      violations.push(`${path}: boss money drops must not render or fallback from raw copper values; backend must provide structured tokens`)
    }

    if (content.includes('boss-money-token-fallback')) {
      violations.push(`${path}: boss money drops must use coin-specific visual marks instead of text glyph fallback when backend icons are missing`)
    }

    if (!content.includes('!bossClientReady.value || bossDetailVisualLoading.value')) {
      violations.push(`${path}: boss detail readiness state must remain hydration-stable while client-only API data is pending`)
    }
  }

  if (path === 'pages/biomes/index.vue') {
    for (const marker of [
      'usePublicBiomes',
      'biomeDisplayItems',
      'biomeHeroEyebrow',
      'biomeApiUnavailable.value || biomesError.value',
      'biomeGroups',
      'biomeGroupOptions',
      'selectedBiomeGroup',
      'biomeFeaturedItems',
      'visibleBiomeGroups',
      'biomeVisualLoading',
      'biomeLoadingSlotCount',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="biomeVisualLoading"',
      '{{ biomeHeroEyebrow }}',
      'v-for="biome in biomeDisplayItems"',
      'v-for="group in biomeGroupOptions"',
      'v-for="biome in biomeFeaturedItems"',
      'v-for="group in visibleBiomeGroups"',
      'biome-command',
      'biome-filter-strip',
      'biome-feature-grid',
      'biome-list-grid',
      'biome-tile-facts',
      'biome-chip',
      'biome-tile-art',
      'biome-tile-backdrop',
      'biome-tile-thumb',
      'biome-tile-title',
      'biome-tile-description',
      'biome-tile-meta',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: biomes page must render live public biome data with groups, preview images, and skeleton loading via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      '/biomes/forest',
      '/biomes/desert',
      '/biomes/jungle',
      '/biomes/dungeon',
      '/biomes/underworld',
      '/biomes/hallow',
      '森林</b>',
      '丛林</b>',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: biomes page must not keep static preview-only biome tiles (${staticMarker})`)
      }
    }
  }

  if (path === 'pages/biomes/[id].vue') {
    for (const marker of [
      'usePublicBiomeDetail',
      'route.params.id',
      'biomeDetailVisualLoading',
      'biomeResources',
      'biomeRelations',
      'biome-detail-loading-tags',
      'biome-detail-missing-tags',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="biomeDetailVisualLoading"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: biome detail page must render live public biome detail data, resources, relations, preview images, and skeleton loading via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      'Biome · Jungle',
      '丛林',
      '蜂巢',
      '生命果',
      '石巨人路线',
      '打开专题',
      '{{ biomeTile?.layerType || \'layer\' }}',
      '{{ biomeTile?.biomeType || \'type\' }}',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: biome detail page must not keep the static Jungle mock as primary content (${staticMarker})`)
      }
    }
  }

  if (path === 'pages/crafting/index.vue') {
    for (const marker of [
      'usePublicRecipeTree',
      'usePublicItems',
      'useCraftingRecipeModel',
      'recipeTree',
      'recipeModel',
      'activeVariant',
      'activeRecipe',
      'activeOptions',
      'recipePending',
      '<CraftingTargetBar',
      '<CraftingRecipeVariantSelector',
      '<CraftingRecipeOptionSelector',
      '<CraftingRecipeSheet',
      '<CraftingMaterialExpansionList',
      '<CraftingRecipeCompareTable',
      '<CraftingLegend',
      'data-crafting-role="page"',
      ':aria-busy="recipePending"',
      "itemResults.value?.source === 'api'",
      'defaultRecipeTarget',
      'effectiveSelectedItemId',
      'isDefaultRecipeTarget',
      "itemId: '675'",
      '真永夜刃',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: crafting page must render the live API-backed recipe sheet architecture via marker ${marker}`)
      }
    }

    if (!content.includes('usePublicRecipeTree(effectiveSelectedItemId, maxDepth)')) {
      violations.push(`${path}: crafting page must load a default API-backed recipe tree instead of opening on an empty target`)
    }

    if (!/itemId:\s*'675'/.test(content) || !content.includes('真永夜刃')) {
      violations.push(`${path}: crafting page default example must use 真永夜刃 so direct Night's Edge + soul ingredients are visible`)
    }

    for (const staticMarker of [
      '静态占位',
      '泰拉刃制作链',
      '英雄断剑',
      '后续接接口',
      '<CraftingRecipeTreeNode',
      '<RecipeSummaryCard',
      'recipe-full-tree',
      'recipe-tree-stage',
      'recipe-tree-canvas',
      'recipe-tree-grid',
      'recipe-node-main',
      'recipe-node-materials',
      'recipe-example-targets',
      'recipe-wiki-tree',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: crafting page must not keep legacy or static preview-only recipe content (${staticMarker})`)
      }
    }
  }

  if (path === 'components/crafting/RecipeSummaryCard.vue') {
    for (const marker of [
      'PublicItemRecipeTreeNode',
      'PublicItemRecipeTreeStation',
      'recipeNodeChildren',
      'recipeNodeStations',
      'recipeRootOptionLabel',
      'recipe-top-layer',
      'recipe-top-grid',
      'recipe-top-card',
      'recipe-top-result',
      'recipe-top-materials',
      '<CommonPreviewImage',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: recipe summary card must own the shared top-level crafting summary markup via marker ${marker}`)
      }
    }

    if (content.includes('station.requirementRole')) {
      violations.push(`${path}: recipe summary card must not expose raw station requirementRole values`)
    }

    if (content.includes('top recipe')) {
      violations.push(`${path}: recipe summary card must not expose English internal section copy`)
    }
  }

  if (path === 'pages/projectiles/index.vue') {
    for (const marker of [
      'usePublicProjectiles',
      'projectileListQuery',
      'projectileSearchQuery',
      'projectileSortBy',
      'projectileDisplayItems',
      'projectileHeroEyebrow',
      'projectileApiUnavailable.value || projectilesError.value',
      'projectileVisualLoading',
      'projectileLoadingSlotCount',
      'goToProjectilePage',
      '<CommonPaginationDock',
      '@page-size-change="setProjectilePageSize"',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="projectileVisualLoading"',
      '{{ projectileHeroEyebrow }}',
      'v-for="projectile in projectileDisplayItems"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: projectiles page must render live public projectile data with search, sort, paging, preview images, and skeleton loading via marker ${marker}`)
      }
    }

    for (const staticMarker of [
      '泰拉光束',
      '木箭',
      '死亡激光',
      '水矢',
      '高保真预览先建立视觉语言',
    ]) {
      if (content.includes(staticMarker)) {
        violations.push(`${path}: projectiles page must not keep static preview-only projectile content (${staticMarker})`)
      }
    }
  }

  if (path === 'pages/armor-sets/index.vue') {
    for (const marker of [
      'usePublicArmorSets',
      'armorListQuery',
      'armorSearchQuery',
      'armorDisplayItems',
      'armorHeroEyebrow',
      'armorFallbackUnavailable.value || armorSetsError.value',
      'armorVisualLoading',
      'armorLoadingSlotCount',
      'goToArmorPage',
      '<CommonPaginationDock',
      '<CommonTpSkeleton',
      '<CommonPreviewImage',
      ':aria-busy="armorVisualLoading"',
      '{{ armorHeroEyebrow }}',
      'v-for="armor in armorDisplayItems"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: armor sets page must render live public armor data with search, paging, preview images, skeleton loading, and fallback-safe heading via marker ${marker}`)
      }
    }
  }

  if (path === 'pages/items/index.vue') {
    for (const marker of [
      'const defaultCatalogPageSize = 24',
      'const pageSizeOptions = [12, 24, 48, 96]',
      'pageSize: selectedPageSize.value !== defaultCatalogPageSize',
      'const catalogCategoryGroups',
      'const quickFilters = catalogCategoryGroups.flatMap',
      'const selectedCategoryIds = computed',
      'categoryIds.length === 1 ? categoryIds[0] : undefined',
      'matchCategoryFilter',
      'catalogWallTopRef',
      'scrollIntoView',
      'catalog-category-column',
      'catalog-category-drawer',
      'catalog-category-group',
      'catalog-wall-content',
      'catalog-wall-board',
      'catalog-density-picker',
      '<CommonPaginationDock',
      'jump-id="catalog-page-jump"',
      '@page-change="goToPage"',
      'categoryIds: selectedCategoryIds.value.length > 0 ? selectedCategoryIds.value : undefined',
      'item.priceLabel',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: items page must use the category drawer layout, compact defaults, top-scroll paging, and light dock controls via marker ${marker}`)
      }
    }

    if (!content.includes('武器') || !content.includes('照明') || !content.includes('机关') || !content.includes('Boss 掉落')) {
      violations.push(`${path}: category drawer must include redundant category coverage for future category API mapping`)
    }

    if (!content.includes('v-for="group in catalogCategoryGroups"') || !content.includes('v-for="filter in group.filters"')) {
      violations.push(`${path}: category drawer must render grouped redundant categories from catalogCategoryGroups`)
    }

    if (!content.includes('<CommonPaginationDock') || !content.includes('@page-change="goToPage"')) {
      violations.push(`${path}: light page dock must render through CommonPaginationDock wired to goToPage`)
    }

    if (!content.includes('jump-id="catalog-page-jump"') || !content.includes('v-for="pageSize in pageSizeOptions"')) {
      violations.push(`${path}: light page dock and drawer must keep reusable jump-page and page-size controls wired`)
    }

    for (const marker of [
      '<CatalogWallSkeleton',
      ':slots="catalogLoadingSlotCount"',
      'catalogClientReady',
      'catalogFallbackUnavailable',
      'catalogDisplayItems',
      'catalogVisualLoading',
      ':aria-busy="catalogVisualLoading"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: items page must expose a dedicated loading skeleton instead of using fallback glyphs while data is pending`)
      }
    }

    if (!content.includes('Array.isArray(items) ? items : fallbackCatalogItems')) {
      violations.push(`${path}: items page must preserve valid empty API result sets instead of replacing them with fallback data`)
    }

    if (!content.includes('!catalogClientReady.value || itemsPending.value')) {
      violations.push(`${path}: items page must show loading skeleton through client hydration and while the API page is pending instead of rendering fallback sample data`)
    }

    if (content.includes('catalog-density-rail-bottom')) {
      violations.push(`${path}: items page must replace the bulky bottom density rail with the light page dock`)
    }

    if (content.includes('nth-of-type(n + 7)')) {
      violations.push(`${path}: items page must not hide mobile page buttons with nth-of-type; compact pagination belongs in computed state`)
    }

    if (!content.includes(':class="[item.visualTone, { active: focusedItem?.id === item.id }]"')) {
      violations.push(`${path}: item wall background tone must come from stable item id data, not current grid position`)
    }

    if (!content.includes("{ flush: 'sync' }")) {
      violations.push(`${path}: items search reset must synchronously reset page state before the API query refreshes`)
    }

    assertApiPagedListBypassesLocalFilters(violations, path, content, {
      filteredBlockPattern: /const\s+filteredCatalogItems\s*=\s*computed\(\(\)\s*=>\s*\{[\s\S]*?\n\}\)/,
      apiBypassMarker: 'if (shouldUseApiPagedItems.value) return catalogDisplayItems.value',
      markers: [
        "const shouldUseApiPagedItems = computed(() => publicItemsResult.value?.source === 'api')",
        "const shouldApplyLocalCategoryFilter = computed(() => publicItemsResult.value?.source !== 'api')",
        "search: backendSearch.value || undefined",
        'categoryId: selectedCategoryId.value',
        'categoryIds: selectedCategoryIds.value.length > 0 ? selectedCategoryIds.value : undefined',
        'gamePeriodId: selectedGamePeriodId.value',
      ],
    })

    for (const invalidCategoryCode of [
      'MELEE_WEAPON',
      'RANGED_WEAPON',
      'MAGIC_WEAPON',
      'SUMMON_WEAPON',
      'AMMO',
      'ORE',
      'BAR',
      'INGOT',
      'CRAFTING_STATION',
      'WORKSTATION',
      'TREASURE_BAG',
      'LOOT_BAG',
      'FOOD',
      'BAIT',
      'CRATE',
      'BLOCK',
      'WALL',
      'DECORATION',
      'DECOR',
    ]) {
      if (content.includes(`'${invalidCategoryCode}'`)) {
        violations.push(`${path}: items category filters must use backend category tree codes, not stale code ${invalidCategoryCode}`)
      }
    }

    if (content.includes('catalog-floating-focus')) {
      violations.push(`${path}: items page must not render a fixed right-side focus card`)
    }

    if (!content.includes('catalog-hover-preview')) {
      violations.push(`${path}: items page must expose per-cell hover/focus previews instead of fallback focus content`)
    }

    if (!content.includes('<CommonPreviewImage') || !content.includes(':source-image="item.sourceImage"')) {
      violations.push(`${path}: item wall cells must use PreviewImage so real API items without managed images render a controlled glyph fallback`)
    }
  }

  if (path === 'pages/items/[id].vue') {
    if (!content.includes('formatTerrariaPrice')) {
      violations.push(`${path}: item detail prices must use Terraria coin formatting`)
    }
  }

  if (path === 'assets/css/loading-skeleton.css') {
    for (const marker of [
      '.tp-skeleton',
      '.tp-skeleton-icon',
      '.tp-skeleton-line',
      '.tp-skeleton-pill',
      '.tp-skeleton-row',
      '.item-art.tp-preview-image',
      '@media (prefers-reduced-motion: reduce)',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: shared loading skeleton CSS must expose reusable skeleton and preview image primitives via marker ${marker}`)
      }
    }

    for (const marker of [
      'width: 100%',
      'height: 100%',
      'min-width: 0',
      'min-height: 0',
      'box-sizing: border-box',
      '--tp-preview-image-size',
      'width: auto',
      'height: auto',
      'max-width: var(--tp-preview-image-size',
      'max-height: var(--tp-preview-image-size',
      'translate3d(var(--tp-preview-visible-shift-x',
      'var(--tp-preview-visible-shift-y',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: PreviewImage wrapper must fill the caller-owned art frame and bound the rendered sprite via marker ${marker}`)
      }
    }
  }

  if (path === 'assets/css/catalog-image-fixes.css') {
    for (const marker of [
      'grid-template-columns: repeat(6, minmax(0, 1fr))',
      'grid-template-rows: 12px minmax(86px, 1fr) auto',
      'min-height: 130px',
      'width: var(--catalog-wall-frame-size)',
      'height: auto',
      'height: var(--catalog-wall-image-size)',
      'overflow: hidden',
      'max-width: var(--catalog-wall-image-size)',
      'max-height: var(--catalog-wall-image-size)',
      'scroll-margin-top: 88px',
      '.catalog-wall-cell.tone-1',
      '.catalog-wall-cell.tone-2',
      '.catalog-wall-cell.tone-3',
      '.catalog-hover-preview',
      '.catalog-wall-cell:hover .catalog-hover-preview',
      '.catalog-wall-content',
      '.catalog-category-column',
      '.catalog-category-drawer',
      '.catalog-category-group',
      '.catalog-category-chip',
      '.catalog-density-picker',
      '.catalog-wall-board',
      '.catalog-page-dock',
      '.catalog-page-dock-core',
      '.catalog-dock-jump-form',
      '.catalog-density-rail span::before',
      'object-fit: contain',
      '.catalog-loading-skeleton',
      'position: sticky',
      '@keyframes catalogPixelPulse',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: catalog wall must reserve icon/text space and render a dedicated pixel loading state via marker ${marker}`)
      }
    }

    if (content.includes('.catalog-density-rail-bottom')) {
      violations.push(`${path}: catalog wall CSS must replace the bulky sticky density rail with the light page dock`)
    }

    if (content.includes('nth-of-type(n + 7)')) {
      violations.push(`${path}: catalog dock CSS must not hide mobile page buttons with nth-of-type because non-page buttons affect the count`)
    }

    for (const rule of content.matchAll(/\.catalog-wall-cell\s+\.item-art\[data-fallback\]\s+img\s*\{([^}]*)\}/g)) {
      const declarations = rule[1]

      if (/(?:^|\n)\s*width:\s*var\(--catalog-wall-image-size\)/.test(declarations)) {
        violations.push(`${path}: catalog wall images must preserve native aspect ratio instead of forcing all sprites into a square image box`)
      }
    }
  }

  if (path === 'assets/css/hifi-preview.css') {
    for (const marker of [
      '.detail-loading-skeleton',
      '@keyframes detailPixelPulse',
      '.detail-screen .item-art img',
      '.detail-screen .item-art[data-fallback]::before',
      'content: attr(data-fallback)',
      'object-fit: contain',
      'column-gap: 18px',
      'row-gap: 10px',
      '.boss-node-visual',
      '.boss-node-backdrop',
      '.boss-node-sprite',
      '.boss-node-summary',
      '.boss-node-meta',
      '.biome-tile-art',
      '.biome-tile-backdrop',
      '.biome-tile-thumb',
      '.biome-tile-description',
      '.biome-tile-meta',
      '.biome-command',
      '.biome-filter-strip',
      '.biome-feature-grid',
      '.biome-list-grid',
      '.biome-tile-facts',
      '.biome-chip',
      'opacity: 0.18',
      'max-height: 7.75em',
      'overflow-x: auto',
      'overflow-y: visible',
      'overscroll-behavior-x: contain',
      '.recipe-top-layer',
      '.recipe-top-materials',
      '.recipe-tree-node',
      '-webkit-line-clamp',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: item/detail and live entity pages must reserve icon/text spacing and render stable API layouts via marker ${marker}`)
      }
    }

    if (content.includes('transform: scale(1.3);')) {
      violations.push(`${path}: boss and biome backdrop layers must not use transform scale because it expands the visual box and clips thumbnails`)
    }

    for (const marker of [
      '.npc-card i .item-art',
      '.portrait-stage .item-art',
      '.npc-detail-portrait .item-art',
      '.sprite-frame .item-art',
      '.entity-detail-layout .sprite-frame .item-art',
      '--tp-preview-image-size',
      'width: 100%',
      'height: 100%',
      'margin: 0',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC and detail image frames must size PreviewImage wrappers explicitly via marker ${marker}`)
      }
    }
  }

  if (path === 'composables/usePublicItems.ts') {
    if (!content.includes('const sourceImage = normalizeText(raw.previewImage)')) {
      violations.push(`${path}: catalog items must preserve the backend source image path for diagnostics while rendering through the preview proxy`)
    }

    if (!content.includes('visualTone: resolveVisualTone(itemId, index)')) {
      violations.push(`${path}: catalog items must expose a stable id-derived visual tone`)
    }

    if (!content.includes('range: String(itemId ?? index + 1).padStart(3, \'0\')')) {
      violations.push(`${path}: catalog item range must display the real item id instead of resetting per page`)
    }

    if (content.includes('rawItems.length === 0')) {
      violations.push(`${path}: empty successful API result arrays must not be treated as fetch failures`)
    }

    if (content.includes('|| fallbackImage')) {
      violations.push(`${path}: real API items without images must not be assigned unrelated sample fallback images`)
    }

    for (const marker of [
      'formatCatalogPrice',
      'categoryIds: query.categoryIds',
      'buy: toNumberOrNull(raw.buy ?? raw.buyPrice)',
      'sell: toNumberOrNull(raw.sell ?? raw.sellPrice)',
      'priceLabel: formatCatalogPrice',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: catalog items must include categoryIds query and price normalization marker ${marker}`)
      }
    }
  }

  if (path === 'composables/usePublicNpcs.ts') {
    for (const marker of [
      'isFriendly: typeof query.isFriendly === \'boolean\' ? query.isFriendly : undefined',
      'isBoss: typeof query.isBoss === \'boolean\' ? query.isBoss : undefined',
      'hasShop: typeof query.hasShop === \'boolean\' ? query.hasShop : undefined',
      'hasLoot: typeof query.hasLoot === \'boolean\' ? query.hasLoot : undefined',
      'npcType: toNumberOrNull(raw.npcType ?? raw.npc_type)',
      'damage: toNumberOrNull(raw.damage)',
      'lootEntryCount:',
      'shopEntryCount:',
      'buffRelationCount:',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: NPC normalizer must forward filters and expose list stats marker ${marker}`)
      }
    }
  }

  if (path === 'pages/items/index.vue') {
    if (!content.includes(':source-image="item.sourceImage"')) {
      violations.push(`${path}: item wall images must pass the original backend image URL to PreviewImage for debugging`)
    }
  }

  if (path === 'pages/home-hero-options.vue') {
    for (const marker of [
      'playerHeroDirections',
      "id: 'world-cover'",
      "id: 'codex-gallery'",
      "id: 'adventure-manual'",
      'World Cover',
      'Codex Gallery',
      'Adventure Manual',
      'player-hero-gallery',
      'player-hero-card',
      'player-hero-stage',
      'player-card-head',
      'player-brand-lockup',
      'player-quick-trails',
      'player-world-scene',
      'player-world-map',
      'player-entry-paths',
      'player-codex-gallery',
      'player-codex-shelves',
      'player-adventure-manual',
      'player-manual-route',
      '世界封面',
      '图鉴长廊',
      '冒险手册',
      'heroIconDirections',
      'hero-icon-option-board',
      'hero-icon-option-card',
      'svgRoleCatalog',
      'homeRoleSvgSymbols',
      'roleIconHref',
      'RoleSvgIcon',
      'abstractSvgEntries',
      'craftRouteStages',
      'svg-icon-defs',
      'home-role-search',
      'home-role-crafting',
      'home-role-codex',
      'RoleSvgIcon :role="',
      'hero-svg-icon-preview',
      'previewSvgIcons',
      'svgTileWall',
      "key: 'category'",
      "key: 'projectile'",
      "key: 'npc'",
      "key: 'biome'",
      "key: 'material'",
      "key: 'search'",
      "key: 'boss'",
      "key: 'buff'",
      "key: 'armor'",
      "key: 'article'",
      "key: 'favorites'",
      "key: 'edit'",
      "key: 'settings'",
      "key: 'codex'",
      "key: 'notification'",
      'iconComboSets',
      'simpleSvgGlyphs',
      'icon-combo-board',
      'icon-combo-card',
      'combo-role-strip',
      'svg-category-mosaic',
      'svg-mosaic-cell',
      'svg-icon-wall',
      'svg-tile-wall',
      'svg-icon-token',
      'craft-route-board',
      'craft-combo-lane',
      'manual-chapter-grid',
      'manual-icon-shelf',
      'concrete-image-slot floating-item-slot',
      'concrete-image-slot craft-result-slot',
      'manual-title-mark',
      '林地 SVG 资料入口',
      '工匠 SVG 路线',
      '手册 SVG 章节',
      '抽象 SVG 符号',
      '图鉴筛选',
      '事件识别',
      '掉落关系',
      '个人记录',
      '路线记录',
      "visualRole: 'category'",
      "visualRole: 'projectile'",
      "visualRole: 'npc'",
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: player-facing home hero options must include marker ${marker}`)
      }
    }

    for (const cssMarker of [
      '.player-hero-gallery',
      '.player-hero-card',
      '.player-hero-stage',
      '.player-card-head',
      '.player-brand-lockup',
      '.player-quick-trails',
      '.player-world-scene',
      '.player-world-map',
      '.player-entry-paths',
      '.player-codex-gallery',
      '.player-codex-shelves',
      '.player-adventure-manual',
      '.player-manual-route',
      '.svg-icon-defs',
      '.svg-icon-token',
      '.role-svg-icon',
      '.icon-combo-board',
      '.icon-combo-card',
      '.combo-role-strip',
      '.svg-icon-wall',
      '--icon-slot-line',
      '--icon-slot-fill',
      '--icon-stroke',
      '.role-category',
      '.role-projectile',
      '.role-npc',
      '.craft-combo-lane',
      '.manual-icon-shelf',
    ]) {
      if (!homeHeroOptionsCss.includes(cssMarker)) {
        violations.push(`assets/css/home-hero-options.css: home hero option page must style player-facing preview block ${cssMarker}`)
      }
    }

    const playerHeroOptionCount = content.match(/id: '(world-cover|codex-gallery|adventure-manual)'/g)?.length ?? 0
    if (playerHeroOptionCount !== 3) {
      violations.push(`${path}: player-facing home hero preview must define exactly three directions`)
    }

    for (const rejectedHomeHeroMarker of [
      'HOME HERO DENSITY LAB',
      'PUBLIC HOME HERO LAB',
      'homeHeroHifiOptions',
      'heroDensityOptions',
      'homeHeroDensityMetrics',
      'homeHeroRecentUpdates',
      'density-command-center',
      'density-atlas-wall',
      'density-route-console',
      'home-density-option-board',
      'home-density-option-card',
      '指挥台首页',
      '资料墙首页',
      '路线控制台首页',
      '圆形指挥盘',
      '路线控制台',
      '管理面板',
      '后台模块',
      '操作台',
    ]) {
      if (content.includes(rejectedHomeHeroMarker)) {
        violations.push(`${path}: player-facing home hero options must not include rejected control-room marker ${rejectedHomeHeroMarker}`)
      }
    }

    for (const rejectedHomeHeroSelector of [
      '.home-density-option-board',
      '.home-density-option-card',
      '.density-command-center',
      '.density-atlas-wall',
      '.density-route-console',
      '.home-hifi-gallery',
      '.home-hifi-card',
      '.home-hifi-frame',
      '.home-hifi-live-stage',
      '.home-hifi-live-command',
      '.home-hifi-live-category-wall',
      '.home-hifi-live-route-explorer',
      '.hifi-home-command-shell',
      '.hifi-category-wall-layout',
      '.hifi-route-explorer-layout',
    ]) {
      if (homeHeroOptionsCss.includes(rejectedHomeHeroSelector)) {
        violations.push(`assets/css/home-hero-options.css: player-facing home hero options must not include rejected selector ${rejectedHomeHeroSelector}`)
      }
    }

    for (const forbiddenMarker of [
      'generated-item-icon',
      'generated-craft-icon',
      'generated-manual-plate',
      'generated-abstract-icon',
      'heroIconTileStyle',
      '/home-hero-icons/',
      '/ui/home-hero-pixel/',
      'pixelSheets',
      'pixelIconStyle',
      'generated-pixel-icon',
      'pixel-icon-token',
      'hero-icon-pixel-preview',
      '/ui/home-hero-hifi/',
      'option.image',
      'pixelWallItems',
      'pixel-slot-pip',
      'pixel-wall-grid',
      'sprite-role-code',
      'sprite-icon',
      'icon-category',
      'icon-projectile',
      '主页同款',
      '小物件',
      '工作台物件',
      '手册印章',
      '像素图标密集墙',
    ]) {
      if (content.includes(forbiddenMarker)) {
        violations.push(`${path}: home hero option icons must use the SVG symbol system, not rejected pixel/sprite treatments (${forbiddenMarker})`)
      }
    }

    for (const noisyIconMarker of [
      '--pixel-icon-sheet',
      '--pixel-icon-x',
      '--pixel-icon-y',
      '.generated-pixel-icon',
      '.pixel-icon-token',
      '.home-hifi-frame img',
      '.pixel-wall-grid',
      '.pixel-slot-pip',
      '--role-rgb',
      '--role-dot-w',
      '--role-mark-w',
      '--role-mark-shadow',
      '.pixel-icon-token::before',
      '.pixel-icon-token::after',
      '.sprite-role-code',
      'content: "C"',
      'content: "P"',
      'content: "N"',
    ]) {
      if (homeHeroOptionsCss.includes(noisyIconMarker)) {
        violations.push(`assets/css/home-hero-options.css: minimalist pixel icons must avoid busy role markers (${noisyIconMarker})`)
      }
    }
  }

  if (publicPageFiles.includes(path) || path.startsWith('assets/css/')) {
    if (content.includes('http://localhost:9000') || content.includes('https://terraria.wiki.gg')) {
      violations.push(`${path}: public pages and CSS must not hard-code localhost image service or third-party wiki hotlinks; use /preview-assets/`)
    }
  }

  if (publicPageFiles.includes(path) && content.includes('<img src="/preview-assets/')) {
    violations.push(`${path}: preview asset images must use dynamic :src bindings so Nuxt dev does not rewrite them to /_nuxt/@fs paths`)
  }

  if (path === 'pages/search.vue') {
    for (const marker of [
      '<TerraBreadcrumb',
      'class="screen entity-screen active"',
      'class="support-layout discovery-search-page search-layout"',
      'class="search-command search-console support-panel"',
      'class="search-input-shell search-input-primary"',
      'class="search-results-grid search-results-grouped"',
      'class="search-suggestion-band support-panel"',
      'type="search"',
      'v-model=',
      'role="search"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: real minimum search page must expose marker ${marker}`)
      }
    }

    for (const marker of [
      'const route = useRoute()',
      'route.query.keyword',
      'resolvedSearchKeyword',
      'searchKeywordLabel',
      'fetchPublicItems',
      "source === 'api'",
      'empty query',
      'loading',
      'no real results',
      'API error',
      'unsupported domain navigation links',
      '<SearchSuggestionSkeletonRows',
      'v-for="item in itemResults"',
      'navigateTo(keyword ? `/search?keyword=',
      'watch(() => route.query.keyword,',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: real minimum search page must keep query/state marker ${marker}`)
      }
    }

    for (const term of forbiddenSearchFixtureTerms) {
      if (content.includes(term)) {
        violations.push(`${path}: V0.1 search page must not keep static fake result fixture ${term}`)
      }
    }
  }

  if (path === 'pages/search-tool.vue') {
    for (const marker of [
      'class="screen home-screen search-tool-screen active"',
      'class="home-tool-hero"',
      'class="home-tool-search"',
      'class="home-suggestion-list"',
      'class="home-quick-entry"',
      'class="home-tool-columns"',
      'type="search"',
      'v-model=',
      'role="search"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: retained search tool page must expose marker ${marker}`)
      }
    }

    for (const marker of [
      'const route = useRoute()',
      'const router = useRouter()',
      'route.query.keyword',
      'fetchPublicItemSuggestions',
      'searchSuggestions',
      'suggestionsPending',
      'suggestionsClientReady',
      'suggestionsVisualLoading',
      'fetchPublicItemSuggestions(keyword, 5, { allowFallback: false })',
      'router.replace',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: retained search tool page must keep live suggestion/query marker ${marker}`)
      }
    }
  }

  if (path === 'pages/articles/index.vue' || path === 'pages/articles/[slug].vue') {
    for (const marker of [
      '公开文章暂未开放',
      '真实文章待接入',
      '不展示未发布文章',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: V0.1 article route must render a truthful unavailable state via marker ${marker}`)
      }
    }

    for (const term of forbiddenArticleFixtureTerms) {
      if (content.includes(term)) {
        violations.push(`${path}: V0.1 article route must not keep static article fixture ${term}`)
      }
    }
  }

  if (path === 'pages/categories/[id].vue') {
    for (const marker of [
      'Category · V0.1',
      '完整分类树和条目计数仍以物品图鉴查询结果为准',
      '有限入口',
      'href="/items?search=近战"',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: V0.1 category detail must render a limited truthful state via marker ${marker}`)
      }
    }

    for (const term of forbiddenCategoryDetailFixtureTerms) {
      if (content.includes(term)) {
        violations.push(`${path}: V0.1 category detail must not keep static category fixture ${term}`)
      }
    }
  }

  if (path === 'pages/categories/index.vue') {
    for (const marker of ['sprite-icon icon-category', 'sprite-icon icon-armor', 'sprite-icon icon-material', 'sprite-icon icon-crafting', 'sprite-icon icon-buff', 'sprite-icon icon-items']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: category index must use generated sprite icon marker ${marker}`)
      }
    }
  }

  if (accountUnavailablePageFiles.includes(path)) {
    for (const marker of ['账户功能暂未开放', 'TerraPedia V0.1 先作为只读资料站发布', '先浏览资料：物品图鉴 / 搜索 / 合成树', 'href="/items"', 'href="/search"', 'href="/crafting"']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: V0.1 account routes must render the unified unavailable state via marker ${marker}`)
      }
    }

    for (const forbiddenTerm of forbiddenAccountUnavailableTerms) {
      if (content.includes(forbiddenTerm)) {
        violations.push(`${path}: V0.1 account unavailable page must not contain unfinished account placeholder term ${forbiddenTerm}`)
      }
    }
  }

  if (path === 'assets/css/hifi-preview.css') {
    if (!content.includes('/ui/terrapedia-icon-sprite.png') || !content.includes('.sprite-icon')) {
      violations.push(`${path}: public CSS must define the generated UI icon sprite system`)
    }

    if (!content.includes('image-rendering: pixelated')) {
      violations.push(`${path}: generated pixel sprite icons must use pixelated rendering to stay crisp in navigation`)
    }

    if (!content.includes('html.theme-switching::before') || !content.includes('html.theme-switching::after') || !content.includes('@keyframes theme-curtain') || !content.includes('@keyframes theme-sweep') || !content.includes('theme-orb-pop')) {
      violations.push(`${path}: theme switching must include a visible full-page curtain, sweep, and toggle motion`)
    }

    if (!content.includes('@media (prefers-reduced-motion: reduce)') || !content.includes('html.theme-switching::before') || !content.includes('html.theme-switching::after')) {
      violations.push(`${path}: theme switching animation must respect reduced motion preferences`)
    }

    if (!content.includes('.hero-j1-panel') || !content.includes('.hero-j1-grid') || !content.includes('.hero-j1-cell')) {
      violations.push(`${path}: home J1 visual system must define the large-title panel and 2 x 2 grid`)
    }

    if (!content.includes('.hero-j1-paths') || !content.includes('.hero-j1-path-link')) {
      violations.push(`${path}: home J1 visual system must define secondary shortcuts below search`)
    }

    for (const marker of [
      'min-height: 720px',
      'grid-template-columns: minmax(420px, 1fr) minmax(400px, 0.9fr)',
      'width: min(560px, 100%)',
      '.home-section-band',
      '.map-node-link',
      '.home-primary-stat',
      '.index-focus-action',
      '.featured-route-cta',
      '.codex-actions a',
      '@media (max-width: 1080px)',
      '.hero-j1-title { font-size: 64px;',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: home page CSS must address homepage review layout, accessibility, and interaction markers via ${marker}`)
      }
    }

    if (content.includes('.hero {\n  position: relative;\n  overflow: hidden;\n  min-height: 850px')) {
      violations.push(`${path}: home hero must not keep the old 850px first-screen lockup`)
    }

    if (content.includes('.atlas-index {\n  position: relative;\n  z-index: 1;\n  overflow: hidden;\n  width: 560px')) {
      violations.push(`${path}: atlas index must not use a fixed 560px width`)
    }

    const heroJ1TitleSize = readCssPxValue(content, '.hero-j1-title', 'font-size')
    if (heroJ1TitleSize === null || heroJ1TitleSize < 72) {
      violations.push(`${path}: home J1 title must keep the large high-impact scale`)
    }

    const heroJ1IconWidth = readCssPxValue(content, '.hero-j1-icon', 'width')
    const heroJ1IconHeight = readCssPxValue(content, '.hero-j1-icon', 'height')
    if (heroJ1IconWidth === null || heroJ1IconHeight === null || heroJ1IconWidth < 42 || heroJ1IconHeight < 42) {
      violations.push(`${path}: home J1 sprite icon must stay large enough for one-glance recognition`)
    }

    const sharedLightSelector = ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])'
    const lightHeroJ1CellRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-cell\s*\{[^}]*background\s*:/m
    if (!lightHeroJ1CellRule.test(content)) {
      violations.push(`${path}: light theme variants must adapt the home J1 cells instead of inheriting raw dark surfaces`)
    }

    const lightHeroJ1PathRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-path-link\s*\{[^}]*background\s*:/m
    if (!lightHeroJ1PathRule.test(content)) {
      violations.push(`${path}: light theme variants must adapt the home J1 secondary shortcut surfaces`)
    }

    for (const selector of ['.brand-logo-image', '.site-logo-copy', '.breadcrumb-shell']) {
      if (!content.includes(selector)) {
        violations.push(`${path}: public CSS must style the imported logo placement selector ${selector}`)
      }
    }

    for (const token of ['--font-sans', '--font-display', '--font-mono', '--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg']) {
      if (!content.includes(token)) {
        violations.push(`${path}: public CSS must define centralized typography token ${token}`)
      }
    }

    for (const token of [
      '--control-radius',
      '--control-height-sm',
      '--control-height-md',
      '--control-padding-x',
      '--button-primary-bg',
      '--button-primary-fg',
      '--button-secondary-bg',
      '--button-secondary-fg',
      '--button-control-bg',
      '--button-control-fg',
      '--button-control-active-bg',
      '--button-control-active-fg',
    ]) {
      if (!content.includes(token)) {
        violations.push(`${path}: public CSS must define centralized control/button token ${token}`)
      }
    }

    if (content.includes('--button-primary-from') || content.includes('--button-primary-to')) {
      violations.push(`${path}: primary buttons must use --button-primary-bg instead of split from/to gradient tokens`)
    }

    const primaryButtonRule = /\.primary-button\s*\{[^}]*background\s*:\s*var\(--button-primary-bg\)[^}]*color\s*:\s*var\(--button-primary-fg\)/m
    if (!primaryButtonRule.test(content)) {
      violations.push(`${path}: .primary-button must consume centralized --button-primary-bg and --button-primary-fg tokens`)
    }

    const secondaryButtonRule = /\.secondary-button\s*\{[^}]*background\s*:\s*var\(--button-secondary-bg\)[^}]*color\s*:\s*var\(--button-secondary-fg\)/m
    if (!secondaryButtonRule.test(content)) {
      violations.push(`${path}: .secondary-button must consume centralized --button-secondary-bg and --button-secondary-fg tokens`)
    }

    const centralizedControlSelectors = [
      '.icon-button',
      '.theme-toggle',
      '.nav-menu-text-trigger',
      '.account-avatar-link',
      '.small-button',
      '.detail-tab',
      '.filter-option',
      '.entity-filter',
    ]

    for (const selector of centralizedControlSelectors) {
      const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*var\\(--button-control-bg\\)[^}]*var\\(--button-control-fg\\)`, 'm')
      if (!rulePattern.test(content)) {
        violations.push(`${path}: ${selector} must consume centralized control button tokens`)
      }
    }

    if (/\[data-theme="(?:light|morning-paper|warm-slate)"\]\s+\.primary-button\s*\{[^}]*color\s*:/m.test(content)) {
      violations.push(`${path}: theme variants must tune primary button through tokens, not a .primary-button color override`)
    }

    if (!content.includes('font-family: var(--font-sans)')) {
      violations.push(`${path}: body typography must use the centralized --font-sans token`)
    }

    for (const token of ['--control-height-md: 44px', '--control-icon-size: 44px']) {
      if (!content.includes(token)) {
        violations.push(`${path}: shared navigation controls must keep mobile-safe touch token ${token}`)
      }
    }

    if (!content.includes('.nav-menu-panel:not(.is-open)') || !content.includes('visibility: hidden')) {
      violations.push(`${path}: closed nav/account menu panels must use visibility hiding, not opacity alone`)
    }

    if (content.includes('.index-entry-strip')) {
      violations.push(`${path}: home left index CSS must not keep the removed index-entry-strip block`)
    }

    const breadcrumbShellRule = /\.breadcrumb-shell\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*var\(--index-bg\)/m
    if (!breadcrumbShellRule.test(content)) {
      violations.push(`${path}: breadcrumb shell must use the same dark grid/index background tokens as the page`)
    }

    for (const selector of ['.brand-logo-image']) {
      const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*transform\\s*:`, 'm')
      if (rulePattern.test(content)) {
        violations.push(`${path}: ${selector} must not rely on transform-based cropping; use the centered emblem asset`)
      }
    }

    for (const selector of ['[data-theme="morning-paper"]', '[data-theme="warm-slate"]', '[data-theme="light"]']) {
      if (!content.includes(selector)) {
        violations.push(`${path}: public visual system must define theme selector ${selector}`)
      }
    }

    if (!content.includes('theme-toggle')) {
      violations.push(`${path}: public CSS must style the shared theme toggle control`)
    }

    if (content.includes('.nav-menu:hover .nav-menu-panel') || content.includes('.account-menu:hover .account-menu-panel')) {
      violations.push(`${path}: nav/account menu panels must not be controlled by independent CSS :hover selectors`)
    }

    for (const token of forbiddenLightThemeTokens) {
      if (content.includes(token)) {
        violations.push(`${path}: legacy light theme token "${token}" breaks the dark public visual system`)
      }
    }

    for (const selector of [
      `${sharedLightSelector} h1`,
      `${sharedLightSelector} .footer-links a`,
      `${sharedLightSelector} .footer-contact-list span`,
      `${sharedLightSelector} .boss-route span`,
      `${sharedLightSelector} .sprite-frame`,
      `${sharedLightSelector} .atlas-index`,
      `${sharedLightSelector} .breadcrumb-shell`,
      `${sharedLightSelector} .index-head span`,
      `${sharedLightSelector} .index-total span`,
      `${sharedLightSelector} .index-focus span`,
      `${sharedLightSelector} .index-metrics span`,
      `${sharedLightSelector} .index-row span`,
      `${sharedLightSelector} .index-row em`,
      `${sharedLightSelector} .showcase-sprite-stage`,
    ]) {
      if (!content.includes(selector)) {
        violations.push(`${path}: light theme variants must define readable/adapted styles for ${selector}`)
      }
    }

    const themeTokenGroups = [
      ['morning-paper', '#f3ead8', '#fffaf1', '#7a5a21', '--theme-body-bg'],
      ['warm-slate', '#eef1f4', '#ffffff', '#293241', '--theme-title-gradient'],
    ]
    for (const [theme, ...tokens] of themeTokenGroups) {
      if (!content.includes(`[data-theme="${theme}"]`)) {
        violations.push(`${path}: real theme ${theme} must have a dedicated token block`)
      }

      for (const token of tokens) {
        if (!content.includes(token)) {
          violations.push(`${path}: real theme ${theme} must include quality token ${token}`)
        }
      }
    }

    for (const selector of [
      '[data-theme="light"] .item-art',
      '[data-theme="morning-paper"] .item-art',
      '[data-theme="warm-slate"] .item-art',
      '[data-theme="light"] .boss-medallion .item-art',
      '[data-theme="morning-paper"] .boss-medallion .item-art',
      '[data-theme="warm-slate"] .boss-medallion .item-art',
      '[data-theme="light"] .loot-grid .item-art',
      '[data-theme="morning-paper"] .loot-grid .item-art',
      '[data-theme="warm-slate"] .loot-grid .item-art',
    ]) {
      if (content.includes(selector)) {
        violations.push(`${path}: theme variants must not resize item sprites in ${selector}; theme changes should only affect surfaces and text`)
      }
    }

    for (const selector of ['.sprite-frame', '.featured-route .route-art', '.boss-medallion', '.loot-grid > span']) {
      const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*overflow\\s*:\\s*hidden`, 'm')
      if (rulePattern.test(content)) {
        violations.push(`${path}: ${selector} must not crop item sprites with overflow:hidden`)
      }
    }
  }

  if (path === 'app.vue') {
    if (!content.includes('<NuxtPage')) {
      violations.push(`${path}: app shell must render NuxtPage directly so file-system routes are active at runtime`)
    }

    if (content.includes('<App')) {
      violations.push(`${path}: app shell must not forward to <App /> because that can leave Nuxt pages disabled at runtime`)
    }

    if (!content.includes('useThemeStore')) {
      violations.push(`${path}: app shell must initialize the Pinia theme store`)
    }

    if (!content.includes('theme-switching') || !content.includes('classList.add') || !content.includes('classList.remove')) {
      violations.push(`${path}: app shell must apply the controlled theme-switching class for theme transition animation`)
    }

    if (content.includes('localStorage') || content.includes('innerHTML')) {
      violations.push(`${path}: app shell must not inject raw theme scripts`)
    }
  }

  if (path === 'stores/theme.ts') {
    for (const marker of ['isSwitching', 'markThemeSwitching']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: theme store must expose animated switching state marker ${marker}`)
      }
    }

    if (content.includes('theme-switching')) {
      violations.push(`${path}: theme store must expose switching state, not write DOM classes directly`)
    }
  }

  if (path === 'stores/theme.ts') {
    for (const token of ['defineStore', 'useCookie', 'useHead', 'data-theme', 'terrapedia-theme', 'morning-paper', 'warm-slate', 'themeOptions', 'cycleTheme', 'isLightTheme']) {
      if (!content.includes(token)) {
        violations.push(`${path}: Pinia theme store must include ${token}`)
      }
    }

    for (const marker of ["export type SiteTheme = 'dark' | 'morning-paper' | 'warm-slate'", 'siteThemes', "value === 'light'", '清晨纸质', '暖石板']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: Pinia theme store must preserve real three-theme marker ${marker}`)
      }
    }

    if (content.includes("export type SiteTheme = 'dark' | 'light'") || content.includes('toggleTheme')) {
      violations.push(`${path}: Pinia theme store must support dark, morning-paper, and warm-slate instead of a two-state light theme`)
    }

    if (content.includes('document.') || content.includes('localStorage')) {
      violations.push(`${path}: Pinia theme store must use Nuxt state APIs instead of raw document/localStorage access`)
    }
  }

  if (path === 'nuxt.config.ts') {
    if (!content.includes('@pinia/nuxt')) {
      violations.push(`${path}: Nuxt app must install the Pinia Nuxt module`)
    }

    if (!content.includes('TerraPedia 泰拉瑞亚中文资料库')) {
      violations.push(`${path}: Nuxt app head must include the TerraPedia 泰拉瑞亚中文资料库 baseline title/description marker`)
    }

    if (!/dir\s*:\s*\{[\s\S]*app\s*:\s*['"]\.['"]/m.test(content)) {
      violations.push(`${path}: Nuxt 4 must set dir.app to "." so root app.vue, pages, components, and assets are active at runtime`)
    }
  }

  if (path === 'pages/about.vue') {
    for (const marker of [
      'TerraPedia 先以只读公开资料站开放',
      '非官方 Terraria 中文资料站',
      '基础资料以公开资料和项目维护数据为参考，并通过本项目的数据链路整理',
      'Terraria 及相关名称、图像和商标归其权利方所有',
      '页面内容会随数据维护状态持续校正',
    ]) {
      if (!content.includes(marker)) {
        violations.push(`${path}: about page must include V0.1 source/disclaimer marker ${marker}`)
      }
    }

    for (const forbiddenMarker of ['社区协作', 'Preview build', 'contact@terrapedia.local', '6,214', '1,111']) {
      if (content.includes(forbiddenMarker)) {
        violations.push(`${path}: about page must not keep unsupported launch copy marker ${forbiddenMarker}`)
      }
    }
  }

  if (path === 'package.json') {
    if (!content.includes('"pinia"')) {
      violations.push(`${path}: package must declare pinia`)
    }

    if (!content.includes('"@pinia/nuxt"')) {
      violations.push(`${path}: package must declare @pinia/nuxt`)
    }
  }
}

if (violations.length > 0) {
  console.error(`Public page checks failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log(`Public page checks passed for ${requiredRoutes.length} Nuxt routes.`)
