import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = 'assets/css/hifi-preview.css'
const tokenPath = 'assets/css/tokens.css'
const catalogPath = 'assets/css/domains/catalog.css'
const css = readFileSync(join(root, path), 'utf8')
const tokenCss = readFileSync(join(root, tokenPath), 'utf8')
const catalogCss = readFileSync(join(root, catalogPath), 'utf8')
const violations = []

const normalizeValue = (value) => value.trim().replace(/\s+/g, ' ')

const stripCssComments = (content) => {
  let result = ''
  let quote = ''

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (quote) {
      result += character
      if (character === '\\') {
        result += content[index + 1] ?? ''
        index += 1
      } else if (character === quote) {
        quote = ''
      }
    } else if (character === '"' || character === "'") {
      quote = character
      result += character
    } else if (character === '/' && content[index + 1] === '*') {
      result += ' '
      index += 2
      while (index < content.length && (content[index] !== '*' || content[index + 1] !== '/')) {
        index += 1
      }
      index += 1
    } else {
      result += character
    }
  }

  return result
}

const findMatchingBrace = (content, openingIndex) => {
  let depth = 0
  let quote = ''
  let inComment = false

  for (let index = openingIndex; index < content.length; index += 1) {
    const character = content[index]

    if (inComment) {
      if (character === '*' && content[index + 1] === '/') {
        inComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '/' && content[index + 1] === '*') {
      inComment = true
      index += 1
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

const topLevelRules = (content) => {
  const rules = []
  let ruleStart = 0
  let quote = ''
  let inComment = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (inComment) {
      if (character === '*' && content[index + 1] === '/') {
        inComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '/' && content[index + 1] === '*') {
      inComment = true
      index += 1
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === ';') {
      ruleStart = index + 1
      continue
    }

    if (character !== '{') continue

    const prelude = stripCssComments(content.slice(ruleStart, index))
    const selector = prelude.trim()
    const closingIndex = findMatchingBrace(content, index)
    rules.push({
      selector,
      prelude,
      block: closingIndex < 0 ? null : content.slice(index + 1, closingIndex),
      start: ruleStart,
    })

    if (closingIndex < 0) break
    index = closingIndex
    ruleStart = closingIndex + 1
  }

  return rules
}

const blockFor = (content, selector, issueSink = violations, ownerPath = path) => {
  const exactPrelude = `${selector} `
  const matches = topLevelRules(content).filter((rule) => (
    rule.selector === selector && rule.prelude.trimStart() === exactPrelude
  ))

  if (matches.length === 0) {
    issueSink.push(`${ownerPath}: missing exact top-level selector block ${selector}`)
    return ''
  }

  if (matches.length > 1) {
    issueSink.push(`${ownerPath}: expected exactly one top-level selector block ${selector}; found ${matches.length}`)
    return matches.at(-1)?.block ?? ''
  }

  if (matches[0].block === null) {
    issueSink.push(`${ownerPath}: unterminated exact top-level selector block ${selector}`)
    return ''
  }

  return matches[0].block
}

const findTopLevelColon = (segment) => {
  let quote = ''
  let parenthesisDepth = 0
  let braceDepth = 0

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index]

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      parenthesisDepth += 1
    } else if (character === ')') {
      parenthesisDepth -= 1
    } else if (character === '{') {
      braceDepth += 1
    } else if (character === '}') {
      braceDepth -= 1
    } else if (character === ':' && parenthesisDepth === 0 && braceDepth === 0) {
      return index
    }
  }

  return -1
}

const declarationsFor = (block) => {
  const declarations = new Map()
  let segment = ''
  let quote = ''
  let inComment = false
  let parenthesisDepth = 0
  let braceDepth = 0

  const collect = () => {
    const colonIndex = findTopLevelColon(segment)
    if (colonIndex >= 0) {
      const property = segment.slice(0, colonIndex).trim()
      const value = normalizeValue(segment.slice(colonIndex + 1))
      if (property) {
        const values = declarations.get(property) ?? []
        values.push(value)
        declarations.set(property, values)
      }
    }
    segment = ''
  }

  for (let index = 0; index < block.length; index += 1) {
    const character = block[index]

    if (inComment) {
      if (character === '*' && block[index + 1] === '/') {
        inComment = false
        segment += ' '
        index += 1
      }
      continue
    }

    if (quote) {
      segment += character
      if (character === '\\') {
        segment += block[index + 1] ?? ''
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '/' && block[index + 1] === '*') {
      inComment = true
      index += 1
    } else if (character === '"' || character === "'") {
      quote = character
      segment += character
    } else if (character === '(') {
      parenthesisDepth += 1
      segment += character
    } else if (character === ')') {
      parenthesisDepth -= 1
      segment += character
    } else if (character === '{') {
      braceDepth += 1
      segment += character
    } else if (character === '}') {
      braceDepth -= 1
      segment += character
    } else if (character === ';' && parenthesisDepth === 0 && braceDepth === 0) {
      collect()
    } else {
      segment += character
    }
  }

  if (segment.trim()) collect()
  return declarations
}

const declarationValuesFor = (declarations, property) => declarations.get(property) ?? []
const effectiveValueFor = (declarations, property) => declarationValuesFor(declarations, property).at(-1) ?? ''

const requireDeclarations = (owner, declarations, expectedDeclarations, issueSink = violations, ownerPath = path) => {
  for (const [property, expectedValue] of Object.entries(expectedDeclarations)) {
    const values = declarationValuesFor(declarations, property)
    if (values.length !== 1) {
      issueSink.push(`${ownerPath}: ${owner} must declare exactly one ${property}; found ${values.length}`)
    }

    const actualValue = values.at(-1) ?? ''
    if (actualValue !== expectedValue) {
      issueSink.push(`${ownerPath}: ${owner} ${property} expected ${expectedValue}; found ${actualValue || '<missing>'}`)
    }
  }
}

const runParserSelfTests = () => {
  const failures = []
  const assert = (condition, message) => {
    if (!condition) failures.push(`contract parser self-test failed: ${message}`)
  }

  const commentIssues = []
  const commentedBlock = blockFor('/* leading trivia */\n[data-theme="fixture"] { --token: ok; }', '[data-theme="fixture"]', commentIssues)
  assert(commentIssues.length === 0 && effectiveValueFor(declarationsFor(commentedBlock), '--token') === 'ok', 'top-level comments before selectors must be trivia')

  const duplicateBlock = '--token: first; --token: second;'
  const duplicateDeclarations = declarationsFor(duplicateBlock)
  const duplicateIssues = []
  assert(declarationValuesFor(duplicateDeclarations, '--token').length === 2, 'duplicate declarations must remain observable')
  requireDeclarations('self-test fixture', duplicateDeclarations, { '--token': 'second' }, duplicateIssues)
  assert(duplicateIssues.some((issue) => issue.includes('must declare exactly one --token; found 2')), 'duplicate owned declarations must be rejected explicitly')

  const quotedBlock = '--quoted: "semi; brace }"; --after: ok;'
  const quotedDeclarations = declarationsFor(quotedBlock)
  assert(effectiveValueFor(quotedDeclarations, '--quoted') === '"semi; brace }"', 'quoted semicolons and braces must stay inside declaration values')
  assert(effectiveValueFor(quotedDeclarations, '--after') === 'ok', 'declarations after quoted delimiters must remain parseable')

  const multilineBlock = '--shadow:\n  inset 3px 0 0 red,\n  inset 0 1px 0 white;'
  assert(effectiveValueFor(declarationsFor(multilineBlock), '--shadow') === 'inset 3px 0 0 red, inset 0 1px 0 white', 'multiline declaration values must normalize predictably')

  const focusFixture = `:where(\n  ${requiredFocusConsumers.join(',\n  ')}\n):focus-visible { outline: 3px solid var(--button-focus-ring); outline-offset: 2px; }`
  const focusRule = topLevelRules(focusFixture)[0]
  assert(hasExactConsumerSet(focusConsumersFor(focusRule?.selector ?? '') ?? []), 'formatted multiline focus selectors must preserve the exact consumer set')

  const catalogFocusFixture = `:is([data-theme="morning-paper"], [data-theme="warm-slate"]) :is(\n  ${requiredCatalogFocusConsumers.join(',\n  ')}\n):focus-visible { outline: 3px solid var(--button-focus-ring); outline-offset: 2px; }`
  const catalogFocusRule = topLevelRules(catalogFocusFixture)[0]
  assert(hasExactCatalogConsumerSet(catalogFocusConsumersFor(catalogFocusRule?.selector ?? '') ?? []), 'formatted catalog focus selectors must preserve the exact consumer set')

  return failures
}

const splitShadowLayers = (value) => {
  const layers = []
  let start = 0
  let parenthesisDepth = 0

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') parenthesisDepth += 1
    if (value[index] === ')') parenthesisDepth -= 1
    if (value[index] === ',' && parenthesisDepth === 0) {
      layers.push(value.slice(start, index).trim())
      start = index + 1
    }
  }

  layers.push(value.slice(start).trim())
  return layers
}

const hasLargeExternalShadow = (value) => splitShadowLayers(value).some((layer) => {
  if (!layer || layer === 'none' || layer.startsWith('inset ')) return false

  const dimension = '-?(?:0|\\d+(?:\\.\\d+)?px)'
  const dimensions = layer.match(new RegExp(`(?:^|\\s)(${dimension})\\s+(${dimension})\\s+(${dimension})(?:\\s+(${dimension}))?`))
  if (!dimensions) return false

  const [, , offsetY, blur, spread = '0'] = dimensions
  return Math.abs(Number.parseFloat(offsetY)) >= 6
    || Number.parseFloat(blur) >= 12
    || Number.parseFloat(spread) >= 6
})

const expected = {
  '[data-theme="morning-paper"]': {
    '--button-primary-bg': '#e9dfd1',
    '--button-primary-bg-hover': '#e2d5c5',
    '--button-primary-fg': '#55483a',
    '--button-primary-border': 'rgba(121, 93, 64, 0.17)',
    '--button-primary-marker': '#967b5f',
    '--button-primary-shadow': 'inset 3px 0 0 var(--button-primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-secondary-bg': '#eee8de',
    '--button-secondary-bg-hover': '#e8dfd2',
    '--button-secondary-fg': '#4e4941',
    '--button-secondary-border': 'rgba(79, 70, 58, 0.09)',
    '--button-secondary-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-control-bg': '#eee8de',
    '--button-control-bg-hover': '#e8dfd2',
    '--button-control-fg': '#4e4941',
    '--button-control-hover-fg': '#3d3933',
    '--button-control-border': 'rgba(79, 70, 58, 0.09)',
    '--button-control-active-bg': '#ebe1d3',
    '--button-control-active-fg': '#55483a',
    '--button-control-active-border': 'rgba(121, 93, 64, 0.16)',
    '--button-control-shadow': 'var(--tp-shadow-control)',
    '--button-control-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-control-dot-active-bg': '#967b5f',
    '--button-control-accent-fg': '#6f5842',
    '--button-focus-ring': '#8b6c4c',
  },
  '[data-theme="warm-slate"]': {
    '--button-primary-bg': '#e3eaec',
    '--button-primary-bg-hover': '#dae4e7',
    '--button-primary-fg': '#304e5a',
    '--button-primary-border': 'rgba(73, 111, 128, 0.18)',
    '--button-primary-marker': '#668493',
    '--button-primary-shadow': 'inset 3px 0 0 var(--button-primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
    '--button-secondary-bg': '#eaedef',
    '--button-secondary-bg-hover': '#e3e8ea',
    '--button-secondary-fg': '#35424b',
    '--button-secondary-border': 'rgba(55, 68, 78, 0.09)',
    '--button-secondary-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    '--button-control-bg': '#eaedef',
    '--button-control-bg-hover': '#e3e8ea',
    '--button-control-fg': '#35424b',
    '--button-control-hover-fg': '#29333b',
    '--button-control-border': 'rgba(55, 68, 78, 0.09)',
    '--button-control-active-bg': '#e3eaec',
    '--button-control-active-fg': '#304e5a',
    '--button-control-active-border': 'rgba(73, 111, 128, 0.18)',
    '--button-control-shadow': 'var(--tp-shadow-control)',
    '--button-control-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    '--button-control-dot-active-bg': '#668493',
    '--button-control-accent-fg': '#486a79',
    '--button-focus-ring': '#50798c',
  },
}

const requiredFocusConsumers = [
  '.primary-button',
  '.secondary-button',
  '.icon-button',
  '.small-button',
  '.detail-tab',
  '.filter-option',
  '.entity-filter',
  '.theme-choice',
  '.nav-menu-text-trigger',
  '.nav-notification-link',
  '.nav-user-article-link',
  '.account-avatar-link',
]

const focusConsumersFor = (selector) => {
  const match = selector.match(/^:where\(([\s\S]*)\)\s*:focus-visible$/)
  return match ? match[1].split(',').map((consumer) => consumer.trim()).filter(Boolean) : null
}

const hasExactConsumerSet = (consumers) => consumers.length === requiredFocusConsumers.length
  && new Set(consumers).size === requiredFocusConsumers.length
  && requiredFocusConsumers.every((consumer) => consumers.includes(consumer))

const requiredCatalogFocusConsumers = [
  '.catalog-category-chip',
  '.catalog-density-chip',
  '.catalog-dock-button',
  '.catalog-dock-icon-button',
  '.catalog-dock-page-button',
]

const catalogFocusConsumersFor = (selector) => {
  const match = selector.match(/^:is\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+:is\(([\s\S]*)\):focus-visible$/)
  return match ? match[1].split(',').map((consumer) => consumer.trim()).filter(Boolean) : null
}

const hasExactCatalogConsumerSet = (consumers) => consumers.length === requiredCatalogFocusConsumers.length
  && new Set(consumers).size === requiredCatalogFocusConsumers.length
  && requiredCatalogFocusConsumers.every((consumer) => consumers.includes(consumer))

const rgbForHex = (value) => {
  const match = value.match(/^#([0-9a-f]{6})$/i)
  return match ? [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)) : null
}

const rgbForColor = (value, background) => {
  const hex = rgbForHex(value)
  if (hex) return hex

  const match = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/)
  const backgroundRgb = rgbForHex(background)
  if (!match || !backgroundRgb) return null

  const alpha = Number.parseFloat(match[4])
  return match.slice(1, 4).map((channel, index) => (
    Number.parseInt(channel, 10) * alpha + backgroundRgb[index] * (1 - alpha)
  ))
}

const relativeLuminance = (rgb) => {
  const channels = rgb.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const contrastRatio = (foreground, background) => {
  const foregroundRgb = rgbForColor(foreground, background)
  const backgroundRgb = rgbForHex(background)
  if (!foregroundRgb || !backgroundRgb) return 0
  const foregroundLuminance = relativeLuminance(foregroundRgb)
  const backgroundLuminance = relativeLuminance(backgroundRgb)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

const focusReferenceSurfaces = {
  '[data-theme="morning-paper"]': {
    page: '#f3ead8',
    control: '#eee8de',
    primary: '#e9dfd1',
  },
  '[data-theme="warm-slate"]': {
    page: '#eef1f4',
    control: '#eaedef',
    primary: '#e3eaec',
  },
}

violations.push(...runParserSelfTests())

const rules = topLevelRules(css)
const rootBlock = blockFor(css, ':root')
requireDeclarations(':root', declarationsFor(rootBlock), {
  '--button-primary-marker': '#d6b15a',
  '--button-focus-ring': 'rgba(240, 207, 116, 0.58)',
})

const ownedFocusRules = rules.filter((rule) => {
  const consumers = focusConsumersFor(rule.selector)
  return consumers !== null && hasExactConsumerSet(consumers)
})

if (ownedFocusRules.length !== 1) {
  violations.push(`${path}: expected exactly one shared :where(...):focus-visible rule owning the required button consumer set; found ${ownedFocusRules.length}`)
} else if (ownedFocusRules[0].block === null) {
  violations.push(`${path}: unterminated shared :where(...):focus-visible rule`)
} else {
  requireDeclarations('shared :where(...):focus-visible rule', declarationsFor(ownedFocusRules[0].block), {
    outline: '3px solid var(--button-focus-ring)',
    'outline-offset': '2px',
  })
}

for (const [selector, expectedDeclarations] of Object.entries(expected)) {
  const block = blockFor(css, selector)
  const declarations = declarationsFor(block)

  requireDeclarations(selector, declarations, expectedDeclarations)

  for (const property of ['--button-primary-bg', '--button-primary-bg-hover', '--button-control-active-bg']) {
    if (effectiveValueFor(declarations, property).includes('gradient(')) {
      violations.push(`${path}: ${selector} ${property} must be a flat surface; found gradient`)
    }
  }

  for (const property of ['--button-primary-shadow', '--button-secondary-shadow', '--button-control-shadow', '--button-control-active-shadow']) {
    const actualValue = effectiveValueFor(declarations, property)
    if (hasLargeExternalShadow(actualValue)) {
      violations.push(`${path}: ${selector} ${property} must not add a large external shadow; found ${actualValue}`)
    }
  }

  const focusRing = effectiveValueFor(declarations, '--button-focus-ring')
  for (const [surfaceName, surface] of Object.entries(focusReferenceSurfaces[selector])) {
    const ratio = contrastRatio(focusRing, surface)
    if (ratio < 3) {
      violations.push(`${path}: ${selector} --button-focus-ring contrast against ${surfaceName} ${surface} must be at least 3:1; found ${ratio.toFixed(2)}:1`)
    }
  }
}

const catalogRules = topLevelRules(catalogCss)
const ownedCatalogFocusRules = catalogRules.filter((rule) => {
  const consumers = catalogFocusConsumersFor(rule.selector)
  return consumers !== null && hasExactCatalogConsumerSet(consumers)
})

if (ownedCatalogFocusRules.length !== 1) {
  violations.push(`${catalogPath}: expected exactly one light-theme focus rule owning the required catalog consumer set; found ${ownedCatalogFocusRules.length}`)
} else if (ownedCatalogFocusRules[0].block === null) {
  violations.push(`${catalogPath}: unterminated light-theme catalog focus rule`)
} else {
  const ownedCatalogFocusRule = ownedCatalogFocusRules[0]
  requireDeclarations('light-theme catalog focus rule', declarationsFor(ownedCatalogFocusRule.block), {
    outline: '3px solid var(--button-focus-ring)',
    'outline-offset': '2px',
  }, violations, catalogPath)

  for (const consumer of requiredCatalogFocusConsumers) {
    const resetRules = catalogRules.filter((rule) => {
      if (rule.block === null || effectiveValueFor(declarationsFor(rule.block), 'outline') !== 'none') return false
      return rule.selector.split(',').some((selector) => selector.trim() === `${consumer}:focus-visible`)
    })
    if (resetRules.length === 0) {
      violations.push(`${catalogPath}: missing existing outline reset ownership for ${consumer}:focus-visible`)
    } else if (resetRules.some((rule) => rule.start >= ownedCatalogFocusRule.start)) {
      violations.push(`${catalogPath}: light-theme catalog focus rule must follow every outline reset for ${consumer}`)
    }
  }

  const lightSurfaceRules = catalogRules.filter((rule) => (
    rule.selector.includes('[data-theme="morning-paper"]')
    && rule.selector.includes('[data-theme="warm-slate"]')
    && requiredCatalogFocusConsumers.every((consumer) => rule.selector.includes(consumer))
    && rule.block !== null
    && effectiveValueFor(declarationsFor(rule.block), 'background') !== ''
  ))
  if (lightSurfaceRules.length === 0 || lightSurfaceRules.some((rule) => rule.start >= ownedCatalogFocusRule.start)) {
    violations.push(`${catalogPath}: light-theme catalog focus rule must follow the shared light catalog control surface rule`)
  }
}

const tokenRootBlock = blockFor(tokenCss, ':root', violations, tokenPath)
requireDeclarations(':root', declarationsFor(tokenRootBlock), {
  '--tp-shadow-control': 'inset 0 1px 0 rgba(244, 234, 208, 0.035)',
}, violations, tokenPath)

for (const selector of ['[data-theme="morning-paper"]', '[data-theme="warm-slate"]']) {
  const block = blockFor(tokenCss, selector, violations, tokenPath)
  requireDeclarations(selector, declarationsFor(block), {
    '--tp-shadow-control': 'none',
  }, violations, tokenPath)
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Light button token contract passed.')
