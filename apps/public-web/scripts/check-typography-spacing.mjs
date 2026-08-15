import { spawn } from 'node:child_process'

const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5176'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const targetThemes = ['dark', 'morning-paper', 'warm-slate']
const verbose = process.env.TERRAPEDIA_TYPOGRAPHY_VERBOSE === '1'
const routes = [
  { path: '/', label: 'home' },
  { path: '/items', label: 'items index' },
  { path: '/items/terra-blade', label: 'item detail' },
  { path: '/articles', label: 'articles index' },
  { path: '/articles/melee-progression', label: 'article detail' },
  { path: '/search', label: 'search' },
  { path: '/crafting', label: 'crafting' },
  { path: '/categories', label: 'categories index' },
  { path: '/categories/weapons', label: 'category detail' },
  { path: '/biomes', label: 'biomes index' },
  { path: '/biomes/jungle', label: 'biome detail' },
  { path: '/npcs', label: 'npcs index' },
  { path: '/npcs/guide', label: 'npc detail' },
  { path: '/bosses', label: 'bosses index' },
  { path: '/bosses/eye-of-cthulhu', label: 'boss detail' },
  { path: '/buffs', label: 'buffs index' },
  { path: '/buffs/ironskin', label: 'buff detail' },
  { path: '/projectiles', label: 'projectiles index' },
  { path: '/armor-sets', label: 'armor sets index' },
  { path: '/user', label: 'user public shell' },
  { path: '/user/login', label: 'login' },
  { path: '/user/register', label: 'register' },
  { path: '/user/articles', label: 'user articles auth redirect', expectedPath: '/user/login', authRedirect: true },
  { path: '/user/favorites', label: 'favorites auth redirect', expectedPath: '/user/login', authRedirect: true },
  { path: '/user/notifications', label: 'notifications auth redirect', expectedPath: '/user/login', authRedirect: true },
  { path: '/user/settings', label: 'settings auth redirect', expectedPath: '/user/login', authRedirect: true },
]
const viewports = [
  { label: 'desktop', width: 1440, height: 1100, mobile: false },
  { label: 'mobile', width: 390, height: 844, mobile: true },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (url, attempts = 80) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {}

    await sleep(100)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  sleep(ms).then(() => {
    throw new Error(`Timed out waiting for ${label}`)
  }),
])

const connectToChrome = async (port) => {
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/terrapedia-chrome-typography-spacing-${port}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })

  await waitFor(`http://127.0.0.1:${port}/json/version`)

  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
  }).then((response) => response.json())

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  const callbacks = new Map()
  const eventListeners = new Map()
  let id = 0

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)

    if (message.id && callbacks.has(message.id)) {
      const callback = callbacks.get(message.id)
      callbacks.delete(message.id)

      if (message.error) {
        callback.reject(new Error(JSON.stringify(message.error)))
      } else {
        callback.resolve(message.result)
      }
    }

    if (message.method && eventListeners.has(message.method)) {
      for (const listener of eventListeners.get(message.method)) {
        listener(message.params)
      }
    }
  })

  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1
    callbacks.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

  const once = (method) => new Promise((resolve) => {
    const listener = (params) => {
      eventListeners.get(method).delete(listener)
      resolve(params)
    }

    if (!eventListeners.has(method)) {
      eventListeners.set(method, new Set())
    }

    eventListeners.get(method).add(listener)
  })

  return { chrome, send, once, ws }
}

const themeAppliedExpression = (theme) => `(() => {
  const root = document.documentElement;
  return root.getAttribute('data-theme') === ${JSON.stringify(theme)};
})()`

const applyThemeExpression = (theme) => `(() => {
  document.cookie = 'terrapedia-theme=${theme}; Path=/; SameSite=Lax';
  document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
  return true;
})()`

const pageReadyExpression = (expectedPath) => `(() => {
  return document.readyState !== 'loading'
    && location.pathname === ${JSON.stringify(expectedPath)}
    && !!document.body;
})()`

const pollRuntimeBoolean = async (browser, expression, attempts = 50) => {
  let lastError

  for (let index = 0; index < attempts; index += 1) {
    try {
      const result = await browser.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      })

      if (result.result.value === true) return
    } catch (error) {
      lastError = error
    }

    await sleep(100)
  }

  throw lastError || new Error('Runtime condition did not become true')
}

const navigateAndWait = async (browser, route) => {
  const expectedPath = route.expectedPath || route.path
  const loaded = browser.once('Page.loadEventFired')

  await browser.send('Page.navigate', { url: `${baseUrl}${route.path}` })
  await withTimeout(loaded, 5000, `load event for ${route.path}`).catch(() => {})
  await withTimeout(
    pollRuntimeBoolean(browser, pageReadyExpression(expectedPath), 70),
    7000,
    `${route.path} ready at ${expectedPath}`,
  )
}

const auditExpression = `(() => {
  const parseColor = (value) => {
    const text = String(value || '').trim();
    const rgbMatch = text.match(/rgba?\\(([^)]+)\\)/);
    if (!rgbMatch) return [0, 0, 0, 1];
    const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  };
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const nameFor = (element) => {
    const classes = String(element.className || '').trim().split(/\\s+/).filter(Boolean).slice(0, 4).join('.');
    return element.tagName.toLowerCase() + (classes ? '.' + classes : '');
  };
  const textFor = (element) => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const issues = [];
  const viewportWidth = document.documentElement.clientWidth;
  const isMobile = viewportWidth < 720;

  if (document.documentElement.scrollWidth > viewportWidth + 2) {
    issues.push({
      type: 'horizontal-overflow',
      element: 'document',
      text: String(document.documentElement.scrollWidth - viewportWidth),
    });
  }

  const pageHeadInner = document.querySelector('.page-head:not(.biome-environment-hero) .page-head-inner');
  if (pageHeadInner && isVisible(pageHeadInner)) {
    const style = getComputedStyle(pageHeadInner);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const minInline = isMobile ? 12 : 14;
    const minBlock = isMobile ? 10 : 8;

    if (paddingLeft < minInline || paddingRight < minInline || paddingTop < minBlock || paddingBottom < minBlock) {
      issues.push({
        type: 'page-head-cramped-padding',
        element: nameFor(pageHeadInner),
        text: textFor(pageHeadInner),
        padding: [paddingTop, paddingRight, paddingBottom, paddingLeft].map((value) => Math.round(value)).join('/'),
      });
    }
  }

  for (const element of document.querySelectorAll([
    '.tp-data-panel',
    '.support-panel.article-table-panel',
    '.article-table-row',
    '.public-article-card',
    '.favorite-card',
    '.user-feed-row',
    '.notification-inbox-row',
    '.settings-panel',
    '.catalog-card',
    '.catalog-item-card',
    '.catalog-panel',
    '.search-result-card',
    '.category-cluster',
    '.entity-card',
    '.npc-card',
    '.boss-node',
    '.effect-card',
    '.biome-tile',
    '.crafting-target-card',
    '.crafting-suggestion-card',
  ].join(', '))) {
    if (!isVisible(element)) continue;
    if (!textFor(element)) continue;

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const minPadding = rect.width < 520 ? 12 : 14;

    if (paddingLeft < minPadding || paddingRight < minPadding || paddingTop < 8 || paddingBottom < 8) {
      issues.push({
        type: 'cramped-padding',
        element: nameFor(element),
        text: textFor(element),
        padding: [paddingTop, paddingRight, paddingBottom, paddingLeft].map((value) => Math.round(value)).join('/'),
      });
    }
  }

  for (const element of document.querySelectorAll([
    '.tp-data-meta',
    '.article-table-grid--head span',
    '.article-time-cell span',
    '.article-status-cell small',
    '.article-next-step span',
    '.public-article-kicker',
    '.public-article-meta',
    '.public-article-cover-fallback em',
    '.favorite-card span',
    '.user-feed-row span',
    '.notification-inbox-row span',
    '.settings-list span',
    '.catalog-status-row span',
    '.catalog-screen .item-cell em',
    '.catalog-category-chip',
    '.catalog-density-chip',
    '.search-type-tabs a',
    '.search-suggestion-rows span',
    '.route-stage-timeline em',
    '.category-cluster-label',
    '.entity-filter em',
    '.entity-stat-strip span',
    '.npc-card span',
    '.npc-card em',
    '.boss-node span',
    '.boss-node p',
    '.node-meta em',
    '.armor-card p',
    '.armor-card em',
    '.armor-card-body > span',
    '.armor-benefit-lines span',
    '.armor-effect-row span',
    '.effect-card dt',
    '.effect-card dd',
    '.biome-tile-subtitle',
    '.biome-chip',
    '.crafting-target-summary',
    '.crafting-fact dt',
    '.crafting-suggestion span',
    '.crafting-selector span',
  ].join(', '))) {
    if (!isVisible(element)) continue;
    if (!textFor(element)) continue;

    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize;
    const minFontSize = viewportWidth < 720 ? 13 : 12;
    const color = parseColor(style.color);

    if (fontSize < minFontSize || lineHeight < fontSize * 1.3) {
      issues.push({
        type: 'weak-meta-type',
        element: nameFor(element),
        text: textFor(element),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      });
    }

    if (fontSize < 14 && color[3] > 0 && color[3] < 0.6) {
      issues.push({
        type: 'weak-meta-color',
        element: nameFor(element),
        text: textFor(element),
        fontSize: style.fontSize,
        lineHeight: style.color,
      });
    }
  }

  for (const control of document.querySelectorAll('.article-category-filter button, .article-row-actions .secondary-button, .favorite-tab, .favorite-page-button, .notification-view-switch button, .search-type-tabs a, .entity-filter, .small-button, .catalog-density-chip')) {
    if (!isVisible(control)) continue;

    const rect = control.getBoundingClientRect();
    if (rect.height < 36 || rect.width < 36) {
      issues.push({
        type: 'small-control',
        element: nameFor(control),
        text: textFor(control),
        size: Math.round(rect.width) + 'x' + Math.round(rect.height),
      });
    }
  }

  return {
    path: location.pathname,
    href: location.href,
    theme: document.documentElement.getAttribute('data-theme'),
    issues,
  };
})()`

await waitFor(`${baseUrl}/`)

const port = Number(process.env.CHROMIUM_REMOTE_DEBUGGING_PORT || 9242)
const browser = await connectToChrome(port)
const failures = []

try {
  await browser.send('Page.enable')
  await browser.send('Runtime.enable')
  await browser.send('Network.enable')

  for (const viewport of viewports) {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    })

    for (const targetTheme of targetThemes) {
      await browser.send('Network.setCookie', {
        name: 'terrapedia-theme',
        value: targetTheme,
        url: `${baseUrl}/`,
        path: '/',
        sameSite: 'Lax',
      })

      for (const route of routes) {
        if (verbose) {
          console.error(`Checking typography spacing route=${route.path} viewport=${viewport.label} theme=${targetTheme}`)
        }
        await navigateAndWait(browser, route)
        await browser.send('Runtime.evaluate', {
          expression: applyThemeExpression(targetTheme),
          returnByValue: true,
        })
        await withTimeout(
          (async () => {
            for (let index = 0; index < 50; index += 1) {
              try {
                const result = await browser.send('Runtime.evaluate', {
                  expression: themeAppliedExpression(targetTheme),
                  returnByValue: true,
                })
                if (result.result.value === true) return
              } catch {}
              await sleep(100)
            }
            throw new Error('theme did not apply')
          })(),
          5000,
          `${targetTheme} applied on ${route.path}`,
        )

        const result = await browser.send('Runtime.evaluate', {
          expression: auditExpression,
          returnByValue: true,
        })
        const value = result.result.value

        if (value.path !== (route.expectedPath || route.path)) {
          failures.push({
            ...value,
            viewport: viewport.label,
            requestedPath: route.path,
            expectedTheme: targetTheme,
            issues: [{
              type: 'wrong-route',
              element: 'location.pathname',
              text: `expected ${route.expectedPath || route.path}, received ${value.path}`,
            }],
          })
          continue
        }

        if (route.authRedirect) {
          continue
        }

        if (value.issues.length > 0) {
          failures.push({
            ...value,
            viewport: viewport.label,
            requestedPath: route.path,
            expectedTheme: targetTheme,
          })
        }
      }
    }
  }
} finally {
  browser.ws.close()
  browser.chrome.kill('SIGTERM')
}

if (failures.length > 0) {
  console.error('Typography spacing audit failed')

  for (const failure of failures) {
    const requested = failure.requestedPath && failure.requestedPath !== failure.path
      ? ` requested=${failure.requestedPath}`
      : ''
    console.error(`- ${failure.path}${requested} viewport=${failure.viewport} theme=${failure.theme} expected=${failure.expectedTheme}`)
    for (const issue of failure.issues.slice(0, 12)) {
      const detail = issue.padding
        ? ` padding=${issue.padding}`
        : issue.size
          ? ` size=${issue.size}`
          : issue.fontSize
            ? ` size=${issue.fontSize} lineHeight=${issue.lineHeight}`
            : ''
      console.error(`  ${issue.type} ${issue.element}${detail} text=${JSON.stringify(issue.text)}`)
    }
  }

  process.exit(1)
}

console.log(`Typography spacing audit passed for ${targetThemes.length} themes, ${viewports.length} viewports, and ${routes.length} routes.`)
