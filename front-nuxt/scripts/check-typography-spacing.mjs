import { spawn } from 'node:child_process'

const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5176'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const targetThemes = ['dark', 'morning-paper', 'warm-slate']
const routes = ['/', '/articles', '/user', '/user/articles', '/user/favorites', '/user/notifications', '/user/settings']
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

const auditExpression = `(() => {
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

  if (document.documentElement.scrollWidth > viewportWidth + 2) {
    issues.push({
      type: 'horizontal-overflow',
      element: 'document',
      text: String(document.documentElement.scrollWidth - viewportWidth),
    });
  }

  for (const element of document.querySelectorAll('.tp-data-panel, .support-panel.article-table-panel, .article-table-row, .favorite-card, .user-feed-row, .notification-inbox-row, .settings-panel')) {
    if (!isVisible(element)) continue;

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

  for (const element of document.querySelectorAll('.tp-data-meta, .article-table-grid--head span, .article-time-cell span, .article-status-cell small, .article-next-step span, .favorite-card span, .user-feed-row span, .notification-inbox-row span, .settings-list span')) {
    if (!isVisible(element)) continue;

    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize;
    const minFontSize = viewportWidth < 720 ? 13 : 12;

    if (fontSize < minFontSize || lineHeight < fontSize * 1.3) {
      issues.push({
        type: 'weak-meta-type',
        element: nameFor(element),
        text: textFor(element),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      });
    }
  }

  for (const control of document.querySelectorAll('.article-category-filter button, .article-row-actions .secondary-button, .favorite-tab, .favorite-page-button, .notification-view-switch button')) {
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
        const loaded = browser.once('Page.loadEventFired')
        await browser.send('Page.navigate', { url: `${baseUrl}${route}` })
        await withTimeout(loaded, 5000, `load event for ${route}`).catch(() => {})
        await browser.send('Runtime.evaluate', {
          expression: applyThemeExpression(targetTheme),
          returnByValue: true,
        })
        await withTimeout(
          (async () => {
            for (let index = 0; index < 50; index += 1) {
              const result = await browser.send('Runtime.evaluate', {
                expression: themeAppliedExpression(targetTheme),
                returnByValue: true,
              })
              if (result.result.value === true) return
              await sleep(100)
            }
            throw new Error('theme did not apply')
          })(),
          5000,
          `${targetTheme} applied on ${route}`,
        )

        const result = await browser.send('Runtime.evaluate', {
          expression: auditExpression,
          returnByValue: true,
        })
        const value = result.result.value

        if (value.issues.length > 0) {
          failures.push({ ...value, viewport: viewport.label, expectedTheme: targetTheme })
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
    console.error(`- ${failure.path} viewport=${failure.viewport} theme=${failure.theme} expected=${failure.expectedTheme}`)
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
