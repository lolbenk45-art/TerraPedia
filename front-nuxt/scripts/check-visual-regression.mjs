import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const root = new URL('..', import.meta.url)
const repoRoot = new URL('..', root)
const file = (path) => new URL(path, root)
const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5176'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const checkLocalAssetLeaks = process.env.CHECK_LOCAL_ASSET_LEAKS === '1'
const cdpCommandTimeoutMs = Number(process.env.VISUAL_CDP_TIMEOUT_MS || 15000)
const visualReportDir = new URL('reports/front-nuxt/visual-quality/', repoRoot)
const screenshotDir = new URL('screenshots/', visualReportDir)
const failureReportPath = new URL('failures-2026-05-24.json', visualReportDir)
const blockingFailures = []
const warnings = []
const screenshotRecords = []
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const screenshotRunDir = new URL(`${runId}/`, screenshotDir)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const slugForPath = (value) => value
  .replace(/^https?:\/\//, '')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()
  || 'root'

const inferFailureMeta = (message) => {
  const routeMatch = message.match(/^(\/[^:]*):\s*(.*)$/)
  const route = routeMatch?.[1] ?? null
  const detail = routeMatch?.[2] ?? message
  const family = route?.startsWith('/items') || detail.includes('items page') || detail.includes('catalog')
    ? 'items'
    : route?.startsWith('/crafting')
      ? 'crafting'
      : route?.startsWith('/npcs') || route?.startsWith('/bosses') || route?.startsWith('/buffs') || route?.startsWith('/biomes') || route?.startsWith('/armor-sets') || route?.startsWith('/projectiles')
        ? 'entities'
        : route?.startsWith('/search') || route?.startsWith('/articles') || route?.startsWith('/categories')
          ? 'discovery'
          : route === '/__missing-terrapedia-page'
            ? 'error'
          : 'static'
  const category = /overflow|clip/i.test(detail)
    ? 'overflow'
    : /overlap/i.test(detail)
      ? 'overlap'
      : /broken image|broken images/i.test(detail)
        ? 'broken-image'
        : /touch target|below 44px/i.test(detail)
          ? 'touch-target'
          : /h1/i.test(detail)
            ? 'heading'
            : /copy|wording|debug|fixture|mock|TODO|lorem/i.test(detail)
              ? 'copy'
              : /screenshot/i.test(detail)
                ? 'screenshot'
                : /image|asset|source/i.test(detail)
                  ? 'image'
                  : /Runtime\.evaluate|DevTools|timeout|failed|threw/i.test(detail)
                    ? 'runtime'
                    : 'visual'

  return {
    route,
    family,
    category,
    assertion: detail.split(':')[0].slice(0, 96),
  }
}

const recordFailure = (message, details = {}) => {
  const meta = inferFailureMeta(message)
  const failure = {
    severity: 'blocking',
    message,
    selector: null,
    screenshotPath: null,
    ...meta,
    ...details,
  }
  blockingFailures.push(failure)
  return failure
}

const recordWarning = (message, details = {}) => {
  const meta = inferFailureMeta(message)
  warnings.push({
    severity: 'warning',
    message,
    selector: null,
    screenshotPath: null,
    ...meta,
    ...details,
  })
}

const failures = {
  push: recordFailure,
  get length() {
    return blockingFailures.length
  },
  map(callback) {
    return blockingFailures.map((failure, index) => callback(failure.message, index, blockingFailures))
  },
}

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

const publicRouteMatrix = [
  { route: '/', family: 'shell', viewports: ['mobile', 'tablet'] },
  { route: '/__missing-terrapedia-page', family: 'shell', viewports: ['mobile', 'tablet'] },
  { route: '/search', family: 'discovery', viewports: ['mobile'] },
  { route: '/articles', family: 'discovery', viewports: ['mobile'] },
  { route: '/categories', family: 'discovery', viewports: ['mobile'] },
  { route: '/categories/weapons', family: 'discovery', viewports: ['mobile'] },
  { route: '/about', family: 'discovery', viewports: ['mobile'] },
  { route: '/items', family: 'items', viewports: ['mobile', 'desktop', 'wide'] },
  { route: '/items/1', family: 'item-detail', viewports: ['mobile'] },
  { route: '/crafting', family: 'crafting', viewports: ['mobile', 'desktop', 'wide'] },
  { route: '/crafting?itemId=675&maxDepth=3', family: 'crafting', viewports: ['mobile', 'desktop', 'wide'] },
  { route: '/npcs', family: 'entity-index', viewports: ['mobile'] },
  { route: '/bosses', family: 'entity-index', viewports: ['mobile'] },
  { route: '/buffs', family: 'entity-index', viewports: ['mobile'] },
  { route: '/biomes', family: 'entity-index', viewports: ['mobile'] },
  { route: '/armor-sets', family: 'entity-index', viewports: ['mobile', 'desktop'] },
  { route: '/projectiles', family: 'entity-index', viewports: ['mobile', 'desktop'] },
]

const nonPublicPreviewRoutes = [
  '/search-tool',
  '/home-hero-options',
  '/user',
  '/user/login',
  '/user/register',
  '/user/articles',
  '/user/articles/new',
  '/user/favorites',
  '/user/settings',
]

const viewportPresets = {
  mobile: { width: 390, height: 900, mobile: true },
  tablet: { width: 768, height: 1024, mobile: false },
  desktop: { width: 1440, height: 1000, mobile: false },
  wide: { width: 1728, height: 1050, mobile: false },
}

const setViewport = async (browser, viewportName) => {
  const viewport = viewportPresets[viewportName]
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  })
}

const writeFailureReport = () => {
  mkdirSync(visualReportDir, { recursive: true })
  writeFileSync(failureReportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    runId,
    checkLocalAssetLeaks,
    failureCount: blockingFailures.length,
    warningCount: warnings.length,
    screenshotCount: screenshotRecords.length,
    failures: blockingFailures,
    warnings,
    screenshots: screenshotRecords,
  }, null, 2)}\n`)
}

const captureScreenshot = async (browser, route, viewportName, reason) => {
  try {
    mkdirSync(screenshotRunDir, { recursive: true })
    const screenshot = await browser.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })
    const name = `${String(screenshotRecords.length + 1).padStart(3, '0')}-${viewportName}-${slugForPath(route)}.png`
    const path = new URL(name, screenshotRunDir)
    writeFileSync(path, Buffer.from(screenshot.data, 'base64'))
    const reportPath = `reports/front-nuxt/visual-quality/screenshots/${runId}/${name}`
    screenshotRecords.push({
      route,
      viewport: viewportName,
      reason,
      path: reportPath,
    })
    return reportPath
  } catch (error) {
    recordWarning(`${route}: failed to capture screenshot for ${viewportName}`, {
      assertion: 'screenshot capture',
      viewport: viewportName,
      error: String(error?.message ?? error),
    })
    return null
  }
}

const attachScreenshotToFailures = (fromIndex, screenshotPath) => {
  if (!screenshotPath) return

  for (const failure of blockingFailures.slice(fromIndex)) {
    failure.screenshotPath = failure.screenshotPath || screenshotPath
  }
}

const evaluateJson = async (browser, expression, context) => {
  let result
  try {
    result = await browser.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
  } catch (error) {
    recordFailure(`${context.route}: ${context.label} Runtime.evaluate failed`, {
      route: context.route,
      family: context.family,
      viewport: context.viewport,
      assertion: context.label,
      error: String(error?.message ?? error),
    })
    return null
  }

  const value = result?.result?.value
  if (value === undefined) {
    recordFailure(`${context.route}: ${context.label} returned no serializable value`, {
      route: context.route,
      family: context.family,
      viewport: context.viewport,
      assertion: context.label,
      remoteResult: result?.result ?? null,
      exceptionDetails: result?.exceptionDetails ?? null,
    })
    return null
  }

  return value
}

const navigateAndAudit = async (browser, routeConfig, viewportName) => {
  const previousCount = failures.length

  try {
    await setViewport(browser, viewportName)
    if (routeConfig.route === '/items') {
      await browser.send('Runtime.evaluate', {
        expression: `localStorage.removeItem('terrapedia:catalog-page-size')`,
      })
    }

    await browser.send('Page.navigate', { url: `${baseUrl}${routeConfig.route}` })
    await sleep(650)

    if (routeConfig.route === '/items') {
      const hydrated = await waitForItemsHydration(browser)
      if (!hydrated) {
        failures.push('/items: timed out waiting for live catalog hydration')
      }
    }

    if (routeConfig.route.startsWith('/items/')) {
      await waitForItemDetailHydration(browser)
    }

    if (routeConfig.family === 'entity-index') {
      await evaluateJson(browser, `(() => new Promise((resolve) => {
        const cardSelector = '.npc-card, .boss-card, .boss-node, .buff-card, .effect-card, .biome-card, .biome-tile, .armor-card-live, .projectile-card';
        const emptySelector = '.catalog-empty-state, .entity-mini-panel, .search-suggestion-band.support-panel, .armor-layout > .search-suggestion-band';
        const startedAt = Date.now();
        const hasIntentionalEmptyState = () => [...document.querySelectorAll(emptySelector)]
          .some((element) => /没有|暂未载入|重新加载|重置|等待/.test(element.textContent || ''));
        const tick = () => {
          const cardCount = document.querySelectorAll(cardSelector).length;
          const emptyState = hasIntentionalEmptyState();
          const busy = document.querySelector('.entity-screen main')?.getAttribute('aria-busy') === 'true';
          if ((cardCount > 0 || emptyState) && !busy) {
            resolve({ cardCount, emptyState, timedOut: false });
            return;
          }
          if (Date.now() - startedAt > 2600) {
            resolve({ cardCount, emptyState, busy, timedOut: true });
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      }))()`, {
        route: routeConfig.route,
        family: routeConfig.family,
        viewport: viewportName,
        label: 'entity index hydration wait',
      })
    }

    const value = await evaluateJson(browser, auditExpression, {
      route: routeConfig.route,
      family: routeConfig.family,
      viewport: viewportName,
      label: 'generic visual audit',
    })

    if (!value) {
      const screenshotPath = await captureScreenshot(browser, routeConfig.route, viewportName, 'generic visual audit failed')
      attachScreenshotToFailures(previousCount, screenshotPath)
      return null
    }

    assertGenericRoute(routeConfig, viewportName, value)
    assertRouteFamily(routeConfig, viewportName, value)

    if (failures.length > previousCount) {
      const screenshotPath = await captureScreenshot(browser, routeConfig.route, viewportName, 'blocking visual assertion failed')
      attachScreenshotToFailures(previousCount, screenshotPath)
    }

    return value
  } catch (error) {
    recordFailure(`${routeConfig.route}: ${viewportName} route audit failed`, {
      route: routeConfig.route,
      family: routeConfig.family,
      viewport: viewportName,
      assertion: 'route audit',
      category: 'runtime',
      error: String(error?.stack ?? error?.message ?? error),
    })
    const screenshotPath = await captureScreenshot(browser, routeConfig.route, viewportName, 'route audit failed')
    attachScreenshotToFailures(previousCount, screenshotPath)
    return null
  }
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
      const commandId = id
      const timeout = setTimeout(() => {
        if (!callbacks.has(commandId)) {
          return
        }

        callbacks.delete(commandId)
        reject(new Error(`Timed out waiting for Chrome DevTools command ${method}`))
      }, cdpCommandTimeoutMs)
      callbacks.set(commandId, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
      ws.send(JSON.stringify({ id, method, params }))
    })

    return { chrome, send, ws }
  } catch (error) {
    chrome.kill('SIGTERM')
    throw error
  }
}

const waitForItemsHydration = async (browser) => {
  const result = await browser.send('Runtime.evaluate', {
    expression: `(() => new Promise((resolve) => {
      const startedAt = Date.now();
      const hasLiveData = () => document.querySelector('.catalog-pixel-stage')?.getAttribute('data-source') === 'api';
      const hasLoadedCells = () => document.querySelectorAll('.catalog-wall-cell:not(.catalog-wall-cell-loading)').length > 0;
      const tick = () => {
        if (hasLiveData() && hasLoadedCells()) {
          resolve(true);
          return;
        }

        if (Date.now() - startedAt > 6000) {
          resolve(false);
          return;
        }

        setTimeout(tick, 100);
      };

      tick();
    }))()`,
    awaitPromise: true,
    returnByValue: true,
  })

  return Boolean(result.result.value)
}

const waitForItemDetailHydration = async (browser) => {
  const result = await browser.send('Runtime.evaluate', {
    expression: `(() => new Promise((resolve) => {
      const startedAt = Date.now();
      const tick = () => {
        const bodyText = document.body.innerText;
        const title = document.querySelector('.detail-screen h1')?.textContent?.trim() ?? '';
        const pending = bodyText.includes('同步中');
        const missing = bodyText.includes('没有找到这个物品');
        const hasDetail = Boolean(document.querySelector('.detail-hero') && document.querySelector('.evidence-panel'));

        if (title && hasDetail && !pending && !missing) {
          resolve(true);
          return;
        }

        if (Date.now() - startedAt > 6000) {
          resolve(false);
          return;
        }

        setTimeout(tick, 100);
      };

      tick();
    }))()`,
    awaitPromise: true,
    returnByValue: true,
  })

  return Boolean(result.result.value)
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
    '.exploration-map .map-node',
    '.crafting-layout',
    '.crafting-workbench',
    '.recipe-tree-stage',
    '.recipe-top-card',
    '.entity-screen',
    '.entity-head',
    '.npc-card',
    '.boss-card',
    '.buff-card',
    '.biome-card',
    '.armor-card',
    '.projectile-card',
    '.search-suggestion-band',
    '.article-stage-node',
    '.category-branch-card',
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
  const body = document.body;
  const viewportWidth = document.documentElement.clientWidth;
  const blockedImageSources = [...document.querySelectorAll('img[src], .item-art[style*="background-image"], [data-source-image]')].flatMap((element, index) => {
    const selector = element.id
      ? '#' + CSS.escape(element.id)
      : element.className && typeof element.className === 'string'
        ? element.tagName.toLowerCase() + '.' + element.className.trim().split(/\\s+/).slice(0, 3).map((name) => CSS.escape(name)).join('.')
        : element.tagName.toLowerCase();
    const candidates = [
      { kind: 'src', value: element.getAttribute('src') || '' },
      { kind: 'style', value: element.getAttribute('style') || '' },
      { kind: 'data-source-image', value: element.getAttribute('data-source-image') || '' },
    ];
    return candidates
      .filter((candidate) => candidate.value.includes('localhost:9000') || candidate.value.includes('terraria.wiki.gg'))
      .map((candidate) => ({
        index,
        selector,
        kind: candidate.kind,
        source: candidate.value.slice(0, 500),
        src: (element.getAttribute('src') || '').slice(0, 500),
        dataSourceImage: (element.getAttribute('data-source-image') || '').slice(0, 500),
      }));
  });

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

  for (const selector of ['.quick-entry-primary', '.quick-entry-secondary', '.search-bar', '.catalog-search-form', '.catalog-wall-shell', '.crafting-command', '.crafting-workbench', '.entity-filters', '.catalog-control-summary']) {
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
  const imageSlotIssues = [...document.querySelectorAll('.tp-preview-image, .npc-detail-portrait, .boss-detail-portrait, .buff-detail-hero, .biome-scan, .armor-stage')].flatMap((slot, index) => {
    if (!visible(slot)) return [];
    const image = slot.querySelector('img[src]');
    if (!image) return [];
    const slotRect = slot.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const issues = [];
    if (getComputedStyle(image).objectFit && getComputedStyle(image).objectFit !== 'contain') {
      issues.push('image object-fit is ' + getComputedStyle(image).objectFit);
    }
    const slotOverflow = getComputedStyle(slot).overflow;
    const clipSlot = slot.closest('.tp-preview-image') || slot;
    const clipSlotRect = clipSlot.getBoundingClientRect();
    const clipSlotOverflow = getComputedStyle(clipSlot).overflow;
    if (
      !['hidden', 'clip'].includes(slotOverflow)
      && !['hidden', 'clip'].includes(clipSlotOverflow)
      && (imageRect.left < clipSlotRect.left - 1 || imageRect.right > clipSlotRect.right + 1 || imageRect.top < clipSlotRect.top - 1 || imageRect.bottom > clipSlotRect.bottom + 1)
    ) {
      issues.push('image overflows containing slot');
    }
    return issues.map((issue) => ({ index, issue, slot: roundRect(slotRect), clipSlot: roundRect(clipSlotRect), image: roundRect(imageRect) }));
  });
  const recipeTreeIssues = [...document.querySelectorAll('.recipe-node-card, .recipe-top-card, .recipe-top-result, .recipe-top-materials a, .recipe-station-chip')].flatMap((node, index) => {
    if (!visible(node)) return [];
    const nodeRect = node.getBoundingClientRect();
    const image = node.querySelector('.tp-preview-image, .item-art, img');
    const label = [...node.querySelectorAll('b, span, em, small')]
      .find((element) => !element.closest('.tp-preview-image, .item-art'));
    const imageRect = image?.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    const issues = [];
    if (node.scrollWidth > node.clientWidth + 2) {
      issues.push('recipe branch row overflows horizontally');
    }
    if (imageRect && labelRect && overlaps(imageRect, labelRect)) {
      issues.push('recipe image overlaps text');
    }
    return issues.map((issue) => ({ index, issue, node: roundRect(nodeRect), image: imageRect ? roundRect(imageRect) : null, label: labelRect ? roundRect(labelRect) : null }));
  });
  const rootRecipeTargetRect = document.querySelector('.recipe-top-result, .recipe-node-card.root')?.getBoundingClientRect() ?? null;
  const relationTextWrapIssues = [...document.querySelectorAll('.evidence-panel, .source-row, .recipe-node, .npc-detail-panel, .boss-detail-panel, .buff-detail-panel, .biome-detail-panel')].flatMap((element, index) => {
    if (!visible(element)) return [];
    return element.scrollWidth > element.clientWidth + 2 ? [{ index, selector: element.className || element.tagName, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }] : [];
  });
  const previewFakeAccountControlCount = [...document.querySelectorAll('a, button')].filter((element) => /登录|注册|收藏|设置|发布|新建/.test(element.textContent ?? '')).length;
  const visibleH1Count = [...document.querySelectorAll('h1')].filter(visible).length;
  const smallTouchTargets = [...document.querySelectorAll('.site-nav a[href], .site-nav button, .primary-button, .secondary-button, .small-button, .catalog-clear-search, .catalog-category-chip, .catalog-density-chip, .catalog-dock-button, .catalog-dock-icon-button, .catalog-dock-page-button, .entity-filter, .pager a, .pager button, .pagination-dock a, .pagination-dock button, .catalog-page-dock a, .catalog-page-dock button')].flatMap((element) => {
    if (!visible(element)) return [];
    const rect = element.getBoundingClientRect();
    return rect.width < 44 || rect.height < 44
      ? [{ text: element.textContent?.trim().slice(0, 40) ?? '', selector: element.className || element.tagName, width: Math.round(rect.width), height: Math.round(rect.height) }]
      : [];
  });

	    return {
	    path: location.pathname,
	    search: location.search,
	    scrollWidth: document.documentElement.scrollWidth,
	    clientWidth: document.documentElement.clientWidth,
		    bodyScrollWidth: body?.scrollWidth ?? document.documentElement.scrollWidth,
	    overflowing,
	    clipped,
	    navActionCount: document.querySelectorAll('.site-actions :where(a, button)').length,
	    itemCellCount: document.querySelectorAll('.item-cell').length,
	    catalogWallCellCount: document.querySelectorAll('.catalog-wall-cell').length,
	    catalogSearchInputCount: document.querySelectorAll('.catalog-search-input').length,
	    catalogQuickFilterCount: document.querySelectorAll('.catalog-category-chip').length,
		    catalogFocusTitle: document.querySelector('.catalog-floating-focus h3')?.textContent?.trim() ?? '',
		    catalogFocusedDetailHref: document.querySelector('.catalog-floating-focus a[href^="/items/"]')?.getAttribute('href') ?? '',
		    catalogFloatingFocusCount: document.querySelectorAll('.catalog-floating-focus').length,
			    catalogHoverPreviewCount: document.querySelectorAll('.catalog-hover-preview').length,
				    catalogPageButtonCount: document.querySelectorAll('.catalog-dock-page-button').length,
				    catalogJumpInputCount: document.querySelectorAll('.catalog-dock-jump-form input').length,
					    catalogStickyRailPosition: getComputedStyle(document.querySelector('.catalog-page-dock') ?? body ?? document.documentElement).position,
				    catalogFirstLastButtonCount: [...document.querySelectorAll('.catalog-page-dock button')]
			      .filter((button) => /首页|末页/.test(button.textContent ?? ''))
			      .length,
				    densityRailBeforeContent: getComputedStyle(document.querySelector('.catalog-page-dock-summary') ?? body ?? document.documentElement, '::before').content,
			    catalogDataSourceAttribute: document.querySelector('.catalog-pixel-stage')?.getAttribute('data-source') ?? '',
			    catalogDataSourceText: [...document.querySelectorAll('.catalog-screen .eyebrow, .catalog-control-summary strong')]
		      .map((element) => element.textContent?.trim() ?? '')
		      .join(' '),
		    catalogDebugTextLeakCount: [...document.querySelectorAll('.catalog-screen .eyebrow, .catalog-control-summary strong')]
		      .filter((element) => /实时接口|本地兜底|兜底/.test(element.textContent ?? ''))
		      .length,
	    catalogOldPanelCount: document.querySelectorAll('.catalog-layout, .filter-panel, .list-panel, .preview-panel, .item-grid, .pager').length,
		    itemFallbackCount: document.querySelectorAll('.item-art[data-fallback]').length,
		    itemImageCount: document.querySelectorAll('.catalog-screen .item-art img[src]').length,
		    itemActiveFallbackCount: document.querySelectorAll('.catalog-screen .item-art.is-fallback').length,
		    catalogIconLayoutIssues: [...document.querySelectorAll('.catalog-wall-cell')].slice(0, 24).flatMap((cell, index) => {
		      const art = cell.querySelector('.item-art');
		      const img = art?.querySelector('img[src]');
		      const label = cell.querySelector('.catalog-wall-cell-label');
		      const number = cell.querySelector('.catalog-wall-cell-index');
		      const imageWidth = img?.getAttribute('width');
		      const imageHeight = img?.getAttribute('height');
		      if (!art || !label || !number) {
		        return [{ index, issue: 'missing icon, label, or index element' }];
		      }
		      const artRect = art.getBoundingClientRect();
		      const cellRect = cell.getBoundingClientRect();
		      const cellStyle = getComputedStyle(cell);
		      const contentLeft = cellRect.left + Number.parseFloat(cellStyle.paddingLeft || '0');
		      const contentRight = cellRect.right - Number.parseFloat(cellStyle.paddingRight || '0');
		      const labelRect = label.getBoundingClientRect();
		      const numberRect = number.getBoundingClientRect();
		      const overlaps = (a, b) => !(
		        a.left >= b.right
		        || a.right <= b.left
		        || a.top >= b.bottom
		        || a.bottom <= b.top
		      );
		      const issues = [];
		      if (cell.getBoundingClientRect().height < 142) {
		        issues.push('cell too short for separated icon and label');
		      }
		      if (getComputedStyle(label).display !== 'none') {
		        const labelFontSize = Number.parseFloat(getComputedStyle(label).fontSize || '0');
		        const indexFontSize = Number.parseFloat(getComputedStyle(number).fontSize || '0');
		        if (labelFontSize < 11) {
		          issues.push('label text below readable size ' + labelFontSize);
		        }
		        if (indexFontSize < 11) {
		          issues.push('index text below readable size ' + indexFontSize);
		        }
		      }
		      if (artRect.width < 96 || artRect.height < 96) {
		        issues.push('icon slot too small ' + Math.round(artRect.width) + 'x' + Math.round(artRect.height));
		      }
		      if (getComputedStyle(art).overflow !== 'hidden') {
		        issues.push('icon art does not constrain oversized sprites');
		      }
		      if (artRect.left < contentLeft - 1 || artRect.right > contentRight + 1) {
		        issues.push('icon frame overflows cell content');
		      }
		      if (overlaps(artRect, labelRect)) {
		        issues.push('icon overlaps label');
		      }
		      if (overlaps(artRect, numberRect)) {
		        issues.push('icon overlaps index');
		      }
		      if (img && getComputedStyle(img).objectFit !== 'contain') {
		        issues.push('image object-fit is ' + getComputedStyle(img).objectFit);
		      }
		      if (img) {
		        if (!imageWidth || !imageHeight) {
		          issues.push('image lacks intrinsic width/height attributes');
		        }
		        const imgRect = img.getBoundingClientRect();
		        if (imgRect.left < artRect.left - 1 || imgRect.right > artRect.right + 1 || imgRect.top < artRect.top - 1 || imgRect.bottom > artRect.bottom + 1) {
		          issues.push('image overflows sprite frame');
		        }
		        if (imgRect.width > artRect.width - 40 || imgRect.height > artRect.height - 40) {
		          issues.push('image has no protective inset');
		        }
		      }
		      return issues.map((issue) => ({
		        index,
		        label: cell.getAttribute('aria-label') ?? '',
		        issue,
		        art: {
		          width: Math.round(artRect.width),
		          height: Math.round(artRect.height),
		          top: Math.round(artRect.top),
		          bottom: Math.round(artRect.bottom),
		        },
		        labelRect: {
		          top: Math.round(labelRect.top),
		          bottom: Math.round(labelRect.bottom),
		        },
		      }));
		    }),
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
	    brokenImageCount: [...document.images].filter((image) => image.currentSrc && image.naturalWidth === 0).length,
	    blockedImageSources,
	    blockedImageSourceCount: blockedImageSources.length,
    localAssetLeakCount: [...document.querySelectorAll('link[href], script[src], img[src]')].filter((element) => {
      const source = element.href || element.src || '';
      const url = new URL(source, location.href);
      const isNuxtDevModule = url.pathname.startsWith('/_nuxt/home/lolben/')
        || url.pathname.startsWith('/_nuxt/@fs/home/lolben/');
      return source.includes('/home/lolben/') && !isNuxtDevModule;
	    }).length,
	    h1Count: visibleH1Count,
	    hiddenFocusableMenuCount: [...document.querySelectorAll('.nav-menu-panel:not(.is-open) a, .account-menu-panel:not(.is-open) a')].filter((element) => element.tabIndex >= 0).length,
	    accountMenuPanelRect: (() => {
	      const panel = document.querySelector('.account-menu-panel');
	      if (!panel) return null;
	      panel.classList.add('is-open');
	      const rect = panel.getBoundingClientRect();
	      const value = {
	        left: Math.round(rect.left),
	        right: Math.round(rect.right),
	        width: Math.round(rect.width),
	        viewportWidth: document.documentElement.clientWidth,
	      };
	      panel.classList.remove('is-open');
	      return value;
	    })(),
	    navMenuPanelRect: (() => {
	      const panel = document.querySelector('.nav-menu-panel');
	      if (!panel) return null;
	      panel.classList.add('is-open');
	      const rect = panel.getBoundingClientRect();
	      const value = {
	        left: Math.round(rect.left),
	        right: Math.round(rect.right),
	        width: Math.round(rect.width),
	        viewportWidth: document.documentElement.clientWidth,
	      };
	      panel.classList.remove('is-open');
	      return value;
	    })(),
	    siteNavHeight: Math.round(document.querySelector('.site-nav')?.getBoundingClientRect().height ?? 0),
	    firstCatalogCellTop: Math.round(document.querySelector('.catalog-wall-cell')?.getBoundingClientRect().top ?? 0),
	    entityHeroImageIssueCount: [...document.querySelectorAll('.npc-detail-portrait img, .boss-detail-portrait img, .buff-detail-hero img, .entity-preview-dark img')].filter((image) => {
	      return !image.complete
	        || image.naturalWidth <= 0
	        || image.naturalHeight <= 0;
	    }).length,
	    smallTouchTargets,
	    smallTouchTargetCount: smallTouchTargets.length,
		    densityChoiceCount: document.querySelectorAll('.catalog-density-chip').length,
	    searchTypeCount: document.querySelectorAll('.search-type-chip').length,
	    searchSuggestionRows: document.querySelectorAll('.search-suggestion-row').length,
	    realSearchInputCount: document.querySelectorAll('input[type="search"]').length,
	    articleStageCount: document.querySelectorAll('.article-stage-node').length,
    categoryBranchCount: document.querySelectorAll('.category-branch-card').length,
    routeNodeCount: document.querySelectorAll('.article-stage-node, .category-branch-card, .search-suggestion-row').length,
	    entitySearchInputCount: document.querySelectorAll('.entity-screen input[type="search"], .entity-screen .catalog-search-input').length,
	    entityCardCount: document.querySelectorAll('.npc-card, .boss-card, .boss-node, .buff-card, .effect-card, .biome-card, .biome-tile, .armor-card-live, .projectile-card').length,
    entityCardImageSlotIssues: [...document.querySelectorAll('.npc-card .tp-preview-image, .boss-node .tp-preview-image, .effect-card .tp-preview-image, .biome-tile .tp-preview-image, .armor-card-live .tp-preview-image, .projectile-card .tp-preview-image')].flatMap((slot, index) => {
      if (!visible(slot)) return [];
      const image = slot.querySelector('img[src]');
      if (!image) return [];
      const slotRect = slot.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const tolerance = 8;
      return imageRect.left < slotRect.left - tolerance || imageRect.right > slotRect.right + tolerance || imageRect.top < slotRect.top - tolerance || imageRect.bottom > slotRect.bottom + tolerance
        ? [{ index, slot: roundRect(slotRect), image: roundRect(imageRect) }]
        : [];
    }),
    entityPageControlCount: document.querySelectorAll('.pager a, .pager button, .pagination-dock a, .pagination-dock button, .pagination-dock input, .catalog-page-dock a, .catalog-page-dock button, .catalog-page-dock input').length,
    entityEmptyStateCount: [...document.querySelectorAll('.catalog-empty-state, .entity-mini-panel, .search-suggestion-band.support-panel, .search-suggestion-band .support-panel, .armor-layout > .search-suggestion-band')].filter((element) => /没有|暂未载入|重新加载|重置|等待/.test(element.textContent || '')).length,
    imageSlotIssues,
    recipeTreeIssues,
    rootRecipeTargetTop: rootRecipeTargetRect ? Math.round(rootRecipeTargetRect.top) : null,
    rootRecipeTargetVisible: rootRecipeTargetRect ? rootRecipeTargetRect.top < window.innerHeight && rootRecipeTargetRect.bottom > 0 : false,
    relationTextWrapIssues,
    previewFakeAccountControlCount,
    bodyText: (body?.innerText ?? '').slice(0, 20000),
    computedFont: getComputedStyle(body ?? document.documentElement).fontFamily,
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
const publicItemsComposable = readFileSync(file('composables/usePublicItems.ts'), 'utf8')

const assertGenericRoute = (routeConfig, viewportName, value) => {
  const route = routeConfig.route
  const prefix = `${route}: ${viewportName}`
  const blockedImageSources = value.blockedImageSources || []

  if (value.scrollWidth > value.clientWidth + 2 || value.bodyScrollWidth > value.clientWidth + 2) {
    failures.push(`${prefix} page overflows horizontally: document=${value.scrollWidth}, body=${value.bodyScrollWidth}, viewport=${value.clientWidth}`)
  }

  if (value.overflowing.length > 0) {
    failures.push(`${prefix} visible elements overflow viewport: ${JSON.stringify(value.overflowing.slice(0, 5))}`)
  }

  if (value.clipped.length > 0) {
    failures.push(`${prefix} containers clip horizontal content: ${JSON.stringify(value.clipped.slice(0, 5))}`)
  }

  if (value.h1Count !== 1) {
    failures.push(`${prefix} expected exactly one visible h1, got ${value.h1Count}`)
  }

  if (value.brokenImageCount > 0) {
    failures.push(`${prefix} page renders broken images (${value.brokenImageCount})`)
  }

  if (blockedImageSources.length > 0) {
    for (const source of blockedImageSources.slice(0, 8)) {
      recordFailure(`${prefix} page still references blocked external/local image source via ${source.kind}`, {
        route,
        family: routeConfig.family,
        viewport: viewportName,
        category: 'image',
        assertion: 'blocked external/local image source',
        selector: source.selector ?? null,
        sourceKind: source.kind ?? null,
        source: source.source ?? null,
        src: source.src ?? null,
        dataSourceImage: source.dataSourceImage ?? null,
        elementIndex: source.index ?? null,
      })
    }

    if (blockedImageSources.length > 8) {
      recordFailure(`${prefix} page still references blocked external/local image sources (${blockedImageSources.length})`, {
        route,
        family: routeConfig.family,
        viewport: viewportName,
        category: 'image',
        assertion: 'blocked external/local image source',
        blockedImageSourceCount: blockedImageSources.length,
      })
    }
  } else if (value.blockedImageSourceCount > 0) {
    recordFailure(`${prefix} page still references blocked external/local image sources (${value.blockedImageSourceCount})`, {
      route,
      family: routeConfig.family,
      viewport: viewportName,
      category: 'image',
      assertion: 'blocked external/local image source',
      blockedImageSourceCount: value.blockedImageSourceCount,
    })
  }

  if (checkLocalAssetLeaks && value.localAssetLeakCount > 0) {
    failures.push(`${prefix} page leaks local filesystem asset URLs (${value.localAssetLeakCount})`)
  }

  if (value.hiddenFocusableMenuCount > 0) {
    failures.push(`${prefix} closed nav/account menu contains focusable links (${value.hiddenFocusableMenuCount})`)
  }

  if (value.siteNavHeight > 190 && viewportName === 'mobile') {
    failures.push(`${prefix} shared nav should stay compact, got ${value.siteNavHeight}px`)
  }

  if (
    value.accountMenuPanelRect
    && (
      value.accountMenuPanelRect.left < 0
      || value.accountMenuPanelRect.right > value.accountMenuPanelRect.viewportWidth
    )
  ) {
    failures.push(`${prefix} account menu overflows viewport: ${JSON.stringify(value.accountMenuPanelRect)}`)
  }

  if (
    value.navMenuPanelRect
    && (
      value.navMenuPanelRect.left < 0
      || value.navMenuPanelRect.right > value.navMenuPanelRect.viewportWidth
    )
  ) {
    failures.push(`${prefix} resource menu overflows viewport: ${JSON.stringify(value.navMenuPanelRect)}`)
  }

  if (value.smallTouchTargetCount > 0) {
    failures.push(`${prefix} shared interactive touch targets below 44px: ${JSON.stringify(value.smallTouchTargets.slice(0, 8))}`)
  }
}

const assertRouteFamily = (routeConfig, viewportName, value) => {
  const route = routeConfig.route

  if (routeConfig.family === 'crafting') {
    if (value.recipeTreeIssues.length > 0) {
      failures.push(`${route}: crafting tree image/text and branch rows must not overlap or overflow: ${JSON.stringify(value.recipeTreeIssues.slice(0, 8))}`)
    }

    if (route.includes('itemId=675') && !value.rootRecipeTargetVisible) {
      failures.push(`${route}: crafting root target should be visible above the fold, got top=${value.rootRecipeTargetTop}`)
    }
  }

  if (routeConfig.family === 'entity-index') {
    if (value.entitySearchInputCount < 1 && !['/biomes'].includes(route)) {
      failures.push(`${route}: entity index should expose a visible search input`)
    }

    if (value.entityCardCount < 1 && value.entityEmptyStateCount < 1) {
      failures.push(`${route}: entity index should render cards or an intentional empty state`)
    }

    if (value.entityCardImageSlotIssues.length > 0) {
      failures.push(`${route}: entity index card image slots must contain images: ${JSON.stringify(value.entityCardImageSlotIssues.slice(0, 8))}`)
    }

    if (viewportName === 'mobile' && !['/biomes'].includes(route) && value.entityCardCount >= 20 && value.entityPageControlCount < 1) {
      failures.push(`${route}: paginated entity index should expose page controls`)
    }
  }

  if (routeConfig.family === 'entity-detail') {
    if (/没有找到|未找到|详情缺失|正在读取|加载/.test(value.bodyText)) {
      failures.push(`${route}: entity detail should render loaded detail content instead of loading or missing state`)
    }

    if (value.entityHeroImageIssueCount > 0 || value.imageSlotIssues.length > 0) {
      failures.push(`${route}: entity detail hero/relation images must use contained managed images, got heroIssues=${value.entityHeroImageIssueCount}, slotIssues=${JSON.stringify(value.imageSlotIssues.slice(0, 5))}`)
    }

    if (value.relationTextWrapIssues.length > 0) {
      failures.push(`${route}: entity detail stat/evidence text should wrap without horizontal clipping: ${JSON.stringify(value.relationTextWrapIssues.slice(0, 5))}`)
    }
  }

  if (routeConfig.family === 'discovery') {
    if ((route === '/search' && (value.searchTypeCount < 5 || value.searchSuggestionRows < 4))
      || (route === '/articles' && value.articleStageCount < 4)
      || (route.startsWith('/categories') && value.categoryBranchCount < 1)) {
      failures.push(`${route}: discovery route nodes and suggestion rows should remain readable on mobile`)
    }

    if (/静态样例|fixture|mock|TODO|lorem/i.test(value.bodyText)) {
      failures.push(`${route}: discovery route exposes static fixture/debug wording`)
    }
  }
}

const resolveBiomeDetailRoute = async () => {
  const candidates = ['/api/public/biomes', '/api/biomes']
  for (const path of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`)
      if (!response.ok) continue
      const payload = await response.json()
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
      const first = rows.find((row) => row && (row.id || row.code))
      if (first) {
        return {
          route: `/biomes/${first.id ?? first.code}`,
          family: 'entity-detail',
          viewports: ['mobile'],
          fixtureSource: path,
        }
      }
    } catch {}
  }

  recordWarning('/biomes/:id: could not resolve API-derived biome fixture; falling back to /biomes index only', {
    route: '/biomes/:id',
    family: 'entity-detail',
    assertion: 'dynamic biome fixture',
  })
  return null
}

const firstResponseRows = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload)) return payload
  return []
}

const resolveFirstListDetailRoute = async ({ endpoint, routePrefix, family = 'entity-detail', label }) => {
  try {
    const response = await fetch(`${baseUrl}${endpoint}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json()
    const row = firstResponseRows(payload).find((entry) => entry && (entry.id || entry.detailPath))
    if (row?.detailPath) {
      return {
        route: row.detailPath,
        family,
        viewports: ['mobile'],
        fixtureSource: endpoint,
      }
    }

    if (row?.id) {
      return {
        route: `${routePrefix}/${row.id}`,
        family,
        viewports: ['mobile'],
        fixtureSource: endpoint,
      }
    }
  } catch (error) {
    recordWarning(`${label}: could not resolve API-derived fixture from ${endpoint}`, {
      route: `${routePrefix}/:id`,
      family,
      assertion: 'dynamic detail fixture',
      category: 'runtime',
      error: String(error?.message ?? error),
    })
  }

  return null
}

const resolveDynamicDetailRoutes = async () => {
  const routes = []
  const fixtures = [
    { endpoint: '/api/npcs?page=1&limit=1', routePrefix: '/npcs', label: '/npcs/:id' },
    { endpoint: '/api/public/bosses?page=1&limit=1', routePrefix: '/bosses', label: '/bosses/:id' },
    { endpoint: '/api/public/buffs?page=1&limit=1', routePrefix: '/buffs', label: '/buffs/:id' },
  ]

  for (const fixture of fixtures) {
    const route = await resolveFirstListDetailRoute(fixture)
    if (route) {
      routes.push(route)
    }
  }

  return routes
}

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

if (!css.includes('@fontsource-variable/noto-sans-sc')) {
  failures.push('CSS must import bundled Noto Sans SC variable font to avoid CJK tofu in headless/Linux Chromium')
}

if (!itemsPage.includes('in visibleWallItems') || !itemsPage.includes('CommonPreviewImage')) {
  failures.push('items page must render visibleWallItems through CommonPreviewImage')
}

if (!itemsPage.includes('pageSizeOptions') || !itemsPage.includes('currentPage') || !itemsPage.includes('goToNextPage')) {
  failures.push('items page must expose real pagination state and controls')
}

if (!itemsPage.includes('usePublicItems') || !publicItemsComposable.includes('export const fetchPublicItems')) {
  failures.push('items page must load catalog data through the shared usePublicItems data layer')
}

if (itemsPage.includes("$fetch<ApiItemsResponse>('/api/items'") || itemsPage.includes('items-pixel-gallery-catalog')) {
  failures.push('items page must not fetch /api/items directly; use the public item data layer')
}

if (!itemsPage.includes('catalog-search-input') || !itemsPage.includes('v-model="searchQuery"')) {
  failures.push('items page must provide a working search input bound to page state')
}

if (itemsPage.includes('@mouseenter="setFocusedItem(item)"')) {
  failures.push('items page wall cells must not repaint the focus card on every mouseenter')
}

if (!itemsPage.includes('@focus="setFocusedItem(item)"')) {
  failures.push('items page wall cells must update selection on keyboard focus')
}

if (!itemsPage.includes('debouncedSearchQuery') || !itemsPage.includes('setTimeout')) {
  failures.push('items page search query should be debounced before it enters the public item request')
}

if (!itemsPage.includes('resetCatalogFilters')) {
  failures.push('items page empty state should offer a full search/filter reset')
}

if (!itemsPage.includes('useRoute()') || !itemsPage.includes('useRouter()') || !itemsPage.includes('updateCatalogRouteQuery')) {
  failures.push('items page pagination and filters should sync to URL query for refresh/share')
}

if (!itemsPage.includes('catalogPageSizeStorageKey') || !itemsPage.includes('localStorage')) {
  failures.push('items page page-size control should persist the user preference in localStorage')
}

if (!itemsPage.includes('handleCatalogPaginationKeydown') || !itemsPage.includes('ArrowRight') || !itemsPage.includes('ArrowLeft')) {
  failures.push('items page pagination should support left/right keyboard navigation')
}

if (!itemsPage.includes('CommonPaginationDock') || !itemsPage.includes('show-boundary-controls') || !itemsPage.includes('goToPage')) {
  failures.push('items page should expose shared pagination with page number, first page, and last page controls')
}

if (itemsPage.includes('打开当前物品')) {
  failures.push('items page should avoid duplicating the focused item detail action in the page head')
}

if (itemsPage.includes('catalog-floating-focus')) {
  failures.push('items page should not render a fixed right-side focus card')
}

if (!itemsPage.includes('catalog-hover-preview')) {
  failures.push('items page should show item details in a hover/focus preview attached to each item cell')
}

if (!itemsPage.includes('aria-current')) {
  failures.push('items page selected wall cell should use aria-current instead of only aria-pressed semantics')
}

if (!publicItemsComposable.includes("return `tone-${(Math.abs(seed) % 3) + 1}`")) {
  failures.push('public item normalizer should only emit styled wall tone classes')
}

if (publicItemsComposable.includes("'/items/terra-blade'")) {
  failures.push('public item normalizer must not route missing item ids to a fixed terra-blade detail page')
}

if (itemsPage.includes('class="catalog-layout"') || itemsPage.includes('class="filter-panel"') || itemsPage.includes('class="preview-panel"')) {
  failures.push('items page must not keep the previous three-panel catalog layout below the selected Pixel Gallery UI')
}

for (const marker of [
  'catalog-pixel-stage',
  'catalog-wall-shell',
  'catalog-wall-topbar',
  'catalog-category-chip',
  'catalog-density-chip',
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

  const biomeDetailRoute = await resolveBiomeDetailRoute()
  const dynamicDetailRoutes = await resolveDynamicDetailRoutes()
  const routesToAudit = [
    ...publicRouteMatrix,
    ...dynamicDetailRoutes,
    ...(biomeDetailRoute ? [biomeDetailRoute] : []),
  ]

  for (const routeConfig of routesToAudit) {
    for (const viewportName of routeConfig.viewports) {
      const value = await navigateAndAudit(browser, routeConfig, viewportName)
      if (!value || viewportName !== 'mobile') {
        continue
      }

      const route = routeConfig.route

	    if (route === '/items') {
		      if (value.firstCatalogCellTop > 900) {
		        failures.push(`/items: first catalog cell should appear near the first mobile viewport, got top=${value.firstCatalogCellTop}`)
		      }

	      if (value.catalogOldPanelCount > 0) {
	        failures.push(`/items: previous three-panel catalog layout is still rendered (${value.catalogOldPanelCount} old panel markers)`)
	      }

		      if (value.catalogWallCellCount < 24) {
		        failures.push(`/items: expected the Pixel Gallery wall to render a full default result page, got ${value.catalogWallCellCount}`)
		      }

	      if (value.catalogSearchInputCount !== 1) {
	        failures.push(`/items: expected exactly one working Pixel Gallery search input, got ${value.catalogSearchInputCount}`)
	      }

		      if (value.catalogDataSourceAttribute !== 'api') {
		        failures.push(`/items: expected live public API data source marker, got ${JSON.stringify(value.catalogDataSourceAttribute)}`)
		      }

		      if (value.catalogWallCellCount < 1) {
		        continue
		      }

	      if (value.catalogDebugTextLeakCount > 0) {
	        failures.push(`/items: public catalog UI leaks debug data-source wording, got ${JSON.stringify(value.catalogDataSourceText)}`)
	      }

	      if (value.catalogQuickFilterCount < 5) {
	        failures.push(`/items: expected at least five Pixel Gallery quick filters, got ${value.catalogQuickFilterCount}`)
	      }

		      if (value.catalogFloatingFocusCount > 0) {
		        failures.push(`/items: catalog should use per-cell hover previews instead of a fixed focus card, got focus=${value.catalogFloatingFocusCount}, hover=${value.catalogHoverPreviewCount}`)
		      }

		      if (
		        value.catalogPageButtonCount < 4
		        || value.catalogFirstLastButtonCount < 2
		        || value.catalogJumpInputCount !== 1
		        || value.catalogStickyRailPosition !== 'sticky'
		      ) {
		        failures.push(`/items: pagination should expose compact page numbers, jump input, sticky rail, first page, and last page controls, got pageButtons=${value.catalogPageButtonCount}, jump=${value.catalogJumpInputCount}, sticky=${value.catalogStickyRailPosition}, firstLast=${value.catalogFirstLastButtonCount}`)
		      }

	      if (!['none', 'normal', '""'].includes(value.densityRailBeforeContent)) {
	        failures.push(`/items: catalog status text should not inherit decorative density rail bullets, got before=${value.densityRailBeforeContent}`)
	      }

		      if (value.itemFallbackCount < value.catalogWallCellCount) {
		        failures.push('/items: every Pixel Gallery wall item should expose a data-fallback marker')
		      }

			      if (value.itemImageCount + value.itemActiveFallbackCount < value.catalogWallCellCount) {
			        failures.push(`/items: expected each Pixel Gallery cell to render either an image or active fallback, got ${value.itemImageCount} images and ${value.itemActiveFallbackCount} fallbacks for ${value.catalogWallCellCount} cells`)
		      }

	      if (value.itemFallbackOverlayIssues.length > 0) {
	        failures.push(`/items: fallback overlay should not cover normal images: ${JSON.stringify(value.itemFallbackOverlayIssues.slice(0, 5))}`)
	      }

	      if (value.catalogIconLayoutIssues.length > 0) {
	        failures.push(`/items: catalog icon cells should reserve separate icon, index, and label space: ${JSON.stringify(value.catalogIconLayoutIssues.slice(0, 5))}`)
	      }
	
	      if (value.densityChoiceCount < 2) {
	        failures.push('/items: expected page-size controls')
	      }

		      const interactionValue = await evaluateJson(browser, `(() => new Promise((resolve) => {
	          const flush = () => new Promise((done) => setTimeout(done, 80));
	          (async () => {
	            const initialTitle = document.querySelector('.catalog-wall-cell.active')?.getAttribute('aria-label') ?? '';
	            const hoverTarget = [...document.querySelectorAll('.catalog-wall-cell')].find((element) => {
	              const label = element.getAttribute('aria-label') ?? '';
	              return label && !label.includes(initialTitle);
	            }) ?? document.querySelector('.catalog-wall-cell');
	            hoverTarget?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
	            await flush();
	            const afterHoverTitle = document.querySelector('.catalog-wall-cell.active')?.getAttribute('aria-label') ?? '';
	            const hoverPreviewVisible = Boolean(hoverTarget?.querySelector('.catalog-hover-preview'));
	            hoverTarget?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
	            await flush();
	            const hoverTitle = document.querySelector('.catalog-wall-cell.active')?.getAttribute('aria-label') ?? '';
	            const input = document.querySelector('.catalog-search-input');
	            if (input) {
	              const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
	              valueSetter?.call(input, '八音盒（彩虹巨石）');
	              input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '八音盒（彩虹巨石）' }));
	            }
	            const afterSearch = await new Promise((done) => {
	              const startedAt = Date.now();
	              const tick = () => {
	                const cells = [...document.querySelectorAll('.catalog-wall-cell')];
	                const hasTarget = cells.some((cell) => (cell.getAttribute('aria-label') ?? '').includes('八音盒'));
	                const state = {
	                  count: cells.length,
	                  inputValue: input?.value ?? '',
	                  hasTarget,
	                  pageText: document.querySelector('.catalog-page-dock-summary')?.textContent ?? '',
	                  timedOut: false,
	                };
	                if (hasTarget && state.count > 0 && state.count < 24) {
	                  done(state);
	                  return;
	                }
	                if (Date.now() - startedAt > 2600) {
	                  done({ ...state, timedOut: true });
	                  return;
	                }
	                setTimeout(tick, 100);
	              };
	              tick();
	            });
	            const clearButton = document.querySelector('.catalog-clear-search');
	            clearButton?.click();
	            await new Promise((done) => setTimeout(done, 520));
	            const weaponButton = [...document.querySelectorAll('.catalog-category-chip')].find((button) => button.textContent?.includes('武器'));
	            weaponButton?.click();
	            await new Promise((done) => setTimeout(done, 520));
	            resolve({
	              initialTitle,
	              afterHoverTitle,
	              hoverTitle,
	              hoverIgnored: Boolean(afterHoverTitle && afterHoverTitle === initialTitle),
	              hoverPreviewVisible,
	              hoverChanged: Boolean(hoverTitle && hoverTitle !== initialTitle),
	              searchInputValue: afterSearch.inputValue,
	              afterSearchCount: afterSearch.count,
	              afterSearch,
	              activeFilterText: document.querySelector('.catalog-category-chip.active')?.textContent?.trim() ?? '',
	              afterFilterCount: document.querySelectorAll('.catalog-wall-cell').length,
	            });
	          })();
	        }))()`, {
		        route: '/items',
		        family: 'items',
		        viewport: 'mobile',
		        label: 'catalog interaction audit',
		      })

		      if (!interactionValue) {
		        continue
		      }

	      if (!interactionValue.hoverIgnored || !interactionValue.hoverChanged || !interactionValue.hoverPreviewVisible) {
	        failures.push(`/items: mouseenter should show per-cell preview without changing selection; focus should update selection, got ${JSON.stringify(interactionValue)}`)
	      }

      if (interactionValue.afterSearch?.timedOut || interactionValue.afterSearchCount <= 0 || interactionValue.afterSearchCount >= value.catalogWallCellCount) {
        failures.push(`/items: search should reduce the wall to matching results, got ${JSON.stringify(interactionValue)}`)
      }

      if (!interactionValue.activeFilterText.includes('武器') || interactionValue.afterFilterCount <= 0) {
        failures.push(`/items: quick filters should activate and keep a visible result page, got ${JSON.stringify(interactionValue)}`)
      }

		      await browser.send('Page.navigate', { url: `${baseUrl}/items` })
		      await sleep(650)
		      await waitForItemsHydration(browser)
		      const paginationValue = await evaluateJson(browser, `(() => new Promise((resolve) => {
		            const snapshotCatalog = () => ({
		              statusText: document.querySelector('.catalog-control-summary strong')?.textContent ?? '',
		              pageText: document.querySelector('.catalog-page-dock-summary')?.textContent ?? '',
		              firstLabel: document.querySelector('.catalog-wall-cell')?.getAttribute('aria-label') ?? '',
		              firstIndex: document.querySelector('.catalog-wall-cell .catalog-wall-cell-index')?.textContent?.trim() ?? '',
		              activeFilterText: document.querySelector('.catalog-category-chip.active')?.textContent?.trim() ?? '',
		              cellCount: document.querySelectorAll('.catalog-wall-cell').length,
		              pageButtonCount: document.querySelectorAll('.catalog-dock-page-button').length,
		              densityChoices: [...document.querySelectorAll('.catalog-density-chip')]
		                .map((button) => button.textContent?.trim() ?? ''),
		              hasJumpForm: Boolean(document.querySelector('.catalog-dock-jump-form input')),
		              railPosition: getComputedStyle(document.querySelector('.catalog-page-dock') ?? document.body).position,
		              itemTitles: [...document.querySelectorAll('.catalog-wall-cell')]
		                .slice(0, 20)
		                .map((cell) => cell.getAttribute('title') ?? ''),
	            });

	          const waitForCatalogState = (predicate) => new Promise((done) => {
	            const startedAt = Date.now();
	            const tick = () => {
	              const state = snapshotCatalog();
	              if (!/(同步中|加载中)/.test(state.statusText) && state.firstLabel && predicate(state)) {
	                done(state);
	                return;
	              }
		              if (Date.now() - startedAt > 2400) {
	                done({ ...state, timedOut: true });
	                return;
	              }
	              setTimeout(tick, 100);
	            };
	            tick();
	          });

	          (async () => {
		            const allButton = [...document.querySelectorAll('.catalog-category-chip')]
		              .find((button) => button.textContent?.includes('全部'));
	            allButton?.click();

	            const clearButton = document.querySelector('.catalog-clear-search');
	            clearButton?.click();
		            const initial = await waitForCatalogState((state) => (
		              state.activeFilterText.includes('全部')
		              && state.pageText.includes('第 1')
		              && state.cellCount === 24
		              && state.pageButtonCount <= 7
			              && state.densityChoices.join('|').includes('12')
			              && state.densityChoices.join('|').includes('24')
			              && state.densityChoices.join('|').includes('48')
			              && state.densityChoices.join('|').includes('96')
		              && state.hasJumpForm
		              && state.railPosition === 'sticky'
		            ));

		            const nextButton = document.querySelector('.catalog-dock-icon-button[aria-label="下一页"]');
	            nextButton?.click();
	            const next = await waitForCatalogState((state) => (
	              state.activeFilterText.includes('全部')
		              && state.pageText.includes('第 2')
		              && state.firstLabel
		              && state.firstLabel !== initial.firstLabel
		              && state.firstIndex === '025'
		            ));

			            const page48Button = [...document.querySelectorAll('.catalog-density-chip')]
			              .find((button) => button.textContent?.includes('48'));
		            page48Button?.click();
		            const page48 = await waitForCatalogState((state) => (
		              state.activeFilterText.includes('全部')
		              && state.pageText.includes('第 1')
		              && state.cellCount === 48
		              && new URLSearchParams(location.search).get('pageSize') === '48'
		            ));

			            const page12Button = [...document.querySelectorAll('.catalog-density-chip')]
			              .find((button) => button.textContent?.includes('12'));
		            page12Button?.click();
		            const page12 = await waitForCatalogState((state) => (
		              state.activeFilterText.includes('全部')
		              && state.pageText.includes('第 1')
		              && state.cellCount === 12
		              && new URLSearchParams(location.search).get('pageSize') === '12'
		            ));
		            const storedPageSizeAfter12 = localStorage.getItem('terrapedia:catalog-page-size');

			            const page24Button = [...document.querySelectorAll('.catalog-density-chip')]
			              .find((button) => button.textContent?.includes('24'));
		            page24Button?.click();
		            const page24Restored = await waitForCatalogState((state) => (
		              state.activeFilterText.includes('全部')
		              && state.pageText.includes('第 1')
		              && state.cellCount === 24
		              && !new URLSearchParams(location.search).get('pageSize')
		            ));

	            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	            const keyboardNext = await waitForCatalogState((state) => (
	              state.activeFilterText.includes('全部')
	              && state.pageText.includes('第 2')
	              && new URLSearchParams(location.search).get('page') === '2'
	            ));
	            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
	            const keyboardPrevious = await waitForCatalogState((state) => (
	              state.activeFilterText.includes('全部')
	              && state.pageText.includes('第 1')
	              && !new URLSearchParams(location.search).get('page')
	            ));

			            const pageThreeButton = [...document.querySelectorAll('.catalog-dock-page-button')]
			              .find((button) => button.textContent?.trim() === '3');
	            pageThreeButton?.click();
	            const pageThree = await waitForCatalogState((state) => (
	              state.activeFilterText.includes('全部')
	              && state.pageText.includes('第 3')
		              && new URLSearchParams(location.search).get('page') === '3'
		            ));

			            const jumpInput = document.querySelector('.catalog-dock-jump-form input');
			            const jumpButton = document.querySelector('.catalog-dock-jump-form button[type="submit"]');
		            if (jumpInput) {
		              jumpInput.value = '5';
		              jumpInput.dispatchEvent(new Event('input', { bubbles: true }));
		            }
		            jumpButton?.click();
		            const jumpPage = await waitForCatalogState((state) => (
		              state.activeFilterText.includes('全部')
		              && state.pageText.includes('第 5')
		              && new URLSearchParams(location.search).get('page') === '5'
		            ));

		            const lastButton = [...document.querySelectorAll('.catalog-page-dock button')]
		              .find((button) => button.textContent?.includes('末页'));
	            lastButton?.click();
	            const last = await waitForCatalogState((state) => (
	              state.activeFilterText.includes('全部')
	              && new URLSearchParams(location.search).get('page')
	              && state.pageText.includes('/ ' + new URLSearchParams(location.search).get('page') + ' 页')
	            ));

		            const weaponButton = [...document.querySelectorAll('.catalog-category-chip')]
		              .find((button) => button.textContent?.includes('武器'));
	            weaponButton?.click();
	            const weapon = await waitForCatalogState((state) => (
		              state.activeFilterText.includes('武器')
		              && state.pageText.includes('第 1')
		              && state.cellCount === 24
		              && !state.pageText.includes('本页')
		            ));

	            resolve({
	              initial,
		              next,
		              page48,
		              page12,
		              page24Restored,
		              keyboardNext,
		              keyboardPrevious,
		              pageThree,
		              jumpPage,
		              last,
		              weapon,
		              storedPageSizeAfter12,
		              nextDisabled: Boolean(nextButton?.disabled),
		              page24Active: Boolean(page24Button?.classList.contains('active')),
		              page24CellCount: document.querySelectorAll('.catalog-wall-cell').length,
		            });
		          })();
		        }))()`, {
		        route: '/items',
		        family: 'items',
		        viewport: 'mobile',
		        label: 'catalog pagination audit',
		      })

		      if (!paginationValue) {
		        continue
		      }

	      if (
	        paginationValue.nextDisabled
	        || paginationValue.initial?.timedOut
	        || paginationValue.next?.timedOut
	        || paginationValue.initial?.firstLabel === paginationValue.next?.firstLabel
	        || paginationValue.next?.firstIndex !== '025'
	        || !String(paginationValue.next?.pageText ?? '').includes('第 2')
	      ) {
	        failures.push(`/items: pagination next page should load a distinct second page, got ${JSON.stringify(paginationValue)}`)
	      }

	      if (
	        paginationValue.page48?.timedOut
	        || paginationValue.page24Restored?.timedOut
	        || !paginationValue.page24Active
	        || paginationValue.page24CellCount !== 24
	        || !String(paginationValue.page48?.pageText ?? '').includes('第 1')
	        || !String(paginationValue.page24Restored?.pageText ?? '').includes('第 1')
	      ) {
	        failures.push(`/items: 48/page and default 24/page controls should reset page size and URL state, got ${JSON.stringify(paginationValue)}`)
	      }

	      if (
	        paginationValue.page12?.timedOut
	        || paginationValue.page12?.cellCount !== 12
	        || paginationValue.storedPageSizeAfter12 !== '12'
	      ) {
	        failures.push(`/items: 12/page control should update URL, render 12 cells, and persist preference, got ${JSON.stringify(paginationValue)}`)
	      }

	      if (
	        paginationValue.keyboardNext?.timedOut
	        || paginationValue.keyboardPrevious?.timedOut
	        || !String(paginationValue.keyboardNext?.pageText ?? '').includes('第 2')
	        || !String(paginationValue.keyboardPrevious?.pageText ?? '').includes('第 1')
	      ) {
	        failures.push(`/items: keyboard left/right should navigate adjacent catalog pages and URL query, got ${JSON.stringify(paginationValue)}`)
	      }

	      if (
	        paginationValue.pageThree?.timedOut
	        || !String(paginationValue.pageThree?.pageText ?? '').includes('第 3')
	        || paginationValue.jumpPage?.timedOut
	        || !String(paginationValue.jumpPage?.pageText ?? '').includes('第 5')
	        || paginationValue.last?.timedOut
	      ) {
	        failures.push(`/items: page number, jump, and last-page controls should update visible page and URL query, got ${JSON.stringify(paginationValue)}`)
	      }

	      if (
	        paginationValue.weapon?.timedOut
	        || paginationValue.weapon?.cellCount !== 24
	        || String(paginationValue.weapon?.pageText ?? '').includes('本页')
	        || !String(paginationValue.weapon?.activeFilterText ?? '').includes('武器')
	        || paginationValue.weapon?.itemTitles?.some((title) => /可疑眼球|魔镜/.test(title))
	      ) {
	        failures.push(`/items: weapon category should be server-filtered before pagination and render a full filtered page, got ${JSON.stringify(paginationValue)}`)
	      }
	    }

    if (route === '/search' && (value.searchTypeCount < 5 || value.searchSuggestionRows < 4)) {
      failures.push('/search: expected search type chips and suggestion rows')
    }

    if (route === '/search' && value.realSearchInputCount !== 1) {
      failures.push(`/search: expected one real search input, got ${value.realSearchInputCount}`)
    }

    if (route === '/articles' && value.articleStageCount < 4) {
      failures.push('/articles: expected at least four route stage nodes')
    }

    if (route === '/categories' && value.categoryBranchCount < 6) {
      failures.push('/categories: expected category branch cards')
    }
    }
  }

  for (const route of nonPublicPreviewRoutes) {
    const routeConfig = { route, family: 'non-public-preview', viewports: ['mobile'] }
    const beforeCount = failures.length
    const value = await navigateAndAudit(browser, routeConfig, 'mobile')
    const newFailures = blockingFailures.splice(beforeCount)
    if (newFailures.length > 0) {
      for (const failure of newFailures) {
        recordWarning(failure.message, {
          ...failure,
          severity: 'warning',
          family: 'non-public-preview',
          route,
        })
      }
    }

    if (value?.previewFakeAccountControlCount > 0) {
      recordWarning(`${route}: non-public preview exposes account-like controls`, {
        route,
        family: 'non-public-preview',
        assertion: 'no fake logged-in controls',
        count: value.previewFakeAccountControlCount,
      })
    }
  }

  await browser.send('Page.navigate', { url: `${baseUrl}/items/1` })
  await sleep(650)
  const detailHydrated = await waitForItemDetailHydration(browser)
  const detailResult = await browser.send('Runtime.evaluate', {
    expression: `(() => {
      const bodyText = document.body.innerText;
      return {
	        h1Count: document.querySelectorAll('h1').length,
        title: document.querySelector('.detail-screen h1')?.textContent?.trim() ?? '',
        hasDetailHero: Boolean(document.querySelector('.detail-hero')),
        hasEvidencePanel: Boolean(document.querySelector('.evidence-panel')),
        missing: bodyText.includes('没有找到这个物品'),
        oldMock: bodyText.includes('泰拉刃是一把困难模式后期近战武器'),
        brokenImageCount: [...document.images].filter((image) => image.currentSrc && image.naturalWidth === 0).length,
        fallbackImageCount: document.querySelectorAll('.detail-screen .item-art.is-fallback').length,
        heroFallback: Boolean(document.querySelector('.detail-icon-stage .item-art.is-fallback')),
        detailIconLayoutIssues: [...document.querySelectorAll('.detail-icon-stage .item-art, .source-row .item-art, .recipe-node .item-art')].flatMap((art, index) => {
          const rect = art.getBoundingClientRect();
          const img = art.querySelector('img[src]');
          const issues = [];
          if (rect.width < 42 || rect.height < 42) {
            issues.push('detail icon too small');
          }
          if (img && getComputedStyle(img).objectFit !== 'contain') {
            issues.push('detail image object-fit is not contain');
          }
          return issues.map((issue) => ({ index, issue, width: Math.round(rect.width), height: Math.round(rect.height) }));
        }),
        detailIconTextOverlapIssues: [
          ...[...document.querySelectorAll('.source-row')].map((row, index) => ({
            type: 'source-row',
            index,
            icon: row.querySelector('.item-art'),
            text: row.querySelector('div'),
          })),
          ...[...document.querySelectorAll('.recipe-node')].map((row, index) => ({
            type: 'recipe-node',
            index,
            icon: row.querySelector('.item-art'),
            text: row.querySelector('b'),
          })),
        ].flatMap((entry) => {
          if (!entry.icon || !entry.text) return [];
          const iconRect = entry.icon.getBoundingClientRect();
          const textRect = entry.text.getBoundingClientRect();
          const overlaps = !(
            iconRect.left >= textRect.right
            || iconRect.right <= textRect.left
            || iconRect.top >= textRect.bottom
            || iconRect.bottom <= textRect.top
          );
          return overlaps ? [{
            type: entry.type,
            index: entry.index,
            icon: {
              left: Math.round(iconRect.left),
              right: Math.round(iconRect.right),
              top: Math.round(iconRect.top),
              bottom: Math.round(iconRect.bottom),
            },
            text: {
              left: Math.round(textRect.left),
              right: Math.round(textRect.right),
              top: Math.round(textRect.top),
              bottom: Math.round(textRect.bottom),
            },
          }] : [];
        }),
      };
    })()`,
    returnByValue: true,
  })
  const detailValue = {
    ...detailResult.result.value,
    hydrated: detailHydrated,
  }

  if (!detailValue.hydrated || !detailValue.hasDetailHero || !detailValue.hasEvidencePanel || detailValue.missing) {
    failures.push(`/items/1: item detail page should render live public detail content, got ${JSON.stringify(detailValue)}`)
  }

  if (detailValue.h1Count !== 1) {
    failures.push(`/items/1: expected exactly one h1, got ${detailValue.h1Count}`)
  }

  if (detailValue.oldMock) {
    failures.push('/items/1: item detail page still exposes static Terra Blade mock content')
  }

  if (detailValue.brokenImageCount > 0) {
    failures.push(`/items/1: detail page renders broken images (${detailValue.brokenImageCount})`)
  }

  if (detailValue.heroFallback) {
    failures.push(`/items/1: hydrated detail hero should not show fallback glyph for item 1, got ${JSON.stringify(detailValue)}`)
  }

  if (detailValue.detailIconLayoutIssues.length > 0) {
    failures.push(`/items/1: detail icon rows should preserve readable image sizing and contain fit, got ${JSON.stringify(detailValue.detailIconLayoutIssues.slice(0, 5))}`)
  }

  if (detailValue.detailIconTextOverlapIssues.length > 0) {
    failures.push(`/items/1: detail icon rows should keep icon and text separated, got ${JSON.stringify(detailValue.detailIconTextOverlapIssues.slice(0, 5))}`)
  }

  await browser.send('Page.navigate', { url: `${baseUrl}/__missing-terrapedia-page` })
  await sleep(650)
  const errorPage = await browser.send('Runtime.evaluate', {
    expression: `(() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && rect.width > 1 && rect.height > 1;
      };
      const bodyText = document.body.innerText;
      return {
        hasErrorScreen: visible(document.querySelector('.error-screen')),
        hasNav: visible(document.querySelector('.site-nav')),
        hasFooter: visible(document.querySelector('.camp-footer')),
        h1Count: document.querySelectorAll('h1').length,
        statusCode: document.querySelector('.error-status-code')?.textContent?.trim() ?? '',
        bodyText,
        hasDefaultNuxtText: bodyText.includes('Page not found') || bodyText.includes('Stack trace') || bodyText.includes('statusMessage'),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    })()`,
    returnByValue: true,
  })
  const errorPageValue = errorPage.result.value

  if (!errorPageValue.hasErrorScreen) {
    failures.push('/__missing-terrapedia-page: missing visible custom .error-screen')
  }

  if (!errorPageValue.hasNav || !errorPageValue.hasFooter) {
    failures.push(`/__missing-terrapedia-page: custom error page must render shared nav/footer, got ${JSON.stringify({ nav: errorPageValue.hasNav, footer: errorPageValue.hasFooter })}`)
  }

  if (errorPageValue.h1Count !== 1) {
    failures.push(`/__missing-terrapedia-page: expected exactly one h1 on custom error page, got ${errorPageValue.h1Count}`)
  }

  if (errorPageValue.statusCode !== '404') {
    failures.push(`/__missing-terrapedia-page: expected visible status code 404, got ${JSON.stringify(errorPageValue.statusCode)}`)
  }

  for (const marker of ['这条资料路线还没开放', '返回首页', '物品图鉴', '搜索资料']) {
    if (!errorPageValue.bodyText.includes(marker)) {
      failures.push(`/__missing-terrapedia-page: custom error page must show ${marker}`)
    }
  }

  if (errorPageValue.hasDefaultNuxtText) {
    failures.push('/__missing-terrapedia-page: visible error page still exposes Nuxt default error wording')
  }

  if (errorPageValue.scrollWidth > errorPageValue.clientWidth + 2) {
    failures.push(`/__missing-terrapedia-page: mobile custom error page overflows horizontally: document=${errorPageValue.scrollWidth}, viewport=${errorPageValue.clientWidth}`)
  }

  for (const route of ['/npcs', ...dynamicDetailRoutes.map((routeConfig) => routeConfig.route)]) {
    await browser.send('Page.navigate', { url: `${baseUrl}${route}` })
    await sleep(650)
    const result = await browser.send('Runtime.evaluate', {
      expression: auditExpression,
      returnByValue: true,
    })
    const value = result.result.value

    if (value.entityHeroImageIssueCount > 0) {
      failures.push(`${route}: entity hero/preview images must use recognizable loaded assets instead of preview placeholder fallbacks (${value.entityHeroImageIssueCount})`)
    }
  }

  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 768,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await browser.send('Page.navigate', { url: `${baseUrl}/` })
  await sleep(650)
  const tabletHome = await browser.send('Runtime.evaluate', {
    expression: auditExpression,
    returnByValue: true,
  })
  const tabletHomeValue = tabletHome.result.value

  if (tabletHomeValue.overflowing.length > 0) {
    failures.push(`/: tablet homepage visible elements overflow viewport: ${JSON.stringify(tabletHomeValue.overflowing.slice(0, 5))}`)
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
    await waitForItemsHydration(browser)
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
        const inspectCatalogIconCells = () => (
          [...document.querySelectorAll('.catalog-wall-cell:not(.catalog-wall-cell-loading)')].slice(0, 24).flatMap((cell, index) => {
            const art = cell.querySelector('.item-art');
            const img = art?.querySelector('img[src]');
            if (!art) {
              return [{ index, issue: 'missing icon art' }];
            }

            const cellRect = cell.getBoundingClientRect();
            const artRect = art.getBoundingClientRect();
            const cellStyle = getComputedStyle(cell);
            const contentLeft = cellRect.left + Number.parseFloat(cellStyle.paddingLeft || '0');
            const contentRight = cellRect.right - Number.parseFloat(cellStyle.paddingRight || '0');
            const contentWidth = contentRight - contentLeft;
            const issues = [];

            if (artRect.left < contentLeft - 1 || artRect.right > contentRight + 1) {
              issues.push('icon frame overflows cell content');
            }

            if (artRect.width > contentWidth + 1) {
              issues.push('icon frame wider than cell content');
            }

            if (img) {
              const imgRect = img.getBoundingClientRect();
              if (imgRect.left < artRect.left - 1 || imgRect.right > artRect.right + 1 || imgRect.top < artRect.top - 1 || imgRect.bottom > artRect.bottom + 1) {
                issues.push('image overflows sprite frame');
              }
            }

            return issues.map((issue) => ({
              index,
              label: cell.getAttribute('aria-label') ?? '',
              issue,
              cell: roundRect(cellRect),
              art: roundRect(artRect),
              contentWidth: Math.round(contentWidth),
            }));
          })
        );
        const isVisible = (rect) => (
          rect.bottom > 0
          && rect.top < window.innerHeight
          && rect.right > 0
          && rect.left < document.documentElement.clientWidth
        );
        const inspect = (stage) => {
          const grid = document.querySelector('.catalog-wall-grid');
          if (!grid) {
            return {
              stage,
              missing: true,
              hasGrid: Boolean(grid),
            };
          }

          const gridRect = grid.getBoundingClientRect();
          const previewRect = document.querySelector('.catalog-wall-cell:hover .catalog-hover-preview, .catalog-wall-cell:focus-within .catalog-hover-preview')?.getBoundingClientRect() ?? null;

          return {
            stage,
            missing: false,
            grid: roundRect(gridRect),
            preview: previewRect ? roundRect(previewRect) : null,
            iconLayoutIssues: inspectCatalogIconCells(),
            shellDisplay: getComputedStyle(document.querySelector('.catalog-wall-shell')).display,
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
      }

      if (!capture.missing && capture.iconLayoutIssues.length > 0) {
        failures.push(`/items: catalog icon frames must fit their cells at ${viewport.width}px/${capture.stage}: ${JSON.stringify(capture.iconLayoutIssues.slice(0, 5))}`)
      }
    }

    if (
      desktopItemsValue.scrollWidth > desktopItemsValue.clientWidth + 2
      || desktopItemsValue.bodyScrollWidth > desktopItemsValue.clientWidth + 2
    ) {
      failures.push(`/items: desktop page overflows horizontally at ${viewport.width}px: document=${desktopItemsValue.scrollWidth}, body=${desktopItemsValue.bodyScrollWidth}, viewport=${desktopItemsValue.clientWidth}`)
    }
  }
} catch (error) {
  recordFailure('visual checker: browser assertion phase failed before completing route matrix', {
    route: null,
    family: 'checker-runtime',
    assertion: 'browser assertion phase',
    error: String(error?.stack ?? error?.message ?? error),
  })
} finally {
  browser.ws.close()
  browser.chrome.kill('SIGTERM')
}

if (failures.length > 0) {
  writeFailureReport()
  console.error(`Visual regression checks failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  console.error(`Structured failure report written to ${failureReportPath.pathname}`)
  process.exit(1)
}

writeFailureReport()
console.log('Visual regression checks passed for public route matrix, mobile layout, catalog density, fallbacks, and discovery pages.')
