import { mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5174'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const repoRoot = new URL('../..', import.meta.url)
const reportDir = new URL('reports/front-nuxt/preview-image-fallback-runtime/', repoRoot)
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const screenshotDir = new URL(`${runId}/`, reportDir)

const routes = [
  '/items/8',
  '/items/1',
  '/npcs/17',
  '/bosses/35',
  '/buffs',
  '/buffs/1',
  '/biomes',
  '/biomes/1',
  '/armor-sets',
  '/projectiles',
  '/crafting?itemId=675&maxDepth=3',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (url, attempts = 80) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
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
    `--user-data-dir=/tmp/terrapedia-preview-image-fallback-runtime-${port}`,
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
      if (!message.id || !callbacks.has(message.id)) return

      const callback = callbacks.get(message.id)
      callbacks.delete(message.id)
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)))
      else callback.resolve(message.result)
    })

    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      id += 1
      const commandId = id
      const timeout = setTimeout(() => {
        if (!callbacks.has(commandId)) return
        callbacks.delete(commandId)
        reject(new Error(`Timed out waiting for Chrome DevTools command ${method}`))
      }, 15000)

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

const routeSlug = (route) => route
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'root'

const captureScreenshot = async (browser, route) => {
  const screenshot = await browser.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  })
  const path = new URL(`${routeSlug(route)}.png`, screenshotDir)
  writeFileSync(path, Buffer.from(screenshot.data, 'base64'))
  return path.pathname
}

const auditRoute = async (browser, route) => {
  await browser.send('Page.navigate', { url: `${baseUrl}${route}` })
  await browser.send('Page.loadEventFired').catch(() => {})
  await sleep(1300)

  const result = await browser.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const fallbackArts = [...document.querySelectorAll('.tp-preview-image.is-fallback')];
      const missingSemanticIcons = fallbackArts
        .filter((element) => !element.classList.contains('has-fallback-icon'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const row = element.closest('a, article, .source-row, .detail-relation-row, .loot-row, .boss-contract-row, .detail-member-link, .recipe-tree-node, .recipe-station-chip, .biome-tile, .armor-card, .projectile-card, .effect-card');
          return {
            fallback: element.getAttribute('data-fallback'),
            text: (row?.textContent || element.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });

      const semanticFallbacks = fallbackArts
        .filter((element) => element.classList.contains('has-fallback-icon'))
        .map((element) => ({
          fallback: element.getAttribute('data-fallback'),
          icon: [...element.querySelector('.preview-fallback-icon')?.classList ?? []].filter((name) => name.startsWith('icon-')).join(' '),
        }));

      return {
        title: document.title,
        fallbackCount: fallbackArts.length,
        semanticFallbackCount: semanticFallbacks.length,
        missingSemanticCount: missingSemanticIcons.length,
        missingSemanticIcons,
        semanticFallbacks: semanticFallbacks.slice(0, 12),
        brokenImageCount: [...document.images].filter((image) => image.currentSrc && image.complete && image.naturalWidth === 0).length,
      };
    })()`,
  })

  return result.result.value
}

mkdirSync(screenshotDir, { recursive: true })

const port = 9333 + Math.floor(Math.random() * 200)
const browser = await connectToChrome(port)
const failures = []
const results = []

try {
  await browser.send('Page.enable')
  await browser.send('Runtime.enable')
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  for (const route of routes) {
    const audit = await auditRoute(browser, route)
    const screenshotPath = await captureScreenshot(browser, route)
    const row = { route, screenshotPath, ...audit }
    results.push(row)

    if (audit.brokenImageCount > 0) {
      failures.push(`${route}: ${audit.brokenImageCount} broken rendered images`)
    }

    if (audit.missingSemanticCount > 0) {
      failures.push(`${route}: ${audit.missingSemanticCount} fallback images still use glyph-only fallback`)
    }
  }
} finally {
  browser.ws.close()
  browser.chrome.kill('SIGTERM')
}

const reportPath = new URL('latest.json', reportDir)
writeFileSync(reportPath, JSON.stringify({
  baseUrl,
  runId,
  results,
  failures,
}, null, 2))

if (failures.length > 0) {
  console.error(`Preview image runtime fallback audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  console.error(`Report: ${reportPath.pathname}`)
  process.exit(1)
}

console.log(`Preview image runtime fallback audit passed for ${routes.length} routes.`)
console.log(`Report: ${reportPath.pathname}`)
