import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const root = new URL('..', import.meta.url)
const file = (path) => new URL(path, root)
const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5176'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (url, attempts = 80) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return
      }
    } catch {}

    await sleep(100)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

const connectToChrome = async (port) => {
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/terrapedia-chrome-visual-regression-${port}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })

  try {
    await waitFor(`http://127.0.0.1:${port}/json/version`)

    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    }).then((response) => response.json())

    const ws = new WebSocket(target.webSocketDebuggerUrl)
    const callbacks = new Map()
    let id = 0

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)

      if (!message.id || !callbacks.has(message.id)) {
        return
      }

      const callback = callbacks.get(message.id)
      callbacks.delete(message.id)

      if (message.error) {
        callback.reject(new Error(JSON.stringify(message.error)))
      } else {
        callback.resolve(message.result)
      }
    })

    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      id += 1
      callbacks.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

    return { chrome, send, ws }
  } catch (error) {
    chrome.kill('SIGTERM')
    throw error
  }
}

const auditExpression = `(() => {
  const selectors = [
    '.site-nav',
    '.site-actions',
    '.site-links',
    '.page-head',
    '.page-head-inner',
    '.hero',
    '.hero-grid',
    '.search-bar',
    '.quick-entry',
    '.quick-entry-primary',
    '.quick-entry-secondary',
    '.quick-entry-card',
    '.quick-entry-chip',
    '.atlas-index',
    '.catalog-pixel-stage',
    '.catalog-wall-shell',
    '.catalog-wall-topbar',
    '.catalog-search-form',
    '.catalog-wall-grid',
    '.catalog-floating-focus',
    '.catalog-empty-state',
    '.camp-footer',
  ];
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && rect.width > 1 && rect.height > 1;
  };
  const overflowing = [];
  const clipped = [];
  const viewportWidth = document.documentElement.clientWidth;

  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        overflowing.push({
          selector,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          viewportWidth,
        });
      }
    }
  }

  for (const selector of ['.quick-entry-primary', '.quick-entry-secondary', '.search-bar', '.catalog-search-form', '.catalog-wall-shell']) {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      if (element.scrollWidth > element.clientWidth + 2) {
        clipped.push({
          selector,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        });
      }
    }
  }

	  return {
	    path: location.pathname,
	    scrollWidth: document.documentElement.scrollWidth,
	    clientWidth: document.documentElement.clientWidth,
	    bodyScrollWidth: document.body.scrollWidth,
	    overflowing,
	    clipped,
	    navActionCount: document.querySelectorAll('.site-actions :where(a, button)').length,
	    itemCellCount: document.querySelectorAll('.item-cell').length,
	    catalogWallCellCount: document.querySelectorAll('.catalog-wall-cell').length,
	    catalogSearchInputCount: document.querySelectorAll('.catalog-search-input').length,
	    catalogQuickFilterCount: document.querySelectorAll('.catalog-quick-filter-rail button').length,
	    catalogFocusTitle: document.querySelector('.catalog-floating-focus h3')?.textContent?.trim() ?? '',
	    catalogOldPanelCount: document.querySelectorAll('.catalog-layout, .filter-panel, .list-panel, .preview-panel, .item-grid, .pager').length,
	    itemFallbackCount: document.querySelectorAll('.item-art[data-fallback]').length,
	    itemImageCount: document.querySelectorAll('.catalog-screen .item-art img[src]').length,
	    itemFallbackOverlayIssues: [...document.querySelectorAll('.catalog-screen .item-art[data-fallback]')].flatMap((element) => {
	      const before = getComputedStyle(element, '::before');
	      const img = element.querySelector('img[src]');
	      const hasImageSource = Boolean(img);
	      const isFallback = element.classList.contains('is-fallback');
	      const beforeVisible = before.content !== 'none'
	        && before.content !== 'normal'
	        && before.display !== 'none'
	        && before.visibility !== 'hidden'
	        && Number(before.opacity) > 0.05;
	
	      if (hasImageSource && !isFallback && beforeVisible) {
	        return [{
	          fallback: element.getAttribute('data-fallback'),
	          content: before.content,
	          opacity: before.opacity,
	        }];
	      }
	
	      if (isFallback && !beforeVisible) {
	        return [{
	          fallback: element.getAttribute('data-fallback'),
	          issue: 'active fallback marker is hidden',
	        }];
	      }
	
	      return [];
	    }),
	    densityChoiceCount: document.querySelectorAll('.density-choice').length,
	    searchTypeCount: document.querySelectorAll('.search-type-chip').length,
	    searchSuggestionRows: document.querySelectorAll('.search-suggestion-row').length,
	    articleStageCount: document.querySelectorAll('.article-stage-node').length,
    categoryBranchCount: document.querySelectorAll('.category-branch-card').length,
    computedFont: getComputedStyle(document.body).fontFamily,
  };
})()`

const css = readFileSync(file('assets/css/app.css'), 'utf8')
const publicCss = [
  'assets/css/hifi-preview.css',
  'assets/css/mobile-typography-fixes.css',
  'assets/css/catalog-image-fixes.css',
  'assets/css/discovery-page-fixes.css',
].map((path) => readFileSync(file(path), 'utf8')).join('\n')
const itemsPage = readFileSync(file('pages/items/index.vue'), 'utf8')
const searchPage = readFileSync(file('pages/search.vue'), 'utf8')
const articlesPage = readFileSync(file('pages/articles/index.vue'), 'utf8')
const categoriesPage = readFileSync(file('pages/categories/index.vue'), 'utf8')
const failures = []

for (const marker of ['mobile-typography-fixes.css', 'catalog-image-fixes.css', 'discovery-page-fixes.css']) {
  if (!css.includes(marker)) {
    failures.push(`assets/css/app.css must import ${marker}`)
  }
}

for (const fontName of ['Noto Sans CJK SC', 'Source Han Sans SC', 'Microsoft YaHei', 'PingFang SC']) {
  if (!publicCss.includes(fontName)) {
    failures.push(`CSS font stack must include Chinese fallback ${fontName}`)
  }
}

if (!itemsPage.includes('in visibleWallItems') || !itemsPage.includes('data-fallback')) {
  failures.push('items page must render visibleWallItems with item-art data-fallback markers')
}

if (!itemsPage.includes('density-choice') || !itemsPage.includes('480')) {
  failures.push('items page must expose 120/240/480 density choices')
}

if (!itemsPage.includes('useAsyncData') || !itemsPage.includes('$fetch')) {
  failures.push('items page must load catalog data from /api/items instead of only static samples')
}

if (!itemsPage.includes('catalog-search-input') || !itemsPage.includes('v-model="searchQuery"')) {
  failures.push('items page must provide a working search input bound to page state')
}

if (!itemsPage.includes('@mouseenter="setFocusedItem(item)"') || !itemsPage.includes('@focus="setFocusedItem(item)"')) {
  failures.push('items page wall cells must update the focus card on hover and keyboard focus')
}

if (itemsPage.includes('class="catalog-layout"') || itemsPage.includes('class="filter-panel"') || itemsPage.includes('class="preview-panel"')) {
  failures.push('items page must not keep the previous three-panel catalog layout below the selected Pixel Gallery UI')
}

for (const marker of [
  'catalog-pixel-stage',
  'catalog-wall-shell',
  'catalog-wall-topbar',
  'catalog-floating-focus',
  'catalog-quick-filter-rail',
]) {
  if (!itemsPage.includes(marker)) {
    failures.push(`items page must implement selected Pixel Gallery layout marker ${marker}`)
  }
}

if (!searchPage.includes('search-type-chip') || !searchPage.includes('search-suggestion-row')) {
  failures.push('search page must include typed search chips and suggestion rows')
}

if (!articlesPage.includes('article-stage-node') || !articlesPage.includes('route-stage')) {
  failures.push('articles page must include route stage nodes')
}

if (!categoriesPage.includes('category-branch-card')) {
  failures.push('categories page must include category branch cards')
}

await waitFor(`${baseUrl}/`)

const browser = await connectToChrome(Number(process.env.CHROMIUM_REMOTE_DEBUGGING_PORT || 9251))

try {
  await browser.send('Page.enable')
  await browser.send('Runtime.enable')
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  })

  for (const route of ['/', '/items', '/search', '/articles', '/categories', '/user']) {
    await browser.send('Page.navigate', { url: `${baseUrl}${route}` })
    await sleep(650)
    const result = await browser.send('Runtime.evaluate', {
      expression: auditExpression,
      returnByValue: true,
    })
    const value = result.result.value

    if (value.scrollWidth > value.clientWidth + 2 || value.bodyScrollWidth > value.clientWidth + 2) {
      failures.push(`${route}: mobile page overflows horizontally: document=${value.scrollWidth}, body=${value.bodyScrollWidth}, viewport=${value.clientWidth}`)
    }

    if (value.overflowing.length > 0) {
      failures.push(`${route}: mobile visible elements overflow viewport: ${JSON.stringify(value.overflowing.slice(0, 5))}`)
    }

    if (value.clipped.length > 0) {
      failures.push(`${route}: mobile containers clip horizontal content: ${JSON.stringify(value.clipped.slice(0, 5))}`)
    }

	    if (route === '/items') {
	      if (value.catalogOldPanelCount > 0) {
	        failures.push(`/items: previous three-panel catalog layout is still rendered (${value.catalogOldPanelCount} old panel markers)`)
	      }

	      if (value.catalogWallCellCount < 80) {
	        failures.push(`/items: expected the Pixel Gallery wall to render at least 80 cells, got ${value.catalogWallCellCount}`)
	      }

	      if (value.catalogSearchInputCount !== 1) {
	        failures.push(`/items: expected exactly one working Pixel Gallery search input, got ${value.catalogSearchInputCount}`)
	      }

	      if (value.catalogQuickFilterCount < 5) {
	        failures.push(`/items: expected at least five Pixel Gallery quick filters, got ${value.catalogQuickFilterCount}`)
	      }
	
	      if (value.itemFallbackCount < value.catalogWallCellCount) {
	        failures.push('/items: every Pixel Gallery wall item should expose a data-fallback marker')
	      }

	      if (value.itemImageCount < value.catalogWallCellCount) {
	        failures.push(`/items: expected each Pixel Gallery cell to render an image element, got ${value.itemImageCount} images for ${value.catalogWallCellCount} cells`)
	      }

	      if (value.itemFallbackOverlayIssues.length > 0) {
	        failures.push(`/items: fallback overlay should not cover normal images: ${JSON.stringify(value.itemFallbackOverlayIssues.slice(0, 5))}`)
	      }
	
	      if (value.densityChoiceCount < 3) {
	        failures.push('/items: expected 120/240/480 density controls')
	      }

	      const interaction = await browser.send('Runtime.evaluate', {
	        expression: `(() => new Promise((resolve) => {
	          const flush = () => new Promise((done) => setTimeout(done, 80));
	          (async () => {
	            const initialTitle = document.querySelector('.catalog-floating-focus h3')?.textContent?.trim() ?? '';
	            const hoverTarget = [...document.querySelectorAll('.catalog-wall-cell')].find((element) => {
	              const label = element.getAttribute('aria-label') ?? '';
	              return label && !label.includes(initialTitle);
	            }) ?? document.querySelector('.catalog-wall-cell');
	            hoverTarget?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
	            hoverTarget?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
	            await flush();
	            const hoverTitle = document.querySelector('.catalog-floating-focus h3')?.textContent?.trim() ?? '';
	            const input = document.querySelector('.catalog-search-input');
	            if (input) {
	              input.value = '铁';
	              input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '铁' }));
	            }
	            await flush();
	            const afterSearchCount = document.querySelectorAll('.catalog-wall-cell').length;
	            const clearButton = document.querySelector('.catalog-clear-search');
	            clearButton?.click();
	            await flush();
	            const weaponButton = [...document.querySelectorAll('.catalog-quick-filter-rail button')].find((button) => button.textContent?.includes('武器'));
	            weaponButton?.click();
	            await flush();
	            resolve({
	              initialTitle,
	              hoverTitle,
	              hoverChanged: Boolean(hoverTitle && hoverTitle !== initialTitle),
	              searchInputValue: input?.value ?? '',
	              afterSearchCount,
	              activeFilterText: document.querySelector('.catalog-quick-filter-rail button.active')?.textContent?.trim() ?? '',
	              afterFilterCount: document.querySelectorAll('.catalog-wall-cell').length,
	            });
	          })();
	        }))()`,
	        awaitPromise: true,
	        returnByValue: true,
	      })
	      const interactionValue = interaction.result.value

	      if (!interactionValue.hoverChanged) {
	        failures.push(`/items: hovering/focusing a wall cell should update the floating focus card, got ${JSON.stringify(interactionValue)}`)
	      }

	      if (interactionValue.afterSearchCount <= 0 || interactionValue.afterSearchCount >= value.catalogWallCellCount) {
	        failures.push(`/items: search should reduce the wall to matching results, got ${JSON.stringify(interactionValue)}`)
	      }

	      if (interactionValue.searchInputValue !== '') {
	        failures.push('/items: clear search button should reset the search input')
	      }

	      if (!interactionValue.activeFilterText.includes('武器') || interactionValue.afterFilterCount <= 0 || interactionValue.afterFilterCount >= value.catalogWallCellCount) {
	        failures.push(`/items: quick filters should activate and reduce the wall, got ${JSON.stringify(interactionValue)}`)
	      }
    }

    if (route === '/search' && (value.searchTypeCount < 5 || value.searchSuggestionRows < 4)) {
      failures.push('/search: expected search type chips and suggestion rows')
    }

    if (route === '/articles' && value.articleStageCount < 4) {
      failures.push('/articles: expected at least four route stage nodes')
    }

    if (route === '/categories' && value.categoryBranchCount < 6) {
      failures.push('/categories: expected category branch cards')
    }
  }

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 960 },
    { width: 1181, height: 920 },
    { width: 1180, height: 920 },
  ]) {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await browser.send('Page.navigate', { url: `${baseUrl}/items` })
    await sleep(650)
    const desktopItems = await browser.send('Runtime.evaluate', {
      expression: `(() => new Promise((resolve) => {
        const roundRect = (rect) => ({
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
        const overlaps = (a, b) => !(
          a.left >= b.right
          || a.right <= b.left
          || a.top >= b.bottom
          || a.bottom <= b.top
        );
        const isVisible = (rect) => (
          rect.bottom > 0
          && rect.top < window.innerHeight
          && rect.right > 0
          && rect.left < document.documentElement.clientWidth
        );
        const inspect = (stage) => {
          const grid = document.querySelector('.catalog-wall-grid');
          const focus = document.querySelector('.catalog-floating-focus');
          if (!grid || !focus) {
            return {
              stage,
              missing: true,
              hasGrid: Boolean(grid),
              hasFocus: Boolean(focus),
            };
          }

          const gridRect = grid.getBoundingClientRect();
          const focusRect = focus.getBoundingClientRect();
          const visibleCellOverlaps = [...document.querySelectorAll('.catalog-wall-cell')]
            .map((element, index) => ({
              index,
              label: element.getAttribute('aria-label') ?? '',
              rect: element.getBoundingClientRect(),
            }))
            .filter((entry) => isVisible(entry.rect) && overlaps(entry.rect, focusRect))
            .map((entry) => ({
              index: entry.index,
              label: entry.label,
              rect: roundRect(entry.rect),
            }));

          return {
            stage,
            missing: false,
            intersectsGrid: overlaps(gridRect, focusRect),
            visibleCellOverlapCount: visibleCellOverlaps.length,
            visibleCellOverlaps: visibleCellOverlaps.slice(0, 5),
            grid: roundRect(gridRect),
            focus: roundRect(focusRect),
            shellDisplay: getComputedStyle(document.querySelector('.catalog-wall-shell')).display,
            focusPosition: getComputedStyle(focus).position,
          };
        };

        const initial = inspect('initial');
        const grid = document.querySelector('.catalog-wall-grid');
        if (grid) {
          const rect = grid.getBoundingClientRect();
          const targetY = rect.top + window.scrollY + Math.min(420, Math.max(0, rect.height - window.innerHeight / 2));
          window.scrollTo(0, targetY);
        }

        requestAnimationFrame(() => setTimeout(() => {
          resolve({
            viewport: {
              width: document.documentElement.clientWidth,
              height: window.innerHeight,
            },
            initial,
            scrolled: inspect('scrolled'),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
          });
        }, 120));
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    })
    const desktopItemsValue = desktopItems.result.value
    const captures = [desktopItemsValue.initial, desktopItemsValue.scrolled]

    for (const capture of captures) {
      if (capture.missing) {
        failures.push(`/items: desktop overlap check could not find required nodes at ${viewport.width}px/${capture.stage}: ${JSON.stringify(capture)}`)
      } else if (capture.intersectsGrid || capture.visibleCellOverlapCount > 0) {
        failures.push(`/items: focus card must not cover the item wall at ${viewport.width}px/${capture.stage}: ${JSON.stringify(capture)}`)
      }
    }

    if (
      desktopItemsValue.scrollWidth > desktopItemsValue.clientWidth + 2
      || desktopItemsValue.bodyScrollWidth > desktopItemsValue.clientWidth + 2
    ) {
      failures.push(`/items: desktop page overflows horizontally at ${viewport.width}px: document=${desktopItemsValue.scrollWidth}, body=${desktopItemsValue.bodyScrollWidth}, viewport=${desktopItemsValue.clientWidth}`)
    }
  }
} finally {
  browser.ws.close()
  browser.chrome.kill('SIGTERM')
}

if (failures.length > 0) {
  console.error(`Visual regression checks failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Visual regression checks passed for mobile layout, catalog density, fallbacks, and discovery pages.')
