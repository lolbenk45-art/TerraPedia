import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(frontRoot, '..')
const durablePath = join(repoRoot, 'docs/audits/2026-07-21-light-theme-button-style-options.html')
const publicPath = join(frontRoot, 'public/button-style-options.html')
const violations = []

const readPrototype = (path) => {
  try {
    return readFileSync(path)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    violations.push(`cannot read ${relative(repoRoot, path)}: ${detail}`)
    return null
  }
}

const durable = readPrototype(durablePath)
const served = readPrototype(publicPath)

if (durable && served && !durable.equals(served)) {
  violations.push('button style option copies must be byte-identical')
}

if (durable) {
  const source = durable.toString('utf8')

  for (const marker of [
    'Mist Workbench',
    'Linen Paper',
    'data-theme-preview="warm-slate"',
    'data-theme-preview="morning-paper"',
    'data-state="default"',
    'data-state="hover"',
    'data-state="selected"',
    'data-state="focus"',
    'data-state="disabled"',
    '--primary-marker',
    'min-height: 44px',
    '@media (prefers-reduced-motion: reduce)',
  ]) {
    if (!source.includes(marker)) violations.push(`prototype missing ${marker}`)
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
    if (pattern.test(source)) violations.push(`prototype retains rejected treatment ${label}`)
  }

  const themeCardCount = (source.match(/class=["'][^"']*\btheme-card\b[^"']*["']/g) ?? []).length
  if (themeCardCount !== 2) {
    violations.push(`prototype must render exactly two approved theme cards; found ${themeCardCount}`)
  }
}

if (violations.length > 0) {
  console.error(`Button style options contract failed:\n- ${violations.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Button style options contract passed.')
}
