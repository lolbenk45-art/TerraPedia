import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const readProjectFile = (path) => readFileSync(resolve(projectRoot, path), 'utf8')

const hifi = readProjectFile('assets/css/hifi-preview.css')
const catalog = readProjectFile('assets/css/catalog-image-fixes.css')
const styles = `${hifi}\n${catalog}`

const count = (content, pattern) => content.match(pattern)?.length ?? 0

const selectorContains = (selectorList, selector) => selectorList
  .split(',')
  .map((part) => part.replace(/\s+/g, ' ').trim())
  .some((part) => part === selector || part.endsWith(` ${selector}`))

const ruleFor = (content, selector) => {
  const rules = [...content.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const normalizedTarget = selector.replace(/\s+/g, ' ').trim()
  return rules.find((match) => selectorContains(match[1], normalizedTarget))?.[2] ?? ''
}

const failures = []

const largeShadowCount = count(styles, /box-shadow:\s*[^;]*0 \d{2}px \d{2}px/g)
const radialCount = count(styles, /radial-gradient/g)
const gridTextureCount = count(styles, /var\(--index-grid-x\)/g)

if (largeShadowCount > 4) {
  failures.push(`large box-shadow count must be <= 4 after phase 4 slimming, got ${largeShadowCount}`)
}

if (radialCount > 42) {
  failures.push(`radial-gradient count must be <= 42 after phase 4 slimming, got ${radialCount}`)
}

if (gridTextureCount > 45) {
  failures.push(`section grid texture count must be <= 45 after phase 4 slimming, got ${gridTextureCount}`)
}

for (const selector of [
  '.atlas-index',
  '.exploration-map',
  '.paper-stage',
  '.boss-strip',
  '.codex-band',
  '.index-plinth',
  '.support-panel',
  '.catalog-wall-shell',
]) {
  const source = selector === '.catalog-wall-shell' ? catalog : hifi
  const rule = ruleFor(source, selector)
  if (!rule) {
    failures.push(`${selector}: missing rule`)
    continue
  }

  if (rule.includes('radial-gradient')) {
    failures.push(`${selector}: must not keep radial-gradient decoration`)
  }

  if (rule.includes('var(--index-grid-x)')) {
    failures.push(`${selector}: must not repeat the global grid texture`)
  }

  if (/0 \d{2}px \d{2}px/.test(rule)) {
    failures.push(`${selector}: must not keep large shadow decoration`)
  }
}

for (const selector of [
  '.atlas-index::before',
  '.atlas-index::after',
  '.paper-stage::before',
  '.catalog-wall-shell::after',
]) {
  const source = selector.startsWith('.catalog') ? catalog : hifi
  if (ruleFor(source, selector)) {
    failures.push(`${selector}: decorative pseudo element must be removed`)
  }
}

for (const [selector, maxPadding] of [
  ['.atlas-index', 22],
  ['.exploration-map', 30],
  ['.paper-stage', 30],
  ['.boss-strip', 24],
  ['.codex-band', 24],
  ['.catalog-wall-shell', 22],
]) {
  const source = selector.startsWith('.catalog') ? catalog : hifi
  const rule = ruleFor(source, selector)
  const paddingValues = [...rule.matchAll(/padding:\s*([^;]+)/g)]
    .flatMap((match) => [...match[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map((valueMatch) => Number(valueMatch[1])))

  if (paddingValues.some((value) => value > maxPadding)) {
    failures.push(`${selector}: padding must be <= ${maxPadding}px after slimming, got ${paddingValues.join(', ')}`)
  }
}

if (failures.length) {
  console.error('Decoration slimming checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Decoration slimming checks passed. largeShadows=${largeShadowCount}, radial=${radialCount}, gridTextures=${gridTextureCount}.`)
