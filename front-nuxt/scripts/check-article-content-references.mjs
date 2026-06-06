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

const extractFunction = (source, name) => {
  const marker = `const ${name} = `
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Missing ${name} in article page source`)
  const nextConst = source.indexOf('\nconst ', start + marker.length)
  const nextWatch = source.indexOf('\nwatch(', start + marker.length)
  const nextTemplate = source.indexOf('\n</script>', start + marker.length)
  const ends = [nextConst, nextWatch, nextTemplate].filter(index => index > start)
  const end = Math.min(...ends)
  return source.slice(start, end).replace(marker, `const ${name} = `)
}

const toBrowserJs = (source) => source
  .replace(/: string\[]/g, '')
  .replace(/: string/g, '')
  .replace(/: 'href' \| 'src'/g, '')
  .replace(/: 'ul' \| 'ol' \| ''/g, '')
  .replace(/: RegExpExecArray \| null/g, '')
  .replace(/: KeyboardEvent/g, '')
  .replace(/new Map<string, string>\(\)/g, 'new Map()')
  .replace(/querySelectorAll<HTMLElement>/g, 'querySelectorAll')
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
  'enhanceArticleReferenceNodes',
  'loadArticleReferences',
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
if (!articlePageSource.includes('width: 1.875em')) throw new Error('article reference image size must scale with saved font size')
if (!composableSource.includes('import { resolvePreviewImageUrl }')) throw new Error('content reference composable must import resolvePreviewImageUrl')
if (!composableSource.includes('detailPath: detailPathFromTypeId(type, id)')) throw new Error('content reference normalizer must derive detail paths from type/id')

const sanitizerHelpers = toBrowserJs([
  extractFunction(articlePageSource, 'escapeArticleHtml'),
  extractFunction(articlePageSource, 'sanitizeArticleUrl'),
  extractFunction(articlePageSource, 'sanitizeArticleStyle'),
  extractFunction(articlePageSource, 'sanitizeArticleAttributes'),
  extractFunction(articlePageSource, 'renderInlineArticleText'),
  extractFunction(articlePageSource, 'renderPlainArticleText'),
  extractFunction(articlePageSource, 'sanitizeArticleHtml'),
].join('\n'))
const enhancementHelpers = toBrowserJs(extractFunction(articlePageSource, 'enhanceArticleReferenceNodes'))

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
        return type === 'item' || type === 'npc' ? type : '';
      };
      const normalizeId = (value) => {
        const id = normalizeText(value);
        return /^\\d{1,12}$/.test(id) ? id : '';
      };
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
          detailPath: type === 'item' ? '/items/' + id : '/npcs/' + id,
          available: raw.available !== false,
        };
      };
      ${sanitizerHelpers}
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
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

      const malformed = [
        ['missing type', '<span class="tp-content-ref" data-tp-ref-id="77" data-tp-ref-label="泰拉刃">泰拉刃</span>'],
        ['invalid type', '<span class="tp-content-ref" data-tp-ref-type="boss" data-tp-ref-id="77" data-tp-ref-label="克眼">克眼</span>'],
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

      const normalized = normalizeContentReference({
        type: 'item',
        id: '77',
        label: '泰拉刃',
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
      assert(normalized.detailPath === '/items/77', 'normalizer must derive item detail path from type/id');
      assert(normalizedNpc.detailPath === '/npcs/22', 'normalizer must derive npc detail path from type/id');
      assert(contentReferenceKey('npc', '1') === 'npc:1', 'content reference key should normalize supported types');

      const article = document.querySelector('#article');
      article.innerHTML = valid;
      const articleContentRef = { value: article };
      const articleReferences = { value: { 'item:77': normalized } };
      const articleReferenceLabels = { value: { 'item:77': '泰拉刃', 'npc:22': '向导' } };
      const articleReferenceError = { value: '' };
      const navigations = [];
      const navigateTo = (path) => {
        navigations.push(path);
      };
      const collectArticleReferenceInputs = () => {
        const root = articleContentRef.value;
        if (!root) return [];
        return Array.from(root.querySelectorAll('.tp-content-ref'))
          .map(node => ({
            type: node.dataset.tpRefType === 'npc' ? 'npc' : 'item',
            id: node.dataset.tpRefId || '',
          }))
          .filter(ref => ref.id);
      };
      ${enhancementHelpers}
      assert(collectArticleReferenceInputs()[0].id === '77', 'collector should read sanitized reference inputs');
      enhanceArticleReferenceNodes();
      const ref = article.querySelector('.tp-content-ref');
      assert(ref.getAttribute('role') === 'link', 'enhancement should add link role');
      assert(ref.getAttribute('tabindex') === '0', 'enhancement should add keyboard focus');
      assert(ref.getAttribute('title') === '泰拉刃', 'enhancement should expose reference label on hover');
      assert(ref.getAttribute('aria-label') === '泰拉刃，打开详情', 'enhancement should expose accessible link label');
      assert(ref.dataset.tpHref === '/items/77', 'enhancement should store derived detail path');
      assert(ref.querySelector('img')?.getAttribute('src') === '/images/item.png', 'enhancement should render resolved reference image inside article body');
      assert(ref.textContent.trim() === '', 'enhancement should not render reference name in article body');
      ref.click();
      assert(navigations.at(-1) === '/items/77', 'click should navigate to item detail');
      ref.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      assert(navigations.at(-1) === '/items/77', 'Enter key should navigate to item detail');
      ref.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      assert(navigations.at(-1) === '/items/77', 'Space key should navigate to item detail');
      articleReferences.value = {};
      enhanceArticleReferenceNodes();
      assert(ref.querySelector('img')?.getAttribute('src') === '/preview-assets/terrapedia-images/items/terra-blade.png', 'enhancement should render saved reference image before resolve finishes');
      assert(ref.textContent.trim() === '', 'saved reference image should also stay image-only before resolve finishes');

      article.innerHTML = validText;
      articleReferences.value = { 'item:77': normalized };
      enhanceArticleReferenceNodes();
      const textModeRef = article.querySelector('.tp-content-ref');
      assert(textModeRef.dataset.tpHref === '/items/77', 'text-mode reference should still store detail path');
      assert(!textModeRef.querySelector('img'), 'text-mode reference should not render image after enhancement');
      assert(textModeRef.textContent.trim() === '泰拉刃', 'text-mode reference should render label after enhancement');

      article.innerHTML = validNpcFallback;
      articleReferences.value = { 'npc:22': normalizedNpc };
      enhanceArticleReferenceNodes();
      const npcRef = article.querySelector('.tp-content-ref');
      assert(npcRef.dataset.tpHref === '/npcs/22', 'npc enhancement should store derived detail path');
      assert(npcRef.querySelector('.tp-content-ref-fallback')?.textContent === '图', 'npc without image should render image placeholder');
      assert(npcRef.textContent.trim() === '图', 'npc without image should render only image placeholder text');
      npcRef.click();
      assert(navigations.at(-1) === '/npcs/22', 'click should navigate to npc detail');
      document.querySelector('#result').textContent = 'PASS';
      } catch (error) {
        document.querySelector('#result').textContent = 'FAIL: ' + (error && error.message ? error.message : error);
      }
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
