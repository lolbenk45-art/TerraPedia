import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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
  '/': { selector: '.home-screen', requiresIdle: false },
  '/items': { selector: '.catalog-pixel-stage', requiresIdle: true },
  '/armor-sets': { selector: '.armor-layout', requiresIdle: true },
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

const writeManifest = (manifestPath, manifest) => {
  mkdirSync(resolve(manifestPath, '..'), { recursive: true })
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(temporaryPath, manifestPath)
}

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

    const send = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
      commandId += 1
      const id = commandId
      const timeout = setTimeout(() => {
        if (!callbacks.has(id)) return
        callbacks.delete(id)
        rejectCommand(new Error(`Timed out waiting for Chrome DevTools command ${method}`))
      }, commandTimeoutMs)

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

const evaluateJson = async (browser, expression, label) => {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })

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

const readinessExpression = (route) => {
  const expected = new URL(route, `${baseUrl}/`)
  const readiness = routeReadiness[route]
  return `(() => new Promise((resolveReady) => {
    const expectedPath = ${JSON.stringify(expected.pathname)};
    const expectedSearch = ${JSON.stringify(expected.search)};
    const selector = ${JSON.stringify(readiness.selector)};
    const requiresIdle = ${JSON.stringify(readiness.requiresIdle)};
    const startedAt = Date.now();
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
    const tick = () => {
      const body = document.body;
      const hasBodySize = Boolean(body && body.scrollWidth > 1 && body.scrollHeight > 1);
      const stableElement = document.querySelector(selector);
      const selectorPresent = Boolean(stableElement);
      const selectorVisible = visible(stableElement);
      const selectorBusy = stableElement?.getAttribute('aria-busy') ?? null;
      const selectorReady = selectorVisible && (!requiresIdle || selectorBusy !== 'true');
      const isTargetRoute = location.pathname === expectedPath && location.search === expectedSearch;
      if (document.readyState !== 'loading' && isTargetRoute && hasBodySize && selectorReady) {
        resolveReady({ ready: true });
        return;
      }
      if (Date.now() - startedAt >= ${Math.min(commandTimeoutMs, 5000)}) {
        resolveReady({
          ready: false,
          readyState: document.readyState,
          hasBodySize,
          selector,
          selectorPresent,
          selectorVisible,
          selectorBusy,
          isTargetRoute,
          actualPath: location.pathname,
          actualSearch: location.search,
          expectedPath,
          expectedSearch,
        });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  }))()`
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

          const ready = await evaluateJson(browser, readinessExpression(route), `${key} route readiness`)
          if (!ready.ready) {
            failures.push(`${key}: route readiness failed (${JSON.stringify(ready)})`)
          }

          const finalApplied = await evaluateJson(browser, applyThemeExpression(theme), `${key} final theme verification`)
          const actualTheme = finalApplied?.actualTheme
          if (typeof actualTheme !== 'string' || actualTheme !== theme) {
            failures.push(`${key}: final actualTheme must be ${theme}, received ${JSON.stringify(actualTheme)}`)
          }

          const screenshot = await browser.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          })
          const buffer = Buffer.from(screenshot.data, 'base64')
          captures.push({
            name: `${safeName(theme)}-${safeName(route)}-${viewport.name}.png`,
            buffer,
            record: {
              key,
              theme,
              route,
              viewport: viewport.name,
              actualTheme,
              sha256: sha256(buffer),
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

const writeCaptureArtifacts = (captures, screenshotDir) => {
  mkdirSync(screenshotDir, { recursive: true })
  return captures.map(({ name, buffer, record }) => {
    const screenshotPath = join(screenshotDir, name)
    writeFileSync(screenshotPath, buffer)
    return {
      ...record,
      path: relative(outputDir, screenshotPath),
    }
  })
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
      records = writeCaptureArtifacts(captures, join(outputDir, 'capture'))
      writeManifest(baselinePath, createManifest(records))
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

  let records
  try {
    records = writeCaptureArtifacts(captures, join(outputDir, 'compare'))
    writeManifest(candidatePath, createManifest(records))
  } catch (error) {
    failures.push(error.message || String(error))
    printFailure(failures, candidatePath)
    process.exitCode = 1
    return
  }
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

  console.log(`Theme token visual parity compare passed: ${records.length} records`)
  console.log(`Baseline manifest: ${baselinePath}`)
  console.log(`Candidate manifest: ${candidatePath}`)
}

await main().catch((error) => {
  printFailure([error.message || String(error)], mode === 'compare' ? candidatePath : baselinePath)
  process.exitCode = 1
})
