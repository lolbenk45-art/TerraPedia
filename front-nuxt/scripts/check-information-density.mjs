import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const readProjectFile = (path) => readFileSync(resolve(projectRoot, path), 'utf8')

const files = {
  hifi: readProjectFile('assets/css/hifi-preview.css'),
  bossIndex: readProjectFile('pages/bosses/index.vue'),
  bossDetail: readProjectFile('pages/bosses/[id].vue'),
  categories: readProjectFile('pages/categories/index.vue'),
  packageJson: readProjectFile('package.json'),
}

const failures = []

const selectorContains = (selectorList, selector) => selectorList
  .split(',')
  .map((part) => part.replace(/\s+/g, ' ').trim())
  .some((part) => part === selector || part.endsWith(` ${selector}`))

const findRuleContaining = (content, selector) => {
  const rules = [...content.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const normalizedTarget = selector.replace(/\s+/g, ' ').trim()
  return rules.find((match) => selectorContains(match[1], normalizedTarget))?.[2] ?? ''
}

const expectedSpaces = {
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '24px',
  '--space-6': '32px',
  '--space-7': '48px',
}

for (const [token, value] of Object.entries(expectedSpaces)) {
  if (!new RegExp(`${token}:\\s*${value};`).test(files.hifi)) {
    failures.push(`:root must define ${token}: ${value}`)
  }
}

if (!files.packageJson.includes('"check:information-density": "node scripts/check-information-density.mjs"')) {
  failures.push('package.json must expose check:information-density')
}

if (/<div><b>0[1-4]<\/b><span>/.test(files.bossIndex)) {
  failures.push('bosses index stats must not render four card divs')
}

if (!files.bossIndex.includes('class="boss-command-stats"') || !files.bossIndex.includes('<span><b>01</b><em>战前检查</em></span>')) {
  failures.push('bosses index must render compact stat strip items')
}

const bossStatsRule = findRuleContaining(files.hifi, '.boss-command-stats')
if (!bossStatsRule) {
  failures.push('.boss-command-stats rule is missing')
} else {
  if (!/display:\s*flex/.test(bossStatsRule)) {
    failures.push('.boss-command-stats must use a single-line flex strip')
  }

  if (/grid-template-columns|min-height:\s*86px|padding:\s*16px/.test(bossStatsRule)) {
    failures.push('.boss-command-stats must not keep card grid/min-height/padding')
  }

  if (!/var\(--space-[123]\)/.test(bossStatsRule)) {
    failures.push('.boss-command-stats should use compact spacing tokens')
  }
}

if (/<aside class="boss-readiness">/.test(files.bossDetail)) {
  failures.push('boss detail readiness must not be an aside card')
}

if (!/<p class="boss-readiness">/.test(files.bossDetail)) {
  failures.push('boss detail readiness must render as inline paragraph copy')
}

const bossReadinessRule = findRuleContaining(files.hifi, '.boss-readiness')
if (!bossReadinessRule) {
  failures.push('.boss-readiness rule is missing')
} else if (/display:\s*grid|border:|background:|padding:|min-height:/.test(bossReadinessRule)) {
  failures.push('.boss-readiness must not keep card styling')
}

if (files.categories.includes('class="support-panel category-entry-card"')) {
  failures.push('categories taxonomy band must not render three support-panel cards')
}

if (!files.categories.includes('class="taxonomy-list"') || !files.categories.includes('class="taxonomy-row"')) {
  failures.push('categories taxonomy band must render a compact two-line list')
}

const taxonomyBandRule = findRuleContaining(files.hifi, '.taxonomy-band')
const taxonomyRowRule = findRuleContaining(files.hifi, '.taxonomy-row')
if (!taxonomyBandRule) {
  failures.push('.taxonomy-band rule is missing')
} else if (/grid-template-columns:\s*repeat\(3|min-height:\s*230px/.test(taxonomyBandRule)) {
  failures.push('.taxonomy-band must not keep three-card grid density')
}

if (!taxonomyRowRule) {
  failures.push('.taxonomy-row rule is missing')
} else if (!/display:\s*grid/.test(taxonomyRowRule) || !/var\(--space-[23]\)/.test(taxonomyRowRule)) {
  failures.push('.taxonomy-row must use dense grid/list styling with spacing tokens')
}

const touchedSelectors = [
  '.boss-command',
  '.boss-command-stats',
  '.boss-command-stats span',
  '.boss-detail-hero',
  '.boss-readiness',
  '.boss-phase-grid',
  '.boss-phase',
  '.taxonomy-band',
  '.taxonomy-list',
  '.taxonomy-row',
]

for (const selector of touchedSelectors) {
  const rule = findRuleContaining(files.hifi, selector)
  if (!rule) continue

  const spacingDeclarations = [...rule.matchAll(/\b(?:padding|margin|gap|row-gap|column-gap):\s*([^;]+)/g)]
  for (const declaration of spacingDeclarations) {
    if (!/(?:0|auto|var\(--space-[1-7]\)|calc\()/.test(declaration[1])) {
      failures.push(`${selector}: spacing declaration must use --space tokens or 0, got "${declaration[0]}"`)
    }
  }
}

if (failures.length) {
  console.error('Information density checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Information density checks passed.')
