import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const root = new URL('..', import.meta.url)
const baseUrl = (process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5174').replace(/\/$/, '')
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const cdpCommandTimeoutMs = Number(process.env.HOME_VISUAL_CDP_TIMEOUT_MS || 15000)
const outputRoot = new URL('test-results/home-visual-lightweight/', root)
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = new URL(`${runId}/`, outputRoot)
const screenshotsDir = new URL('screenshots/', outputDir)
const metricsPath = new URL('metrics.json', outputDir)
const failures = []
const metrics = []

const themes = ['dark', 'light', 'morning-paper', 'warm-slate']
const normalizeRuntimeTheme = (theme) => theme === 'light' ? 'morning-paper' : theme
const viewports = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: false },
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'wide', width: 1728, height: 1050, mobile: false },
]

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
    `--user-data-dir=/tmp/terrapedia-home-visual-${port}`,
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
      ws.send(JSON.stringify({ id: commandId, method, params }))
    })

    return { chrome, send, ws }
  } catch (error) {
    chrome.kill('SIGTERM')
    throw error
  }
}

const evaluateJson = async (browser, expression, context) => {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })

  if (result?.exceptionDetails) {
    throw new Error(`${context}: ${JSON.stringify(result.exceptionDetails)}`)
  }

  if (result?.result?.value === undefined) {
    throw new Error(`${context}: Runtime.evaluate returned no serializable value`)
  }

  return result.result.value
}

const setViewport = async (browser, viewport) => {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  })
}

const captureScreenshot = async (browser, theme, viewport) => {
  const screenshot = await browser.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  const name = `${theme}-${viewport.name}-${viewport.width}x${viewport.height}.png`
  const path = new URL(name, screenshotsDir)
  writeFileSync(path, Buffer.from(screenshot.data, 'base64'))
  return path.pathname
}

const assertMetric = (condition, message, details) => {
  if (!condition) {
    failures.push(`${message}: ${JSON.stringify(details)}`)
  }
}

const auditExpression = (theme) => `(() => new Promise((resolve) => {
  const round = (value) => Math.round(value * 100) / 100;
  const rectOf = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: round(rect.left),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      width: round(rect.width),
      height: round(rect.height),
    };
  };
  const isVisible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0.05
      && rect.width > 1
      && rect.height > 1
      && rect.bottom > 0
      && rect.top < window.innerHeight
      && rect.right > 0
      && rect.left < document.documentElement.clientWidth;
  };
  const parseRgb = (value) => (value || '')
    .split(',')
    .slice(0, 3)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  const colorDistance = (a, b) => {
    if (a.length < 3 || b.length < 3) return Number.POSITIVE_INFINITY;
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  };
  const maxAccentAlpha = (element, style) => {
    if (!element) return 0;
    const entryAccent = parseRgb(style.getPropertyValue('--entry-accent'));
    const stageAccent = parseRgb(style.getPropertyValue('--stage-accent'));
    const themeGold = parseRgb(style.getPropertyValue('--theme-gold-rgb'));
    const candidates = [entryAccent, stageAccent, themeGold, [217, 185, 91], [240, 207, 116], [255, 215, 101]]
      .filter((candidate) => candidate.length === 3);
    const source = style.backgroundImage;
    const rgbaMatches = [...source.matchAll(/rgba?\\(\\s*([0-9.]+)[, ]+\\s*([0-9.]+)[, ]+\\s*([0-9.]+)(?:[, /]+\\s*([0-9.]+%?))?\\s*\\)/g)];
    let max = 0;
    for (const match of rgbaMatches) {
      const rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
      const alphaRaw = match[4] ?? '1';
      const alpha = alphaRaw.endsWith('%') ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
      if (!Number.isFinite(alpha)) continue;
      const nearAccent = candidates.some((candidate) => colorDistance(rgb, candidate) <= 90);
      if (nearAccent) max = Math.max(max, alpha);
    }
    const colorMixMatches = [...source.matchAll(/color-mix\\([^)]*?(\\d+(?:\\.\\d+)?)%[^)]*\\)/g)];
    for (const match of colorMixMatches) {
      max = Math.max(max, Number(match[1]) / 100);
    }
    return round(max);
  };
  const inspect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return { selector, missing: true };
    const style = getComputedStyle(element);
    return {
      selector,
      missing: false,
      visible: isVisible(element),
      rect: rectOf(element),
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderLeftColor: style.borderLeftColor,
      color: style.color,
      maxAccentAlpha: maxAccentAlpha(element, style),
    };
  };
  const startedAt = Date.now();
  const targetTheme = ${JSON.stringify(theme)};
  const runtimeTheme = ${JSON.stringify(normalizeRuntimeTheme(theme))};
  document.cookie = 'terrapedia-theme=' + runtimeTheme + '; Path=/; SameSite=Lax';
  document.documentElement.setAttribute('data-theme', runtimeTheme);
  window.localStorage.setItem('terrapedia-theme', runtimeTheme);
  const tick = () => {
    const primaryEntries = [...document.querySelectorAll('.hero-j1-grid .hero-j1-cell')];
    const secondaryLinks = [...document.querySelectorAll('.hero-j1-paths .hero-j1-path-link')];
    const stageChips = [...document.querySelectorAll('.hero-stage-chip')];
    const search = document.querySelector('.hero-j1-search');
    const searchButton = document.querySelector('.hero-j1-search-btn');
    const bossCta = document.querySelector('.boss-route-cta');
    const atlas = document.querySelector('.home-atlas-secondary');
    const grid = document.querySelector('.hero-j1-grid');
    const secondary = document.querySelector('.hero-j1-paths');
    const status = document.querySelector('.hero-status-line');
    const ready = document.readyState !== 'loading'
      && primaryEntries.length > 0
      && secondaryLinks.length > 0
      && search
      && document.documentElement.getAttribute('data-theme') === runtimeTheme;

    if (!ready && Date.now() - startedAt < 3000) {
      setTimeout(tick, 100);
      return;
    }

    const searchRect = rectOf(search);
    const gridRect = rectOf(grid);
    const secondaryRect = rectOf(secondary);
    const statusRect = rectOf(status);
    const firstPrimaryRect = rectOf(primaryEntries[0]);
    const bossCtaRect = rectOf(bossCta);
    const bossUrl = bossCta ? new URL(bossCta.getAttribute('href'), location.origin) : null;

    resolve({
      theme: targetTheme,
      expectedRuntimeTheme: runtimeTheme,
      actualTheme: document.documentElement.getAttribute('data-theme'),
      viewport: {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      },
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      primaryCount: primaryEntries.length,
      secondaryCount: secondaryLinks.length,
      stageChipCount: stageChips.length,
      searchVisible: isVisible(search),
      searchTop: searchRect?.top ?? null,
      searchBottom: searchRect?.bottom ?? null,
      searchTopRatio: searchRect ? round(searchRect.top / window.innerHeight) : null,
      firstPrimaryTop: firstPrimaryRect?.top ?? null,
      atlasVisible: isVisible(atlas),
      statusAfterSecondary: Boolean(statusRect && secondaryRect && statusRect.top >= secondaryRect.top),
      primaryMinHeight: primaryEntries.reduce((min, element) => Math.min(min, element.getBoundingClientRect().height), Number.POSITIVE_INFINITY),
      stageChipMinHeight: stageChips.reduce((min, element) => Math.min(min, element.getBoundingClientRect().height), Number.POSITIVE_INFINITY),
      secondaryMinHeight: secondaryLinks.reduce((min, element) => Math.min(min, element.getBoundingClientRect().height), Number.POSITIVE_INFINITY),
      searchButtonHeight: searchButton?.getBoundingClientRect().height ?? 0,
      bossCtaVisible: isVisible(bossCta),
      bossCtaHeight: bossCtaRect?.height ?? 0,
      bossCtaPathname: bossUrl?.pathname ?? null,
      inspected: {
        primary: inspect('.hero-j1-cell'),
        search: inspect('.hero-j1-search'),
        searchButton: inspect('.hero-j1-search-btn'),
        stageChip: inspect('.hero-stage-chip'),
        secondaryLink: inspect('.hero-j1-path-link'),
        atlasIndex: inspect('.home-atlas-secondary .atlas-index'),
        bossCta: inspect('.boss-route-cta'),
      },
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(tick));
}))()`

const run = async () => {
  rmSync(outputRoot, { recursive: true, force: true })
  mkdirSync(screenshotsDir, { recursive: true })

  const response = await fetch(`${baseUrl}/`)
  if (!response.ok) {
    failures.push(`/: expected HTTP 200, received ${response.status}`)
  }

  const port = 9400 + Math.floor(Math.random() * 400)
  const browser = await connectToChrome(port)

  try {
    await browser.send('Page.enable')
    await browser.send('Runtime.enable')

    for (const viewport of viewports) {
      await setViewport(browser, viewport)

      for (const theme of themes) {
        await browser.send('Page.navigate', { url: `${baseUrl}/` })
        await sleep(650)
        const value = await evaluateJson(browser, auditExpression(theme), `${theme}/${viewport.name}`)
        const screenshotPath = await captureScreenshot(browser, theme, viewport)
        value.screenshotPath = screenshotPath
        metrics.push(value)

        const label = `${theme}/${viewport.width}x${viewport.height}`
        const maxPrimaryAccentAlpha = value.inspected.primary.maxAccentAlpha
        const alphaLimit = theme === 'dark' ? 0.10 : 0.08

        assertMetric(value.actualTheme === normalizeRuntimeTheme(theme), `${label}: expected theme to apply`, value)
        assertMetric(value.primaryCount === 4, `${label}: primary entry count must stay 4`, value)
        assertMetric(value.secondaryCount === 6, `${label}: secondary link count must stay 6`, value)
        assertMetric(value.searchVisible, `${label}: search must be visible`, value)
        assertMetric(value.searchTopRatio !== null && value.searchTopRatio < 0.45, `${label}: search must stay high in first flow`, value)
        assertMetric(value.scrollWidth <= value.clientWidth + 1 && value.bodyScrollWidth <= value.clientWidth + 1, `${label}: page must not overflow horizontally`, value)
        assertMetric(value.primaryMinHeight >= 44, `${label}: primary entries must be at least 44px tall`, value)
        assertMetric(value.stageChipMinHeight >= 44, `${label}: stage chips must be at least 44px tall`, value)
        assertMetric(value.secondaryMinHeight >= 44, `${label}: secondary links must be at least 44px tall`, value)
        assertMetric(value.searchButtonHeight >= 44, `${label}: search button must be at least 44px tall`, value)
        assertMetric(value.bossCtaHeight >= 44, `${label}: Boss CTA must be at least 44px tall`, value)
        assertMetric(value.bossCtaPathname === '/bosses', `${label}: Boss CTA must link to /bosses`, value)
        assertMetric(value.statusAfterSecondary, `${label}: status line must remain after secondary shortcuts`, value)
        assertMetric(maxPrimaryAccentAlpha <= alphaLimit, `${label}: primary entry accent alpha must be <= ${alphaLimit}`, value.inspected.primary)

        if (viewport.width <= 390) {
          assertMetric(!value.atlasVisible, `${label}: mobile atlas must be hidden`, value)
          assertMetric(value.searchBottom < value.viewport.height * 0.72, `${label}: mobile search must not consume first screen`, value)
          assertMetric(value.firstPrimaryTop < value.viewport.height * 0.92, `${label}: first primary entry must begin in first screen`, value)
        }
      }
    }
  } finally {
    browser.ws.close()
    browser.chrome.kill('SIGTERM')
  }

  writeFileSync(metricsPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    runId,
    failureCount: failures.length,
    screenshotCount: metrics.length,
    failures,
    metrics,
  }, null, 2)}\n`)

  if (failures.length > 0) {
    console.error(`Home visual lightweight checks failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
    console.error(`Metrics written to ${metricsPath.pathname}`)
    process.exit(1)
  }

  console.log(`Home visual lightweight checks passed for ${themes.length} themes x ${viewports.length} viewports.`)
  console.log(`Metrics written to ${metricsPath.pathname}`)
}

run().catch((error) => {
  console.error(error?.stack ?? error?.message ?? error)
  process.exit(1)
})
