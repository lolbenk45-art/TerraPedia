import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'

const baseUrl = (process.env.THEME_TOKEN_PARITY_BASE || 'http://localhost:5176').replace(/\/+$/, '')
const outputDir = resolve(process.cwd(), process.env.THEME_TOKEN_PARITY_OUT || 'test-results/theme-token-parity')
const mode = process.env.THEME_TOKEN_PARITY_MODE
const baselinePath = resolve(process.cwd(), process.env.THEME_TOKEN_PARITY_BASELINE || join(outputDir, 'baseline.json'))
const candidatePath = join(outputDir, 'candidate.json')
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const timeoutMs = Number(process.env.THEME_TOKEN_PARITY_TIMEOUT_MS || 15000)
const commandTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000

const themes = ['dark', 'morning-paper', 'warm-slate']
const routes = ['/', '/items', '/armor-sets']
const routeReadiness = {
  '/': { selector: '.home-main', childSelector: null, minimumContentCount: 0 },
  '/items': {
    selector: '.catalog-wall-grid[aria-label="物品图标墙"]',
    childSelector: '.catalog-wall-cell',
    minimumContentCount: 1,
  },
  '/armor-sets': {
    selector: '.armor-grid[aria-label="套装列表"]',
    childSelector: '.armor-card-live',
    minimumContentCount: 1,
  },
}
const viewports = [
  { name: 'mobile', width: 390, height: 900, mobile: true },
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
]
const recordFields = ['key', 'theme', 'route', 'viewport', 'actualTheme', 'path', 'sha256']
const expectedKeys = new Set(themes.flatMap((theme) => routes.flatMap((route) => (
  viewports.map((viewport) => `${theme}|${route}|${viewport.name}`)
))))

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

const withTimeout = (promise, label, durationMs = commandTimeoutMs) => new Promise((resolveTimeout, rejectTimeout) => {
  const timeout = setTimeout(() => rejectTimeout(new Error(`Timed out waiting for ${label}`)), durationMs)
  Promise.resolve(promise).then(
    (value) => {
      clearTimeout(timeout)
      resolveTimeout(value)
    },
    (error) => {
      clearTimeout(timeout)
      rejectTimeout(error)
    },
  )
})

const fetchWithDeadline = async (url, options = {}, durationMs = commandTimeoutMs) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), durationMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const waitForHttp = async (url, getFailure = null) => {
  const deadline = Date.now() + commandTimeoutMs

  while (Date.now() < deadline) {
    const failure = getFailure?.()
    if (failure) throw failure
    try {
      const response = await fetchWithDeadline(url, {}, Math.min(1000, Math.max(1, deadline - Date.now())))
      if (response.ok) return
    } catch {}

    const nextFailure = getFailure?.()
    if (nextFailure) throw nextFailure

    await sleep(100)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

const assertLoopbackBaseUrl = () => {
  let parsed
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error(`THEME_TOKEN_PARITY_BASE must be a loopback http URL, received ${baseUrl}`)
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (parsed.protocol !== 'http:' || !loopbackHosts.has(parsed.hostname)) {
    throw new Error(`THEME_TOKEN_PARITY_BASE must use http loopback (localhost, 127.0.0.1, or ::1), received ${baseUrl}`)
  }
}

const routeUrl = (route) => new URL(route, `${baseUrl}/`).href

const safeName = (value) => String(value)
  .replace(/^\/+|\/+$/g, '')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '') || 'home'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const createManifest = (records) => ({
  baseUrl,
  generatedAt: new Date().toISOString(),
  themes,
  routes,
  viewports,
  records,
})

const profileRoot = resolve('/tmp')
const createProfileDir = () => resolve(profileRoot, `terrapedia-theme-token-parity-${process.pid}-${Date.now()}`)

const removeProfileDir = (profileDir) => {
  const expectedPrefix = `${profileRoot}/terrapedia-theme-token-parity-${process.pid}-`
  if (!profileDir || !resolve(profileDir).startsWith(expectedPrefix)) {
    throw new Error(`Refusing to remove non-isolated Chrome profile ${profileDir || '(missing)'}`)
  }
  rmSync(profileDir, { recursive: true, force: true })
}

const waitForChromeExit = (chrome) => {
  if (!chrome || chrome.exitCode !== null || chrome.signalCode !== null) return Promise.resolve()
  return new Promise((resolveExit) => {
    chrome.once('exit', resolveExit)
    chrome.once('error', resolveExit)
  })
}

const closeChrome = async ({ chrome, ws, profileDir }) => {
  try {
    ws?.close()
  } catch {}

  const exited = waitForChromeExit(chrome)
  if (chrome && !chrome.killed && chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGTERM')
  try {
    await withTimeout(exited, 'Chrome shutdown')
  } catch {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL')
    await exited
  }
  removeProfileDir(profileDir)
}

const connectToChrome = async () => {
  const port = 19000 + (process.pid % 10000)
  const profileDir = createProfileDir()
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })
  let chromeError = null
  chrome.on('error', (error) => {
    chromeError = new Error(`Chrome failed to start: ${error.message || String(error)}`)
  })

  try {
    await waitForHttp(`http://127.0.0.1:${port}/json/version`, () => chromeError)
    const target = await withTimeout(
      fetchWithDeadline(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
        .then((response) => {
          if (!response.ok) throw new Error(`Chrome target creation returned ${response.status}`)
          return response.json()
        }),
      'Chrome target creation',
    )
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    const callbacks = new Map()
    const eventListeners = new Map()
    let commandId = 0

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && callbacks.has(message.id)) {
        const callback = callbacks.get(message.id)
        callbacks.delete(message.id)
        clearTimeout(callback.timeout)

        if (message.error) {
          callback.reject(new Error(JSON.stringify(message.error)))
        } else {
          callback.resolve(message.result)
        }
      }

      if (message.method && eventListeners.has(message.method)) {
        for (const listener of eventListeners.get(message.method)) listener(message.params)
      }
    })

    ws.addEventListener('close', () => {
      for (const callback of callbacks.values()) {
        clearTimeout(callback.timeout)
        callback.reject(new Error('Chrome DevTools connection closed'))
      }
      callbacks.clear()
    })

    await withTimeout(new Promise((resolveOpen, rejectOpen) => {
      ws.addEventListener('open', resolveOpen, { once: true })
      ws.addEventListener('error', () => rejectOpen(new Error('Chrome DevTools WebSocket failed to open')), { once: true })
    }), 'Chrome DevTools WebSocket')

    const send = (method, params = {}, durationMs = commandTimeoutMs) => new Promise((resolveCommand, rejectCommand) => {
      commandId += 1
      const id = commandId
      const timeout = setTimeout(() => {
        if (!callbacks.has(id)) return
        callbacks.delete(id)
        rejectCommand(new Error(`Timed out waiting for Chrome DevTools command ${method}`))
      }, durationMs)

      callbacks.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout })
      ws.send(JSON.stringify({ id, method, params }))
    })

    const once = (method) => new Promise((resolveEvent) => {
      const listener = (params) => {
        eventListeners.get(method)?.delete(listener)
        resolveEvent(params)
      }
      if (!eventListeners.has(method)) eventListeners.set(method, new Set())
      eventListeners.get(method).add(listener)
    })

    return { chrome, ws, send, once, profileDir }
  } catch (error) {
    await closeChrome({ chrome, profileDir })
    throw error
  }
}

const evaluateJson = async (browser, expression, label, durationMs = commandTimeoutMs) => {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, durationMs)

  if (result.exceptionDetails) {
    throw new Error(`${label}: ${JSON.stringify(result.exceptionDetails)}`)
  }
  if (result?.result?.value === undefined) {
    throw new Error(`${label}: Runtime.evaluate returned no serializable value`)
  }

  return result.result.value
}

const setViewport = (browser, viewport) => browser.send('Emulation.setDeviceMetricsOverride', {
  width: viewport.width,
  height: viewport.height,
  deviceScaleFactor: 1,
  mobile: viewport.mobile,
})

const applyThemeExpression = (theme) => `(() => {
  const theme = ${JSON.stringify(theme)};
  document.cookie = 'terrapedia-theme=' + encodeURIComponent(theme) + '; Path=/; SameSite=Lax';
  window.localStorage.setItem('terrapedia-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  if (!document.getElementById('theme-token-parity-freeze')) {
    const style = document.createElement('style');
    style.id = 'theme-token-parity-freeze';
    style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important;}';
    document.head.appendChild(style);
  }
  return { actualTheme: document.documentElement.getAttribute('data-theme') };
})()`

const readinessExpression = (route, theme) => {
  const expected = new URL(route, `${baseUrl}/`)
  const readiness = routeReadiness[route]
  return `(async () => {
    const expectedPath = ${JSON.stringify(expected.pathname)};
    const expectedSearch = ${JSON.stringify(expected.search)};
    const expectedRoute = ${JSON.stringify(route)};
    const selector = ${JSON.stringify(readiness.selector)};
    const childSelector = ${JSON.stringify(readiness.childSelector)};
    const minimumContentCount = ${readiness.minimumContentCount};
    const expectedTheme = ${JSON.stringify(theme)};
    const startedAt = Date.now();
    const deadline = startedAt + ${Math.max(100, Math.min(commandTimeoutMs - 500, 8000))};
    const decodeStates = new WeakMap();
    const nextFrame = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.05
        && rect.width > 1
        && rect.height > 1;
    };
    const intersectsViewport = (element) => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight;
    };
    const roundedRect = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const round = (value) => Math.round(value * 1000) / 1000;
      return {
        x: round(rect.x),
        y: round(rect.y),
        top: round(rect.top),
        right: round(rect.right),
        bottom: round(rect.bottom),
        left: round(rect.left),
        width: round(rect.width),
        height: round(rect.height),
      };
    };
    const styleSignature = (element, properties) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    };
    const startDecode = (image) => {
      if (typeof image.decode !== 'function') return;
      const source = image.currentSrc || image.src || '';
      const currentDecode = decodeStates.get(image);
      if (currentDecode?.source === source) return;
      const decodeState = { source, status: 'pending' };
      decodeStates.set(image, decodeState);
      image.decode().then(
        () => {
          if (decodeStates.get(image) === decodeState) decodeState.status = 'resolved';
        },
        (error) => {
          if (decodeStates.get(image) === decodeState) {
            decodeState.status = 'rejected:' + (error?.message || String(error));
          }
        },
      );
    };
    const snapshot = () => {
      const body = document.body;
      const documentElement = document.documentElement;
      const hasBodySize = Boolean(body && body.scrollWidth > 1 && body.scrollHeight > 1);
      const contentRoot = document.querySelector(selector);
      const selectorPresent = Boolean(contentRoot);
      const selectorVisible = visible(contentRoot);
      const contentCount = contentRoot
        ? (childSelector ? contentRoot.querySelectorAll(childSelector).length : contentRoot.children.length)
        : 0;
      const selectorReady = selectorVisible && contentCount >= minimumContentCount;
      const isTargetRoute = location.pathname === expectedPath && location.search === expectedSearch;
      const typographyElement = contentRoot?.querySelector('h1, h2, h3, p, button, input') || contentRoot;
      const navigation = document.querySelector('.site-nav');
      const visibleImages = Array.from(document.images).filter(intersectsViewport);
      for (const image of visibleImages) {
        if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) startDecode(image);
      }
      const imageState = visibleImages.map((image, index) => {
        const fallback = Boolean(image.closest('.tp-preview-image.is-fallback'));
        const source = image.currentSrc || image.src || '';
        const currentDecode = decodeStates.get(image);
        const decodeState = typeof image.decode !== 'function'
          ? 'unsupported'
          : (currentDecode?.source === source ? currentDecode.status : 'not-started');
        return {
          index,
          src: source,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          fallback,
          decodeState,
          ready: fallback || (
            image.complete
            && image.naturalWidth > 0
            && image.naturalHeight > 0
            && (decodeState === 'resolved' || decodeState === 'unsupported')
          ),
        };
      });
      const visibleFallbacks = Array.from(document.querySelectorAll('.tp-preview-image.is-fallback'))
        .filter(intersectsViewport)
        .map((element, index) => ({
          index,
          fallback: element.getAttribute('data-fallback') || '',
          source: element.getAttribute('data-source-image') || '',
        }));
      const geometry = {
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: documentElement?.clientWidth ?? null,
          clientHeight: documentElement?.clientHeight ?? null,
        },
        documentScroll: {
          width: documentElement?.scrollWidth ?? null,
          height: documentElement?.scrollHeight ?? null,
        },
        bodyScroll: {
          width: body?.scrollWidth ?? null,
          height: body?.scrollHeight ?? null,
        },
        contentRect: roundedRect(contentRoot),
        contentChildCount: contentRoot?.children.length ?? 0,
        matchedContentCount: contentCount,
        fontStatus: document.fonts?.status ?? 'unsupported',
        typography: styleSignature(typographyElement, [
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'letter-spacing',
        ]),
        navigationStyle: styleSignature(navigation, [
          'background-color',
          'background-image',
          'backdrop-filter',
          'filter',
        ]),
      };
      return {
        route: expectedRoute,
        expectedPath,
        expectedSearch,
        actualPath: location.pathname,
        actualSearch: location.search,
        readyState: document.readyState,
        hasBodySize,
        selector,
        childSelector,
        minimumContentCount,
        selectorPresent,
        selectorVisible,
        selectorReady,
        contentCount,
        isTargetRoute,
        actualTheme: documentElement?.getAttribute('data-theme') ?? null,
        imageState,
        visibleFallbacks,
        imagesReady: imageState.every((image) => image.ready),
        geometry,
      };
    };
    let current = snapshot();
    while (
      Date.now() < deadline
      && !(
        current.readyState !== 'loading'
        && current.isTargetRoute
        && current.hasBodySize
        && current.selectorReady
      )
    ) {
      await nextFrame();
      current = snapshot();
    }
    if (!(
      current.readyState !== 'loading'
      && current.isTargetRoute
      && current.hasBodySize
      && current.selectorReady
    )) {
      return { ready: false, phase: 'content', elapsedMs: Date.now() - startedAt, ...current };
    }

    document.cookie = 'terrapedia-theme=' + encodeURIComponent(expectedTheme) + '; Path=/; SameSite=Lax';
    window.localStorage.setItem('terrapedia-theme', expectedTheme);
    document.documentElement.setAttribute('data-theme', expectedTheme);

    const fonts = document.fonts;
    const fontsReadyPromise = document.fonts ? document.fonts.ready : null;
    let fontsReady = !fontsReadyPromise;
    let fontsError = null;
    if (fontsReadyPromise) {
      const remaining = Math.max(0, deadline - Date.now());
      const result = await new Promise((resolveFonts) => {
        const timeout = setTimeout(
          () => resolveFonts({ ready: false, error: 'timed out waiting for document.fonts.ready' }),
          remaining,
        );
        fontsReadyPromise.then(
          () => {
            clearTimeout(timeout);
            resolveFonts({ ready: true, error: null });
          },
          (error) => {
            clearTimeout(timeout);
            resolveFonts({ ready: false, error: error?.message || String(error) });
          },
        );
      });
      fontsReady = result.ready;
      fontsError = result.error;
    }

    window.scrollTo(0, 0);
    await nextFrame();

    let stableFrameCount = 0;
    let previousSignature = null;
    while (Date.now() < deadline) {
      current = snapshot();
      current.fonts = {
        supported: Boolean(fonts),
        ready: fontsReady,
        status: fonts?.status ?? 'unsupported',
        error: fontsError,
      };
      const signature = JSON.stringify({
        actualTheme: current.actualTheme,
        selectorReady: current.selectorReady,
        contentCount: current.contentCount,
        imagesReady: current.imagesReady,
        imageState: current.imageState,
        visibleFallbacks: current.visibleFallbacks,
        geometry: current.geometry,
      });
      const frameReady = fontsReady
        && current.actualTheme === expectedTheme
        && current.readyState !== 'loading'
        && current.isTargetRoute
        && current.hasBodySize
        && current.selectorReady
        && current.imagesReady
        && window.scrollX === 0
        && window.scrollY === 0;
      stableFrameCount = frameReady && signature === previousSignature ? stableFrameCount + 1 : (frameReady ? 1 : 0);
      previousSignature = signature;
      if (stableFrameCount >= 3) {
        return {
          ready: true,
          phase: 'stable',
          elapsedMs: Date.now() - startedAt,
          stableFrameCount,
          signature: JSON.parse(signature),
          ...current,
        };
      }
      await nextFrame();
    }

    return {
      ready: false,
      phase: 'stability',
      elapsedMs: Date.now() - startedAt,
      stableFrameCount,
      lastSignature: previousSignature ? JSON.parse(previousSignature) : null,
      scroll: { x: window.scrollX, y: window.scrollY },
      ...current,
    };
  })()`
}

const captureStableScreenshot = async (browser, key, domSignature) => {
  const deadline = Date.now() + commandTimeoutMs
  const attemptHashes = []
  let previousScreenshotHash = null
  let stableScreenshotCount = 0
  const failure = (reason) => new Error(
    `pixel stability failed (${reason}); attemptHashes=${JSON.stringify(attemptHashes)}; DOM signature=${JSON.stringify(domSignature)}`,
  )

  while (Date.now() < deadline) {
    const screenshotRemaining = deadline - Date.now()
    if (screenshotRemaining <= 0) break
    let screenshot
    try {
      screenshot = await browser.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      }, screenshotRemaining)
    } catch (error) {
      throw failure(error.message || String(error))
    }
    const buffer = Buffer.from(screenshot.data, 'base64')
    const currentHash = sha256(buffer)
    attemptHashes.push(currentHash)
    stableScreenshotCount = currentHash === previousScreenshotHash ? stableScreenshotCount + 1 : 1

    if (stableScreenshotCount >= 3) {
      return { buffer, sha256: currentHash }
    }

    previousScreenshotHash = currentHash
    const remaining = deadline - Date.now()
    if (remaining > 0) {
      try {
        await evaluateJson(
          browser,
          'new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame(true))))',
          `${key} pixel stability frame`,
          remaining,
        )
      } catch (error) {
        throw failure(error.message || String(error))
      }
    }
  }

  throw failure('deadline exceeded')
}

const captureMatrix = async (browser, failures) => {
  const captures = []

  for (const theme of themes) {
    for (const route of routes) {
      for (const viewport of viewports) {
        const key = `${theme}|${route}|${viewport.name}`
        try {
          await setViewport(browser, viewport)
          await browser.send('Network.setCookie', {
            name: 'terrapedia-theme',
            value: theme,
            url: `${baseUrl}/`,
            path: '/',
            sameSite: 'Lax',
          })
          const loaded = browser.once('Page.loadEventFired')
          await browser.send('Page.navigate', { url: routeUrl(route) })
          await withTimeout(loaded, `${key} navigation load event`)
          const applied = await evaluateJson(browser, applyThemeExpression(theme), `${key} theme application`)
          if (typeof applied?.actualTheme !== 'string' || applied.actualTheme !== theme) {
            failures.push(`${key}: expected serializable actualTheme ${theme}, received ${JSON.stringify(applied?.actualTheme)}`)
          }

          const ready = await evaluateJson(browser, readinessExpression(route, theme), `${key} route readiness`)
          if (!ready.ready) {
            throw new Error(`route readiness failed (${JSON.stringify(ready)})`)
          }

          const actualTheme = ready?.actualTheme
          if (typeof actualTheme !== 'string' || actualTheme !== theme) {
            failures.push(`${key}: final actualTheme must be ${theme}, received ${JSON.stringify(actualTheme)}`)
          }

          const stableScreenshot = await captureStableScreenshot(browser, key, ready.signature)
          captures.push({
            name: `${safeName(theme)}-${safeName(route)}-${viewport.name}.png`,
            buffer: stableScreenshot.buffer,
            record: {
              key,
              theme,
              route,
              viewport: viewport.name,
              actualTheme,
              sha256: stableScreenshot.sha256,
            },
          })
        } catch (error) {
          failures.push(`${key}: ${error.message || String(error)}`)
        }
      }
    }
  }

  return captures
}

const buildRecords = (captures, screenshotDir) => captures.map(({ name, record }) => ({
  ...record,
  path: relative(outputDir, join(screenshotDir, name)),
}))

const publishCaptureArtifacts = (captures, screenshotDir, manifestPath, manifest) => {
  const suffix = `${process.pid}-${Date.now()}`
  const temporaryScreenshotDir = join(resolve(screenshotDir, '..'), `.${safeName(screenshotDir)}.tmp-${suffix}`)
  const temporaryManifestPath = join(resolve(manifestPath, '..'), `.${safeName(manifestPath)}.tmp-${suffix}`)
  const publications = [
    { finalPath: screenshotDir, temporaryPath: temporaryScreenshotDir, backupPath: `${screenshotDir}.bak-${suffix}` },
    { finalPath: manifestPath, temporaryPath: temporaryManifestPath, backupPath: `${manifestPath}.bak-${suffix}` },
  ]
  const backedUp = []
  const published = []
  let committed = false
  const cleanupFailures = []
  const cleanup = (path) => {
    try {
      rmSync(path, { recursive: true, force: true })
    } catch (error) {
      cleanupFailures.push(`${path}: ${error.message || String(error)}`)
    }
  }

  try {
    mkdirSync(resolve(screenshotDir, '..'), { recursive: true })
    mkdirSync(resolve(manifestPath, '..'), { recursive: true })
    mkdirSync(temporaryScreenshotDir)
    for (const { name, buffer } of captures) writeFileSync(join(temporaryScreenshotDir, name), buffer)
    writeFileSync(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    for (const publication of publications) {
      if (!existsSync(publication.finalPath)) continue
      renameSync(publication.finalPath, publication.backupPath)
      backedUp.push(publication)
    }
    for (const publication of publications) {
      renameSync(publication.temporaryPath, publication.finalPath)
      published.push(publication)
    }
    committed = true
    for (const publication of backedUp) cleanup(publication.backupPath)
  } catch (error) {
    if (!committed) {
      for (const publication of published.reverse()) {
        cleanup(publication.finalPath)
      }
      for (const publication of backedUp.reverse()) {
        if (existsSync(publication.backupPath)) renameSync(publication.backupPath, publication.finalPath)
      }
    }
    throw error
  } finally {
    for (const publication of publications) {
      cleanup(publication.temporaryPath)
      if (committed || existsSync(publication.finalPath)) {
        cleanup(publication.backupPath)
      }
    }
  }

  if (cleanupFailures.length > 0) {
    console.warn(`Theme token visual parity artifact cleanup warning: ${cleanupFailures.join('; ')}`)
  }
}

const assertManifestShape = (manifest, label, failures) => {
  const expectedFields = ['baseUrl', 'generatedAt', 'themes', 'routes', 'viewports', 'records']
  const actualFields = Object.keys(manifest || {}).sort()
  if (actualFields.join('|') !== expectedFields.slice().sort().join('|')) {
    failures.push(`${label}: manifest fields must be exactly ${expectedFields.join(', ')}`)
  }
}

const indexRecords = (manifest, label, failures) => {
  const records = Array.isArray(manifest?.records) ? manifest.records : []
  const indexed = new Map()

  if (records.length !== expectedKeys.size) {
    failures.push(`${label}: expected ${expectedKeys.size} records, received ${records.length}`)
  }
  for (const record of records) {
    if (!record || typeof record !== 'object') {
      failures.push(`${label}: record must be an object`)
      continue
    }
    const fields = Object.keys(record).sort()
    if (fields.join('|') !== recordFields.slice().sort().join('|')) {
      failures.push(`${label}: record fields must be exactly ${recordFields.join(', ')}`)
    }
    for (const field of recordFields) {
      if (typeof record[field] !== 'string') failures.push(`${label}: ${field} must be a string`)
    }
    if (typeof record.key !== 'string') continue
    const expectedKey = `${record.theme}|${record.route}|${record.viewport}`
    if (record.key !== expectedKey) {
      failures.push(`${label}: key ${record.key} does not match ${expectedKey}`)
    }
    if (!themes.includes(record.theme) || !routes.includes(record.route) || !viewports.some((viewport) => viewport.name === record.viewport)) {
      failures.push(`${label}: record ${record.key} has an unexpected theme, route, or viewport`)
    }
    if (record.actualTheme !== record.theme) {
      failures.push(`${label}: record ${record.key} actualTheme must match its theme`)
    }
    if (indexed.has(record.key)) failures.push(`${label}: duplicate record key ${record.key}`)
    indexed.set(record.key, record)
  }
  for (const key of expectedKeys) {
    if (!indexed.has(key)) failures.push(`${label}: missing record ${key}`)
  }
  for (const key of indexed.keys()) {
    if (!expectedKeys.has(key)) failures.push(`${label}: unexpected record ${key}`)
  }

  return indexed
}

const compareManifests = (baseline, candidate, failures) => {
  assertManifestShape(baseline, 'baseline', failures)
  assertManifestShape(candidate, 'candidate', failures)
  const baselineRecords = indexRecords(baseline, 'baseline', failures)
  const candidateRecords = indexRecords(candidate, 'candidate', failures)

  for (const key of expectedKeys) {
    const baselineRecord = baselineRecords.get(key)
    const candidateRecord = candidateRecords.get(key)
    if (baselineRecord && candidateRecord && baselineRecord.sha256 !== candidateRecord.sha256) {
      failures.push(`${key}: SHA-256 differs (baseline ${baselineRecord.sha256}, candidate ${candidateRecord.sha256})`)
    }
  }
}

const printFailure = (failures, manifestPath) => {
  console.error(`Theme token visual parity failed with ${failures.length} issue(s):`)
  for (const failure of failures.slice(0, 12)) console.error(`- ${failure}`)
  if (failures.length > 12) console.error(`- ... ${failures.length - 12} additional issue(s)`)
  console.error(`Manifest: ${manifestPath}`)
}

const main = async () => {
  if (mode !== 'capture' && mode !== 'compare') {
    printFailure(['THEME_TOKEN_PARITY_MODE must be capture or compare'], mode === 'compare' ? candidatePath : baselinePath)
    process.exitCode = 1
    return
  }

  try {
    assertLoopbackBaseUrl()
  } catch (error) {
    printFailure([error.message || String(error)], mode === 'compare' ? candidatePath : baselinePath)
    process.exitCode = 1
    return
  }

  const failures = []
  let browser
  let captures = []
  let browserReady = false
  let matrixProcessed = false

  try {
    await waitForHttp(`${baseUrl}/`)
    browser = await connectToChrome()
    await browser.send('Page.enable')
    await browser.send('Runtime.enable')
    await browser.send('Network.enable')
    browserReady = true
    captures = await captureMatrix(browser, failures)
    matrixProcessed = true
  } catch (error) {
    failures.push(error.message || String(error))
  } finally {
    if (browser) {
      try {
        await closeChrome(browser)
      } catch (error) {
        failures.push(error.message || String(error))
      }
    }
  }

  if (mode === 'capture') {
    if (!browserReady || !matrixProcessed || failures.length > 0) {
      printFailure(failures, baselinePath)
      process.exitCode = 1
      return
    }
    let records
    try {
      const screenshotDir = join(outputDir, 'capture')
      records = buildRecords(captures, screenshotDir)
      publishCaptureArtifacts(captures, screenshotDir, baselinePath, createManifest(records))
    } catch (error) {
      printFailure([error.message || String(error)], baselinePath)
      process.exitCode = 1
      return
    }
    console.log(`Theme token visual parity capture passed: ${records.length} records`)
    console.log(`Baseline manifest: ${baselinePath}`)
    return
  }

  if (!browserReady || !matrixProcessed) {
    printFailure(failures, candidatePath)
    process.exitCode = 1
    return
  }

  const screenshotDir = join(outputDir, 'compare')
  const records = buildRecords(captures, screenshotDir)
  const manifest = createManifest(records)
  let baseline
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  } catch (error) {
    failures.push(`Unable to read baseline manifest ${baselinePath}: ${error.message || String(error)}`)
  }
  if (baseline) compareManifests(baseline, manifest, failures)

  if (failures.length > 0) {
    printFailure(failures, candidatePath)
    process.exitCode = 1
    return
  }

  try {
    publishCaptureArtifacts(captures, screenshotDir, candidatePath, manifest)
  } catch (error) {
    printFailure([error.message || String(error)], candidatePath)
    process.exitCode = 1
    return
  }

  console.log(`Theme token visual parity compare passed: ${records.length} records`)
  console.log(`Baseline manifest: ${baselinePath}`)
  console.log(`Candidate manifest: ${candidatePath}`)
}

await main().catch((error) => {
  printFailure([error.message || String(error)], mode === 'compare' ? candidatePath : baselinePath)
  process.exitCode = 1
})
