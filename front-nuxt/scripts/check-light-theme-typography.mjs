import { spawn } from 'node:child_process'

const baseUrl = process.env.TERRAPEDIA_FRONT_NUXT_URL || 'http://localhost:5176'
const chromeBin = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser'
const targetThemes = ['morning-paper', 'warm-slate']

const expectedThemeTokens = {
  'morning-paper': {
    '--paper': '#1a1f18',
    '--text-strong': '#1a1f18',
    '--text-main': 'rgba(26, 31, 24, 0.86)',
    '--text-muted': 'rgba(26, 31, 24, 0.68)',
    '--theme-text-rgb': '26, 31, 24',
  },
  'warm-slate': {
    '--paper': '#1d2430',
    '--text-strong': '#1d2430',
    '--text-main': 'rgba(29, 36, 48, 0.86)',
    '--text-muted': 'rgba(29, 36, 48, 0.78)',
    '--theme-text-rgb': '29, 36, 48',
  },
}

const routes = [
  '/',
  '/items',
  '/items/terra-blade',
  '/articles',
  '/articles/melee-progression',
  '/search',
  '/crafting',
  '/categories',
  '/categories/weapons',
  '/biomes',
  '/biomes/jungle',
  '/npcs',
  '/npcs/guide',
  '/bosses',
  '/bosses/eye-of-cthulhu',
  '/buffs',
  '/buffs/ironskin',
  '/projectiles',
  '/armor-sets',
  '/user',
  '/user/login',
  '/user/register',
  '/user/favorites',
  '/user/articles',
  '/user/articles/new',
  '/user/settings',
  '/about',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (url, attempts = 80) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return response
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
    `--user-data-dir=/tmp/terrapedia-chrome-light-theme-${port}`,
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

const auditExpression = `(() => {
  const selector = 'h1,h2,h3,h4,h5,p,a,button,span,b,strong,em,dt,dd,label,input,textarea,small,li';
  const parseColor = (value) => {
    const text = String(value || '').trim();
    if (text === 'transparent') return [0, 0, 0, 0];
    const match = text.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return [0, 0, 0, 1];
    const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  };
  const temp = document.createElement('span');
  document.body.appendChild(temp);
  temp.style.color = getComputedStyle(document.documentElement).getPropertyValue('--index-bg') || '#f4eddc';
  const defaultBg = parseColor(getComputedStyle(temp).color);
  temp.remove();
  const composite = (fg, bg) => {
    const alpha = fg[3];
    return [
      fg[0] * alpha + bg[0] * (1 - alpha),
      fg[1] * alpha + bg[1] * (1 - alpha),
      fg[2] * alpha + bg[2] * (1 - alpha),
      1,
    ];
  };
  const luminance = (color) => {
    const rgb = color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const contrast = (fg, bg) => {
    const foreground = luminance(fg);
    const background = luminance(bg);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  };
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const extractRgbColors = (value) => [...String(value || '').matchAll(/rgba?\\(([^)]+)\\)/g)].map((match) => {
    const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  });
	  const backgroundCandidatesFor = (element) => {
	    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
	      const style = getComputedStyle(node);
	      const background = parseColor(style.backgroundColor);
	      if (background[3] > 0.05) return [composite(background, defaultBg)];

      const gradientColors = extractRgbColors(style.backgroundImage);
      const solidGradientColors = gradientColors.filter((color) => color[3] > 0.95);
      if (solidGradientColors.length > 0) {
        return solidGradientColors.map((background) => composite(background, defaultBg));
      }
    }

    return [defaultBg];
  };
  const nodeName = (element) => {
    const classes = String(element.className || '').trim().split(/\\s+/).filter(Boolean).slice(0, 4).join('.');
    return element.tagName.toLowerCase() + (classes ? '.' + classes : '');
  };
  const issues = [];
  const families = new Set();

  for (const element of document.querySelectorAll(selector)) {
    const text = (element.innerText || element.value || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text || text.length < 2 || !isVisible(element)) continue;

    const style = getComputedStyle(element);
    families.add(style.fontFamily);

    const color = parseColor(style.color);
    if (color[3] < 0.08) continue;

    const backgrounds = backgroundCandidatesFor(element);
    const ratio = Math.min(...backgrounds.map((background) => contrast(composite(color, background), background)));
    const fontSize = Number.parseFloat(style.fontSize);
    const threshold = fontSize >= 18 ? 3 : 4.5;

    if (ratio < threshold) {
      issues.push({
        element: nodeName(element),
        text: text.slice(0, 80),
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        ratio: Number(ratio.toFixed(2)),
      });
    }
  }

  for (const button of document.querySelectorAll('.primary-button')) {
    if (!isVisible(button)) continue;

    const style = getComputedStyle(button);
    const backgrounds = backgroundCandidatesFor(button);
    const buttonContrast = Math.min(...backgrounds.map((background) => contrast(composite(parseColor(style.color), background), background)));

    if (buttonContrast < 4.5) {
      issues.push({
        element: nodeName(button),
        text: (button.innerText || button.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
        color: style.backgroundImage || style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        ratio: Number(buttonContrast.toFixed(2)),
      });
    }
  }

  for (const selector of ['.search-action', '.theme-toggle', '.nav-menu-text-trigger', '.account-avatar-link']) {
    const control = document.querySelector(selector);
    if (!control || !isVisible(control)) continue;

    const style = getComputedStyle(control);
    const background = parseColor(style.backgroundColor);
    const rect = control.getBoundingClientRect();

    if (background[3] < 0.2 || style.backgroundImage !== 'none' || rect.height < 34) {
      issues.push({
        element: selector,
        text: (control.innerText || control.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
        color: style.backgroundColor + ' / ' + style.backgroundImage,
        fontSize: Math.round(rect.width) + 'x' + Math.round(rect.height),
        fontWeight: style.fontWeight,
        ratio: Number(background[3].toFixed(2)),
      });
    }
  }

  return {
    path: location.pathname,
    theme: document.documentElement.getAttribute('data-theme'),
    families: [...families],
    issues,
  };
})()`

const rootTokenExpression = `(() => {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const tokenNames = ['--paper', '--text-strong', '--text-main', '--text-muted', '--theme-text-rgb'];

  return {
    path: location.pathname,
    theme: root.getAttribute('data-theme'),
    tokens: Object.fromEntries(tokenNames.map((name) => [name, style.getPropertyValue(name).trim()])),
    colorScheme: style.colorScheme,
  };
})()`

await waitFor(`${baseUrl}/`)

const port = Number(process.env.CHROMIUM_REMOTE_DEBUGGING_PORT || 9241)
const browser = await connectToChrome(port)
const failures = []
const fontFamilies = new Set()

try {
  await browser.send('Page.enable')
  await browser.send('Runtime.enable')
  await browser.send('Network.enable')
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1600,
    deviceScaleFactor: 1,
    mobile: false,
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
      await loaded.catch(() => {})
      await sleep(520)

      const result = await browser.send('Runtime.evaluate', {
        expression: auditExpression,
        returnByValue: true,
      })
      const value = result.result.value
      value.expectedTheme = targetTheme

      for (const family of value.families) {
        fontFamilies.add(family)
      }

      if (value.theme !== targetTheme) {
        failures.push({
          path: value.path,
          theme: value.theme,
          expectedTheme: targetTheme,
          issues: [{
            element: 'html[data-theme]',
            text: `expected ${targetTheme}, received ${value.theme || '(missing)'}`,
            color: '',
            fontSize: '',
            fontWeight: '',
            ratio: 0,
          }],
        })
      }

      if (route === '/') {
        const rootTokenResult = await browser.send('Runtime.evaluate', {
          expression: rootTokenExpression,
          returnByValue: true,
        })
        const rootTokenValue = rootTokenResult.result.value
        const expectedTokens = expectedThemeTokens[targetTheme]
        const tokenIssues = []

        for (const [tokenName, expectedValue] of Object.entries(expectedTokens)) {
          if (rootTokenValue.tokens[tokenName] !== expectedValue) {
            tokenIssues.push({
              element: `html ${tokenName}`,
              text: `expected ${expectedValue}, received ${rootTokenValue.tokens[tokenName] || '(missing)'}`,
              color: rootTokenValue.tokens[tokenName] || '',
              fontSize: '',
              fontWeight: '',
              ratio: 0,
            })
          }
        }

        if (!rootTokenValue.colorScheme.includes('light')) {
          tokenIssues.push({
            element: 'html color-scheme',
            text: `expected light, received ${rootTokenValue.colorScheme || '(missing)'}`,
            color: rootTokenValue.colorScheme || '',
            fontSize: '',
            fontWeight: '',
            ratio: 0,
          })
        }

        if (tokenIssues.length > 0) {
          failures.push({
            path: rootTokenValue.path,
            theme: rootTokenValue.theme,
            expectedTheme: targetTheme,
            issues: tokenIssues,
          })
        }
      }

      if (value.issues.length > 0) {
        failures.push(value)
      }
    }
  }
} finally {
  browser.ws.close()
  browser.chrome.kill('SIGTERM')
}

if (fontFamilies.size !== 1) {
  failures.push({
    path: 'font-family',
    theme: 'all target themes',
    expectedTheme: targetThemes.join(', '),
    issues: [...fontFamilies].map((family) => ({
      element: 'computed-font-family',
      text: family,
      color: '',
      fontSize: '',
      fontWeight: '',
      ratio: 0,
    })),
  })
}

if (failures.length > 0) {
  console.error(`Light theme typography audit failed for themes: ${targetThemes.join(', ')}`)

  for (const failure of failures) {
    const themeLabel = failure.expectedTheme
      ? ` theme=${failure.theme || '(missing)'} expected=${failure.expectedTheme}`
      : failure.theme
        ? ` theme=${failure.theme}`
        : ''
    console.error(`- ${failure.path}${themeLabel}`)

    for (const issue of failure.issues.slice(0, 12)) {
      console.error(`  ${issue.element} ratio=${issue.ratio} color=${issue.color} size=${issue.fontSize} weight=${issue.fontWeight} text=${JSON.stringify(issue.text)}`)
    }
  }

  process.exit(1)
}

console.log(`Light theme typography audit passed for ${targetThemes.length} themes across ${routes.length} routes with ${fontFamilies.size} computed font family.`)
