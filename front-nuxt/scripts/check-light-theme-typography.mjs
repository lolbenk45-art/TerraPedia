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
  '/biomes/4',
  '/biomes/7',
  '/biomes/92',
  '/biomes/100',
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

const focusFamilySelectors = {
  primary: ['.primary-button:not([disabled])'],
  theme: ['.account-menu .theme-choice:not([disabled])', '.mobile-nav-theme .theme-choice:not([disabled])'],
  nav: ['.nav-menu-text-trigger:not([disabled])', '.nav-notification-link', '.nav-user-article-link', '.account-avatar-link'],
  filter: ['.filter-option:not([disabled])', '.entity-filter:not([disabled])'],
  'catalog-chip': ['.catalog-category-chip:not([disabled])', '.catalog-density-chip:not([disabled])'],
  'catalog-pagination': [
    '.catalog-dock-page-button:not([disabled])',
    '.catalog-dock-button:not([disabled])',
    '.catalog-dock-icon-button:not([disabled])',
  ],
}

const requiredFocusFamilies = Object.keys(focusFamilySelectors)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  sleep(ms).then(() => {
    throw new Error(`Timed out waiting for ${label}`)
  }),
])

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
    const rgbMatch = text.match(/rgba?\\(([^)]+)\\)/);
    if (rgbMatch) {
      const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
    }

    const srgbMatch = text.match(/color\\(srgb\\s+([^\\s)]+)\\s+([^\\s)]+)\\s+([^\\s)]+)(?:\\s+\\/\\s+([^\\s)]+))?\\)/);
    if (!srgbMatch) return [0, 0, 0, 1];
    const parts = srgbMatch.slice(1, 5).map((part, index) => {
      if (part === undefined) return index === 3 ? 1 : 0;
      const parsed = Number.parseFloat(part);
      return index === 3 ? parsed : parsed * 255;
    });
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
  const extractRgbColors = (value) => [
    ...String(value || '').matchAll(/rgba?\\(([^)]+)\\)/g),
  ].map((match) => {
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

  for (const element of document.querySelectorAll('.armor-card p, .armor-benefit-lines span, .armor-effect-strip span, .armor-effect-row span')) {
    const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text || !isVisible(element)) continue;

    const style = getComputedStyle(element);
    const color = composite(parseColor(style.color), defaultBg);

    if (luminance(color) > 0.62) {
      issues.push({
        element: nodeName(element),
        text: text.slice(0, 80),
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        ratio: Number(luminance(color).toFixed(2)),
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

const focusAuditExpression = (family) => `(() => {
  const familySelectors = ${JSON.stringify(focusFamilySelectors)};
  const family = ${JSON.stringify(family)};
  const parseColor = (value) => {
    const text = String(value || '').trim();
    if (text === 'transparent') return [0, 0, 0, 0];
    const rgbMatch = text.match(/rgba?\\(([^)]+)\\)/);
    if (!rgbMatch) return [0, 0, 0, 1];
    const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  };
  const composite = (foreground, background) => {
    const alpha = foreground[3];
    return [
      foreground[0] * alpha + background[0] * (1 - alpha),
      foreground[1] * alpha + background[1] * (1 - alpha),
      foreground[2] * alpha + background[2] * (1 - alpha),
      1,
    ];
  };
  const luminance = (color) => {
    const channels = color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (first, second) => {
    const firstLuminance = luminance(first);
    const secondLuminance = luminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
  };
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const nodeName = (element) => {
    const classes = String(element.className || '').trim().split(/\\s+/).filter(Boolean).slice(0, 4).join('.');
    return element.tagName.toLowerCase() + (classes ? '.' + classes : '');
  };
  const root = document.documentElement;
  const rootProbe = document.createElement('span');
  rootProbe.style.position = 'fixed';
  rootProbe.style.pointerEvents = 'none';
  rootProbe.style.background = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.body.appendChild(rootProbe);
  const pageBackground = parseColor(getComputedStyle(rootProbe).backgroundColor);
  rootProbe.remove();
  const nearestBackground = (element) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color[3] > 0.05) return composite(color, pageBackground);
    }
    return pageBackground;
  };
  const clippedByAncestor = (element, expansion) => {
    const rect = element.getBoundingClientRect();
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      const ancestorRect = ancestor.getBoundingClientRect();
      if (
        (clipsX && (rect.left - expansion < ancestorRect.left || rect.right + expansion > ancestorRect.right))
        || (clipsY && (rect.top - expansion < ancestorRect.top || rect.bottom + expansion > ancestorRect.bottom))
      ) return nodeName(ancestor);
    }
    return '';
  };
  const samples = [];
  const issues = [];
  const element = document.activeElement;
  const belongsToFamily = element instanceof Element
    && (familySelectors[family] || []).some((selector) => element.matches(selector));
  if (belongsToFamily) {
    const style = getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
    const outlineColor = parseColor(style.outlineColor);
    const adjacentBackground = nearestBackground(element.parentElement || element);
    const elementBackground = composite(parseColor(style.backgroundColor), adjacentBackground);
    const adjacentRatio = contrast(composite(outlineColor, adjacentBackground), adjacentBackground);
    const elementRatio = contrast(composite(outlineColor, elementBackground), elementBackground);
    const ratio = Math.min(adjacentRatio, elementRatio);
    const clippedBy = clippedByAncestor(element, outlineWidth + Math.max(0, outlineOffset));
    const active = document.activeElement === element;
    const focusVisible = element.matches(':focus-visible');
    const visible = isVisible(element);
    const sample = {
      family,
      element: nodeName(element),
      active,
      focusVisible,
      visible,
      outlineStyle: style.outlineStyle,
      outlineWidth,
      outlineOffset,
      outlineColor: style.outlineColor,
      ratio: Number(ratio.toFixed(2)),
      clippedBy,
    };
    samples.push(sample);

    if (
      !active
      || !focusVisible
      || !visible
      || style.outlineStyle !== 'solid'
      || outlineWidth < 3
      || outlineOffset < 2
      || ratio < 3
      || clippedBy
    ) {
      issues.push({
        element: sample.element,
        text: family + ' focus active=' + active + ' focusVisible=' + focusVisible + ' visible=' + visible + ' outlineStyle=' + style.outlineStyle + ' expected=solid width=' + outlineWidth + 'px offset=' + outlineOffset + 'px clippedBy=' + (clippedBy || 'none'),
        color: style.outlineColor,
        fontSize: outlineWidth + 'px/' + outlineOffset + 'px',
        fontWeight: family,
        ratio: sample.ratio,
      });
    }
  }

  return {
    path: location.pathname,
    theme: root.getAttribute('data-theme'),
    samples,
    issues,
  };
})()`

const activeFocusFamilyExpression = (requestedFamilies) => `(() => {
  const familySelectors = ${JSON.stringify(focusFamilySelectors)};
  const requestedFamilies = ${JSON.stringify(requestedFamilies)};
  const active = document.activeElement;
  if (!(active instanceof Element)) return '';
  const rect = active.getBoundingClientRect();
  const style = getComputedStyle(active);
  const visible = rect.width > 1 && rect.height > 1
    && style.visibility !== 'hidden'
    && style.display !== 'none'
    && Number(style.opacity) > 0.05;
  if (!visible) return '';
  return requestedFamilies.find((family) => (
    (familySelectors[family] || []).some((selector) => active.matches(selector))
  )) || '';
})()`

const markPreviousFocusExpression = `(() => {
  document.querySelectorAll('[data-focus-audit-previous]').forEach((element) => element.removeAttribute('data-focus-audit-previous'));
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return { marked: false, element: '' };
  const rect = active.getBoundingClientRect();
  const style = getComputedStyle(active);
  const visible = rect.width > 1 && rect.height > 1
    && style.visibility !== 'hidden'
    && style.display !== 'none'
    && Number(style.opacity) > 0.05;
  if (!visible || active.tabIndex < 0) return { marked: false, element: active.tagName.toLowerCase() };
  active.setAttribute('data-focus-audit-previous', 'true');
  return {
    marked: true,
    element: active.tagName.toLowerCase() + (String(active.className || '').trim() ? '.' + String(active.className).trim().split(/\\s+/).slice(0, 4).join('.') : ''),
  };
})()`

const reverseFocusAuditExpression = (family, previousElement) => `(() => {
  const expected = document.querySelector('[data-focus-audit-previous="true"]');
  const active = document.activeElement;
  const activeElement = active instanceof Element
    ? active.tagName.toLowerCase() + (String(active.className || '').trim() ? '.' + String(active.className).trim().split(/\\s+/).slice(0, 4).join('.') : '')
    : '';
  const activeVisible = active instanceof Element && (() => {
    const rect = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    return rect.width > 1 && rect.height > 1
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && Number(style.opacity) > 0.05;
  })();
  const activeMatches = Boolean(expected) && active === expected;
  const focusVisible = active instanceof Element && active.matches(':focus-visible');
  expected?.removeAttribute('data-focus-audit-previous');
  return {
    passed: activeMatches && activeVisible && focusVisible,
    issue: {
      element: activeElement || '<none>',
      text: ${JSON.stringify(family)} + ' reverse Shift+Tab expected=' + ${JSON.stringify(previousElement)} + ' actual=' + (activeElement || '<none>') + ' activeMatchesPrevious=' + activeMatches + ' visible=' + activeVisible + ' focusVisible=' + focusVisible,
      color: '',
      fontSize: '',
      fontWeight: ${JSON.stringify(family)},
      ratio: 0,
    },
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

const biomeDetailThemeExpression = `(() => {
  const root = document.documentElement;
  const copy = document.querySelector('.biome-detail-environment-copy');
  const description = copy?.querySelector('p');
  const hero = document.querySelector('.biome-detail-environment-hero');
  const tags = [...document.querySelectorAll('.biome-detail-environment-hero .tag')];
  if (!copy || !hero) return null;

  const parseColor = (value) => {
    const text = String(value || '').trim();
    const rgbMatch = text.match(/rgba?\\(([^)]+)\\)/);
    if (!rgbMatch) return [0, 0, 0, 1];
    const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  };
  const luminance = (color) => {
    const rgb = color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const textColor = parseColor(getComputedStyle(copy).color);
  const backgroundColor = parseColor(getComputedStyle(copy).backgroundColor);
  const descriptionStyle = description ? getComputedStyle(description) : null;
  const descriptionClamp = descriptionStyle ? String(descriptionStyle.webkitLineClamp || descriptionStyle.lineClamp || '').trim() : '';
  const copyRect = copy.getBoundingClientRect();
  const tagTextLuminance = tags.map((tag) => luminance(parseColor(getComputedStyle(tag).color)));
  const issues = [];

  if (luminance(backgroundColor) < 0.68) {
    issues.push({
      element: '.biome-detail-environment-copy',
      text: 'light theme biome detail copy surface must stay light and theme-aware',
      color: getComputedStyle(copy).backgroundColor + ' / ' + getComputedStyle(copy).backgroundImage,
      fontSize: '',
      fontWeight: '',
      ratio: Number(luminance(backgroundColor).toFixed(2)),
    });
  }

  if (luminance(textColor) > 0.42) {
    issues.push({
      element: '.biome-detail-environment-copy',
      text: 'light theme biome detail copy text must use dark theme text tokens',
      color: getComputedStyle(copy).color,
      fontSize: '',
      fontWeight: '',
      ratio: Number(luminance(textColor).toFixed(2)),
    });
  }

  if (tagTextLuminance.some((value) => value > 0.42)) {
    issues.push({
      element: '.biome-detail-environment-hero .tag',
      text: 'light theme biome detail tags must not remain white-on-dark',
      color: tags.map((tag) => getComputedStyle(tag).color).join(', '),
      fontSize: '',
      fontWeight: '',
      ratio: Number(Math.max(...tagTextLuminance).toFixed(2)),
    });
  }

  if (backgroundColor[3] > 0.74) {
    issues.push({
      element: '.biome-detail-environment-copy',
      text: 'light theme biome detail copy surface must not become an opaque paper card',
      color: getComputedStyle(copy).backgroundColor + ' / ' + getComputedStyle(copy).backgroundImage,
      fontSize: Math.round(copyRect.width) + 'x' + Math.round(copyRect.height),
      fontWeight: '',
      ratio: Number(backgroundColor[3].toFixed(2)),
    });
  }

  if (copyRect.width > 610) {
    issues.push({
      element: '.biome-detail-environment-copy',
      text: 'light theme biome detail copy width must leave the biome artwork dominant',
      color: getComputedStyle(copy).backgroundColor,
      fontSize: Math.round(copyRect.width) + 'x' + Math.round(copyRect.height),
      fontWeight: '',
      ratio: Number(copyRect.width.toFixed(0)),
    });
  }

  if (!description) {
    issues.push({
      element: '.biome-detail-environment-copy p',
      text: 'light theme biome detail description must exist for readability checks',
      color: '',
      fontSize: '',
      fontWeight: '',
      ratio: 0,
    });
  } else if (
    descriptionStyle.display !== 'block'
    || descriptionStyle.overflow !== 'visible'
    || /^\d+$/.test(descriptionClamp)
  ) {
    issues.push({
      element: '.biome-detail-environment-copy p',
      text: 'light theme biome detail description must wrap naturally without truncation',
      color: descriptionStyle.display + ' / ' + descriptionStyle.overflow + ' / ' + descriptionClamp,
      fontSize: Math.round(description.scrollHeight) + 'px content',
      fontWeight: descriptionStyle.fontWeight,
      ratio: Number(description.getBoundingClientRect().height.toFixed(0)),
    });
  }

  return {
    path: location.pathname,
    theme: root.getAttribute('data-theme'),
    expectedTheme: root.getAttribute('data-theme'),
    issues,
  };
})()`

const themeAppliedExpression = (theme) => `(() => {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return root.getAttribute('data-theme') === ${JSON.stringify(theme)}
    && style.getPropertyValue('--theme-text-rgb').trim().length > 0
    && style.colorScheme.includes('light');
})()`

const applyThemeExpression = (theme) => `(() => {
  document.cookie = 'terrapedia-theme=${theme}; Path=/; SameSite=Lax';
  document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
  return true;
})()`

const pollRuntimeBoolean = async (browser, expression, attempts = 50) => {
  for (let index = 0; index < attempts; index += 1) {
    const result = await browser.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })

    if (result.result.value === true) {
      return
    }

    await sleep(100)
  }

  throw new Error('Runtime condition did not become true')
}

const pressTab = async (browser) => {
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  })
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  })
}

const pressShiftTab = async (browser) => {
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Shift',
    code: 'ShiftLeft',
    windowsVirtualKeyCode: 16,
    nativeVirtualKeyCode: 16,
    modifiers: 8,
  })
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
    modifiers: 8,
  })
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
    modifiers: 8,
  })
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Shift',
    code: 'ShiftLeft',
    windowsVirtualKeyCode: 16,
    nativeVirtualKeyCode: 16,
  })
}

const collectKeyboardFocusSamples = async (browser, requestedFamilies, maxTabs = 180) => {
  const remaining = new Set(requestedFamilies)
  const samples = []
  const issues = []
  let reverseEvidence = 0

  for (let index = 0; index < maxTabs && remaining.size > 0; index += 1) {
    const previousResult = await browser.send('Runtime.evaluate', {
      expression: markPreviousFocusExpression,
      returnByValue: true,
    })
    const previous = previousResult.result.value
    await pressTab(browser)
    await sleep(30)
    const requested = [...remaining]
    const familyResult = await browser.send('Runtime.evaluate', {
      expression: activeFocusFamilyExpression(requested),
      returnByValue: true,
    })
    const family = familyResult.result.value
    if (!family) continue

    const auditResult = await browser.send('Runtime.evaluate', {
      expression: focusAuditExpression(family),
      returnByValue: true,
    })
    const value = auditResult.result.value
    samples.push(...value.samples)
    issues.push(...value.issues)

    if (!previous.marked) {
      issues.push({
        element: family,
        text: `${family} reverse Shift+Tab has no previous visible keyboard-focusable element after forward traversal`,
        color: '',
        fontSize: '',
        fontWeight: family,
        ratio: 0,
      })
    } else {
      await pressShiftTab(browser)
      await sleep(30)
      const reverseResult = await browser.send('Runtime.evaluate', {
        expression: reverseFocusAuditExpression(family, previous.element),
        returnByValue: true,
      })
      const reverseValue = reverseResult.result.value
      if (reverseValue.passed) reverseEvidence += 1
      else issues.push(reverseValue.issue)
      await pressTab(browser)
      await sleep(30)
    }
    remaining.delete(family)
  }

  return { samples, issues, missing: [...remaining], reverseEvidence }
}

await waitFor(`${baseUrl}/`)

const port = Number(process.env.CHROMIUM_REMOTE_DEBUGGING_PORT || 9241)
const browser = await connectToChrome(port)
const failures = []
const fontFamilies = new Set()
const focusCoverage = new Map(targetThemes.map((theme) => [theme, new Set()]))
const focusSampleCounts = new Map(targetThemes.map((theme) => [theme, 0]))
const reverseFocusEvidenceCounts = new Map(targetThemes.map((theme) => [theme, 0]))
const focusFailures = []

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
      await withTimeout(loaded, 5000, `load event for ${route}`).catch(() => {})
      await browser.send('Runtime.evaluate', {
        expression: applyThemeExpression(targetTheme),
        returnByValue: true,
      })
      await withTimeout(
        pollRuntimeBoolean(browser, themeAppliedExpression(targetTheme)),
        5000,
        `${targetTheme} applied on ${route}`,
      )

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

      const missingFocusFamilies = requiredFocusFamilies.filter((family) => !focusCoverage.get(targetTheme).has(family))
      if (missingFocusFamilies.length > 0) {
        const focusValue = await collectKeyboardFocusSamples(browser, missingFocusFamilies)
        focusSampleCounts.set(targetTheme, focusSampleCounts.get(targetTheme) + focusValue.samples.length)
        reverseFocusEvidenceCounts.set(targetTheme, reverseFocusEvidenceCounts.get(targetTheme) + focusValue.reverseEvidence)
        for (const sample of focusValue.samples) {
          focusCoverage.get(targetTheme).add(sample.family)
        }
        if (focusValue.issues.length > 0) {
          focusFailures.push({
            path: focusValue.path,
            theme: focusValue.theme,
            expectedTheme: targetTheme,
            issues: focusValue.issues,
          })
        }
      }

      if (route === '/biomes/4' || route === '/biomes/7' || route === '/biomes/92' || route === '/biomes/100') {
        const biomeDetailThemeResult = await browser.send('Runtime.evaluate', {
          expression: biomeDetailThemeExpression,
          returnByValue: true,
        })
        const biomeDetailThemeValue = biomeDetailThemeResult.result.value

        if (biomeDetailThemeValue?.issues?.length > 0) {
          failures.push(biomeDetailThemeValue)
        }
      }
    }
  }
} finally {
  browser.ws.close()
  browser.chrome.kill('SIGTERM')
}

for (const targetTheme of targetThemes) {
  const coveredFamilies = [...focusCoverage.get(targetTheme)]
  const missingFamilies = requiredFocusFamilies.filter((family) => !focusCoverage.get(targetTheme).has(family))
  if (missingFamilies.length > 0) {
    focusFailures.push({
      path: 'focus-family-coverage',
      theme: targetTheme,
      expectedTheme: targetTheme,
      issues: missingFamilies.map((family) => ({
        element: family,
        text: `required focus family was never exercised; covered=${coveredFamilies.join(',') || 'none'}`,
        color: '',
        fontSize: '',
        fontWeight: family,
        ratio: 0,
      })),
    })
  }

  const themeFocusFailures = focusFailures.filter((failure) => failure.expectedTheme === targetTheme)
  const summary = `theme=${targetTheme} families=${coveredFamilies.join(',') || 'none'} samples=${focusSampleCounts.get(targetTheme)} reverse=${reverseFocusEvidenceCounts.get(targetTheme)} issues=${themeFocusFailures.reduce((count, failure) => count + failure.issues.length, 0)}`
  if (themeFocusFailures.length > 0) {
    console.error(`Light theme focus audit failed: ${summary}`)
  } else {
    console.log(`Light theme focus audit passed: ${summary}`)
  }
}

failures.push(...focusFailures)

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
