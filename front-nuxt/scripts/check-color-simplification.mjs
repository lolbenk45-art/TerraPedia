import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const readProjectFile = (path) => readFileSync(resolve(projectRoot, path), 'utf8')

const files = {
  'assets/css/hifi-preview.css': readProjectFile('assets/css/hifi-preview.css'),
  'assets/css/catalog-image-fixes.css': readProjectFile('assets/css/catalog-image-fixes.css'),
  'assets/css/light-theme-contrast-fixes.css': readProjectFile('assets/css/light-theme-contrast-fixes.css'),
}

const failures = []
const allowedMossColorPatterns = [
  /--tag-moss:/,
  /\.tag\.moss/,
  /tag\.moss/,
  /--moss:\s*var\(--tag-moss\)/,
]

for (const [file, content] of Object.entries(files)) {
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const location = `${file}:${index + 1}`

    if (/#7da55b|#9db89a|#cff0a5/.test(line) && !allowedMossColorPatterns.some((pattern) => pattern.test(line))) {
      failures.push(`${location}: moss/positive green must be removed from main UI colors`)
    }

    if (/--text-positive:/.test(line) && !/var\(--accent\)/.test(line) && !/var\(--text-accent\)/.test(line)) {
      failures.push(`${location}: --text-positive must map to the accent family`)
    }

    if (/--theme-positive-rgb:/.test(line) && !/var\(--theme-gold-rgb\)/.test(line)) {
      failures.push(`${location}: --theme-positive-rgb must alias theme gold after color simplification`)
    }
  })
}

const hifi = files['assets/css/hifi-preview.css']
const catalog = files['assets/css/catalog-image-fixes.css']
const lightTheme = files['assets/css/light-theme-contrast-fixes.css']

const findRuleContaining = (content, selector) => {
  const rules = [...content.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const normalizedTarget = selector.replace(/\s+/g, ' ').trim()
  return rules.find((match) => match[1].replace(/\s+/g, ' ').trim().includes(normalizedTarget))?.[2] ?? ''
}

for (const [selector, source] of [
  ['.site-link:hover', hifi],
  ['.primary-button:hover', hifi],
  ['.secondary-button:hover', hifi],
  ['.small-button:hover', hifi],
  ['.hero-j1-cell:hover', hifi],
  ['.catalog-wall-cell:hover', catalog],
]) {
  const body = findRuleContaining(source, selector)
  if (!body) {
    failures.push(`${selector}: missing rule for color simplification audit`)
    continue
  }

  if (!/(--accent|--gold|--theme-gold-rgb|--button-primary|--button-secondary|--button-control|217,\s*185,\s*91|240,\s*207,\s*116|214,\s*177,\s*90)/.test(body)) {
    failures.push(`${selector}: hover/active state must use accent/gold family`)
  }

  if (/(--moss|--text-positive|--theme-positive-rgb|#7da55b|#9db89a|#cff0a5)/.test(body)) {
    failures.push(`${selector}: hover/active state must not use moss/positive green`)
  }
}

for (const [selector, source] of [
  ['.boss-node:hover', hifi],
  ['.map-node:hover', hifi],
]) {
  const body = findRuleContaining(source, selector)
  if (body && /(--moss|--text-positive|--theme-positive-rgb|#7da55b|#9db89a|#cff0a5)/.test(body)) {
    failures.push(`${selector}: hover state must not use moss/positive green`)
  }
}

for (const [file, content] of Object.entries({ 'assets/css/hifi-preview.css': hifi, 'assets/css/light-theme-contrast-fixes.css': lightTheme })) {
  if (/--button-primary-bg:\s*linear-gradient\([^;]*(#2e5c24|#183318|#263b22|#142216|#293241|#1d2430)/.test(content)) {
    failures.push(`${file}: primary button background must use accent/gold, not green/slate theme fill`)
  }
}

if (failures.length) {
  console.error('Color simplification checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Color simplification checks passed.')
