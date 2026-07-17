import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  process.env.CHROMIUM_BIN,
  '/snap/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean)
const chromium = candidates.find(path => existsSync(path))

if (!chromium) {
  throw new Error('Chromium is required for article content reference checks.')
}

const tempRoot = join(root, 'tmp')
mkdirSync(tempRoot, { recursive: true })
const tempDir = mkdtempSync(join(tempRoot, 'article-ref-'))
const htmlPath = join(tempDir, 'article-ref.html')

const articlePageSource = readFileSync(join(root, 'pages/articles/[slug].vue'), 'utf8')
const composableSource = readFileSync(join(root, 'composables/usePublicContentReferences.ts'), 'utf8')
const articleStyleSource = articlePageSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''
const craftingStyleSource = readFileSync(join(root, 'assets/css/domains/crafting.css'), 'utf8')
const craftingHierarchySource = readFileSync(join(root, 'components/crafting/RecipeHierarchyTree.vue'), 'utf8')
const recipeHierarchyGraphRendererSource = readFileSync(join(root, 'utils/recipeHierarchyGraphRenderer.ts'), 'utf8')
const sharedRecipeHierarchyGraphRendererPath = join(root, '..', 'shared/article-runtime/recipeHierarchyGraphRenderer.ts')
if (!existsSync(sharedRecipeHierarchyGraphRendererPath)) throw new Error('recipe graph renderer must move to the root shared article runtime')
const sharedRecipeHierarchyGraphRendererSource = readFileSync(sharedRecipeHierarchyGraphRendererPath, 'utf8')

const extractFunction = (source, name) => {
  const marker = `const ${name} = `
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Missing ${name} in article page source`)
  let end = source.length
  let braceDepth = 0
  let seenFunctionBody = false
  const lines = source.slice(start).split('\n')
  let offset = start
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (index > 0 && braceDepth <= 0 && (/^(const|type|watch|onMounted)\b/.test(line) || line.startsWith('</script>'))) {
      end = offset
      break
    }
    for (const char of line) {
      if (char === '{') {
        braceDepth += 1
        seenFunctionBody = true
      }
      if (char === '}') braceDepth -= 1
    }
    offset += line.length + 1
    if (seenFunctionBody && braceDepth < 0) {
      end = offset
      break
    }
  }
  return source.slice(start, end).replace(marker, `const ${name} = `)
}

const toBrowserJs = (source) => source
  .replace(/, options: \{[^)]*\} = \{\}/g, ', options = {}')
  .replace(/: string\[]/g, '')
  .replace(/Array<\{[^>]+\}>/g, 'Array')
  .replace(/: Array/g, '')
  .replace(/: string/g, '')
  .replace(/: 'href' \| 'src'/g, '')
  .replace(/: ArticleReferenceType \| ''/g, '')
  .replace(/: ArticleReferenceType/g, '')
  .replace(/: PublicItemRecipeTree \| null \| undefined/g, '')
  .replace(/: PublicItemRecipeTree \| null/g, '')
  .replace(/: PublicItemRecipeTreeVariant/g, '')
  .replace(/: PublicItemRecipeTreeNode\[]/g, '')
  .replace(/: PublicItemRecipeTreeNode/g, '')
  .replace(/: NonNullable<[^>]+>\[number\]/g, '')
  .replace(/: HTMLElement\[]/g, '')
  .replace(/: number\[]/g, '')
  .replace(/: number/g, '')
  .replace(/: 'loading' \| 'ready' \| 'missing' \| 'error'/g, '')
  .replace(/: 'ul' \| 'ol' \| ''/g, '')
  .replace(/: 'item' \| 'npc' \| 'boss' \| ''/g, '')
  .replace(/: 'item' \| 'npc' \| ''/g, '')
  .replace(/: 'top' \| 'bottom'/g, '')
  .replace(/: HTMLElement/g, '')
  .replace(/: HTMLElement \| null/g, '')
  .replace(/: MouseEvent \| FocusEvent/g, '')
  .replace(/: MouseEvent/g, '')
  .replace(/: FocusEvent/g, '')
  .replace(/: WheelEvent/g, '')
  .replace(/: PointerEvent/g, '')
  .replace(/\b(event|node|key)\?/g, '$1')
  .replace(/: RegExpExecArray \| null/g, '')
  .replace(/: KeyboardEvent/g, '')
  .replace(/: unknown\[]/g, '')
  .replace(/: unknown/g, '')
  .replace(/: any\[]/g, '')
  .replace(/: any/g, '')
  .replace(/, fallback = ''\)/g, ", fallback = '')")
  .replace(/\(station: \{[^)]*\} \| null \| undefined\)/g, '(station)')
  .replace(/\(station: \{[^)]*\} \| null \| undefined\)/g, '(station)')
  .replace(/\(embed\): embed is \{[^)]*\}/g, '(embed)')
  .replace(/ as const/g, '')
  .replace(/ as HTMLElement \| null/g, '')
  .replace(/ as HTMLElement/g, '')
  .replace(/ as PublicItemRecipeTreeNode & \{[^}]+\}/g, '')
  .replace(/reduce<[^>]+>/g, 'reduce')
  .replace(/new Map<string, string>\(\)/g, 'new Map()')
  .replace(/new Map<string, number>\(\)/g, 'new Map()')
  .replace(/new Map<string, PublicItemRecipeTreeNode>\(\)/g, 'new Map()')
  .replace(/new Map<string, PublicItemRecipeTreeNode\[]>\(\)/g, 'new Map()')
  .replace(/new Set<[^>]+>\(\)/g, 'new Set()')
  .replace(/querySelectorAll<HTMLElement>/g, 'querySelectorAll')
  .replace(/querySelector<HTMLElement>/g, 'querySelector')
  .replace(/import\.meta\.client/g, 'true')
  .replace(/<\/script/gi, '<\\/script')
  .replace(/Record<string, string\[]>/g, 'Object')
  .replace(/Record<string, string>/g, 'Object')
  .replace(/const allowedAttributes: Object/g, 'const allowedAttributes')
  .replace(/let match/g, 'let match')

// The DOM recipe-graph renderer now lives in the root shared article runtime
// (read-only, shared with data-query-app). Rather than reconstruct an
// in-memory adapter from page functions that no longer exist, the recipe-tree
// fixture below runs the real shared renderer: its TypeScript source is
// transpiled to module-free browser JS and exercised inside the same no-module
// Chromium environment as the extracted page helpers.
const toRuntimeJs = (source) => ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  },
}).outputText.replace(/\bexport\s+/g, '')

const requiredPageSymbols = [
  'sanitizeArticleHtml',
  'sanitizeArticleAttributes',
  'collectArticleReferenceInputs',
  'formatArticleReferenceTypeLabel',
  'computeArticleReferencePreviewPosition',
  'showArticleReferencePreview',
  'moveArticleReferencePreview',
  'hideArticleReferencePreview',
  'enhanceArticleReferenceNodes',
  'loadArticleReferences',
  'loadArticleRecipeTreeEmbeds',
]
for (const symbol of requiredPageSymbols) {
  if (!articlePageSource.includes(`const ${symbol}`)) {
    throw new Error(`Article page must define ${symbol}`)
  }
}
if (!articlePageSource.includes('ref="articleContentRef"')) throw new Error('article body must expose articleContentRef')
if (!articlePageSource.includes('onMounted')) throw new Error('article reference enhancement must run after client mount')
if (!articlePageSource.includes('nextTick')) throw new Error('article reference enhancement must wait for v-html DOM render')
if (!articlePageSource.includes("document.createElement('img')")) throw new Error('article reference enhancement must create inline chip images from resolved references')
if (!articlePageSource.includes('node.replaceChildren(img)')) throw new Error('article reference enhancement must render image-only references in article body')
if (!articlePageSource.includes("node.setAttribute('role', 'link')")) throw new Error('article reference enhancement must expose references as links')
if (!articlePageSource.includes("node.removeAttribute('title')")) throw new Error('article reference enhancement must use custom preview instead of native title tooltip')
if (!articlePageSource.includes('ARTICLE_REFERENCE_PREVIEW_ID')) throw new Error('article page must expose a stable tooltip id for reference previews')
if (!articlePageSource.includes('width: 1.875em')) throw new Error('article reference image size must scale with saved font size')
if (!articlePageSource.includes('internalName: reference?.internalName')) throw new Error('hover preview must expose resolved internal names')
if (!articlePageSource.includes('shouldPreviewArticleReferenceOnTap')) throw new Error('article references must support tap-to-preview on coarse pointers')
if (!articlePageSource.includes('fetchPublicRecipeTree(embed.itemId, embed.maxDepth)')) throw new Error('article recipe tree embeds must fetch recipe trees from saved item id and max depth')
if (!articlePageSource.includes('renderArticleRecipeTreeResult')) throw new Error('article recipe tree embeds must render fetched recipe tree results')
if (!articlePageSource.includes('data-tp-resolved')) throw new Error('article recipe tree embeds must expose runtime resolved state')
if (!articlePageSource.includes('<Teleport to="body">')) throw new Error('article reference preview must teleport to body so fixed positioning is not affected by transformed article panels')
if (!articleStyleSource.includes('.article-recipe-tree__graph')) throw new Error('article recipe tree graph must define hierarchy graph styles')
if (!recipeHierarchyGraphRendererSource.includes("from '#article-runtime/recipeHierarchyGraphRenderer'")) throw new Error('public recipe graph adapter must import the root shared renderer through its Nuxt alias')
if (!sharedRecipeHierarchyGraphRendererSource.includes("document.createElementNS('http://www.w3.org/2000/svg', 'svg')")) throw new Error('shared recipe tree graph renderer must use an SVG line canvas like the crafting page')
if (!sharedRecipeHierarchyGraphRendererSource.includes('recipe-overview-tree') || !sharedRecipeHierarchyGraphRendererSource.includes('recipe-hierarchy-card')) throw new Error('shared recipe tree graph renderer must reuse the crafting overview tree DOM classes')
if (!sharedRecipeHierarchyGraphRendererSource.includes('tp-article-runtime-popover') || !sharedRecipeHierarchyGraphRendererSource.includes('popoverThemeClass')) throw new Error('shared renderer must mark body portals with the caller theme class')
if (!sharedRecipeHierarchyGraphRendererSource.includes('holder.tabIndex = 0') || !sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('keydown'")) throw new Error('shared renderer nodes must support keyboard popover controls')
if (!sharedRecipeHierarchyGraphRendererSource.includes('suppressFocusShow')) throw new Error('shared renderer must prevent Escape focus restoration from reopening its popover')
if (!/\bimport\s*\{[^}]*\bbuildCraftingRecipeModel\b[^}]*\}\s*from\s*['"]~\/composables\/useCraftingRecipeModel['"]/.test(articlePageSource)) throw new Error('article recipe tree must reuse the crafting recipe selection model')
if (!articlePageSource.includes('dataset.articleRecipeRole')) throw new Error('article recipe tree must expose local version and recipe selectors for multi-recipe results')
if (extractFunction(articlePageSource, 'recipeTreeRootNodes').includes('slice(0, 1)')) throw new Error('article recipe tree must not truncate multi-recipe roots to the first entry')
// The DOM graph node/popover/interaction implementation now lives in the
// read-only shared renderer; assert on the shared source instead of the page.
if (!sharedRecipeHierarchyGraphRendererSource.includes("copy.className = 'recipe-hierarchy-graph-node-copy'")) throw new Error('shared recipe tree graph nodes must render direct readable labels')
if (!sharedRecipeHierarchyGraphRendererSource.includes('recipe-hierarchy-option-row')) throw new Error('shared recipe tree graph must reuse crafting page compact recipe option rows')
if (!sharedRecipeHierarchyGraphRendererSource.includes('recipe-hierarchy-popover') || !sharedRecipeHierarchyGraphRendererSource.includes('detailRows')) throw new Error('shared recipe tree graph must expose crafting-style hover basic info popovers')
if (!sharedRecipeHierarchyGraphRendererSource.includes('positionPopover')) throw new Error('shared recipe tree graph popovers must use viewport-bounded fixed positioning')
if (!sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('wheel'") || !sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('pointerdown'") || !sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('pointermove'") || !sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('pointerup'")) throw new Error('shared recipe tree graph must expose invisible wheel zoom and drag pan controls')
if (articlePageSource.includes('article-recipe-tree__zoom') || articlePageSource.includes('createArticleRecipeTreeZoomControls')) throw new Error('article recipe tree graph must not render visible zoom controls')
if (sharedRecipeHierarchyGraphRendererSource.includes('filter(child => !sameItem(node, child))')) throw new Error('shared recipe tree graph must not filter away same-item recipe sources before layout normalization')
if (articleStyleSource.includes('.article-recipe-tree__graph-children::before') || articleStyleSource.includes('.article-recipe-tree__graph-branch::before')) throw new Error('article recipe tree graph must not use flow-layout pseudo-element connector lines')
if (!articleStyleSource.includes('background-size: 32px 32px, 32px 32px')) throw new Error('article recipe tree graph must use a visible grid background')
if (articleStyleSource.includes('.article-recipe-tree__relations') || articleStyleSource.includes('.article-recipe-tree__relation-row')) throw new Error('article recipe tree graph must not keep old relation-row styles')
if (!articleStyleSource.includes('--recipe-overview-pan-x') || !articleStyleSource.includes('touch-action: none')) throw new Error('article recipe tree graph must style invisible drag pan interaction')
if (!articleStyleSource.includes('.article-recipe-tree__graph .recipe-hierarchy-graph-node-copy')) throw new Error('article recipe tree graph must style direct node labels within article scope')
if (!articleStyleSource.includes('--article-recipe-tree-node-image-size: 48px') || !articleStyleSource.includes('.article-recipe-tree__graph .recipe-hierarchy-main > .tp-preview-image')) throw new Error('article recipe tree graph must use readable article-scoped item image dimensions')
if (!articleStyleSource.includes('--article-recipe-tree-alternative-image-size: 32px') || !articleStyleSource.includes('.article-recipe-tree__graph .recipe-hierarchy-alt-images')) throw new Error('article recipe tree graph must enlarge alternative-material images within article scope')
if (!articleStyleSource.includes('--article-recipe-tree-station-image-size: 48px') || !articleStyleSource.includes('--article-recipe-tree-station-rail-width: 52px')) throw new Error('article recipe tree graph must reserve a square readable station-preview frame instead of compressing near-square station assets into a short rail')
if (!articleStyleSource.includes('.article-recipe-tree__graph .recipe-hierarchy-station-badge .tp-preview-image')) throw new Error('article recipe tree graph must size station previews within the article scope')
const articleStationPreviewRule = /\.article-recipe-tree__graph\s+\.recipe-hierarchy-station-badge\s+\.tp-preview-image\s+img\s*\)?\s*\{([\s\S]*?)\}/.exec(articleStyleSource)
if (!articleStationPreviewRule || !/\bposition\s*:\s*absolute\b/.test(articleStationPreviewRule[1]) || !/\binset\s*:\s*0\b/.test(articleStationPreviewRule[1]) || !/\bwidth\s*:\s*100%/.test(articleStationPreviewRule[1]) || !/\bheight\s*:\s*100%/.test(articleStationPreviewRule[1]) || !/\baspect-ratio\s*:\s*1\s*\/\s*1\b/.test(articleStationPreviewRule[1]) || !/\bobject-fit\s*:\s*contain\b/.test(articleStationPreviewRule[1])) {
  throw new Error('article recipe hierarchy station previews must keep their complete sprite inside a square readable frame')
}
const craftingHierarchyPreviewRule = /\.recipe-overview-node\s+\.tp-preview-image\s+img\s*\{([\s\S]*?)\}/.exec(craftingStyleSource)
if (!craftingHierarchyPreviewRule || !/\bposition\s*:\s*absolute\b/.test(craftingHierarchyPreviewRule[1]) || !/\binset\s*:\s*0\b/.test(craftingHierarchyPreviewRule[1]) || !/\bwidth\s*:\s*100%/.test(craftingHierarchyPreviewRule[1]) || !/\bheight\s*:\s*100%/.test(craftingHierarchyPreviewRule[1]) || !/\baspect-ratio\s*:\s*1\s*\/\s*1\b/.test(craftingHierarchyPreviewRule[1]) || !/\bobject-fit\s*:\s*contain\b/.test(craftingHierarchyPreviewRule[1])) {
  throw new Error('recipe hierarchy previews must fill their allotted frame with contain fitting instead of rendering at tiny intrinsic dimensions')
}
const articleHierarchyPreviewRule = /\.article-recipe-tree__graph\s+\.recipe-hierarchy-main\s*>\s*\.tp-preview-image\s+img\s*\)?\s*\{([\s\S]*?)\}/.exec(articleStyleSource)
if (!articleHierarchyPreviewRule || !/\bposition\s*:\s*absolute\b/.test(articleHierarchyPreviewRule[1]) || !/\binset\s*:\s*0\b/.test(articleHierarchyPreviewRule[1]) || !/\bwidth\s*:\s*100%/.test(articleHierarchyPreviewRule[1]) || !/\bheight\s*:\s*100%/.test(articleHierarchyPreviewRule[1]) || !/\baspect-ratio\s*:\s*1\s*\/\s*1\b/.test(articleHierarchyPreviewRule[1]) || !/\bobject-fit\s*:\s*contain\b/.test(articleHierarchyPreviewRule[1])) {
  throw new Error('article recipe hierarchy previews must override article-body image sizing and contain their complete sprite')
}
const articleRecipeTreeGraphPreviewImageResetRule = /(?:^|\n)\s*\.article-content-text\s+:deep\s*\(\s*\.article-recipe-tree__graph\s+\.tp-preview-image\s+img\s*\)\s*\{([\s\S]*?)\}/.exec(articleStyleSource)
if (!articleRecipeTreeGraphPreviewImageResetRule || !/\bdisplay\s*:\s*block\b/.test(articleRecipeTreeGraphPreviewImageResetRule[1]) || !/\bmargin\s*:\s*0\s*(?:!\s*important\s*)?(?=\s*(?:;|$))/.test(articleRecipeTreeGraphPreviewImageResetRule[1]) || !/\bborder\s*:\s*0\s*(?:!\s*important\s*)?(?=\s*(?:;|$))/.test(articleRecipeTreeGraphPreviewImageResetRule[1]) || !/\bborder-radius\s*:\s*0\s*(?:!\s*important\s*)?(?=\s*(?:;|$))/.test(articleRecipeTreeGraphPreviewImageResetRule[1])) {
  throw new Error('article recipe tree graph preview images must reset generic article-body image box styling')
}
const articleRecipeTreeCardHeight = Number(sharedRecipeHierarchyGraphRendererSource.match(/const CARD_HEIGHT = (\d+)/)?.[1])
if (!Number.isFinite(articleRecipeTreeCardHeight) || articleRecipeTreeCardHeight < 100) {
  throw new Error('shared recipe tree graph must reserve at least 100px for normal image, quantity, and direct-label content')
}
const sharedRecipeTreeCardHeightSource = extractFunction(sharedRecipeHierarchyGraphRendererSource, 'cardHeight')
for (const marker of [
  'OPTION_ROW_HEIGHT',
  'OPTION_ROW_GAP',
  'OPTION_COPY_ALLOWANCE',
]) {
  if (!sharedRecipeHierarchyGraphRendererSource.includes(`const ${marker} =`) || !sharedRecipeTreeCardHeightSource.includes(marker)) {
    throw new Error(`shared recipe tree option-node layout must calculate height with ${marker}`)
  }
}
if (!sharedRecipeHierarchyGraphRendererSource.includes('options.availableWidth - VIEWPORT_GUTTER')) {
  throw new Error('shared recipe tree must derive its initial scale from the available viewport instead of clipping wide graphs at a fixed minimum scale')
}
if (!articlePageSource.includes('resolveArticleRecipeTreeAvailableWidth')) {
  throw new Error('article recipe tree must exclude its embed padding when calculating the drawable graph width')
}
if (!articlePageSource.includes('resolveArticleRecipeTreeFrameWidth')) {
  throw new Error('article recipe tree must resolve a PC-wide frame from its body panel')
}
if (!articlePageSource.includes("from '~/utils/recipeHierarchyGraphRenderer'") || !articlePageSource.includes('renderRecipeHierarchyGraph')) {
  throw new Error('article recipe tree must import the shared recipe hierarchy graph renderer')
}
if (!articlePageSource.includes('data-article-recipe-tree-wide')) {
  throw new Error('article recipe tree must expose a scoped wide-frame marker')
}
const articleRecipePreviewFactory = extractFunction(sharedRecipeHierarchyGraphRendererSource, 'createPreview')
if (/\bsyncPreviewImageVisibleCenter\s*\(/.test(articleRecipePreviewFactory)) {
  throw new Error('shared recipe tree must not translate contained previews inside the scaled graph canvas')
}
if (!/dataset\.previewVisibleCenter\s*=\s*'contain-only'/.test(articleRecipePreviewFactory) || !/addEventListener\('load',\s*reset\)/.test(articleRecipePreviewFactory)) {
  throw new Error('shared recipe tree previews must reset visible-center translation and retain full contain fitting')
}
if ((craftingHierarchySource.match(/:auto-center-visible="false"/g) || []).length < 5) {
  throw new Error('crafting hierarchy previews must disable alpha translation inside the scaled tree canvas')
}
const articleRecipeTreeGraphNodeImageRule = /\.article-recipe-tree__graph-node\s+img\s*\)?\s*\{([\s\S]*?)\}/.exec(articleStyleSource)
if (articleRecipeTreeGraphNodeImageRule && /\bwidth\s*:\s*38\s*px\b/.test(articleRecipeTreeGraphNodeImageRule[1])) {
  throw new Error('article recipe tree must not override graph preview images with a fixed 38px size')
}
const articleBodyImageRule = /\.article-content-text\s+:deep\s*\(img\)\s*\{([\s\S]*?)\}/.exec(articleStyleSource)
if (!articleBodyImageRule || !/\bwidth\s*:\s*auto\b/.test(articleBodyImageRule[1]) || !/\bmax-width\s*:\s*100%/.test(articleBodyImageRule[1]) || !/\bheight\s*:\s*auto\b/.test(articleBodyImageRule[1])) {
  throw new Error('article body images must preserve their editor/native width while remaining bounded by the content column')
}
if (!composableSource.includes('import { resolvePreviewImageUrl }')) throw new Error('content reference composable must import resolvePreviewImageUrl')
if (!composableSource.includes('detailPath: detailPathFromTypeId(type, id)')) throw new Error('content reference normalizer must derive detail paths from type/id')

const sanitizerHelpers = toBrowserJs([
  extractFunction(articlePageSource, 'escapeArticleHtml'),
  extractFunction(articlePageSource, 'sanitizeArticleUrl'),
  extractFunction(articlePageSource, 'sanitizeArticleStyle'),
  extractFunction(articlePageSource, 'normalizeArticleReferenceType'),
  extractFunction(articlePageSource, 'normalizeRecipeTreeDepth'),
  extractFunction(articlePageSource, 'parseRecipeTreeDepth'),
  extractFunction(articlePageSource, 'sanitizeArticleAttributes'),
  extractFunction(articlePageSource, 'renderInlineArticleText'),
  extractFunction(articlePageSource, 'renderPlainArticleText'),
  extractFunction(articlePageSource, 'sanitizeArticleHtml'),
].join('\n'))
const enhancementHelpers = toBrowserJs([
  extractFunction(articlePageSource, 'articleReferenceDetailPath'),
  extractFunction(articlePageSource, 'formatArticleReferenceTypeLabel'),
  extractFunction(articlePageSource, 'computeArticleReferencePreviewPosition'),
  extractFunction(articlePageSource, 'showArticleReferencePreview'),
  extractFunction(articlePageSource, 'moveArticleReferencePreview'),
  extractFunction(articlePageSource, 'hideArticleReferencePreview'),
  extractFunction(articlePageSource, 'shouldPreviewArticleReferenceOnTap'),
  extractFunction(articlePageSource, 'enhanceArticleReferenceNodes'),
].join('\n'))
const recipeTreeHelpers = toBrowserJs([
  extractFunction(articlePageSource, 'normalizeRecipeTreeText'),
  extractFunction(articlePageSource, 'firstRecipeTreeText'),
  extractFunction(articlePageSource, 'recipeTreeItemName'),
  extractFunction(articlePageSource, 'recipeTreeItemImage'),
  extractFunction(articlePageSource, 'recipeTreeRootNodes'),
  extractFunction(articlePageSource, 'articleRecipeTreeVariantKey'),
  extractFunction(articlePageSource, 'resolveArticleRecipeTreeSelection'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_TREE_WIDE_BREAKPOINT'),
  extractFunction(articlePageSource, 'resolveArticleRecipeTreeAvailableWidth'),
  extractFunction(articlePageSource, 'resolveArticleRecipeTreeFrameWidth'),
  extractFunction(articlePageSource, 'appendArticleRecipeTreeGraph'),
  extractFunction(articlePageSource, 'renderArticleRecipeTreeShell'),
  extractFunction(articlePageSource, 'appendArticleRecipeTreeSelectors'),
  extractFunction(articlePageSource, 'renderArticleRecipeTreeResult'),
  extractFunction(articlePageSource, 'loadArticleRecipeTreeEmbeds'),
].join('\n'))
// The real shared renderer body, transpiled for the no-module fixture. Equivalence
// is asserted against production behavior by executing this exact source below.
const sharedRendererRuntime = toRuntimeJs(sharedRecipeHierarchyGraphRendererSource)

writeFileSync(htmlPath, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Article Reference Check</title>
  </head>
  <body>
    <article id="article"></article>
    <pre id="result">pending</pre>
    <script>
      const resolvePreviewImageUrl = (value) => String(value || '').trim();
      const normalizeText = (value) => String(value ?? '').trim();
      const normalizeType = (value) => {
        const type = normalizeText(value).toLowerCase();
        return type === 'item' || type === 'npc' || type === 'boss' ? type : '';
      };
      const normalizeId = (value) => {
        const id = normalizeText(value);
        return /^\\d{1,12}$/.test(id) ? id : '';
      };
      const ARTICLE_REFERENCE_PREVIEW_ID = 'article-reference-preview';
      const ARTICLE_REFERENCE_PREVIEW_WIDTH = 280;
      const ARTICLE_REFERENCE_PREVIEW_HEIGHT = 148;
      const ARTICLE_REFERENCE_PREVIEW_MARGIN = 12;
      const contentReferenceKey = (type, id) => {
        const normalizedType = normalizeType(type);
        const normalizedId = normalizeId(id);
        return normalizedType && normalizedId ? normalizedType + ':' + normalizedId : '';
      };
      const normalizeContentReference = (raw) => {
        const type = normalizeType(raw.type);
        const id = normalizeId(raw.id);
        if (!type || !id) return null;
        return {
          key: type + ':' + id,
          type,
          id,
          label: normalizeText(raw.label) || type + ' #' + id,
          name: normalizeText(raw.name),
          internalName: normalizeText(raw.internalName),
          imageUrl: resolvePreviewImageUrl(normalizeText(raw.imageUrl ?? raw.image_url)),
          categoryName: normalizeText(raw.categoryName ?? raw.category_name),
          summary: normalizeText(raw.summary),
          detailPath: type === 'item' ? '/items/' + id : type === 'npc' ? '/npcs/' + id : '/bosses/' + id,
          available: raw.available !== false,
        };
      };
      ${sanitizerHelpers}
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      setTimeout(async () => {
      try {
      const sanitize = (html) => sanitizeArticleHtml(html);
      const valid = sanitize('<p>推荐 <span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃" data-tp-ref-image="/preview-assets/terrapedia-images/items/terra-blade.png">泰拉刃</span>。</p>');
      assert(valid.includes('class="tp-content-ref"'), 'valid reference class should be preserved');
      assert(valid.includes('data-tp-ref-type="item"'), 'valid reference type should be preserved');
      assert(valid.includes('data-tp-ref-id="77"'), 'valid reference id should be preserved');
      assert(valid.includes('data-tp-ref-label="泰拉刃"'), 'valid reference label should be preserved');
      assert(valid.includes('data-tp-ref-image="/preview-assets/terrapedia-images/items/terra-blade.png"'), 'valid reference preview image should be preserved');
      assert(valid.includes('data-tp-ref-display="image"'), 'valid reference should default to image display mode');
      assert(valid.includes('<img'), 'valid reference should render a first-paint image');
      assert(valid.includes('src="/preview-assets/terrapedia-images/items/terra-blade.png"'), 'valid reference first-paint image should use saved preview image');
      assert(!valid.includes('>泰拉刃</span>'), 'valid reference should not render its label as article body text');

      const validText = sanitize('<p>推荐 <span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃" data-tp-ref-image="/preview-assets/terrapedia-images/items/terra-blade.png" data-tp-ref-display="text">泰拉刃</span>。</p>');
      assert(validText.includes('data-tp-ref-display="text"'), 'text display mode should be preserved');
      assert(validText.includes('>泰拉刃</span>'), 'text display mode should render label text');
      assert(!validText.includes('<img'), 'text display mode should not render first-paint image');

      const validNpcFallback = sanitize('<p>遇到 <span class="tp-content-ref" data-tp-ref-type="npc" data-tp-ref-id="22" data-tp-ref-label="向导">向导</span>。</p>');
      assert(validNpcFallback.includes('class="tp-content-ref"'), 'valid npc reference class should be preserved');
      assert(validNpcFallback.includes('data-tp-ref-type="npc"'), 'valid npc reference type should be preserved');
      assert(validNpcFallback.includes('>图</span>'), 'valid npc reference without image should render first-paint image placeholder');
      assert(!validNpcFallback.includes('>向导</span>'), 'valid npc reference should not render its label as article body text');

      const validBoss = sanitize('<p>挑战 <span class="tp-content-ref" data-tp-ref-type="boss" data-tp-ref-id="34" data-tp-ref-label="克苏鲁之眼" data-tp-ref-display="text">克苏鲁之眼</span>。</p>');
      assert(validBoss.includes('class="tp-content-ref"'), 'valid boss reference class should be preserved');
      assert(validBoss.includes('data-tp-ref-type="boss"'), 'valid boss reference type should be preserved');
      assert(validBoss.includes('data-tp-ref-id="34"'), 'valid boss reference id should be preserved');
      assert(validBoss.includes('data-tp-ref-label="克苏鲁之眼"'), 'valid boss reference label should be preserved');
      assert(validBoss.includes('>克苏鲁之眼</span>'), 'valid boss text reference should render label text');

      const validRecipeTree = sanitize('<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"><section data-api-payload="bad">payload</section></div>');
      assert(validRecipeTree === '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>', 'valid recipe tree embed should persist only identity/config attrs and no children');
      const malformedRecipeTrees = [
        ['missing type', '<div class="tp-article-embed tp-recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>'],
        ['bad type', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="item-card" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>'],
        ['bad class', '<div class="tp-recipe-tree tp-article-embed extra" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>'],
        ['bad id', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="bad" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>'],
        ['missing depth', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-label="泰拉刃"></div>'],
        ['bad depth', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="9" data-tp-label="泰拉刃"></div>'],
        ['empty label', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label=""></div>'],
        ['onclick', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃" onclick="alert(1)"></div>'],
        ['runtime attr', '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃" data-tp-resolved="ready"></div>'],
      ];
      for (const [name, html] of malformedRecipeTrees) {
        const output = sanitize(html);
        assert(!output.includes('tp-recipe-tree'), name + ' should strip recipe tree embed');
        assert(!output.includes('onclick'), name + ' should strip recipe tree event handlers');
        assert(!output.includes('data-tp-resolved'), name + ' should strip recipe tree runtime attrs');
        assert(!output.includes('style='), name + ' should strip recipe tree style attrs');
      }
      const styledRecipeTree = sanitize('<div class="tp-article-embed tp-recipe-tree" style="width:100%" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>');
      assert(styledRecipeTree === '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="3" data-tp-label="泰拉刃"></div>', 'recipe tree style attr should be stripped while preserving identity/config');

      const malformed = [
        ['missing type', '<span class="tp-content-ref" data-tp-ref-id="77" data-tp-ref-label="泰拉刃">泰拉刃</span>'],
        ['invalid type', '<span class="tp-content-ref" data-tp-ref-type="biome" data-tp-ref-id="77" data-tp-ref-label="坏">坏</span>'],
        ['bad id', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="bad id" data-tp-ref-label="坏">坏</span>'],
        ['empty label', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="">坏</span>'],
        ['overlong label', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="' + 'x'.repeat(81) + '">坏</span>'],
        ['extra classes', '<span class="tp-content-ref extra" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏">坏</span>'],
        ['onclick', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏" onclick="alert(1)">坏</span>'],
        ['style url', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏" style="background:url(javascript:alert(1))">坏</span>'],
        ['bad image url', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏" data-tp-ref-image="javascript:alert(1)">坏</span>'],
        ['bad display mode', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏" data-tp-ref-display="card">坏</span>'],
        ['nested onerror', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏"><img src="/x.png" onerror="alert(1)">坏</span>'],
        ['unexpected data tp', '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="坏" data-tp-owned="1">坏</span>'],
      ];
      for (const [name, html] of malformed) {
        const output = sanitize('<p>' + html + '</p>');
        assert(!output.includes('tp-content-ref'), name + ' should strip reference class');
        assert(!output.includes('data-tp-ref-'), name + ' should strip reference data attrs');
        assert(!output.includes('onclick'), name + ' should strip event handlers');
        assert(!/url\\s*\\(/i.test(output), name + ' should strip style url()');
        assert(!output.includes('onerror'), name + ' should strip nested img onerror');
        assert(!output.includes('data-tp-owned'), name + ' should strip unexpected data-tp-*');
      }
      const runtimePolluted = sanitize('<p><span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃" data-tp-href="/items/77" data-tp-resolved="ready" aria-describedby="article-reference-preview" onmouseenter="alert(1)">泰拉刃</span><span class="article-reference-preview">bad</span></p>');
      assert(!runtimePolluted.includes('data-tp-href'), 'sanitizer must strip runtime href data');
      assert(!runtimePolluted.includes('data-tp-resolved'), 'sanitizer must strip runtime resolved data');
      assert(!runtimePolluted.includes('aria-describedby'), 'sanitizer must strip runtime aria-describedby');
      assert(!runtimePolluted.includes('onmouseenter'), 'sanitizer must strip hover event handlers');
      assert(!runtimePolluted.includes('article-reference-preview'), 'sanitizer must strip runtime preview markup');

      const normalized = normalizeContentReference({
        type: 'item',
        id: '77',
        label: '泰拉刃',
        internalName: 'TerraBlade',
        imageUrl: '/images/item.png',
        detailPath: 'javascript:alert(1)',
        available: true
      });
      const normalizedNpc = normalizeContentReference({
        type: 'npc',
        id: '22',
        label: '向导',
        imageUrl: '',
        available: true
      });
      const normalizedBoss = normalizeContentReference({
        type: 'boss',
        id: '34',
        label: '克苏鲁之眼',
        imageUrl: '/images/boss.png',
        available: true
      });
      assert(normalized.detailPath === '/items/77', 'normalizer must derive item detail path from type/id');
      assert(normalizedNpc.detailPath === '/npcs/22', 'normalizer must derive npc detail path from type/id');
      assert(normalizedBoss.detailPath === '/bosses/34', 'normalizer must derive boss detail path from type/id');
      assert(contentReferenceKey('npc', '1') === 'npc:1', 'content reference key should normalize supported types');
      assert(contentReferenceKey('boss', '34') === 'boss:34', 'content reference key should normalize boss references');

      const articleElement = document.querySelector('#article');
      articleElement.style.margin = '180px 0 0 180px';
      articleElement.innerHTML = valid;
      const articleContentRef = { value: articleElement };
      const article = { value: { id: 1001 } };
      const articleReferences = { value: { 'item:77': normalized } };
      const articleReferenceLabels = { value: { 'item:77': '泰拉刃', 'npc:22': '向导' } };
      const articleReferenceError = { value: '' };
      const articleReferencePreview = { value: null };
      const windowMatchMedia = window.matchMedia;
      window.matchMedia = () => ({ matches: false });
      const navigations = [];
      const navigateTo = (path) => {
        navigations.push(path);
      };
      const collectArticleReferenceInputs = () => {
        const root = articleContentRef.value;
        if (!root) return [];
        return Array.from(root.querySelectorAll('.tp-content-ref'))
          .map(node => ({
            type: node.dataset.tpRefType === 'boss' ? 'boss' : node.dataset.tpRefType === 'npc' ? 'npc' : 'item',
            id: node.dataset.tpRefId || '',
          }))
          .filter(ref => ref.id);
      };
      ${enhancementHelpers}
      assert(collectArticleReferenceInputs()[0].id === '77', 'collector should read sanitized reference inputs');
      enhanceArticleReferenceNodes();
      const ref = articleElement.querySelector('.tp-content-ref');
      assert(ref.getAttribute('role') === 'link', 'enhancement should add link role');
      assert(ref.getAttribute('tabindex') === '0', 'enhancement should add keyboard focus');
      assert(!ref.hasAttribute('title'), 'enhancement should avoid native title when custom preview exists');
      assert(ref.getAttribute('aria-label') === '泰拉刃，打开详情', 'enhancement should expose accessible link label');
      assert(ref.dataset.tpHref === '/items/77', 'enhancement should store derived detail path');
      assert(ref.querySelector('img')?.getAttribute('src') === '/images/item.png', 'enhancement should render resolved reference image inside article body');
      assert(ref.textContent.trim() === '', 'enhancement should not render reference name in article body');
      const beforePreviewNavigationCount = navigations.length;
      ref.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 120, clientY: 80 }));
      assert(navigations.length === beforePreviewNavigationCount, 'hover must not navigate');
      assert(articleReferencePreview.value?.label === '泰拉刃', 'hover preview should include reference label');
      assert(articleReferencePreview.value?.typeLabel === '物品', 'hover preview should include type label');
      assert(articleReferencePreview.value?.internalName === 'TerraBlade', 'hover preview should include resolved internal name');
      assert(articleReferencePreview.value?.id === '77', 'hover preview should include reference id');
      assert(articleReferencePreview.value?.detailPath === '/items/77', 'hover preview should include detail path');
      assert(articleReferencePreview.value?.imageUrl === '/images/item.png', 'hover preview should include resolved image');
      assert(articleReferencePreview.value?.placement === 'right', 'reference preview should prefer the side nearest the chip');
      assert(ref.getAttribute('aria-describedby') === ARTICLE_REFERENCE_PREVIEW_ID, 'hover preview should connect aria-describedby');
      const expectedPreviewWidth = Math.min(ARTICLE_REFERENCE_PREVIEW_WIDTH, window.innerWidth - ARTICLE_REFERENCE_PREVIEW_MARGIN * 2);
      const refRect = ref.getBoundingClientRect();
      assert(articleReferencePreview.value.x >= refRect.right, 'preview should be anchored after the chip when right placement fits');
      assert(Math.abs((articleReferencePreview.value.y + ARTICLE_REFERENCE_PREVIEW_HEIGHT / 2) - (refRect.top + refRect.height / 2)) <= ARTICLE_REFERENCE_PREVIEW_MARGIN + 1, 'preview should stay vertically aligned with the chip');
      ref.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 10 }));
      assert(articleReferencePreview.value.x >= ARTICLE_REFERENCE_PREVIEW_MARGIN, 'preview x should clamp away from the left viewport edge');
      ref.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 9999, clientY: 10 }));
      assert(articleReferencePreview.value.x <= window.innerWidth - ARTICLE_REFERENCE_PREVIEW_MARGIN - expectedPreviewWidth, 'preview x should clamp away from the right viewport edge');
      ref.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      assert(articleReferencePreview.value === null, 'mouseleave should hide hover preview');
      assert(!ref.hasAttribute('aria-describedby'), 'mouseleave should clear aria-describedby');
      ref.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      assert(navigations.length === beforePreviewNavigationCount, 'focus must not navigate');
      assert(articleReferencePreview.value?.label === '泰拉刃', 'focus should show preview');
      ref.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      assert(navigations.length === beforePreviewNavigationCount, 'non-activation key must not navigate');
      ref.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      assert(articleReferencePreview.value === null, 'blur should hide preview');
      ref.click();
      assert(navigations.at(-1) === '/items/77', 'click should navigate to item detail');
      window.matchMedia = (query) => ({ matches: query.includes('hover: none') || query.includes('pointer: coarse') });
      const tapNavigationCount = navigations.length;
      ref.click();
      assert(navigations.length === tapNavigationCount, 'first coarse pointer tap should show preview instead of navigating');
      assert(articleReferencePreview.value?.key === 'item:77', 'first coarse pointer tap should show preview for tapped reference');
      ref.click();
      assert(navigations.length === tapNavigationCount + 1, 'second coarse pointer tap on the same reference should navigate');
      assert(navigations.at(-1) === '/items/77', 'second coarse pointer tap should navigate to item detail');
      window.matchMedia = () => ({ matches: false });
      ref.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      assert(navigations.at(-1) === '/items/77', 'Enter key should navigate to item detail');
      ref.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      assert(navigations.at(-1) === '/items/77', 'Space key should navigate to item detail');
      articleReferences.value = {};
      enhanceArticleReferenceNodes();
      assert(ref.querySelector('img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/terra-blade.png', 'enhancement should render saved reference image before resolve finishes');
      assert(ref.textContent.trim() === '', 'saved reference image should also stay image-only before resolve finishes');

      articleElement.innerHTML = validText;
      articleReferences.value = { 'item:77': normalized };
      enhanceArticleReferenceNodes();
      const textModeRef = articleElement.querySelector('.tp-content-ref');
      assert(textModeRef.dataset.tpHref === '/items/77', 'text-mode reference should still store detail path');
      assert(!textModeRef.querySelector('img'), 'text-mode reference should not render image after enhancement');
      assert(textModeRef.textContent.trim() === '泰拉刃', 'text-mode reference should render label after enhancement');

      articleElement.innerHTML = validNpcFallback;
      articleReferences.value = { 'npc:22': normalizedNpc };
      enhanceArticleReferenceNodes();
      const npcRef = articleElement.querySelector('.tp-content-ref');
      assert(npcRef.dataset.tpHref === '/npcs/22', 'npc enhancement should store derived detail path');
      assert(npcRef.querySelector('.tp-content-ref-fallback')?.textContent === '图', 'npc without image should render image placeholder');
      assert(npcRef.textContent.trim() === '图', 'npc without image should render only image placeholder text');
      npcRef.click();
      assert(navigations.at(-1) === '/npcs/22', 'click should navigate to npc detail');

      articleElement.innerHTML = validBoss;
      articleReferences.value = { 'boss:34': normalizedBoss };
      articleReferenceLabels.value = { 'boss:34': '克苏鲁之眼' };
      enhanceArticleReferenceNodes();
      const bossRef = articleElement.querySelector('.tp-content-ref');
      assert(bossRef.dataset.tpHref === '/bosses/34', 'boss enhancement should store derived detail path');
      bossRef.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      assert(articleReferencePreview.value?.typeLabel === 'Boss', 'boss hover preview should include boss type label');
      bossRef.click();
      assert(navigations.at(-1) === '/bosses/34', 'click should navigate to boss detail');

      const buildCraftingRecipeModel = (tree, selectedVariantKey = '', selectedRecipeKey = '') => {
        const rank = (variant, variantIndex) => {
          const text = [variant.variantKey, variant.variantLabel, variant.versionScope].map(value => String(value || '').toLowerCase()).join(' ');
          if (text.includes('desktop') || text.includes('mobile') || (text.includes('console') && !text.includes('old-gen'))) return variantIndex;
          if (text.includes('base') || text.includes('通用')) return 200 + variantIndex;
          if (text.includes('old-gen') || text.includes('3ds')) return 300 + variantIndex;
          return 100 + variantIndex;
        };
        const variants = (tree?.variants || []).map((variant, variantIndex) => {
          const key = String(variant.variantKey || variant.variantLabel || variantIndex);
          const options = (variant.roots || []).map((root, recipeIndex) => ({
            key: key + ':recipe-' + recipeIndex,
            label: '配方 ' + (recipeIndex + 1),
            summary: String(root.itemNameZh || root.itemName || ''),
            recipeId: String(root.recipeId || ''),
            output: { title: String(root.itemNameZh || root.itemName || '') },
          }));
          return { key, label: String(variant.variantLabel || key), meta: String(variant.recipeCount || options.length) + ' 条配方 · ' + String(variant.versionScope || ''), options, rank: rank(variant, variantIndex) };
        }).sort((left, right) => left.rank - right.rank).map(({ rank: ignoredRank, ...variant }) => variant);
        const activeVariant = variants.find(variant => variant.key === selectedVariantKey) || variants[0] || null;
        const activeRecipe = activeVariant?.options.find(option => option.key === selectedRecipeKey) || activeVariant?.options[0] || null;
        return { variants, activeVariant, activeRecipe };
      };
      ${recipeTreeHelpers}
      // Real shared renderer source (transpiled from shared/article-runtime),
      // executed as-is so the fixture asserts production graph behavior instead
      // of an in-memory reconstruction.
      ${sharedRendererRuntime}
      const recipeFetchCalls = [];
      const nextTick = () => Promise.resolve();
      const fetchPublicRecipeTree = async (itemId, maxDepth) => {
        recipeFetchCalls.push([itemId, maxDepth]);
        return {
          itemId,
          source: 'api',
          tree: {
            item: {
              displayName: '泰拉刃',
              previewImage: '/preview-assets/terrapedia-images/items/terra-blade.png'
            },
            variants: [
              {
                variantKey: 'base',
                variantLabel: '通用版',
                versionScope: 'base',
                roots: [{ recipeId: 700, itemId: 77, itemNameZh: '通用版泰拉刃', itemImage: '/preview-assets/terrapedia-images/items/terra-blade.png', children: [{ itemId: 24, itemNameZh: '通用版材料', itemImage: '/preview-assets/terrapedia-images/items/lead-bar.png' }] }]
              },
              {
                variantKey: 'desktop',
                variantLabel: '电脑版',
                versionScope: 'Desktop version',
                recipeCount: 3,
                roots: [{
                  recipeId: 901,
                  itemId: 77,
                  itemNameZh: '泰拉刃',
                  itemImage: '/preview-assets/terrapedia-images/items/terra-blade.png',
                  stations: [{ stationItemId: 16, stationNameZh: '秘银砧', stationImage: '/preview-assets/terrapedia-images/items/mythril-anvil.png' }],
                  children: [{
                    itemId: 1,
                    itemNameZh: '真永夜刃',
                    itemImage: '/preview-assets/terrapedia-images/items/true-nights-edge.png',
                    children: [
                      {
                        itemId: 1,
                        itemNameZh: '真永夜刃',
                        itemImage: '/preview-assets/terrapedia-images/items/true-nights-edge.png',
                        children: [
                          { itemId: 10, itemNameZh: '永夜刃', itemImage: '/preview-assets/terrapedia-images/items/nights-edge.png' },
                          { itemId: 11, itemNameZh: '断钢剑', itemImage: '/preview-assets/terrapedia-images/items/excalibur.png' }
                        ]
                      },
                      {
                        itemId: 1,
                        itemNameZh: '真永夜刃',
                        itemImage: '/preview-assets/terrapedia-images/items/true-nights-edge.png',
                        children: [
                          { itemId: 12, itemNameZh: '永夜刃', itemImage: '/preview-assets/terrapedia-images/items/nights-edge.png' },
                          { itemId: 13, itemNameZh: '叶绿锭', itemImage: '/preview-assets/terrapedia-images/items/chlorophyte-bar.png', quantityText: '24' }
                        ]
                      },
                      {
                        itemId: 14,
                        itemNameZh: '任意铁锭',
                        quantityText: '3',
                        groupMembers: [
                          { nameZh: '铁锭', image: '/preview-assets/terrapedia-images/items/iron-bar.png' },
                          { nameZh: '铅锭', image: '/preview-assets/terrapedia-images/items/lead-bar.png' }
                        ]
                      }
                    ]
                  }]
                }, {
                  recipeId: 902,
                  itemId: 77,
                  itemNameZh: '泰拉刃',
                  itemImage: '/preview-assets/terrapedia-images/items/terra-blade.png',
                  children: [{ itemId: 21, itemNameZh: '配方二材料', itemImage: '/preview-assets/terrapedia-images/items/excalibur.png', quantityText: '2' }]
                }, {
                  recipeId: 903,
                  itemId: 77,
                  itemNameZh: '泰拉刃',
                  itemImage: '/preview-assets/terrapedia-images/items/terra-blade.png',
                  children: [{ itemId: 22, itemNameZh: '配方三材料', itemImage: '/preview-assets/terrapedia-images/items/chlorophyte-bar.png', quantityText: '3' }]
                }]
              },
              {
                variantKey: 'console',
                variantLabel: '主机版',
                versionScope: 'console',
                roots: [{ recipeId: 990, itemId: 2, itemNameZh: '主机版泰拉刃', itemImage: '/preview-assets/terrapedia-images/items/console-terra-blade.png', resultQuantity: 5, children: [{ itemId: 23, itemNameZh: '主机版材料', itemImage: '/preview-assets/terrapedia-images/items/iron-bar.png' }] }]
              },
              {
                variantKey: 'empty',
                variantLabel: '空版本',
                versionScope: 'legacy',
                recipeCount: 0,
                roots: []
              }
            ]
          }
        };
      };
      articleElement.innerHTML = validRecipeTree;
      let articleRecipeTreeLoadSequence = 0;
      await loadArticleRecipeTreeEmbeds();
      const recipeEmbed = articleContentRef.value.querySelector('.tp-recipe-tree');
      assert(recipeFetchCalls.length === 1, 'recipe tree hydration should fetch once');
      assert(recipeFetchCalls[0][0] === '77', 'recipe tree hydration should fetch saved item id');
      assert(recipeFetchCalls[0][1] === 3, 'recipe tree hydration should fetch saved max depth');
      assert(recipeEmbed.dataset.tpResolved === 'ready', 'recipe tree hydration should mark ready state');
      assert(recipeEmbed.querySelector('.article-recipe-tree__thumb img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/terra-blade.png', 'recipe tree hydration should render item image');
      assert(recipeEmbed.textContent.includes('泰拉刃'), 'recipe tree hydration should render item label');
      const recipeGraph = recipeEmbed.querySelector('.article-recipe-tree__graph');
      assert(recipeGraph, 'recipe tree hydration should render a hierarchy graph');
      const recipeOptionButtons = recipeEmbed.querySelectorAll('[data-article-recipe-role="recipe-option-selector"] button');
      assert(recipeOptionButtons.length === 3, 'article recipe tree must expose every root recipe in the selected version');
      assert(recipeGraph.textContent.includes('真永夜刃'), 'article recipe tree should initially render the first selected recipe root');
      const normalLabeledNodeLayout = layoutForest([{ itemId: 999, itemNameZh: '普通标签节点' }], 0);
      assert(normalLabeledNodeLayout.nodes[0]?.height >= 100, 'article recipe tree layout must reserve at least 100px for a normal labeled node');
      const twoStationLayout = layoutForest([{ itemId: 998, itemNameZh: '双制作站节点', stations: [{ stationNameZh: '工匠作坊' }, { stationNameZh: '熔炉' }] }], 0);
      assert(twoStationLayout.nodes[0]?.height >= 108, 'article recipe tree layout must reserve two full station-preview frames without squeezing them into the normal card height');
      const threeOptionRowsFixture = {
        itemId: 1000,
        itemNameZh: '三行配方来源',
        nodeType: 'recipe_options',
        recipeOptions: [
          [{ itemId: 1001, itemNameZh: '材料一' }],
          [{ itemId: 1002, itemNameZh: '材料二' }],
          [{ itemId: 1003, itemNameZh: '材料三' }],
        ],
      };
      const threeOptionRowsLayout = layoutForest([threeOptionRowsFixture], 0);
      assert(threeOptionRowsLayout.nodes[0]?.height >= 139, 'article recipe tree layout must reserve at least 139px for three recipe-option rows and direct label content');
      assert(Math.min(1, (690 - VIEWPORT_GUTTER) / 1706, 520 / 684) <= (690 - 4) / 1706, 'article recipe tree must fit a wide graph into its visible frame after station previews reserve a readable square size');
      assert(resolveArticleRecipeTreeAvailableWidth(691, 14, 14) === 663, 'article recipe tree initial scale must use the padded embed content width instead of its larger border box');
      assert(resolveArticleRecipeTreeFrameWidth(663, 937, 1440) === 937, 'PC article tree must use its article-body content width instead of the narrower prose measure');
      assert(resolveArticleRecipeTreeFrameWidth(663, 937, 768) === 663, 'mobile article tree must retain the prose-width frame');
      const graphPreview = recipeGraph.querySelector('.recipe-overview-node .tp-preview-image');
      assert(graphPreview?.getAttribute('data-source-image'), 'article recipe tree previews should expose the shared preview source marker');
      assert(graphPreview?.querySelector('img')?.getAttribute('data-preview-visible-center') === 'contain-only', 'article recipe tree previews should preserve their complete contain frame inside the scaled graph');
      const graphPreviewImage = graphPreview?.querySelector('img');
      assert(graphPreviewImage, 'article recipe tree graph should render a preview image');
      graphPreviewImage.style.translate = '3px 4px';
      graphPreviewImage.style.transform = 'translate(3px, 4px)';
      graphPreviewImage.dispatchEvent(new Event('load'));
      assert(['0 0', '0px 0px', '0px'].includes(graphPreviewImage.style.translate) && graphPreviewImage.style.transform === 'none', 'article recipe tree preview load should reset any shared visible-content translation inside the scaled graph');
      assert(!recipeEmbed.querySelector('.article-recipe-tree__zoom'), 'recipe tree hydration should not render visible zoom controls');
      const initialScale = recipeGraph.style.getPropertyValue('--recipe-overview-scale');
      const initialMinHeight = recipeGraph.style.minHeight;
      recipeGraph.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      assert(recipeGraph.style.getPropertyValue('--recipe-overview-scale') !== initialScale, 'recipe tree graph should support invisible wheel zoom');
      assert(recipeGraph.style.minHeight === initialMinHeight, 'recipe tree graph wheel zoom should not resize surrounding article blocks');
      recipeGraph.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 10, clientY: 12, bubbles: true }));
      recipeGraph.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 34, clientY: 28, bubbles: true }));
      recipeGraph.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 34, clientY: 28, bubbles: true }));
      assert(recipeGraph.style.getPropertyValue('--recipe-overview-pan-x') === '24px', 'recipe tree graph should support invisible drag pan on x axis');
      assert(recipeGraph.style.getPropertyValue('--recipe-overview-pan-y') === '16px', 'recipe tree graph should support invisible drag pan on y axis');
      assert(recipeGraph.classList.contains('recipe-overview-tree'), 'recipe tree graph should reuse the crafting overview tree wrapper');
      assert(recipeGraph.querySelector('.recipe-overview-lines path.recipe-overview-edge'), 'recipe tree graph should render SVG connector lines');
      assert(recipeGraph.querySelector('.recipe-overview-node.is-root .recipe-hierarchy-card img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/terra-blade.png', 'recipe tree graph should render output node image');
      assert(recipeGraph.querySelector('.recipe-overview-node:not(.is-root) .recipe-hierarchy-card img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/true-nights-edge.png', 'recipe tree graph should render material node images below output');
      assert(recipeGraph.querySelector('.recipe-overview-node.has-recipe-options .recipe-hierarchy-card.has-recipe-options'), 'recipe tree graph should preserve same-item recipe source nodes as a multi-recipe relationship');
      assert(recipeGraph.querySelectorAll('.recipe-overview-node.has-recipe-options .recipe-hierarchy-option-row').length === 2, 'recipe tree graph should render both same-item recipe source options instead of filtering the relationship away');
      assert(recipeGraph.querySelector('.recipe-overview-node.has-recipe-options img[src="/preview-assets/terrapedia-images/items/nights-edge.png"]'), 'recipe tree graph should keep original Night Edge materials inside the recipe source options');
      assert(recipeGraph.querySelector('.recipe-overview-node.has-recipe-options img[src="/preview-assets/terrapedia-images/items/chlorophyte-bar.png"]'), 'recipe tree graph should keep alternate recipe materials inside the recipe source options');
      assert(recipeGraph.querySelector('.recipe-hierarchy-station-badge img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/mythril-anvil.png', 'recipe tree graph should render station images inside graph nodes');
      assert(recipeGraph.querySelector('.recipe-overview-node:not(.is-root) .recipe-hierarchy-card')?.getAttribute('title') === '真永夜刃 x1', 'recipe tree graph material node should keep the material label in a title');
      assert(recipeGraph.querySelector('.recipe-hierarchy-popover dl dt')?.textContent === '类型', 'recipe tree graph should render crafting-style hover basic info labels');
      assert(recipeGraph.querySelector('.recipe-hierarchy-popover')?.textContent.includes('真永夜刃'), 'recipe tree graph hover info should include node names outside graph cards');
      const visibleCardsText = Array.from(recipeGraph.querySelectorAll('.recipe-hierarchy-card')).map(card => card.textContent.trim()).join(' ');
      assert(visibleCardsText.includes('真永夜刃'), 'recipe tree graph cards should render material names as visible text');
      assert(recipeGraph.querySelectorAll('.recipe-hierarchy-graph-node-copy').length > 0, 'recipe tree graph should render direct readable node labels');
      const alternativeMaterialCard = Array.from(recipeGraph.querySelectorAll('.recipe-hierarchy-card')).find(card => card.textContent.includes('任意铁锭'));
      assert(alternativeMaterialCard?.textContent.includes('x3'), 'recipe tree graph alternative-material cards should retain their quantity');
      assert(!visibleCardsText.includes('秘银砧'), 'recipe tree graph cards should not render station names as visible text');
      assert(recipeEmbed.textContent.includes('4 个版本'), 'recipe tree hydration should render variant count');
      const callsBeforeRecipeSelection = recipeFetchCalls.length;
      recipeOptionButtons[1].click();
      const secondRecipeGraph = recipeEmbed.querySelector('.article-recipe-tree__graph');
      assert(secondRecipeGraph?.textContent.includes('配方二材料'), 'selecting the second recipe must redraw its complete root tree');
      assert(!secondRecipeGraph?.textContent.includes('真永夜刃'), 'selected recipe graph must not merge the first root into its relations');
      assert(recipeFetchCalls.length === callsBeforeRecipeSelection, 'selecting an article recipe option must not refetch its tree');
      const thirdRecipeButton = recipeEmbed.querySelectorAll('[data-article-recipe-role="recipe-option-selector"] button')[2];
      thirdRecipeButton?.click();
      const thirdRecipeGraph = recipeEmbed.querySelector('.article-recipe-tree__graph');
      assert(thirdRecipeGraph?.textContent.includes('配方三材料'), 'third root recipe must remain independently selectable');
      assert(recipeEmbed.querySelector('[data-article-recipe-option-key="desktop:recipe-2"]')?.getAttribute('aria-pressed') === 'true', 'selected third recipe must expose its active state');
      const variantButtons = recipeEmbed.querySelectorAll('[data-article-recipe-role="variant-selector"] button');
      assert(variantButtons.length === 4, 'article recipe tree must expose every available version');
      const consoleButton = Array.from(variantButtons).find(button => button.getAttribute('data-article-recipe-variant-key') === 'console');
      consoleButton?.click();
      const consoleRecipeGraph = recipeEmbed.querySelector('.article-recipe-tree__graph');
      assert(consoleRecipeGraph?.textContent.includes('主机版材料'), 'selecting another version must redraw its selected recipe root');
      assert(consoleRecipeGraph?.textContent.includes('x5'), 'selected version must preserve its root output quantity');
      const baseButton = Array.from(recipeEmbed.querySelectorAll('[data-article-recipe-role="variant-selector"] button')).find(button => button.getAttribute('data-article-recipe-variant-key') === 'base');
      baseButton?.click();
      assert(recipeEmbed.querySelector('.article-recipe-tree__graph')?.textContent.includes('通用版材料'), 'raw roots must map by crafting-model variant key after model sorting');
      const emptyButton = Array.from(recipeEmbed.querySelectorAll('[data-article-recipe-role="variant-selector"] button')).find(button => button.getAttribute('data-article-recipe-variant-key') === 'empty');
      emptyButton?.click();
      assert(!recipeEmbed.querySelector('.article-recipe-tree__graph'), 'an empty selected version must not fall back to another version root');
      const duplicateEmbed = document.createElement('div');
      duplicateEmbed.className = 'tp-article-embed tp-recipe-tree';
      articleContentRef.value.append(duplicateEmbed);
      const duplicateTree = (await fetchPublicRecipeTree('77', 3)).tree;
      renderArticleRecipeTreeResult(duplicateEmbed, duplicateTree, '77', 3, '泰拉刃');
      const primaryDesktopButton = Array.from(recipeEmbed.querySelectorAll('[data-article-recipe-role="variant-selector"] button')).find(button => button.getAttribute('data-article-recipe-variant-key') === 'desktop');
      primaryDesktopButton?.click();
      const primaryTextBeforeDuplicateSelection = recipeEmbed.querySelector('.article-recipe-tree__graph')?.textContent;
      const duplicateThirdRecipeButton = duplicateEmbed.querySelectorAll('[data-article-recipe-role="recipe-option-selector"] button')[2];
      const callsBeforeDuplicateSelection = recipeFetchCalls.length;
      duplicateThirdRecipeButton?.click();
      assert(recipeEmbed.querySelector('.article-recipe-tree__graph')?.textContent === primaryTextBeforeDuplicateSelection, 'selecting one article embed must not change another embed');
      assert(recipeFetchCalls.length === callsBeforeDuplicateSelection, 'selecting a duplicate embed option must not refetch either tree');
      assert(recipeEmbed.querySelector('.article-recipe-tree__link')?.getAttribute('href') === '/crafting?itemId=77&maxDepth=3', 'recipe tree hydration should link to crafting page');
      window.matchMedia = windowMatchMedia;
      document.querySelector('#result').textContent = 'PASS';
      } catch (error) {
        document.querySelector('#result').textContent = 'FAIL: ' + (error && error.message ? error.message : error);
      }
      }, 0);
    </script>
  </body>
</html>`, 'utf8')

let keepTempDir = false
try {
  const output = execFileSync(chromium, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--virtual-time-budget=5000',
    '--dump-dom',
    pathToFileURL(htmlPath).href,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 20000,
  })
  if (!output.includes('<pre id="result">PASS</pre>')) {
    writeFileSync(join(tempDir, 'dump.html'), output, 'utf8')
    keepTempDir = true
    throw new Error(`Article content reference check failed. Dump: ${join(tempDir, 'dump.html')}`)
  }
  console.log('article content reference checks passed')
} finally {
  if (!keepTempDir) rmSync(tempDir, { recursive: true, force: true })
}
