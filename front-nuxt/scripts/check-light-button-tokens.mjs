import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = 'assets/css/hifi-preview.css'
const css = readFileSync(join(root, path), 'utf8')
const violations = []

const blockFor = (selector) => {
  const marker = `${selector} {`
  let depth = 0
  let ruleStart = 0
  let quote = ''
  let inComment = false

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index]

    if (inComment) {
      if (character === '*' && css[index + 1] === '/') {
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

    if (character === '/' && css[index + 1] === '*') {
      inComment = true
      index += 1
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (depth === 0 && css.slice(ruleStart, index).trim() === '' && css.startsWith(marker, index)) {
      const openingIndex = index + marker.length - 1
      let blockDepth = 1
      let blockQuote = ''
      let blockComment = false

      for (let blockIndex = openingIndex + 1; blockIndex < css.length; blockIndex += 1) {
        const blockCharacter = css[blockIndex]

        if (blockComment) {
          if (blockCharacter === '*' && css[blockIndex + 1] === '/') {
            blockComment = false
            blockIndex += 1
          }
          continue
        }

        if (blockQuote) {
          if (blockCharacter === '\\') {
            blockIndex += 1
          } else if (blockCharacter === blockQuote) {
            blockQuote = ''
          }
          continue
        }

        if (blockCharacter === '/' && css[blockIndex + 1] === '*') {
          blockComment = true
          blockIndex += 1
        } else if (blockCharacter === '"' || blockCharacter === "'") {
          blockQuote = blockCharacter
        } else if (blockCharacter === '{') {
          blockDepth += 1
        } else if (blockCharacter === '}') {
          blockDepth -= 1
          if (blockDepth === 0) {
            return css.slice(openingIndex + 1, blockIndex)
          }
        }
      }

      violations.push(`${path}: unterminated exact top-level selector block ${selector}`)
      return ''
    }

    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) ruleStart = index + 1
    }
    if (character === ';' && depth === 0) ruleStart = index + 1
  }

  violations.push(`${path}: missing exact top-level selector block ${selector}`)
  return ''
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normalizeValue = (value) => value.trim().replace(/\s+/g, ' ')

const valueFor = (block, property) => {
  const pattern = new RegExp(`(?:^|;)\\s*${escapeRegex(property)}\\s*:\\s*([^;]+);`)
  const match = block.match(pattern)
  return match ? normalizeValue(match[1]) : ''
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
    '--button-control-shadow': 'none',
    '--button-control-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-control-dot-active-bg': '#967b5f',
    '--button-control-accent-fg': '#6f5842',
    '--button-focus-ring': 'rgba(139, 108, 76, 0.28)',
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
    '--button-control-shadow': 'none',
    '--button-control-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    '--button-control-dot-active-bg': '#668493',
    '--button-control-accent-fg': '#486a79',
    '--button-focus-ring': 'rgba(80, 121, 140, 0.28)',
  },
}

for (const [selector, declarations] of Object.entries(expected)) {
  const block = blockFor(selector)

  for (const [property, expectedValue] of Object.entries(declarations)) {
    const actualValue = valueFor(block, property)
    if (actualValue !== expectedValue) {
      violations.push(`${path}: ${selector} ${property} expected ${expectedValue}; found ${actualValue || '<missing>'}`)
    }
  }

  for (const property of ['--button-primary-bg', '--button-primary-bg-hover', '--button-control-active-bg']) {
    if (valueFor(block, property).includes('gradient(')) {
      violations.push(`${path}: ${selector} ${property} must be a flat surface; found gradient`)
    }
  }

  for (const property of ['--button-primary-shadow', '--button-secondary-shadow', '--button-control-shadow', '--button-control-active-shadow']) {
    const actualValue = valueFor(block, property)
    if (hasLargeExternalShadow(actualValue)) {
      violations.push(`${path}: ${selector} ${property} must not add a large external shadow; found ${actualValue}`)
    }
  }
}

for (const marker of [
  '--button-primary-marker:',
  '--button-focus-ring:',
  'inset 3px 0 0 var(--button-primary-marker)',
  'outline: 3px solid var(--button-focus-ring);',
  'outline-offset: 2px;',
]) {
  if (!css.includes(marker)) {
    violations.push(`${path}: missing shared light-button marker ${marker}`)
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Light button token contract passed.')
