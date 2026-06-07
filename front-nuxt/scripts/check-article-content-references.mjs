import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
if (!articlePageSource.includes("document.createElementNS('http://www.w3.org/2000/svg', 'svg')")) throw new Error('article recipe tree graph must use an SVG line canvas like the crafting page')
if (!articlePageSource.includes('recipe-overview-tree') || !articlePageSource.includes('recipe-hierarchy-card')) throw new Error('article recipe tree graph must reuse the crafting overview tree DOM classes')
if (!articlePageSource.includes('recipe-hierarchy-option-row')) throw new Error('article recipe tree graph must reuse crafting page compact recipe option rows')
if (!articlePageSource.includes('recipe-hierarchy-popover') || !articlePageSource.includes('articleRecipeTreeNodeDetailRows')) throw new Error('article recipe tree graph must expose crafting-style hover basic info popovers')
if (!articlePageSource.includes('positionArticleRecipeTreePopover') || !articlePageSource.includes('showArticleRecipeTreePopover') || !articlePageSource.includes('hideArticleRecipeTreePopover')) throw new Error('article recipe tree graph popovers must use viewport-bounded fixed positioning')
if (!articlePageSource.includes('changeArticleRecipeTreeZoomFromWheel') || !articlePageSource.includes('startArticleRecipeTreePan') || !articlePageSource.includes('moveArticleRecipeTreePan') || !articlePageSource.includes('endArticleRecipeTreePan')) throw new Error('article recipe tree graph must expose invisible wheel zoom and drag pan controls')
if (articlePageSource.includes('article-recipe-tree__zoom') || articlePageSource.includes('createArticleRecipeTreeZoomControls')) throw new Error('article recipe tree graph must not render visible zoom controls')
if (articlePageSource.includes('filter(child => !isSameRecipeTreeItem(node, child))')) throw new Error('article recipe tree graph must not filter away same-item recipe sources before layout normalization')
if (articleStyleSource.includes('.article-recipe-tree__graph-children::before') || articleStyleSource.includes('.article-recipe-tree__graph-branch::before')) throw new Error('article recipe tree graph must not use flow-layout pseudo-element connector lines')
if (!articleStyleSource.includes('background-size: 32px 32px, 32px 32px')) throw new Error('article recipe tree graph must use a visible grid background')
if (articleStyleSource.includes('.article-recipe-tree__relations') || articleStyleSource.includes('.article-recipe-tree__relation-row')) throw new Error('article recipe tree graph must not keep old relation-row styles')
if (!articleStyleSource.includes('--recipe-overview-pan-x') || !articleStyleSource.includes('touch-action: none')) throw new Error('article recipe tree graph must style invisible drag pan interaction')
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
  extractFunction(articlePageSource, 'isDefaultRecipeTreeVariant'),
  extractFunction(articlePageSource, 'recipeTreeRootNodes'),
  extractFunction(articlePageSource, 'recipeTreeStationCount'),
  extractFunction(articlePageSource, 'recipeTreeNodeName'),
  extractFunction(articlePageSource, 'recipeTreeNodeQuantity'),
  extractFunction(articlePageSource, 'recipeTreeNodeImage'),
  extractFunction(articlePageSource, 'recipeTreeStationName'),
  extractFunction(articlePageSource, 'recipeTreeStationImage'),
  extractFunction(articlePageSource, 'recipeTreeNodeChildren'),
  extractFunction(articlePageSource, 'recipeTreeNodeKey'),
  extractFunction(articlePageSource, 'recipeTreeGroupMemberName'),
  extractFunction(articlePageSource, 'recipeTreeGroupMemberImage'),
  extractFunction(articlePageSource, 'recipeTreeNodeGroupMember'),
  extractFunction(articlePageSource, 'mergeArticleRecipeTreeAlternativeChildren'),
  extractFunction(articlePageSource, 'mergeArticleRecipeTreeSameItemSiblings'),
  extractFunction(articlePageSource, 'recipeTreeNodeStations'),
  extractFunction(articlePageSource, 'isSameRecipeTreeItem'),
  extractFunction(articlePageSource, 'recipeTreeGraphChildren'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_CARD_WIDTH'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_OPTION_SOURCE_WIDTH'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_CARD_HEIGHT'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_X_GAP'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_Y_GAP'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_PADDING'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_MIN_SCALE'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_MAX_SCALE'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_MIN_MANUAL_SCALE'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_MAX_MANUAL_SCALE'),
  extractFunction(articlePageSource, 'ARTICLE_RECIPE_GRAPH_MANUAL_SCALE_STEP'),
  extractFunction(articlePageSource, 'buildArticleRecipeTreeGraphLayout'),
  extractFunction(articlePageSource, 'measureArticleRecipeTreeGraphLayout'),
  extractFunction(articlePageSource, 'placeArticleRecipeTreeGraphLayout'),
  extractFunction(articlePageSource, 'layoutArticleRecipeTreeGraphForest'),
  extractFunction(articlePageSource, 'articleRecipeTreeGroupMembers'),
  extractFunction(articlePageSource, 'articleRecipeTreeOptionGroups'),
  extractFunction(articlePageSource, 'recipeTreeNodeCardWidth'),
  extractFunction(articlePageSource, 'recipeTreeNodeCardHeight'),
  extractFunction(articlePageSource, 'articleRecipeTreeRelationLabel'),
  extractFunction(articlePageSource, 'articleRecipeTreeStationSummary'),
  extractFunction(articlePageSource, 'articleRecipeTreeChildNameSummary'),
  extractFunction(articlePageSource, 'articleRecipeTreeNodeDetailRows'),
  extractFunction(articlePageSource, 'articleRecipeTreeFirstGlyph'),
  extractFunction(articlePageSource, 'createArticleRecipeTreePreviewImage'),
  extractFunction(articlePageSource, 'createArticleRecipeTreeGraphLineCanvas'),
  extractFunction(articlePageSource, 'positionArticleRecipeTreePopover'),
  extractFunction(articlePageSource, 'showArticleRecipeTreePopover'),
  extractFunction(articlePageSource, 'hideArticleRecipeTreePopover'),
  extractFunction(articlePageSource, 'createArticleRecipeTreeGraphPositionedNode'),
  extractFunction(articlePageSource, 'updateArticleRecipeTreeZoom'),
  extractFunction(articlePageSource, 'changeArticleRecipeTreeZoomFromWheel'),
  extractFunction(articlePageSource, 'startArticleRecipeTreePan'),
  extractFunction(articlePageSource, 'moveArticleRecipeTreePan'),
  extractFunction(articlePageSource, 'endArticleRecipeTreePan'),
  extractFunction(articlePageSource, 'enableArticleRecipeTreeInteractions'),
  extractFunction(articlePageSource, 'appendArticleRecipeTreeGraph'),
  extractFunction(articlePageSource, 'renderArticleRecipeTreeShell'),
  extractFunction(articlePageSource, 'renderArticleRecipeTreeResult'),
  extractFunction(articlePageSource, 'loadArticleRecipeTreeEmbeds'),
].join('\n'))

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

      ${recipeTreeHelpers}
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
                variantKey: 'default',
                variantLabel: '电脑版',
                versionScope: 'pc',
                roots: [{
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
                      }
                    ]
                  }]
                }]
              },
              {
                variantKey: 'console',
                variantLabel: '主机版',
                versionScope: 'console',
                roots: [{ itemId: 2, itemNameZh: '主机版泰拉刃', itemImage: '/preview-assets/terrapedia-images/items/console-terra-blade.png', resultQuantity: 100 }]
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
      assert(!recipeGraph.querySelector('img[src="/preview-assets/terrapedia-images/items/console-terra-blade.png"]'), 'recipe tree graph should not render console or non-default variant roots by default');
      assert(!recipeGraph.textContent.includes('x100'), 'recipe tree graph should not render quantities from console or non-default variant roots by default');
      assert(recipeGraph.querySelector('.recipe-hierarchy-station-badge img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/mythril-anvil.png', 'recipe tree graph should render station images inside graph nodes');
      assert(recipeGraph.querySelector('.recipe-overview-node:not(.is-root) .recipe-hierarchy-card')?.getAttribute('title') === '真永夜刃 x1', 'recipe tree graph material node should keep the material label in a title');
      assert(recipeGraph.querySelector('.recipe-hierarchy-popover dl dt')?.textContent === '类型', 'recipe tree graph should render crafting-style hover basic info labels');
      assert(recipeGraph.querySelector('.recipe-hierarchy-popover')?.textContent.includes('真永夜刃'), 'recipe tree graph hover info should include node names outside graph cards');
      const visibleCardsText = Array.from(recipeGraph.querySelectorAll('.recipe-hierarchy-card')).map(card => card.textContent.trim()).join(' ');
      assert(!visibleCardsText.includes('真永夜刃'), 'recipe tree graph cards should not render material names as visible text');
      assert(!visibleCardsText.includes('秘银砧'), 'recipe tree graph cards should not render station names as visible text');
      assert(recipeEmbed.textContent.includes('2 个版本'), 'recipe tree hydration should render variant count');
      assert(recipeEmbed.textContent.includes('默认路线'), 'recipe tree hydration should show that the article embed renders only the default route');
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
