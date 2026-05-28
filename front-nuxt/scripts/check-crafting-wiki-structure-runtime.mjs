import { spawn } from 'node:child_process'

const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5176'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const cdpCommandTimeoutMs = Number(process.env.CRAFTING_WIKI_CDP_TIMEOUT_MS || 15000)
const expectedSourceMarker = process.env.TERRAPEDIA_FRONT_NUXT_SOURCE_MARKER || process.cwd()
const routes = [
  '/crafting?itemId=8&maxDepth=3',
  '/crafting?itemId=556&maxDepth=3',
  '/crafting?itemId=675&maxDepth=3',
  '/crafting?itemId=757&maxDepth=3',
  '/crafting?itemId=5000&maxDepth=5',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const absoluteUrl = (route) => new URL(route, `${baseUrl.replace(/\/$/, '')}/`).toString()

const verifyNuxtSource = async () => {
  const probeUrl = absoluteUrl('/crafting?itemId=8&maxDepth=3')
  const response = await fetch(probeUrl)
  if (!response.ok) {
    throw new Error(`Failed to verify Nuxt source for ${probeUrl}: HTTP ${response.status}`)
  }

  const html = await response.text()
  if (!html.includes(expectedSourceMarker)) {
    throw new Error([
      `Crafting runtime check is not hitting the expected front-nuxt worktree.`,
      `baseUrl=${baseUrl}`,
      `expectedSourceMarker=${expectedSourceMarker}`,
    ].join('\n'))
  }
}

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
    `--user-data-dir=/tmp/terrapedia-crafting-wiki-structure-${port}`,
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

const evaluateJson = async (browser, expression) => {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return result?.result?.value
}

const waitForCraftingStructure = async (browser, route) => evaluateJson(browser, `(() => new Promise((resolve) => {
  const startedAt = Date.now();
  const tick = () => {
    const page = document.querySelector('[data-crafting-role="page"]');
    const sheet = document.querySelector('[data-crafting-role="recipe-sheet"]');
    const target = document.querySelector('[data-crafting-role="target-bar"] .target-title');
    const materials = document.querySelector('[data-crafting-role="recipe-materials"]');
    const stations = document.querySelector('[data-crafting-role="recipe-stations"]');
    const output = document.querySelector('[data-crafting-role="recipe-output"]');

    if (
      document.readyState !== 'loading'
      && page
      && sheet
      && target
      && materials
      && stations
      && output
      && sheet.textContent.trim().length > 40
    ) {
      resolve({ ready: true, title: target.textContent.trim() });
      return;
    }

    if (Date.now() - startedAt > 7000) {
      resolve({
        ready: false,
        route: ${JSON.stringify(route)},
        hasPage: Boolean(page),
        hasSheet: Boolean(sheet),
        hasTarget: Boolean(target),
        hasMaterials: Boolean(materials),
        hasStations: Boolean(stations),
        hasOutput: Boolean(output),
        bodyText: document.body.innerText.slice(0, 360),
      });
      return;
    }

    setTimeout(tick, 100);
  };
  tick();
}))()`)

const inspectCraftingStructure = async (browser, route) => evaluateJson(browser, `(() => {
  const text = (selector) => [...document.querySelectorAll(selector)].map((element) => element.textContent.trim().replace(/\\s+/g, ' '));
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const visibleCount = (selector) => [...document.querySelectorAll(selector)].filter(visible).length;
  const minBox = (selector) => {
    const rects = [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => element.getBoundingClientRect());
    if (!rects.length) return null;
    return {
      width: Math.round(Math.min(...rects.map((rect) => rect.width))),
      height: Math.round(Math.min(...rects.map((rect) => rect.height))),
    };
  };
  const issues = [];
  const isTorch = ${JSON.stringify(route)}.includes('itemId=8');
  const isMechanicalWorm = ${JSON.stringify(route)}.includes('itemId=556');
  const isTrueNightsEdge = ${JSON.stringify(route)}.includes('itemId=675');
  const isTerrablade = ${JSON.stringify(route)}.includes('itemId=757');
  const isTerraspark = ${JSON.stringify(route)}.includes('itemId=5000');
  const anyGroups = text('[data-crafting-role="any-material-group"]');
  const anyInlineSummaries = text('.any-material-inline-summary');
  const stationTexts = text('[data-crafting-role="station-options"]');
  const oldTreeCount = document.querySelectorAll('.recipe-full-tree, .recipe-tree-stage, .recipe-root-option-tabs').length;
  const nestedPanelCount = document.querySelectorAll('.tp-panel .tp-panel').length;
  const rootSheets = [...document.querySelectorAll('[data-crafting-role="recipe-sheet"]')].filter((sheet) => !sheet.closest('.material-expansion-item')).length;
  const childSheets = [...document.querySelectorAll('.material-expansion-item [data-crafting-role="recipe-sheet"]')];
  const visibleChildSheets = childSheets.filter(visible);
  const expansionDetails = [...document.querySelectorAll('.material-expansion-item')];
  const stationSummaryText = text('.station-option-summary').join(' ');
  const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
  const materialIconMin = minBox('[data-crafting-role="recipe-materials"] .material-slot-main .tp-preview-image');
  const stationIconMin = minBox('[data-crafting-role="recipe-stations"] .station-option .tp-preview-image');
  const outputIconMin = minBox('[data-crafting-role="recipe-output"] .tp-preview-image');
  const anyMemberIconMin = minBox('[data-crafting-role="any-material-group"] .any-material-member .tp-preview-image');
  const sheet = document.querySelector('[data-crafting-role="recipe-sheet"]');
  const graph = document.querySelector('[data-crafting-role="recipe-graph"]');
  const routeTree = document.querySelector('[data-crafting-role="recipe-route-tree"]');
  const routeRows = [...document.querySelectorAll('[data-crafting-role="recipe-route-row"]')].filter(visible);
  const relationSteps = [...document.querySelectorAll('[data-crafting-role="recipe-relation-step"]')].filter(visible);
  const choiceGroups = [...document.querySelectorAll('[data-crafting-role="recipe-choice-group"]')].filter(visible);
  const sharedGroups = [...document.querySelectorAll('[data-crafting-role="recipe-shared-materials"]')].filter(visible);
  const optionMaterialGroups = [...document.querySelectorAll('[data-crafting-role="recipe-option-materials"]')].filter(visible);
  const oldCoordinateLayers = document.querySelectorAll('[data-crafting-role="recipe-graph-scroll"], [data-crafting-role="recipe-graph-canvas"], [data-crafting-role="recipe-graph-svg"], [data-graph-node-id], [data-edge-from], [data-graph-group-id]').length;
  const routeTreeText = routeTree?.textContent.trim().replace(/\s+/g, ' ') || '';
  const choiceGroupTexts = choiceGroups.map((group) => group.textContent.trim().replace(/\s+/g, ' '));
  const sharedGroupTexts = sharedGroups.map((group) => group.textContent.trim().replace(/\s+/g, ' '));
  const graphRect = graph?.getBoundingClientRect();
  const sheetRect = sheet?.getBoundingClientRect();
  const rowErrors = [];
  for (const row of routeRows) {
    const rowRect = row.getBoundingClientRect();
    const steps = [...row.querySelectorAll('[data-crafting-role="recipe-relation-step"]')].filter(visible);
    if (steps.length !== 3) {
      rowErrors.push(\`row has \${steps.length} relationship steps\`);
    }
    if (rowRect.right > window.innerWidth + 1 && window.innerWidth < 760) {
      rowErrors.push(\`mobile row overflows viewport by \${Math.round(rowRect.right - window.innerWidth)}px\`);
    }
    if (window.innerWidth < 760) {
      for (const step of steps) {
        const stepRect = step.getBoundingClientRect();
        if (stepRect.left < 0 || stepRect.right > window.innerWidth + 1) {
          rowErrors.push(\`mobile relation step is clipped: left \${Math.round(stepRect.left)}, right \${Math.round(stepRect.right)}\`);
        }
      }
    }
  }
  const graphMetrics = {
    routeRowCount: routeRows.length,
    relationStepCount: relationSteps.length,
    choiceGroupCount: choiceGroups.length,
    sharedGroupCount: sharedGroups.length,
    optionMaterialGroupCount: optionMaterialGroups.length,
    choiceGroupTexts,
    sharedGroupTexts,
    oldCoordinateLayers,
    sheetBottom: sheetRect ? Math.round(sheetRect.bottom) : null,
    graphTop: graphRect ? Math.round(graphRect.top) : null,
    rowErrors,
  };

  if (oldTreeCount > 0) {
    issues.push(\`legacy full-tree selectors are still rendered: \${oldTreeCount}\`);
  }
  if (nestedPanelCount > 0) {
    issues.push(\`nested tp-panel surfaces are rendered: \${nestedPanelCount}\`);
  }
  if (rootSheets !== 1) {
    issues.push(\`expected exactly one active root recipe sheet, found \${rootSheets}\`);
  }
  if (pageOverflow > 1) {
    issues.push(\`page has horizontal overflow: \${pageOverflow}px\`);
  }
  if (!graph || !routeTree) {
    issues.push('recipe relation tree must render graph shell and route tree');
  }
  if (oldCoordinateLayers > 0) {
    issues.push(\`simplified relation tree must not render old coordinate graph layers: \${oldCoordinateLayers}\`);
  }
  if (sheetRect && graphRect && graphRect.top <= sheetRect.bottom) {
    issues.push(\`recipe graph must appear below recipe sheet: sheet bottom \${Math.round(sheetRect.bottom)}, graph top \${Math.round(graphRect.top)}\`);
  }
  if (routeRows.length < 1) {
    issues.push(\`recipe relation tree must render at least one route row, found \${routeRows.length}\`);
  }
  if (relationSteps.length < routeRows.length * 3) {
    issues.push(\`each relation row must render materials/stations/output steps: rows \${routeRows.length}, steps \${relationSteps.length}\`);
  }
  if (rowErrors.length > 0) {
    issues.push(\`recipe relation rows must be stable document-flow rows: \${rowErrors.join('; ')}\`);
  }
  if (isTerraspark && routeRows.length < 6) {
    issues.push(\`terraspark relation tree must expose nested route rows, found \${routeRows.length}\`);
  }
  if (materialIconMin && (materialIconMin.width < 44 || materialIconMin.height < 44)) {
    issues.push(\`material icons are too small: \${JSON.stringify(materialIconMin)}\`);
  }
  if (stationIconMin && (stationIconMin.width < 38 || stationIconMin.height < 38)) {
    issues.push(\`station icons are too small: \${JSON.stringify(stationIconMin)}\`);
  }
  if (outputIconMin && (outputIconMin.width < 48 || outputIconMin.height < 48)) {
    issues.push(\`output icons are too small: \${JSON.stringify(outputIconMin)}\`);
  }
  if (anyMemberIconMin && (anyMemberIconMin.width < 24 || anyMemberIconMin.height < 24)) {
    issues.push(\`any-material member icons are too small: \${JSON.stringify(anyMemberIconMin)}\`);
  }
  if (isTorch) {
    if (anyGroups.length !== 1 || !anyGroups[0].includes('任选其一') || !anyGroups[0].includes('任何木材')) {
      issues.push(\`torch must show one visible any wood choice group: \${JSON.stringify(anyGroups)}\`);
    }
    if (!anyInlineSummaries.join(' ').includes('木材') || !anyInlineSummaries.join(' ').includes('乌木')) {
      issues.push(\`torch any wood summary must expose concrete member names without opening details: \${JSON.stringify(anyInlineSummaries)}\`);
    }
  }
  if (isMechanicalWorm) {
    if (!stationSummaryText.includes('秘银砧/山铜砧')) {
      issues.push(\`mechanical worm must show compact station option text 秘银砧/山铜砧: \${stationSummaryText}\`);
    }
    if (stationTexts.some((stationText) => stationText.includes('或'))) {
      issues.push('mechanical worm station UI must not render standalone 或');
    }
    if (visibleCount('[data-crafting-role="recipe-option-selector"] button') < 2) {
      issues.push('mechanical worm must show two root recipe options');
    }
  }
  if ((isTrueNightsEdge || isTerrablade || isTerraspark) && visibleChildSheets.length > 0) {
    issues.push('child recipe sheets must be collapsed by default');
  }

  expansionDetails.forEach((details) => {
    details.open = true;
  });
  const expandedText = text('[data-crafting-role="material-expansion-list"]').join(' ');
  const expandedChildSheetCount = [...document.querySelectorAll('.material-expansion-item [data-crafting-role="recipe-sheet"]')]
    .filter(visible)
    .length;

  if (isTrueNightsEdge) {
    for (const expected of ['血腥屠刀', '魔光剑', '村正', '草剑', '火山']) {
      if (!expandedText.includes(expected)) {
        issues.push(\`true night's edge expanded child recipes must show material \${expected}: \${expandedText}\`);
      }
      if (!routeTreeText.includes(expected)) {
        issues.push(\`true night's edge relation tree must show material \${expected}: \${routeTreeText}\`);
      }
    }
    if (expandedChildSheetCount < 2) {
      issues.push(\`true night's edge must expose both night edge child recipe options, found \${expandedChildSheetCount}\`);
    }
    const bloodLightChoice = choiceGroupTexts.find((groupText) => groupText.includes('血腥屠刀') && groupText.includes('魔光剑')) || '';
    const sharedText = sharedGroupTexts.join(' ');
    if (!bloodLightChoice.includes('可替换材料') || !bloodLightChoice.includes('任选 1')) {
      issues.push(\`true night's edge relation tree must render Blood Butcherer/Light's Bane as one explicit choose-one material group: \${JSON.stringify(choiceGroupTexts)}\`);
    }
    for (const expected of ['村正', '草剑', '火山']) {
      if (!sharedText.includes(expected)) {
        issues.push(\`true night's edge relation tree must separate shared material \${expected}: \${JSON.stringify(sharedGroupTexts)}\`);
      }
    }
  }

  if (isTerrablade) {
    const alternativeGroupText = choiceGroupTexts.find((groupText) => groupText.includes('血腥屠刀') || groupText.includes('魔光剑')) || '';
    if (!alternativeGroupText.includes('可替换材料') || !alternativeGroupText.includes('血腥屠刀') || !alternativeGroupText.includes('魔光剑') || alternativeGroupText.includes('ALT') || alternativeGroupText.includes('可选配方')) {
      issues.push(\`terrablade relation tree must label Blood Butcherer/Light's Bane as substitute materials, not recipe alternatives: \${JSON.stringify(choiceGroupTexts)}\`);
    }
  }

  if (isTerraspark) {
    for (const expected of ['闪电靴', '溜冰鞋', '熔火护身符', '黑曜石水上漂靴', '水上漂靴']) {
      if (!expandedText.includes(expected)) {
        issues.push(\`terraspark expanded child recipes must show material \${expected}: \${expandedText}\`);
      }
    }
    if (expandedChildSheetCount < 6) {
      issues.push(\`terraspark must expose all frostspark/lava boots child recipe options, found \${expandedChildSheetCount}\`);
    }
  }

  return {
    route: ${JSON.stringify(route)},
    title: document.querySelector('[data-crafting-role="target-bar"] .target-title')?.textContent.trim(),
    rootSheets,
    childSheets: childSheets.length,
    visibleChildSheets: visibleChildSheets.length,
    expandedChildSheetCount,
    anyGroups,
    anyInlineSummaries,
    expandedText,
    stationTexts,
    stationSummaryText,
    pageOverflow,
    oldTreeCount,
    nestedPanelCount,
    materialIconMin,
    stationIconMin,
    outputIconMin,
    anyMemberIconMin,
    graphMetrics,
    issues,
  };
})()`)

const main = async () => {
  await verifyNuxtSource()

  const port = 9400 + Math.floor(Math.random() * 400)
  const browser = await connectToChrome(port)
  const failures = []
  const reports = []

  try {
    for (const viewport of [
      { width: 1440, height: 1000, mobile: false },
      { width: 390, height: 900, mobile: true },
    ]) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        ...viewport,
        deviceScaleFactor: 1,
      })

      for (const route of routes) {
        await browser.send('Page.navigate', { url: absoluteUrl(route) })
        const ready = await waitForCraftingStructure(browser, route)
        if (!ready?.ready) {
          failures.push(`${route}: crafting structure did not become ready: ${JSON.stringify(ready)}`)
          continue
        }

        const report = await inspectCraftingStructure(browser, route)
        reports.push({ viewport, ...report })
        for (const issue of report.issues) {
          failures.push(`${route}: ${issue}`)
        }
      }
    }
  } finally {
    browser.ws.close()
    browser.chrome.kill('SIGTERM')
  }

  if (failures.length > 0) {
    console.error(`Crafting wiki structure runtime checks failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
    console.error(JSON.stringify(reports, null, 2))
    process.exit(1)
  }

  console.log(`Crafting wiki structure runtime checks passed for ${routes.length} routes across desktop and mobile.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
