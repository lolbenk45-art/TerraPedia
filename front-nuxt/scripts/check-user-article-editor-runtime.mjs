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
  throw new Error('Chromium is required for user article editor runtime checks.')
}

const tempRoot = join(root, 'tmp')
mkdirSync(tempRoot, { recursive: true })
const tempDir = mkdtempSync(join(tempRoot, 'user-editor-'))
const htmlPath = join(tempDir, 'editor-runtime.html')
const editorDomSource = readFileSync(join(root, 'lib/userArticleEditorDom.mjs'), 'utf8')
  .replace(/\bexport\s+/g, '')
const editorComponentSource = readFileSync(join(root, 'components/user/UserArticleRichEditor.vue'), 'utf8')
const recipeHierarchyGraphRendererSource = readFileSync(join(root, 'utils/recipeHierarchyGraphRenderer.ts'), 'utf8')
const sharedRecipeHierarchyGraphRendererPath = join(root, '..', 'shared/article-runtime/recipeHierarchyGraphRenderer.ts')
if (!existsSync(sharedRecipeHierarchyGraphRendererPath)) throw new Error('recipe graph renderer must move to the root shared article runtime')
const sharedRecipeHierarchyGraphRendererSource = readFileSync(sharedRecipeHierarchyGraphRendererPath, 'utf8')
const nuxtConfigSource = readFileSync(join(root, 'nuxt.config.ts'), 'utf8')
const editorStyleSource = editorComponentSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''
const extractCssBlocks = (source, selector) => {
  const blocks = []
  let searchIndex = 0
  while (searchIndex < source.length) {
    const selectorIndex = source.indexOf(selector, searchIndex)
    if (selectorIndex === -1) break
    const openIndex = source.indexOf('{', selectorIndex)
    if (openIndex === -1) break
    let depth = 0
    for (let index = openIndex; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      if (source[index] === '}') depth -= 1
      if (depth === 0) {
        blocks.push(source.slice(openIndex + 1, index))
        searchIndex = index + 1
        break
      }
    }
  }
  return blocks
}

if (!editorComponentSource.includes('draggedReferenceElement')) throw new Error('editor must track dragged content references')
if (!editorComponentSource.includes('application/x-terrapedia-reference')) throw new Error('editor must use a reference-specific drag payload')
if (!editorComponentSource.includes('@dragstart="handleEditorDragStart"')) throw new Error('editor surface must handle reference dragstart')
if (!editorComponentSource.includes('@dragend="handleEditorDragEnd"')) throw new Error('editor surface must handle reference dragend')
if (!editorComponentSource.includes('handleReferenceDrop')) throw new Error('editor drop path must move reference atoms before file drops')
if (!editorComponentSource.includes('collectSelectedReferences')) throw new Error('editor inline styling must include selected content references')
if (!editorComponentSource.includes('applyInlineStyleToReference')) throw new Error('editor inline styling must apply font size and color to content references')
if (!editorComponentSource.includes('applyUserArticleInlineStyleToSelectedRange')) throw new Error('editor must use selection-aware inline styling for selected content')
if (!editorComponentSource.includes('width: 1.875em')) throw new Error('editor reference image size must scale with font size')
if (!editorComponentSource.includes('user-rich-editor__stage')) throw new Error('editor must wrap the editable surface in a non-contenteditable overlay stage')
if (!editorComponentSource.includes('referencePanelTarget')) throw new Error('editor must accept an external reference panel target')
if (!editorComponentSource.includes("referencePanelOpen: []")) throw new Error('editor must emit when the reference panel opens so the page can enter writing mode')
if (!editorComponentSource.includes('user-rich-editor__reference-fab')) throw new Error('reference picker must use a prominent trigger button')
if (!editorComponentSource.includes('user-rich-editor__reference-fab-label')) throw new Error('reference picker trigger must include a visible text label')
if (!editorComponentSource.includes('IRON_PICKAXE_REFERENCE_IMAGE')) throw new Error('reference picker trigger must use a verified iron pickaxe image source')
if (!/const IRON_PICKAXE_REFERENCE_IMAGE = '\/terrapedia-images\/[^']*iron-pickaxe[^']*\.png'/.test(editorComponentSource)) throw new Error('reference picker trigger must use the proxied iron pickaxe image')
if (!nuxtConfigSource.includes("'/terrapedia-images'") || !nuxtConfigSource.includes('target: `${terrapediaImageOrigin}/terrapedia-images`')) throw new Error('front app must proxy terrapedia image assets for the reference floating button')
if (!editorComponentSource.includes('@mousedown.prevent="saveSelection"')) throw new Error('reference picker trigger must preserve the editor selection before opening')
if (editorComponentSource.includes('user-rich-editor__insert-bar')) throw new Error('reference picker must not render inside the editor insert bar anymore')
if (!/<Teleport\s+v-if="referencePanelTarget"[\s\S]*:to="referencePanelTarget"[\s\S]*class="user-rich-editor__reference-menu"/.test(editorComponentSource)) throw new Error('reference picker panel must teleport to the external page target')
if (/<div class="user-rich-editor__reference-menu">[\s\S]*<div class="user-rich-editor__stage">[\s\S]*ref="editorRef"[\s\S]*class="user-rich-editor__surface"/.test(editorComponentSource)) throw new Error('reference picker must not sit inside or above the contenteditable editor stage')
for (const block of extractCssBlocks(editorStyleSource, '.user-rich-editor__reference-menu')) {
  if (/position:\s*absolute;/.test(block) && /bottom:/.test(block)) throw new Error('reference picker must not be positioned as a bottom overlay on the editor surface')
}
for (const block of extractCssBlocks(editorStyleSource, '.user-rich-editor__reference-popover')) {
  if (/position:\s*absolute;/.test(block)) throw new Error('reference picker panel must be inline, not an overlay over the editor surface')
}
if (!/const openReferenceMenu = \(\) => \{[\s\S]*referenceMenuOpen\.value = true[\s\S]*emit\('referencePanelOpen'\)[\s\S]*void runReferenceSearch\(\)/.test(editorComponentSource)) throw new Error('reference picker must enter page writing mode and load default references when opened')
if (/const insertContentReference = \(reference: NormalizedContentReference\) => \{[\s\S]*closeReferenceMenu\(\)[\s\S]*\n\}/.test(editorComponentSource)) throw new Error('reference picker must stay open after inserting a reference')
if (/if \(!q\) \{[\s\S]*referenceSearchResults\.value = \[\]/.test(editorComponentSource)) throw new Error('reference search must not clear results for blank queries because blank queries load defaults')
if (!editorComponentSource.includes('class="user-rich-editor__reference-copy"')) throw new Error('reference picker result text must use a dedicated copy column')
if (!/\.user-rich-editor__reference-result \{[\s\S]*display: grid;[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\) auto;[\s\S]*min-width: 0;/.test(editorComponentSource)) throw new Error('reference picker rows must reserve thumbnail, text, and action columns')
if (!editorComponentSource.includes('user-rich-editor__reference-actions')) throw new Error('reference picker rows must expose separate reference action buttons')
if (!editorComponentSource.includes('insertRecipeTreeEmbed(reference)')) throw new Error('item reference rows must expose recipe tree insertion')
if (!editorComponentSource.includes('loadEditorRecipeTreeEmbeds')) throw new Error('editor recipe tree embeds must hydrate into relationship previews')
if (!editorComponentSource.includes('fetchPublicRecipeTree(embed.itemId, embed.maxDepth)')) throw new Error('editor recipe tree embeds must fetch recipe tree data from saved item id and depth')
if (/\.user-rich-editor__surface :deep\(\.tp-recipe-tree::before\)/.test(editorComponentSource)) throw new Error('editor recipe tree embeds must not rely on a placeholder pseudo-element')
if (!editorStyleSource.includes('.editor-recipe-tree__graph')) throw new Error('editor recipe tree graph must define hierarchy graph styles')
if (!recipeHierarchyGraphRendererSource.includes("from '#article-runtime/recipeHierarchyGraphRenderer'")) throw new Error('public recipe graph adapter must import the root shared renderer through its Nuxt alias')
if (!sharedRecipeHierarchyGraphRendererSource.includes("document.createElementNS('http://www.w3.org/2000/svg', 'svg')")) throw new Error('shared recipe tree graph renderer must use an SVG line canvas like the crafting page')
if (!sharedRecipeHierarchyGraphRendererSource.includes('recipe-overview-tree') || !sharedRecipeHierarchyGraphRendererSource.includes('recipe-hierarchy-card')) throw new Error('shared recipe tree graph renderer must reuse the crafting overview tree DOM classes')
if (!sharedRecipeHierarchyGraphRendererSource.includes('recipe-hierarchy-option-row')) throw new Error('shared recipe tree graph renderer must reuse crafting page compact recipe option rows')
if (!sharedRecipeHierarchyGraphRendererSource.includes('recipe-hierarchy-popover') || !sharedRecipeHierarchyGraphRendererSource.includes('positionPopover')) throw new Error('shared recipe tree graph renderer must expose crafting-style hover basic info popovers')
if (!sharedRecipeHierarchyGraphRendererSource.includes('enableInteractions') || !sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('wheel'")) throw new Error('shared recipe tree graph renderer must expose invisible wheel zoom and drag pan controls')
if (!sharedRecipeHierarchyGraphRendererSource.includes('tp-article-runtime-popover') || !sharedRecipeHierarchyGraphRendererSource.includes('popoverThemeClass')) throw new Error('shared renderer must mark body portals with the caller theme class')
if (!sharedRecipeHierarchyGraphRendererSource.includes('holder.tabIndex = 0') || !sharedRecipeHierarchyGraphRendererSource.includes("addEventListener('keydown'")) throw new Error('shared renderer nodes must support keyboard popover controls')
if (!sharedRecipeHierarchyGraphRendererSource.includes('suppressFocusShow')) throw new Error('shared renderer must prevent Escape focus restoration from reopening its popover')
if (editorComponentSource.includes('editor-recipe-tree__zoom') || editorComponentSource.includes('createEditorRecipeTreeZoomControls')) throw new Error('editor recipe tree graph must not render visible zoom controls')
if (editorComponentSource.includes('filter(child => !isSameEditorRecipeTreeItem(node, child))')) throw new Error('editor recipe tree graph must not filter away same-item recipe sources before layout normalization')
if (editorStyleSource.includes('.editor-recipe-tree__graph-children::before') || editorStyleSource.includes('.editor-recipe-tree__graph-branch::before')) throw new Error('editor recipe tree graph must not use flow-layout pseudo-element connector lines')
if (!editorStyleSource.includes('background-size: 32px 32px, 32px 32px')) throw new Error('editor recipe tree graph must use a visible grid background')
if (editorStyleSource.includes('.editor-recipe-tree__relations') || editorStyleSource.includes('.editor-recipe-tree__relation-row')) throw new Error('editor recipe tree graph must not keep old relation-row styles')
if (!editorStyleSource.includes('--recipe-overview-pan-x') || !editorStyleSource.includes('touch-action: none')) throw new Error('editor recipe tree graph must style invisible drag pan interaction')
if (!/const editorRecipeTreeNodeStations =[\s\S]*sameItemChild[\s\S]*isSameEditorRecipeTreeItem/.test(editorComponentSource)) throw new Error('editor recipe tree station lookup must preserve stations from folded same-item recipe nodes')
const newArticlePageSource = readFileSync(join(root, 'pages/user/articles/new.vue'), 'utf8')
const editArticlePageSource = readFileSync(join(root, 'pages/user/articles/[id].vue'), 'utf8')
const extractStyleSource = source => source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''
const articlePageStyleSources = {
  new: extractStyleSource(newArticlePageSource),
  edit: extractStyleSource(editArticlePageSource),
}

for (const [pageName, pageSource] of [['new', newArticlePageSource], ['edit', editArticlePageSource]]) {
  const writingStatusBlocks = extractCssBlocks(pageSource, '.article-focus-shell--writing .article-focus-status')
  if (writingStatusBlocks.length < 2) throw new Error(`${pageName} article page must define reference panel positioning for desktop and narrow writing mode`)
  if (!pageSource.includes('id="user-article-reference-panel-target"')) throw new Error(`${pageName} article page must expose an external reference panel target in the side status area`)
  if (!pageSource.includes('reference-panel-target="#user-article-reference-panel-target"')) throw new Error(`${pageName} article page must pass the external reference panel target to the editor`)
  if (!pageSource.includes('@reference-panel-open="writingModeEnabled = true"')) throw new Error(`${pageName} article page must enter writing mode when the reference picker opens`)
  if (!/const compactHeadRef = ref<HTMLElement \| null>\(null\)/.test(pageSource)) throw new Error(`${pageName} article page must track the real writing toolbar element`)
  if (!pageSource.includes('getBoundingClientRect().bottom')) throw new Error(`${pageName} article page must derive the reference panel offset from the toolbar bottom`)
  if (!pageSource.includes('referencePanelShellStyle')) throw new Error(`${pageName} article page must pass the measured reference panel offset through a shell style variable`)
  if (!pageSource.includes('new ResizeObserver(scheduleReferencePanelOffset)')) throw new Error(`${pageName} article page must resync the reference panel offset when the toolbar height changes`)
  if (!pageSource.includes("window.addEventListener('resize', scheduleReferencePanelOffset")) throw new Error(`${pageName} article page must keep the reference panel offset in sync after viewport resizes`)
  if (!pageSource.includes("window.addEventListener('scroll', scheduleReferencePanelOffset")) throw new Error(`${pageName} article page must keep the reference panel offset in sync while the sticky toolbar moves`)
  if (!pageSource.includes("window.removeEventListener('resize', scheduleReferencePanelOffset")) throw new Error(`${pageName} article page must clean up the resize listener for the reference panel offset`)
  if (!pageSource.includes("window.removeEventListener('scroll', scheduleReferencePanelOffset")) throw new Error(`${pageName} article page must clean up the scroll listener for the reference panel offset`)
  if (!pageSource.includes('referencePanelResizeObserver?.disconnect()')) throw new Error(`${pageName} article page must clean up the reference panel toolbar ResizeObserver`)
  if (!/<div\s+ref="compactHeadRef"\s+class="article-compact-head"/.test(pageSource)) throw new Error(`${pageName} article page must bind the toolbar element ref in the template`)
  if (!/<form[\s\S]*class="article-focus-shell"[\s\S]*:style="referencePanelShellStyle"/.test(pageSource)) throw new Error(`${pageName} article page must apply the measured panel offset to the writing shell`)
  if (!/<aside[\s\S]*class="article-focus-status"[\s\S]*id="user-article-reference-panel-target"[\s\S]*<section class="article-status-card"/.test(pageSource)) throw new Error(`${pageName} article page must place the reference panel target before the status card inside article-focus-status`)
  if (/article-focus-shell--writing\s+\.article-focus-rail,\s*\.article-focus-shell--writing\s+\.article-focus-status/.test(pageSource)) throw new Error(`${pageName} article page must not hide the side reference panel area in writing mode`)
  if (/article-focus-shell--writing\s+\.article-focus-status\s*\{[^}]*display:\s*none/.test(pageSource)) throw new Error(`${pageName} article page must keep the external reference panel visible in writing mode`)
  if (!/\.article-focus-shell--writing\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*980px\)\s+320px/.test(pageSource)) throw new Error(`${pageName} article page writing mode must keep a side column for references`)
  if (!/\.article-compact-head--writing\s*\{[\s\S]*z-index:\s*60;/.test(pageSource)) throw new Error(`${pageName} article page writing toolbar must stay above the reference panel`)
  if (!/--article-reference-panel-top:\s*clamp\(152px,\s*18dvh,\s*188px\);/.test(pageSource)) throw new Error(`${pageName} article page reference panel must keep a desktop fallback before measurement`)
  if (!/--user-article-toolbar-top:\s*var\(--article-reference-panel-top\);/.test(pageSource)) throw new Error(`${pageName} article page editor toolbar must use the same measured top as the reference panel`)
  for (const block of writingStatusBlocks) {
    if (!/position:\s*fixed;/.test(block)) throw new Error(`${pageName} article page writing reference panel must be fixed in each responsive mode`)
    if (!/top:\s*var\(--article-reference-panel-top\);/.test(block)) throw new Error(`${pageName} article page writing reference panel must use the measured top variable`)
    if (/top:\s*\d+px;/.test(block)) throw new Error(`${pageName} article page writing reference panel must not hard-code a fixed top`)
    if (/--article-reference-panel-top:\s*\d+px;/.test(block)) throw new Error(`${pageName} article page writing reference panel must not hard-code the measured top variable`)
    if (/--user-article-reference-panel-max-height:\s*calc\(100dvh - \d+px\);/.test(block)) throw new Error(`${pageName} article page writing reference panel max-height must derive from the measured top variable`)
    if (!/--user-article-reference-panel-max-height:\s*calc\(100dvh - var\(--article-reference-panel-top\) - 16px\);/.test(block)) throw new Error(`${pageName} article page writing reference panel max-height must use the measured top variable`)
    if (!/max-height:\s*var\(--user-article-reference-panel-max-height\);/.test(block)) throw new Error(`${pageName} article page writing reference panel must apply the bounded max-height`)
  }
  if (!/\.article-focus-shell--writing\s+\.article-focus-status\s*\{[\s\S]*position:\s*fixed;[\s\S]*top:\s*var\(--article-reference-panel-top\);[\s\S]*--user-article-reference-panel-max-height:[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 24px\)\);[\s\S]*max-height:\s*var\(--user-article-reference-panel-max-height\);/.test(pageSource)) throw new Error(`${pageName} article page writing mode must pin the reference panel inside the viewport bounds`)
  if (!/\.article-focus-shell--writing\s+\.article-status-card\s*\{[\s\S]*display:\s*none;/.test(pageSource)) throw new Error(`${pageName} article page writing mode must hide publish or review status cards`)
  if (/\.article-focus-shell--writing\s+\.article-focus-status\s*\{[^}]*--article-reference-panel-top:\s*150px;/.test(pageSource)) throw new Error(`${pageName} article page must not hard-code the narrow reference panel top on the fixed side panel`)
  if (!/@media\s*\(max-width:\s*1180px\)\s*\{[\s\S]*\.article-focus-shell--writing\s+\.article-focus-status\s*\{[\s\S]*position:\s*fixed;[\s\S]*top:\s*var\(--article-reference-panel-top\);[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 24px\)\);/.test(pageSource)) throw new Error(`${pageName} article page must keep the reference panel fixed and measured below the writing toolbar on narrow screens`)
}
if (!/\.user-rich-editor__reference-popover\s*\{[\s\S]*max-height:\s*min\(var\(--user-article-reference-panel-max-height,\s*58dvh\),\s*460px\);/.test(editorComponentSource)) throw new Error('reference picker popover must inherit the page viewport height bound')
if (!/\.user-rich-editor__reference-results\s*\{[\s\S]*max-height:\s*max\(150px,\s*min\(280px,\s*calc\(var\(--user-article-reference-panel-max-height,\s*58dvh\) - 170px\)\)\);/.test(editorComponentSource)) throw new Error('reference picker results must stay within the bounded popover height')
if (editorComponentSource.includes('@click="exec(\'undo\')"') || editorComponentSource.includes('@click="exec(\'redo\')"')) throw new Error('undo and redo buttons must use the editor history stack')
if (!editorComponentSource.includes('undoEditorHistory') || !editorComponentSource.includes('redoEditorHistory')) throw new Error('editor must expose explicit undo and redo history handlers')
if (!editorComponentSource.includes('@keydown="handleEditorKeydown"')) throw new Error('editor must handle undo and redo keyboard shortcuts inside the editor')
if (!/const handleEditorKeydown = \(event: KeyboardEvent\) => \{[\s\S]*event\.ctrlKey \|\| event\.metaKey[\s\S]*key === 'z' && event\.shiftKey[\s\S]*event\.preventDefault\(\)[\s\S]*redoEditorHistory\(\)[\s\S]*key === 'z'[\s\S]*event\.preventDefault\(\)[\s\S]*undoEditorHistory\(\)[\s\S]*key === 'y'[\s\S]*event\.preventDefault\(\)[\s\S]*redoEditorHistory\(\)/.test(editorComponentSource)) throw new Error('editor keyboard handler must map Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z to custom history')
if (!/@click="undoEditorHistory"[\s\S]*@click="redoEditorHistory"/.test(editorComponentSource)) throw new Error('toolbar undo and redo buttons must call editor history handlers')
if (!/:disabled="disabled \|\| !canUndoHistory"[\s\S]*:disabled="disabled \|\| !canRedoHistory"/.test(editorComponentSource)) throw new Error('toolbar undo and redo buttons must reflect custom history availability')
if (!/const emitEditorValue = \(\) => \{[\s\S]*editorHistory\.commit\(nextHtml\)[\s\S]*updateHistoryButtons\(\)[\s\S]*lastEmittedEditorHtml = nextHtml[\s\S]*emit\('update:modelValue', sanitizeEditorHtml\(editor\.innerHTML\)\)/.test(editorComponentSource)) throw new Error('editor input must commit to history before emitting sanitized modelValue')
if (!/normalizedNextHtml === lastEmittedEditorHtml && normalizedCurrentHtml === normalizedNextHtml[\s\S]*updateHistoryButtons\(\)[\s\S]*return[\s\S]*editorHistory\.reset\(normalizedNextHtml\)/.test(editorComponentSource)) throw new Error('modelValue sync must guard emitted HTML loops before resetting editor history')
if (!/const clearEditorTransientState = \(\) => \{[\s\S]*savedRange\.value = null[\s\S]*colorMenuOpen\.value = false[\s\S]*linkMenuOpen\.value = false[\s\S]*referenceMenuOpen\.value = false[\s\S]*selectEditorImage\(null\)[\s\S]*handleEditorDragEnd\(\)/.test(editorComponentSource)) throw new Error('history restore must be able to clear selection, menus, image tools, and drag state')
if (!/const restoreEditorHistoryHtml = \(html: string\) => \{[\s\S]*isRestoringHistory\.value = true[\s\S]*clearEditorTransientState\(\)[\s\S]*sanitizeUserArticleEditorLoadedHtml[\s\S]*setCaretAtEnd\(editor\)[\s\S]*isRestoringHistory\.value = false[\s\S]*updateHistoryButtons\(\)[\s\S]*emit\('update:modelValue', lastEmittedEditorHtml\)/.test(editorComponentSource)) throw new Error('history restore must sanitize HTML, clear transient state, restore caret, and emit the restored modelValue')

writeFileSync(htmlPath, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>User Article Editor Runtime Check</title>
    <style>
      :root {
        --index-line: #40506a;
        --index-line-strong: #6b7da0;
        --index-surface: #162033;
        --index-surface-strong: #1d2a43;
        --index-bg: #0f172a;
        --index-text: #f8fafc;
        --index-muted: #94a3b8;
        --panel: #111827;
        --shadow: 0 14px 40px rgba(0, 0, 0, .22);
        --text-strong: #f8fafc;
        --text-muted: #cbd5e1;
        --text-faint: #94a3b8;
        --muted-text: #cbd5e1;
        --accent-gold: #ffd765;
        --danger: #ef4444;
      }
      ${editorStyleSource.replace(/<\/style/gi, '<\\/style')}
      .layout-check-root {
        width: 720px;
        margin: 0;
      }
      .layout-check-root .user-rich-editor__surface {
        box-sizing: border-box;
        min-height: 160px;
      }
    </style>
  </head>
  <body>
    <div class="layout-check-root">
      <div class="user-rich-editor__toolbar"></div>
      <div id="user-article-reference-panel-target" class="article-reference-side-target">
        <div class="user-rich-editor__reference-menu">
          <div class="user-rich-editor__reference-popover">
            <div class="user-rich-editor__reference-results"><p>默认资料</p></div>
          </div>
        </div>
      </div>
      <div class="user-rich-editor__stage">
        <div class="user-rich-editor__surface"></div>
      </div>
    </div>
    <div id="editor" contenteditable="true"><p><br></p></div>
    <pre id="result">pending</pre>
    <script>
      ${editorDomSource}
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };

      const articlePageStyles = ${JSON.stringify(articlePageStyleSources).replace(/<\//g, '<\\/')};
      const runArticleReferencePanelLayoutCheck = (pageName, styleSource) => {
        const styleElement = document.createElement('style');
        styleElement.textContent = styleSource;
        document.head.append(styleElement);

        const root = document.createElement('section');
        root.className = 'screen entity-screen active article-runtime-layout-check';
        root.innerHTML = \`
          <div class="article-compact-head article-compact-head--writing">
            <div class="article-compact-head__title">
              <span class="article-compact-head__dot"></span>
              <div>
                <span>/user/articles/runtime · editor</span>
                <h1>编辑文章</h1>
              </div>
            </div>
            <div class="article-compact-head__actions">
              <button class="secondary-button article-writing-toggle" type="button">退出写作模式</button>
              <button class="secondary-button" type="button">返回我的文章</button>
              <button class="secondary-button article-review-action" type="button">保存并提交管理员审核</button>
              <button class="primary-button" type="button">保存草稿</button>
            </div>
          </div>
          <form class="article-focus-shell article-focus-shell--writing">
            <section class="article-writing-surface">
              <div class="user-rich-editor__toolbar"></div>
              <div style="min-height: 900px"></div>
            </section>
            <aside class="article-focus-status">
              <div class="article-reference-side-target">
                <div class="user-rich-editor__reference-menu">
                  <div class="user-rich-editor__reference-popover">
                    <div class="user-rich-editor__reference-results"><p>默认资料</p></div>
                  </div>
                </div>
              </div>
            </aside>
          </form>
        \`;
        document.body.append(root);

        const shell = root.querySelector('.article-focus-shell');
        const toolbar = root.querySelector('.article-compact-head');
        const editorToolbar = root.querySelector('.user-rich-editor__toolbar');
        const panel = root.querySelector('.article-focus-status');
        const syncMeasuredTop = () => {
          shell.style.setProperty('--article-reference-panel-top', Math.max(96, Math.ceil(toolbar.getBoundingClientRect().bottom + 12)) + 'px');
        };
        const assertPanelClearsToolbar = (label) => {
          syncMeasuredTop();
          const toolbarRect = toolbar.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const panelStyle = window.getComputedStyle(panel);
          const editorToolbarStyle = window.getComputedStyle(editorToolbar);
          assert(panelStyle.position === 'fixed', pageName + ' reference panel must be fixed in ' + label);
          assert(panelStyle.top === shell.style.getPropertyValue('--article-reference-panel-top'), pageName + ' reference panel CSS top must use the measured shell variable in ' + label);
          assert(editorToolbarStyle.top === shell.style.getPropertyValue('--article-reference-panel-top'), pageName + ' editor toolbar CSS top must use the measured shell variable in ' + label);
          assert(panelRect.top + 0.5 >= toolbarRect.bottom + 12, pageName + ' reference panel overlaps the writing toolbar in ' + label);
        };

        assertPanelClearsToolbar('initial viewport ' + window.innerWidth);
        window.scrollTo(0, 180);
        assertPanelClearsToolbar('scrolled viewport ' + window.innerWidth);
        window.scrollTo(0, 0);

        root.remove();
        styleElement.remove();
      };

      for (const [pageName, styleSource] of Object.entries(articlePageStyles)) {
        runArticleReferencePanelLayoutCheck(pageName, styleSource);
      }

      const surfaceRect = document.querySelector('.layout-check-root .user-rich-editor__surface').getBoundingClientRect();
      const popoverRect = document.querySelector('.layout-check-root .user-rich-editor__reference-popover').getBoundingClientRect();
      assert(popoverRect.right <= surfaceRect.left || popoverRect.left >= surfaceRect.right || popoverRect.bottom <= surfaceRect.top || popoverRect.top >= surfaceRect.bottom, 'open reference panel must live outside the editor surface');

      const history = createUserArticleEditorHistory('<p>初始</p>', { limit: 4 });
      assert(!history.canUndo(), 'fresh editor history should not be undoable');
      history.commit('<p>第一步</p>');
      history.commit('<p>第二步</p>');
      assert(history.canUndo(), 'editor history should be undoable after committed changes');
      assert(history.undo() === '<p>第一步</p>', 'first undo should restore the previous html snapshot');
      assert(history.undo() === '<p>初始</p>', 'second undo should restore the initial html snapshot');
      assert(!history.canUndo(), 'editor history should stop at the initial snapshot');
      assert(history.redo() === '<p>第一步</p>', 'redo should restore the next html snapshot');
      history.commit('<p>分支</p>');
      assert(!history.canRedo(), 'new edits after undo should clear redo history');
      history.commit('<p>分支</p>');
      assert(history.undo() === '<p>第一步</p>', 'duplicate commits must not pollute undo history');

      const editor = document.querySelector('#editor');
      const setCaretAtEnd = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return range;
      };

      const setBlock = (tagName) => {
        const current = editor.querySelector('p,h2,h3,blockquote,li') || editor;
        const replacement = document.createElement(tagName);
        replacement.innerHTML = current.innerHTML || '<br>';
        current.replaceWith(replacement);
        setCaretAtEnd(replacement);
      };

      const collectSelectedBlocks = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return [];
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return [];

        const blocks = new Set();
        const startElement = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement)?.closest('p,h2,h3,h4,blockquote,li');
        if (startElement) blocks.add(startElement);
        for (const candidate of Array.from(editor.querySelectorAll('p,h2,h3,h4,blockquote,li'))) {
          if (range.intersectsNode(candidate)) blocks.add(candidate);
        }
        return Array.from(blocks);
      };

      const insertListLikeComponent = (type) => {
        const blocks = collectSelectedBlocks();
        const activeRange = window.getSelection().getRangeAt(0);
        const activeElement = (activeRange.startContainer.nodeType === Node.ELEMENT_NODE
          ? activeRange.startContainer
          : activeRange.startContainer.parentElement);
        const activeList = activeElement?.closest('ol,ul');
        if (activeList && editor.contains(activeList)) {
          if (activeList.tagName.toLowerCase() !== type) {
            const replacement = document.createElement(type);
            replacement.innerHTML = activeList.innerHTML;
            activeList.replaceWith(replacement);
            const firstItem = replacement.querySelector('li');
            if (firstItem) setCaretAtEnd(firstItem);
            return;
          }

          const paragraphs = [];
          for (const item of Array.from(activeList.querySelectorAll(':scope > li'))) {
            const paragraph = document.createElement('p');
            paragraph.innerHTML = item.innerHTML || '<br>';
            paragraphs.push(paragraph);
          }
          activeList.replaceWith(...paragraphs);
          if (paragraphs[0]) setCaretAtEnd(paragraphs[0]);
          return;
        }

        const list = document.createElement(type);
        const sourceBlocks = blocks.length ? blocks : [];
        if (!sourceBlocks.length) {
          const listHtml = type === 'ol'
            ? setUserArticleOrderedList(editor.innerHTML)
            : setUserArticleUnorderedList(editor.innerHTML);
          list.innerHTML = listHtml.replace(/^<(ol|ul)>|<\\/(ol|ul)>$/g, '');
          editor.innerHTML = '';
          editor.appendChild(list);
        } else {
          const currentBlocks = sourceBlocks
            .map(block => block.closest('p,h2,h3,h4,blockquote,li'))
            .filter(block => Boolean(block && editor.contains(block)));

          for (const current of currentBlocks) {
            const item = document.createElement('li');
            item.innerHTML = current.innerHTML || '<br>';
            list.appendChild(item);
          }

          const anchor = currentBlocks[0] || null;
          if (anchor) {
            anchor.replaceWith(list);
            for (const current of currentBlocks.slice(1)) current.remove();
          } else {
            editor.appendChild(list);
          }
        }

        const firstItem = list.querySelector('li');
        if (firstItem) setCaretAtEnd(firstItem);
      };

      const appendPlainParagraph = (container, text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = String(text || '').trim();
        if (!paragraph.textContent) paragraph.innerHTML = '<br>';
        container.appendChild(paragraph);
        return paragraph;
      };

      const clearFormattingLikeComponent = () => {
        const cleaned = document.createElement('div');
        for (const node of Array.from(editor.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text) appendPlainParagraph(cleaned, text);
            continue;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const element = node;
          const tagName = element.tagName.toLowerCase();
          if (tagName === 'ol' || tagName === 'ul') {
            for (const item of Array.from(element.querySelectorAll(':scope > li'))) {
              appendPlainParagraph(cleaned, item.textContent || '');
            }
            continue;
          }
          if (tagName === 'figure' || tagName === 'img') {
            cleaned.appendChild(element.cloneNode(true));
            continue;
          }
          appendPlainParagraph(cleaned, element.textContent || '');
        }

        editor.innerHTML = cleaned.innerHTML || '<p><br></p>';
        const firstParagraph = editor.querySelector('p');
        if (firstParagraph) setCaretAtEnd(firstParagraph);
      };

      const applyTypingStyle = (fontSizePx, color) => {
        const range = window.getSelection().getRangeAt(0);
        const span = document.createElement('span');
        span.setAttribute('style', buildUserArticleInlineStyle({
          fontSizePx,
          textColor: sanitizeUserArticleEditorColor(color)
        }));
        const placeholder = document.createTextNode(USER_ARTICLE_EDITOR_PLACEHOLDER);
        span.appendChild(placeholder);
        range.insertNode(span);
        const next = document.createRange();
        next.setStart(placeholder, placeholder.data.length);
        next.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(next);
      };

      try {
        setCaretAtEnd(editor.querySelector('p'));
        applyTypingStyle(24, '#12ABEF');
        document.execCommand('insertText', false, '正文');
        const typedHtml = unwrapUserArticleTypingPlaceholders(editor.innerHTML).toLowerCase();
        assert(typedHtml.includes('font-size:24px'), '24px typing style was not preserved');
        assert(typedHtml.includes('color:#12abef'), 'custom typing color was not preserved');
        assert(typedHtml.includes('>正文</span>'), 'continued typing did not stay inside styled span');

        editor.innerHTML = '<p>标题</p>';
        setCaretAtEnd(editor.querySelector('p'));
        setBlock('h2');
        assert(editor.innerHTML === '<h2>标题</h2>', 'H2 block did not replace current paragraph');

        setBlock('h3');
        assert(editor.innerHTML === '<h3>标题</h3>', 'H3 block did not replace current block');

        setBlock('blockquote');
        assert(editor.innerHTML === '<blockquote>标题</blockquote>', 'blockquote block did not replace current block');

        editor.innerHTML = '<p>第一条</p>';
        setCaretAtEnd(editor.querySelector('p'));
        insertListLikeComponent('ol');
        document.execCommand('insertText', false, '继续');
        assert(editor.innerHTML === '<ol><li>第一条继续</li></ol>', 'ordered list button path did not keep typing inside ol/li');
        insertListLikeComponent('ol');
        assert(editor.innerHTML === '<p>第一条继续</p>', 'ordered list should toggle back to a paragraph on second click');

        editor.innerHTML = '<p>项目</p>';
        setCaretAtEnd(editor.querySelector('p'));
        insertListLikeComponent('ul');
        document.execCommand('insertText', false, '继续');
        assert(editor.innerHTML === '<ul><li>项目继续</li></ul>', 'unordered list button path did not keep typing inside ul/li');
        insertListLikeComponent('ol');
        assert(editor.innerHTML === '<ol><li>项目继续</li></ol>', 'switching unordered to ordered list should not create nested lists');
        insertListLikeComponent('ol');
        assert(editor.innerHTML === '<p>项目继续</p>', 'ordered list converted from unordered should toggle back to a paragraph');

        editor.innerHTML = '<ol><li><span style="font-size:24px;color:#12abef">清除我</span></li></ol><blockquote style="text-indent:2em">引用</blockquote><h2 style="color:#ffd765">标题</h2>';
        setCaretAtEnd(editor.querySelector('li'));
        clearFormattingLikeComponent();
        assert(editor.innerHTML === '<p>清除我</p><p>引用</p><p>标题</p>', 'clear formatting should flatten lists, headings, quotes, and inline styles');

        const selectedLinkHtml = buildUserArticleLinkHtml({
          href: 'example.com/wiki',
          title: '泰拉百科链接'
        });
        assert(selectedLinkHtml.includes('href="https://example.com/wiki"'), 'bare domains should be normalized to https links');
        assert(selectedLinkHtml.includes('>泰拉百科链接</a>'), 'link should display the provided title text');
        assert(!selectedLinkHtml.includes('>https://example.com/wiki</a>'), 'link body should not fall back to the raw URL when a title is provided');

        const collapsedLinkHtml = buildUserArticleLinkHtml({
          href: 'https://terraria.wiki.gg/wiki/Guide:Crafting_101',
          title: '合成指南'
        });
        assert(collapsedLinkHtml.includes('title="合成指南"'), 'collapsed link insertion should keep title metadata');
        assert(collapsedLinkHtml.includes('>合成指南</a>'), 'collapsed link insertion should display the title');

        const rawUrlLinkHtml = buildUserArticleLinkHtml({
          href: 'https://terraria.wiki.gg/wiki/Guide:Crafting_101',
          title: ''
        });
        assert(rawUrlLinkHtml.includes('href="https://terraria.wiki.gg/wiki/Guide:Crafting_101"'), 'empty link title should still create a link');
        assert(rawUrlLinkHtml.includes('>https://terraria.wiki.gg/wiki/Guide:Crafting_101</a>'), 'empty link title should display the raw URL');

        const unsafeLinkHtml = buildUserArticleLinkHtml({
          href: 'javascript:alert(1)',
          title: '坏链接'
        });
        assert(unsafeLinkHtml === '', 'unsafe javascript links should not be inserted');

        const pastedLinkHtml = sanitizeUserArticlePastedHtml('<a href="https://member.bilibili.com/platform/upload/video/frame" title="创作中心">创作中心 - 哔哩哔哩弹幕视频网站</a>');
        assert(pastedLinkHtml.includes('href="https://member.bilibili.com/platform/upload/video/frame"'), 'pasted HTML links should keep their href');
        assert(pastedLinkHtml.includes('>https://member.bilibili.com/platform/upload/video/frame</a>'), 'pasted HTML links should display the URL text by default');
        assert(!pastedLinkHtml.includes('>创作中心 - 哔哩哔哩弹幕视频网站</a>'), 'pasted HTML links should not replace the URL with the source page title');

        const uriListLinkHtml = buildUserArticleLinkHtml({
          href: 'https://member.bilibili.com/platform/upload/video/frame',
          title: '创作中心 - 哔哩哔哩弹幕视频网站'
        });
        assert(uriListLinkHtml.includes('href="https://member.bilibili.com/platform/upload/video/frame"'), 'URI-list clipboard links should be insertable as anchors');
        assert(uriListLinkHtml.includes('>创作中心 - 哔哩哔哩弹幕视频网站</a>'), 'URI-list clipboard links should use the available title text');

        const referenceHtml = buildUserArticleReferenceHtml({
          type: 'item',
          id: 77,
          label: '泰拉刃',
          imageUrl: '/preview-assets/terrapedia-images/items/terra-blade.png'
        });
        assert(referenceHtml.includes('data-tp-ref-type="item"'), 'reference helper did not build item type');
        editor.innerHTML = '<p>使用 ' + referenceHtml + ' 过渡。</p>';
        const ref = editor.querySelector('.tp-content-ref');
        assert(ref?.getAttribute('data-tp-ref-id') === '77', 'editor reference span did not keep id');
        assert(ref?.getAttribute('draggable') === 'true', 'editor reference span should be draggable');
        assert(ref?.getAttribute('data-tp-ref-display') === 'image', 'editor reference span should default to image mode');
        assert(ref?.querySelector('img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/terra-blade.png', 'editor reference span should render image by default');
        assert(ref?.textContent.trim() === '', 'image-mode editor reference span should not render label text');

        const referenceTextHtml = buildUserArticleReferenceHtml({ type: 'item', id: 77, label: '泰拉刃', displayMode: 'text' });
        editor.innerHTML = '<p>使用 ' + referenceTextHtml + ' 过渡。</p>';
        const textRef = editor.querySelector('.tp-content-ref');
        assert(textRef?.getAttribute('data-tp-ref-display') === 'text', 'text-mode editor reference span should keep display mode');
        assert(textRef?.textContent === '泰拉刃', 'text-mode editor reference span should keep label text');

        const bossReferenceHtml = buildUserArticleReferenceHtml({ type: 'boss', id: 34, label: '克苏鲁之眼', displayMode: 'text' });
        editor.innerHTML = '<p>挑战 ' + bossReferenceHtml + '。</p>';
        const bossRef = editor.querySelector('.tp-content-ref');
        assert(bossRef?.getAttribute('data-tp-ref-type') === 'boss', 'boss editor reference should keep boss type');
        assert(bossRef?.getAttribute('data-tp-ref-id') === '34', 'boss editor reference should keep id');
        assert(bossRef?.textContent === '克苏鲁之眼', 'boss text reference should keep label text');

        const legacyReferenceHtml = '<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃" data-tp-ref-image="/preview-assets/terrapedia-images/items/terra-blade.png">泰拉刃</span>';
        const normalizedLegacyReferenceHtml = sanitizeUserArticleEditorLoadedHtml('<p>使用 ' + legacyReferenceHtml + ' 过渡。</p>');
        const legacyRoot = document.createElement('div');
        legacyRoot.innerHTML = normalizedLegacyReferenceHtml;
        const legacyRef = legacyRoot.querySelector('.tp-content-ref');
        assert(legacyRef?.getAttribute('data-tp-ref-display') === 'image', 'legacy editor reference should normalize to image mode on load');
        assert(legacyRef?.querySelector('img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/terra-blade.png', 'legacy editor reference should render saved image on load');
        assert(legacyRef?.textContent.trim() === '', 'legacy image reference should not keep stale label text on load');

        const recipeTreeHtml = buildUserArticleRecipeTreeEmbedHtml({ itemId: 77, maxDepth: 5, label: '泰拉刃' });
        assert(recipeTreeHtml.includes('class="tp-article-embed tp-recipe-tree"'), 'recipe tree helper must build stable embed classes');
        assert(!recipeTreeHtml.includes('contenteditable'), 'recipe tree helper must not persist editor runtime attrs');
        const pollutedRecipeTreeHtml = '<div class="tp-article-embed tp-recipe-tree" contenteditable="false" style="width:100%" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="5" data-tp-label="泰拉刃" data-tp-resolved="ready"><section data-api-payload="bad">payload</section></div>';
        const normalizedRecipeTreeHtml = sanitizeUserArticleEditorLoadedHtml(pollutedRecipeTreeHtml);
        assert(normalizedRecipeTreeHtml === '<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-max-depth="5" data-tp-label="泰拉刃"></div>', 'loaded recipe tree embed must preserve only identity/config attrs');
        assert(sanitizeUserArticleEditorLoadedHtml('<div class="tp-article-embed tp-recipe-tree" data-tp-item-id="77" data-tp-max-depth="5" data-tp-label="泰拉刃"></div>') === '', 'loaded recipe tree embed without embed type must be rejected');
        assert(sanitizeUserArticleEditorLoadedHtml('<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="item-card" data-tp-item-id="77" data-tp-max-depth="5" data-tp-label="泰拉刃"></div>') === '', 'loaded recipe tree embed with bad embed type must be rejected');
        assert(sanitizeUserArticleEditorLoadedHtml('<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="77" data-tp-label="泰拉刃"></div>') === '', 'loaded recipe tree embed without depth must be rejected');

        const insertRecipeTreeLikeComponent = () => {
          editor.innerHTML = '<p>前文后文</p>';
          const paragraph = editor.querySelector('p');
          const text = paragraph.firstChild;
          const range = document.createRange();
          range.setStart(text, 2);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          const template = document.createElement('template');
          template.innerHTML = recipeTreeHtml + '<p><br></p>';
          const fragment = template.content;
          const embedNode = fragment.querySelector('.tp-recipe-tree');
          const caretBlock = fragment.querySelector('p');
          embedNode.setAttribute('contenteditable', 'false');
          const afterRange = document.createRange();
          afterRange.selectNodeContents(paragraph);
          afterRange.setStart(range.startContainer, range.startOffset);
          const afterFragment = afterRange.extractContents();
          const afterBlock = document.createElement('p');
          afterBlock.append(afterFragment);
          paragraph.after(embedNode, afterBlock, caretBlock);
        };
        insertRecipeTreeLikeComponent();
        assert(editor.children[0]?.tagName === 'P' && editor.children[0].textContent === '前文', 'recipe tree insertion should preserve text before the caret');
        assert(editor.children[1]?.classList.contains('tp-recipe-tree'), 'recipe tree insertion should place embed as a top-level block');
        assert(editor.children[2]?.tagName === 'P' && editor.children[2].textContent === '后文', 'recipe tree insertion should preserve text after the caret');
        assert(!editor.querySelector('p .tp-recipe-tree'), 'recipe tree insertion must not nest block embed inside a paragraph');

        const insertReferenceLikeComponent = () => {
          editor.innerHTML = '<p>使用 </p>';
          const paragraph = editor.querySelector('p');
          setCaretAtEnd(paragraph);
          const range = window.getSelection().getRangeAt(0);
          const template = document.createElement('template');
          template.innerHTML = referenceHtml;
          const node = template.content.firstElementChild;
          node.setAttribute('contenteditable', 'false');
          const space = document.createTextNode('\\u00a0');
          range.deleteContents();
          range.insertNode(node);
          node.after(space);
          const nextRange = document.createRange();
          nextRange.setStart(space, space.data.length);
          nextRange.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(nextRange);
          document.execCommand('insertText', false, '继续');
        };
        insertReferenceLikeComponent();
        assert(editor.querySelector('.tp-content-ref')?.querySelector('img'), 'typing after image reference must not remove chip image');
        assert(editor.querySelector('.tp-content-ref')?.textContent.trim() === '', 'typing after image reference must not mutate chip text');
        assert(editor.innerHTML.includes('</span>&nbsp;继续') || editor.innerHTML.includes('</span>\\u00a0继续'), 'caret should land after reference trailing text node');

        editor.innerHTML = '<p><span style="font-size:28px;color:rgb(245, 230, 184)">' + referenceHtml + '&nbsp;</span><br></p><p><span style="font-size:16px;color:rgb(252, 165, 165)">FWFW状态：</span>干<span style="font-size:16px;color:rgb(125, 211, 252)">净，基于本地 m</span>ain</p><p>232311111111111111</p>';
        const allRange = document.createRange();
        allRange.selectNodeContents(editor);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(allRange);
        applyUserArticleInlineStyleToRange({
          editor,
          range: allRange,
          fontSizePx: 18,
          textColor: '#f5e6b8',
        });
        const styledHtml = editor.innerHTML.toLowerCase();
        assert(!styledHtml.includes('font-size:28px'), 'multi-block selection should remove stale larger reference wrapper font size');
        assert(!styledHtml.includes('font-size:16px'), 'multi-block selection should remove stale inline text font sizes');
        assert(!styledHtml.includes('<span style="font-size:18px;color:#f5e6b8"><p'), 'multi-block selection must not wrap block nodes in an inline span');
        for (const reference of Array.from(editor.querySelectorAll('.tp-content-ref'))) {
          assert(reference.style.fontSize === '18px', 'selected reference should receive the unified font size');
          assert(reference.style.color === 'rgb(245, 230, 184)' || reference.style.color === '#f5e6b8', 'selected reference should receive the unified color');
        }
        for (const paragraph of Array.from(editor.querySelectorAll('p'))) {
          assert(/font-size:\\s*18px/.test(paragraph.getAttribute('style') || ''), 'selected paragraph should receive unified font size for bare text');
        }

        editor.innerHTML = '<p>FW<span style="font-size:16px;color:rgb(34, 197, 94)">FWFWFW状态：</span>' + referenceHtml + '干<span style="font-size:16px;color:rgb(125, 211, 252)">净，基于本地 m</span>ain</p>';
        const mixedParagraph = editor.querySelector('p');
        const singleRange = document.createRange();
        singleRange.selectNodeContents(mixedParagraph);
        selection.removeAllRanges();
        selection.addRange(singleRange);
        applyUserArticleInlineStyleToSelectedRange({
          editor,
          range: singleRange,
          fontSizePx: 22,
          textColor: '#ffd765',
        });
        const singleStyledHtml = editor.innerHTML.toLowerCase();
        assert(!singleStyledHtml.includes('rgb(34, 197, 94)'), 'single-block selection should replace stale green inline color');
        assert(!singleStyledHtml.includes('rgb(125, 211, 252)'), 'single-block selection should replace stale blue inline color');
        assert(!singleStyledHtml.includes('font-size:16px'), 'single-block selection should replace stale inline font size');
        assert(/color:\\s*rgb\\(255,\\s*215,\\s*101\\)|color:\\s*#ffd765/.test(singleStyledHtml), 'single-block selection should apply unified selected color');
        assert(mixedParagraph.style.fontSize === '', 'single-block selection should not force the whole paragraph font size');
        assert(mixedParagraph.style.color === '', 'single-block selection should not force the whole paragraph color');
        const mixedWrapper = mixedParagraph.querySelector('span');
        assert(mixedWrapper?.textContent.includes('FWFWFW状态：干净，基于本地 main'), 'single-block selection should wrap the selected mixed content');
        assert(mixedWrapper?.style.fontSize === '22px', 'single-block selection should apply unified font size to the selected wrapper for bare text');
        assert(mixedWrapper?.style.color === 'rgb(255, 215, 101)' || mixedWrapper?.style.color === '#ffd765', 'single-block selection should apply unified color to the selected wrapper for bare text');
        for (const reference of Array.from(editor.querySelectorAll('.tp-content-ref'))) {
          assert(reference.style.fontSize === '22px', 'single-block selected reference should receive unified font size');
          assert(reference.style.color === 'rgb(255, 215, 101)' || reference.style.color === '#ffd765', 'single-block selected reference should receive unified color');
        }

        editor.innerHTML = '<p>开头中间结尾</p>';
        const partialParagraph = editor.querySelector('p');
        const partialText = partialParagraph.firstChild;
        const partialRange = document.createRange();
        partialRange.setStart(partialText, 2);
        partialRange.setEnd(partialText, 4);
        applyUserArticleInlineStyleToSelectedRange({
          editor,
          range: partialRange,
          fontSizePx: 26,
          textColor: '#a78bfa',
        });
        assert(partialParagraph.style.fontSize === '', 'partial plain-text selection must not apply font size to the whole paragraph');
        assert(partialParagraph.style.color === '', 'partial plain-text selection must not apply color to the whole paragraph');
        const partialSpan = partialParagraph.querySelector('span');
        assert(partialParagraph.textContent === '开头中间结尾', 'partial plain-text styling must preserve paragraph text');
        assert(partialSpan?.textContent === '中间', 'partial plain-text styling should wrap only the selected text');
        assert(partialSpan?.style.fontSize === '26px', 'partial plain-text selected span should receive unified font size');
        assert(partialSpan?.style.color === 'rgb(167, 139, 250)' || partialSpan?.style.color === '#a78bfa', 'partial plain-text selected span should receive unified color');

        document.querySelector('#result').textContent = 'PASS';
      } catch (error) {
        document.querySelector('#result').textContent = 'FAIL: ' + (error && error.message ? error.message : error);
      }
    </script>
  </body>
</html>
`, 'utf8')

const runChromiumCheck = (width, height) => execFileSync(chromium, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  `--window-size=${width},${height}`,
  '--virtual-time-budget=5000',
  '--dump-dom',
  pathToFileURL(htmlPath).href,
], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
})

for (const [width, height] of [[1366, 900], [390, 760]]) {
  const output = runChromiumCheck(width, height)
  if (!output.includes('<pre id="result">PASS</pre>')) {
    const dumpPath = join(tempDir, `dump-${width}x${height}.html`)
    writeFileSync(dumpPath, output, 'utf8')
    throw new Error(`User article editor runtime check failed at ${width}x${height}. Dump: ${dumpPath}`)
  }
}

rmSync(tempDir, { recursive: true, force: true })
console.log('user article editor runtime checks passed')
