import { spawn } from 'node:child_process'

const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5174'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const cdpCommandTimeoutMs = Number(process.env.CRAFTING_WIKI_CDP_TIMEOUT_MS || 15000)
const routes = [
  '/crafting?itemId=675&maxDepth=3',
  '/crafting?itemId=757&maxDepth=3',
  '/crafting?itemId=5000&maxDepth=5',
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

const waitForCraftingTree = async (browser, route) => evaluateJson(browser, `(() => new Promise((resolve) => {
  const startedAt = Date.now();
  const tick = () => {
    const stage = document.querySelector('.recipe-full-tree .recipe-tree-stage');
    const root = stage?.querySelector('.recipe-branch.is-wiki-flow.is-root');
    const loaded = document.querySelector('.crafting-layout')?.classList.contains('has-active-recipe');
    if (loaded && stage && root && root.querySelectorAll('.recipe-tree-node').length > 0) {
      resolve({ ready: true });
      return;
    }

    if (Date.now() - startedAt > 6000) {
      resolve({
        ready: false,
        route: ${JSON.stringify(route)},
        loaded,
        hasStage: Boolean(stage),
        hasRoot: Boolean(root),
        nodeCount: root?.querySelectorAll('.recipe-tree-node').length ?? 0,
      });
      return;
    }

    setTimeout(tick, 100);
  };
  tick();
}))()`)

const inspectCraftingTree = async (browser, route) => evaluateJson(browser, `(() => {
  const roundRect = (rect) => ({
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  const stage = document.querySelector('.recipe-full-tree .recipe-tree-stage');
  const root = stage?.querySelector('.recipe-branch.is-wiki-flow.is-root');
  if (!stage || !root) {
    return { route: ${JSON.stringify(route)}, issues: ['missing full recipe tree stage or root branch'] };
  }

  const visibleRect = (element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const firstVisibleNodeRect = (container) => [...container.querySelectorAll('.recipe-tree-node')]
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((left, right) => left.top - right.top || left.left - right.left)[0] ?? null;
  const stageRect = stage.getBoundingClientRect();
  const rootNodeRect = root.querySelector(':scope > .recipe-tree-node')?.getBoundingClientRect();
  const nodeRects = [...stage.querySelectorAll('.recipe-tree-node')]
    .filter(visibleRect)
    .map((node) => node.getBoundingClientRect());
  const firstTop = Math.min(...nodeRects.map((rect) => rect.top));
  const topGap = Math.round(firstTop - stageRect.top);
  const duplicateComposedCards = [...stage.querySelectorAll('.recipe-composed-ingredient')].filter((branch) => (
    branch.matches(':scope > .recipe-child-expansion + .recipe-tree-node')
    || branch.querySelector(':scope > .recipe-ingredient-node')
  )).length;
  const visibleAlternativeGroups = [...stage.querySelectorAll('.recipe-alternative-recipes')].map((group) => {
    const rect = group.getBoundingClientRect();
    const firstNode = firstVisibleNodeRect(group);
    return {
      rect: roundRect(rect),
      firstNode: firstNode ? roundRect(firstNode) : null,
      topInnerGap: firstNode ? Math.round(firstNode.top - rect.top) : null,
    };
  });
  const excessiveAlternativeTopGap = visibleAlternativeGroups.filter((group) => group.topInnerGap !== null && group.topInnerGap > 240).length;
  const isTerrasparkRoute = ${JSON.stringify(route)}.includes('itemId=5000');
  const floatingConnectors = [...stage.querySelectorAll('.recipe-branch.is-wiki-flow > .recipe-children')].filter((row) => {
    const rowRect = row.getBoundingClientRect();
    const firstNode = firstVisibleNodeRect(row);
    return firstNode && Math.round(firstNode.top - rowRect.top) > 96;
  }).length;
  const issues = [];

  if (topGap > 280) {
    issues.push(\`full tree first node starts too low below the stage top: \${topGap}px\`);
  }
  if (rootNodeRect && (rootNodeRect.left < stageRect.left || rootNodeRect.right > stageRect.right)) {
    issues.push(\`root result node is not visible in the initial horizontal viewport: left=\${Math.round(rootNodeRect.left)} right=\${Math.round(rootNodeRect.right)} stageLeft=\${Math.round(stageRect.left)} stageRight=\${Math.round(stageRect.right)}\`);
  }
  if (isTerrasparkRoute && visibleAlternativeGroups.length === 0) {
    issues.push('item 5000 Terraspark Boots must render visible alternative recipe groups');
  }
  if (duplicateComposedCards > 0) {
    issues.push(\`composed ingredient branches still render duplicate material cards: \${duplicateComposedCards}\`);
  }
  if (excessiveAlternativeTopGap > 0) {
    issues.push(\`alternative recipe groups contain excessive top blank space: \${excessiveAlternativeTopGap}\`);
  }
  if (floatingConnectors > 0) {
    issues.push(\`ingredient rows contain floating blank connector space above material nodes: \${floatingConnectors}\`);
  }

  return {
    route: ${JSON.stringify(route)},
    stage: roundRect(stageRect),
    root: roundRect(root.getBoundingClientRect()),
    rootNode: rootNodeRect ? roundRect(rootNodeRect) : null,
    scrollLeft: Math.round(stage.scrollLeft),
    scrollWidth: Math.round(stage.scrollWidth),
    clientWidth: Math.round(stage.clientWidth),
    topGap,
    nodeCount: nodeRects.length,
    composedIngredientCount: stage.querySelectorAll('.recipe-composed-ingredient').length,
    duplicateComposedCards,
    visibleAlternativeGroups,
    floatingConnectors,
    issues,
  };
})()`)

const main = async () => {
  const port = 9400 + Math.floor(Math.random() * 400)
  const browser = await connectToChrome(port)
  const failures = []
  const reports = []

  try {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 2600,
      deviceScaleFactor: 1,
      mobile: false,
    })

    for (const route of routes) {
      await browser.send('Page.navigate', { url: `${baseUrl}${route}` })
      const ready = await waitForCraftingTree(browser, route)
      if (!ready?.ready) {
        failures.push(`${route}: crafting tree did not become ready: ${JSON.stringify(ready)}`)
        continue
      }

      const report = await inspectCraftingTree(browser, route)
      reports.push(report)
      for (const issue of report.issues) {
        failures.push(`${route}: ${issue}`)
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

  console.log(`Crafting wiki structure runtime checks passed for ${routes.length} routes.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
