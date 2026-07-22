import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(frontRoot, '..')
const durablePath = join(repoRoot, 'docs/audits/2026-07-21-light-theme-button-style-options.html')
const publicPath = join(frontRoot, 'public/button-style-options.html')
const violations = []
const requiredStates = ['default', 'hover', 'selected', 'focus', 'disabled']

const stripHtmlComments = (source) => source.replace(/<!--[\s\S]*?-->/g, '')
const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '')
const stripElement = (source, tagName) => source.replace(
  new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, 'gi'),
  '',
)
const structuralSource = (source) => stripElement(stripElement(stripHtmlComments(source), 'script'), 'style')
const globalSource = (source) => stripElement(stripCssComments(stripHtmlComments(source)), 'script')
const requiredGlobalMarkers = [
  '--primary-marker',
  'min-height: 44px',
  '@media (prefers-reduced-motion: reduce)',
]
const missingGlobalMarkers = (source) => requiredGlobalMarkers.filter((marker) => !globalSource(source).includes(marker))

const attributesFor = (tag) => {
  const attributes = new Map()
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  const tagNameEnd = tag.search(/\s|\/?>/)
  const attributeSource = tagNameEnd < 0 ? '' : tag.slice(tagNameEnd)

  for (const match of attributeSource.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

const hasClass = (attributes, className) => (
  (attributes.get('class') ?? '').split(/\s+/).includes(className)
)

const themeCardRegions = (source) => {
  const clean = structuralSource(source)
  const tokens = [...clean.matchAll(/<\/?section\b[^>]*>/gi)]
  const cards = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token[0].startsWith('</') || !hasClass(attributesFor(token[0]), 'theme-card')) continue

    let depth = 1
    for (let closingIndex = index + 1; closingIndex < tokens.length; closingIndex += 1) {
      depth += tokens[closingIndex][0].startsWith('</') ? -1 : 1
      if (depth !== 0) continue

      cards.push({
        openingTag: token[0],
        source: clean.slice(token.index, tokens[closingIndex].index + tokens[closingIndex][0].length),
      })
      break
    }
  }
  return cards
}

const visibleText = (source) => source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const validateCards = (source, owner = 'prototype') => {
  const issues = []
  const cards = themeCardRegions(source)
  if (cards.length !== 2) issues.push(`${owner} must render exactly two approved section.theme-card elements; found ${cards.length}`)

  const expectedThemes = [
    ['warm-slate', 'Mist Workbench'],
    ['morning-paper', 'Linen Paper'],
  ]

  for (const [theme, name] of expectedThemes) {
    const matches = cards.filter(({ openingTag }) => attributesFor(openingTag).get('data-theme-preview') === theme)
    if (matches.length !== 1) {
      issues.push(`${owner} must contain exactly one ${theme} theme card; found ${matches.length}`)
      continue
    }

    const card = matches[0]
    if (!visibleText(card.source).includes(name)) issues.push(`${owner} ${theme} card must be named ${name}`)

    const stateValues = [...card.source.matchAll(/<[^>]+\bdata-state\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)]
      .map((match) => match[1] ?? match[2] ?? match[3])
    for (const state of requiredStates) {
      if (!stateValues.includes(state)) issues.push(`${owner} ${theme} card missing data-state="${state}"`)
    }
  }

  return issues
}

const completeCard = (theme, name, omittedState = '') => `
  <section
    class="preview theme-card"
    data-theme-preview="${theme}"
  >
    <h2>${name}</h2>
    ${requiredStates.filter((state) => state !== omittedState).map((state) => `<button data-state="${state}">${state}</button>`).join('\n')}
  </section>`

const runSelfTests = () => {
  const fixtures = [
    {
      name: 'formatted approved cards',
      source: `${completeCard('warm-slate', 'Mist Workbench')}${completeCard('morning-paper', 'Linen Paper')}`,
      expectedIssue: '',
    },
    {
      name: 'duplicate theme',
      source: `${completeCard('warm-slate', 'Mist Workbench')}${completeCard('warm-slate', 'Linen Paper')}`,
      expectedIssue: 'exactly one warm-slate theme card; found 2',
    },
    {
      name: 'missing per-card state',
      source: `${completeCard('warm-slate', 'Mist Workbench', 'disabled')}${completeCard('morning-paper', 'Linen Paper')}`,
      expectedIssue: 'warm-slate card missing data-state="disabled"',
    },
    {
      name: 'comment script style and text fake card markers',
      source: `${completeCard('warm-slate', 'Mist Workbench')}<!-- ${completeCard('morning-paper', 'Linen Paper')} --><script>const fake = '<section class="theme-card" data-theme-preview="morning-paper">Linen Paper</section>'</script><style>.fake::after { content: '<section class="theme-card">'; }</style>&lt;section class="theme-card" data-theme-preview="morning-paper"&gt;Linen Paper&lt;/section&gt;`,
      expectedIssue: 'exactly two approved section.theme-card elements; found 1',
    },
  ]

  for (const fixture of fixtures) {
    const issues = validateCards(fixture.source, `self-test ${fixture.name}`)
    if (fixture.expectedIssue === '' && issues.length > 0) {
      violations.push(`self-test ${fixture.name} unexpectedly failed: ${issues.join('; ')}`)
    } else if (fixture.expectedIssue && !issues.some((issue) => issue.includes(fixture.expectedIssue))) {
      violations.push(`self-test ${fixture.name} did not report ${fixture.expectedIssue}: ${issues.join('; ') || 'no issues'}`)
    }
  }

  const fakeGlobalMarkers = '<!-- --primary-marker min-height: 44px --><script>"@media (prefers-reduced-motion: reduce)"</script>/* --primary-marker; min-height: 44px; @media (prefers-reduced-motion: reduce) */'
  if (missingGlobalMarkers(fakeGlobalMarkers).length !== requiredGlobalMarkers.length) {
    violations.push('self-test comment/script-only global markers unexpectedly satisfied the contract')
  }
}

const readPrototype = (path) => {
  try {
    return readFileSync(path)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    violations.push(`cannot read ${relative(repoRoot, path)}: ${detail}`)
    return null
  }
}

runSelfTests()

const durable = readPrototype(durablePath)
const served = readPrototype(publicPath)

if (durable && served && !durable.equals(served)) {
  violations.push('button style option copies must be byte-identical')
}

if (durable) {
  const source = durable.toString('utf8')
  const searchableSource = globalSource(source)

  for (const marker of missingGlobalMarkers(source)) {
    violations.push(`prototype missing ${marker}`)
  }

  for (const [label, pattern] of [
    ['Paper A', /Paper(?:\s+|-)A/],
    ['Paper B', /Paper(?:\s+|-)B/],
    ['Paper C', /Paper(?:\s+|-)C/],
    ['Slate A', /Slate(?:\s+|-)A/],
    ['Slate B', /Slate(?:\s+|-)B/],
    ['Slate C', /Slate(?:\s+|-)C/],
    ['linear-gradient(', /linear-gradient\(/],
  ]) {
    if (pattern.test(searchableSource)) violations.push(`prototype retains rejected treatment ${label}`)
  }

  violations.push(...validateCards(source))
}

if (violations.length > 0) {
  console.error(`Button style options contract failed:\n- ${violations.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Button style options contract passed.')
}
